/**
 * # Keeping an area's label inside the area
 *
 * A label's scale is *zoom-anchored*: `labelScale` grows it as you zoom in and clamps it as
 * you zoom out, so the text stays readable. The shape it sits in has no such floor — it is
 * ground, and ground shrinks with the zoom. Put the two together and every centred label
 * eventually overruns the outline it belongs to, which is what a 15 px area in the sample
 * gallery looks like: a name three times wider than the box under it.
 *
 * So the scale needs a second cap, from the shape rather than the zoom. This module is that
 * cap. It is deliberately the *same shape* of answer as `fitSymbolScale`, which solves the
 * identical problem for a glyph: start from what you want, then shrink until every sample
 * point of the mark is genuinely inside the ring.
 *
 * **A ring, not a bounding box.** A concave notch is inside the box and outside the outline,
 * and the areas an operator traces are frequently concave — so the test is `pointInRing`,
 * and the samples include the block's edge midpoints as well as its corners, because a text
 * box can straddle a notch without either of its corners being in one.
 *
 * @see fitSymbolScale — the same bargain for the glyph half of a symbol.
 */

import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {BASE_FONT_SIZE_PX} from '../core/config';
import {pointInRing} from './symbolFit';
import {textWidth} from './decorations';

/**
 * Line height as a multiple of the font size, for a text mark that carries newlines.
 *
 * A renderer lays multi-line text out itself, so this is an estimate of what it will do
 * rather than a number anything obeys. It errs high: over-estimating the block makes the
 * label a little smaller than it had to be, and under-estimating lets it out of the shape,
 * which is the failure being fixed.
 */
const LINE_HEIGHT = 1.32;

/** Share of the shape the label may fill before it is shrunk. */
const LABEL_FIT_SHARE = 0.9;

/**
 * How many halvings the search takes. Twenty gets within a millionth of the answer, which is
 * far finer than a pixel and costs eight `pointInRing` calls apiece on a shape of a few
 * dozen vertices.
 *
 * A **search**, not the geometric shrink `fitSymbolScale` uses. That form has a floor —
 * twenty-four steps of 0.92 bottoms out at 14% of what you asked for — and a designation
 * twenty characters long in a box sixty pixels wide needs 7%. The floor was the reason the
 * first version of this cap looked like it did nothing.
 */
const SEARCH_STEPS = 20;

/** The eight points of a box that have to be inside the ring, as fractions of its halves. */
const BOX_SAMPLES: readonly [number, number][] = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
];

/**
 * The largest scale at or below `desired` at which a text block centred on `at` still sits
 * inside the feature's ring.
 *
 * Returns `desired` untouched when there is no ring to measure against — a line graphic's
 * label, or a feature a renderer has not stamped yet. A label that shrinks to nothing
 * because the shape was not supplied is worse than one that overruns.
 *
 * @param lines   the block's lines, exactly as they will be rendered
 * @param font    the font string the text is drawn with — **the same one**, or the
 *                measurement describes a different label
 * @param offsetYPx vertical offset of the block from `at`, in screen pixels, if any
 */
export function fitLabelScale(
    feature: PaintFeature,
    context: PaintContext,
    at: ProjectedPosition,
    lines: readonly string[],
    font: string,
    desired: number,
    offsetYPx = 0,
): number {
    const ring = feature.ring;
    const drawn = lines.filter(line => line.trim().length > 0);
    if (!ring || ring.length < 3 || !drawn.length || !(desired > 0)) return desired;

    // Half-extents at scale 1, in screen pixels.
    const halfWidthPx = Math.max(...drawn.map(line => textWidth(context, line, font, 1))) / 2;
    const halfHeightPx = (drawn.length * BASE_FONT_SIZE_PX * LINE_HEIGHT) / 2;
    if (!(halfWidthPx > 0) || !(halfHeightPx > 0)) return desired;

    const fits = (scale: number) => {
        const halfW = halfWidthPx * scale * context.resolution * (1 / LABEL_FIT_SHARE);
        const halfH = halfHeightPx * scale * context.resolution * (1 / LABEL_FIT_SHARE);
        const cy = at[1] - offsetYPx * scale * context.resolution;
        return BOX_SAMPLES.every(([u, v]) => pointInRing(ring, [at[0] + u * halfW, cy + v * halfH]));
    };

    if (fits(desired)) return desired;

    let low = 0;
    let high = desired;
    for (let i = 0; i < SEARCH_STEPS; i++) {
        const mid = (low + high) / 2;
        if (fits(mid)) low = mid;
        else high = mid;
    }
    return low;
}

/**
 * The same feature with its anchor raised by `metres`.
 *
 * Both areas that carry a centre glyph — the CBRN triangle, the airfield zone's crossed
 * runways — draw their designation from the ordinary area block, which anchors on the
 * shape's interior point. That is exactly where the glyph is, so the two were drawn through
 * each other.
 *
 * **In metres, not pixels, and applied by the glyph's own paint.** A fixed screen offset
 * cannot clear a mark whose size is solved for at draw time: the CBRN triangle is fitted to
 * whatever area it landed in, so the only code that knows how tall it came out is the code
 * that fitted it. A 30 px lift clears the glyph on a small area and sits inside it on a
 * large one, which was the first attempt at this.
 */
export function liftedAnchor(feature: PaintFeature, metres: number): PaintFeature {
    if (feature.geometry.type !== 'Point' || !metres) return feature;
    const [x, y] = feature.geometry.coordinates;
    return {...feature, geometry: {type: 'Point', coordinates: [x, y + metres]}};
}
