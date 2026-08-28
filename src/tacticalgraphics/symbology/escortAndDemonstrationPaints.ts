/**
 * # Escort and demonstration
 *
 * The paint half of APP-06 343600 and 343300. @see EscortAndDemonstration.ts.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {
    centerSegmentIndex,
    endFrame,
    endMarkScale,
    pathLength,
    splitPathAround,
    textWidth,
    uprightRotation,
} from './decorations';
import {escortSymbolSizePx} from '../core/securitySymbol';
import {amplifierDash, lineColorOf, scaleOf, labelColorOf} from './paintFunctions';

type TaskPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** Depth of an escort's legs, in screen pixels before `endMarkScale`. */
const ESCORT_LEG_PX = 34;
/** Clear space either side of the `E A E` block inside its break, in screen pixels. */
const ESCORT_GAP_PADDING_PX = 6;
/**
 * How wide the host's unit symbol is, between the two `E`s.
 *
 * Taken from the bar's own on-screen span rather than being a constant, so the symbol and
 * the graphic scale together — and taken from the **same** function the renderers draw it
 * at, or the hole and the symbol disagree. @see escortSymbolSizePx
 */
function escortSymbolPx(spanPx: number): number {
    return escortSymbolSizePx(spanPx);
}

/** Length of a demonstration arrowhead's barbs, and half the angle between them. */
const DEM_ARROW_PX = 30;
const DEM_ARROW_HALF_ANGLE_DEG = 30;
/** Clear space either side of `DEM` inside the break it sits in, in screen pixels. */
const DEM_LABEL_PADDING_PX = 6;
/**
 * Most of a leg that `DEM` and its designation may take up.
 *
 * The text sits **in** the leg, so its width is bounded by the leg whether the graphic
 * was dropped small or zoomed away from — the same shape-relative rule the repeating
 * decorations follow, and the one the arc mission tasks' rim letters needed. A
 * zoom-anchored scale alone put a 65 px `DEM` across an 80 px leg in the sample sweep,
 * which is the letter being the graphic. @see decorationScale
 */
const DEM_LABEL_LEG_SHARE = 0.55;

/** Straight-line interpolation between two projected points. */
const lerp = (a: ProjectedPosition, b: ProjectedPosition, t: number): ProjectedPosition =>
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** A text amplifier with the usual halo. */
function amplifier(
    feature: PaintFeature, at: ProjectedPosition,
    text: string,
    scale: number,
    rotation: number,
    align: 'left' | 'center' | 'right',
    baseline: 'top' | 'middle' | 'bottom',
): Paint {
    return {
        geometry: {type: 'Point', coordinates: at},
        text: {
            text,
            font: fontStyle,
            fill: labelColorOf(feature),
            halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
            rotation,
            align,
            baseline,
            scale,
        },
    };
}

/**
 * The escort: a bar with a leg down at each end, broken in the middle for `E A E`.
 *
 * **`A` is a host-injected unit symbol and nothing here draws one.** The gap is sized to
 * leave room for it between the two `E`s, on the same reasoning as the security
 * operations: no renderer-agnostic description of an entity symbol exists in this package,
 * so the space is reserved and the host fills it or does not.
 *
 * The legs go to the **right of point 2 → point 3**, which puts them below a bar drawn
 * left to right — the side the escorted unit is on, per *"the escort symbol appears above
 * the convoy"*. It is the same rule the fortified position follows.
 */
export function escortPaint(letter: string): TaskPaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'LineString' || geometry.coordinates.length < 2) return [];

        const path = geometry.coordinates;
        const stroke = {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)};
        const scale = scaleOf(feature, context);

        const start = path[0];
        const end = path[path.length - 1];
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const span = Math.hypot(dx, dy);
        if (span === 0) return [{geometry, stroke}];

        const halfGapPx =
            textWidth(context, letter, fontStyle, scale)
            + escortSymbolPx(span / context.resolution) / 2
            + ESCORT_GAP_PADDING_PX;
        const gap = Math.min((halfGapPx * context.resolution) / span, 0.45);

        const bar: ProjectedPosition[][] = [
            [start, lerp(start, end, 0.5 - gap)],
            [lerp(start, end, 0.5 + gap), end],
        ];

        const legScale = endMarkScale(path, context.resolution, ESCORT_LEG_PX);
        if (legScale > 0) {
            const depth = ESCORT_LEG_PX * legScale * context.resolution;
            const frames = [endFrame(path, true), endFrame(path, false)];
            // `-v` at the start and `+v` at the end: the end frame's `u` points back along
            // the bar, so its left normal is the start frame's right. @see fortifiedPositionPaint
            frames.forEach((frame, index) => {
                if (!frame) return;
                const sign = index === 0 ? -1 : 1;
                bar.push([frame.origin, [
                    frame.origin[0] + frame.v[0] * depth * sign,
                    frame.origin[1] + frame.v[1] * depth * sign,
                ]]);
            });
        }

        const paints: Paint[] = [{geometry: {type: 'MultiLineString', coordinates: bar}, stroke}];

        const rotation = uprightRotation(start, end);
        // One `E` against each side of the reserved space, growing outward from it.
        paints.push(amplifier(feature, bar[0][1], letter, scale, rotation, 'right', 'middle'));
        paints.push(amplifier(feature, bar[1][0], letter, scale, rotation, 'left', 'middle'));
        return paints;
    };
}

