/**
 * # The block family
 *
 * Block, tactical block, penetration, breach, bypass, canalize, clear and the two
 * disrupts: a shaft or bracket with a one-letter designation set in a gap cut from
 * one of its lines.
 *
 * All three builders here do the same thing and differ only in *which* line the
 * gap goes in and how wide it is:
 *
 * | | line | gap width |
 * |---|---|---|
 * | {@link blockPaint} | the one crossing the shape's projected midpoint | the rendered glyph plus 4 px a side |
 * | {@link breachPaint} | the **last** sub-line — the opening side | a flat 10 px a side |
 * | {@link clearPaint} | sub-line `[4]` — the middle prong of the trident | a flat 10 px a side |
 *
 * **A graphic with no letter gets no gap.** The table 5-19 obstacle effects carry
 * no designation, and because these gaps are flat constants rather than measured
 * widths, an empty label would still break the line around nothing. The same goes
 * for a line too short on screen to carry its letter: the letter holds at the
 * legibility floor, then goes, and the line closes. @see blockLetterScale
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {
    HALO_WIDTH,
    LINE_WIDTH,
    RATIO_LOCKED_LABEL_FONT,
    RATIO_LOCKED_LABEL_FONT_PX,
    configuredLabelScale,
    getLabelHaloColor,
} from '../core/symbology';
import {textWidth, uprightRotation} from './decorations';
import {lineColorOf, labelColorOf, symbolLetterScale} from './paintFunctions';
import {letterGapClearance, letterInGapScale} from './labelFit';

type BlockPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/**
 * Downward nudge, in screen pixels per unit of label scale, that puts a capital
 * letter's *ink* on the line rather than its em box.
 *
 * `baseline: 'middle'` centers the font's em box on the anchor, not the capital's
 * ink, so the letter renders high and the line looks as if it passes below center.
 * Measured on the rendered glyph the error is 2.2 px per unit of scale — a
 * font-metric artifact, hence proportional. OpenLayers applies `offsetY` in raw
 * screen pixels and does **not** multiply it by `scale`, so the scale is applied
 * here.
 */
const OPTICAL_CENTER_PX_PER_SCALE = 2.2;

/** Flat half-gap used by breach and clear, in screen pixels. */
const FLAT_GAP_PX = 10;
/** Padding either side of a measured glyph, in screen pixels. */
const GLYPH_GAP_PADDING_PX = 4;

/**
 * The scale the family's letter is drawn at, or `0` for no letter and no gap, once the line
 * it interrupts is too short on screen to carry one. Asked once per paint and used for both
 * the letter and the gap, so the two always agree. @see letterInGapScale
 */
function blockLetterScale(feature: PaintFeature, context: PaintContext, label: string, p1: ProjectedPosition, p2: ProjectedPosition): number {
    if (!label) return 0;
    const desired = symbolLetterScale(feature, context, RATIO_LOCKED_LABEL_FONT_PX);
    const linePx = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / context.resolution;
    return letterInGapScale(desired, textWidth(context, label, RATIO_LOCKED_LABEL_FONT, 1), RATIO_LOCKED_LABEL_FONT_PX, linePx);
}

/** Every sub-line of the graphic's geometry. */
function subLines(feature: PaintFeature): ProjectedPosition[][] {
    const geometry = feature.geometry;
    if (geometry.type === 'MultiLineString') return geometry.coordinates;
    if (geometry.type === 'LineString') return [geometry.coordinates];
    return [];
}

/** The label mark set in a gap, with the optical-center correction applied. */
function gapLabel(
    feature: PaintFeature, at: ProjectedPosition,
    text: string,
    scale: number,
    rotation: number,
    opticalCenter: boolean,
): Paint {
    return {
        geometry: {type: 'Point', coordinates: at},
        text: {
            text,
            font: RATIO_LOCKED_LABEL_FONT,
            fill: labelColorOf(feature),
            halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
            rotation,
            align: 'center',
            baseline: 'middle',
            offsetYPx: opticalCenter ? OPTICAL_CENTER_PX_PER_SCALE * scale : undefined,
            scale,
        },
    };
}

