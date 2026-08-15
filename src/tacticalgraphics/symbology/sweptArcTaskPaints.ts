/**
 * # Capture, evacuate and recover
 *
 * The paint half of APP-06 343000 / 344500 / 344600. @see SweptArcTask.ts for the circle
 * and the arc, which are geometry — the user places all four points, so both scale with
 * the graphic and survive a zoom.
 *
 * What is left here is what does *not* scale: the arrowhead at the end of the sweep, and
 * the letter that tells the three tasks apart.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelFillColor, getLabelHaloColor} from '../core/symbology';
import {endMarkScale} from './decorations';
import {lineColorOf, scaleOf} from './paintFunctions';

type SweptArcPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** Length of the arrowhead's barbs, in screen pixels before `endMarkScale`. */
const ARROWHEAD_PX = 26;
/** Half the angle between the two barbs, in degrees. */
const ARROWHEAD_HALF_ANGLE_DEG = 22;
/** Clearance between the arc and the letter beside it, in screen pixels. */
const LETTER_OFFSET_PX = 14;

/**
 * The letter beside the arc's middle, plus the arrowhead at its end.
 *
 * **The letter sits on the inside of the bend.** Both plates put it in the elbow, which is
 * also the only side guaranteed to be clear: the outside of a sweep is where the arrow is
 * heading, and on a tight arc the far leg comes back through it.
 *
 * @param letter `C`, `E` or `R`, straight off the plate.
 */
export function sweptArcTaskPaint(letter: string): SweptArcPaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];

        const color = lineColorOf(feature);
        const stroke = {color, widthPx: LINE_WIDTH()};
        const paints: Paint[] = [{geometry, stroke}];

        const arc = geometry.coordinates[1];
        if (!arc || arc.length < 3) return paints;

        const scale = endMarkScale(arc, context.resolution, ARROWHEAD_PX);
        if (scale > 0) {
            const tip = arc[arc.length - 1];
            const before = arc[arc.length - 2];
            const dx = tip[0] - before[0];
            const dy = tip[1] - before[1];
            const len = Math.hypot(dx, dy);
            if (len > 0) {
                const size = ARROWHEAD_PX * scale * context.resolution;
                const theta = (ARROWHEAD_HALF_ANGLE_DEG * Math.PI) / 180;
                const barb = (sign: number): ProjectedPosition => {
                    // The incoming direction turned back on itself by ±the half angle.
                    const cos = Math.cos(sign * theta);
                    const sin = Math.sin(sign * theta);
                    const bx = (-dx / len) * cos - (-dy / len) * sin;
                    const by = (-dx / len) * sin + (-dy / len) * cos;
                    return [tip[0] + bx * size, tip[1] + by * size];
                };
                paints.push({
                    geometry: {type: 'MultiLineString', coordinates: [[barb(-1), tip], [tip, barb(1)]]},
                    stroke,
                });
            }
        }

        const midIndex = Math.floor(arc.length / 2);
        const mid = arc[midIndex];
        const prev = arc[midIndex - 1];
        const next = arc[midIndex + 1];
        // The turn at the middle: its sign is which way the arc bends, so `-normal` on that
        // side is the concave one whichever direction the user drew in.
        const turn = (next[0] - mid[0]) * (mid[1] - prev[1]) - (next[1] - mid[1]) * (mid[0] - prev[0]);
        const tx = next[0] - prev[0];
        const ty = next[1] - prev[1];
        const tlen = Math.hypot(tx, ty);
        const offset = LETTER_OFFSET_PX * context.resolution;
        const side = turn >= 0 ? 1 : -1;
        const at: ProjectedPosition = tlen > 0
            ? [mid[0] + (ty / tlen) * offset * side, mid[1] - (tx / tlen) * offset * side]
            : mid;

        paints.push({
            geometry: {type: 'Point', coordinates: at},
            text: {
                text: letter,
                font: fontStyle,
                fill: getLabelFillColor(),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                align: 'center',
                baseline: 'middle',
                scale: scaleOf(feature, context),
            },
        });
        return paints;
    };
}
