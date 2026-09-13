import {Feature, LineString, Point, Polygon, Position} from 'geojson';
import {Coordinate} from '../type';
import * as turf from '../turf';

const EARTH_RADIUS_METERS = 6378137;

/**
 * Smallest cos(half-angle) the miter offset will divide by. 0.25 lets a corner grow to
 * four times the offset distance, which covers every reasonable traced corner, and stops
 * a near-reflex one from launching its vertex off the map. @see offsetRingOutward
 */
const MITER_COS_FLOOR = 0.25;

/**
 * Rotate a feature around a given center
 */
export function rotate<T extends Point | LineString | Polygon>(
    feature: Feature<T>,
    angle: number,
    center?: Position
): Feature<T> {
    return turf.transformRotate(feature, angle, {pivot: center});
}

/**
 * Translate a feature by given x/y delta (in meters)
 */
export function translate<T extends Point | LineString | Polygon>(
    feature: Feature<T>,
    distance: number,
    bearing: number,
): Feature<T> {
    return turf.transformTranslate(feature, distance, bearing);
}

/**
 * Scale a feature relative to a center point
 */
export function scale<T extends Point | LineString | Polygon>(
    feature: Feature<T>,
    factor: number,
    center?: Position
): Feature<T> {
    return turf.transformScale(feature, factor, {origin: center});
}

/**
 * Get the geometric center of a feature (used for rotations/scaling)
 */
export function getCenter<T extends Point | LineString | Polygon>(feature: Feature<T>): Position {
    const geom = feature.geometry;

    switch (geom.type) {
        case 'Point':
            return geom.coordinates;

        case 'LineString': {
            // Use the first point
            return geom.coordinates[0];
        }

        case 'Polygon': {
            // Use centroid for geometric balance (not bbox center)
            const centroid = turf.centroid(turf.polygon(geom.coordinates));
            return centroid.geometry.coordinates;
        }

        default:
            throw new Error(`Unsupported geometry type: ${geom}`);
    }
}

export const createCircle = (center: number[], radius: number): number[][][] => {
    var options = {steps: 60, units: "meters", properties: {foo: "bar"}};
    return turf.circle(center, radius, <any>options).geometry.coordinates;
}

export const toRadians = (deg: number) => (deg * Math.PI) / 180;

export function calculateLineAngle(start: number[], end: number[]) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    return Math.atan2(dy, dx);
}

export const translateCoordinates = (coordinate: Coordinate, scale: number, rotation: number) => {
    // Convert planar rotation → geodesic bearing
    let bearingDeg = 90 - (rotation * 180) / Math.PI;
    if (bearingDeg < 0) bearingDeg += 360;

    // Convert meters → kilometers for Turf
    const distanceKm = scale / 1000;

    // Compute destination using Turf
    const destination = turf.destination(coordinate, distanceKm, bearingDeg, {
        units: "kilometers",
    });

    return destination.geometry.coordinates;
};

export function getPerpendicularPoint(last: Position, secondLast: Position, offsetMeters: number): Position {
    const bearing = turf.bearing(turf.point(secondLast), turf.point(last));
    const perpBearing = bearing + 90; // or -90 for opposite side
    return turf.destination(turf.point(last), offsetMeters, perpBearing, {units: 'meters'}).geometry.coordinates as Position;
}

export function unitVector(from: Coordinate, to: Coordinate): Position {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy);
    return [dx / len, dy / len];
}

export function getCurveTangentAtEnd(
    curve: Position[],
    epsilon: number = 1
): Position {
    const n = curve.length;

    if (n < 2) {
        return [1, 0];
    }

    const p2 = curve[n - 1];
    const p1 = curve[Math.max(0, n - 1 - epsilon)];

    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];

    const len = Math.hypot(dx, dy);
    if (len === 0) {
        return [1, 0];
    }

    return [dx / len, dy / len];
}

