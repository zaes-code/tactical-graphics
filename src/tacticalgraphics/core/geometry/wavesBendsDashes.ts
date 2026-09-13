import {Feature, LineString, Position} from 'geojson';
import {Coordinate} from '../type';
import * as turf from '../turf';
import {getExtendedPoint, getMidpoint, project, unproject} from './primitives';

/**
 * Most dashes any one line may be broken into.
 *
 * A ceiling, not a target: 250 dashes across a line is already finer than a screen
 * can show, so anything past it is invisible detail that still costs a coordinate
 * pair each. @see lineStringToDashes
 */
const MAX_DASHES_PER_LINE = 250;

/**
 * Transforms a LineString into a wave of semicircles
 * @param {Object} lineString - Turf.js LineString feature or geometry
 * @param targetWavelength
 * @param amplitude
 * @param steps
 * @returns {Object} Turf.js LineString feature with semicircle wave
 */
export function lineStringToWave(lineString: Feature<LineString>, targetWavelength = 5, amplitude: number, steps: number, flipDirection = false) {

    // Extract coordinates from the lineString
    const coords = turf.getCoords(lineString);

    if (coords.length < 2) {
        throw new Error('LineString must have at least 2 points');
    }

    // Calculate total length of the line
    const totalLength = turf.length(lineString, {units: 'meters'});

    // Dynamically calculate number of waves based on line length
    // This keeps the wave shape consistent regardless of line length
    const numWaves = Math.max(1, Math.round(totalLength / targetWavelength));

    // Calculate actual wavelength (distance per semicircle)
    const wavelength = totalLength / numWaves;

    // Calculate amplitude if not provided (20% of wavelength)
    const amp = amplitude || wavelength * 0.2;

    // Generate wave coordinates
    const waveCoords = [];

    for (let i = 0; i <= numWaves; i++) {
        // Position along the original line (0 to 1)
        const t = i / numWaves;

        // Get point along the line at this position
        const pointAlong = turf.along(lineString, t * totalLength, {units: 'meters'});

        // Add the start point of each wave
        waveCoords.push(turf.getCoord(pointAlong));

        // Generate semicircle between this point and the next (except for last point)
        if (i < numWaves) {
            const nextT = (i + 1) / numWaves;
            const nextPoint = turf.along(lineString, nextT * totalLength, {units: 'meters'});

            // Get bearing between the two points
            const bearing = turf.bearing(pointAlong, nextPoint);

            // Create semicircle arc
            const arcCoords = createSemicircle(
                turf.getCoord(pointAlong),
                turf.getCoord(nextPoint),
                bearing,
                amp,
                steps,
                flipDirection
            );

            // Add arc points (skip first point as it's already added)
            waveCoords.push(...arcCoords.slice(1));
        }
    }
    return turf.lineString(waveCoords);

}

/**
 * Creates a semicircle arc between two points
 * @param {Array} start - Start coordinate [lon, lat]
 * @param {Array} end - End coordinate [lon, lat]
 * @param {number} bearing - Bearing from start to end
 * @param {number} amplitude - Height of the semicircle
 * @param {number} steps - Number of points in the arc
 * @returns {Array} Array of coordinates forming the semicircle
 */
export function createSemicircle(start: Position, end: Position, bearing: number, amplitude: number, steps: number, flipDirection = false) {
    const arcCoords = [start];

    // Calculate distance between start and end
    const distance = turf.distance(start, end, {units: 'meters'});

    // Perpendicular bearing: left (-90) or right (+90)
    const perpBearing = flipDirection ? bearing + 90 : bearing - 90;

    for (let i = 1; i < steps; i++) {
        // Parameter along the chord (0 to 1)
        const t = i / steps;

        // Point along the straight line from start to end
        const basePoint = turf.along(
            turf.lineString([start, end]),
            t * distance,
            {units: 'meters'}
        );

        // Calculate height offset using semicircle formula
        // y = sqrt(r^2 - x^2) where r = distance/2, x = distance from center
        const x = (t - 0.5) * distance; // Distance from center
        const radius = distance / 2;
        const circleHeight = Math.sqrt(Math.max(0, radius * radius - x * x));

        // Scale by amplitude factor
        const offset = (circleHeight / radius) * amplitude;

        // Move the base point perpendicular to the line
        const arcPoint = turf.destination(
            turf.getCoord(basePoint),
            offset,
            perpBearing,
            {units: 'meters'}
        );

        arcCoords.push(turf.getCoord(arcPoint));
    }

    arcCoords.push(end);

    return arcCoords;
}

