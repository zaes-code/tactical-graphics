/**
 * # The axis arrows keep their width as a coordinate
 *
 * APP-06 describes eleven of this library's arrows by a run of anchor points and one more
 * beside them, and 152300 avenue of approach is the type specimen — the sentence is repeated
 * word for word across the family:
 *
 * > **Anchor Points.** The symbol requires N anchor points, where N is between 3 and 50.
 * > Point 1 defines the tip of the arrowhead. Point N-1 defines the rear of the symbol.
 * > **Point N defines the back of the arrowhead.**
 * >
 * > **Size/Shape.** Points 1 through N-1 and 2 determine the symbol's centreline and
 * > **Point N determines the width.**
 *
 * So the minimum is three coordinates, not two, and the last of them is not a route point: it
 * is where the width grip sits. `drawOrder.ts` has said so since the bases were renumbered —
 * *"APP-06 spends its last point on the arrow's width; this library carries width as a `width`
 * amplifier in metres instead, which is a different divergence and not one a reversal can
 * fix"* — and this module is that divergence closed.
 *
 * ## Why it is worth closing
 *
 * A `width` filed beside a base that already describes the width is a second copy of one
 * number, and the two drift. `carriesSeparationInBase` is the library's own name for that
 * defect and these eleven now answer to it, alongside the demolition block, the seven cane
 * arrows, 152800 and the two-rail crossings.
 *
 * ## The one thing a fixed vertex count cannot say
 *
 * Every other member of that predicate has a `baseVertexCount`, and the rule falls out of it:
 * three points, so the third is the side. These eleven have **no** fixed count — the plate
 * allows anything from 3 to 50 — so "which coordinate is the width" cannot be derived from a
 * number. It is stated instead, and the statement is positional:
 *
 * > **The last coordinate is the width point, and a base holding exactly two has none.**
 *
 * Two coordinates is a save written before 2026-09-10, when the width was an amplifier. That
 * is the whole of the legacy shape, and {@link upgradeAxisBase} is where it is repaired — at
 * a restore, which is the only door that can see both the coordinates and the `width` beside
 * them. A *bent* legacy axis is the one case the rule reads wrong on its own, which is why
 * the snapshot version was raised to 2: a reader that knows the file is older converts before
 * anything else looks at it. @see SNAPSHOT_VERSION
 *
 * ## What a drag of that point means
 *
 * Its **distance across the axis**, and nothing else. The grip is republished square to the
 * axis at the tip end however it was dragged, so the along-axis component of a gesture is
 * discarded and dragging it through the axis gives the same width rather than a mirror.
 * `squareWidthPoint` is that rule, and it runs on every build through `normalizeDrawnBase`,
 * so a vertex drag on the point settles the same way a grip drag does. (User's call,
 * 2026-09-10.)
 */
import type {Feature, LineString, Position} from 'geojson';
import * as turf from './turf';
import geometryService from './GeometryService';
import {generatorOrder} from './drawOrder';
import {TacticalGraphicName} from './type';

/**
 * The eleven whose base carries the width as its last coordinate.
 *
 * Every one of them is an N-point arrow sharing 152300's anchor-point rule, and every one is
 * in `TIP_FIRST_GRAPHICS` — the axis runs tip to rear, and the width point sits at the *tip*
 * end, which is where the Template draws `PT N`'s leader.
 *
 * `MobileDefense` and `InfiltrationLane` are deliberately absent although they share the
 * generator: each has a fixed three-point base whose point 3 is a placed anchor the plate
 * numbers differently, and both already answer `carriesSeparationInBase` through their vertex
 * count. The two-rail crossings and the demolition block are absent for the same reason.
 */
