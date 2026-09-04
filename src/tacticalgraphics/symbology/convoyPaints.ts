/**
 * # Convoy — APP-06 330100 / 330200, FM 1-02.2 table 5-18
 *
 * Two symbols, one body: a rectangle carrying the convoy's amplifiers, with something at
 * point 1 that says whether it is moving or halted.
 *
 * - **Moving** flares the body into a solid-looking block-arrow head whose barbs stand
 *   clear of the body, tip at point 1.
 * - **Halted** closes the body off square and sets a *hollow triangle* beyond it, apex
 *   against the body and base at point 1 — an arrow opening toward the place the convoy
 *   stopped, which is what its Orientation clause describes: "the arrow points to the
 *   location where the convoy has halted".
 *
 * **Neither is a plain line, and both were one until 2026-09-04.** They were switched off
 * in August on a note saying each "rendered as a `Phaseline`, which is the right shape";
 * the plates say a block arrow and a bodied open triangle. @see ai/excluded-graphics.md
 *
 * ## The whole symbol is a proportion of its run
 *
 * Both Size/Shape cells read *"points 1 and 2 determine the length of the symbol, **which
 * varies only in length**"*, and the first version took that as a screen constant across
 * the axis — a body 26 px tall whatever the convoy's length. **Resize then did nothing but
 * stretch it**, which is not what a resize means here. (User's call, 2026-09-04: *"resize
 * should wholesomely affect the shape and labels but labels should be capped".*)
 *
 * So every dimension is a share of the run, and the shares are the plate's own — a moving
 * convoy is 0.112 of its reach across the body and 0.254 along the head at any size, which
 * is what the Template measures. One consequence worth having: the neck can no longer be
 * driven behind the rear, because it sits at a fixed 0.75 of the run rather than a screen
 * size that a short drag could outgrow. The cap that used to guard against that is gone
 * with it.
 *
 * The outline is still synthesized here rather than in the generator, because the *labels*
 * have to be measured against it and a paint is where a glyph can be measured.
 */
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {paintLineWork} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicName} from '../core/type';
import {DECORATION_MIN_PX, offsetBelow, uprightRotation} from './decorations';
import {amplifierDash, amplifierText, labelColorOf, lineColorOf} from './paintFunctions';
import {capLabelToSpan} from './labelFit';
import {spanProportionalScale} from './movementPaints';
import {BASE_FONT_SIZE_PX} from '../core/config';

type LinePaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/*
 * The proportions, measured off the two Templates at 300 dpi by profiling the ink column
 * by column — the same method the `Defeat` arrows were measured with, and for the same
 * reason: a low-resolution plate read by eye gives a shape that is plausible rather than
 * right.
 *
 *                       moving (330100)        halted (330200)
 *   reach                448 px                 483 px
 *   body half-height      50                     60
 *   head / triangle len  114                    101
 *   head / tri half-wid   77.5                  101
 *
 * Both halves of each pair are kept: the body against the **reach**, so the symbol scales
 * whole, and the head against the **body**, so the two stay in the relationship the plate
 * draws them in however either is derived.
 */
/** Half the body's height, as a share of the run. 50/448 and 60/483. */
const MOVING_BODY_SHARE = 0.112;
const HALTED_BODY_SHARE = 0.124;

/** Moving convoy: head length, as a multiple of the body's half-height. 114/50. */
const MOVING_HEAD_LEN_RATIO = 2.28;
/** Moving convoy: half the head's width across the axis. 77.5/50 — the barbs stand clear. */
const MOVING_HEAD_HALF_RATIO = 1.55;
/** Halted convoy: the open triangle's length. 101/60. */
const HALTED_TRIANGLE_LEN_RATIO = 1.68;
/** Halted convoy: half the triangle's base. Equal to its length on the plate. */
const HALTED_TRIANGLE_HALF_RATIO = 1.68;

/** Where fields `V` and `H` sit along the body, as fractions of its length. */
const FIELD_V_ALONG = 0.2;
const FIELD_H_ALONG = 0.8;

/** Clearance between the body's lower rail and the date-time group under it, screen pixels. */
const DATE_GAP_PX = 6;

/** The run, rear to tip. A convoy has exactly two anchor points. */
function ends(feature: PaintFeature): [ProjectedPosition, ProjectedPosition] | null {
    const path = paintLineWork(feature.geometry)[0];
    if (!path || path.length < 2) return null;
    return [path[0], path[path.length - 1]];
}

/**
 * Moving convoy (330100) and halted convoy (330200).
 *
 * The base arrives rear-first: both plates number point 1 as the tip, so both are in
 * `TIP_FIRST_GRAPHICS` and `TacticalGraphicsBase.generate` has already reversed the drawn
 * line by the time the geometry reaches here. `from` below is therefore point 2.
 */
