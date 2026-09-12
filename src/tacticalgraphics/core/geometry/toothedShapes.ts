import {Polygon, Position} from 'geojson';
import * as turf from '../turf';

/**
 * Generates a dynamic, symmetrically-spaced number of isosceles triangles
 * along the exterior edges of a polygon, ensuring continuous spacing
 * across all vertices.
 * * @param polygonRings The coordinates of the polygon as an array of rings (Position[][]).
 * @param triangleWidth The base width of the triangle (distance along the edge) in meters.
 * @param triangleHeight The height of the triangle (distance from base to apex) in meters.
 * @param gap The desired gap distance between the base of adjacent triangles in meters.
 * @param outward If true, triangles point outward from the polygon (default); otherwise, they point inward.
 * @returns An array of triangle polygons, where each triangle is [p1, apex, p2].
 */
export function generatePolygonTriangles(
    polygonRings: Position[][],
    triangleWidth: number,
    triangleHeight: number,
    gap: number,
    outward: boolean = true,
): Position[][] {
    if (!polygonRings || polygonRings.length === 0) {
        console.warn("Input polygon has no rings.");
        return [];
    }
    const exteriorRing = polygonRings[0];
    const numVertices = exteriorRing.length;
    const allTriangles: Position[][] = [];

    // Reconciles the caller's geometric intent with the ring's winding: without it the
    // triangles sit inside or outside according to the order the user happened to
    // click the corners. @see ringIsCounterClockwise
    const toothSide = outward !== ringIsCounterClockwise(exteriorRing);

    // 1. Calculate Total Perimeter Length and Segment Lengths (Global Calculation)
    const segmentLengthsMeters: number[] = [];
    let totalPerimeter = 0;

    // We only iterate (numVertices - 1) segments, since the last point is the same as the first.
    for (let i = 0; i < numVertices - 1; i++) {
        const pStart = exteriorRing[i];
        const pEnd = exteriorRing[i + 1];

        const segmentLine = turf.lineString([pStart, pEnd]);
        const lengthKm = turf.length(segmentLine, {units: 'kilometers'});
        const lengthM = lengthKm * 1000;

        segmentLengthsMeters.push(lengthM);
        totalPerimeter += lengthM;
    }

    // 2. Global Spacing Calculation
    const unitLength = triangleWidth + gap; // length of one triangle base + one gap

    // Calculate the maximum number of full units that fit around the whole perimeter.
    const N_total = Math.floor((totalPerimeter + gap) / unitLength);

    if (N_total <= 0) {
        return [];
    }

    // Recalculate Effective Gap for perfect symmetry around the entire perimeter
    const totalBaseLength = N_total * triangleWidth;
    const totalGapSpace = totalPerimeter - totalBaseLength;

    // The total gap space is distributed among N_total slots (gap after each triangle).
    const effectiveGap = totalGapSpace / N_total;

    if (effectiveGap < 0) {
        console.warn("Negative effective gap. Check input values.");
        return [];
    }

    // 3. Sequential Triangle Generation along the Perimeter
    let currentPerimeterDistance = 0; // Tracks the distance along the whole polygon perimeter

    for (let i = 0; i < numVertices - 1; i++) {
        const pStart = exteriorRing[i];
        const pEnd = exteriorRing[i + 1];
        const segmentLength = segmentLengthsMeters[i];

        // Calculate where the first triangle *could* start on this segment
        const segmentStartMod = currentPerimeterDistance % unitLength;

        // The starting point for the first triangle base on this segment (relative to pStart).
        let baseStartDistRel = (unitLength - segmentStartMod) % unitLength;

        // If we're starting at position 0, we need to account for the gap
        if (baseStartDistRel === 0) {
            baseStartDistRel = effectiveGap;
        }

        // Loop to generate all triangles that fit on the current segment
        while (true) {
            const baseEndDistRel = baseStartDistRel + triangleWidth;

            // Check if the current triangle base exceeds the segment length
            if (baseEndDistRel > segmentLength) {
                break; // Move to the next segment
            }

            // Generate the triangle using linear interpolation for precision
            const segmentTriangles = generateSingleTriangleLinear(
                pStart,
                pEnd,
                segmentLength,
                baseStartDistRel,
                triangleWidth,
                triangleHeight,
                toothSide
            );

            allTriangles.push(segmentTriangles);

            // Advance the starting point for the next triangle base
            baseStartDistRel += triangleWidth + effectiveGap;
        }

        // Update the total distance traveled
        currentPerimeterDistance += segmentLength;
    }

    return allTriangles;
}

