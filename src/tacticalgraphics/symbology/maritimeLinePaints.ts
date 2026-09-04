/**
 * # APP-06 §8.11 — the maritime control lines
 *
 * Ten symbols, and nine of them are one construction: a two-point run carrying a fixed
 * letter at its midpoint and field `H` beside point 2. What separates them is the letter,
 * and in one case a dash.
 *
 * **Every letter was read off its own Template at 900 dpi and two defeat the obvious
 * guess** — the electro-optical intercept letters `O`, not `EO`, and the radio direction
 * finder spells `RDF` out. They live in `getLabel`, which is where a symbol's own text
 * lives for every other family here. @see BEARING_LINE_DASHED for the tenth difference.
 *
 * The navigational rhumb line is not one of them and gets its own paint: its two amplifiers
 * are placed by a rule no other line in the library follows. @see rhumbLinePaint
 */
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {paintLineWork} from '../core/paint';
import {BASE_FONT_SIZE_PX} from '../core/config';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicName, getLabel} from '../core/type';
import {DECORATION_MIN_PX, textWidth, uprightRotation} from './decorations';
import {amplifierDash, labelColorOf, lineColorOf, scaleOf} from './paintFunctions';

type LinePaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/**
 * The bearing lines APP-06 draws **broken**, and the only thing that separates them from a
 * solid sibling.
 *
 * One member: 220104, acoustic (ambiguous). It carries the letter `A` — the *same* letter
 * as 220103, acoustic — and the plates differentiate the pair by the dash and nothing else.
 * That makes this table the whole of the difference between two symbols, which is exactly
 * the shape of defect that let the mined anti-tank ditch render identically to the unmined
 * one for months. `maritimeLinePaints.test.ts` asserts the two cannot come out the same.
 *
 * Exported because it is a symbology fact, not a rendering one: both engines read it here
 * rather than each deciding. @see ai/conventions.md, "A symbology fact never lives in a
 * holder"
 */
export const BEARING_LINE_DASHED: readonly TacticalGraphicName[] = [
    TacticalGraphicName.BearingLineAcousticAmbiguous,
];

/** The broken bearing line's pattern, in screen pixels. */
const BEARING_DASH_PX = [14, 9];

/**
 * Clear space either side of the type letter inside the line's break, in screen pixels.
 *
 * **The letter sits *on* the line, in a gap cut for it — not above it.** The gap is measured
 * from the glyph, the way the arc mission tasks cut theirs, rather than being a fixed slice
 * of the run: `EW` and `RDF` are two and three characters against `B`'s one, and a hole
 * sized for the widest would gape around the narrowest. @see arcMissionTaskPaint, which
 * makes the same argument for a circle. (User's call, 2026-09-04.)
 */
const LETTER_PADDING_PX = 5;

/**
 * The most of the run the letter's break may consume.
 *
 * A guard, not a design input. The label scale is capped, so on a short enough line the
 * measured gap can exceed the line itself — and two negative-length stubs draw as nothing
 * at all, which reads as a missing symbol rather than a tight one. Past this the gap
 * shrinks and the letter overlaps its own line, which is the lesser failure.
 */
const MAX_GAP_SHARE = 0.7;

/** How far off the line field `H` sits, in screen pixels. */
const INFO_OFFSET_PX = 13;

/** The run, as its two extreme ends. A bearing line has no vertices between them. */
function ends(feature: PaintFeature): [ProjectedPosition, ProjectedPosition] | null {
    const lines = paintLineWork(feature.geometry);
    const path = lines[0];
    if (!path || path.length < 2) return null;
    return [path[0], path[path.length - 1]];
}

/**
 * A point `along` the run (0 at point 1, 1 at point 2) and `acrossPx` screen pixels to the
 * **left** of point 1 → point 2. A negative `acrossPx` puts it to the right.
 */
function beside(
    from: ProjectedPosition,
    to: ProjectedPosition,
    along: number,
    acrossPx: number,
    resolution: number,
): ProjectedPosition | null {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy);
    if (length === 0) return null;
    const across = acrossPx * resolution;
    return [
        from[0] + dx * along + (-dy / length) * across,
        from[1] + dy * along + (dx / length) * across,
    ];
}

