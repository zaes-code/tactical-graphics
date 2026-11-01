/**
 * # The retrograde tasks
 *
 * Delay, disengage, retire, withdraw, withdraw under pressure, retirement — the
 * cane-shaped route graphics — and abatis, which shares the shape but carries no
 * letter.
 *
 * The route is drawn with a gap carved out of the middle of its first segment,
 * and the task's one- or two-letter designation sits in that gap.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {
    HALO_WIDTH,
    LINE_WIDTH,
    RATIO_LOCKED_LABEL_FONT,
    RATIO_LOCKED_LABEL_FONT_PX,
    configuredLabelScale,
    fontStyle,
    getLabelHaloColor,
} from '../core/symbology';
import {TacticalGraphicName} from '../core/type';
import {textWidth, uprightRotation} from './decorations';
import {amplifierText, lineColorOf, scaleOf, labelColorOf} from './paintFunctions';
import {letterGapClearance, letterInGapScale} from './labelFit';

/** Clearance either side of the letter within its gap, in screen pixels. */
const GAP_PADDING_PX = 4;
/** Where along the first segment the gap is centered. */
const GAP_POSITION = 0.5;

/**
 * The retrograde tasks whose plate boxes a `W` above the straight run.
 *
 * MIL-STD-2525E 340800 sets `W` over the `D` of delay; APP-06 344100 and 344200 box it above
 * the line between the `P(F)` / `P(R)` and the arrowhead. The rest of the family letter no
 * date, so a `startDate` arriving on an imported withdraw is not drawn.
 */
export const RETROGRADE_DATED_GRAPHICS: ReadonlySet<TacticalGraphicName> = new Set([
    TacticalGraphicName.Delay,
    TacticalGraphicName.ForwardPassageOfLines,
    TacticalGraphicName.RearwardPassageOfLines,
]);

/** Clearance between the letter's top and the date above it, in screen pixels. */
const DATE_CLEARANCE_PX = 4;

/**
 * The scale a retrograde task's letter is drawn at, or `0` for no letter and no gap, once
 * the graphic is too small on screen to carry one. @see letterInGapScale
 *
 * Measured against the **whole graphic** (its stamped extent, or `segmentPx` when there is
 * none), not the first segment the letters sit in: measured by the segment, disengage's three
 * letters went at a size that has always carried them.
 */
function retrogradeLetterScale(feature: PaintFeature, context: PaintContext, label: string, segmentPx: number): number {
    if (!label) return 0;
    // Rendered with `RATIO_LOCKED_LABEL_FONT`, so the cap is told 24 rather than the
    // 16 it would otherwise assume. @see capLabelToGraphic
    const desired = scaleOf(feature, context, RATIO_LOCKED_LABEL_FONT_PX);
    const b = feature.bounds;
    const graphicPx = b ? Math.max(b.maxX - b.minX, b.maxY - b.minY) / context.resolution : segmentPx;
    return letterInGapScale(desired, textWidth(context, label, RATIO_LOCKED_LABEL_FONT, 1), RATIO_LOCKED_LABEL_FONT_PX, graphicPx);
}

/**
 * A retrograde task: the route, with the designation set in a gap cut from the
 * middle of its first segment.
 *
 * **The gap is sized to the rendered glyph, and a graphic with no letter gets no
 * gap at all.** Abatis is in this family and has no doctrinal designation; leaving
 * the bare padding in place put a visible nick in an otherwise continuous route,
 * which reads as a drawing error rather than as a symbol.
 *
 * The label lies along the segment whose gap holds it. `uprightRotation` flips it
 * through 180 degrees when that segment points left, so it never renders upside
 * down however the user drew the route.
 */
export function retrogradeTaskPaint(label: string, name?: TacticalGraphicName): (f: PaintFeature, c: PaintContext) => Paint[] {
    const dated = name !== undefined && RETROGRADE_DATED_GRAPHICS.has(name);
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];
        const coords = geometry.coordinates;
        const baseLine = coords[0];
        if (!baseLine || baseLine.length < 2) return [];

        // Sub-line [0] is the segment the gap is cut from; everything else is drawn
        // whole. Collected first so the two side pieces can be appended below.
        const outlineSegments: ProjectedPosition[][] = coords.slice(1).map(line => line);

        const p1 = baseLine[0];
        const p2 = baseLine[1];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);
        if (segLen === 0) return [];

        const scale = retrogradeLetterScale(feature, context, label, segLen / context.resolution);
        const halfGapPx = scale > 0
            ? textWidth(context, label, RATIO_LOCKED_LABEL_FONT, scale) / 2 + letterGapClearance(GAP_PADDING_PX, scale, configuredLabelScale())
            : 0;
        const gapRatio = (halfGapPx * context.resolution) / segLen;

        const gapA: ProjectedPosition = [
            p1[0] + dx * (GAP_POSITION - gapRatio),
            p1[1] + dy * (GAP_POSITION - gapRatio),
        ];
        const gapB: ProjectedPosition = [
            p1[0] + dx * (GAP_POSITION + gapRatio),
            p1[1] + dy * (GAP_POSITION + gapRatio),
        ];
        outlineSegments.push([p1, gapA], [gapB, p2]);

        const paints: Paint[] = [];

        if (scale > 0) {
            paints.push({
                geometry: {type: 'Point', coordinates: [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2]},
                text: {
                    text: label,
                    font: RATIO_LOCKED_LABEL_FONT,
                    fill: labelColorOf(feature),
                    halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                    rotation: uprightRotation(p1, p2),
                    align: 'center',
                    baseline: 'middle',
                    scale,
                },
            });

            // W above the letter, on the screen-up side of the run and laid along it.
            const date = dated ? amplifierText(feature, (feature.properties.startDate ?? '').trim()) : '';
            if (date) {
                const dateScale = scaleOf(feature, context);
                const liftPx = (RATIO_LOCKED_LABEL_FONT_PX * scale) / 2 + DATE_CLEARANCE_PX + (16 * dateScale) / 2;
                let nx = -dy / segLen;
                let ny = dx / segLen;
                if (ny < 0) {
                    nx = -nx;
                    ny = -ny;
                }
                const mid: ProjectedPosition = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];
                paints.push({
                    geometry: {
                        type: 'Point',
                        coordinates: [mid[0] + nx * liftPx * context.resolution, mid[1] + ny * liftPx * context.resolution],
                    },
                    text: {
                        text: date,
                        kind: 'amplifier',
                        font: fontStyle,
                        fill: labelColorOf(feature),
                        halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                        rotation: uprightRotation(p1, p2),
                        align: 'center',
                        baseline: 'middle',
                        scale: dateScale,
                    },
                });
            }
        }

        paints.push({
            geometry: {type: 'MultiLineString', coordinates: outlineSegments},
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
        });

        return paints;
    };
}
