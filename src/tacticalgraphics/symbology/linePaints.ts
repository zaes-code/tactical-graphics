/**
 * # The bespoke line graphics
 *
 * The Lines-category graphics whose symbol is more than a stroke and two end
 * labels: direction arrows, routes with traffic markers, linear targets, and the
 * rest of `LineGraphicBase`'s style switch.
 *
 * Same rules as everywhere in `symbology/`: planar Euclidean math in EPSG:3857
 * meters, no DOM, screen sizes as `px x resolution`.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicHostility, TacticalGraphicName} from '../core/type';
import {cutGapAlongPath, offsetBelow, pathLength, textWidth, uprightRotation} from './decorations';
import {amplifierDash, asAmplifier, getFullLabel, hostilityOf, legibleDesignation, lineColorOf, scaleOf, labelColorOf} from './paintFunctions';
import {areaDateLabel} from './areaLabelPaints';
import {strokeParts} from './dashFit';

type LinePaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** A text mark, with the halo every label carries. */
function label(
    feature: PaintFeature, at: ProjectedPosition,
    text: string,
    scale: number,
    extra: {rotation?: number; align?: 'left' | 'right' | 'center'; baseline?: 'top' | 'middle' | 'bottom'} = {},
): Paint {
    return {
        geometry: {type: 'Point', coordinates: at},
        text: {
            text,
            font: fontStyle,
            fill: labelColorOf(feature),
            halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
            align: extra.align ?? 'center',
            baseline: extra.baseline ?? 'middle',
            rotation: extra.rotation,
            scale,
        },
    };
}

/** Clearance between the arrowhead's wing base and the start of the text. */
const ARROW_LABEL_CLEARANCE_PX = 10;
/** Gap between the designation and an "ENY" prefix set behind it. */
const ARROW_ENY_GAP_PX = 36;
/** Clearance either side of the text in the break cut for it, in screen pixels. */
const ARROW_TEXT_BREAK_PAD_PX = 4;
/** How far below the line the date-time group sits, before the label scale is applied. */
const ARROW_DTG_OFFSET_PX = 20;

/**
 * The four direction-of-attack arrows: main, supporting, aviation, and the main
 * attack's feint.
 *
 * Sub-line `[0]` is the drawn route and dashes when planned; everything after it —
 * the arrowhead, the feint's dashes, the aviation bow-tie — is drawn solid,
 * because those are *symbol*, not status. Aviation's two bow-tie rings are closed
 * and filled.
 *
 * **The labels sit behind the arrowhead and read away from it.** The anchor is a
 * fixed clearance back from the midpoint of the arrowhead's wing base, and the
 * text alignment is chosen from which way the arrow points on screen, so the text
 * extends backward along the line whether the user drew left-to-right or
 * right-to-left. Without that the designation runs over its own arrowhead.
 *
 * "ENY" is set further back still, cleared by the designation's own measured
 * width, on every hostile variant: each of APP-06 140601, 140602, 140603 and 140605 boxes
 * N behind T, and their Enemy examples read `ENY MAIN`. It used to be the supporting
 * attack's alone.
 *
 * **The text sits in a break of the line**, as each of the four templates draws its T box:
 * the shaft is cut from just ahead of the designation to just behind `ENY`.
 */
