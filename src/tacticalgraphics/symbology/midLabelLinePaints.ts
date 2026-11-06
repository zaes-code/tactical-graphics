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

import type {Paint, PaintContext, PaintFeature, ProjectedPosition, TextKind} from '../core/paint';
import {BASE_FONT_SIZE_PX, getSmoothLines} from '../core/config';
import {smoothingKindOf} from '../core/smoothing';
import {HALO_WIDTH, LINE_WIDTH, configuredLabelScale, fontStyle, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicName, TacticalGraphicStatus, getLabel} from '../core/type';
import {cutGapAlongPath, offsetAbove, offsetBelow, pathLength, projectedMidSegment, textWidth, uprightFlipped, uprightRotation} from './decorations';
import {labelGapPx, letterGapClearance, letterInGapScale} from './labelFit';
import {distanceAlongPath, offsetPath, textOnPath} from './curvedText';
import {endAnchorInView, type LabelFootprint, midSegmentInView} from './viewFollow';
import {PLANNED_DASH_PX, formatDesignationWithCountry, getFullLabel, legibleDesignation, showsEny, lineColorOf, scaleOf, labelColorOf} from './paintFunctions';

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

/**
 * A text mark with the usual halo.
 *
 * **`kind` is not decoration.** It is what `hideAmplifiers` filters on, and the default —
 * doctrinal — is deliberately the safe one: a mark that never said what it is stays,
 * because a stray date is noise and a missing letter is a different symbol. This helper
 * used to set none at all, which meant the date range below a coordinated fire line was
 * indistinguishable from the designation above it and survived a hide. The name of the
 * function is not the kind of the mark.
 */
