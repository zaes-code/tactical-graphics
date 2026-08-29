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
import {HALO_WIDTH, configuredLabelScale, fontStyle, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicHostility, TacticalGraphicName, getLabel} from '../core/type';
import {uprightRotation} from './decorations';
import {amplifierText, getFullLabel, hostilityOf, labelColorOf} from './paintFunctions';
import {ringCenter, ringCrossingPoint} from './boundaryBreakPaints';
import {capLabelToGraphic, fitLabelScale} from './labelFit';
import {BASE_FONT_SIZE_PX} from '../core/config';

type AreaLabelPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** How far below the designation the date-time group hangs, in screen pixels. */
const DEFAULT_DATE_OFFSET_PX = 18;

/** Where an area's label anchor is — the label feature is a bare point. */
function anchorOf(feature: PaintFeature): ProjectedPosition | undefined {
    return feature.geometry.type === 'Point' ? feature.geometry.coordinates : undefined;
}

/**
 * Share of an area's own size its **centred** label may stand.
 *
 * Larger than the general share because this label is *meant* to sit in the middle of the
 * shape and be read as its name, where an outside label is an annotation beside it. 0.4 is
 * what these already measured at the zoom they were drawn at (0.41 on the rectangular fire
 * areas), so the shapes keep the size that reads correctly today — and stop growing to 0.52
 * of the box on the way out, which they did while the zoom anchor was the only thing
 * holding them.
 */
const CENTRED_LABEL_SHARE = 0.4;

/**
 * The scale an area's centred labels start from.
 *
 * The ring fit still has the last word — it is what keeps text off a concave outline, and
 * no share can do that. This is the other half: the ring fit stops a label *overflowing*
 * the shape, and says nothing about a label that fills it. Without something that does, an
 * area label grew until the outline stopped it; measured on the sweep, the rectangular fire
 * areas reached 0.68 of their box. @see fitLabelScale, outsideScaleOf
 */
function scaleOf(feature: PaintFeature, context: PaintContext): number {
    return capLabelToGraphic(configuredLabelScale(), feature, context, BASE_FONT_SIZE_PX, CENTRED_LABEL_SHARE);
}

/**
 * The scale for a label drawn **outside** the shape.
 *
 * Inside and outside want different rules, which is why there are two functions here. A
 * label *inside* an area is already governed by `fitLabelScale`, which shrinks it until it
 * genuinely fits the ring — a second cap on top of that would only make a label smaller
 * than the shape it comfortably sits in, and the user's word on those is that they read
 * correctly. A label *outside* has no ring to be held by and nothing else stopping it, so
 * it keeps growing relative to a shape that shrinks with the zoom: the dates above a
 * rectangle, the `PAA` markers around a position area, a group of targets' designation on
 * its northern edge.
 *
 * Those take the general rule instead — a quarter of the graphic's own on-screen size.
 * (User's call, 2026-08-29.) @see capLabelToGraphic
 */
function outsideScaleOf(feature: PaintFeature, context: PaintContext): number {
    // The configured size rather than the anchored one: outside the shape there is no ring
    // holding the label, so the graphic cap is what bounds it and the anchor adds only the
    // zoom the operator happened to be at. @see configuredLabelScale
    const desired = feature.bounds ? configuredLabelScale() : scaleOf(feature, context);
    return capLabelToGraphic(desired, feature, context);
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
    // Blanked when the graphic is showing its name only, which removes the line from
    // every stack that joins this in — the empty-string filter does the rest.
    const start = amplifierText(feature, (feature.properties.startDate ?? '').trim());
    const end = amplifierText(feature, (feature.properties.endDate ?? '').trim());
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
    options: {before?: string[]; after?: string[]; literalLines?: string[]} = {},
): AreaLabelPaint {
    return (feature, context) => {
        const at = anchorOf(feature);
        if (!at) return [];

        /*
         * **`literalLines` sets the graphic's own literal on lines of its own**, and the
         * designation goes *under* it rather than beside it.
         *
         * `getFullLabel` writes "EPW HOLDING AREA T-1" on one line, because for most
         * graphics the literal is a prefix — "OBJ SWORD", "NAI 12". 310200's Template
         * stacks them: "EPW" over "HOLDING AREA" over the designation, which is a
         * different arrangement and not one a prefix can express.
         */
        const designation = options.literalLines
            ? (feature.properties.designation ?? '').trim()
            : getFullLabel(name, feature.properties.designation ?? '').trim();

        const lines = [
            ...(options.before ?? []),
            ...(options.literalLines ?? []),
            designation,
            ...(options.after ?? []),
            areaDateLabel(feature),
        ].filter(line => line.length > 0);

        return lines.length ? [stack(feature, context, at, lines, scaleOf(feature, context))] : [];
    };
}

