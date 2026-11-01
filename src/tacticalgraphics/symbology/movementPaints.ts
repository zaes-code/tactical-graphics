/**
 * # Movement and maneuver labels
 *
 * The amplifiers on the axis-of-advance arrows and the forms of maneuver. The
 * arrows themselves are line work drawn by the graphic feature; everything here
 * paints the **labels** feature, whose geometry is a MultiPoint of anchor spans
 * the generator publishes.
 *
 * ## Two label-scale regimes, and they are not interchangeable
 *
 * Most of this family uses a **span-proportional** scale — the label is sized from
 * the on-screen length of the segment it labels, so it grows and shrinks with the
 * arrow rather than with the zoom. That is what keeps a designation inside the
 * channel of the arrow that carries it.
 *
 * The one-letter forms of maneuver (IN, E, MD, T, A, CATK) use the ordinary
 * zoom-anchored scale instead: they are a fixed mark on the symbol rather than
 * text that has to fit a space. Mixing the two makes a letter either vanish on a
 * short arrow or swamp a long one. @see ai/conventions.md, "Pick the right
 * label-scale function"
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition, TextKind} from '../core/paint';
import {BASE_FONT_SIZE_PX, MIN_LEGIBLE_TEXT_PX} from '../core/config';
import {maxGraphicLabelScale} from '../core/symbology';
import {HALO_WIDTH, LINE_WIDTH, configuredLabelScale, fontStyle, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicHostility, TacticalGraphicName} from '../core/type';
import {alignAlong, offsetAbove, textWidth, uprightRotation} from './decorations';
import {letterGapClearance, letterInGapScale} from './labelFit';
import {areaDateLabel} from './areaLabelPaints';
import {hostilityOf, lineColorOf, scaleOf, labelColorOf} from './paintFunctions';
import {strokeParts} from './dashFit';
import {distanceAlongPath, readsAlongPath, textAlongPath, type PathTextAlign} from './curvedText';

type MovementPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/**
 * The anchor points a movement graphic's labels feature carries.
 *
 * **A bare `Point` counts as one anchor.** Some members of the family publish a
 * MultiPoint span and some a single Point, and returning nothing for the latter
 * drops the amplifier without a word — which is exactly what happened to a fixed
 * letter here, found as 42 changed pixels against the pre-port gallery.
 */
function anchors(feature: PaintFeature): ProjectedPosition[] {
    const geometry = feature.geometry;
    if (geometry.type === 'Point') return [geometry.coordinates];
    if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') return geometry.coordinates;
    return [];
}

/**
 * A label scale locked to a segment's on-screen span: the text grows and shrinks
 * with the arrow rather than with the zoom.
 *
 * **The divisor differs across this family, and it is not a mistake to tidy up.**
 * The default movement label divides the span by **24**; the axis-of-advance
 * family and the aviation axis divide it by `BASE_FONT_SIZE_PX`, which is **16**.
 * Both render with `fontStyle`, so the two produce visibly different sizes for the
 * same span — a 1.5x difference. This is the `BASE_FONT_SIZE_PX` vs 24 px literal
 * trap `ai/conventions.md` documents, preserved rather than unified because
 * unifying it would resize a dozen graphics.
 *
 * `0.7` is the share of the span the text may occupy, and is the same either way.
 *
 * **Capped, and the cap lives here rather than at the call sites.** A span-proportional
 * scale tracks the graphic's on-screen size with nothing stopping it, so a long arrow — or
 * a short one zoomed into — grows a label without bound: measured on an avenue of approach
 * spanning six degrees, the designation reached **scale 28, a 448 px line of text**, at a
 * zoom where the arrow still fitted the screen. `maxGraphicLabelScale()` is the ceiling the
 * ratio-locked mission tasks, the block family, the scallops and the base defense zone all
 * already stop at.
 *
 * `advanceToContactLabelPaint` had worked this out and applied the ceiling to itself alone,
 * leaving the other eleven callers uncapped — which is the argument for putting it in the
 * one place every caller goes through.
 */
export function spanProportionalScale(
    a: ProjectedPosition,
    b: ProjectedPosition,
    resolution: number,
    fontPx: number,
): number {
    const spanPx = Math.hypot(b[0] - a[0], b[1] - a[1]) / resolution;
    return Math.min(maxGraphicLabelScale(), (spanPx * 0.7) / fontPx);
}

/** The divisor the default movement label uses — a 24 px font literal. */
const DEFAULT_LABEL_FONT_PX = 24;

/**
 * A text mark.
 *
 * **The halo is opt-in, and the default movement label does not take one.** Every
 * other amplifier in this family is haloed, but the span-proportional designation
 * is not — it renders bare, and adding a halo puts a visible outline around a
 * dozen graphics. Caught by a pixel diff against the pre-port gallery: 42 pixels
 * in the Movement and Manoeuvre block, against a 5-pixel control.
 */
