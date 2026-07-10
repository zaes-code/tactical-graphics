import geometryService from '../core/GeometryService';
import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {MovementGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiPoint, Position, GeometryCollection} from 'geojson';

export class AirCorridor extends TacticalGraphicsBase<MovementGraphicOptions> {
    name: string;
    type: string = "LineString";

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<GeometryCollection> {
        let baseCoords = base.geometry.coordinates;
        let corridors = (baseCoords).map(coord => {
            return this.createCircleGeometry(coord, opts?.radius || 20)
        });
        let pathCoordinates = this.getMovementGeometry(baseCoords, opts?.radius || 20);
        return this.asGeometryCollectionFeature(
            [
                this.asMultiLineStringFeature(pathCoordinates).geometry,
                ...corridors.map(corridor => this.asPolygonFeature(corridor).geometry)
            ]
        )
    }

    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates);
    }

    // generate corridors
    createCircleGeometry = (coord: Position, radius: number): Position[][] => {
        return geometryService.createCircle(coord, radius);
    };

    getMovementGeometry = (baseCoords: Position[], radius: number): Position[][] => {
        const segments: number[][][] = [];
        // generate tangent lines;
        for (let i = 0; i < baseCoords.length - 1; i++) {
            const center1 = baseCoords[i];
            const center2 = baseCoords[i + 1];

            const [tangent1, tangent2] = geometryService.computeOuterTangents(center1, center2, radius);

            segments.push(tangent1); // top
            segments.push(tangent2); // bottom
        }

        return segments;
    };

}