/**
 * APP-06 220100–220108 — a bearing line: a plain run, its type letter beside the midpoint,
 * and field `H` beside point 2.
 *
 * The letter is **upright**, not laid along the run. `uprightRotation` keeps it readable
 * whichever way the bearing was taken, which matters more here than on most lines: a
 * bearing is drawn toward a contact and points in every direction of the compass by design.
 */
export function bearingLinePaint(name: TacticalGraphicName): LinePaint {
    const letter = getLabel(name);
    const dashed = BEARING_LINE_DASHED.includes(name);

    return (feature, context) => {
        const run = ends(feature);
        if (!run) return [];
        const [from, to] = run;

        const color = lineColorOf(feature);
        const scale = scaleOf(feature, context);
        const rotation = uprightRotation(from, to);
        const stroke = {color, widthPx: LINE_WIDTH(),
            // A planned or suspected line is dashed too; the two patterns do not stack, and
            // the doctrinal one wins because it is what names the symbol.
            dashPx: dashed ? BEARING_DASH_PX : amplifierDash(feature)};

        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        const length = Math.hypot(dx, dy);

        /*
         * Half the hole the letter needs, in projected metres — measured from the glyph
         * actually being drawn, then capped so it can never eat the whole run.
         *
         * `MAX_GAP_SHARE` is the guard that matters: text scale is clamped, so on a short
         * line the measured gap can exceed the line's own length, and the two stubs would
         * come out with negative length and draw as nothing. A symbol that vanishes when
         * you draw it small is worse than one whose letter crowds its line.
         */
        const halfGap = letter
            ? Math.min(
                  (textWidth(context, letter, fontStyle, scale) / 2 + LETTER_PADDING_PX * scale) * context.resolution,
                  (length * MAX_GAP_SHARE) / 2,
              )
            : 0;

        const paints: Paint[] = [];
        if (halfGap > 0 && length > 0) {
            // Two stubs with the letter between them. Both carry the same stroke, so the
            // dash that separates 220104 from 220103 survives the break.
            const along = (t: number): ProjectedPosition => [from[0] + dx * t, from[1] + dy * t];
            const half = 0.5 - halfGap / length;
            paints.push({geometry: {type: 'LineString', coordinates: [from, along(half)]}, stroke});
            paints.push({geometry: {type: 'LineString', coordinates: [along(1 - half), to]}, stroke});
        } else {
            paints.push({geometry: {type: 'LineString', coordinates: [from, to]}, stroke});
        }

        const text = (at: ProjectedPosition, value: string, align: 'center' | 'right', kind?: 'amplifier'): Paint => ({
            geometry: {type: 'Point', coordinates: at},
            text: {
                text: value,
                font: fontStyle,
                fill: labelColorOf(feature),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                rotation,
                align,
                baseline: 'middle',
                scale,
                kind,
            },
        });

        /*
         * The letter sits **on the line**, centred in the gap just cut for it.
         *
         * It is left **doctrinal**: it is not something an operator typed, it is what names
         * the symbol, and hiding it would turn nine distinct graphics into one anonymous
         * line. @see withHiddenAmplifiers, which defaults to keeping a mark for that reason.
         */
        if (letter) paints.push(text([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], letter, 'center'));

        /*
         * `H` is **right-justified against point 2**, so it ends where the line ends and
         * never runs past it — which is what it did while it was centred at a fixed fraction
         * along the run: a long value overhung the end by however long it happened to be.
         * Anchoring the *right edge* at point 2 makes the overhang impossible by
         * construction rather than by choosing a fraction that usually works.
         *
         * It stays on the opposite side of the line from the letter, which is what the
         * Template shows and what keeps the two clear of each other on a short line. And it
         * has to declare itself an amplifier, or "hide amplifiers" leaves the operator's own
         * annotation on the map.
         */
        const info = feature.properties.additionalInfo;
        const infoAt = info && beside(from, to, 1, -INFO_OFFSET_PX * scale, context.resolution);
        if (info && infoAt) paints.push(text(infoAt, String(info), 'right', 'amplifier'));

        return paints;
    };
}