export function generateFixGraphic(
    lineCoords: Position[], // Always [pStart, pEnd]
    triangleWidth: number,
    triangleHeight: number,
    gap: number,
    firstSegmentLength?: number
): Position[] {
    const pStart = lineCoords[0];
    const pEnd = lineCoords[1];

    // 1. Calculate segment metrics
    const seg = turf.lineString([pStart, pEnd]);
    const segmentLength = turf.length(seg, {units: "kilometers"}) * 1000;

    // 2. Place the three triangles. By default the leading and trailing
    //    segments are equal; when `firstSegmentLength` is provided the
    //    first segment is forced to that length and the remainder of the
    //    line becomes the trailing segment.
    const totalContentWidth = (3 * triangleWidth) + (2 * gap);
    let currentDistRel = firstSegmentLength !== undefined
        ? firstSegmentLength
        : (segmentLength - totalContentWidth) / 2;

    const newLine: Position[] = [pStart];

    // 3. Generate 3 alternating triangles
    for (let i = 0; i < 3; i++) {
        // Toggle direction: i=0 (true), i=1 (false), i=2 (true)
        const isOutward = (i % 2 === 0);

        const [p1, apex, p2] = generateSingleTriangleLinear(
            pStart,
            pEnd,
            segmentLength,
            currentDistRel,
            triangleWidth,
            triangleHeight,
            isOutward
        );

        newLine.push(p1, apex, p2);

        // Move to the start of the next triangle, including the gap
        currentDistRel += triangleWidth + gap;
    }

    newLine.push(pEnd);
    return newLine;
}

/**
 * Generates triangles along a MultiLineString, treating it as if it were a continuous polygon.
 * This is useful when you've broken a polygon into multiple linestrings (e.g., for adding gaps/labels)
 * but want to maintain the same triangle spacing as if the polygon were intact.
 *
 * @param multiLineStringCoords Array of linestring coordinates (Position[][]), where each linestring is a Position[]
 * @param triangleWidth The base width of the triangle (distance along the edge) in meters.
 * @param triangleHeight The height of the triangle (distance from base to apex) in meters.
 * @param gap The desired gap distance between the base of adjacent triangles in meters.
 * @param outward If true, triangles point outward from the polygon (default); otherwise, they point inward.
 * @returns An array of triangle polygons, where each triangle is [p1, apex, p2, p1].
 */