export function convoyPaint(name: TacticalGraphicName): LinePaint {
    const halted = name === TacticalGraphicName.HaltedConvoy;

    return (feature, context) => {
        const run = ends(feature);
        if (!run) return [];
        const [from, to] = run;

        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        const length = Math.hypot(dx, dy);
        if (length === 0) return [];
        const u: ProjectedPosition = [dx / length, dy / length];
        const v: ProjectedPosition = [-u[1], u[0]];

        const res = context.resolution;
        const headRatio = halted ? HALTED_TRIANGLE_LEN_RATIO : MOVING_HEAD_LEN_RATIO;
        const headHalfRatio = halted ? HALTED_TRIANGLE_HALF_RATIO : MOVING_HEAD_HALF_RATIO;

        // Everything from the run, so the symbol keeps the plate's proportions at any size.
        const bodyHalf = length * (halted ? HALTED_BODY_SHARE : MOVING_BODY_SHARE);
        const headLen = bodyHalf * headRatio;
        const headHalf = bodyHalf * headHalfRatio;

        // Under the visibility floor the outline is texture on a stroke rather than a
        // symbol; a bare run is the honest thing to draw. @see DECORATION_MIN_PX
        const bodyHalfPx = bodyHalf / res;
        if (bodyHalfPx < DECORATION_MIN_PX) {
            return [{
                geometry: {type: 'LineString', coordinates: [from, to]},
                stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)},
            }];
        }

        /** A point `along` metres from the rear and `across` metres to its left. */
        const at = (along: number, across: number): ProjectedPosition =>
            [from[0] + u[0] * along + v[0] * across, from[1] + u[1] * along + v[1] * across];

        const neck = length - headLen;
        const stroke = {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)};
        const paints: Paint[] = [];

        if (halted) {
            // The body is closed off square, and the triangle stands beyond it as its own
            // ring: the plate draws the body's leading edge *and* the triangle's apex on it.
            paints.push({
                geometry: {type: 'LineString', coordinates: [
                    at(0, bodyHalf), at(neck, bodyHalf), at(neck, -bodyHalf), at(0, -bodyHalf), at(0, bodyHalf),
                ]},
                stroke,
            });
            paints.push({
                geometry: {type: 'LineString', coordinates: [
                    at(neck, 0), at(length, headHalf), at(length, -headHalf), at(neck, 0),
                ]},
                stroke,
            });
        } else {
            // One continuous outline: body rails, barbs, tip, and back.
            paints.push({
                geometry: {type: 'LineString', coordinates: [
                    at(0, bodyHalf), at(neck, bodyHalf), at(neck, headHalf), at(length, 0),
                    at(neck, -headHalf), at(neck, -bodyHalf), at(0, -bodyHalf), at(0, bodyHalf),
                ]},
                stroke,
            });
        }

        const rotation = uprightRotation(from, to);
        /*
         * **The labels scale with the symbol, and are then capped.**
         *
         * `spanProportionalScale` is the movement family's rule — text locked to the
         * segment's on-screen span rather than to the zoom — and it already carries the
         * ceiling `maxGraphicLabelScale()` that the ratio-locked mission tasks and the block
         * family stop at. Measured against the **body**, not the whole run, because that is
         * the channel `V` and `H` have to sit inside.
         *
         * **Not narrowed by `scaleOf`**, and that is the whole difference between a label
         * that resizes and one that does not. `scaleOf` returns the host's configured size —
         * 1 at the default — so a `Math.min` of the two pins the text at 1 whatever the
         * convoy does, which is the behaviour being replaced. The twelve movement graphics
         * that already scale this way take `spanProportionalScale` alone for the same
         * reason; the host's setting still reaches it, through the ceiling.
         * @see capLabelToSpan, which each block then narrows to the room it actually has
         */
        const scale = spanProportionalScale(from, at(neck, 0), res, BASE_FONT_SIZE_PX);
        const text = (
            position: ProjectedPosition,
            value: string,
            baseline: 'middle' | 'top',
            at: number = scale,
        ): Paint => ({
            geometry: {type: 'Point', coordinates: position},
            text: {
                text: value,
                font: fontStyle,
                fill: labelColorOf(feature),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                rotation,
                align: 'center',
                baseline,
                scale: at,
                // Every one of these is something an operator typed, so all three answer to
                // "hide amplifiers". Nothing on a convoy is doctrinal text -- unlike the
                // bearing lines, whose letter *is* the symbol. @see bearingLinePaint
                kind: 'amplifier',
            },
        });

        /*
         * Field `V` is the equipment type -- `M1A2` in 330100's Example, `M915` in 330200's
         * -- and this library files V under `weapon`. @see ai/conformance/README.md, the
         * letter mapping. Field `H` is the additional information beside it.
         */
        const weapon = amplifierText(feature, String(feature.properties.weapon ?? '').trim());
        const info = amplifierText(feature, String(feature.properties.additionalInfo ?? '').trim());
        // Half the body each, so the two cannot meet in the middle however long either is.
        const insideScale = (value: string) =>
            capLabelToSpan(context, value, fontStyle, scale, (neck / res) / 2);
        if (weapon) paints.push(text(at(neck * FIELD_V_ALONG, 0), weapon, 'middle', insideScale(weapon)));
        if (info) paints.push(text(at(neck * FIELD_H_ALONG, 0), info, 'middle', insideScale(info)));

        /*
         * `W - W1` hangs under the body, centred on it -- the same "start - end" join every
         * other date-time group in the library makes, and the same one both Examples print
         * (`240500ZMAY2026 - 260800ZMAY2026`).
         */
        const start = amplifierText(feature, (feature.properties.startDate ?? '').trim());
        const end = amplifierText(feature, (feature.properties.endDate ?? '').trim());
        const dates = start && end ? `${start} - ${end}` : start || end;
        /*
         * **`offsetBelow`, not a negative `across`.** The left normal flips when the same
         * convoy is drawn east-to-west, which would put the dates above the body on half
         * the bearings — and `uprightRotation` has already turned the text the right way
         * up, so nothing else would give it away. "Below" is normalized against the map's
         * north there, which is the only definition that holds. @see offsetAbove
         */
        const under = offsetBelow(at(neck / 2, 0), from, to, res, bodyHalfPx + DATE_GAP_PX * scale);
        // The date-time group has the whole body to run under, and nothing beside it.
        if (dates) paints.push(text(under, dates, 'top', capLabelToSpan(context, dates, fontStyle, scale, neck / res)));

        return paints;
    };
}
