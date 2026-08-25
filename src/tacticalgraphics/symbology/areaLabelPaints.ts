/**
 * # Area labels
 *
 * The text that sits on an area graphic: its designation, its date-time group,
 * and for some families a doctrinal prefix or a repeated marker.
 *
 * Ported from `getAreaLabelStylesFromLabels`, a switch over ~50 graphic names.
 * Most of those names want the same thing — a centered stack of lines at the label
 * anchor — so the switch is mostly one layout repeated, and this module is mostly
 * {@link areaLabelStackPaint} with different line lists fed to it.
 *
 * ## One `Text` with newlines, never one style per line
 *
 * Every stack here joins its lines with `\n` rather than emitting a mark per line
 * at a fixed pixel offset. That is a correctness point, not a tidiness one: a
 * label's scale grows with zoom, so a fixed 18 px gap between separately-anchored
 * lines is right at one zoom and collides at every other. Newlines make the line
 * spacing follow the font.
 *
 * The one place a second mark is still used is where the two blocks genuinely sit
 * apart — the zone families' date-time group, which hangs outside the shape's
 * upper-left corner while the name sits at its center.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, fontStyle, getLabelHaloColor, labelScale} from '../core/symbology';
import {TacticalGraphicName, getLabel} from '../core/type';
import {uprightRotation} from './decorations';
import {getFullLabel, labelColorOf} from './paintFunctions';
import {fitLabelScale} from './labelFit';

type AreaLabelPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** How far below the designation the date-time group hangs, in screen pixels. */
const DEFAULT_DATE_OFFSET_PX = 18;

/** Where an area's label anchor is — the label feature is a bare point. */
function anchorOf(feature: PaintFeature): ProjectedPosition | undefined {
    return feature.geometry.type === 'Point' ? feature.geometry.coordinates : undefined;
}

function scaleOf(feature: PaintFeature, context: PaintContext): number {
    return labelScale(feature.drawingResolution, context.resolution);
}

/**
 * One centered, multi-line text mark at `at`, **capped so it stays inside the shape**.
 *
 * The cap is not a caller's choice, which is why it lives here rather than at the call
 * sites: a label's scale is zoom-anchored and a shape's size is not, so every centred block
 * overruns its own outline at some zoom unless something stops it. Doing it in the one
 * funnel every centred stack passes through means a new area family inherits the behaviour
 * instead of having to remember it. @see fitLabelScale
 */
function stack(
    feature: PaintFeature,
    context: PaintContext,
    at: ProjectedPosition,
    lines: string[],
    scale: number,
    rotation = 0,
): Paint {
    return {
        geometry: {type: 'Point', coordinates: at},
        text: {
            text: lines.join('\n'),
            font: fontStyle,
            fill: labelColorOf(feature),
            halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
            align: 'center',
            baseline: 'middle',
            rotation,
            scale: fitLabelScale(feature, context, at, lines, fontStyle, scale),
        },
    };
}

/**
 * The date-time group as one string.
 *
 * Both ends joined with a hyphen; a lone end renders on its own. An incomplete
 * range is shown rather than suppressed here — unlike the *line* graphics, where a
 * half-filled range reads as an error. The area plates in FM 1-02.2 show a single
 * "W" as often as a "W - W1" pair.
 */
export function areaDateLabel(feature: PaintFeature): string {
    const start = (feature.properties.startDate ?? '').trim();
    const end = (feature.properties.endDate ?? '').trim();
    if (start && end) return `${start} - ${end}`;
    return start || end || '';
}

/**
 * The default: designation over date-time group, centered on the anchor.
 *
 * What every area graphic gets when its family has no bespoke layout, and the
 * shape most of the bespoke ones are a variation on.
 *
 * **`extraLines` go above the designation**, which is what puts "FREE" over the
 * obstacle-free area's name and "SMOKE" under a smoke obscurant's. They are lines
 * of their own rather than a `getLabel` prefix, because a prefix would set the
 * word *beside* the name and the plates show it stacked.
 */