export function generateMultiLineStringTriangles(
    multiLineStringCoords: Position[][],
    triangleWidth: number,
    triangleHeight: number,
    gap: number,
    outward: boolean = true
): Position[][] {
    if (!multiLineStringCoords || multiLineStringCoords.length === 0) {
        console.warn("Input MultiLineString has no linestrings.");
        return [];
    }

    const allTriangles: Position[][] = [];

    // 1. Calculate total length across all linestrings and store segment info
    interface SegmentInfo {
        lineStringIndex: number;
        segmentIndex: number;
        pStart: Position;
        pEnd: Position;
        lengthMeters: number;
    }

    const segments: SegmentInfo[] = [];
    let totalLength = 0;

    // Process each linestring
    for (let lsIndex = 0; lsIndex < multiLineStringCoords.length; lsIndex++) {
        const lineString = multiLineStringCoords[lsIndex];

        if (lineString.length < 2) {
            console.warn(`LineString ${lsIndex} has fewer than 2 points, skipping.`);
            continue;
        }

        // Process each segment within the linestring
        for (let i = 0; i < lineString.length - 1; i++) {
            const pStart = lineString[i];
            const pEnd = lineString[i + 1];

            const segmentLine = turf.lineString([pStart, pEnd]);
            const lengthKm = turf.length(segmentLine, {units: 'kilometers'});
            const lengthM = lengthKm * 1000;

            segments.push({
                lineStringIndex: lsIndex,
                segmentIndex: i,
                pStart,
                pEnd,
                lengthMeters: lengthM
            });

            totalLength += lengthM;
        }
    }

    if (segments.length === 0) {
        console.warn("No valid segments found in MultiLineString.");
        return [];
    }

    // 2. Global Spacing Calculation (treat as closed polygon)
    const unitLength = triangleWidth + gap;

    // Calculate as if this were a closed polygon
    const N_total = Math.floor((totalLength + gap) / unitLength);

    if (N_total <= 0) {
        return [];
    }

    // Recalculate Effective Gap for perfect symmetry
    const totalBaseLength = N_total * triangleWidth;
    const totalGapSpace = totalLength - totalBaseLength;
    const effectiveGap = totalGapSpace / N_total;

    if (effectiveGap < 0) {
        console.warn("Negative effective gap. Check input values.");
        return [];
    }

    // 3. Sequential Triangle Generation across all segments
    let currentPathDistance = 0;
    const initialOffset = effectiveGap; // Start with gap like closed polygon

    for (const segment of segments) {
        const {pStart, pEnd, lengthMeters: segmentLength} = segment;

        // Calculate where the first triangle *could* start on this segment
        const segmentStartMod = (currentPathDistance + initialOffset) % unitLength;
        let baseStartDistRel = (unitLength - segmentStartMod) % unitLength;

        // For the first segment, account for the initial gap
        if (currentPathDistance === 0 && baseStartDistRel === 0) {
            baseStartDistRel = effectiveGap;
        }

        // Loop to generate all triangles that fit on the current segment
        while (true) {
            const baseEndDistRel = baseStartDistRel + triangleWidth;

            // Check if the current triangle base exceeds the segment length
            if (baseEndDistRel > segmentLength) {
                break; // Move to the next segment
            }

            // Generate the triangle
            const triangle = generateSingleTriangleLinear(
                pStart,
                pEnd,
                segmentLength,
                baseStartDistRel,
                triangleWidth,
                triangleHeight,
                outward
            );

            allTriangles.push(triangle);

            // Advance the starting point for the next triangle base
            baseStartDistRel += triangleWidth + effectiveGap;
        }

        // Update the total distance traveled
        currentPathDistance += segmentLength;
    }

    return allTriangles;
}

export function fortifiedAreaGraphic(
    polygon: Polygon,
    merlonWidth: number,
    crenelWidth: number,
    depth: number
): Position[][] {
    const coords = polygon.coordinates[0];
    const out: Position[] = [];

    const patternWidth = merlonWidth + crenelWidth;

    // Calculate total perimeter and segment lengths
    const segmentLengths: number[] = [];
    let totalPerimeter = 0;

    for (let i = 0; i < coords.length - 1; i++) {
        const line = turf.lineString([coords[i], coords[i + 1]]);
        const len = turf.length(line, {units: 'meters'});
        segmentLengths.push(len);
        totalPerimeter += len;
    }

    // Calculate total number of patterns around entire perimeter
    const totalPatterns = Math.round(totalPerimeter / patternWidth);
    const adjustedPatternWidth = totalPerimeter / totalPatterns;
    const adjustedMerlonWidth = adjustedPatternWidth * (merlonWidth / patternWidth);
    const adjustedCrenelWidth = adjustedPatternWidth * (crenelWidth / patternWidth);

    let distanceFromStart = 0;
    let inMerlon = true; // Track whether we're currently in a merlon or crenel
    let nextTransition = adjustedMerlonWidth; // Distance to next transition

    for (let i = 0; i < coords.length - 1; i++) {
        const start = coords[i];
        const end = coords[i + 1];
        const segmentLength = segmentLengths[i];

        const line = turf.lineString([start, end]);
        const bearing = turf.bearing(turf.point(start), turf.point(end));
        const perpBearing = bearing + 90;

        let segmentDist = 0;

        while (segmentDist < segmentLength) {
            const remainingInSegment = segmentLength - segmentDist;
            const remainingToTransition = nextTransition - distanceFromStart;

            if (remainingToTransition <= remainingInSegment) {
                // Transition happens within this segment
                const transitionPoint = turf.along(line, segmentDist + remainingToTransition, {units: 'meters'});

                if (inMerlon) {
                    // End of merlon: go from outer to inner
                    const outerPoint = turf.destination(transitionPoint, depth, perpBearing, {units: 'meters'});
                    out.push(outerPoint.geometry.coordinates);
                    out.push(transitionPoint.geometry.coordinates);
                } else {
                    // End of crenel: go from inner to outer
                    out.push(transitionPoint.geometry.coordinates);
                    const outerPoint = turf.destination(transitionPoint, depth, perpBearing, {units: 'meters'});
                    out.push(outerPoint.geometry.coordinates);
                }

                segmentDist += remainingToTransition;
                distanceFromStart += remainingToTransition;
                inMerlon = !inMerlon;
                nextTransition = distanceFromStart + (inMerlon ? adjustedMerlonWidth : adjustedCrenelWidth);
            } else {
                // No transition in this segment, move to next segment
                break;
            }
        }
    }

    // Close the polygon
    out.push(out[0]);

    return [out];
}