/**
 * The action areas -- JTAA, SAA and SGAA (APP-06 150501-150503) -- and the generic area
 * (120700), which is the same block with field H beside the designation.
 *
 * One Template serves all four:
 *
 * ```
 *          JTAA - T                        H  T
 *    N     W - W1     N              N    W - W1    N
 * ```
 *
 * Three things in it are worth naming. The literal joins the designation with a **hyphen**
 * rather than the space `getFullLabel` writes, because the Example reads `JTAA - 02`.
 * Field **H sits to the left of T** on the generic area, which is the one place in this
 * library where H shares a line with the designation. And the **N** is field N, the
 * hostile marker -- so it is the affiliation speaking, not an input.
 */
export function actionAreaLabelPaint(
    name: TacticalGraphicName,
    options: {withAdditionalInfo?: boolean} = {},
): AreaLabelPaint {
    return (feature, context) => {
        const at = anchorOf(feature);
        if (!at) return [];

        const designation = (feature.properties.designation ?? '').trim();
        const literal = getLabel(name);
        const titled = literal && designation ? `${literal} - ${designation}` : literal || designation;
        const info = options.withAdditionalInfo
            ? amplifierText(feature, (feature.properties.additionalInfo ?? '').trim())
            : '';
        const first = [info, titled].filter(Boolean).join('  ');

        const lines = [first, areaDateLabel(feature)].filter(line => line.length > 0);
        const paints = lines.length ? [stack(feature, context, at, lines, scaleOf(feature, context))] : [];
        return paints.concat(hostileFlankMarks(feature, context));
    };
}

/**
 * `ENY` where the outline crosses due **west and due east** of the middle, and only when
 * the graphic is hostile.
 *
 * The Template boxes an `N` at exactly those two points. Field N is the hostile marker, so
 * it appears for a hostile graphic and for no other -- the same reading the encirclement
 * already takes. The text stays in the label colour: hostile *line work* goes red, hostile
 * text amplifiers do not. @see ai/decisions.md, the hostility colour rule
 */
function hostileFlankMarks(feature: PaintFeature, context: PaintContext): Paint[] {
    if (hostilityOf(feature) !== TacticalGraphicHostility.hostileFaker) return [];
    const ring = feature.ring;
    if (!ring || ring.length < 4) return [];

    const center = ringCenter(ring);
    const marks: Paint[] = [];
    for (const angle of [0, Math.PI]) {
        const spot = ringCrossingPoint(ring, center, angle);
        if (!spot) continue;
        marks.push({
            geometry: {type: 'Point', coordinates: spot},
            text: {
                text: 'ENY',
                font: fontStyle,
                fill: labelColorOf(feature),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                align: 'center',
                baseline: 'middle',
                scale: scaleOf(feature, context),
            },
        });
    }
    return marks;
}

/**
 * Human terrain (APP-06 370100): the literal `HT` with field **H** under it.
 *
 * The only area whose second line is the free text rather than a designation — its
 * Template shows `HT` over an `H` box and nothing else, so a name would have nowhere to
 * go. The dialog offers additional information alone for the same reason.
 */
