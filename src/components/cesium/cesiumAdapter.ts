import * as Cesium from 'cesium';
import {GraphicOptions, PositionType, TacticalGraphicName} from '@zaes/tactical-graphics';
import {Position} from "geojson";
import {GraphicHandler} from "./types";
import {MovementGraphic} from "./handlers/MovementGraphic";

export type CesiumPositionType = Cesium.Cartesian3 | Cesium.Cartesian3[] | Cesium.Cartesian3[][];

class CesiumAdapter {
    getGraphicHandler = (graphicName: TacticalGraphicName, opts: GraphicOptions): GraphicHandler => {
        switch (graphicName) {
            case TacticalGraphicName.AirCorridor:
            case TacticalGraphicName.SupportingAxisOfAdvance:
            case TacticalGraphicName.MainAxisOfAdvance:
            case TacticalGraphicName.AviationAxisOfAdvance:
            case TacticalGraphicName.AttackHelicopterAxisOfAdvance:
            default:
                return new MovementGraphic(graphicName, {
                    radius: opts.radius || 100000
                });
        }
    }

    toGeoJson(baseCoordinates: Cesium.Cartesian3 | Cesium.Cartesian3[] | Cesium.Cartesian3[][]): PositionType {
        if (!baseCoordinates) return [];

        // Single Cartesian3
        if (baseCoordinates instanceof Cesium.Cartesian3) {
            const carto = Cesium.Cartographic.fromCartesian(baseCoordinates);
            return [Cesium.Math.toDegrees(carto.longitude), Cesium.Math.toDegrees(carto.latitude)];
        }

        // Array of Cartesian3
        if (Array.isArray(baseCoordinates) && baseCoordinates[0] instanceof Cesium.Cartesian3) {
            return (baseCoordinates as Cesium.Cartesian3[]).map(c => this.toGeoJson(c) as Position);
        }

        // Array of array of Cartesian3
        if (Array.isArray(baseCoordinates) && Array.isArray(baseCoordinates[0]) && baseCoordinates[0][0] instanceof Cesium.Cartesian3) {
            return (baseCoordinates as Cesium.Cartesian3[][]).map(line => line.map(c => this.toGeoJson(c) as Position));
        }

        return [];
    }

    fromGeoJson(pos: PositionType): Cesium.Cartesian3 | Cesium.Cartesian3[] | Cesium.Cartesian3[][] {
        if (!pos) return [];

        // Single coordinate
        if (typeof pos[0] === 'number') {
            const [lon, lat] = pos as Position;
            return Cesium.Cartesian3.fromDegrees(lon, lat);
        }

        // Array of coordinates
        if (Array.isArray(pos[0]) && typeof (pos[0] as any)[0] === 'number') {
            return (pos as Position[]).map(p => this.fromGeoJson(p) as Cesium.Cartesian3);
        }

        // Array of array of coordinates (polygons / multi-lines)
        if (Array.isArray(pos[0]) && Array.isArray((pos[0] as any)[0])) {
            return (pos as Position[][]).map(line => line.map(p => this.fromGeoJson(p) as Cesium.Cartesian3));
        }

        return [];
    }

    normalizeLngLat(coords: PositionType): PositionType {
        if (!coords) return coords;

        if (typeof coords[0] === 'number') {
            let [lon, lat] = coords as Position;
            // Wrap longitude into [-180, 180]
            lon = ((lon + 540) % 360) - 180; // normalize
            return [lon, lat];
        }

        if (Array.isArray(coords[0])) {
            return (coords as Position[]).map(c => this.normalizeLngLat(c)) as PositionType;
        }

        return coords;
    }

    /**
     * Generate a tactical graphic from baseCoordinates in PositionType format
     * Handles single points, lines, polygons, and nested arrays
     */
    getTacticalGraphic(
        graphicName: TacticalGraphicName,
        baseCoordinates: CesiumPositionType,
        opts?: GraphicOptions
    ) {
        if (!baseCoordinates) return;

        // Convert baseCoordinates (PositionType) into Cesium Cartesian3
        const cesiumCoords = this.normalizeLngLat(this.toGeoJson(baseCoordinates));

        // For lines/polygons, require at least 2 points
        if (Array.isArray(cesiumCoords) && cesiumCoords.length < 2) return;
        return false;
        //
        // const tacticalGraphic = TacticalGraphicsRegistry
        //     .get(graphicName)
        //     ?.generate(cesiumCoords, opts);
        //
        // if (!tacticalGraphic) return;
        //
        // const {graphic, handles, labels} = tacticalGraphic;
        //
        // // Convert everything back to PositionType so your service can consume it or store it
        // return {
        //     graphic: this.fromGeoJson(this.normalizeLngLat(graphic)),
        //     handles: this.fromGeoJson(this.normalizeLngLat(handles)),
        //     labels: this.fromGeoJson(this.normalizeLngLat(labels))
        // };
    }
}

const cesiumAdapter = new CesiumAdapter();
export default cesiumAdapter;