/**
 * A quadratic Bezier along `chord` that passes **exactly through `apex`** at its
 * middle, sampled the same way {@link bendLine} samples its own.
 *
 * The difference between the two is where the bow's depth comes from. `bendLine`
 * measures it on the ground — a geodesic offset from the chord's midpoint — and then
 * interpolates the curve in degrees, so the point the curve actually reaches is the
 * degree-space average rather than the ground one. The gap between those two is
 * nothing on the equator and about 1% of the symbol at 75 degrees, which is where a
 * grip sitting on the apex ends up floating beside the line it is meant to be on.
 *
 * A caller that already knows the apex — because it is one of the symbol's own anchor
 * points — hands it over instead, and the curve is built to meet it. A Bezier's
 * midpoint is `(P0 + 2C + P2) / 4`, so the control point is `2 * apex` less the
 * chord's own midpoint.
 */
export function bendLineThroughApex(chord: Position[], apex: Position, segments: number = 32): Position[] {
    const [pStart, pEnd] = chord;
    if (!pStart || !pEnd) return chord;

    const cx = 2 * apex[0] - (pStart[0] + pEnd[0]) / 2;
    const cy = 2 * apex[1] - (pStart[1] + pEnd[1]) / 2;

    const line: Position[] = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        line.push([
            (1 - t) * (1 - t) * pStart[0] + 2 * (1 - t) * t * cx + t * t * pEnd[0],
            (1 - t) * (1 - t) * pStart[1] + 2 * (1 - t) * t * cy + t * t * pEnd[1],
        ]);
    }
    return line;
}

export function bendLine(
    lineCoords: Position[], // [pStart, pEnd]
    resolution: number,     // meters per unit (caller-defined)
    bendFactor: number = 40,
    segments: number = 32
): Position[] {
    const [pStart, pEnd] = lineCoords;

    // 1. Segment metrics (meters)
    const segment = turf.lineString([pStart, pEnd]);
    const segmentLength =
        turf.length(segment, {units: 'kilometers'}) * 1000;

    if (segmentLength === 0) {
        return [pStart, pEnd];
    }

    // 2. Visual bend size (same role as triangleWidth, gap, etc.)
    const bendDistanceMeters = resolution * bendFactor;

    // 3. Midpoint along the segment
    const midPoint = turf.along(
        segment,
        segmentLength / 2 / 1000,
        {units: 'kilometers'}
    );

    // 4. Perpendicular control point
    const baseBearing = turf.bearing(
        turf.point(pStart),
        turf.point(pEnd)
    );

    const control = turf.destination(
        midPoint,
        bendDistanceMeters / 1000,
        baseBearing + 90,
        {units: 'kilometers'}
    );

    const [cx, cy] = control.geometry.coordinates;
    const [x1, y1] = pStart;
    const [x2, y2] = pEnd;

    // 5. Quadratic Bézier sampling (geographic-safe)
    const line: Position[] = [];

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;

        const x =
            (1 - t) * (1 - t) * x1 +
            2 * (1 - t) * t * cx +
            t * t * x2;

        const y =
            (1 - t) * (1 - t) * y1 +
            2 * (1 - t) * t * cy +
            t * t * y2;

        line.push([x, y]);
    }

    return line;
}