function text(
    feature: PaintFeature, at: ProjectedPosition,
    value: string,
    scale: number,
    extra: {rotation?: number; align?: 'left' | 'center' | 'right'; baseline?: 'top' | 'middle' | 'bottom'; halo?: boolean; kind?: TextKind} = {},
): Paint {
    return {
        geometry: {type: 'Point', coordinates: at},
        text: {
            text: value,
            font: fontStyle,
            fill: labelColorOf(feature),
            halo: extra.halo === false ? undefined : {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
            kind: extra.kind,
            rotation: extra.rotation,
            align: extra.align ?? 'center',
            baseline: extra.baseline ?? 'middle',
            scale,
        },
    };
}

/**
 * The name and date-time group joined into one line, as this family shows them.
 *
 * Five spaces between, not a separator: the plates set the two apart with
 * whitespace rather than punctuation, and a comma or dash would read as part of
 * the designation.
 */
function nameAndDate(feature: PaintFeature): string {
    const parts: string[] = [];
    if (feature.properties.designation) parts.push(feature.properties.designation);
    const date = areaDateLabel(feature);
    if (date) parts.push(date);
    return parts.join('     ');
}

/**
 * A label that stays on its arrow: `straight` as painted, or the same text bent along the
 * center line the generator publishes from `coords[pathFrom]` on, when it runs past the
 * segment it was anchored on. @see textAlongPath, MovementGraphicBase.labelPath
 *
 * `align` is where the run sits against its anchor *along the arrow*: `end` for a label set
 * back from the arrowhead, `start` for one reading on from the tail.
 */
function onArrow(context: PaintContext, coords: ProjectedPosition[], pathFrom: number, straight: Paint, align: PathTextAlign): Paint[] {
    const path = coords.slice(pathFrom);
    if (path.length < 2 || !straight.text || straight.geometry.type !== 'Point') return [straight];
    const at = distanceAlongPath(path, straight.geometry.coordinates);
    return textAlongPath(path, at, align, straight.text, context) ?? [straight];
}

/**
 * A fixed one- or two-letter amplifier at the first anchor, laid along the first
 * span.
 *
 * Used by the forms of maneuver whose plate carries a specific letter — the
 * user's own label is deliberately ignored, because the letter *is* the symbol.
 *
 * `atMidpoint` puts it between the two anchors rather than on the first, and
 * `upright` forces horizontal regardless of the graphic's rotation — mobile
 * defense's "MD" sits at the tail of the ellipse and reads horizontally whatever
 * angle the ellipse is at.
 */
function fixedLetterPaint(
    letter: string,
    options: {
        atMidpoint?: boolean;
        align?: 'left' | 'center';
        upright?: boolean;
        keepFlip?: boolean;
        /** Where between the two anchors the letter sits. Defaults to the midpoint. */
        atFraction?: number;
        /** The letter sits in a gap the line work cuts for it. @see approachLetterScale */
        inGap?: boolean;
    } = {},
): MovementPaint {
    return (feature, context) => {
        const coords = anchors(feature);
        if (coords.length < (options.atMidpoint ? 2 : 1)) return [];

        const [x0, y0] = coords[0];
        const scale = scaleOf(feature, context);

        if (!options.atMidpoint) {
            const rotation = options.upright
                ? 0
                : coords.length >= 2
                    ? uprightRotation(coords[0], coords[1])
                    : 0;
            // The alignment flips with the rotation, or the glyphs run back down the
            // segment instead of along it. @see alignAlong
            const align = coords.length >= 2 && !options.upright
                ? alignAlong(options.align ?? 'left', coords[0], coords[1])
                : options.align ?? 'left';
            return [text(feature, [x0, y0], letter, scale, {rotation, align})];
        }

        const [x1, y1] = coords[1];
        // A letter in a gap of the run asks the same question the line work does, and draws
        // nothing when the run is drawn whole. @see approachLetterScale
        const letterScale = options.inGap
            ? approachLetterScale(feature, context, letter, Math.hypot(x1 - x0, y1 - y0) / context.resolution)
            : scale;
        if (!letterScale) return [];
        // Envelopment keeps the raw angle rather than the upright flip, so its "E"
        // follows the half-circle's tail even when that reads upside down. That is
        // what the graphic did before the port; changing it is a design decision,
        // not a port.
        const rotation = options.keepFlip
            ? -Math.atan2(y1 - y0, x1 - x0)
            : uprightRotation(coords[0], coords[1]);
        // Interpolated **in projected meters**, on the segment the renderer draws, so a
        // letter placed a quarter along lands in the hole cut a quarter along.
        const t = options.atFraction ?? 0.5;
        return [text(feature, [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t], letter, letterScale, {rotation, align: options.align ?? 'center'})];
    };
}

/** Infiltration: "IN" between the first two anchors, upright-flipped. */
export const infiltrationLabelPaint = (): MovementPaint => fixedLetterPaint('IN', {atMidpoint: true, inGap: true});

/**
 * Envelopment: "E" a quarter of the way along the approach, following the raw angle.
 *
 * The anchors are the run's two ends, so the quarter point is computed on the projected
 * segment — the same one `approachPaint` cuts its gap in, at the same fraction.
 * @see APPROACH_LABEL_POSITION, Envelopment.generateLabels
 */
export const envelopmentLabelPaint = (): MovementPaint =>
    fixedLetterPaint('E', {atMidpoint: true, keepFlip: true, atFraction: APPROACH_LABEL_POSITION, inGap: true});

/**
 * Mobile defense: "MD" at the tail of the ellipse, horizontal whatever the
 * graphic's rotation.
 *
 * At `coords[0]` — the p0 vertex, in the gap the two arcs leave open — not the
 * midpoint. The amplifier belongs at the *start* of the graphic; it was briefly
 * centered and reverted at the user's direction. @see ai/decisions.md
 */
export const mobileDefenseLabelPaint = (): MovementPaint =>
    fixedLetterPaint('MD', {upright: true, align: 'center'});

/**
 * A fixed letter in the arrowhead, plus the operator's `T` and `W - W1` set back from it in
 * the body, the axis family's single "name  dates" line. @see behindArrowhead
 *
 * The anchors are the arrowhead's base and tip. The run behind the base is one head length
 * long, which is what the line is sized to: the same span-proportional scale as an axis.
 */
function letterWithNameAndDate(letter: string): MovementPaint {
    const letterPaint = fixedLetterPaint(letter);
    return (feature, context) => {
        const paints = letterPaint(feature, context);
        const coords = anchors(feature);
        if (coords.length < 2) return paints;
        const [base, tip] = coords;
        const rear: ProjectedPosition = [2 * base[0] - tip[0], 2 * base[1] - tip[1]];
        // The centre line the generator publishes after the two, so the run bends with the body.
        return paints.concat(behindArrowhead(feature, context, [rear, base, ...coords.slice(2)], 2, nameAndDate(feature)));
    };
}

/** Turning movement: "T" starting at the arrowhead base, with `T` and `W - W1` behind it. */
export const turningMovementLabelPaint = (): MovementPaint => letterWithNameAndDate('T');

/** Frontal attack: "A" starting at the arrowhead base, with `T` and `W - W1` behind it. */
export const frontalAttackLabelPaint = (): MovementPaint => letterWithNameAndDate('A');

/**
 * Counterattack: "CATK", with the user's designation appended after it.
 *
 * The only fixed-letter member that still shows the user's text — "CATK" is the task and
 * the name identifies which one.
 *
 * **Placed and sized like an avenue of approach** as of 2026-08-27, at the user's call: set
 * just behind the arrowhead rather than at the midpoint of the last segment, and scaled to
 * the published span — which is the arrow's width — rather than to the zoom. The
 * zoom-anchored scale it used before does not shrink with the arrow, so a small
 * counterattack carried a full-size designation. @see behindArrowhead
 */
export function counterattackLabelPaint(): MovementPaint {
    return (feature, context) => {
        const coords = anchors(feature);
        if (coords.length < 2) return [];
        const label = feature.properties.designation?.trim();
        return behindArrowhead(feature, context, coords, 2, label ? `CATK ${label}` : 'CATK');
    };
}

/** Clear space between the label's leading edge and the arrowhead base, in screen pixels. */
const ARROWHEAD_LABEL_CLEARANCE_PX = 10;

/**
 * A label set **just behind the arrowhead**, reading back down the arrow.
 *
 * The generators publish a two-point span that ends where the body does and is one
 * `radius` long — @see labelSpanNearArrowhead. Everything the placement needs comes from
 * that span: the direction, the clearance to back off by, and the size, which is therefore
 * proportional to the arrow's **width** rather than its length. That is what keeps a long
 * arrow from carrying an enormous designation.
 *
 * Three graphics families were open-coding this identically — the axes of advance, the
 * avenue of approach, and now the counterattacks, which used to set their label at the
 * midpoint of the last segment instead.
 */
function behindArrowhead(
    feature: PaintFeature,
    context: PaintContext,
    coords: ProjectedPosition[],
    pathFrom: number,
    value: string,
): Paint[] {
    const [c0, c1] = coords;
    const dx = c1[0] - c0[0];
    const dy = c1[1] - c0[1];
    const span = Math.hypot(dx, dy);
    if (span === 0 || !value) return [];

    const clearance = ARROWHEAD_LABEL_CLEARANCE_PX * context.resolution;
    const at: ProjectedPosition = [c1[0] - (dx / span) * clearance, c1[1] - (dy / span) * clearance];
    const straight = text(feature, at, value, spanProportionalScale(c0, c1, context.resolution, BASE_FONT_SIZE_PX), {
        rotation: uprightRotation(c0, c1),
        align: alignAlong('right', c0, c1),
    });
    return onArrow(context, coords, pathFrom, straight, 'end');
}

/** A point `d` along `path`, and the segment it lies on. */
function pointAlong(path: ProjectedPosition[], d: number): {at: ProjectedPosition; a: ProjectedPosition; b: ProjectedPosition} {
    let left = Math.max(0, d);
    for (let i = 0; i < path.length - 1; i++) {
        const [a, b] = [path[i], path[i + 1]];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (left <= length || i === path.length - 2) {
            const t = length === 0 ? 0 : Math.min(1, left / length);
            return {at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], a, b};
        }
        left -= length;
    }
    return {at: path[0], a: path[0], b: path[path.length - 1]};
}