const AXIS_WIDTH_POINT_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.AviationAxisOfAdvance,          // 151401
    TacticalGraphicName.AttackHelicopterAxisOfAdvance,  // 151402
    TacticalGraphicName.MainAxisOfAdvance,              // 151403
    TacticalGraphicName.SupportingAxisOfAdvance,        // 151404
    TacticalGraphicName.MainAxisOfAdvanceFeint,         // 151406
    TacticalGraphicName.AvenueOfApproach,               // 152300
    TacticalGraphicName.FrontalAttack,                  // 152700
    TacticalGraphicName.TurningMovement,                // 152900
    TacticalGraphicName.Counterattack,                  // 340600
    TacticalGraphicName.CounterattackByFire,            // 340700
    TacticalGraphicName.AdvanceToContact,               // 342900
];

/** Whether this graphic's base carries its width as its **last** coordinate. */
export function carriesWidthPointInBase(name: TacticalGraphicName | string | undefined): boolean {
    return name !== undefined && AXIS_WIDTH_POINT_GRAPHICS.includes(name as TacticalGraphicName);
}

/**
 * How far a **by-fire** bracket stands inside point 1, and how long its shaft is, as multiples
 * of the half-width.
 *
 * Here rather than in the generator because 340700's overhang is *the sum of these two plus
 * the arrow's own*, and its doc says why in as many words: both terms are what
 * `generateGraphics` steps along the axis with, so stating the overhang as the sum is what
 * stops the head drifting off the operator's click if the bracket is ever redrawn. Splitting
 * the sum from its terms across two modules would have undone exactly that.
 */
export const BY_FIRE_STANDOFF = 0.8;
/** @see BY_FIRE_STANDOFF */
export const BY_FIRE_SHAFT = 1.05;

/**
 * The half-width a freshly drawn axis arrow opens at, in **screen pixels** at the zoom it was
 * drawn at.
 *
 * Both engines already spent this number and each stated it separately — the OpenLayers factory
 * as `20 * groundLength(resolution, latitude)` and MapLibre's adapter as
 * `drawingResolution * DEFAULT_OFFSET_PX`. That was harmless while the answer went into an
 * amplifier each engine derived for itself; it is a *coordinate* now, and two statements of the
 * figure that places it would be two different bases from the same three clicks. The renderer
 * still supplies the conversion, because only it knows the zoom. @see axisBaseFromDraw
 */
export const DEFAULT_AXIS_HALF_WIDTH_PX = 20;

/** What `MovementGraphicBase` draws unless the table below says otherwise. @see TIP_OVERHANG */
export const DEFAULT_TIP_OVERHANG = 1.5;

/**
 * How far past the end of the arrow **body** the arrowhead's point sits, as a multiple of the
 * half-width.
 *
 * It was a protected field on `MovementGraphicBase` and three of its subclasses, which is where
 * the generators read it and is no longer the only place that needs it: the width point is
 * drawn off the *trimmed* centreline, so anything republishing that point — a renderer's grip
 * drag, a draw, a sample sheet — has to spend the same overhang or the grip lands somewhere the
 * ink is not.
 *
 * The default is what every solid-head arrow in this family draws, and the body is built on the
 * user's line minus the overhang so the point lands exactly on the user's own last vertex. That
 * vertex is the only thing a renderer's vertex-editing tool can grab, so a head drawn past it
 * leaves the tip handle floating over nothing.
 *
 * The overrides are the graphics whose furthest-forward element is somewhere else: 151406's
 * dashed chevron reaches beyond its solid head, 340700 stands a by-fire bracket inside point 1,
 * and the two three-point members have no overhang at all because their head already lands on
 * the last vertex.
 */
const TIP_OVERHANG: Partial<Record<TacticalGraphicName, number>> = {
    // `computeFeintOutline` puts the dashed chevron's apex at 2.25 half-widths; trimming by
    // that much lands the apex on the user's last vertex rather than the solid head.
    [TacticalGraphicName.MainAxisOfAdvanceFeint]: 2.25,
    // @see BY_FIRE_STANDOFF, and `CounterattackByFire` for the plate reading behind the sum.
    [TacticalGraphicName.CounterattackByFire]: DEFAULT_TIP_OVERHANG + BY_FIRE_STANDOFF + BY_FIRE_SHAFT,
    [TacticalGraphicName.MobileDefense]: 0,
    [TacticalGraphicName.InfiltrationLane]: 0,
};