/**
 * The navigational line's tick, as a fraction of the run it sits on -- **measured, then
 * turned into a screen size**.
 *
 * Off the Template at 600 dpi: the bar is 802 px, both ticks fit at 40.0 and 40.4 degrees
 * above the bar's own direction, and they run 0.344 and 0.327 of the bar's length. The
 * angle is one number to two decimals across both; the *length* is not, because
 * "the symbol varies only in length" makes the ticks a constant and the bar the variable.
 * So the angle is kept exactly and the length is expressed in pixels.
 */
const NAVIGATIONAL_TICK_ANGLE_DEG = 40;

/**
 * How long each tick is, **as a share of the bar** -- so the whole symbol scales with a
 * resize rather than growing a longer bar between two fixed marks.
 *
 * Measured, and the measurement is the reason this is a share at all. The tick and the bar
 * are the only two lengths the figure has, and both plate columns state them: at 600 dpi the
 * Template is a 787 px bar with a 286 px tick and the Example a 1072 px bar with a 369 px
 * one -- **bars differing by 36%, ratios of 0.364 and 0.344**. A fixed size would have held
 * the tick and changed the ratio; it did not.
 *
 * This was a screen constant first, on the plate's *"the symbol varies only in length"* and
 * this repo's own convention that such a phrase names a screen size. That reading was wrong
 * here: the sentence says which dimensions a user may change -- length, and not a width --
 * and says nothing about the furniture. Two columns drawn at two sizes do.
 * @see NAVIGATIONAL_TICK_ANGLE_DEG
 */
const NAVIGATIONAL_TICK_SHARE = 0.354;

/**
 * Navigational -- APP-06 218400.
 *
 * > This symbol requires two anchor points. Points 1 and 2 define the corner points of the
 * > symbol. […] The symbol varies only in length.
 *
 * A bar from point 1 to point 2 with a tick at each end, both at the same angle **above the
 * bar's own direction** and pointing the same way on screen: the one at point 1 leads
 * forward and up, the one at point 2 trails backward and down. Rotationally symmetric about
 * the bar's midpoint, which is what makes it read as one mark rather than two arrows.
 *
 * **Both ticks are on the same hand, and that is the whole shape.** Mirroring the second --
 * the obvious symmetry, and the one a careless reading produces -- draws a shallow `Z` with
 * both ends turning the same way up, which is a different figure. @see the Template.
 */
export function navigationalLinePaint(): LinePaint {
    return (feature, context) => {
        const run = ends(feature);
        if (!run) return [];
        const [from, to] = run;

        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        const length = Math.hypot(dx, dy);
        if (length === 0) return [];
        const ux = dx / length;
        const uy = dy / length;

        const stroke = {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)};
        const paints: Paint[] = [{geometry: {type: 'LineString', coordinates: [from, to]}, stroke}];

        const tick = length * NAVIGATIONAL_TICK_SHARE;
        // Below the floor the ticks are a thickening of the stroke rather than a symbol, and
        // a bare bar is the honest thing to draw. A proportional tick reaches this only when
        // the whole symbol is a few pixels long, where it is the right answer anyway.
        // @see DECORATION_MIN_PX
        if (tick / context.resolution < DECORATION_MIN_PX) return paints;
        const theta = (NAVIGATIONAL_TICK_ANGLE_DEG * Math.PI) / 180;
        // The bar's direction turned `theta` **anticlockwise in projected space**, where +y
        // is north -- so the tick rises on screen, which is the side the Template draws it.
        const tx = ux * Math.cos(theta) - uy * Math.sin(theta);
        const ty = ux * Math.sin(theta) + uy * Math.cos(theta);

        // Point 1: forward and up, away from the bar. Point 2: the same vector, negated, so
        // the second tick trails backward and down.
        paints.push({
            geometry: {type: 'LineString', coordinates: [from, [from[0] + tx * tick, from[1] + ty * tick]]},
            stroke,
        });
        paints.push({
            geometry: {type: 'LineString', coordinates: [to, [to[0] - tx * tick, to[1] - ty * tick]]},
            stroke,
        });
        return paints;
    };
}

/** How much room the rhumb line's box leaves around its text, in screen pixels. */
const BOX_PADDING_PX = 5;

/**
 * Clear space between the designation's box and the line itself, in screen pixels.
 *
 * **Measured to the nearest point of the box, not to its centre**, which is the whole point.
 * @see boxSupportPx
 */
const BOX_CLEARANCE_PX = 3;