/** Clear space between field T and the date-time group set ahead of it, in screen pixels. */
const AXIS_NAME_DATE_GAP_PX = 24;
/** The gap between an axis's rail and the `ENY` set outside it, in screen pixels. */
const AXIS_ENY_GAP_PX = 12;

/**
 * An axis of advance's three amplifiers, each where its plate boxes it.
 *
 * 151401 to 151406 and 342900 letter **T inside the body toward the rear** and **W - W1 as a
 * separate group just behind the head**, and their Examples set the name mid-body and the
 * date-time group near the arrowhead. They used to be joined into one `name     DTG` run,
 * which put both behind the head (or both at the tail on the aviation axes). The date is
 * set right-aligned behind the head and the name is centered in the body left behind it.
 * When that room is narrower than the name, which happens on a short arrow zoomed out, the
 * two go back to one `name     DTG` run behind the head rather than overlap.
 *
 * A hostile axis also says `ENY`, outside each rail at the rear, as the plates box field N
 * (APP-06 8.1.4). `halfWidth` is the arrow's half-width in projected meters, which is the
 * length of the span every generator in this family publishes. `behindHead` is more of the
 * body, in the same meters, that the date stays out of: the two aviation axes' twist, which
 * the dates ran through on every heading (found turning each line graphic, 2026-11-01).
 */
