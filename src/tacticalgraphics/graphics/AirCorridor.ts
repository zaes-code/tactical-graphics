import geometryService from '../core/GeometryService';
import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {MovementGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiPoint, Position, GeometryCollection} from 'geojson';
import * as turf from '../core/turf';

const sameSpot = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];

/**
 * The bearing a zero-length segment's rails are drawn square to: the nearest segment that has
 * a length, looking forward first, or due east when every point is on one spot.
 */
function railBearing(coords: Position[], i: number): number {
    for (let j = i + 1; j < coords.length - 1; j++) {
        if (!sameSpot(coords[j], coords[j + 1])) return turf.bearing(coords[j], coords[j + 1]);
    }
    for (let j = i - 1; j >= 0; j--) {
        if (!sameSpot(coords[j], coords[j + 1])) return turf.bearing(coords[j], coords[j + 1]);
    }
    return 90;
}

/**
 * Rails for a segment with no length, such as a vertex placed twice. `computeOuterTangents` has
 * no direction to work from and returns nothing, which left `undefined` where a rail should be.
 * These are the two tangent points themselves, so the handle layout (two per segment) holds.
 */
function zeroLengthRails(center: Position, radius: number, bearing: number): Position[][] {
    const side = (turn: number) => turf.destination(center, radius, bearing + turn, {units: 'meters'}).geometry.coordinates;
    const top = side(90);
    const bottom = side(-90);
    return [[top, top], [bottom, bottom]];
}

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

    /**
     * `[...vertices, ...tangentPoints]`.
     *
     * The vertices come first so a consumer that only wants the drawn path can
     * take the first `base.coordinates.length` points and ignore the rest. The
     * tangent points are where the corridor rails meet each circle — dragging
     * one of those is how the user changes the corridor width, so they are
     * emitted at the same radius the rails are drawn at.
     */
    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const baseCoords = base.geometry.coordinates;
        const tangentPoints = this.getMovementGeometry(baseCoords, opts?.radius || 20).flat();
        return this.asMultiPointFeature([...baseCoords, ...tangentPoints]);
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

            const [tangent1, tangent2] = sameSpot(center1, center2)
                ? zeroLengthRails(center1, radius, railBearing(baseCoords, i))
                : geometryService.computeOuterTangents(center1, center2, radius);

            segments.push(tangent1); // top
            segments.push(tangent2); // bottom
        }

        return segments;
    };

}