/**
 * Build the FortifiedLine "battlement" graphic from a base line: an
 * interrupted baseline plus a series of outward-bumping rectangular
 * teeth (merlons). The baseline is drawn ONLY in the gaps between teeth
 * — each tooth is open at its base so the rectangle reads as truly
 * three-sided rather than a closed box sitting on the line.
 *
 * Output is `Position[][]` — one sub-line per LineString in the
 * resulting MultiLineString. The order interleaves gap and tooth
 * sub-lines from start to end:
 *   gap_0, tooth_0, gap_1, tooth_1, ..., tooth_{N-1}, gap_N
 * where gap pieces are 2-point baseline segments and tooth pieces are
 * 4-point polylines `[leftBase, leftTop, rightTop, rightBase]`.
 *
 * Teeth are evenly distributed — N teeth and N+1 gaps, starting and
 * ending with a gap so corners aren't crowded. If the line is shorter
 * than one merlon+crenel pattern, only the baseline is returned.
 */
export function generateCrenellatedLineGraphic(
    lineCoords: Position[],
    merlonWidth: number,
    crenelWidth: number,
    toothHeight: number,
    outward: boolean = true,
): Position[][] {
    if (!lineCoords || lineCoords.length < 2) return [];

    const segmentLengths: number[] = [];
    let totalLength = 0;
    for (let i = 0; i < lineCoords.length - 1; i++) {
        const len = turf.distance(lineCoords[i], lineCoords[i + 1], {units: 'meters'});
        segmentLengths.push(len);
        totalLength += len;
    }

    const patternWidth = merlonWidth + crenelWidth;
    if (patternWidth <= 0 || totalLength < patternWidth) {
        return [lineCoords.slice()];
    }

    // N teeth + (N+1) gaps. Solve for N closest to even spacing.
    const N = Math.max(1, Math.round((totalLength - crenelWidth) / patternWidth));
    const adjustedCrenel = (totalLength - N * merlonWidth) / (N + 1);

    const sample = (distance: number): { point: Position; bearing: number; segIdx: number } => {
        let accumulated = 0;
        for (let i = 0; i < lineCoords.length - 1; i++) {
            const segLen = segmentLengths[i];
            if (segLen <= 0) continue;
            if (accumulated + segLen >= distance - 1e-9) {
                const segStart = lineCoords[i];
                const segEnd = lineCoords[i + 1];
                const t = (distance - accumulated) / segLen;
                // Linear interpolation keeps the sample point exactly on
                // the rendered segment (matches the rest of the codebase).
                const point: Position = [
                    segStart[0] + t * (segEnd[0] - segStart[0]),
                    segStart[1] + t * (segEnd[1] - segStart[1]),
                ];
                const bearing = turf.bearing(segStart, segEnd);
                return {point, bearing, segIdx: i};
            }
            accumulated += segLen;
        }
        const lastIdx = lineCoords.length - 2;
        const last = lineCoords[lineCoords.length - 1];
        const prev = lineCoords[lineCoords.length - 2];
        return {point: last, bearing: turf.bearing(prev, last), segIdx: lastIdx};
    };

    // Build the gap baseline between two cumulative distances. Walks any
    // intermediate user-drawn vertices so multi-segment baselines bend
    // correctly between teeth.
    const gapBetween = (fromDist: number, toDist: number): Position[] => {
        const from = sample(fromDist);
        const to = sample(toDist);
        const points: Position[] = [from.point];
        for (let i = from.segIdx + 1; i <= to.segIdx; i++) {
            points.push(lineCoords[i]);
        }
        points.push(to.point);
        return points;
    };

    const heightKm = toothHeight / 1000;
    const subLines: Position[][] = [];

    let cursor = 0;
    for (let i = 0; i < N; i++) {
        const leftDist = adjustedCrenel + i * (merlonWidth + adjustedCrenel);
        const rightDist = leftDist + merlonWidth;

        // Gap leading up to this tooth.
        subLines.push(gapBetween(cursor, leftDist));

        const left = sample(leftDist);
        const right = sample(rightDist);

        // Outward bump: same convention as generateSingleTriangleLinear
        // (bearing − 90 for outward = above a left-to-right line).
        const sign = outward ? -1 : 1;
        const leftPerp = (left.bearing + sign * 90 + 360) % 360;
        const rightPerp = (right.bearing + sign * 90 + 360) % 360;

        const leftTop = turf.destination(left.point, heightKm, leftPerp, {units: 'kilometers'}).geometry.coordinates;
        const rightTop = turf.destination(right.point, heightKm, rightPerp, {units: 'kilometers'}).geometry.coordinates;

        subLines.push([left.point, leftTop, rightTop, right.point]);
        cursor = rightDist;
    }
    // Final gap from the last tooth to the end.
    subLines.push(gapBetween(cursor, totalLength));

    return subLines;
}

