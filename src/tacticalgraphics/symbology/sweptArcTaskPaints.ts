/**
 * # Seize, capture, evacuate and recover
 *
 * The paint half of APP-06 342300 / 343000 / 344500 / 344600. @see SweptArcTask.ts for the
 * circle and the arc, which are geometry — the user places all four points, so both scale
 * with the graphic and survive a zoom.
 *
 * What is left here is what does *not* scale: the arrowhead at the end of the sweep, and
 * the letter that tells the four tasks apart.
 *
 * ## Both marks were read off the wrong arrows
 *
 * The head **is not solid**. This drew a filled triangle on the note that "the plate's head
 * is solid", and all six plates — three Templates, three Examples — show a pair of open
 * barbs. What is solid on those plates is the *annotation's* leader arrows, the ones
 * labelled `PT.3` and `PT.4`, which point at the symbol from outside it. Measuring a
 * callout instead of the symbol is an easy mistake to make once and an easy one to keep.
 *
 * And the letter sits **in a break in the arc**, not offset beside it: the curve stops
 * short of the glyph and picks up again after. @see splitPathAround
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {endMarkScale, pathLength, splitPathAround, textWidth} from './decorations';
import {lineColorOf, scaleOf, labelColorOf} from './paintFunctions';

type SweptArcPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** Length of the arrowhead's barbs, in screen pixels before `endMarkScale`. */
const ARROWHEAD_PX = 26;
/** Half the angle between the two barbs, in degrees. */
const ARROWHEAD_HALF_ANGLE_DEG = 22;
/** Clear space either side of the letter inside its break, in screen pixels. */
const LETTER_PADDING_PX = 5;

/**
 * The letter set in the arc's break, plus the arrowhead at its end.
 *
 * @param letter `S`, `C`, `E` or `R`, straight off the plate.
 */
export function sweptArcTaskPaint(letter: string): SweptArcPaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];

        const color = lineColorOf(feature);
        const stroke = {color, widthPx: LINE_WIDTH()};

        const parts = geometry.coordinates;
        const arc = parts[1];
        if (!arc || arc.length < 3) return [{geometry, stroke}];

        const scale = scaleOf(feature, context);
        // The arc's own middle, which is where `arcThrough` put point 3 — the anchor the
        // plate annotates and the letter belongs on.
        const midIndex = Math.floor(arc.length / 2);
        const mid = arc[midIndex];
        const halfGap =
            (textWidth(context, letter, fontStyle, scale) / 2 + LETTER_PADDING_PX) * context.resolution;
        const runs = splitPathAround(arc, pathLength(arc.slice(0, midIndex + 1)), halfGap);

        // A gap wider than the arc leaves nothing to draw; keep the arc whole rather than
        // losing the sweep entirely, and let the halo carry the letter.
        const drawn = runs.length ? [parts[0], ...runs] : parts;
        const paints: Paint[] = [{geometry: {type: 'MultiLineString', coordinates: drawn}, stroke}];

        const headScale = endMarkScale(arc, context.resolution, ARROWHEAD_PX);
        if (headScale > 0) {
            const tip = arc[arc.length - 1];
            const inner = arc[arc.length - 2];
            const dx = tip[0] - inner[0];
            const dy = tip[1] - inner[1];
            const len = Math.hypot(dx, dy);
            if (len > 0) {
                const size = ARROWHEAD_PX * headScale * context.resolution;
                const theta = (ARROWHEAD_HALF_ANGLE_DEG * Math.PI) / 180;
                const barbs: ProjectedPosition[][] = [];
                for (const sign of [-1, 1]) {
                    const cos = Math.cos(sign * theta);
                    const sin = Math.sin(sign * theta);
                    const bx = (-dx / len) * cos - (-dy / len) * sin;
                    const by = (-dx / len) * sin + (-dy / len) * cos;
                    barbs.push([tip, [tip[0] + bx * size, tip[1] + by * size]]);
                }
                paints.push({geometry: {type: 'MultiLineString', coordinates: barbs}, stroke});
            }
        }

        paints.push({
            geometry: {type: 'Point', coordinates: mid},
            text: {
                text: letter,
                font: fontStyle,
                fill: labelColorOf(feature),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                align: 'center',
                baseline: 'middle',
                scale,
            },
        });
        return paints;
    };
}