function axisAmplifiers(
    feature: PaintFeature,
    context: PaintContext,
    coords: ProjectedPosition[],
    pathFrom: number,
    halfWidth: number,
    behindHead = 0,
): Paint[] {
    const [c0, c1] = coords;
    const published = coords.slice(pathFrom);
    const path = published.length >= 2 ? published : [c0, c1];
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) total += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    if (total === 0) return [];

    const res = context.resolution;
    let scale = spanProportionalScale(c0, c1, res, BASE_FONT_SIZE_PX);
    const paints: Paint[] = [];
    const place = (d: number, value: string, align: 'left' | 'center' | 'right', pathAlign: PathTextAlign, kind?: TextKind) => {
        const {at, a, b} = pointAlong(path, d);
        const straight = text(feature, at, value, scale, {rotation: uprightRotation(a, b), align: alignAlong(align, a, b), kind});
        paints.push(...onArrow(context, coords, pathFrom, straight, pathAlign));
    };

    // Rear to head: the name, then the date.
    const date = areaDateLabel(feature);
    const dateEnd = total - ARROWHEAD_LABEL_CLEARANCE_PX * res - behindHead;
    const nameRoom = date ? dateEnd - textWidth(context, date, fontStyle, scale) * res - AXIS_NAME_DATE_GAP_PX * res : dateEnd;
    const name = feature.properties.designation?.trim();
    if (name && date && textWidth(context, name, fontStyle, scale) * res > nameRoom) {
        // Too short for two groups: centring the name in the room left would set it on the date.
        // The run keeps T toward the rear, so where the text is turned to read from the head
        // back it starts with the dates. (It set T at the head on every arrow pointing west.)
        const run = nameAndDate(feature);
        // And it fits the room behind the head, or the path slides it forward over the head
        // (and over an aviation axis's twist) to make it fit. @see textAlongPath
        const runWidth = textWidth(context, run, fontStyle, scale) * res;
        // Never under the legibility floor, though: an arrow too short even for that keeps it.
        if (runWidth > dateEnd) scale = Math.min(scale, Math.max((scale * Math.max(0, dateEnd)) / runWidth, (MIN_LEGIBLE_TEXT_PX * 1.001) / BASE_FONT_SIZE_PX));
        const from = pointAlong(path, Math.max(0, dateEnd - textWidth(context, run, fontStyle, scale) * res)).at;
        place(dateEnd, readsAlongPath(from, pointAlong(path, dateEnd).at) ? run : `${date}     ${name}`, 'right', 'end');
    } else {
        if (name) place(Math.max(0, nameRoom) / 2, name, 'center', 'center');
        if (date) place(dateEnd, date, 'right', 'end', 'amplifier');
    }

    if (hostilityOf(feature) === TacticalGraphicHostility.hostileFaker) {
        const [r0, r1] = path;
        const length = Math.hypot(r1[0] - r0[0], r1[1] - r0[1]);
        if (length > 0) {
            const [ux, uy] = [(r1[0] - r0[0]) / length, (r1[1] - r0[1]) / length];
            const out = halfWidth + AXIS_ENY_GAP_PX * res;
            // A little ahead of the rear, so the mark reads beside the rail rather than off its end.
            const along = Math.min(length / 2, halfWidth);
            const rear: ProjectedPosition = [r0[0] + ux * along, r0[1] + uy * along];
            for (const side of [1, -1]) {
                paints.push(text(feature, [rear[0] - uy * out * side, rear[1] + ux * out * side], 'ENY', scale, {rotation: uprightRotation(r0, r1)}));
            }
        }
    }
    return paints;
}

/**
 * How much of an aviation axis's body, back from the head, its twist takes: twice the run
 * from the crossing the generator publishes to the end of the centre line.
 */
function twistBehindHead(crossing: ProjectedPosition, path: ProjectedPosition[]): number {
    if (path.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) total += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    return Math.max(0, 2 * (total - distanceAlongPath(path, crossing)));
}

/**
 * The aviation axis of advance: T toward the rear, W - W1 behind the head, sized to the
 * span. @see axisAmplifiers
 */
export function aviationAxisLabelPaint(): MovementPaint {
    return (feature, context) => {
        const coords = anchors(feature);
        if (coords.length < 2) return [];
        if (coords.length < 4) return [];
        const half = Math.hypot(coords[1][0] - coords[0][0], coords[1][1] - coords[0][1]);
        return axisAmplifiers(feature, context, coords, 3, half, twistBehindHead(coords[2], coords.slice(3)));
    };
}