/** Cuts a gap of `halfGapMap` meters at fraction `t` along `p1`→`p2`. */
function cutGap(
    p1: ProjectedPosition,
    p2: ProjectedPosition,
    t: number,
    halfGapMap: number,
): {before: ProjectedPosition[]; after: ProjectedPosition[]; middle: ProjectedPosition} {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const segLen = Math.hypot(dx, dy);
    const ratio = segLen === 0 ? 0 : halfGapMap / segLen;

    const gapA: ProjectedPosition = [p1[0] + dx * (t - ratio), p1[1] + dy * (t - ratio)];
    const gapB: ProjectedPosition = [p1[0] + dx * (t + ratio), p1[1] + dy * (t + ratio)];
    return {
        before: [p1, gapA],
        after: [gapB, p2],
        middle: [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2],
    };
}

/**
 * Breach, bypass and canalize: the gap goes in the **last** sub-line, which is the
 * bracket's opening side, and the letter stands upright rather than following it.
 */
export function breachPaint(label: string): BlockPaint {
    return (feature, context) => {
        const lines = subLines(feature);
        if (lines.length < 1) return [];

        const opening = lines[lines.length - 1];
        if (opening.length < 2) return [];

        const outline = lines.slice(0, -1);
        const paints: Paint[] = [];
        const scale = blockLetterScale(feature, context, label, opening[0], opening[1]);

        if (scale === 0) {
            outline.push([opening[0], opening[1]]);
        } else {
            const halfGapPx = letterGapClearance(FLAT_GAP_PX, scale, configuredLabelScale());
            const {before, after, middle} = cutGap(opening[0], opening[1], 0.5, halfGapPx * context.resolution);
            outline.push(before, after);
            paints.push(gapLabel(feature, middle, label, scale, 0, false));
        }

        paints.push({
            geometry: {type: 'MultiLineString', coordinates: outline},
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
        });
        return paints;
    };
}

/** Half the angle at a filled head's tip, in degrees, measured off 2525E 270502's Template. */
const FILLED_HEAD_HALF_ANGLE_DEG = 24;

/**
 * A `[barb, tip, barb]` open head as a closed, slimmer solid triangle of the same length.
 *
 * The generator's open heads spread 45° either side of the shaft. A filled triangle that
 * wide reads as a blob, so the barbs are drawn in toward the shaft until the tip angle
 * matches the filled heads the plate draws.
 */
function slimFilledHead(head: ProjectedPosition[]): ProjectedPosition[] | undefined {
    if (head.length !== 3) return undefined;
    const [left, tip, right] = head;
    const base: ProjectedPosition = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
    const length = Math.hypot(tip[0] - base[0], tip[1] - base[1]);
    const halfWidth = Math.hypot(left[0] - base[0], left[1] - base[1]);
    if (length === 0 || halfWidth === 0) return undefined;
    const k = (length * Math.tan((FILLED_HEAD_HALF_ANGLE_DEG * Math.PI) / 180)) / halfWidth;
    const pull = (p: ProjectedPosition): ProjectedPosition => [base[0] + (p[0] - base[0]) * k, base[1] + (p[1] - base[1]) * k];
    return [tip, pull(left), pull(right), tip];
}

/**
 * Clear and the two disrupts: the gap goes in sub-line `[4]`, the trident's middle
 * prong.
 *
 * `filledHeads` names the sub-lines that are arrowheads drawn solid. The obstacle effect
 * 270502 fills its three (APP-06, FM 1-02.2 Table 5-19, MIL-STD-2525E Table L-XVI); the
 * mission task 341000 leaves them open on every plate.
 *
 * `t` is where along that prong the letter sits — 0.6 for Clear, 0.75 for Disrupt,
 * which is what centers the "D" on the middle prong given that it spans 0.5 to 1.0
 * of the user's drawn base.
 */