export function areaLabelStackPaint(
    name: TacticalGraphicName,
    options: {before?: string[]; after?: string[]} = {},
): AreaLabelPaint {
    return (feature, context) => {
        const at = anchorOf(feature);
        if (!at) return [];

        const lines = [
            ...(options.before ?? []),
            getFullLabel(name, feature.properties.label ?? '').trim(),
            ...(options.after ?? []),
            areaDateLabel(feature),
        ].filter(line => line.length > 0);

        return lines.length ? [stack(feature, context, at, lines, scaleOf(feature, context))] : [];
    };
}

/**
 * The smoke obscurant's stack: name, then the literal "SMOKE", then the two dates
 * on separate lines with the first carrying the joining hyphen.
 *
 * Its own function rather than `areaLabelStackPaint` options because the dates
 * split across two lines here instead of joining into one, which is the plate's
 * layout and not something the generic stack should learn.
 */
export function smokeObscurantLabelPaint(): AreaLabelPaint {
    return (feature, context) => {
        const at = anchorOf(feature);
        if (!at) return [];

        const userName = (feature.properties.label ?? '').trim();
        const dtg1 = (feature.properties.startDate ?? '').trim();
        const dtg2 = (feature.properties.endDate ?? '').trim();

        const lines: string[] = [];
        if (userName) lines.push(userName);
        lines.push('SMOKE');
        if (dtg1) lines.push(dtg2 ? `${dtg1}-` : dtg1);
        if (dtg2) lines.push(dtg2);

        return [stack(feature, context, at, lines, scaleOf(feature, context))];
    };
}

/**
 * The zone families — fire support areas, artillery target intelligence, critical
 * friendly, censor, call-for-fire, dead space, and the blue and purple kill boxes,
 * in their irregular, rectangular and circular variants.
 *
 * Twenty-three names on one layout: the doctrinal prefix over the user's name,
 * centered in the shape; the two date-time groups stacked **outside** the shape's
 * upper-left, right-aligned so they run away from it.
 *
 * **The date anchor differs by variant, and that is the whole subtlety.** A
 * rectangle's top-left is a real vertex and a circle has none, so for both the
 * bounding box is right. For an *irregular* polygon the bounding-box corner can
 * sit far outside the drawn shape, leaving the dates stranded in open space — so
 * those anchor on the real upper-left **vertex**: smallest X, ties broken by
 * largest Y.
 */
export function zoneLabelPaint(name: TacticalGraphicName, irregular: boolean): AreaLabelPaint {
    return (feature, context) => {
        const at = anchorOf(feature);
        const scale = scaleOf(feature, context);
        const paints: Paint[] = [];

        const nameLines = [getLabel(name), (feature.properties.label ?? '').trim()].filter(s => s.length > 0);
        if (at && nameLines.length) paints.push(stack(feature, context, at, nameLines, scale));

        const dtg1 = (feature.properties.startDate ?? '').trim();
        const dtg2 = (feature.properties.endDate ?? '').trim();
        if (!dtg1 && !dtg2) return paints;

        const dtgAnchor = irregular ? upperLeftVertex(feature.ring) : upperLeftCorner(feature);
        if (!dtgAnchor) return paints;

        paints.push({
            geometry: {type: 'Point', coordinates: dtgAnchor},
            text: {
                text: [dtg1, dtg2].filter(s => s.length > 0).join('-\n'),
                font: fontStyle,
                fill: labelColorOf(feature),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                align: 'right',
                baseline: 'top',
                offsetXPx: -10,
                scale,
            },
        });
        return paints;
    };
}

/** The real upper-left vertex of a ring: smallest X, ties broken by largest Y. */
function upperLeftVertex(ring: ProjectedPosition[] | undefined): ProjectedPosition | undefined {
    if (!ring || !ring.length) return undefined;
    let best = ring[0];
    for (let i = 1; i < ring.length; i++) {
        const v = ring[i];
        if (v[0] < best[0] || (v[0] === best[0] && v[1] > best[1])) best = v;
    }
    return best;
}

/** The bounding box's upper-left corner. */
function upperLeftCorner(feature: PaintFeature): ProjectedPosition | undefined {
    return feature.bounds ? [feature.bounds.minX, feature.bounds.maxY] : undefined;
}

