import {Feature} from 'ol';

import {Coordinate} from 'ol/coordinate';
import LineString from 'ol/geom/LineString';
import {DrawEvent} from 'ol/interaction/Draw';
import openlayersAdapter, {TacticalGraphic, TacticalGraphicHandler, TacticalGraphicShape} from "../openlayersAdapter";
import {Geometry} from 'ol/geom';
import {ObjectEvent} from 'ol/Object';
import {StyleFunction} from 'ol/style/Style';
import {GraphicLinkRegistry} from '../../../utils/graphicLinkRegistry';

export interface LineGraphic extends TacticalGraphic {
    base: Feature<LineString>;

    setSymbolId(symbolId: string): void;

    setOffset?(offset: number): void;
}

/*
* Controller class for managing linestring-like graphics.
* maxPoints is used to control how many vertices are allowed to be drawn in openlayers.
* */
export class LineGraphicController implements TacticalGraphicHandler {
    graphic: LineGraphic;
    type: TacticalGraphicShape = 'LineString';
    geomHandleType: TacticalGraphicShape = 'LineString';
    drawStyleFunc?: StyleFunction | undefined;
    onPointerMove?: Function | undefined;
    symbolId: string = '';
    maxPoints: number | undefined;

    constructor(graphic: LineGraphic, maxPoints?: number) {
        this.graphic = graphic;
        this.maxPoints = maxPoints;

        // turn off modification because there should only be a fixed number of vertices.
        if (this.maxPoints) {
            this.graphic.base.set('base', false);
        }

        const features = this.graphic?.getFeatures?.();
        if (!Array.isArray(features)) return;

        features.forEach((feature) => {
            GraphicLinkRegistry.register(feature, this.graphic, this.symbolId);
        })
    }

    getCenter() {
        return this.graphic.base.getGeometry()!.getCoordinates()[0];
    }

    getBaseGeometry(): number[] | number[][] | number[][][] {
        return this.graphic.base.getGeometry()!.getCoordinates();
    }

    getFeatures(): Feature<Geometry>[] {
        return this.graphic.getFeatures();
    }

    onResolutionChangeFunc(_e: ObjectEvent): void {
    }

    handleRotate(deltaAngle: number): void {
        let rotated = openlayersAdapter.rotateFeature(this.graphic.base, deltaAngle) as Feature<LineString>;
        this.graphic.setBaseFeature(rotated);
    }

    handleTranslate(deltaX: number, deltaY: number): void {
        let translated = openlayersAdapter.translateFeature(this.graphic.base, deltaX, deltaY) as Feature<LineString>;
        this.graphic.setBaseFeature(translated);
    }

    handleResize(deltaSize: number): void {
        let resized = openlayersAdapter.resizeFeature(this.graphic.base, deltaSize) as Feature<LineString>;
        this.graphic.setBaseFeature(resized);
    }

    setOffset(offset: number): void {
        this.graphic.setOffset?.(offset);
    }

    areCoordsEqual(coord1: Coordinate, coord2: Coordinate): boolean {
        return coord1[0] === coord2[0] && coord1[1] === coord2[1];
    }

    onDrawStartFunc = (e: DrawEvent) => {
        let originalFeature = e.feature;

        let geometry = originalFeature.getGeometry();
        if (geometry === undefined || geometry.getType() !== 'LineString') return;

        geometry.on('change', () => {
            if (geometry === undefined || geometry.getType() !== 'LineString') return;
            let coords = (geometry as LineString).getCoordinates();
            if (coords.length < 2) return;

            // handle the case when a user just clicks without moving their mouse
            if (this.areCoordsEqual(coords[coords.length - 1], coords[coords.length - 2])) {
                coords.pop();
                (geometry as LineString).setCoordinates(coords);
            }
            this.graphic.setBaseFeature(originalFeature as Feature<LineString>);

        });
    };

    onDrawEndFunc = (_e: DrawEvent) => {
    };

    setBaseFeature(base: Feature<LineString>) {
        this.graphic.setBaseFeature(base);
    }

    getSymbolId(): string {
        return this.symbolId;
    }

    setSymbolId(symbolId: string): void {
        this.symbolId = symbolId;
        this.graphic.setSymbolId(symbolId);
    }
}
