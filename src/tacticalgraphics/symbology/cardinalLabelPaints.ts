/**
 * # Areas that write their own name into the boundary
 *
 * The artillery manoeuvre area and the artillery reserved area are drawn as an ordinary
 * area whose outline is **interrupted four times**, with the abbreviation sitting in each
 * break. APP-06 242400 says it outright:
 *
 * > The letters AMA in[terrupting the] symbol bound[ary] are to be positioned at the four
 * > cardinal points of the boundary.
 *
 * Nothing else in this library cuts an outline at a bearing, so the mechanics live here.
 * They are shared by both graphics because only the abbreviation differs, and two copies
 * of a gap calculation are two places for the gap to stop matching the text in it.
 *
 * **The gap is measured from the rendered glyph, not guessed.** `PaintContext.measureText`
 * is handed the same font the label is drawn with — a gap sized at one font and filled at
 * another is a bug this repository has shipped twice, which is why the context carries the
 * measurement at all.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor, labelScale} from '../core/symbology';
import {lineColorOf} from './paintFunctions';
import {textWidth} from './decorations';

type CardinalPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** North, east, south, west — the four the standard names, clockwise from up. */
const CARDINALS = [Math.PI / 2, 0, -Math.PI / 2, Math.PI] as const;

/** Clear space either side of the text inside its break, in screen pixels. */
const GAP_PADDING_PX = 6;

/** Centroid of a ring, good enough to shoot the four rays from. */
function ringCenter(ring: readonly ProjectedPosition[]): ProjectedPosition {
    let x = 0;
    let y = 0;
    for (const [px, py] of ring) {
        x += px;
        y += py;
    }
    return [x / ring.length, y / ring.length];
}

/**
 * Where a ray from `center` at `angle` leaves the ring, as a distance along the ring.
 *
 * Returned as an along-ring distance rather than a point because that is what cutting a
 * break needs: a gap is a span of the outline, and a span is only meaningful measured
 * along it.
 */
function crossingAt(
    ring: readonly ProjectedPosition[],
    center: ProjectedPosition,
    angle: number,
): number | undefined {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let traveled = 0;
    for (let i = 0; i + 1 < ring.length; i++) {
        const [ax, ay] = ring[i];
        const [bx, by] = ring[i + 1];
        const ex = bx - ax;
        const ey = by - ay;
        const segLen = Math.hypot(ex, ey);
        // Ray C + t*d against segment A + u*e, solved with the 2D cross product:
        //   t = ((A - C) x e) / (d x e)      u = ((A - C) x d) / (d x e)
        // Writing it out matters -- the first version negated `u`, which sent the test
        // for "is the hit on this segment" to the wrong segments and put every label in
        // roughly the same place.
        const denom = dx * ey - dy * ex;
        if (denom !== 0) {
            const rx = ax - center[0];
            const ry = ay - center[1];
            const t = (rx * ey - ry * ex) / denom;
            const u = (rx * dy - ry * dx) / denom;
            if (t > 0 && u >= 0 && u <= 1) return traveled + u * segLen;
        }
        traveled += segLen;
    }
    return undefined;
}

/** The point and heading at a given distance along the ring. */
function alongRing(
    ring: readonly ProjectedPosition[],
    distance: number,
): {point: ProjectedPosition; from: ProjectedPosition; to: ProjectedPosition} | undefined {
    let traveled = 0;
    for (let i = 0; i + 1 < ring.length; i++) {
        const [ax, ay] = ring[i];
        const [bx, by] = ring[i + 1];
        const segLen = Math.hypot(bx - ax, by - ay);
        if (traveled + segLen >= distance && segLen > 0) {
            const u = (distance - traveled) / segLen;
            return {point: [ax + u * (bx - ax), ay + u * (by - ay)], from: ring[i], to: ring[i + 1]};
        }
        traveled += segLen;
    }
    return undefined;
}

/** The ring split into the runs that survive after the breaks are removed. */
function ringWithBreaks(
    ring: readonly ProjectedPosition[],
    breaks: ReadonlyArray<readonly [number, number]>,
): ProjectedPosition[][] {
    const total = breaks.slice().sort((a, b) => a[0] - b[0]);
    const inBreak = (d: number) => total.some(([from, to]) => d >= from && d <= to);

    const runs: ProjectedPosition[][] = [];
    let run: ProjectedPosition[] = [];
    let traveled = 0;
    const push = (p: ProjectedPosition) => run.push(p);
    const close = () => {
        if (run.length >= 2) runs.push(run);
        run = [];
    };

    for (let i = 0; i + 1 < ring.length; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
        // Sample the segment finely enough that a break's ends land within a pixel or so
        // of where they were computed; the runs are strokes, not measurements.
        const steps = Math.max(2, Math.ceil(segLen / Math.max(1, segLen / 24)));
        for (let s = 0; s <= steps; s++) {
            const d = traveled + (segLen * s) / steps;
            const p: ProjectedPosition = [a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps];
            if (inBreak(d)) close();
            else push(p);
        }
        traveled += segLen;
    }
    close();
    return runs;
}

function outerRing(feature: PaintFeature): ProjectedPosition[] | undefined {
    if (feature.geometry.type !== 'Polygon') return undefined;
    const ring = feature.geometry.coordinates[0];
    return ring && ring.length >= 4 ? ring : undefined;
}

/** Half the break each label needs, in projected meters. */
function halfBreak(context: PaintContext, label: string, scale: number): number {
    return ((textWidth(context, label, fontStyle, scale) + GAP_PADDING_PX * 2) / 2) * context.resolution;
}

/** The outline, broken at the four cardinal points. */
export function cardinalBoundaryPaint(label: string): CardinalPaint {
    return (feature, context) => {
        const ring = outerRing(feature);
        const color = lineColorOf(feature);
        if (!ring) return [];

        const center = ringCenter(ring);
        const scale = labelScale(feature.drawingResolution, context.resolution);
        const half = halfBreak(context, label, scale);

        const breaks = CARDINALS
            .map(angle => crossingAt(ring, center, angle))
            .filter((d): d is number => d !== undefined)
            .map(d => [d - half, d + half] as const);

        return [{
            geometry: {type: 'MultiLineString', coordinates: ringWithBreaks(ring, breaks)},
            stroke: {color, widthPx: LINE_WIDTH()},
        }];
    };
}

/**
 * The abbreviation in each of the four breaks, over whatever the area's ordinary label
 * paint already drew in the middle.
 *
 * The text is **horizontal**, not laid along the outline it interrupts. Rotating it to
 * the edge looks like the obvious choice and is not what the plate draws: APP-06's own
 * example puts all four upright, and on a shape with vertical sides the rotated version
 * reads bottom-to-top, which no other label in this library does.
 */
export function cardinalLabelPaint(label: string, base: CardinalPaint): CardinalPaint {
    return (feature, context) => {
        const paints = base(feature, context);
        const ring = feature.ring;
        if (!ring || ring.length < 4) return paints;

        const center = ringCenter(ring);
        const scale = labelScale(feature.drawingResolution, context.resolution);
        const color = lineColorOf(feature);

        for (const angle of CARDINALS) {
            const at = crossingAt(ring, center, angle);
            if (at === undefined) continue;
            const spot = alongRing(ring, at);
            if (!spot) continue;
            paints.push({
                geometry: {type: 'Point', coordinates: spot.point},
                text: {
                    text: label,
                    font: fontStyle,
                    fill: color,
                    halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                    align: 'center',
                    baseline: 'middle',
                    scale,
                },
            });
        }
        return paints;
    };
}
