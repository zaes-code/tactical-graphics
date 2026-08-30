import {Feature} from 'ol';
import {Polygon} from 'ol/geom';
import {createBox, DrawEvent} from 'ol/interaction/Draw';
import openlayersAdapter, {TacticalGraphic, TacticalGraphicHandler, TacticalGraphicShape} from "../openlayersAdapter";
import {ObjectEvent} from "ol/Object";
import {Coordinate} from "ol/coordinate";
import {GraphicLinkRegistry} from '../../../utils/graphicLinkRegistry';
import {rotationAnchor} from '@zaes/tactical-graphics';
import {fromLonLat, toLonLat} from 'ol/proj';


export interface PolygonGraphic extends TacticalGraphic {
    base: Feature<Polygon>;

    getCenter(): Coordinate;

    setSymbolId(symbolId: string): void;
}

export class PolygonGraphicController implements TacticalGraphicHandler {
    type: TacticalGraphicShape = "Polygon";
    geomHandleType: TacticalGraphicShape = 'Polygon';
    symbolId: string = '';
    graphic: PolygonGraphic;

    constructor(graphic: PolygonGraphic) {
        this.graphic = graphic;
        const features = this.graphic?.getFeatures?.();
        if (!Array.isArray(features)) return;

        for (const f of features) {
            GraphicLinkRegistry.register(f, this.graphic, this.symbolId);
        }
    }

    /**
     * The pivot a rotate turns about and a resize scales from.
     *
     * **`rotationAnchor`, not OpenLayers' `getInteriorPoint`.** The two are close — the
     * library's own doc calls it "a near-match" — but close is not the same, and this is
     * the number both engines have to agree on or the identical drag produces different
     * geometry. Measured on an irregular area: the two pivots sat 0.22 degrees apart on a
     * 20-degree shape, and one rotate moved the centroid 0.347 degrees on OpenLayers
     * against 0.131 on MapLibre.
     *
     * MapLibre has read the portable anchor since it was written; this is OpenLayers
     * joining it. @see ai/conventions.md, "A symbology fact never lives in a holder"
     *
     * Converted through lon/lat because that is the space the anchor rule is defined in —
     * Mercator's y is not linear in latitude, so an extent midpoint taken in projected
     * metres is a different point from one taken in degrees.
     */
    getCenter() {
        const ring = this.getBaseGeometry();
        const geographic = ring.map(part => part.map(position => toLonLat(position)));
        return fromLonLat(rotationAnchor({type: 'Polygon', coordinates: geographic}));
    }

    /**
     * Draws the area *while* it is being drawn, not only once it is finished.
     *
     * This was empty, so the 94 graphics in the area family showed OpenLayers' plain
     * sketch outline until the last click and only then became a symbol: no hatching, no
     * fill, no designation, no obstacle marks. The line family has rebuilt itself from
     * the sketch on every pointer move since the beginning — `LineGraphicController` does
     * exactly this — and there is no reason an area should be the one thing a user has
     * to commit to before they can see it.
     *
     * Guarded, because the generators are asked for shapes that are not yet shapes: a
     * ring of two points has no interior, and several throw rather than return nothing.
     * A failure leaves the previous preview standing, which is the right failure — the
     * next pointer move is a few milliseconds away.
     */
    onDrawStartFunc = (e: DrawEvent) => {
        const feature = e.feature as Feature<Polygon>;
        const geometry = feature.getGeometry();
        if (!geometry || geometry.getType() !== 'Polygon') return;

        geometry.on('change', () => {
            const ring = geometry.getCoordinates()?.[0];
            // Three distinct corners before there is an area to draw. OpenLayers' sketch
            // repeats the cursor vertex, hence four.
            if (!ring || ring.length < 4) return;
            try {
                this.graphic.setBaseFeature(feature);
            } catch {
                // Not a drawable ring yet.
            }
        });
    };

    onDrawEndFunc = (e: DrawEvent) => {
        const polygon = e.feature as Feature<Polygon>;
        this.graphic.setBaseFeature(polygon);
    };

    getBaseGeometry(): number[][][] {
        return this.graphic.base.getGeometry()!.getCoordinates();
    }

    getFeatures(): Feature[] {
        return this.graphic.getFeatures();
    }

    /**
     * The base polygon's extent diagonal, in projected meters.
     *
     * Any linear measure will do — a resize scales every vertex about the interior point,
     * so the diagonal scales with it. @see TacticalGraphicHandler.currentSize
     */
    currentSize(): number | undefined {
        const extent = this.graphic.base?.getGeometry()?.getExtent?.();
        if (!extent || !extent.every(Number.isFinite)) return undefined;
        const diagonal = Math.hypot(extent[2] - extent[0], extent[3] - extent[1]);
        return diagonal > 0 ? diagonal : undefined;
    }

    /**
     * Takes the width read-out down when the drag ends.
     *
     * **The manager calls this on every gesture end, and only `MissionTaskController`
     * implemented it.** `AreaGraphicBase` opts into `showMeasure` — that is how a
     * rectangular zone reports the width being dragged — but nothing ever disarmed it,
     * so `measuring` stayed true and the hashed line and its label stayed on the
     * rectangle for the rest of the session, in view mode and in the sample gallery.
     * Duck-typed on the holder, like the arming call, because only the area holders have
     * a read-out to clear.
     */
    endGesture(): void {
        (this.graphic as unknown as {showMeasure?: (active: boolean) => void}).showMeasure?.(false);
    }

    handleResize(deltaSize: number): void {
        let resized = openlayersAdapter.resizeFeature(this.graphic.base, deltaSize) as Feature<Polygon>;
        this.graphic.setBaseFeature(resized);
    }

    handleRotate(deltaAngle: number): void {
        let rotated = openlayersAdapter.rotateFeature(this.graphic.base, deltaAngle) as Feature<Polygon>;
        this.graphic.setBaseFeature(rotated);
    }

    handleTranslate(deltaX: number, deltaY: number): void {
        let translated = openlayersAdapter.translateFeature(this.graphic.base, deltaX, deltaY) as Feature<Polygon>;
        this.graphic.setBaseFeature(translated);
    }

    onResolutionChangeFunc(e: ObjectEvent): void {
    }

    getSymbolId(): string {
        return this.symbolId;
    }

    setSymbolId(symbolId: string): void {
        this.symbolId = symbolId;
        this.graphic.setSymbolId(symbolId);
        // Re-key the registry: the constructor registered under the empty string.
        GraphicLinkRegistry.registerAll(this.graphic.getFeatures(), this.graphic, symbolId);
    }

    setBaseFeature(base: Feature<Polygon>): void {
        this.graphic.setBaseFeature(base);
    }
}

export class RectangularAreaGraphicController extends PolygonGraphicController {
    type: TacticalGraphicShape = "Circle";
    geomHandleType: TacticalGraphicShape = 'Polygon';
    geometryFn = createBox();

    constructor(graphic: PolygonGraphic) {
        super(graphic);
        this.graphic.base.set('base', false);
    }
}