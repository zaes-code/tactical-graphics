/**
 * # The lines labeled at their middle
 *
 * Coordinated fire line, engineer work line and munition flight path. Each puts
 * its amplifiers at the **projected** midpoint of the drawn path rather than at
 * its ends, and the munition flight path additionally cuts the line open so its
 * "MFP" sits inside the gap.
 *
 * `projectedMidSegment` is what "middle" means for all three: the vertices are
 * projected onto the straight line from the first to the last, so the midpoint is
 * measured along the graphic's own axis. A path that wanders would otherwise
 * label itself at the middle of its *length*, which is not where the eye reads
 * the middle of the symbol.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicName, TacticalGraphicStatus} from '../core/type';
import {offsetAbove, offsetBelow, projectedMidSegment, textWidth, uprightRotation} from './decorations';
import {PLANNED_DASH_PX, getFullLabel, lineColorOf, scaleOf, labelColorOf} from './paintFunctions';

type LinePaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** Screen-pixel clearance between the line and the nearest edge of an amplifier. */
const LABEL_OFFSET_PX = 8;

/**
 * The start/end date-time group as one string.
 *
 * Deliberately **not** the same rule as the default line's: this family shows a
 * lone start or a lone end, where the default line requires both. FM 1-02.2's W
 * and W1 fields are independent, and a coordinated fire line that is only known
 * to be effective *from* a time is a real thing an operator enters.
 */
export function dateRangeLabel(properties: PaintFeature['properties']): string {
    const start = (properties.startDate ?? '').trim();
    const end = (properties.endDate ?? '').trim();
    if (start && end) return `${start} - ${end}`;
    return start || end;
}

/** True when a graphic's status makes its line work dashed. */
function plannedDash(feature: PaintFeature): number[] | undefined {
    return feature.properties.status === TacticalGraphicStatus.planned ? PLANNED_DASH_PX : undefined;
}

/** A text amplifier with the usual halo. */
function amplifier(
    feature: PaintFeature, at: ProjectedPosition,
    text: string,
    scale: number,
    rotation: number,
    align: 'left' | 'center' | 'right',
    baseline: 'top' | 'middle' | 'bottom',
): Paint {
    return {
        geometry: {type: 'Point', coordinates: at},
        text: {
            text,
            font: fontStyle,
            fill: labelColorOf(feature),
            halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
            rotation,
            align,
            baseline,
            scale,
        },
    };
}

/** A path's vertices, whatever line-ish geometry it arrived as. */
function vertices(feature: PaintFeature): ProjectedPosition[] {
    const geometry = feature.geometry;
    if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') return geometry.coordinates;
    return [];
}

/** The midpoint of a path, plus the segment it lies on. */
function midpointOf(coords: ProjectedPosition[]) {
    const {index, t} = projectedMidSegment(coords);
    const p1 = coords[index];
    const p2 = coords[index + 1];
    return {index, t, p1, p2, point: [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t] as ProjectedPosition};
}

/**
 * The coordinated fire line: designation above the midpoint, dates below.
 *
 * The two labels straddle the line, `LABEL_OFFSET_PX` either side of it, and both
 * ride the same "above is north" perpendicular — so which one reads on top does
 * not depend on which end the user started drawing from.
 */
export function coordinatedFireLinePaint(name: TacticalGraphicName): LinePaint {
    return (feature, context) => {
        const coords = vertices(feature);
        if (coords.length < 2) return [];

        const {p1, p2, point} = midpointOf(coords);
        const scale = scaleOf(feature, context);
        const rotation = uprightRotation(p1, p2);

        return [
            amplifier(feature, 
                offsetAbove(point, p1, p2, context.resolution, LABEL_OFFSET_PX),
                getFullLabel(name, feature.properties.designation ?? ''),
                scale, rotation, 'center', 'bottom',
            ),
            amplifier(feature, 
                offsetBelow(point, p1, p2, context.resolution, LABEL_OFFSET_PX),
                dateRangeLabel(feature.properties),
                scale, rotation, 'center', 'top',
            ),
            {
                geometry: {type: 'LineString', coordinates: coords},
                stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: plannedDash(feature)},
            },
        ];
    };
}

/**
 * The engineer work line: "EWL" above each end, and two optional free-text
 * amplifiers straddling the midpoint.
 *
 * The end labels hang off the *outside* of the line — aligned left at a start
 * that runs east, right at one that runs west — so the text grows away from the
 * graphic rather than back over it.
 */
