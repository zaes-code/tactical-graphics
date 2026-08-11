/**
 * # The bespoke line graphics
 *
 * The Lines-category graphics whose symbol is more than a stroke and two end
 * labels: direction arrows, routes with traffic markers, linear targets, and the
 * rest of `LineGraphicBase`'s style switch.
 *
 * Same rules as everywhere in `symbology/`: planar Euclidean math in EPSG:3857
 * metres, no DOM, screen sizes as `px x resolution`.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelFillColor, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicHostility, TacticalGraphicName} from '../core/type';
import {offsetBelow, textWidth, uprightRotation} from './decorations';
import {amplifierDash, getFullLabel, hostilityOf, lineColorOf, scaleOf} from './paintFunctions';
import {areaDateLabel} from './areaLabelPaints';

type LinePaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** A text mark, with the halo every label carries. */
function label(
    at: ProjectedPosition,
    text: string,
    scale: number,
    extra: {rotation?: number; align?: 'left' | 'right' | 'center'; baseline?: 'top' | 'middle' | 'bottom'} = {},
): Paint {
    return {
        geometry: {type: 'Point', coordinates: at},
        text: {
            text,
            font: fontStyle,
            fill: getLabelFillColor(),
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
 * width — and only for the supporting attack, which is the one variant whose plate
 * carries it.
 */
export function directionArrowPaint(name: TacticalGraphicName): LinePaint {
    return (feature, context) => {
        if (feature.geometry.type !== 'MultiLineString') return [];
        const allCoords = feature.geometry.coordinates;
        const baseCoords = allCoords[0];
        const arrowCoords = allCoords[1];
        if (!baseCoords) return [];

        const color = lineColorOf(feature);
        const paints: Paint[] = [{
            geometry: {type: 'LineString', coordinates: baseCoords},
            stroke: {color, widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)},
        }];

        if (allCoords.length > 1) {
            paints.push({
                geometry: {type: 'MultiLineString', coordinates: allCoords.slice(1)},
                stroke: {color, widthPx: LINE_WIDTH()},
            });
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

        const nameText = getFullLabel(name, feature.properties.label ?? '');
        const dateText = areaDateLabel(feature);
        const showEny =
            name === TacticalGraphicName.DirectionOfSupportingAttack
            && hostilityOf(feature) === TacticalGraphicHostility.hostileFaker;

        if (nameText) paints.push(label(anchor, nameText, scale, {rotation, align}));

        if (showEny) {
            const nameWidthPx = nameText ? textWidth(context, nameText, fontStyle, scale) : 0;
            const back = (nameWidthPx + ARROW_ENY_GAP_PX) * context.resolution;
            paints.push(label([anchor[0] - ux * back, anchor[1] - uy * back], 'ENY', scale, {rotation, align}));
        }

        if (dateText) {
            const at = offsetBelow(anchor, p1, p2, context.resolution, ARROW_DTG_OFFSET_PX * scale);
            paints.push(label(at, dateText, scale, {rotation, align, baseline: 'top'}));
        }

        return paints;
    };
}
