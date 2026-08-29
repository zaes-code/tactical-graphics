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
 * Share of a graphic's own on-screen size a label may stand.
 *
 * **The share is the ratio you see.** Measured against the same dimension, a cap of
 * `share x sizePx` produces text exactly `share` as tall as the graphic — so this number is
 * not a knob, it is the answer to "how big should a label look next to its symbol". 0.25 is
 * what the avenue of approach and the counterattack already measure at (0.23), which are
 * the two the user named as correct; the graphics complained about measured 0.34 to 0.80.
 *
 * It is a different number from {@link LABEL_SPAN_SHARE} because it is measured against a
 * different thing — the whole graphic rather than one span inside it — and conflating the
 * two is how a cap ends up never biting. (User's call, 2026-08-29.)
 */
export const LABEL_GRAPHIC_SHARE = 0.25;

/**
 * How elongated a graphic may be before its *thickness* stops being what a label is
 * compared against.
 *
 * A square area is judged by its side. A route ten times longer than it is thick is judged
 * by its run — nobody reads a designation as too big because it is taller than the line is
 * wide. Past 2:1 the smaller dimension is therefore replaced by half the larger, which is
 * what the shape would measure if it *were* 2:1.
 *
 * Without this a horizontal line, whose minor extent is zero, caps every label to nothing.
 */
const CAP_MAX_ASPECT = 2;

/**
 * Caps a label at a share of the on-screen size of the graphic it belongs to.
 *
 * The general rule behind every label size in this library: **a label may not outgrow its
 * own symbol.** A zoom-anchored scale floors at 0.3 of the configured label size so text
 * stays readable, and the graphic under it has no floor at all — it is ground, and ground
 * shrinks with the zoom. Zoomed out far enough, every such label is standing on a symbol
 * smaller than itself.
 *
 * Needs {@link PaintFeature.bounds}, which is the graphic's extent stamped by the holder,
 * *because a label feature is a bare anchor point and does not know the shape it labels*.
 * Absent, the desired scale passes through untouched — so a graphic whose bounds nobody
 * stamps behaves exactly as it did before.
 *
 * A cap, never a raise. @see capLabelToSpan for the same bargain against one span.
 */
export function capLabelToGraphic(
    desired: number,
    feature: PaintFeature,
    context: PaintContext,
    share: number = LABEL_GRAPHIC_SHARE,
): number {
    const bounds = feature.bounds;
    if (!bounds || !(desired > 0)) return desired;

    const widthPx = (bounds.maxX - bounds.minX) / context.resolution;
    const heightPx = (bounds.maxY - bounds.minY) / context.resolution;
    const longer = Math.max(widthPx, heightPx);
    if (!(longer > 0)) return desired;

    const sizePx = Math.max(Math.min(widthPx, heightPx), longer / CAP_MAX_ASPECT);
    return Math.min(desired, (share * sizePx) / BASE_FONT_SIZE_PX);
}

/**
 * Share of a graphic's own on-screen size a label may span before it is shrunk.
 *
 * **0.7 is not a new number.** `spanProportionalScale` has used it since the avenue of
 * approach was built, and the counterattack was moved onto it on 2026-08-27 at the user's
 * direction, for this exact complaint: *"the zoom-anchored scale does not shrink with the
 * arrow, so a small counterattack carried a full-size designation"*. Measured on the sample
 * sweep, those two hold a text-to-graphic ratio of 0.23 at every zoom while everything on
 * the zoom-anchored scale climbs from 0.26 to 0.34, and from 0.62 to 0.80 for the worst of
 * them. So the ratio that reads correctly is already known; what was missing is applying it
 * anywhere else.
 */
export const LABEL_SPAN_SHARE = 0.7;

/**
 * Caps a label's scale at a share of the on-screen size of the thing it labels.
 *
 * **A cap, not a scale.** It takes the scale the graphic already wanted and only ever
 * lowers it, so nothing changes at the zoom a graphic was drawn at — the cap bites exactly
 * when the shape has shrunk under the label, which is the case being fixed. Pair it with
 * {@link fitLabelScale} rather than replacing it: that one keeps a label inside a *ring*,
 * this one keeps it in proportion to a *span*, and an area wants both.
 *
 * Measured against the label's own width, because that is the dimension that overruns: a
 * designation at each end of a short line is what makes the sweep read `BCLBCL` with no gap
 * between the two, and the height was never the problem there. For a mark whose height is
 * what has to fit — a letter inside an arrowhead — `spanProportionalScale` remains the
 * right call, and this returns the same answer for a single character anyway.
 *
 * `spanPx` is whatever the label must stay in proportion to, in screen pixels: a leg's
 * length for text along it, a corridor's width for text between its rails, an arrow's span
 * for the letter it carries. Zero or missing means "nothing to measure against", and the
 * desired scale passes through untouched.
 */
export function capLabelToSpan(
    context: PaintContext,
    value: string,
    font: string,
    desired: number,
    spanPx: number,
    share: number = LABEL_SPAN_SHARE,
): number {
    if (!(spanPx > 0) || !(desired > 0)) return desired;
    // The widest line, so a multi-line block is capped by the line that overruns first.
    const naturalPx = Math.max(...value.split('\n').map(line => textWidth(context, line, font, 1)));
    if (!(naturalPx > 0)) return desired;
    return Math.min(desired, (spanPx * share) / naturalPx);
}

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
export function liftedAnchor(feature: PaintFeature, metres: number, padMetres = 0): PaintFeature {
    if (feature.geometry.type !== 'Point' || !metres) return feature;
    const [x, y] = feature.geometry.coordinates;

    // **Clamped to the ring**, and this is not a nicety. The lift is a glyph height plus a
    // screen-pixel clearance, and a screen constant is metres at whatever the current
    // resolution is: 30 px is 60 km zoomed out far enough. On a squat area that sum lands the
    // anchor *above* the shape, at which point `fitLabelScale` correctly reports that no
    // scale fits and the designation disappears — a worse failure than the overlap the lift
    // exists to fix. Rising only as far as the outline allows costs the label some room and
    // keeps it on the map.
    const ring = feature.ring;
    const inside = (l: number) => pointInRing(ring!, [x, y + l + padMetres]);
    let lift = metres;
    if (ring && ring.length >= 3 && !inside(lift)) {
        let low = 0;
        let high = lift;
        for (let i = 0; i < SEARCH_STEPS; i++) {
            const mid = (low + high) / 2;
            if (inside(mid)) low = mid;
            else high = mid;
        }
        lift = low;
    }
    if (!lift) return feature;
    return {...feature, geometry: {type: 'Point', coordinates: [x, y + lift]}};
}