export function humanTerrainLabelPaint(): AreaLabelPaint {
    return (feature, context) => {
        const at = anchorOf(feature);
        if (!at) return [];

        const lines = [
            getLabel(TacticalGraphicName.HumanTerrain),
            (feature.properties.additionalInfo ?? '').trim(),
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

        const userName = (feature.properties.designation ?? '').trim();
        const dtg1 = amplifierText(feature, (feature.properties.startDate ?? '').trim());
        const dtg2 = amplifierText(feature, (feature.properties.endDate ?? '').trim());

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

        const nameLines = [getLabel(name), (feature.properties.designation ?? '').trim()].filter(s => s.length > 0);
        if (at && nameLines.length) paints.push(stack(feature, context, at, nameLines, scale));

        const dtg1 = amplifierText(feature, (feature.properties.startDate ?? '').trim());
        const dtg2 = amplifierText(feature, (feature.properties.endDate ?? '').trim());
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

/**
 * The date-time group alone, hanging outside the shape's **upper left**.
 *
 * The second half of {@link zoneLabelPaint}, on its own, because the PsyOps zones want
 * exactly that block and nothing else from it: their Template sets `W - W1` outside the
 * upper-left corner and everything else beside the loudspeaker. Written once so the two
 * families cannot drift about where "outside the corner" is.
 *
 * @param irregular whether this graphic is the free-drawn variant, whose ring vertex is a
 *        better corner than its bounding box. @see zoneLabelPaint, which splits the same way
 */
export function outsideCornerDatePaint(irregular = false): AreaLabelPaint {
    return (feature, context) => {
        const dtg1 = amplifierText(feature, (feature.properties.startDate ?? '').trim());
        const dtg2 = amplifierText(feature, (feature.properties.endDate ?? '').trim());
        if (!dtg1 && !dtg2) return [];

        /*
         * **The ring's own vertex for an irregular shape, the bounding box for the rest.**
         * The same split `zoneLabelPaint` makes, and it is not a nicety: a circle's
         * leftmost *vertex* is level with its centre, so a round zone put its dates at the
         * middle-left instead of above the shape. A rectangle's corner and its bounding
         * box agree, so only the irregular variant needs the vertex — which is the one
         * whose bounding-box corner can sit a long way outside the polygon.
         */
        const at = irregular && feature.ring ? upperLeftVertex(feature.ring) : upperLeftCorner(feature);
        if (!at) return [];

        return [{
            geometry: {type: 'Point', coordinates: at},
            text: {
                text: [dtg1, dtg2].filter(line => line.length > 0).join(' - '),
                kind: 'amplifier',
                font: fontStyle,
                fill: labelColorOf(feature),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                align: 'right',
                baseline: 'bottom',
                offsetXPx: -6,
                scale: outsideScaleOf(feature, context),
            },
        }];
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
        // The four `PAA` markers ride the shape's edges rather than sitting inside it, so
        // they take the outside rule; the centred name and dates below keep the inside one.
        const markerScale = outsideScaleOf(feature, context);

        const scale = scaleOf(feature, context);
        const cx = (bounds.minX + bounds.maxX) / 2;
        const cy = (bounds.minY + bounds.maxY) / 2;

        const paints: Paint[] = ([
            [cx, bounds.maxY],
            [cx, bounds.minY],
            [bounds.minX, cy],
            [bounds.maxX, cy],
        ] as ProjectedPosition[]).map(at => stack(feature, context, at, ['PAA'], markerScale));

        const at = anchorOf(feature);
        const lines = [
            getFullLabel(name, feature.properties.designation ?? '').trim(),
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
        const text = getFullLabel(name, feature.properties.designation ?? '').trim();
        if (!at || !segment || !text) return [];

        return [stack(feature, context, at, [text], outsideScaleOf(feature, context), uprightRotation(segment[0], segment[1]))];
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
export function areaDefaultLabelPaint(
    name: TacticalGraphicName,
    /**
     * Whether the centre block leads with the symbol's own abbreviation.
     *
     * True for almost every area, and false for the two that already write theirs into
     * their boundary: an artillery manoeuvre area sets `AMA` at each of the four cardinal
     * breaks, and repeating it in the middle put the same three letters on the symbol five
     * times. The designation is what the middle is for. (User's call, 2026-08-27.)
     * @see cardinalLabelPaint
     */
    withLiteral = true,
): AreaLabelPaint {
    return (feature, context) => {
        const at = anchorOf(feature);
        if (!at) return [];

        const scale = scaleOf(feature, context);
        const designation = feature.properties.designation ?? '';
        const text = withLiteral ? getFullLabel(name, designation) : designation.trim();
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