/**
 * The axis-of-advance family and the infiltration lane: one "name  DTG" line on
 * the centerline.
 *
 * The axes set it right-aligned just behind the arrowhead, so it reads back down
 * the channel; the infiltration lane centers it on the span instead, because it
 * has no arrowhead to sit behind.
 */
/**
 * The avenue of approach's amplifier: `AA` and whatever the operator called it, set just
 * behind the arrowhead.
 *
 * Placed like an axis of advance's — same clearance, same proportional scale — but it
 * carries a **fixed prefix** where that family carries none, so it cannot simply be
 * another entry in `AXIS_OF_ADVANCE_LABELS`. The plate reads `AA` followed by field T.
 */
/** The gap between the arrow's casing and field H, in screen pixels. */
const AVENUE_ADDITIONAL_INFO_GAP_PX = 12;

/**
 * `ENY` at the **rear end of each rail**, and only when the graphic is hostile.
 *
 * 152300's Template boxes an `N` on both parallels at the back of the symbol; the Example
 * draws the pair as `ENY`. Field N is the hostile marker and appears for a hostile graphic
 * and for no other -- the same reading the areas already take. The text stays in the label
 * colour: hostile *line work* goes red, hostile text amplifiers do not.
 * @see ai/decisions.md, the hostility colour rule
 *
 * The two anchors are the last two the generator publishes. A symbol drawn before this was
 * added -- or restored from a save -- carries only the head span, so anything short of four
 * anchors simply paints nothing rather than guessing where the rails were.
 */
function avenueHostileMarks(feature: PaintFeature, context: PaintContext, coords: ProjectedPosition[]): Paint[] {
    if (hostilityOf(feature) !== TacticalGraphicHostility.hostileFaker) return [];
    if (coords.length < 4) return [];

    const [, , left, right] = coords;
    const midX = (left[0] + right[0]) / 2;
    const midY = (left[1] + right[1]) / 2;
    const scale = spanProportionalScale(coords[0], coords[1], context.resolution, BASE_FONT_SIZE_PX);
    const gap = AVENUE_ADDITIONAL_INFO_GAP_PX * context.resolution;

    return [left, right].map(rail => {
        // Pushed straight out from the centreline, so each mark clears its own rail whichever
        // way the arrow was drawn. A rail lying on the centreline has no outward side; it
        // then stays put rather than flying off in whatever direction a zero-length normal
        // normalizes to.
        const dx = rail[0] - midX;
        const dy = rail[1] - midY;
        const len = Math.hypot(dx, dy);
        const at: ProjectedPosition = len === 0 ? rail : [rail[0] + (dx / len) * gap, rail[1] + (dy / len) * gap];
        return text(feature, at, 'ENY', scale);
    });
}

export function avenueOfApproachLabelPaint(): MovementPaint {
    return (feature, context) => {
        const coords = anchors(feature);
        if (coords.length < 2) return [];

        const [c0, c1] = coords;
        // The literal and field T, and nothing else on this line: 152300's Template carries
        // no `W`/`W1`. An imported bag can still hold a `startDate` for a symbol with nowhere
        // to put one, and painting it anyway is how a field nobody offered ends up on the map.
        const label = feature.properties.designation?.trim();
        const paints = behindArrowhead(feature, context, coords, 4, ['AA', label].filter(Boolean).join(' '));

        /*
         * **Field H sits outside the upper rail, near the rear.** 152300's Template boxes it
         * there, clear of the line work, and notes that it "should be movable to avoid
         * obscuring key geographic information". It used to sit level with `AA` just behind
         * the head. The span this family publishes is one `radius` long, the arrow's
         * half-width, so offsetting by the span plus a fixed gap clears the rail at every
         * zoom and size; a hostile arrow's `ENY` takes that spot, so H stands one line further
         * out. Anchors 2 and 3 are the rails' rear ends; a feature without them keeps the
         * old place behind the head.
         */
        const additional = feature.properties.additionalInfo?.trim();
        if (additional && paints.length) {
            const span = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
            const halfWidthPx = span / context.resolution;
            const scale = spanProportionalScale(c0, c1, context.resolution, BASE_FONT_SIZE_PX);
            const hostile = hostilityOf(feature) === TacticalGraphicHostility.hostileFaker;
            const rear: ProjectedPosition = coords.length >= 4
                ? [(coords[2][0] + coords[3][0]) / 2, (coords[2][1] + coords[3][1]) / 2]
                : [c1[0] - ((c1[0] - c0[0]) / span) * ARROWHEAD_LABEL_CLEARANCE_PX * context.resolution,
                    c1[1] - ((c1[1] - c0[1]) / span) * ARROWHEAD_LABEL_CLEARANCE_PX * context.resolution];
            const outPx = halfWidthPx + AVENUE_ADDITIONAL_INFO_GAP_PX + (hostile ? BASE_FONT_SIZE_PX * scale + AVENUE_ADDITIONAL_INFO_GAP_PX : 0);
            // Turned to the rear segment of the center line (published from anchor 4), not the head's.
            const [a, b] = coords.length >= 6 ? [coords[4], coords[5]] : [c0, c1];
            const at = offsetAbove(rear, a, b, context.resolution, outPx);
            paints.push(
                text(feature, at, additional, scale, {
                    rotation: uprightRotation(a, b),
                    // Reading forward from the rear, toward the head.
                    align: alignAlong(coords.length >= 4 ? 'left' : 'right', a, b),
                    // Free text the operator typed, so "name only" takes it away. The `AA`
                    // literal and the `ENY` marks are the symbol and stay.
                    kind: 'amplifier',
                }),
            );
        }

        return paints.concat(avenueHostileMarks(feature, context, coords));
    };
}

