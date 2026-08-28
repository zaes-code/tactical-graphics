/**
 * # Fitting a fixed symbol inside a drawn area
 *
 * Several APP-06 areas carry a glyph in the middle — the airfield's crossed runways,
 * the CBRN triangle — and the glyph has a fixed shape while the area does not. So the
 * question is always the same: how far must this symbol shrink to sit inside the ring
 * the user actually drew?
 *
 * Answering it from the bounding box alone is not enough. A concave notch is inside the
 * box and outside the ring, so a glyph that clears the box can still cross the outline.
 * The fit therefore starts from the box and then tightens until every sample point along
 * the glyph is genuinely inside the ring.
 *
 * This is rendering mechanics rather than symbology — nothing here says what a symbol
 * *is* — but it lives beside the paints because both renderers need the same answer, and
 * a glyph fitted differently in two engines is the class of drift this library keeps
 * finding.
 */

import type {PaintFeature, ProjectedPosition} from '../core/paint';

/**
 * Share of the area's shorter side the symbol may span. The same fraction the area's own
 * text block is capped to, so symbol and text agree about how much room a polygon offers.
 */
export const FIT_SHARE = 0.8;

/** How many times the fit may be tightened before a polygon is called degenerate. */
const SHRINK_STEPS = 30;
const SHRINK_FACTOR = 0.9;

/** Ray casting, in the plane — these are projected meters. */
export function pointInRing(ring: readonly ProjectedPosition[], [x, y]: ProjectedPosition): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/**
 * Evenly spaced points along a run of segments, for testing a glyph against an outline.
 *
 * **Endpoints alone are not enough**: a stroke can pass through a notch without either
 * of its ends being in one.
 */
export function sampleSegments(
    segments: readonly (readonly [ProjectedPosition, ProjectedPosition])[],
    steps = 8,
): ProjectedPosition[] {
    return segments.flatMap(([a, b]) => {
        const points: ProjectedPosition[] = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
        return points;
    });
}

/**
 * How much to shrink a symbol so it sits inside its polygon.
 *
 * Returns 1 when the bounds have not been stamped yet, keeping a fixed size rather than
 * collapsing the symbol to nothing on a first render.
 *
 * @param halfWidth  half the symbol's width at scale 1, in projected meters
 * @param halfHeight half its height at scale 1
 * @param samples    points along the symbol, at scale 1, tested against the ring
 */
export function fitSymbolScale(
    feature: PaintFeature,
    center: ProjectedPosition,
    halfWidth: number,
    halfHeight: number,
    samples: readonly ProjectedPosition[],
): number {
    const bounds = feature.bounds;
    if (!bounds) return 1;

    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    if (!(width > 0) || !(height > 0)) return 1;

    let scale = FIT_SHARE * Math.min(width / (halfWidth * 2), height / (halfHeight * 2));

    const ring = feature.ring;
    if (!ring || ring.length < 3) return scale;

    const fits = (s: number) =>
        samples.every(p => pointInRing(ring, [center[0] + p[0] * s, center[1] + p[1] * s]));

    for (let i = 0; i < SHRINK_STEPS && !fits(scale); i++) scale *= SHRINK_FACTOR;
    return scale;
}