function textMark(
    feature: PaintFeature,
    at: ProjectedPosition,
    text: string,
    scale: number,
    rotation: number,
    align: 'left' | 'center' | 'right',
    baseline: 'top' | 'middle' | 'bottom',
    kind: TextKind = 'doctrinal',
): Paint {
    return {
        geometry: {type: 'Point', coordinates: at},
        text: {
            text,
            kind,
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
function midpointOf(coords: ProjectedPosition[], context: PaintContext, footprint?: LabelFootprint) {
    const {index, t} = midSegmentInView(coords, projectedMidSegment(coords), context, footprint);
    const p1 = coords[index];
    const p2 = coords[index + 1];
    return {index, t, p1, p2, point: [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t] as ProjectedPosition};
}

/**
 * `ENY` above each end of a hostile line whose designation sits at its middle.
 *
 * FM 1-02.2 Figure 5-9 puts field N at the far left and the far right of every line control
 * measure, wherever the line's other text goes, and boundary's 110100 the same. Each mark runs
 * inward from its end. Held at a
 * legible size like any prefix, and gone once the line is under twice it. @see legibleDesignation
 */
export function hostileEndMarks(feature: PaintFeature, coords: ProjectedPosition[], scale: number, context: PaintContext): Paint[] {
    if (!showsEny(feature)) return [];
    const eny = legibleDesignation('ENY', 'ENY', scale, fontStyle, context, pathLength(coords) / context.resolution);
    if (!eny.text) return [];
    const start = coords[0];
    const afterStart = coords[1];
    const end = coords[coords.length - 1];
    const beforeEnd = coords[coords.length - 2];
    return [
        textMark(feature, offsetAbove(start, start, afterStart, context.resolution, labelGapPx(LABEL_OFFSET_PX, eny.scale)), eny.text, eny.scale,
            uprightRotation(start, afterStart), !uprightFlipped(start, afterStart) ? 'left' : 'right', 'bottom'),
        textMark(feature, offsetAbove(end, beforeEnd, end, context.resolution, labelGapPx(LABEL_OFFSET_PX, eny.scale)), eny.text, eny.scale,
            uprightRotation(beforeEnd, end), !uprightFlipped(beforeEnd, end) ? 'right' : 'left', 'bottom'),
    ];
}

/**
 * The coordinated fire line: designation above the midpoint, dates below.
 *
 * The two labels straddle the line, `LABEL_OFFSET_PX` either side of it, and both
 * ride the same "above is north" perpendicular — so which one reads on top does
 * not depend on which end the operator started drawing from.
 */
export function coordinatedFireLinePaint(name: TacticalGraphicName): LinePaint {
    return (feature, context) => {
        const coords = vertices(feature);
        if (coords.length < 2) return [];

        const scale = scaleOf(feature, context);
        // `T2 ( AS )` on the plate: the designation carries its country code in
        // brackets, as the rest of the fire-support family does.
        const full = getFullLabel(name, formatDesignationWithCountry(feature.properties.designation, feature.properties.countryCode));
        const {p1, p2, point} = midpointOf(coords, context, {
            alongPx: textWidth(context, full, fontStyle, scale) / 2,
            acrossPx: labelGapPx(LABEL_OFFSET_PX, scale) + BASE_FONT_SIZE_PX * scale,
        });
        const rotation = uprightRotation(p1, p2);
        // Too small to read, the name goes and `CFL` stays. The dates keep `scale`. @see legibleDesignation
        const shown = legibleDesignation(full, getLabel(name), scale, fontStyle, context, pathLength(coords) / context.resolution);

        return [
            ...hostileEndMarks(feature, coords, scale, context),
            ...(shown.text
                ? [
                    textMark(feature, offsetAbove(point, p1, p2, context.resolution, labelGapPx(LABEL_OFFSET_PX, shown.scale)), shown.text, shown.scale, rotation, 'center', 'bottom'),
                    // The dates go with the name. @see withProportionateAmplifiers
                    textMark(
                        feature,
                        offsetBelow(point, p1, p2, context.resolution, labelGapPx(LABEL_OFFSET_PX, scale)),
                        dateRangeLabel(feature.properties),
                        scale,
                        rotation,
                        'center',
                        'top',
                        'amplifier',
                    ),
                ]
                : []),
            {
                geometry: {type: 'LineString', coordinates: coords},
                // Dashed whatever its status: the dash is the symbol. APP-06 260200, FM 1-02.2
                // Table 5-8 and MIL-STD-2525E Table L-XIII all draw a CFL dashed. @see DASHED_PARTS
                stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: [...PLANNED_DASH_PX]},
            },
        ];
    };
}

/**
 * The engineer work line: "EWL" above each end, and two optional free-text
 * amplifiers straddling the middle of every segment.
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
        const midTop = formatDesignationWithCountry(props.designation, props.countryCode);
        const midBottom = formatDesignationWithCountry(props.secondDesignation, props.secondCountryCode);

        const scale = scaleOf(feature, context);
        // The end label is the prefix alone, so it is held at a legible size rather than
        // shrinking away, and goes only once the line is shorter than twice it. The two
        // designations at the middle carry no prefix and are left to the floor.
        // @see legibleDesignation
        const ends = legibleDesignation(getFullLabel(name, ''), getLabel(name), scale, fontStyle, context, pathLength(coords) / context.resolution);
        /*
         * **An end off screen takes its prefix to where the line comes into the view**, reading
         * inward from there over the line, as the line control measures' end labels do.
         * @see endAnchorInView
         */
        const endFootprint: LabelFootprint = {
            alongPx: ends.text ? textWidth(context, ends.text, fontStyle, ends.scale) / 2 : 0,
            acrossPx: labelGapPx(LABEL_OFFSET_PX, ends.scale) + BASE_FONT_SIZE_PX * ends.scale,
        };
        const movedStart = ends.text ? endAnchorInView(coords, 'start', endFootprint, context) : undefined;
        const movedEnd = ends.text ? endAnchorInView(coords, 'end', endFootprint, context) : undefined;
        const [start, afterStart] = movedStart ? [movedStart.at, movedStart.to] : [coords[0], coords[1]];
        const startFrom = movedStart ? movedStart.from : start;
        const [end, beforeEnd] = movedEnd ? [movedEnd.at, movedEnd.from] : [coords[coords.length - 1], coords[coords.length - 2]];
        const endTo = movedEnd ? movedEnd.to : end;

        const paints: Paint[] = ends.text
            ? [
                textMark(
                    feature,
                    offsetAbove(start, startFrom, afterStart, context.resolution, labelGapPx(LABEL_OFFSET_PX, ends.scale)),
                    ends.text,
                    ends.scale,
                    uprightRotation(startFrom, afterStart),
                    !uprightFlipped(startFrom, afterStart) ? 'left' : 'right',
                    'bottom',
                ),
                textMark(
                    feature,
                    offsetAbove(end, beforeEnd, endTo, context.resolution, labelGapPx(LABEL_OFFSET_PX, ends.scale)),
                    ends.text,
                    ends.scale,
                    uprightRotation(beforeEnd, endTo),
                    !uprightFlipped(beforeEnd, endTo) ? 'right' : 'left',
                    'bottom',
                ),
            ]
            : [];

        /*
         * **Repeated on every segment.** APP-06 110300: "The line segment between each pair of
         * anchor points will repeat all information associated with the line segment between
         * points 1 and 2." A smoothed line has no anchor points left in it, only chords of a
         * curve, so it keeps one pair at its middle.
         */
        const smoothed = getSmoothLines() && smoothingKindOf(name) !== undefined;
        // A segment whose middle is off screen carries its pair at the middle of what is in view
        // of it, clear of other labels, as each of a corridor's legs does. @see midSegmentInView
        const footprint: LabelFootprint = {
            alongPx: Math.max(midTop ? textWidth(context, midTop, fontStyle, scale) : 0, midBottom ? textWidth(context, midBottom, fontStyle, scale) : 0) / 2,
            acrossPx: labelGapPx(LABEL_OFFSET_PX, scale) + BASE_FONT_SIZE_PX * scale,
        };
        const spans = smoothed ? [midpointOf(coords, context, footprint)] : coords.slice(1).map((b, i) => {
            const a = coords[i];
            const {t} = midSegmentInView([a, b], {index: 0, t: 0.5}, context, footprint);
            return {p1: a, p2: b, point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as ProjectedPosition};
        });
        for (const {p1, p2, point} of spans) {
            if (p1[0] === p2[0] && p1[1] === p2[1]) continue;
            const rotation = uprightRotation(p1, p2);
            if (midTop) {
                paints.push(
                    textMark(feature, offsetAbove(point, p1, p2, context.resolution, labelGapPx(LABEL_OFFSET_PX, scale)), midTop, scale, rotation, 'center', 'bottom'),
                );
            }
            if (midBottom) {
                paints.push(
                    textMark(feature, offsetBelow(point, p1, p2, context.resolution, labelGapPx(LABEL_OFFSET_PX, scale)), midBottom, scale, rotation, 'center', 'top'),
                );
            }
        }

        paints.push({
            geometry: {type: 'LineString', coordinates: coords},
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: plannedDash(feature)},
        });
        return paints;
    };
}

