import {Polygon, Position} from 'geojson';

export function generateLabelGaps(
    polygon: Polygon,
    options: {
        rotationRad: number;
        gapSize: number; // map units
    }
): {
    outlineSegments: Position[][];
    labelPoints: Position[];
} {

    // 1. Extract the exterior ring coordinates (handle both Feature and raw Geometry input)
    const coords = polygon.coordinates;
    const ring = coords[0];

    if (!ring || ring.length < 3) {
        return {outlineSegments: [], labelPoints: []};
    }

    // 2. Setup the rotation unit vector
    const unitRot: [number, number] = [
        Math.cos(options.rotationRad),
        Math.sin(options.rotationRad),
    ];

    /* -----------------------------------
     * 1) Find opposite segments
     * ----------------------------------- */
    let maxProj = -Infinity;
    let minProj = Infinity;
    let maxIdx = -1;
    let minIdx = -1;

    // 3. Iterate over all segments to find the ones defining the extent along the rotation axis
    for (let i = 0; i < ring.length - 1; i++) {
        const p1 = ring[i];
        const p2 = ring[i + 1];

        // Cartesian Midpoint: essential for planar map units
        const midX = (p1[0] + p2[0]) / 2;
        const midY = (p1[1] + p2[1]) / 2;

        // Scalar projection of the midpoint onto the rotation axis
        const projection = midX * unitRot[0] + midY * unitRot[1];

        if (projection > maxProj) {
            maxProj = projection;
            maxIdx = i;
        }
        if (projection < minProj) {
            minProj = projection;
            minIdx = i;
        }
    }

    // 4. Handle cases where opposite segments couldn't be found
    if (maxIdx === minIdx || maxIdx === -1 || minIdx === -1) {
        // Return the full closed outline as separate segments
        const outline = ring.slice(0, -1).map((p: any, i: number) => [p, ring[i + 1]]);
        return {
            outlineSegments: outline,
            labelPoints: [],
        };
    }

    const gapIndices = new Set([maxIdx, minIdx]);
    const outlineSegments: Position[][] = [];
    const labelPoints: Position[] = [];

    /* -----------------------------------
     * 2) Build outline + gaps
     * ----------------------------------- */
    // 5. Process all segments to create the outline and gaps
    for (let i = 0; i < ring.length - 1; i++) {
        const p1 = ring[i];
        const p2 = ring[i + 1];

        // Change in X and Y, and segment length (planar distance)
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        if (!gapIndices.has(i)) {
            // Normal segment: add the full segment
            outlineSegments.push([p1, p2]);
            continue;
        }

        // Segment requires a gap and a label
        if (segLen <= options.gapSize) {
            // Segment is too short for a gap, add full segment
            outlineSegments.push([p1, p2]);
            continue;
        }

        // Interpolation function to find a point along the segment (linear interpolation)
        const breakpoint = (t: number): Position => [
            p1[0] + dx * t,
            p1[1] + dy * t,
        ];

        // Calculate the fraction (t-value) for the start and end of the gap
        const centerT = 0.5;
        const halfGapRatio = (options.gapSize * 0.5) / segLen;

        const tStart = centerT - halfGapRatio;
        const tEnd = centerT + halfGapRatio;

        const gapStart = breakpoint(tStart);
        const gapEnd = breakpoint(tEnd);
        const labelPos = breakpoint(centerT);

        // Add the two line pieces around the gap
        outlineSegments.push(
            [p1, gapStart], // Piece before the gap
            [gapEnd, p2]    // Piece after the gap
        );

        // Record the label position (midpoint of the gap)
        labelPoints.push(labelPos);
    }

    // 6. Return the results
    return {outlineSegments, labelPoints};
}