/** @see TIP_OVERHANG */
export function tipOverhangOf(name: TacticalGraphicName | string | undefined): number {
    const stated = name === undefined ? undefined : TIP_OVERHANG[name as TacticalGraphicName];
    return stated ?? DEFAULT_TIP_OVERHANG;
}

/**
 * The axis alone: the base without its width point.
 *
 * A two-coordinate base is all axis — it is a save from before the point existed — so it comes
 * back whole. Everything else loses its last coordinate.
 */
export function axisOf(name: TacticalGraphicName | string | undefined, coords: Position[] | undefined): Position[] {
    if (!coords) return [];
    if (!carriesWidthPointInBase(name) || coords.length < 3) return coords;
    return coords.slice(0, -1);
}

/** The width point, or `undefined` for a legacy two-coordinate base. */
export function widthPointOf(name: TacticalGraphicName | string | undefined, coords: Position[] | undefined): Position | undefined {
    if (!coords || !carriesWidthPointInBase(name) || coords.length < 3) return undefined;
    return coords[coords.length - 1];
}

/**
 * The half-width the base states, in **ground metres**, or `undefined` when it states none.
 *
 * Read as the width point's perpendicular distance from the axis, halved — the point is drawn
 * two half-widths off the centreline, one for the rail and one for the step across the back of
 * the arrowhead, which is the same `0.5` the renderers' `offsetScale` default has always been.
 *
 * Measured against the **infinite line** through the tip segment rather than the segment
 * itself, because the point sits `tipOverhang` half-widths *behind* the tip: `pointToLineDistance`
 * clamps to the segment's ends and would answer the distance to the tip instead on any arrow
 * drawn shorter than its own arrowhead.
 *
 * Sign is dropped deliberately. Dragging the grip through the axis gives the same width rather
 * than a mirror — these arrows have no side to fall on. (User's call, 2026-09-10.)
 */
export function halfWidthFromBase(name: TacticalGraphicName | string | undefined, coords: Position[] | undefined): number | undefined {
    const point = widthPointOf(name, coords);
    if (!point) return undefined;
    const axis = axisOf(name, coords);
    if (axis.length < 2) return undefined;
    // In generator order, so one measurement serves the read and the calibration the write runs.
    return halfWidthAcross(generatorOrder(name, axis), point);
}

/**
 * Where the width point belongs, for an axis **already in generator order** — rear to tip.
 *
 * The back corner of the arrowhead, which is what the Template letters `PT N`: one half-width
 * off the centreline for the rail and another across the back of the head, which is why the
 * renderers' `offsetScale` default of a half has always been the right sensitivity for a grip
 * drawn here.
 *
 * This is the arithmetic itself, taking the order a generator works in, so
 * `MovementGraphicBase.generateHandles` can call it with what it was handed. Everything
 * outside a generator wants {@link widthPointFor}, which speaks stored order.
 */
export function widthPointForBuiltAxis(built: Position[], halfWidth: number, overhang: number): Position | undefined {
    if (built.length < 2 || !(halfWidth > 0)) return undefined;

    let spend = halfWidth;
    let point = drawnWidthCorner(built, spend, overhang);
    for (let pass = 0; point && pass < WIDTH_CALIBRATION_PASSES; pass++) {
        const read = halfWidthAcross(built, point);
        if (!(read > 0)) break;
        if (Math.abs(read - halfWidth) / halfWidth < WIDTH_CALIBRATION_TOLERANCE) break;
        spend *= halfWidth / read;
        point = drawnWidthCorner(built, spend, overhang);
    }
    return point;
}