export function axisOfAdvanceLabelPaint(name: TacticalGraphicName): MovementPaint {
    const centered = name === TacticalGraphicName.InfiltrationLane;

    return (feature, context) => {
        const coords = anchors(feature);
        if (coords.length < 2) return [];

        const [c0, c1] = coords;
        const dx = c1[0] - c0[0];
        const dy = c1[1] - c0[1];
        const segLenMap = Math.hypot(dx, dy);
        if (segLenMap === 0) return [];

        if (!centered) return axisAmplifiers(feature, context, coords, 2, segLenMap);

        const value = nameAndDate(feature);
        if (!value) return [];

        const ux = dx / segLenMap;
        const uy = dy / segLenMap;
        const clearance = 10 * context.resolution;

        const at: ProjectedPosition = centered
            ? [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2]
            : [c1[0] - ux * clearance, c1[1] - uy * clearance];

        const align: 'left' | 'center' | 'right' = centered ? 'center' : alignAlong('right', c0, c1);

        const straight = text(feature, at, value, spanProportionalScale(c0, c1, context.resolution, BASE_FONT_SIZE_PX), {
            rotation: uprightRotation(c0, c1),
            align,
        });
        return onArrow(context, coords, 2, straight, centered ? 'center' : 'end');
    };
}

/**
 * The attack-helicopter axis of advance: the name-and-date line, plus the
 * helicopter symbol drawn at the arrow's twist point.
 *
 * The only member of this family whose label feature carries **drawn geometry**
 * rather than only text, which is why it cannot fall through to the default —
 * doing so silently dropped the symbol and left a bare designation.
 *
 * Anchor layout, published by the generator: `[0..1]` is the text span, `[2]` the
 * twist center, `[3]` a point giving the direction. The symbol's heading runs from
 * the direction point *toward* the center, and the stalk stands on whichever
 * perpendicular points up on screen — north is up in EPSG:3857, so the
 * perpendicular with a positive sine is the one to keep.
 *
 * Sizes are fractions of the text span, so the symbol scales with the arrow.
 */
export function attackHelicopterAxisLabelPaint(): MovementPaint {
    return (feature, context) => {
        const coords = anchors(feature);
        if (coords.length < 4) return [];

        const [x0, y0] = coords[0];
        const [x1, y1] = coords[1];
        const [cx, cy] = coords[2];
        const [dx3, dy3] = coords[3];

        const paints: Paint[] = [];

        const tdx = x1 - x0;
        const tdy = y1 - y0;
        paints.push(...axisAmplifiers(feature, context, coords, 4, Math.hypot(tdx, tdy), twistBehindHead(coords[2], coords.slice(4))));

        const heading = Math.atan2(cy - dy3, cx - dx3);
        // Half-size reference: the text span is the arrow's radius in map units.
        const s = Math.hypot(tdx, tdy) * 0.5;

        // `lineColorOf`, not the old `get('hostilityColor') || default`. The two
        // differ only for a feature carrying an affiliation in its amplifier bag but
        // no stamped color — which is what restore produces — and there the old
        // form drew the symbol black on a hostile graphic. Same fix `readHostility`
        // made everywhere else. @see ai/context.md, "Reading a graphic's affiliation"
        const color = lineColorOf(feature);
        const stroke = {color, widthPx: LINE_WIDTH()};

        const off = (angle: number, dist: number): ProjectedPosition =>
            [cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist];

        let perpAngle = heading + Math.PI / 2;
        if (Math.sin(perpAngle) < 0) perpAngle += Math.PI;

        const stalkHalf = s;
        const lineTop = off(perpAngle, stalkHalf);
        const lineBottom = off(perpAngle + Math.PI, stalkHalf);
        paints.push({geometry: {type: 'LineString', coordinates: [lineBottom, lineTop]}, stroke});

        const baseHalfWidth = s * 0.3;
        paints.push({
            geometry: {
                type: 'LineString',
                coordinates: [
                    [lineBottom[0] + Math.cos(heading) * baseHalfWidth, lineBottom[1] + Math.sin(heading) * baseHalfWidth],
                    [lineBottom[0] - Math.cos(heading) * baseHalfWidth, lineBottom[1] - Math.sin(heading) * baseHalfWidth],
                ],
            },
            stroke,
        });

        const arrowTip = off(perpAngle, stalkHalf + s * 0.4);
        const arrowHalfWidth = s * 0.2;
        const arrowLeft: ProjectedPosition = [
            lineTop[0] + Math.cos(heading) * arrowHalfWidth,
            lineTop[1] + Math.sin(heading) * arrowHalfWidth,
        ];
        const arrowRight: ProjectedPosition = [
            lineTop[0] - Math.cos(heading) * arrowHalfWidth,
            lineTop[1] - Math.sin(heading) * arrowHalfWidth,
        ];
        paints.push({
            geometry: {type: 'Polygon', coordinates: [[arrowTip, arrowLeft, arrowRight, arrowTip]]},
            fill: {color},
            stroke,
        });

        return paints;
    };
}

