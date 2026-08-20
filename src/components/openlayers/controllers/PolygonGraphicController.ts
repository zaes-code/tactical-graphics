import {Feature} from 'ol';
import {Polygon} from 'ol/geom';
import {createBox, DrawEvent} from 'ol/interaction/Draw';
import openlayersAdapter, {TacticalGraphic, TacticalGraphicHandler, TacticalGraphicShape} from "../openlayersAdapter";
import {ObjectEvent} from "ol/Object";
import {Coordinate} from "ol/coordinate";
import {GraphicLinkRegistry} from '../../../utils/graphicLinkRegistry';


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

    getCenter() {
        let polygon = new Polygon(this.getBaseGeometry());
        return polygon.getInteriorPoint().getCoordinates();
    }

    onDrawStartFunc = (e: DrawEvent) => {
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