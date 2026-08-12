import Feature from 'ol/Feature';
import {Geometry, Point} from 'ol/geom';
import {SecurityOperationSymbolProvider, securityOperationSymbolStyle} from '../securityOperationSymbol';
import {DrawEvent} from 'ol/interaction/Draw';
import {ObjectEvent} from 'ol/Object';
import {TacticalGraphic, TacticalGraphicHandler, TacticalGraphicShape} from "../openlayersAdapter";
import {StyleFunction} from 'ol/style/Style';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {GraphicLinkRegistry} from "../../../utils/graphicLinkRegistry";

export interface SecurityOperationGraphic extends TacticalGraphic {
    base: Feature<Point>;
    primaryLabel: string;
    /** Which of Cover / Guard / Screen this is — passed to the center-symbol provider. */
    name: TacticalGraphicName;

    getRotation(): number; // radians
    setRotation(rotation: number): void;

    getScale(): number;
    setScale(scale: number): void;

    updateResolution(resolution: number): void;
}

export class SecurityOperationsController implements TacticalGraphicHandler {
    graphic: SecurityOperationGraphic;
    milSymbolFeature: Feature<Point> = new Feature<Point>();
    geomHandleType: TacticalGraphicShape = 'Point';
    type: TacticalGraphicShape = 'Point';
    drawStyleFunc?: StyleFunction | undefined;
    onPointerMove?: Function | undefined;
    symbolId: string = '';

    /**
     * @param graphic
     */
    constructor(graphic: SecurityOperationGraphic) {
        this.graphic = graphic;
        // Installed once, here, rather than rebuilt at `drawend` and again on every
        // restore. It is a StyleFunction, so it resolves the current affiliation each
        // time the feature is drawn — which is what makes changing the hostility
        // update the center glyph instead of leaving the one built at draw time.
        this.milSymbolFeature.setStyle(
            securityOperationSymbolStyle(graphic.name, this.sourceFeature, () => this.symbolProvider, () => this.symbolId),
        );
    }

    /**
     * This graphic's own center-symbol provider, overriding the global one.
     *
     * Undefined means "use whatever the host registered globally", which is the
     * normal case. The override exists because the global provider is chosen once
     * for the whole application, and a map routinely wants a *different* unit
     * symbol on one Screen than on another — the global provider can only tell
     * them apart by what the graphic already carries (its name, its amplifiers),
     * which is not always enough.
     */
    private symbolProvider: SecurityOperationSymbolProvider | undefined;

    /**
     * Gives this graphic its own center symbol. Pass `undefined` to fall back to
     * the global provider.
     *
     * The style function reads it per render, so this takes effect on the next
     * draw; `changed()` bumps the revision so that draw actually happens.
     */
    setSymbolProvider(provider: SecurityOperationSymbolProvider | undefined): void {
        this.symbolProvider = provider;
        this.milSymbolFeature.changed();
    }

    /** This graphic's own provider, or `undefined` if it uses the global one. */
    getSymbolProvider(): SecurityOperationSymbolProvider | undefined {
        return this.symbolProvider;
    }

    /**
     * The feature carrying this graphic's amplifiers.
     *
     * `milSymbolFeature` is the controller's, not the holder's, so it is not in the
     * set `writeGraphicProperties` stamps and cannot answer for its own hostility.
     * Resolved per call rather than cached: `updateFeatures` replaces geometries on
     * the holder's features, and a stale reference here would read a stale
     * affiliation.
     */
    private sourceFeature = (): Feature | undefined =>
        this.graphic.getFeatures().find(f => f.get('role') === 'graphic');

    getSymbolId(): string {
        return this.symbolId;
    }

    setSymbolId(symbolId: string): void {
        this.symbolId = symbolId;
        this.graphic.setSymbolId(symbolId);
        // This controller never registered at all, so `getFromFeature` returned nothing
        // for a Cover / Guard / Screen graphic and the dialog could not reach its holder.
        GraphicLinkRegistry.registerAll(this.graphic.getFeatures(), this.graphic, symbolId);
    }

    getBaseGeometry(): number[] {
        return this.graphic.base.getGeometry()!.getCoordinates();
    }

    getCenter() {
        return this.graphic.base.getGeometry()!.getCoordinates();
    }

    getFeatures(): Feature<Geometry>[] {
        return [this.milSymbolFeature, ...this.graphic.getFeatures()];
    }

    handleTranslate(deltaX: number, deltaY: number): void {
        let baseFeature = this.graphic.base;
        let geom = baseFeature.getGeometry();
        if (!geom) return;

        let center = geom.getCoordinates();
        let newCenter = [center[0] + deltaX, center[1] + deltaY];
        // Move first, then regenerate. The other order regenerated the arrows and labels
        // around the *previous* center on every frame, so the graphic trailed the pointer
        // by one event for the whole drag — and stayed one event behind after it ended.
        geom.setCoordinates(newCenter);
        this.setBaseFeature(baseFeature);
    }

    handleRotate(deltaAngle: number): void {
        let newRotation = this.graphic.getRotation() + deltaAngle;
        this.graphic.setRotation(newRotation);
    }

    /**
     * Not resizable, for the same reason as `PointDropController`: a security
     * operation is a fixed-proportion symbol, not an area the user sizes to the
     * ground. Cover, Guard and Screen each render at one constant on-screen size
     * — every length in `SecurityOperationGraphicBase` is a screen-pixel constant
     * multiplied by the live map resolution, and `onResolutionChangeFunc` keeps
     * that resolution current, so the graphic already holds its pixel size across
     * a zoom. Resize was the one gesture that could break that, by making the
     * arms a different length from the doctrinal one at every zoom rather than
     * just the drawing one.
     *
     * `graphic.setScale` is deliberately left in place: a snapshot written before
     * this change carries `renderer.scale`, and restore still applies it so an
     * existing save comes back looking the way it was left.
     */
    handleResize(): void {
    }

    // Add the features from the graphic into the target source.
    onDrawStartFunc = (e: DrawEvent) => {
    };

    onDrawEndFunc = (e: DrawEvent) => {
        this.setBaseFeature(e.feature as Feature<Point>);
    };

    onResolutionChangeFunc = (event: ObjectEvent) => {
        const resolution = event.target.getResolution() || 1;
        this.graphic.updateResolution(resolution);
    };

    /**
     * The single place the base moves, so it is also the single place the center
     * symbol follows it.
     *
     * Positioning the icon used to be the caller's job, and only two of the three
     * callers did it: `onDrawEndFunc` and the restore path set the geometry,
     * `setBaseFeature` did not. Anything that placed a security operation without
     * drawing or restoring it — `drawProvenSamples`, and any consumer building one
     * programmatically — got the arms and labels with an empty center, which is
     * exactly what "Draw all samples" showed. Every path routes through here now,
     * `handleTranslate` included.
     */
    setBaseFeature(base: Feature<Point>): void {
        this.graphic.setBaseFeature(base);
        const coordinates = this.graphic.base.getGeometry()?.getCoordinates();
        if (coordinates) this.milSymbolFeature.setGeometry(new Point(coordinates));
    }

}