/** The corner itself, for a half-width spent on the drawing. @see widthPointForBuiltAxis */
function drawnWidthCorner(built: Position[], spend: number, overhang: number): Position | undefined {
    const centerline = geometryService.trimLineEnd(built, spend * overhang);
    if (centerline.length < 2) return undefined;
    const headSide = geometryService.computeParallelLineString(centerline, -spend);
    return geometryService.getPerpendicularPoint(headSide[headSide.length - 1], headSide[headSide.length - 2], -spend);
}

/**
 * The half-width a point states, measured against the **infinite line** through the tip
 * segment of an axis in generator order. The inverse {@link widthPointForBuiltAxis} calibrates
 * against, and the same measurement {@link halfWidthFromBase} makes in stored order.
 *
 * Against the infinite line rather than the segment, because the point sits `tipOverhang`
 * half-widths *behind* the tip: `pointToLineDistance` clamps to a segment's ends and would
 * answer the distance to the tip instead on any arrow drawn shorter than its own arrowhead.
 */
function halfWidthAcross(built: Position[], point: Position): number {
    const tip = built[built.length - 1];
    const next = built[built.length - 2];
    const reach = turf.distance(turf.point(tip), turf.point(point), {units: 'meters'});
    if (reach === 0) return 0;
    const offAxis = ((turf.bearing(turf.point(tip), turf.point(point))
        - turf.bearing(turf.point(tip), turf.point(next)) + 540) % 360) - 180;
    return Math.abs(reach * Math.sin((offAxis * Math.PI) / 180)) / 2;
}

/**
 * Where the width point belongs for a given half-width, taking the axis in **stored** order.
 *
 * The door everything outside a generator comes through — a renderer's grip drag, a draw, a
 * restore, a sample sheet — so the stored point and the grip the operator sees are one
 * coordinate rather than two that agree by coincidence.
 */
export function widthPointFor(name: TacticalGraphicName | string | undefined, axis: Position[], halfWidth: number): Position | undefined {
    return widthPointForBuiltAxis(generatorOrder(name, axis), halfWidth, tipOverhangOf(name));
}

/**
 * How close the written point's half-width has to read back before the calibration below
 * stops, and how many corrections it will spend getting there.
 *
 * Six, because the corrections are not all equally cheap: a straight axis lands inside the
 * tolerance on the first pass, while a bent one at 65 degrees north with 151406's 2.25 overhang
 * starts 48% out and needs five. The loop stops as soon as it is inside the tolerance, so the
 * common case still spends one.
 */
const WIDTH_CALIBRATION_PASSES = 6;
const WIDTH_CALIBRATION_TOLERANCE = 1e-9;

/**
 * The axis with its width point on the end, for a given half-width in **ground metres**.
 *
 * ## Why this is calibrated rather than computed once
 *
 * The point is placed where the *ink* is — through `computeParallelLineString`, which is what
 * draws the rail the corner sits on — and that function offsets in a projected frame, while
 * `halfWidthFromBase` reads the result back geodesically. The two disagree, by 0.13% on a
 * straight axis at 40 degrees north and by **48%** on a bent one at 65, because a projected
 * offset is `1/cos(latitude)` of a ground one and a bend spends part of it along a different
 * segment.
 *
 * That mattered the moment `normalizeDrawnBase` started republishing the point on every build:
 * read, write, read again and the width shrank each pass. Measured on a bent axis at 40
 * degrees: 10000 m became 9981, then 9963, then 9944 — a graphic that narrows a little every
 * time anything touches it.
 *
 * So the half-width handed to the drawing is corrected until what reads back is the half-width
 * that was asked for. The point stays on the ink; what changes is only the number spent to get
 * it there, and a written point now reads back as itself. @see squareWidthPoint
 */
export function axisWithWidthPoint(name: TacticalGraphicName | string | undefined, axis: Position[], halfWidth: number): Position[] {
    const point = widthPointFor(name, axis, halfWidth);
    return point ? [...axis, point] : axis;
}

