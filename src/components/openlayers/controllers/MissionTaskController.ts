import {Fill, Stroke, Style} from 'ol/style';
import CircleStyle from 'ol/style/Circle';
import {Coordinate} from 'ol/coordinate';
import {Circle as CircleGeom, Geometry, Point} from 'ol/geom';
import Feature, {FeatureLike} from 'ol/Feature';
import {DrawEvent} from 'ol/interaction/Draw';
import {StyleFunction} from 'ol/style/Style';
import {TacticalGraphic, TacticalGraphicHandler, TacticalGraphicShape} from "../openlayersAdapter";
import {ObjectEvent} from 'ol/Object';
import {GraphicLinkRegistry} from "../../../utils/graphicLinkRegistry";

export interface MissionTaskGraphic extends TacticalGraphic {
    base: Feature<Point>;
    size: number;
    rotation: number;

    updateGeom({size, center, rotation}: { size?: number, center?: Coordinate, rotation?: number }): void;
}

export class MissionTaskController implements TacticalGraphicHandler {
    type: TacticalGraphicShape = 'Circle';
    geomHandleType: TacticalGraphicShape = 'Circle';
    symbolId: string = '';
    graphic: MissionTaskGraphic;
    private currentMouseCoord: Coordinate = [0, 0];
    private center: Coordinate = [0, 0];
    private rotationAngleDeg: number = 0;

    /**
     * @param graphic
     */
    constructor(graphic: MissionTaskGraphic) {
        this.graphic = graphic;
        const features = this.graphic?.getFeatures?.();
        if (!Array.isArray(features)) return;

        features.forEach((feature) => {
            GraphicLinkRegistry.register(feature, this.graphic, this.symbolId);
        })
    }

    getCenter() {
        return this.graphic.base.getGeometry()!.getCoordinates();
    }

    getFeatures(): Feature<Geometry>[] {
        return this.graphic.getFeatures();
    }

    getBaseGeometry() {
        return this.graphic.base.getGeometry()!.getCoordinates();
    }

    onResolutionChangeFunc(e: ObjectEvent): void {
    }

    drawStyleFunc: StyleFunction = (feature: FeatureLike, resolution: number): Style | undefined => {
        const geomType = feature.getGeometry()?.getType();
        if (geomType === 'Circle') {
            return new Style({}); // suppress actual circle rendering
        }
        if (geomType === 'Point') {
            return new Style({
                image: new CircleStyle({
                    radius: 6,
                    fill: new Fill({color: 'rgba(87, 140, 255, 1)'}),
                    stroke: new Stroke({color: 'white', width: 1.5}),
                }),
            });
        }
        return undefined;
    };

    onDrawStartFunc = (e: DrawEvent) => {
        const feature = e.feature;
        this.center = (feature.getGeometry() as CircleGeom).getCenter();

        feature.getGeometry()?.on('change', () => {
            const circleGeom = feature.getGeometry() as CircleGeom;
            const radius = circleGeom.getRadius();

            const dx = this.currentMouseCoord[0] - this.center[0];
            const dy = this.currentMouseCoord[1] - this.center[1];
            const rotationAngleRad = Math.atan2(dy, dx);
            this.rotationAngleDeg = (rotationAngleRad * 180) / Math.PI;

            this.graphic.updateGeom({size: radius, center: this.center, rotation: this.rotationAngleDeg});

        });
    };

    onDrawEndFunc = (e: DrawEvent) => {
        const circleGeom = e.feature.getGeometry() as CircleGeom;
        const radius = circleGeom.getRadius();

        this.graphic.updateGeom({size: radius, center: this.center, rotation: this.rotationAngleDeg});
    };

    onPointerMove = (evt: any) => {
        this.currentMouseCoord = evt.coordinate;
    };

    handleResize(deltaSize: number): void {
        const size = this.graphic.size * deltaSize;
        this.graphic.updateGeom({size});
    }

    handleRotate(deltaAngle: number): void {
        let rotation = this.graphic.rotation + deltaAngle;
        this.graphic.updateGeom({rotation});
    }

    handleTranslate(deltaX: number, deltaY: number): void {
        let baseCoord = this.graphic.base.getGeometry()!.getCoordinates();
        let center = [baseCoord[0] + deltaX, baseCoord[1] + deltaY];
        this.graphic.updateGeom({center});
    }

    getSymbolId(): string {
        return this.symbolId;
    }

    setSymbolId(symbolId: string): void {
        this.symbolId = symbolId;
        this.graphic.setSymbolId(symbolId);
    }

    setBaseFeature(base: Feature<Point>): void {
        this.graphic.setBaseFeature(base);
    }
}