export function getExtendedPoint(last: Position, secondLast: Position, lengthMeters: number): Position {
    // Compute bearing from secondLast → last
    const bearing = turf.bearing(turf.point(secondLast), turf.point(last));

    // Extend last point along that bearing by length * 1.5 meters
    const extended = turf.destination(turf.point(last), lengthMeters * 1.5, bearing, {units: 'meters'});

    return extended.geometry.coordinates as Position;
}

/**
 * The line with `distanceMeters` taken off its far end.
 *
 * Intermediate vertices survive; the new end point is interpolated along
 * whichever segment the cut lands in, so a multi-segment line keeps its
 * shape. The measurement is geodesic, matching `getExtendedPoint` — build a
 * body on `trimLineEnd(coords, radius * 1.5)` and its arrowhead lands
 * exactly on the untrimmed last vertex at any latitude.
 *
 * Never eats more than half the line and never returns fewer than two
 * positions, so a graphic stays drawable while the user is still dragging it
 * out: the trim eases in from nothing instead of snapping once the line
 * clears the arrowhead's length.
 */
export function trimLineEnd(coords: Position[], distanceMeters: number): Position[] {
    if (coords.length < 2 || distanceMeters <= 0) return coords;

    const line = turf.lineString(coords);
    const total = turf.length(line, {units: 'meters'});
    if (total <= 0) return coords;

    const trim = Math.min(distanceMeters, total / 2);
    const sliced = turf.lineSliceAlong(line, 0, total - trim, {units: 'meters'});
    const trimmed = sliced.geometry.coordinates as Position[];
    return trimmed.length >= 2 ? trimmed : coords;
}

export function getMidpoint(coord1: Coordinate, coord2: Coordinate): Coordinate {
    const midX = (coord1[0] + coord2[0]) / 2;
    const midY = (coord1[1] + coord2[1]) / 2;
    return [midX, midY];
}

/**
 * Returns two EPSG:4326 positions that are `radius` meters apart, centered at
 * fraction `t` along segment P0→P1.  Pass these as [c0, c1] to generateLabels
 * so that graphicProportionalLabel (OL StyleFunction) derives font scale from
 * `radius` screen pixels — the same approach as FrontalAttack / TurningMovement.
 */
export function labelCoordsAtFraction(P0: Position, P1: Position, t: number, radius: number): Position[] {
    const segLen = turf.distance(P0, P1, { units: 'meters' });
    const tHalf = segLen > 0 ? (radius / 2) / segLen : 0;
    return [
        [P0[0] + (t - tHalf) * (P1[0] - P0[0]), P0[1] + (t - tHalf) * (P1[1] - P0[1])],
        [P0[0] + (t + tHalf) * (P1[0] - P0[0]), P0[1] + (t + tHalf) * (P1[1] - P0[1])],
    ];
}

export function project([lon, lat]: Position): number[] {
    const x = EARTH_RADIUS_METERS * lon * Math.PI / 180;
    const y = EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 360)));
    return [x, y];
}

export function unproject([x, y]: number[]): Position {
    const lon = (x / EARTH_RADIUS_METERS) * 180 / Math.PI;
    const lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS_METERS)) - Math.PI / 2) * 180 / Math.PI;
    return [lon, lat];
}

export function computeParallelLineString(coords: Coordinate[], offsetPixels: number): Position[] {
    const cleanedCoords = coords.filter((c, i, arr) => {
        if (i === 0) return true;
        // @ts-ignore
        const prev = arr[i - 1];
        return c[0] !== prev[0] || c[1] !== prev[1];
    });
    const line: Feature<LineString> = turf.lineString(cleanedCoords);

    // Use Turf's lineOffset to compute the parallel line
    const offsetLine = turf.lineOffset(line, offsetPixels, {units: 'meters'});

    return offsetLine.geometry.coordinates as Position[];
}