/**
 * How far an **upright** box of half-size `halfW` x `halfH` reaches from its own centre in
 * the direction `(nx, ny)` — its support function.
 *
 * This exists because the box does not turn with the line. The plate fixes it upright ("T
 * ... should be oriented upright"), so as the run rotates, the part of the box facing the
 * line changes from an edge to a corner and back, and how far it reaches changes with it: a
 * box 30 x 13 reaches 13 toward a horizontal line and over 32 toward a diagonal one. A
 * single perpendicular offset is therefore only ever right at one bearing, and the box
 * crossed the line at the others.
 *
 * For an axis-aligned rectangle the answer is exact and cheap — `|nx|·halfW + |ny|·halfH` —
 * so the offset can be derived per render instead of padded by a guess.
 */
function boxSupportPx(nx: number, ny: number, halfW: number, halfH: number): number {
    return Math.abs(nx) * halfW + Math.abs(ny) * halfH;
}

/**
 * Amplifier `AN` for a rhumb line: the bearing of `from` → `to`, as the plate prints it.
 *
 * **Three digits, zero-padded, no degree sign and no unit** — `060`, which is what the
 * Example column of 220109 draws and what a navigational bearing is written as everywhere
 * else. The plate quotes attitudes in mils elsewhere in the standard; this one is degrees,
 * because the Example says so.
 *
 * Takes **projected** positions, and must: @see rhumbLinePaint for why the angle read off
 * EPSG:3857 metres is the bearing by definition rather than by approximation. Exported
 * because it is a symbology fact — the dialog's attitude read-out asks the same question,
 * and a second implementation of it would be free to drift.
 */
