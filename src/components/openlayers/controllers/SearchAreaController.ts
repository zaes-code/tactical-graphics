import {TacticalGraphic, TacticalGraphicHandler, TacticalGraphicShape} from "../openlayersAdapter";
import {Feature} from 'ol';
import {Geometry, Point} from 'ol/geom';
import {DrawEvent} from 'ol/interaction/Draw';
import {ObjectEvent} from 'ol/Object';
import {StyleFunction} from 'ol/style/Style';

export interface SearchAreaGraphic extends TacticalGraphic {
    base: Feature<Point>;
    size: number;
    rotation: number;

    getRotation(): number; // radians
    setRotation(rotation: number): void;

    getScale(): number;

    setScale(scale: number): void;
}

export class SearchAreaController implements TacticalGraphicHandler {

    type: TacticalGraphicShape = 'Point';
    geomHandleType: TacticalGraphicShape = 'Point';
    drawStyleFunc?: StyleFunction | undefined;
    onPointerMove?: Function | undefined;
    symbolId: string = '';
    graphic: SearchAreaGraphic;

    constructor(graphic: SearchAreaGraphic) {
        this.graphic = graphic;
    }

    getSymbolId(): string {
        return this.symbolId;
    }

    setBaseFeature(base: Feature<Point>): void {
        this.graphic.setBaseFeature(base);
    }

    setSymbolId(symbolId: string): void {
        this.symbolId = symbolId;
        this.graphic.setSymbolId(symbolId);
    }

    getCenter() {
        return this.graphic.base.getGeometry()!.getCoordinates();
    }

    getBaseGeometry(): number[] {
        return this.graphic.base.getGeometry()!.getCoordinates();
    }

    getFeatures(): Feature<Geometry>[] {
        return this.graphic.getFeatures();
    }


    // Add the features from the graphic into the target source.
    onDrawStartFunc = (e: DrawEvent) => {
    };

    onDrawEndFunc = (e: DrawEvent) => {
        const point = e.feature as Feature<Point>;
        this.graphic.setBaseFeature(point);
    };

    onResolutionChangeFunc(e: ObjectEvent): void {
    }

    handleTranslate(deltaX: number, deltaY: number): void {
        let base = this.graphic.base;
        let geom = base.getGeometry();
        if (!geom) return;

        let center = geom.getCoordinates();
        let newCenter = [center[0] + deltaX, center[1] + deltaY];
        geom.setCoordinates(newCenter);
        this.graphic.setBaseFeature(base);
    }

    handleRotate(deltaAngle: number): void {
        let newRotation = this.graphic.getRotation() + deltaAngle;
        this.graphic.setRotation(newRotation);
    }

    handleResize(deltaSize: number): void {
        const newScale = this.graphic.getScale() * deltaSize;
        this.graphic.setScale(newScale);
    }

}