/**
 * The exfiltrate / infiltrate S: a straight run, two 90-degree arcs, a straight run.
 *
 * APP-06 343700 and 343800 share one construction and three anchor points — *"point 1
 * defines the end of the straight line portion, point 2 defines the centre of the two
 * 90 degree circular arcs, point 3 defines the tip of the arrowhead"*.
 *
 * **Two 90-degree arcs make the two straights parallel**, and shift the path diagonally
 * by the same amount along and across: an arc of radius `r` turning a quarter turn
 * advances `r` along and `r` across, so the pair moves `2r` each way. That is what makes
 * this an S rather than a bump, and it means points 1 and 3 cannot both lie on the
 * symbol's own axis — the axis is tilted off the chord between them by exactly the angle
 * that produces the offset.
 *
 * Which leaves point 2 over-determined in the standard and under-determined in practice:
 * solving all four unknowns from the three points puts the axis along
 * `point 2 − midpoint(1, 3)`, which is a few metres long and violently unstable wherever
 * a user naturally drops point 2. So **point 2 is read as depth and side**: its
 * perpendicular offset from the chord sets the arcs' radius and which way the S kicks,
 * and its position along the chord sets where the S sits. (User's call, 2026-08-27.)
 *
 * @param steps points per quarter arc
 */
export function createSCurve(a: Position, b: Position, c: Position, steps = 12): Position[] {
    const A = project(a);
    const B = project(b);
    const C = project(c);

    const px = B[0] - A[0];
    const py = B[1] - A[1];
    const chord = Math.hypot(px, py);
    if (chord === 0) return [a, b];

    const ux = px / chord;
    const uy = py / chord;
    // Signed offset of point 2 from the chord: the depth, and the side.
    const offset = (C[0] - A[0]) * -uy + (C[1] - A[1]) * ux;
    const side = offset >= 0 ? 1 : -1;
    // The S consumes `2r` of the run, so it cannot take all of it.
    const radius = Math.min(Math.abs(offset), chord * 0.24);
    if (radius <= 0) return [a, b];

    // Tilt the axis off the chord by the angle whose sine puts `2r` across it.
    const phi = Math.asin(Math.min(1, (2 * radius) / chord)) * side;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    // Axis, and its left normal, in the projected frame.
    const wx = ux * cos + uy * sin;
    const wy = -ux * sin + uy * cos;
    const nx = -wy;
    const ny = wx;

    const along = chord * Math.cos(phi);
    const straight = Math.max(0, along - 2 * radius);
    // Where point 2 sits along the run decides how the two straights share it.
    const at = (C[0] - A[0]) * wx + (C[1] - A[1]) * wy;
    const lead = Math.min(straight, Math.max(0, at - radius));

    const out: number[][] = [A];
    const at2 = (d: number, l: number): number[] => [A[0] + wx * d + nx * l * side, A[1] + wy * d + ny * l * side];
    out.push(at2(lead, 0));

    // First quarter: centre a radius to the offset side of the straight's end.
    for (let i = 1; i <= steps; i++) {
        const t = (i / steps) * (Math.PI / 2);
        out.push(at2(lead + radius * Math.sin(t), radius * (1 - Math.cos(t))));
    }
    // Second quarter: the mirror, turning back onto the axis.
    for (let i = 1; i <= steps; i++) {
        const t = (i / steps) * (Math.PI / 2);
        out.push(at2(lead + radius + radius * (1 - Math.cos(t)), radius + radius * Math.sin(t)));
    }
    out.push(B);
    return out.map(p => unproject(p));
}

export function generateZigZag(
    centerlineCoords: Coordinate[],
    totalWidthPx: number,      // visual width (pixels)
    resolution: number,        // meters per pixel
    numTeeth: number = 4
): Coordinate[] {
    if (centerlineCoords.length < 2) return [];

    // Project centerline
    const projected = centerlineCoords.map(project);

    // Get midpoint + tangent in projected space
    const midInfo = getPointAndUnitVectorAt(projected, 0.5);
    const [mx, my] = midInfo.point;
    const [ux, uy] = midInfo.unitVec;

    // Perpendicular axis
    const px = -uy;
    const py = ux;

    // Scale dimensions to meters
    const totalWidth = totalWidthPx * resolution;
    const amplitude = totalWidth * 0.15;
    const halfWidth = totalWidth / 2;

    const zigZagPoints: Coordinate[] = [];
    const totalSteps = numTeeth * 2;

    for (let i = 0; i <= totalSteps; i++) {
        const t = i / totalSteps;
        const perpDist = -halfWidth + t * totalWidth;

        const alongOffset = (i % 2 === 0)
            ? amplitude
            : -amplitude;

        const x =
            mx +
            perpDist * px +
            alongOffset * ux;

        const y =
            my +
            perpDist * py +
            alongOffset * uy;

        zigZagPoints.push(unproject([x, y]));
    }

    return zigZagPoints;
}

