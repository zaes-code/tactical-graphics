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

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {BASE_FONT_SIZE_PX} from '../core/config';
import {maxGraphicLabelScale} from '../core/symbology';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicName} from '../core/type';
import {alignAlong, uprightRotation} from './decorations';
import {areaDateLabel} from './areaLabelPaints';
import {lineColorOf, scaleOf, labelColorOf} from './paintFunctions';

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
    extra: {rotation?: number; align?: 'left' | 'center' | 'right'; halo?: boolean} = {},
): Paint {
    return {
        geometry: {type: 'Point', coordinates: at},
        text: {
            text: value,
            font: fontStyle,
            fill: labelColorOf(feature),
            halo: extra.halo === false ? undefined : {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
            rotation: extra.rotation,
            align: extra.align ?? 'center',
            baseline: 'middle',
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
        return [text(feature, [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t], letter, scale, {rotation, align: options.align ?? 'center'})];
    };
}

/** Infiltration: "IN" between the first two anchors, upright-flipped. */
export const infiltrationLabelPaint = (): MovementPaint => fixedLetterPaint('IN', {atMidpoint: true});

/**
 * Envelopment: "E" a quarter of the way along the approach, following the raw angle.
 *
 * The anchors are the run's two ends, so the quarter point is computed on the projected
 * segment — the same one `approachPaint` cuts its gap in, at the same fraction.
 * @see APPROACH_LABEL_POSITION, Envelopment.generateLabels
 */
export const envelopmentLabelPaint = (): MovementPaint =>
    fixedLetterPaint('E', {atMidpoint: true, keepFlip: true, atFraction: APPROACH_LABEL_POSITION});

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

/** Turning movement: "T" starting at the arrowhead base. */
export const turningMovementLabelPaint = (): MovementPaint => fixedLetterPaint('T');

/** Frontal attack: "A" starting at the arrowhead base. */
export const frontalAttackLabelPaint = (): MovementPaint => fixedLetterPaint('A');

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
        return behindArrowhead(feature, context, coords[0], coords[1], label ? `CATK ${label}` : 'CATK');
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
    c0: ProjectedPosition,
    c1: ProjectedPosition,
    value: string,
): Paint[] {
    const dx = c1[0] - c0[0];
    const dy = c1[1] - c0[1];
    const span = Math.hypot(dx, dy);
    if (span === 0 || !value) return [];

    const clearance = ARROWHEAD_LABEL_CLEARANCE_PX * context.resolution;
    const at: ProjectedPosition = [c1[0] - (dx / span) * clearance, c1[1] - (dy / span) * clearance];
    return [text(feature, at, value, spanProportionalScale(c0, c1, context.resolution, BASE_FONT_SIZE_PX), {
        rotation: uprightRotation(c0, c1),
        align: alignAlong('right', c0, c1),
    })];
}

/**
 * The aviation axis of advance: name and date on one line at the start of the
 * arrow, sized to the span.
 */
export function aviationAxisLabelPaint(): MovementPaint {
    return (feature, context) => {
        const coords = anchors(feature);
        if (coords.length < 2) return [];
        const value = nameAndDate(feature);
        if (!value) return [];

        /*
         * **`alignAlong`, not a fixed `'left'`.** The rotation is kept upright, so an arrow
         * pointing west has its text turned through 180 degrees — and a left-aligned block
         * then runs *away* from the shaft instead of along it. Drawn west, the name and the
         * date ended up off the tail entirely and reading in the wrong order against the
         * arrow. The helper flips the alignment exactly when the rotation flipped.
         */
        return [text(feature, coords[0], value, spanProportionalScale(coords[0], coords[1], context.resolution, BASE_FONT_SIZE_PX), {
            rotation: uprightRotation(coords[0], coords[1]),
            align: alignAlong('left', coords[0], coords[1]),
        })];
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
export function avenueOfApproachLabelPaint(): MovementPaint {
    return (feature, context) => {
        const coords = anchors(feature);
        if (coords.length < 2) return [];

        const [c0, c1] = coords;
        // The literal and field T, and nothing else: 152300's Template carries no `W`/`W1`.
        // An imported bag can still hold a `startDate` for a symbol with nowhere to put one,
        // and painting it anyway is how a field nobody offered ends up on the map.
        const label = feature.properties.designation?.trim();
        return behindArrowhead(feature, context, c0, c1, ['AA', label].filter(Boolean).join(' '));
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

        const value = nameAndDate(feature);
        if (!value) return [];

        const ux = dx / segLenMap;
        const uy = dy / segLenMap;
        const clearance = 10 * context.resolution;

        const at: ProjectedPosition = centered
            ? [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2]
            : [c1[0] - ux * clearance, c1[1] - uy * clearance];

        const align: 'left' | 'center' | 'right' = centered ? 'center' : alignAlong('right', c0, c1);

        return [text(feature, at, value, spanProportionalScale(c0, c1, context.resolution, BASE_FONT_SIZE_PX), {
            rotation: uprightRotation(c0, c1),
            align,
        })];
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
        const value = nameAndDate(feature);
        if (value) {
            paints.push(text(feature, [x0, y0], value, spanProportionalScale(coords[0], coords[1], context.resolution, BASE_FONT_SIZE_PX), {
                rotation: uprightRotation(coords[0], coords[1]),
                align: alignAlong('left', coords[0], coords[1]),
            }));
        }

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
 * Advance to contact's amplifiers: APP-06 342900's `T` and `W . W1`, on one line
 * centered along the body.
 *
 * **One line, not two, and that is the point.** `movementLabelPaint` puts the date on a
 * second span offset by `c1 - c0`, which works for the crossing graphics because their
 * label anchors are a whole segment apart. This arrow's anchors come from
 * `labelCoordsAtFraction`, so they sit its own half-width apart — a few pixels — and the
 * date lands on top of the designation. Joining them through `nameAndDate` cannot
 * collide however wide the arrow is drawn.
 */
export function advanceToContactLabelPaint(): MovementPaint {
    return (feature, context) => {
        const coords = anchors(feature);
        if (coords.length < 2) return [];

        const [c0, c1] = coords;
        const value = nameAndDate(feature);
        if (!value) return [];

        const at: ProjectedPosition = [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2];
        // The ceiling moved into `spanProportionalScale`, where every caller gets it. This
        // label is the longest in the family — a designation and two date-time groups — so
        // it was the first to outgrow the symbol it names, and for a while the only one
        // capped. @see spanProportionalScale
        const scale = spanProportionalScale(c0, c1, context.resolution, BASE_FONT_SIZE_PX);
        return [text(feature, at, value, scale, {rotation: uprightRotation(c0, c1), align: 'center'})];
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
    return feature => [{
        geometry: feature.geometry.type === 'GeometryCollection'
            ? {type: 'MultiLineString', coordinates: []}
            : feature.geometry,
        stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
    }];
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
 * The line work of an approach with a letter set in it — infiltration and
 * envelopment.
 *
 * Sub-line `[0]` is the straight run the gap is cut from; everything after it is
 * drawn whole. Envelopment adds an arc between the two, which needs no special
 * handling — `rest` covers it.
 */
function approachPaint(): (f: PaintFeature, c: PaintContext) => Paint[] {
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

        const cx = x0 + dx * APPROACH_LABEL_POSITION;
        const cy = y0 + dy * APPROACH_LABEL_POSITION;
        const gap = APPROACH_GAP_PX * context.resolution;
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
    return approachPaint();
}

/** Envelopment: straight run with a gap for "E", then the arc and the arrowhead. */
export function envelopmentGraphicPaint(): (f: PaintFeature, c: PaintContext) => Paint[] {
    return approachPaint();
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
            const align = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'left' : 'right') : 'center';
            paints.push(text(feature, at, date, scale, {align}));
        }

        return paints;
    };
}