export function engineerWorkLinePaint(name: TacticalGraphicName): LinePaint {
    return (feature, context) => {
        const coords = vertices(feature);
        if (coords.length < 2) return [];

        const props = feature.properties;
        const endLabel = getFullLabel(name, '');
        const joinParts = (a?: string, b?: string) => [a?.trim(), b?.trim()].filter(Boolean).join(' ');
        const midTop = joinParts(props.designation, props.countryCode);
        const midBottom = joinParts(props.secondDesignation, props.secondCountryCode);

        const scale = scaleOf(feature, context);
        const start = coords[0];
        const afterStart = coords[1];
        const end = coords[coords.length - 1];
        const beforeEnd = coords[coords.length - 2];

        const paints: Paint[] = [
            amplifier(feature, 
                offsetAbove(start, start, afterStart, context.resolution, LABEL_OFFSET_PX),
                endLabel,
                scale,
                uprightRotation(start, afterStart),
                afterStart[0] >= start[0] ? 'left' : 'right',
                'bottom',
            ),
            amplifier(feature, 
                offsetAbove(end, beforeEnd, end, context.resolution, LABEL_OFFSET_PX),
                endLabel,
                scale,
                uprightRotation(beforeEnd, end),
                end[0] >= beforeEnd[0] ? 'right' : 'left',
                'bottom',
            ),
        ];

        const {p1, p2, point} = midpointOf(coords);
        const rotation = uprightRotation(p1, p2);

        if (midTop) {
            paints.push(amplifier(feature, 
                offsetAbove(point, p1, p2, context.resolution, LABEL_OFFSET_PX),
                midTop, scale, rotation, 'center', 'bottom',
            ));
        }
        if (midBottom) {
            paints.push(amplifier(feature, 
                offsetBelow(point, p1, p2, context.resolution, LABEL_OFFSET_PX),
                midBottom, scale, rotation, 'center', 'top',
            ));
        }

        paints.push({
            geometry: {type: 'LineString', coordinates: coords},
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: plannedDash(feature)},
        });
        return paints;
    };
}

/** Offsets `from` to the right of the direction `from`→`to`, by screen pixels. */
function travelRightOffset(
    from: ProjectedPosition,
    to: ProjectedPosition,
    resolution: number,
    offsetPx: number,
): ProjectedPosition {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return from;
    const offsetMap = offsetPx * resolution;
    return [from[0] + (dy / len) * offsetMap, from[1] - (dx / len) * offsetMap];
}

/** Padding either side of "MFP" within the gap cut for it, in screen pixels. */
const MFP_GAP_PADDING_PX = 4;
/** Half the declared cap height of `fontStyle`, per unit of scale. */
const MFP_DATE_HALF_HEIGHT_PX = 12;

/**
 * The munition flight path: "MFP" set in a gap at the midpoint, and the date-time
 * group along the start of the line.
 *
 * **The gap is measured from the rendered glyph**, not taken as a fraction of the
 * segment — the label is capped by the zoom-anchored scale while the segment is
 * not, so a fraction would leave a hole four times too wide on a long path and
 * too narrow on a short one.
 *
 * The date sits half a glyph height plus the standard clearance off the line, so
 * its *nearest edge* clears by the same amount as every other amplifier here even
 * though it is anchored at its middle.
 */
export function munitionFlightPathPaint(): LinePaint {
    return (feature, context) => {
        const coords = vertices(feature);
        if (coords.length < 2) return [];

        const scale = scaleOf(feature, context);
        const {index, t, p1, p2} = midpointOf(coords);
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);
        if (segLen === 0) return [];

        // Every segment but the one carrying the label is drawn whole.
        const outline: ProjectedPosition[][] = [];
        for (let i = 0; i < coords.length - 1; i++) {
            if (i !== index) outline.push([coords[i], coords[i + 1]]);
        }

        const halfGapPx = textWidth(context, 'MFP', fontStyle, scale) / 2 + MFP_GAP_PADDING_PX;
        const gapRatio = (halfGapPx * context.resolution) / segLen;
        const gapA: ProjectedPosition = [p1[0] + dx * (t - gapRatio), p1[1] + dy * (t - gapRatio)];
        const gapB: ProjectedPosition = [p1[0] + dx * (t + gapRatio), p1[1] + dy * (t + gapRatio)];
        outline.push([p1, gapA], [gapB, p2]);

        const start = coords[0];
        const afterStart = coords[1];

        return [
            amplifier(feature, 
                [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2],
                'MFP', scale, uprightRotation(p1, p2), 'center', 'middle',
            ),
            // Left-aligned so the DTG begins exactly at the line's start, which is
            // the convention this symbol is drawn with.
            //
            // This one offset follows the **direction of travel** rather than the
            // "up is north" rule the rest of this file uses: it sits to the right of
            // a path drawn eastward and to the left of one drawn westward. That is
            // what the symbol has always done, so it is preserved rather than
            // quietly normalized — but it is an inconsistency, not a doctrine.
            amplifier(feature, 
                travelRightOffset(start, afterStart, context.resolution, MFP_DATE_HALF_HEIGHT_PX * scale + LABEL_OFFSET_PX),
                dateRangeLabel(feature.properties),
                scale, uprightRotation(start, afterStart), 'left', 'middle',
            ),
            {
                geometry: {type: 'MultiLineString', coordinates: outline},
                stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
            },
        ];
    };
}
