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
    getLabelHaloColor,
} from '../core/symbology';
import {textWidth, uprightRotation} from './decorations';
import {lineColorOf, scaleOf, labelColorOf} from './paintFunctions';

/** Clearance either side of the letter within its gap, in screen pixels. */
const GAP_PADDING_PX = 4;
/** Where along the first segment the gap is centered. */
const GAP_POSITION = 0.5;

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
export function retrogradeTaskPaint(label: string): (f: PaintFeature, c: PaintContext) => Paint[] {
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

        // Rendered with `RATIO_LOCKED_LABEL_FONT`, so the cap is told 24 rather than the
        // 16 it would otherwise assume. @see capLabelToGraphic
        const scale = scaleOf(feature, context, RATIO_LOCKED_LABEL_FONT_PX);
        const halfGapPx = label
            ? textWidth(context, label, RATIO_LOCKED_LABEL_FONT, scale) / 2 + GAP_PADDING_PX
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

        if (label) {
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
        }

        paints.push({
            geometry: {type: 'MultiLineString', coordinates: outlineSegments},
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
        });

        return paints;
    };
}