/**
 * Position area for artillery: "PAA" at each of the four edge midpoints of the
 * shape's bounding box, plus the name and date-time group centered.
 *
 * The four markers are what the symbol *is* — the plate shows the word repeated
 * around the area rather than once in the middle — so they are not decoration that
 * can be dropped when the extent is missing. Nothing renders in that case, which
 * is honest: a PAA with one central label would be a different symbol.
 */
export function positionAreaArtilleryLabelPaint(name: TacticalGraphicName): AreaLabelPaint {
    return (feature, context) => {
        const bounds = feature.bounds;
        if (!bounds) return [];

        const scale = scaleOf(feature, context);
        const cx = (bounds.minX + bounds.maxX) / 2;
        const cy = (bounds.minY + bounds.maxY) / 2;

        const paints: Paint[] = ([
            [cx, bounds.maxY],
            [cx, bounds.minY],
            [bounds.minX, cy],
            [bounds.maxX, cy],
        ] as ProjectedPosition[]).map(at => stack(feature, context, at, ['PAA'], scale));

        const at = anchorOf(feature);
        const lines = [
            getFullLabel(name, feature.properties.label ?? '').trim(),
            areaDateLabel(feature),
        ].filter(line => line.length > 0);
        if (at && lines.length) paints.push(stack(feature, context, at, lines, scale));

        return paints;
    };
}

/**
 * Group or series of targets: the designation written **on** the polygon's
 * northern edge, rotated to follow it.
 *
 * The anchor and the segment both come from the holder — the edge was chosen when
 * the geometry was built, and re-deriving "which edge is northernmost" here would
 * be a second opinion that could disagree with the gap
 * `groupOrSeriesOfTargetsPaint` cut for this very label.
 */
export function groupOrSeriesOfTargetsLabelPaint(name: TacticalGraphicName): AreaLabelPaint {
    return (feature, context) => {
        const at = anchorOf(feature);
        const segment = feature.labelSegment;
        const text = getFullLabel(name, feature.properties.label ?? '').trim();
        if (!at || !segment || !text) return [];

        return [stack(feature, context, at, [text], scaleOf(feature, context), uprightRotation(segment[0], segment[1]))];
    };
}

/**
 * The fallback area label: designation, with the date-time group **18 screen
 * pixels below it**, as two separate marks.
 *
 * What every area graphic without a bespoke layout gets — the largest group by
 * count. Ported faithfully rather than improved: the rest of this module joins its
 * lines with `
` precisely because a fixed pixel offset between separately
 * anchored lines collides once the label scale grows past it, and this one has
 * that flaw. Changing it here would change what OpenLayers draws for ~59 graphics,
 * which is not what a port is for.
 *
 * Worth fixing on its own merits, as its own change, with its own before/after.
 */
export function areaDefaultLabelPaint(name: TacticalGraphicName): AreaLabelPaint {
    return (feature, context) => {
        const at = anchorOf(feature);
        if (!at) return [];

        const scale = scaleOf(feature, context);
        const text = getFullLabel(name, feature.properties.label ?? '');
        const date = areaDateLabel(feature);

        // The two marks are separately anchored, so they are capped as **one block**: the
        // date hangs `DEFAULT_DATE_OFFSET_PX` below the designation, and fitting each alone
        // would let the pair together leave a shape that neither leaves by itself.
        const fitted = fitLabelScale(
            feature, context, at, [text, date], fontStyle, scale, DEFAULT_DATE_OFFSET_PX / 2,
        );

        const mark = (label: string, offsetYPx: number): Paint => ({
            geometry: {type: 'Point', coordinates: at},
            text: {
                text: label,
                font: fontStyle,
                fill: labelColorOf(feature),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                offsetYPx,
                scale: fitted,
            },
        });

        // Both marks are emitted even when empty, matching the original: an empty
        // `text` renders nothing, and keeping the shape identical keeps the mark
        // count comparable between the two renderers.
        return [mark(text, 0), mark(date, DEFAULT_DATE_OFFSET_PX)];
    };
}