/**
 * The base to store for a run of clicks a user has just drawn, with a half-width to start from.
 *
 * **Called by the draw paths and by nothing else**, which is the same division
 * `normalizeDrawnBase` already keeps for levelling a rectangle: a rule that fires on a draw
 * cannot live in a function that runs on every build, because a sketch mid-draw and a settled
 * base are the same array of coordinates and only the caller knows which it is holding.
 */
export function axisBaseFromDraw(name: TacticalGraphicName | string | undefined, clicks: Position[], halfWidth: number): Position[] {
    if (!carriesWidthPointInBase(name) || clicks.length < 2) return clicks;
    return axisWithWidthPoint(name, clicks, halfWidth);
}

/**
 * The width point put back square to the axis, wherever it was dragged to.
 *
 * Idempotent, which is what lets `normalizeDrawnBase` run it on every build: the point it
 * returns reads back as the same half-width it was given.
 */
export function squareWidthPoint(name: TacticalGraphicName | string | undefined, coords: Position[]): Position[] {
    const halfWidth = halfWidthFromBase(name, coords);
    if (halfWidth === undefined || halfWidth <= 0) return coords;
    return axisWithWidthPoint(name, axisOf(name, coords), halfWidth);
}

/**
 * A base read out of a file written before the width was a coordinate.
 *
 * Takes the `width` the old shape filed beside it — a **full** width, as the public schema
 * states it — and spends it as the half-width the point is drawn from, so the graphic comes
 * back the size it was saved at and re-saves in the new shape.
 *
 * Returns the coordinates unchanged when there is nothing to do: a graphic that is not one of
 * the eleven, a base that already carries its point, or an old save with no width at all — for
 * which the caller's own default is the only thing left to spend, and it supplies it as
 * `fallbackWidth`.
 */
export function upgradeAxisBase(
    name: TacticalGraphicName | string | undefined,
    coords: Position[],
    width: number | undefined,
    fallbackWidth?: number,
): Position[] {
    if (!carriesWidthPointInBase(name) || coords.length < 2) return coords;
    const stated = width ?? fallbackWidth;
    if (!(stated !== undefined && stated > 0)) return coords;
    return axisWithWidthPoint(name, coords, stated / 2);
}

/**
 * The feature a generator should be handed: the caller's own, minus the width point.
 *
 * Returns the *same object* when there is nothing to strip, so the common path allocates
 * nothing — the same contract `featureInGeneratorOrder` keeps, and for the same reason.
 */
export function axisFeature(name: TacticalGraphicName | string | undefined, feature: Feature): Feature {
    if (!carriesWidthPointInBase(name)) return feature;
    const geometry = feature.geometry as LineString | undefined;
    if (!geometry || geometry.type !== 'LineString' || geometry.coordinates.length < 3) return feature;
    return {...feature, geometry: {...geometry, coordinates: axisOf(name, geometry.coordinates)}};
}

/**
 * The generator options with the half-width the **base** states, where it states one.
 *
 * The coordinate wins over anything filed beside it: a `width` amplifier on one of these is
 * either a save older than the coordinate — in which case it has already been spent by
 * {@link upgradeAxisBase} on the way in — or a second copy that has drifted.
 *
 * A legacy two-coordinate base states nothing, so the caller's own `radius` survives and the
 * graphic draws exactly as it did. That is what makes an unversioned file readable.
 */
export function optionsFromWidthPoint<T extends {radius?: number}>(
    name: TacticalGraphicName | string | undefined,
    feature: Feature,
    opts?: T,
): T | undefined {
    if (!carriesWidthPointInBase(name)) return opts;
    const geometry = feature.geometry as LineString | undefined;
    if (!geometry || geometry.type !== 'LineString') return opts;
    const halfWidth = halfWidthFromBase(name, geometry.coordinates);
    if (halfWidth === undefined || halfWidth <= 0) return opts;
    return {...(opts ?? {}), radius: halfWidth} as T;
}
