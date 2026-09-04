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
 * ## Everything across the axis is a screen size
 *
 * Both Size/Shape cells read *"points 1 and 2 determine the length of the symbol, **which
 * varies only in length**"* — so the body height, the head and the triangle are constants
 * and the run is the only thing the anchor points set. That is the same rule the maritime
 * lines follow, and the reason the whole outline is synthesized here rather than in the
 * generator: a metre size baked into the GeoJSON is a different symbol at every zoom.
 */
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {paintLineWork} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicName} from '../core/type';
import {DECORATION_MIN_PX, offsetBelow, uprightRotation} from './decorations';
import {amplifierDash, amplifierText, labelColorOf, lineColorOf, scaleOf} from './paintFunctions';

type LinePaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/**
 * Half the body's height, in screen pixels — **the one number chosen here**; every other
 * dimension below is a measured ratio of it.
 *
 * 13 px puts a 26 px channel between the body's rails, which is what field `V` and field
 * `H` need to sit inside it at the library's 16 px base font without touching the line
 * work. The plate cannot supply an absolute: its Template is a drawing at an arbitrary
 * size, so what it supplies is the *proportions*.
 */
const CONVOY_BODY_HALF_PX = 13;

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
 * Expressed against the body's own half-height, which is what makes them independent of
 * how big the draughtsman drew each plate:
 */
/** Moving convoy: head length, as a multiple of the body's half-height. 114/50. */
const MOVING_HEAD_LEN_RATIO = 2.28;
/** Moving convoy: half the head's width across the axis. 77.5/50 — the barbs stand clear. */
const MOVING_HEAD_HALF_RATIO = 1.55;
/** Halted convoy: the open triangle's length. 101/60. */
const HALTED_TRIANGLE_LEN_RATIO = 1.68;
/** Halted convoy: half the triangle's base. Equal to its length on the plate. */
const HALTED_TRIANGLE_HALF_RATIO = 1.68;

/**
 * The most of the run the head may take before the whole symbol is shrunk to fit.
 *
 * Without it a short drag puts the neck *behind* the rear and the outline turns inside
 * out. The cap shrinks the head and the body together rather than the head alone, because
 * a full-height body with a stunted head is a third picture that is neither plate.
 */
const CONVOY_MAX_HEAD_SHARE = 0.4;

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

        // One factor for the whole symbol, so the two plates' proportions survive the cap.
        const wantedHeadPx = CONVOY_BODY_HALF_PX * headRatio;
        const fit = Math.min(1, (length / res) * CONVOY_MAX_HEAD_SHARE / wantedHeadPx);
        const bodyHalfPx = CONVOY_BODY_HALF_PX * fit;
        // Under the visibility floor the outline is texture on a stroke rather than a
        // symbol; a bare run is the honest thing to draw. @see DECORATION_MIN_PX
        if (bodyHalfPx < DECORATION_MIN_PX) {
            return [{
                geometry: {type: 'LineString', coordinates: [from, to]},
                stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)},
            }];
        }

        const bodyHalf = bodyHalfPx * res;
        const headLen = bodyHalfPx * headRatio * res;
        const headHalf = bodyHalfPx * headHalfRatio * res;

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
        const scale = scaleOf(feature, context);
        const text = (position: ProjectedPosition, value: string, baseline: 'middle' | 'top'): Paint => ({
            geometry: {type: 'Point', coordinates: position},
            text: {
                text: value,
                font: fontStyle,
                fill: labelColorOf(feature),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                rotation,
                align: 'center',
                baseline,
                scale,
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
        if (weapon) paints.push(text(at(neck * FIELD_V_ALONG, 0), weapon, 'middle'));
        if (info) paints.push(text(at(neck * FIELD_H_ALONG, 0), info, 'middle'));

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
        if (dates) paints.push(text(under, dates, 'top'));

        return paints;
    };
}