/**
 * The demonstration: the drawn U, **one** open arrowhead, and `DEM` set in a break in the
 * leg that carries it.
 *
 * The heads are open, not filled — both forms are in use in this symbology and the plate
 * decides which. @see solidArrowHead
 *
 * **One head, not two.** 343300 numbers point 1 as "the tip of the arrowhead", singular,
 * and points 3 and 4 as the length of "the second straight line" with no head named. Both
 * the Template and the Example draw the second leg ending blunt. This drew a head on each,
 * which reads as a symbol pointing two ways at once.
 *
 * And `DEM` sits **in** the leg rather than above it, which is where the plate puts it.
 */
export function demonstrationPaint(label: string): TaskPaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];

        const parts = geometry.coordinates;
        const stroke = {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)};
        const paints: Paint[] = [{geometry, stroke}];
        if (parts.length < 3) return paints;

        const legs = [parts[0], parts[2]];
        const headScale = endMarkScale(legs[0], context.resolution, DEM_ARROW_PX);
        if (headScale > 0) {
            const size = DEM_ARROW_PX * headScale * context.resolution;
            const theta = (DEM_ARROW_HALF_ANGLE_DEG * Math.PI) / 180;
            const barbs: ProjectedPosition[][] = [];

            // Point 1 only: part 0 runs tip → bend, so the head is at its first vertex.
            const head = parts[0];
            const tip = head[0];
            const inner = head[1];
            const dx = tip[0] - inner[0];
            const dy = tip[1] - inner[1];
            const len = Math.hypot(dx, dy);
            if (len > 0) {
                for (const sign of [-1, 1]) {
                    const cos = Math.cos(sign * theta);
                    const sin = Math.sin(sign * theta);
                    const bx = (-dx / len) * cos - (-dy / len) * sin;
                    const by = (-dx / len) * sin + (-dy / len) * cos;
                    barbs.push([tip, [tip[0] + bx * size, tip[1] + by * size]]);
                }
            }
            if (barbs.length) paints.push({geometry: {type: 'MultiLineString', coordinates: barbs}, stroke});
        }

        const leg = parts[0];
        const segIdx = centerSegmentIndex(leg);
        const a = leg[segIdx];
        const b = leg[segIdx + 1];
        const mid: ProjectedPosition = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const text = [label, (feature.properties.label ?? '').trim()].filter(Boolean).join(' ');
        // Capped against the leg it is set in, never merely against the zoom. A longer
        // designation is held to the same width, so it opens a wider break rather than
        // one that swallows the line. @see DEM_LABEL_LEG_SHARE
        const legPx = pathLength(leg) / context.resolution;
        const widthAtUnitScale = textWidth(context, text, fontStyle, 1);
        const scale = widthAtUnitScale > 0
            ? Math.min(scaleOf(feature, context), (legPx * DEM_LABEL_LEG_SHARE) / widthAtUnitScale)
            : scaleOf(feature, context);

        // Set in the leg, not above it. The break is cut from the *rendered* text, so a
        // longer designation opens a wider hole rather than overrunning the line.
        const halfGap =
            (textWidth(context, text, fontStyle, scale) / 2 + DEM_LABEL_PADDING_PX) * context.resolution;
        const runs = splitPathAround(leg, pathLength(leg) / 2, halfGap);
        if (runs.length) {
            const rest = parts.slice(1);
            paints[0] = {geometry: {type: 'MultiLineString', coordinates: [...runs, ...rest]}, stroke};
        }

        paints.push(amplifier(feature, mid, text, scale, uprightRotation(a, b), 'center', 'middle'));
        return paints;
    };
}