export function reflectAcrossYAxis<T extends turf.AllGeoJSON>(geojson: T, pivotLon: number): T {
    const mirrored = turf.clone(geojson);

    turf.coordEach(mirrored, (coord) => {
        const [lon, lat] = coord;
        coord[0] = pivotLon - (lon - pivotLon); // mirror longitude
        coord[1] = lat;                         // latitude unchanged
    });

    return mirrored;
}

export function getPolygonCenter(polygonGeoJSON: Feature<Polygon>): Feature<Point> {
    // 1. Calculate the geometric centroid (aesthetically preferred center of mass).
    const centroid = turf.centroid(polygonGeoJSON);

    // 2. Check if the Centroid is inside. If so, return it immediately.
    if (turf.booleanPointInPolygon(centroid, polygonGeoJSON)) {
        // Centroid is generally the best aesthetic choice if available.
        return centroid;
    }

    // 3. Fallback to Pole of Inaccessibility (PoI).
    // PoI is guaranteed to be inside and attempts to maximize the distance
    // to the nearest boundary, which is ideal for text placement clearance.
    // In highly concave shapes, this point may still be in a "neck," but it is
    // the mathematically optimal point for clearance.
    const poI = turf.pointOnFeature(polygonGeoJSON);

    return poI;

}

/**
 * Compute outer tangent lines between two circles on the Earth's surface.
 * Inputs/outputs are lon/lat coordinates (degrees).
 * All internal math is done in meters, using Turf.js geodesic functions.
 */
export function computeOuterTangents(
    center1: Position,
    center2: Position,
    radiusMeters: number
): Position[][] {
    // --- Input validation ---
    const c1 = Array.isArray(center1[0]) ? (center1[0] as Position) : center1;
    const c2 = Array.isArray(center2[0]) ? (center2[0] as Position) : center2;

    if (
        !Array.isArray(c1) ||
        !Array.isArray(c2) ||
        c1.length < 2 ||
        c2.length < 2 ||
        c1.some(isNaN) ||
        c2.some(isNaN)
    ) {
        console.warn('Invalid center coordinates:', {c1, c2});
        return [];
    }

    if (radiusMeters <= 0) {
        console.warn('Invalid radius:', radiusMeters);
        return [];
    }

    const dist = turf.distance(c1, c2, {units: 'meters'});
    if (!isFinite(dist) || dist === 0) return [];

    // --- Bearing & angle calculations ---
    const theta = turf.bearing(c1, c2);
    const angleOffset = Math.asin(Math.min(1, radiusMeters)) * (180 / Math.PI);

    // Bearings for tangent points
    const bearing1a = theta + angleOffset;
    const bearing1b = theta - angleOffset;
    const reverseBearing = turf.bearing(c2, c1);
    const bearing2a = reverseBearing - angleOffset;
    const bearing2b = reverseBearing + angleOffset;

    // --- Tangent points (in lon/lat) ---
    const p1a = turf.destination(c1, radiusMeters, bearing1a, {units: 'meters'}).geometry.coordinates;
    const p2a = turf.destination(c2, radiusMeters, bearing2a, {units: 'meters'}).geometry.coordinates;

    const p1b = turf.destination(c1, radiusMeters, bearing1b, {units: 'meters'}).geometry.coordinates;
    const p2b = turf.destination(c2, radiusMeters, bearing2b, {units: 'meters'}).geometry.coordinates;

    if (
        !p1a || !p2a || !p1b || !p2b ||
        p1a.some(isNaN) || p2a.some(isNaN) ||
        p1b.some(isNaN) || p2b.some(isNaN)
    ) {
        console.warn('Invalid tangent coordinates computed');
        return [];
    }

    return [
        [p1a, p2a], // top tangent
        [p1b, p2b], // bottom tangent
    ];
}

