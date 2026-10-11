import {Polygon, Position} from 'geojson';
import {gapFits, pathLength, splitAtCorners, splitPathAroundAll} from '../../symbology/decorations';

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

    /* -----------------------------------
     * 2) Build outline + gaps
     * -----------------------------------
     * **Along the ring, on the edge each extreme belongs to.** On a hard ring that is the
     * segment itself, so this cuts what the one-segment version cut; on a smoothed ring the
     * extreme segment is a short chord, which no gap fits, and the edge is the nearly straight
     * stretch of curve around it. @see gapFits The ring is walked from halfway between
     * the two extremes so neither gap straddles the seam, and what is left comes back as runs
     * between real corners rather than one piece per segment: the teeth are laid per piece, and
     * a chord shorter than a tooth would get none. @see splitAtCorners
     */
    const m = ring.length - 1;
    const gapped = [maxIdx, minIdx].sort((a, b) => a - b).filter(i => gapFits(ring as [number, number][], i, 0.5, options.gapSize / 2, true));
    const start = gapped.length ? (maxIdx + Math.floor((((minIdx - maxIdx) % m) + m) % m / 2)) % m : 0;
    const walk = Array.from({length: m + 1}, (_, j) => ring[(start + j) % m] as [number, number]);
    const gaps: {at: number; halfGap: number}[] = [];
    const labelPoints: Position[] = [];

    for (const i of gapped) {
        const p1 = ring[i];
        const p2 = ring[i + 1];
        const along = (i - start + m) % m;
        gaps.push({at: pathLength(walk.slice(0, along + 1)) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2, halfGap: options.gapSize / 2});
        labelPoints.push([(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]);
    }

    const runs: Position[][] = splitPathAroundAll(walk, gaps);
    if (gaps.length && runs.length > 1) runs.splice(0, 1, [...runs.pop()!, ...runs[0].slice(1)]);
    const outlineSegments = runs.flatMap(run => splitAtCorners(run as [number, number][])).filter(run => run.length > 1);

    // 6. Return the results
    return {outlineSegments, labelPoints};
}
