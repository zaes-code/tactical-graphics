/**
 * # The linear targets
 *
 * Linear target, linear smoke target and final protective fire: a stretchable
 * middle with a perpendicular cap at each end — an "H" lying on its side — with
 * the designation above the line and a stack of amplifiers below it.
 *
 * One builder, three names, differing only in what goes in the stack.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicName} from '../core/type';
import {offsetAbove, offsetBelow, uprightRotation} from './decorations';
import {amplifierDash, getFullLabel, lineColorOf, scaleOf, labelColorOf} from './paintFunctions';

/** Half-height of the end caps, in screen pixels **at the drawing resolution**. */
const BAR_HALF_PX = 14;
/** Gap between the line and the nearest edge of a label. */
const LABEL_GAP_PX = 8;
/**
 * Extra push on the first below-line label.
 *
 * `baseline: 'bottom'` — used by the name above the line — reserves descender
 * space below the baseline, so a name with no descenders floats further from the
 * line than its anchor suggests. The labels below use `baseline: 'top'`, which
 * sits right at the anchor with no equivalent reserve, so without this the gap
 * below looks tighter than the gap above.
 */
const DESCENDER_COMPENSATE_PX = 4;
/** Vertical spacing between stacked below-line labels. */
const LINE_HEIGHT_PX = 20;

/**
 * The shared body: the sideways H, the designation above, and a stack below.
 *
 * **The end caps are sized against `drawingResolution`, not the current one.**
 * That makes them a fixed size in *map units* once drawn, so they scale with the
 * map like the rest of the symbol rather than holding a constant screen size. It
 * is deliberately unlike the decorations elsewhere in this module, and matches
 * what the graphic did before the port.
 */
function linearTargetPaints(
    feature: PaintFeature,
    context: PaintContext,
    nameLabel: string,
    belowLines: string[],
): Paint[] {
    const geometry = feature.geometry;
    if (geometry.type !== 'LineString') return [];
    const coords = geometry.coordinates;
    if (coords.length < 2) return [];

    const start = coords[0];
    const end = coords[coords.length - 1];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return [];

    const ux = dx / len;
    const uy = dy / len;
    // Counter-clockwise perpendicular unit vector.
    const px = -uy;
    const py = ux;

    const drawRes = feature.drawingResolution ?? context.resolution;
    const barHalfMap = BAR_HALF_PX * drawRes;

    const startTop: ProjectedPosition = [start[0] + px * barHalfMap, start[1] + py * barHalfMap];
    const startBottom: ProjectedPosition = [start[0] - px * barHalfMap, start[1] - py * barHalfMap];
    const endTop: ProjectedPosition = [end[0] + px * barHalfMap, end[1] + py * barHalfMap];
    const endBottom: ProjectedPosition = [end[0] - px * barHalfMap, end[1] - py * barHalfMap];
    const center: ProjectedPosition = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];

    const paints: Paint[] = [{
        geometry: {
            type: 'MultiLineString',
            coordinates: [[start, end], [startTop, startBottom], [endTop, endBottom]],
        },
        stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)},
    }];

    const rotation = uprightRotation(start, end);
    const scale = scaleOf(feature, context);

    const text = (at: ProjectedPosition, value: string, baseline: 'top' | 'bottom'): Paint => ({
        geometry: {type: 'Point', coordinates: at},
        text: {
            text: value,
            font: fontStyle,
            fill: labelColorOf(feature),
            halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
            rotation,
            align: 'center',
            baseline,
            scale,
        },
    });

    if (nameLabel) {
        paints.push(text(offsetAbove(center, start, end, context.resolution, LABEL_GAP_PX), nameLabel, 'bottom'));
    }

    belowLines.forEach((line, i) => {
        if (!line) return;
        const offsetPx = LABEL_GAP_PX + DESCENDER_COMPENSATE_PX * scale + i * LINE_HEIGHT_PX * scale;
        paints.push(text(offsetBelow(center, start, end, context.resolution, offsetPx), line, 'top'));
    });

    return paints;
}

/** Linear target: designation above the line, nothing below. */
export function linearTargetPaint(name: TacticalGraphicName): (f: PaintFeature, c: PaintContext) => Paint[] {
    return (feature, context) =>
        linearTargetPaints(feature, context, getFullLabel(name, feature.properties.designation ?? ''), []);
}

/** Linear smoke target: as above, with "SMOKE" below the line. */
export function linearSmokeTargetPaint(name: TacticalGraphicName): (f: PaintFeature, c: PaintContext) => Paint[] {
    return (feature, context) =>
        linearTargetPaints(feature, context, getFullLabel(name, feature.properties.designation ?? ''), ['SMOKE']);
}

/**
 * Final protective fire: the **name alone** on top — no prefix — with "FPF", the
 * secondary designation and the weapon stacked underneath.
 *
 * The prefix placement is the one thing that distinguishes it from its two
 * siblings: `getLabel` returns "FPF", but the plate puts that word in the stack
 * below rather than beside the name, so the top line is the user's text only.
 */
export function finalProtectiveFirePaint(): (f: PaintFeature, c: PaintContext) => Paint[] {
    return (feature, context) => {
        const {designation, secondDesignation, weapon} = feature.properties;
        const belowLines = ['FPF', secondDesignation ?? '', weapon ?? ''].filter(s => s.length > 0);
        // Not trimmed: matching the original exactly, so the port cannot change what
        // a user's trailing space does.
        return linearTargetPaints(feature, context, designation ?? '', belowLines);
    };
}