/**
 * A closed ring pushed outward by a uniform distance, vertex for vertex.
 *
 * Used by the multiple-strike safe distance zone, where zone 2 is zone 1 held off by a
 * standoff the operator sets. APP-06 272101 requires "an equal number of points for
 * both polygons", so this is a **miter offset** — each vertex maps to exactly one
 * offset vertex — rather than a buffer, which would round the corners into an
 * arbitrary number of new points and break that correspondence.
 *
 * Each vertex moves along the bisector of its two edge normals, out by
 * `distance / cos(half the turn angle)`. That extra secant is what keeps the *edges*
 * a uniform `distance` apart; moving every vertex radially from the centroid instead
 * would scale the ring, and the gap would then be wide at the far end of an elongated
 * zone and narrow at the near end.
 *
 * **The miter is capped.** At a near-reflex corner the secant runs away — cos(θ/2)
 * approaches zero — and one vertex would fly off to infinity. Past the cap the corner
 * is simply pushed along the bisector by the capped length, which rounds it off
 * slightly rather than producing a spike.
 *
 * Winding is detected rather than assumed, so a ring traced clockwise and one traced
 * counter-clockwise both grow outward. A caller that passes an unclosed ring gets an
 * unclosed ring back.
 *
 * @param ring     closed or unclosed ring, in degrees
 * @param distance metres to offset by; zero or negative returns the ring unchanged
 */
export function offsetRingOutward(ring: Position[], distance: number): Position[] {
    const closed =
        ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
    const pts = closed ? ring.slice(0, -1) : ring.slice();
    if (pts.length < 3 || !(distance > 0)) return ring;

    // Shoelace on the raw degrees. Only the SIGN is wanted, and that survives the
    // longitude squeeze that would spoil an area computed this way.
    let twiceArea = 0;
    for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        twiceArea += x1 * y2 - x2 * y1;
    }
    // Counter-clockwise (positive area) puts the interior to the left of each edge, so
    // outward is the right-hand normal: bearing + 90. Clockwise flips it.
    const outwardSign = twiceArea > 0 ? 1 : -1;

    const km = distance / 1000;
    const out: Position[] = pts.map((cur, i) => {
        const prev = pts[(i - 1 + pts.length) % pts.length];
        const next = pts[(i + 1) % pts.length];

        const inBearing = turf.bearing(turf.point(prev), turf.point(cur));
        const outBearing = turf.bearing(turf.point(cur), turf.point(next));

        const inNormal = inBearing + 90 * outwardSign;
        const outNormal = outBearing + 90 * outwardSign;

        // Average the two normals as vectors, so the bisector is right even when the
        // pair straddles the 0/360 wrap that averaging the numbers would get wrong.
        const rad = (d: number) => (d * Math.PI) / 180;
        const bx = Math.cos(rad(inNormal)) + Math.cos(rad(outNormal));
        const by = Math.sin(rad(inNormal)) + Math.sin(rad(outNormal));
        if (bx === 0 && by === 0) return cur.slice(); // a spike doubling back on itself
        const bisector = (Math.atan2(by, bx) * 180) / Math.PI;

        // Half the TURN between the two normals; the miter length is distance/cos(half).
        //
        // A straight join turns by nothing and must offset by exactly `distance`:
        // cos(0) = 1. A square corner turns 90 and offsets by distance/cos(45) — the
        // familiar 1.414. Subtracting from 180 first, as this did, is right at 90 and
        // wrong everywhere else, and it agrees at 90 which is why a square-only test
        // waved it through: a straight join came out as cos(90) = 0 and was pushed to
        // the cap, so a many-vertex ring landed up to four times too far out and
        // unevenly, because the error grows as the corner gets shallower.
        const between = Math.abs(((outNormal - inNormal + 540) % 360) - 180);
        const half = rad(between / 2);
        const cos = Math.cos(half);
        const miter = cos > MITER_COS_FLOOR ? km / cos : km / MITER_COS_FLOOR;

        return turf.destination(turf.point(cur), miter, bisector, {units: 'kilometers'}).geometry.coordinates;
    });

    return closed ? [...out, out[0].slice()] : out;
}
