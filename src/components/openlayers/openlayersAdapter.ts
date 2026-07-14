import {Feature as OLFeature} from 'ol';
import {Feature as GeoJSONFeature, GeoJsonGeometryTypes, Point} from 'geojson';
import {DrawEvent, GeometryFunction,} from 'ol/interaction/Draw';
import {ObjectEvent} from 'ol/Object';
import {StyleFunction} from "ol/style/Style";
import GeoJSON from "ol/format/GeoJSON";
import {toLonLat} from "ol/proj";
import * as turf from "@turf/turf";
import {TacticalGraphicsRegistry} from '@zaes/tactical-graphics';
import {GraphicOptions, TacticalGraphicName} from '@zaes/tactical-graphics';
import Feature from "ol/Feature";
import {geometryService} from '@zaes/tactical-graphics';
import {getController} from "./controllerRegistry";

export type TacticalGraphicShape = GeoJsonGeometryTypes | 'Circle';

export interface TacticalGraphic {
    base: Feature;
    symbolId: string;

    getFeatures(): Feature[];

    setBaseFeature(base: Feature): void;

    setSymbolId(symbolId: string): void;
}

export interface TacticalGraphicHandler {
    type: TacticalGraphicShape; // defines how the tactical graphic is drawn in openlayers
    geomHandleType: TacticalGraphicShape; // used to define how the tactical graphic is modified (rotate/translate/resize)
    drawStyleFunc?: StyleFunction; // define some custom draw style when creating a tactical graphic
    onPointerMove?: Function; //
    updateGraphics?: Function;
    geometryFn?: GeometryFunction;
    graphic: TacticalGraphic;
    maxPoints?: number; // defines the max number of points to draw (for a linestring graphic)

    getBaseGeometry(): number[] | number[][] | number[][][];

    setBaseFeature(base: Feature): void;

    getCenter(): number[];

    getFeatures(): OLFeature[];

    onDrawStartFunc(e: DrawEvent): void;

    onDrawEndFunc(e: DrawEvent): void;

    onResolutionChangeFunc(e: ObjectEvent): void;

    getSymbolId(): string;

    setSymbolId(symbolId: string): void;

    handleTranslate(deltaX: number, deltaY: number): void;

    handleRotate(deltaAngle: number): void;

    handleResize(deltaSize: number): void;

    setOffset?(offset: number): void;
}

/**
 * Class used to generate tactical graphics and format it into openlayers features.
 * Provides the handlers used for rotating, translating, resizing and modifying tactical graphics
 * and graphic classes for applying openlayer styles for graphic labels.
 */
class OpenlayersAdapter {

    // Delegates to the declarative controllerRegistry — no switch needed here.
    getTacticalGraphicController = (graphicName: TacticalGraphicName, resolution: number): TacticalGraphicHandler =>
        getController(graphicName, resolution);


    // generate the tactical graphics from the tactical graphics library
    getTacticalGraphic(graphicName: TacticalGraphicName, base: OLFeature, opts?: GraphicOptions) {
        let tacticalGraphic = TacticalGraphicsRegistry
            .get(graphicName)
            ?.generate(this.olFeatureToTurf(base), opts);

        if (!tacticalGraphic) return;
        let {graphic, handles, labels} = tacticalGraphic;
        return {
            graphic: this.turfToOlFeature(graphic).getGeometry(),
            handles: this.turfToOlFeature(handles).getGeometry(),
            labels: this.turfToOlFeature(labels).getGeometry()
        }
    }

    // translate TurfJs feature into openlayers feature
    turfToOlFeature(turfFeature: GeoJSONFeature): OLFeature {
        const geojsonFormat = new GeoJSON();
        return <OLFeature>geojsonFormat.readFeature(turfFeature, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857',
        });
    }

    // transform openlayers feature into TurfJs feature
    olFeatureToTurf(feature: OLFeature, sourceProj = 'EPSG:3857'): GeoJSONFeature {
        const geojsonFormat = new GeoJSON();

        // Convert to GeoJSON and reproject to EPSG:4326 for Turf
        const turfFeature = geojsonFormat.writeFeatureObject(feature, {
            dataProjection: 'EPSG:4326',
            featureProjection: sourceProj,
        });

        return turfFeature as GeoJSONFeature;
    }

    coordinateToTurfPoint = (coord: number[]): GeoJSONFeature<Point> => {
        let coordinate = toLonLat(coord);
        return turf.point(coordinate);
    }

    getTurfDistance = (start: GeoJSONFeature<Point>, stop: GeoJSONFeature<Point>) => {
        return turf.distance(start, stop, {units: 'kilometers'});
    }

    getTurfBearing = (start: GeoJSONFeature<Point>, stop: GeoJSONFeature<Point>) => {
        return turf.bearing(start, stop);
    }

    resizeFeature(feat: Feature, deltaSize: number): Feature {
        let turfFeature = this.olFeatureToTurf(feat);
        let center = geometryService.getCenter(<any>turfFeature);
        let scaledBase = geometryService.scale(<any>turfFeature, deltaSize, center);
        return this.turfToOlFeature(scaledBase);
    }

    rotateFeature(feat: Feature, deltaAngle: number): Feature {
        let turfFeature = this.olFeatureToTurf(feat);
        let center = geometryService.getCenter(<any>turfFeature);
        let rotatedBase = geometryService.rotate(<any>turfFeature, -deltaAngle * (180 / Math.PI), center);
        return this.turfToOlFeature(rotatedBase);
    }

    translateFeature(feat: Feature, deltaX: number, deltaY: number): Feature {
        let turfFeature = this.olFeatureToTurf(feat);
        let rotatedBase = geometryService.translate(<any>turfFeature, deltaX, deltaY);
        return this.turfToOlFeature(rotatedBase);
    }
}

const openLayersTacticalGraphics = new OpenlayersAdapter();
export default openLayersTacticalGraphics;