export function rhumbBearing(from: ProjectedPosition, to: ProjectedPosition): string {
    // Bearing is clockwise from north, so the arguments are (easting, northing) — the
    // transpose of the usual `atan2(dy, dx)`, which measures anticlockwise from east.
    const degrees = (Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI;
    // 360 reads as 000: a full turn is the same bearing, and the plate's field is 3 wide.
    return String(Math.round((degrees + 360) % 360) % 360).padStart(3, '0');
}

/**
 * APP-06 220109 — the navigational rhumb line.
 *
 * > Amplifier AN is to be displayed at the midpoint of the line and parallel to the line
 * > and to the North/West of the line. Amplifier T is to be displayed within a box and
 * > should be oriented upright and on the opposite side of the line from amplifier AN.
 *
 * Three things in that are unlike anything else in the library and each is done literally:
 *
 * - **`AN` runs *along* the line, not upright.** It is a bearing, and a bearing written
 *   across its own line reads as a label rather than as the direction it states.
 * - **North/west is a real side, not a convention.** Where a mark's side is ambiguous this
 *   repository puts it right of point 1 → point 2; here the standard names the side, so it
 *   is chosen from the run's own geometry — whichever perpendicular points north, falling
 *   back to west for a line running due north-south.
 * - **`T` is boxed**, and the box is measured from the glyph through
 *   `PaintContext.measureText` rather than guessed, so it fits the designation actually
 *   typed instead of a nominal width.
 */
export function rhumbLinePaint(): LinePaint {
    return (feature, context) => {
        const run = ends(feature);
        if (!run) return [];
        const [from, to] = run;

        const color = lineColorOf(feature);
        const paints: Paint[] = [{
            geometry: {type: 'LineString', coordinates: [from, to]},
            stroke: {color, widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)},
        }];

        /*
         * Which perpendicular is the northerly one — and the arithmetic is worth spelling
         * out, because the fallback was inverted on the first pass and looked right.
         *
         * The left of 1 → 2 is the unit vector `(-dy, dx)`, so its **northward** component is
         * `dx` and its **westward** component is `dy`. North decides whenever it can. When
         * the run is due north-south `dx` is zero, no side is north, and the rule's second
         * word takes over: left is the west side exactly when `dy` is positive.
         */
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        const length = Math.hypot(dx, dy);
        const northSign = (dx !== 0 ? Math.sign(dx) : Math.sign(dy)) || 1;

        const scale = scaleOf(feature, context);
        const fill = labelColorOf(feature);
        const halo = {color: getLabelHaloColor(), widthPx: HALO_WIDTH};

        /*
         * **`AN` is the drawn line's own bearing, derived — not an amplifier anyone types.**
         *
         * The plate's Example settles it twice over. Its `AN` reads `060` on a run whose two
         * anchor points bear 059° apart, and its Orientation clause says "orientation is
         * determined by the order in which the anchor points are entered". The number is the
         * geometry; there is nothing for an operator to enter that the line does not already
         * state, and a rhumb line without its bearing is just a line.
         *
         * That also makes it consistent with the rest of the library rather than novel:
         * `attitude` is a *read-out* everywhere it appears — the dialog renders it from
         * `measured.rotation` and offers no box — because the gesture, not the keyboard, is
         * what sets an attitude. Here the gesture is the drawing of the two points.
         *
         * **The derivation is exact, not an approximation.** A rhumb line is a course of
         * constant bearing, and that a such a course plots as a straight line whose angle is
         * that bearing is the defining property of the Mercator projection these coordinates
         * are already in. Reading `atan2` off the projected run is the definition, not a
         * small-angle stand-in for it — which is why this is one of the few places in the
         * repository where working in EPSG:3857 is more correct than turf would be.
         */
        const at = beside(from, to, 0.5, 11 * scale * northSign, context.resolution);
        if (at) {
            paints.push({
                geometry: {type: 'Point', coordinates: at},
                text: {
                    text: rhumbBearing(from, to),
                    font: fontStyle,
                    fill,
                    halo,
                    // Along the run, flipped upright so it never reads upside down.
                    rotation: uprightRotation(from, to),
                    align: 'center',
                    baseline: 'middle',
                    scale,
                },
            });
        }

        const designation = feature.properties.designation;
        if (designation) {
            const label = String(designation);
            const halfWpx = textWidth(context, label, fontStyle, scale) / 2 + BOX_PADDING_PX * scale;
            const halfHpx = BASE_FONT_SIZE_PX * scale * 0.5 + BOX_PADDING_PX * scale;

            /*
             * Push the box out by however far it actually reaches toward the line, plus the
             * clearance — so the gap is measured to its nearest corner or edge, whichever
             * happens to face the run at this bearing, and is the same at every bearing.
             *
             * `beside`'s `+across` is the left of point 1 -> point 2, i.e. the unit vector
             * `(-dy, dx) / length`; this asks the box how far it reaches along that axis.
             */
            const nx = -dy / (length || 1);
            const ny = dx / (length || 1);
            const offsetPx = boxSupportPx(nx, ny, halfWpx, halfHpx) + BOX_CLEARANCE_PX * scale;

            const at = beside(from, to, 0.5, -offsetPx * northSign, context.resolution);
            if (at) {
                const halfW = halfWpx * context.resolution;
                const halfH = halfHpx * context.resolution;
                paints.push({
                    geometry: {
                        type: 'Polygon',
                        coordinates: [[
                            [at[0] - halfW, at[1] - halfH],
                            [at[0] + halfW, at[1] - halfH],
                            [at[0] + halfW, at[1] + halfH],
                            [at[0] - halfW, at[1] + halfH],
                            [at[0] - halfW, at[1] - halfH],
                        ]],
                    },
                    stroke: {color, widthPx: LINE_WIDTH()},
                });
                paints.push({
                    geometry: {type: 'Point', coordinates: at},
                    text: {
                        text: label,
                        font: fontStyle,
                        fill,
                        halo,
                        // Upright, per the rule — the box turns with nothing.
                        align: 'center',
                        baseline: 'middle',
                        scale,
                    },
                });
            }
        }

        return paints;
    };
}

/** The nine graphics `bearingLinePaint` serves, in code order. */
export const BEARING_LINES: readonly TacticalGraphicName[] = [
    TacticalGraphicName.BearingLine,
    TacticalGraphicName.BearingLineElectronic,
    TacticalGraphicName.BearingLineElectromagneticWarfare,
    TacticalGraphicName.BearingLineAcoustic,
    TacticalGraphicName.BearingLineAcousticAmbiguous,
    TacticalGraphicName.BearingLineTorpedo,
    TacticalGraphicName.BearingLineElectroOpticalIntercept,
    TacticalGraphicName.BearingLineJammer,
    TacticalGraphicName.BearingLineRadioDirectionFinder,
];