/**
 * Breaks a line into dashes of the given meter lengths.
 *
 * **The pattern is clamped against the line's own length**, because it arrives
 * as a fraction of a caller-supplied `radius` and a caller that supplies none
 * gets a default measured in tens of meters. On a line hundreds of kilometers
 * long that produced 66,600 dashes — 133,000 coordinates for one graphic, where
 * the next heaviest in the whole catalog has 237. It is invisible on screen
 * (the dashes are far below a pixel) and it is most of a frame's work.
 *
 * The floor is a share of the total length, so the clamp only ever engages when
 * the pattern was already too fine to see. A caller passing a sensible period is
 * unaffected.
 */
export function lineStringToDashes(coords: Position[], dashPattern = [10, 10]) {
    if (coords.length < 2) {
        throw new Error('LineString must have at least 2 points');
    }

    const projected = coords.map(project);

    let totalLength = 0;
    for (let i = 0; i < projected.length - 1; i++) {
        totalLength += Math.hypot(projected[i + 1][0] - projected[i][0], projected[i + 1][1] - projected[i][1]);
    }
    const minPeriod = totalLength / MAX_DASHES_PER_LINE;
    const dashLength = Math.max(dashPattern[0], minPeriod / 2);
    const gapLength = Math.max(dashPattern[1], minPeriod / 2);

    let carry = 0;
    let isDash = true;
    const dashSegments: Position[][] = [];

    for (let i = 0; i < projected.length - 1; i++) {
        const p0 = projected[i];
        const p1 = projected[i + 1];

        const dx = p1[0] - p0[0];
        const dy = p1[1] - p0[1];
        const segLen = Math.hypot(dx, dy);

        let dist = carry;

        while (dist < segLen) {
            const startFrac = dist / segLen;
            const endDist = Math.min(
                dist + (isDash ? dashLength : gapLength),
                segLen
            );
            const endFrac = endDist / segLen;

            if (isDash) {
                const start = [
                    p0[0] + dx * startFrac,
                    p0[1] + dy * startFrac
                ] as [number, number];

                const end = [
                    p0[0] + dx * endFrac,
                    p0[1] + dy * endFrac
                ] as [number, number];

                dashSegments.push([
                    unproject(start),
                    unproject(end)
                ]);
            }

            dist = endDist;
            isDash = !isDash;
        }

        carry = dist - segLen;
    }
    return turf.multiLineString(dashSegments);
}

/**
 * Transforms a simple 2-point LineString into a crowbar with cleaner perpendicular hooks
 * @param coords
 * @param hookLength
 * @param direction
 * @returns {Object} Turf.js LineString feature with crowbar shape
 */
export function simpleLineToCrowbar(coords: Position[],
                    hookLength = 100,
                    direction = 'right'
) {

    if (coords.length !== 2) {
        console.warn('simpleLineToCrowbar works best with 2-point lines. Use lineStringToCrowbar for complex lines.');
    }

    const startPoint = coords[0];
    const endPoint = coords[coords.length - 1];

    // Calculate the bearing of the line
    const lineBearing = turf.bearing(startPoint, endPoint);
    const upperBearingOffset = 45;
    const lowerBearingOffset = 135;
    // Perpendicular bearings
    const upperPerpBearing = direction === 'left' ? lineBearing - upperBearingOffset : lineBearing + upperBearingOffset;
    const lowerPerpBearing = direction === 'left' ? lineBearing - lowerBearingOffset : lineBearing + lowerBearingOffset;

    // Create hooks perpendicular to the main line
    const startHook = turf.destination(
        startPoint,
        hookLength,
        lowerPerpBearing,
        {units: 'meters'}
    );

    const endHook = turf.destination(
        endPoint,
        hookLength,
        upperPerpBearing,
        {units: 'meters'}
    );

    // Build crowbar: start hook -> start point -> end point -> end hook
    const crowbarCoords = [
        turf.getCoord(startHook),
        startPoint,
        endPoint,
        turf.getCoord(endHook)
    ];

    return turf.lineString(crowbarCoords);
}