export function clearPaint(label: string, t = 0.6, filledHeads: readonly number[] = []): BlockPaint {
    return (feature, context) => {
        const lines = subLines(feature);
        const mid = lines[4];
        if (!mid || mid.length < 2) return [];

        const outline = lines.filter((_, i) => i !== 4 && !filledHeads.includes(i));
        const paints: Paint[] = filledHeads.flatMap(i => {
            const head = lines[i] && slimFilledHead(lines[i]);
            if (!head) return [];
            const color = lineColorOf(feature);
            return [{geometry: {type: 'Polygon', coordinates: [head]}, fill: {color}, stroke: {color, widthPx: LINE_WIDTH()}} as Paint];
        });

        const scale = blockLetterScale(feature, context, label, mid[0], mid[1]);
        if (scale === 0) {
            outline.push([mid[0], mid[1]]);
        } else {
            const halfGapPx = letterGapClearance(FLAT_GAP_PX, scale, configuredLabelScale());
            const {before, after, middle} = cutGap(mid[0], mid[1], t, halfGapPx * context.resolution);
            outline.push(before, after);
            paints.push(gapLabel(feature, middle, label, scale, uprightRotation(mid[0], mid[1]), true));
        }

        paints.push({
            geometry: {type: 'MultiLineString', coordinates: outline},
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
        });
        return paints;
    };
}

/**
 * Block, tactical block and penetration: the gap goes in whichever segment crosses
 * the shape's **projected** midpoint, and is sized to the rendered glyph.
 *
 * "Projected" matters: each vertex is projected onto the straight line from the
 * first to the last, so the midpoint is measured along the graphic's own axis
 * rather than along its drawn path. A shaft that bends would otherwise put its
 * letter at the midpoint of the *path*, which is not where the eye reads the
 * middle of the symbol.
 */
export function blockPaint(label: string): BlockPaint {
    return (feature, context) => {
        const lines = subLines(feature);
        const coords = lines[0];
        if (!coords || coords.length < 2) return [];

        // Sub-lines after the first — a block's crossbar, for instance — are drawn
        // whole; only the shaft carries the gap.
        const outline: ProjectedPosition[][] = lines.slice(1);

        const start = coords[0];
        const end = coords[coords.length - 1];
        const baseDx = end[0] - start[0];
        const baseDy = end[1] - start[1];
        const baseLen = Math.hypot(baseDx, baseDy);
        /*
         * **A shaft of no length silences the shaft, not the symbol.** There is nothing to
         * measure a midpoint along and so nowhere to cut the letter gap, but the sub-lines
         * after it are whole lines that were placed and must still be drawn. This used to
         * `return []`, which made a block whose point 3 lands on the bar's own axis — no
         * perpendicular offset, so no horizontal line — disappear entirely, bar included,
         * on both engines. The bar is points 1 and 2; it does not stop existing because the
         * stem collapsed. @see Block.lines
         */
        if (baseLen === 0) {
            return outline.length
                ? [{geometry: {type: 'MultiLineString', coordinates: outline}, stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()}}]
                : [];
        }

        const projected = coords.map(([x, y]) => ((x - start[0]) * baseDx + (y - start[1]) * baseDy) / baseLen);
        const minProj = Math.min(...projected);
        const maxProj = Math.max(...projected);
        const span = maxProj - minProj;
        const normalized = projected.map(d => (span === 0 ? 0 : (d - minProj) / span));

        let midIndex = 0;
        for (let i = 0; i < normalized.length - 1; i++) {
            if (normalized[i] <= 0.5 && normalized[i + 1] >= 0.5) {
                midIndex = i;
                break;
            }
        }

        for (let i = 0; i < coords.length - 1; i++) {
            if (i !== midIndex) outline.push([coords[i], coords[i + 1]]);
        }

        const p1 = coords[midIndex];
        const p2 = coords[midIndex + 1];
        const denom = normalized[midIndex + 1] - normalized[midIndex];
        const t = denom === 0 ? 0.5 : (0.5 - normalized[midIndex]) / denom;

        const paints: Paint[] = [];

        const scale = blockLetterScale(feature, context, label, p1, p2);
        if (scale === 0) {
            outline.push([p1, p2]);
        } else {
            const halfGapMap =
                (textWidth(context, label, RATIO_LOCKED_LABEL_FONT, scale) / 2
                    + letterGapClearance(GLYPH_GAP_PADDING_PX, scale, configuredLabelScale()))
                * context.resolution;
            const {before, after, middle} = cutGap(p1, p2, t, halfGapMap);
            outline.push(before, after);
            paints.push(gapLabel(feature, middle, label, scale, uprightRotation(p1, p2), false));
        }

        paints.push({
            geometry: {type: 'MultiLineString', coordinates: outline},
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
        });
        return paints;
    };
}