/**
 * Advance to contact's amplifiers: APP-06 342900's `T` toward the rear and `W - W1` behind
 * the head, as separate groups. @see axisAmplifiers
 *
 * They used to be one centered `T     W - W1` line, because `movementLabelPaint` sets the
 * date a span further on and this arrow's span is only its half-width, so the two collided.
 * Placed along the published center line instead, they cannot.
 */
export function advanceToContactLabelPaint(): MovementPaint {
    return (feature, context) => {
        const coords = anchors(feature);
        if (coords.length < 2) return [];
        return axisAmplifiers(feature, context, coords, 2, Math.hypot(coords[1][0] - coords[0][0], coords[1][1] - coords[0][1]));
    };
}

/**
 * The default movement label: the designation on the first span, with the
 * date-time group on a second span shifted one span-length further along.
 *
 * Shifting by a whole span rather than a pixel offset is what keeps the two lines
 * from colliding as the label grows — both are span-proportional, so a fixed gap
 * would be right at exactly one arrow length.
 */
export function movementLabelPaint(): MovementPaint {
    return (feature, context) => {
        const coords = anchors(feature);
        if (coords.length < 2) return [];

        const paints: Paint[] = [];
        const [c0, c1] = coords;
        const scale = spanProportionalScale(c0, c1, context.resolution, DEFAULT_LABEL_FONT_PX);
        const rotation = uprightRotation(c0, c1);
        const midpoint: ProjectedPosition = [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2];

        paints.push(text(feature, midpoint, feature.properties.designation ?? '', scale, {rotation, halo: false}));

        const date = areaDateLabel(feature);
        if (date) {
            const dx = c1[0] - c0[0];
            const dy = c1[1] - c0[1];
            paints.push(text(feature, [midpoint[0] + dx, midpoint[1] + dy], date, scale, {rotation, halo: false}));
        }

        return paints;
    };
}

/**
 * The plain line work for a movement graphic: one stroke in the affiliation
 * color.
 *
 * Most of the family renders this way — the shape is entirely in the geometry the
 * generator returned. Infiltration, envelopment and mobile defense have bespoke
 * line work and are not routed here.
 */
export function movementGraphicPaint(): MovementPaint {
    return feature => {
        const stroke = {color: lineColorOf(feature), widthPx: LINE_WIDTH()};
        // The counterattacks, the feint and the fords dash some of their parts as the
        // symbol itself, whatever their status. @see DASHED_PARTS
        if (feature.geometry.type === 'MultiLineString') return strokeParts(feature.properties.name, feature.geometry.coordinates, stroke);
        return [{
            geometry: feature.geometry.type === 'GeometryCollection'
                ? {type: 'MultiLineString', coordinates: []}
                : feature.geometry,
            stroke,
        }];
    };
}

// ── the three that draw their own line work ─────────────────────────────────

/**
 * Screen-pixel half-gap cut around the letter on infiltration and envelopment.
 *
 * A flat count, the same rule breach and bypass use. It was once taken from the
 * arrowhead's wing-to-wing span, which is metric — so on a large graphic the hole
 * ran away from the capped letter it was meant to clear. **A gap belongs to the
 * label, not to the shape around it.**
 */
const APPROACH_GAP_PX = 10;

/** Where along the first segment the letter sits, matching `generateLabels`. */
const APPROACH_LABEL_POSITION = 0.25;

/**
 * The scale an approach's letter (envelopment's `E`, infiltration's `IN`) is drawn at, or
 * `0` once the graphic is too small to carry one, when the run is drawn whole. Asked by the
 * line work and by the label alike, so the gap is always the letter's. @see letterInGapScale
 *
 * The graphic's size is the longer side of its extent, which the line-work feature and the
 * label feature both carry, so the two halves measure the same thing on either engine; the
 * run's own length stands in when no extent is stamped.
 */
export function approachLetterScale(feature: PaintFeature, context: PaintContext, letter: string, runPx: number): number {
    const bounds = feature.bounds;
    // With neither a stamped extent nor a run to measure, the size is unknown: the letter is
    // never dropped for size, only under the legibility floor, rather than lost to a missing stamp.
    const graphicPx = bounds ? Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / context.resolution : runPx > 0 ? runPx : Infinity;
    return letterInGapScale(scaleOf(feature, context), textWidth(context, letter, fontStyle, 1), BASE_FONT_SIZE_PX, graphicPx);
}

/**
 * The line work of an approach with a letter set in it — infiltration and
 * envelopment.
 *
 * Sub-line `[0]` is the straight run the gap is cut from; everything after it is
 * drawn whole. Envelopment adds an arc between the two, which needs no special
 * handling — `rest` covers it.
 */