/**
 * Transforms a simple 2-point LineString into a crowbar with cleaner perpendicular hooks
 * @param coords
 * @param hookLength
 * @param direction
 * @returns {Object} Turf.js LineString feature with crowbar shape
 */
export function passageLineGraphic(coords: Position[],
                   hookLength = 100,
) {

    if (coords.length !== 2) {
        console.warn('simpleLineToCrowbar works best with 2-point lines. Use lineStringToCrowbar for complex lines.');
    }

    const startPoint = coords[0];
    const endPoint = coords[coords.length - 1];

    // Calculate the bearing of the line
    const lineBearing = turf.bearing(startPoint, endPoint);
    const upperBearingOffset = 45;
    const lowerBearingOffset = 135;
    // Perpendicular bearings
    const upperRightBearing = lineBearing + upperBearingOffset;
    const upperLeftBearing = lineBearing - upperBearingOffset;
    const lowerRightBearing = lineBearing + lowerBearingOffset;
    const lowerLeftBearing = lineBearing - lowerBearingOffset;

    // Create hooks perpendicular to the main line
    const upperLeftHook = turf.destination(
        endPoint,
        hookLength,
        upperLeftBearing,
        {units: 'meters'}
    );
    const upperRightHook = turf.destination(
        endPoint,
        hookLength,
        upperRightBearing,
        {units: 'meters'}
    );
    const lowerLeftHook = turf.destination(
        startPoint,
        hookLength,
        lowerLeftBearing,
        {units: 'meters'}
    );
    const lowerRightHook = turf.destination(
        startPoint,
        hookLength,
        lowerRightBearing,
        {units: 'meters'}
    );

    let upperBar = [
        turf.getCoord(upperLeftHook),
        endPoint,
        turf.getCoord(upperRightHook)
    ];

    let lowerBar = [
        turf.getCoord(lowerLeftHook),
        startPoint,
        turf.getCoord(lowerRightHook)
    ]
    return turf.multiLineString([upperBar, [startPoint, endPoint], lowerBar]);
}

export function getBridgeLabelPoints(coords: Position[], distance: number): Position[] {
    let start = coords[0];
    let stop = coords[1];
    const identifierCoord = getMidpoint(start, stop);
    // date time label
    let dateCoordinate = getExtendedPoint(start, stop, distance);
    return [identifierCoord, dateCoordinate];
}

function getPointAndUnitVectorAt(coords: Coordinate[], percent: number) {
    let totalLen = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        totalLen += Math.hypot(coords[i + 1][0] - coords[i][0], coords[i + 1][1] - coords[i][1]);
    }

    const targetDist = totalLen * percent;
    let accumulated = 0;

    for (let i = 0; i < coords.length - 1; i++) {
        const d = Math.hypot(coords[i + 1][0] - coords[i][0], coords[i + 1][1] - coords[i][1]);
        if (accumulated + d >= targetDist || i === coords.length - 2) {
            const localT = d === 0 ? 0 : (targetDist - accumulated) / d;
            const dx = coords[i + 1][0] - coords[i][0];
            const dy = coords[i + 1][1] - coords[i][1];
            const mag = Math.hypot(dx, dy);
            return {
                point: [coords[i][0] + dx * localT, coords[i][1] + dy * localT] as Coordinate,
                unitVec: [dx / mag, dy / mag] as [number, number]
            };
        }
        accumulated += d;
    }
    return {point: coords[0], unitVec: [1, 0] as [number, number]};
}