/**
 * Winding of a closed ring, by the shoelace sum.
 *
 * Teeth are placed with `turf.bearing ± 90`, which is a side of *travel* — left or
 * right of the direction the ring is being walked. Which of those is the outside of
 * the polygon depends entirely on the winding, and nothing normalizes the winding of
 * what a user draws: click the corners of an area clockwise and the teeth point out,
 * click the same corners the other way round and every tooth points in. Callers pass
 * a geometric intent (`outward`), so they need this to turn it into a side.
 *
 * `sum > 0` is clockwise for this form of the shoelace, which is the winding the
 * tooth helper's `outward = bearing - 90` already assumes.
 */
function ringIsCounterClockwise(ring: Position[]): boolean {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[i + 1];
        sum += (x2 - x1) * (y2 + y1);
    }
    return sum < 0;
}

/**
 * Helper to generate a single triangle using linear interpolation along the segment.
 * This ensures the base points lie exactly on the polygon edge.
 */
function generateSingleTriangleLinear(
    pStart: Position,
    pEnd: Position,
    segmentLengthMeters: number,
    baseStartDistRel: number,
    triangleWidth: number,
    triangleHeight: number,
    outward: boolean
): Position[] {
    // Calculate interpolation factors (0 to 1) for p1 and p2 along the segment
    const t1 = baseStartDistRel / segmentLengthMeters;
    const t2 = (baseStartDistRel + triangleWidth) / segmentLengthMeters;

    // Linear interpolation to get p1 and p2 exactly on the line segment
    const p1: Position = [
        pStart[0] + t1 * (pEnd[0] - pStart[0]),
        pStart[1] + t1 * (pEnd[1] - pStart[1])
    ];

    const p2: Position = [
        pStart[0] + t2 * (pEnd[0] - pStart[0]),
        pStart[1] + t2 * (pEnd[1] - pStart[1])
    ];

    // Calculate the midpoint of the base
    const midpoint: Position = [
        (p1[0] + p2[0]) / 2,
        (p1[1] + p2[1]) / 2
    ];

    // Calculate the bearing of the segment
    const bearing = turf.bearing(pStart, pEnd);

    // Calculate perpendicular bearing
    // For outward triangles: rotate bearing by +90° (right side)
    // For inward triangles: rotate bearing by -90° (left side)
    let perpBearing = bearing + (outward ? -90 : 90);
    perpBearing = (perpBearing + 360) % 360;

    // Compute the apex point at the required height along the perpendicular bearing
    const heightKm = triangleHeight / 1000;
    const apex = turf.destination(midpoint, heightKm, perpBearing, {units: "kilometers"}).geometry.coordinates;

    // Close the triangle by returning to p1
    return [p1, apex, p2];
}
