import Feature from 'ol/Feature';
import {Geometry, Point} from 'ol/geom';
import ms from 'milsymbol';
import {Icon, Style} from 'ol/style';
import {DrawEvent} from 'ol/interaction/Draw';
import {ObjectEvent} from 'ol/Object';
import {TacticalGraphic, TacticalGraphicHandler, TacticalGraphicShape} from "../openlayersAdapter";
import {StyleFunction} from 'ol/style/Style';

export interface SecurityOperationGraphic extends TacticalGraphic {
    base: Feature<Point>;
    primaryLabel: string;

    getRotation(): number; // radians
    setRotation(rotation: number): void;

    getScale(): number;

    setScale(scale: number): void;

    updateCenterPadding(resolution: number): void;
}

export class SecurityOperationsController implements TacticalGraphicHandler {
    graphic: SecurityOperationGraphic;
    sidc: string = '130310001413010000000000000000';
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
    }

    getSymbolId(): string {
        return this.symbolId;
    }

    setSymbolId(symbolId: string): void {
        this.symbolId = symbolId;
        this.graphic.setSymbolId(symbolId);
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
        this.graphic.setBaseFeature(baseFeature);
        geom.setCoordinates(newCenter);
        this.milSymbolFeature.setGeometry(new Point(newCenter));
    }

    handleRotate(deltaAngle: number): void {
        let newRotation = this.graphic.getRotation() + deltaAngle;
        this.graphic.setRotation(newRotation);
    }

    handleResize(deltaSize: number): void {
        const newScale = this.graphic.getScale() * deltaSize;
        this.graphic.setScale(newScale);
    }

    setMilSymStyle = () => {
        let _symbol = new ms.Symbol(this.sidc, {size: 50});
        const canvas = _symbol.asCanvas();
        const dataUrl = canvas.toDataURL();
        let milSymStyle = new Style({
            image: new Icon({
                src: dataUrl,
                scale: 0.5, // fixed screen size
                anchor: [0.5, 0.5],
                anchorXUnits: 'fraction',
                anchorYUnits: 'fraction',
            }),
        });
        this.milSymbolFeature.setStyle(milSymStyle);
    };

    // Add the features from the graphic into the target source.
    onDrawStartFunc = (e: DrawEvent) => {
    };

    onDrawEndFunc = (e: DrawEvent) => {
        const point = e.feature as Feature<Point>;

        this.graphic.setBaseFeature(point);

        this.setMilSymStyle();
        this.milSymbolFeature.setGeometry(new Point(point.getGeometry()!.getCoordinates()));
    };

    onResolutionChangeFunc = (event: ObjectEvent) => {
        const resolution = event.target.getResolution() || 1;
        this.graphic.updateCenterPadding(resolution);
    };

    setBaseFeature(base: Feature<Point>): void {
        this.graphic.setBaseFeature(base);
    }

}