/** The point `d` along `path`, and the segment it lies on. */
function locate(path: ProjectedPosition[], d: number): {at: ProjectedPosition; index: number} {
    let left = Math.max(0, d);
    for (let i = 0; i < path.length - 1; i++) {
        const [a, b] = [path[i], path[i + 1]];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (left <= length || i === path.length - 2) {
            const t = length === 0 ? 0 : Math.min(1, left / length);
            return {at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], index: i};
        }
        left -= length;
    }
    return {at: path[0], index: 0};
}

/** Padding either side of "MFP" within the gap cut for it, in screen pixels. */
const MFP_GAP_PADDING_PX = 4;
/** Half the declared cap height of `fontStyle`, per unit of scale. */
const MFP_DATE_HALF_HEIGHT_PX = 12;

/**
 * The munition flight path: "MFP" set in a gap at the midpoint, and the date-time
 * group below the line halfway between point 1 and that midpoint.
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
        const {index, t, p1, p2} = midpointOf(coords, context);
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);
        if (segLen === 0) return [];

        // No letters and no gap once they would be under the legibility floor, or the path is
        // too short on screen to carry them. @see letterInGapScale
        const letterScale = letterInGapScale(scale, textWidth(context, 'MFP', fontStyle, 1), BASE_FONT_SIZE_PX, pathLength(coords) / context.resolution);

        // The gap is cut along the path, so a smoothed line gets the same one. @see cutGapAlongPath
        const halfGapPx = letterScale
            ? textWidth(context, 'MFP', fontStyle, letterScale) / 2 + letterGapClearance(MFP_GAP_PADDING_PX, letterScale, configuredLabelScale())
            : 0;
        const {outline, center} = cutGapAlongPath(coords, index, t, halfGapPx * context.resolution);

        return [
            ...(letterScale ? [textMark(feature, center, 'MFP', letterScale, uprightRotation(p1, p2), 'center', 'middle')] : []),
            // APP-06 260600 note 3: the DTG is "displayed one time mid-way between Point 1 and
            // midpoint of the graphic", below the line. Below means the "up is north" rule the rest of this file
            // uses, taken on the segment the DTG's centre lands on; the run then follows the path
            // on a line offset below it, so it never leaves the line where it turns. @see textOnPath
            ...(() => {
                const toMiddle = pathLength(coords.slice(0, index + 1)) + segLen * t;
                const centre = locate(coords, toMiddle / 2);
                const [a, b] = [coords[centre.index], coords[centre.index + 1]];
                const below = offsetBelow(centre.at, a, b, context.resolution, MFP_DATE_HALF_HEIGHT_PX * scale + labelGapPx(LABEL_OFFSET_PX, scale));
                const spec = textMark(feature, below, dateRangeLabel(feature.properties), scale, uprightRotation(a, b), 'center', 'middle', 'amplifier').text!;
                const under = offsetPath(coords, [below[0] - centre.at[0], below[1] - centre.at[1]], centre.index);
                return textOnPath(under, distanceAlongPath(under, below), 'center', spec, context);
            })(),
            {
                geometry: {type: 'MultiLineString', coordinates: outline},
                stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
            },
        ];
    };
}