export function directionArrowPaint(name: TacticalGraphicName): LinePaint {
    return (feature, context) => {
        if (feature.geometry.type !== 'MultiLineString') return [];
        const allCoords = feature.geometry.coordinates;
        const baseCoords = allCoords[0];
        const arrowCoords = allCoords[1];
        if (!baseCoords) return [];

        const color = lineColorOf(feature);
        const shaft: Paint = {
            geometry: {type: 'LineString', coordinates: baseCoords},
            stroke: {color, widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)},
        };
        const paints: Paint[] = [shaft];

        if (allCoords.length > 1) {
            // The feint's chevron is dashed as the symbol. @see DASHED_PARTS
            paints.push(...strokeParts(name, allCoords.slice(1), {color, widthPx: LINE_WIDTH()}, 1));
        }

        // The aviation bow-tie: two closed rings appended at indices 2 and 3 by
        // `AviationDirectionOfAttack.generateGraphics`, filled rather than outlined.
        if (name === TacticalGraphicName.AviationDirectionOfAttack && allCoords.length >= 4) {
            paints.push({geometry: {type: 'Polygon', coordinates: [allCoords[2]]}, fill: {color}});
            paints.push({geometry: {type: 'Polygon', coordinates: [allCoords[3]]}, fill: {color}});
        }

        if (baseCoords.length < 2 || !arrowCoords || arrowCoords.length < 3) return paints;

        const p1 = baseCoords[baseCoords.length - 2];
        const p2 = baseCoords[baseCoords.length - 1];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const lineLen = Math.hypot(dx, dy);
        if (lineLen === 0) return paints;

        const ux = dx / lineLen;
        const uy = dy / lineLen;

        // `computeArrowheadPoints` returns [leftWing, tip, rightWing].
        const leftWing = arrowCoords[0];
        const rightWing = arrowCoords[2];
        const clearance = ARROW_LABEL_CLEARANCE_PX * context.resolution;
        const anchor: ProjectedPosition = [
            (leftWing[0] + rightWing[0]) / 2 - ux * clearance,
            (leftWing[1] + rightWing[1]) / 2 - uy * clearance,
        ];

        const rotation = uprightRotation(p1, p2);
        const scale = scaleOf(feature, context);
        const align: 'left' | 'right' = p2[0] >= p1[0] ? 'right' : 'left';

        const nameText = getFullLabel(name, feature.properties.designation ?? '');
        const dateText = areaDateLabel(feature);
        const showEny = hostilityOf(feature) === TacticalGraphicHostility.hostileFaker;

        /*
         * `ENY` is the only prefix these arrows carry, and it is set apart from the name rather
         * than joined to it. Too small to read, the name goes and `ENY` takes its place at the
         * anchor, legible, while the arrow is at least twice it. @see legibleDesignation
         */
        const enyFull = ['ENY', nameText].filter(Boolean).join(' ');
        const shown = showEny
            ? legibleDesignation(enyFull, 'ENY', scale, fontStyle, context, pathLength(baseCoords) / context.resolution)
            : {text: enyFull, scale};
        const prefixOnly = shown.text !== enyFull;
        if (prefixOnly) {
            if (shown.text) paints.push(label(feature, anchor, shown.text, shown.scale, {rotation, align}));
        } else if (nameText) {
            paints.push(label(feature, anchor, nameText, scale, {rotation, align}));
        }

        let textPx = prefixOnly
            ? (shown.text ? textWidth(context, shown.text, fontStyle, shown.scale) : 0)
            : (nameText ? textWidth(context, nameText, fontStyle, scale) : 0);
        if (showEny && !prefixOnly) {
            const nameWidthPx = nameText ? textWidth(context, nameText, fontStyle, scale) : 0;
            const back = (nameWidthPx + ARROW_ENY_GAP_PX) * context.resolution;
            paints.push(label(feature, [anchor[0] - ux * back, anchor[1] - uy * back], 'ENY', scale, {rotation, align}));
            textPx = nameWidthPx + ARROW_ENY_GAP_PX + textWidth(context, 'ENY', fontStyle, scale);
        }
        if (textPx > 0) {
            // The break, measured along the shaft from the anchor back over the text.
            const pad = ARROW_TEXT_BREAK_PAD_PX * context.resolution;
            const lastLen = lineLen;
            const fromEnd = (p2[0] - anchor[0]) * ux + (p2[1] - anchor[1]) * uy;
            const halfGap = (textPx * context.resolution) / 2 + pad;
            const t = (lastLen - fromEnd - (textPx * context.resolution) / 2) / lastLen;
            const {outline} = cutGapAlongPath(baseCoords, baseCoords.length - 2, t, halfGap);
            shaft.geometry = {type: 'MultiLineString', coordinates: outline};
        }

        if (dateText) {
            const at = offsetBelow(anchor, p1, p2, context.resolution, ARROW_DTG_OFFSET_PX * scale);
            paints.push(asAmplifier(label(feature, at, dateText, scale, {rotation, align, baseline: 'top'})));
        }

        return paints;
    };
}