function approachPaint(letter: string): (f: PaintFeature, c: PaintContext) => Paint[] {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];
        const coords = geometry.coordinates;
        if (coords.length < 2) return [];

        const stroke = {color: lineColorOf(feature), widthPx: LINE_WIDTH()};
        const line = coords[0];
        const rest = coords.slice(1);
        const asLine = (c: ProjectedPosition[]): Paint => ({geometry: {type: 'LineString', coordinates: c}, stroke});

        const [x0, y0] = line[0];
        const [x1, y1] = line[1];
        const dx = x1 - x0;
        const dy = y1 - y0;
        const length = Math.hypot(dx, dy);
        // Degenerate straight part — mid-draw with only two base points. Everything
        // else still draws, which is better than the graphic vanishing while it is
        // being made.
        if (length === 0) return rest.map(asLine);

        // No letter, no gap: the run closes into the bare shape. @see approachLetterScale
        const scale = approachLetterScale(feature, context, letter, length / context.resolution);
        if (!scale) return [asLine(line), ...rest.map(asLine)];

        const cx = x0 + dx * APPROACH_LABEL_POSITION;
        const cy = y0 + dy * APPROACH_LABEL_POSITION;
        const gap = letterGapClearance(APPROACH_GAP_PX, scale, configuredLabelScale()) * context.resolution;
        const ux = dx / length;
        const uy = dy / length;

        return [
            asLine([line[0], [cx - ux * gap, cy - uy * gap]]),
            asLine([[cx + ux * gap, cy + uy * gap], ...line.slice(1)]),
            ...rest.map(asLine),
        ];
    };
}

/** Infiltration: base line with a gap for "IN", then the arrowhead. */
export function infiltrationGraphicPaint(): (f: PaintFeature, c: PaintContext) => Paint[] {
    return approachPaint('IN');
}

/** Envelopment: straight run with a gap for "E", then the arc and the arrowhead. */
export function envelopmentGraphicPaint(): (f: PaintFeature, c: PaintContext) => Paint[] {
    return approachPaint('E');
}

/** Points in a closed triangle ring: three corners plus the repeated first. */
const TRIANGLE_RING_LENGTH = 4;

/**
 * Mobile defense: the teeth are **filled**, everything else is a line.
 *
 * A sub-line is a tooth when it closes on itself in four points — the generator
 * emits each triangle that way, and the arcs and the arrow never do. Testing the
 * shape rather than the index is what keeps this working when the generator adds
 * or drops a tooth, which it does with the size of the ellipse.
 */
export function mobileDefenseGraphicPaint(): (f: PaintFeature, c: PaintContext) => Paint[] {
    return feature => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];

        const color = lineColorOf(feature);
        const stroke = {color, widthPx: LINE_WIDTH()};

        return geometry.coordinates.map(ring => {
            const closed = ring.length === TRIANGLE_RING_LENGTH
                && ring[0][0] === ring[ring.length - 1][0]
                && ring[0][1] === ring[ring.length - 1][1];
            return closed
                ? {geometry: {type: 'Polygon' as const, coordinates: [ring]}, fill: {color}, stroke}
                : {geometry: {type: 'LineString' as const, coordinates: ring}, stroke};
        });
    };
}

/** How far a direction must lean off an axis (sin 22.5 degrees) to count as leaning. */
const LEANS_OFF_AXIS = Math.sin(Math.PI / 8);

/** How far past the pre-placed anchor the date sits, in screen pixels. */
const BRIDGE_DATE_GAP_PX = 12;

/**
 * Bridge, gap and assault crossing: the designation across the crossing, and the
 * date-time group beyond its far end.
 *
 * **Zoom-anchored, not span-proportional.** The rest of the movement family sizes
 * its designation against the arrow's on-screen span, which is right for a graphic
 * whose whole point is its length. A crossing is a mark on a route: its label is an
 * amplifier like any other and takes the ordinary capped scale. Sizing it by span
 * put a bridge's designation several times too large — invisible at the zoom it was
 * built at and obvious one level in, which is why it survived a single-zoom
 * comparison.
 *
 * The date is drawn **horizontal** whatever the crossing's bearing, and aligned so
 * it runs *away* from the graphic: `generateLabels` places the anchor beyond the
 * end, and centering text there would run it back over the crossing. A
 * more-horizontal crossing therefore aligns left or right by direction; a
 * more-vertical one centers, because horizontal text at a point above or below the
 * end does not overlap the axis anyway.
 */
export function bridgeLabelPaint(): MovementPaint {
    return (feature, context) => {
        const coords = anchors(feature);
        if (coords.length < 2) return [];

        const [c0, c1] = coords;
        const dx = c1[0] - c0[0];
        const dy = c1[1] - c0[1];
        const scale = scaleOf(feature, context);

        const paints: Paint[] = [
            text(feature, c0, feature.properties.designation ?? '', scale, {rotation: uprightRotation(c0, c1)}),
        ];

        const date = areaDateLabel(feature);
        if (date) {
            const length = Math.hypot(dx, dy) || 1;
            const gap = BRIDGE_DATE_GAP_PX * context.resolution;
            const at: ProjectedPosition = [c1[0] + (dx / length) * gap, c1[1] + (dy / length) * gap];
            // The box grows away from the end in both directions, so its nearest corner is the
            // anchor: centred on a steep crossing it reached back over the flare tips.
            const [ux, uy] = [dx / length, dy / length];
            const align = ux > LEANS_OFF_AXIS ? 'left' : ux < -LEANS_OFF_AXIS ? 'right' : 'center';
            const baseline = uy > LEANS_OFF_AXIS ? 'bottom' : uy < -LEANS_OFF_AXIS ? 'top' : 'middle';
            paints.push(text(feature, at, date, scale, {align, baseline}));
        }

        return paints;
    };
}

