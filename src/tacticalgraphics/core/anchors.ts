import {Position} from 'geojson';
import * as turf from './turf';

/**
 * # Drawn anchor points ⇄ the frame a point-anchored generator wants
 *
 * APP-06 defines most of the maneuver symbols from **drawn points**: "point 1 defines
 * the beginning of the straight line, point 2 the end, point 3 the diameter". This
 * library grew them the other way round — a dropped center plus a `size` and a
 * `rotation` — so the symbols are right but the user cannot set their proportions.
 *
 * Rather than rewrite eight pieces of geometry, this converts between the two. A
 * generator keeps the shape maths it already has and asks for its frame here; the
 * frame is derived from what the user drew instead of from a center and a scalar.
 *
 * **The angle convention is the generators', not turf's.** `angle` is planar radians
 * counter-clockwise from **east**, which is what `geometryService.translateCoordinates`
 * takes. Turf speaks degrees clockwise from north, so the two are `90 - deg` apart and
 * getting it backwards mirrors every symbol about its own axis.
 */

const toRadians = (deg: number): number => (deg * Math.PI) / 180;
const toDegrees = (rad: number): number => (rad * 180) / Math.PI;

/** Planar angle CCW from east, in radians, from `a` to `b`. */
function planarAngle(a: Position, b: Position): number {
    return toRadians(90 - turf.bearing(turf.point(a), turf.point(b)));
}

/** Meters between two lon/lat positions. */
function meters(a: Position, b: Position): number {
    return turf.distance(turf.point(a), turf.point(b), {units: 'meters'});
}

/**
 * What a point-anchored generator needs, recovered from the points the user drew.
 *
 * `size` is the **half**-length of the straight run, because that is what the
 * generators mean by it: they lay their axis from `-size` to `+size` about the center.
 */
export interface DrawnFrame {
    /** Midpoint of the straight run — where a dropped symbol would have been centered. */
    center: Position;
    /** Planar radians CCW from east, along point 1 → point 2. */
    angle: number;
    /** Half the distance between point 1 and point 2. Never zero. */
    size: number;
    /**
     * Perpendicular distance from the axis to the *next* anchor point, in meters.
     *
     * APP-06 calls this the diameter on Envelopment and Pursuit and the width on the
     * demolition bars. Undefined when the user drew only two points, in which case the
     * generator keeps whatever default it had.
     */
    offset?: number;
    /** Which flank that point fell on: `+1` left of the run, `-1` right. */
    side: number;
}

/** The smallest run a frame can describe, in meters. Below this a drag is a click. */
const MIN_SIZE_M = 1;

/**
 * Derive a frame from drawn anchor points, or `undefined` if there are too few.
 *
 * Takes the **first and last** vertices as the straight run so a multi-vertex sketch
 * still resolves — APP-06 allows "N anchor points, where N is between 3 and 50" on
 * some of these, and a user who drew a kinked path still means the run to span it.
 * The perpendicular reference is the vertex *before* the last, when there is one.
 */
export function frameFromAnchors(coords: Position[] | undefined): DrawnFrame | undefined {
    if (!coords || coords.length < 2) return undefined;

    const start = coords[0];
    const end = coords[coords.length - 1];
    const span = meters(start, end);
    if (!isFinite(span) || span < MIN_SIZE_M) return undefined;

    // The geodesic midpoint: half way along the great circle joining the two.
    const center = turf.destination(turf.point(start), span / 2, turf.bearing(turf.point(start), turf.point(end)), {
        units: 'meters',
    }).geometry.coordinates as Position;

    // **Measured from the center, not from the start.** Both are "the run's bearing" on
    // a plane and neither is on a sphere, where great circles converge — and the frame
    // has to be the exact inverse of `anchorsFromFrame`, which spokes its points out of
    // the center. Taking the angle from the start instead left a save/restore moving the
    // center 3 m on a 4 km run, and every rebuild moved it again.
    const angle = planarAngle(center, end);

    const frame: DrawnFrame = {center, angle, size: span / 2, side: 1};

    // A third point sets how far the symbol reaches off its own axis, and on which side.
    if (coords.length >= 3) {
        const reference = coords[coords.length - 2];
        const away = meters(center, reference);
        if (away > 0) {
            const delta = planarAngle(center, reference) - angle;
            const perpendicular = away * Math.sin(delta);
            frame.offset = Math.abs(perpendicular);
            frame.side = Math.sign(perpendicular) || 1;
        }
    }
    return frame;
}

/**
 * The inverse: the anchor points a *saved* point-anchored graphic would have had.
 *
 * This is what lets a `.geojson` written before the conversion still restore. The
 * shape it rebuilds is the one that was saved, because the same three numbers go back
 * in — the graphic simply gains the vertices it was always implicitly described by.
 *
 * @param center   the saved base point
 * @param size     the saved `radius`, which these generators spend as a half-length
 * @param rotation the saved rotation in **degrees**, the schema's unit
 * @param offset   perpendicular reach for the third point, when the symbol has one
 * @param side     which flank, `+1` left of the run
 */
export function anchorsFromFrame(
    center: Position,
    size: number,
    rotation = 0,
    offset?: number,
    side = 1,
): Position[] {
    const angle = toRadians(rotation);
    const bearingOf = (planar: number): number => 90 - toDegrees(planar);
    const walk = (distance: number, bearing: number): Position =>
        turf.destination(turf.point(center), distance, bearing, {units: 'meters'}).geometry.coordinates as Position;

    // **Every point spoked out of the center**, which is what makes this the exact
    // inverse of `frameFromAnchors`: it measures the angle from the center too, and the
    // center it recovers is the geodesic midpoint of a run laid this way. Walking the
    // run end to end instead drifts, because the bearing start → end is not the bearing
    // the ends were placed on once great circles converge.
    const start = walk(size, bearingOf(angle + Math.PI));
    const end = walk(size, bearingOf(angle));
    if (offset === undefined || !(offset > 0)) return [start, end];

    // Inserted *before* the run's end, which is where `frameFromAnchors` looks for it.
    return [start, walk(offset, bearingOf(angle + (side * Math.PI) / 2)), end];
}

/**
 * # A straight run with a half circle on its end
 *
 * The second anchor shape, and the one APP-06 spends the most points on. Two symbols
 * are built this way and they differ only in how many points they use to say it:
 *
 * - **Envelop** (343500) takes *four*. "Point 1 defines the beginning of the straight
 *   line. Point 2 defines the end of the straight line portion of the graphic. Point 3
 *   defines the diameter. Point 4 defines the orientation of the 180 degree circular
 *   arc."
 * - **Pursue** (344000) takes *three*, folding the last two together: "Point 3 defines
 *   the diameter and orientation of the 180 degree circular arc and the tip of the
 *   arrowhead."
 *
 * So points 2 and 3 are the **feet of the semicircle** — the ends of its diameter — and
 * the remaining point says which side of the run it bulges to. Both feet lie on the
 * run's own continuation, which is why the arrowhead lands on the axis by construction
 * rather than by the user lining it up.
 *
 * `radius` is half that diameter, because every arc in this library is drawn from one.
 */
export interface RunAndArcFrame {
    /** Midpoint of the straight run. The generators lay their axis about it. */
    center: Position;
    /** Planar radians CCW from east, point 1 → point 2. */
    angle: number;
    /** Half the run's length. */
    size: number;
    /**
     * Half the diameter set by point 3, or undefined when the sketch has not reached
     * that point yet — mid-draw the interaction hands over a run and nothing else, and
     * a symbol that drew no arc until its third click would flicker rather than grow.
     */
    radius?: number;
    /** Which flank the arc bulges to: `+1` left of the run, `-1` right. */
    side: number;
}

/** Local coordinates of `p` about `center`: `u` along `angle`, `v` to its left. */
function localOf(center: Position, angle: number, p: Position): {u: number; v: number} {
    const distance = meters(center, p);
    if (distance === 0) return {u: 0, v: 0};
    const delta = planarAngle(center, p) - angle;
    return {u: distance * Math.cos(delta), v: distance * Math.sin(delta)};
}

/**
 * Read a run-and-arc frame off the points the user drew.
 *
 * Point 3 is **projected onto the run's axis** rather than taken where it fell. The
 * diameter lies along the approach in APP-06's own template — both feet sit on the
 * line — so the component across the axis is not a second degree of freedom the symbol
 * has; honoring it would bend the graphic into a shape the standard does not draw.
 * The across component is not wasted, though: on Pursue, which has no fourth point, its
 * sign is what says which way the hook turns.
 */
export function runAndArcFromAnchors(coords: Position[] | undefined): RunAndArcFrame | undefined {
    if (!coords || coords.length < 2) return undefined;

    const [start, end] = coords;
    const span = meters(start, end);
    if (!isFinite(span) || span < MIN_SIZE_M) return undefined;

    const center = turf.destination(turf.point(start), span / 2, turf.bearing(turf.point(start), turf.point(end)), {
        units: 'meters',
    }).geometry.coordinates as Position;
    // From the center, for the reason `frameFromAnchors` gives: it is the only way the
    // two directions here stay exact inverses once great circles converge.
    const angle = planarAngle(center, end);
    const size = span / 2;

    const frame: RunAndArcFrame = {center, angle, size, side: 1};

    if (coords.length >= 3) {
        const foot = localOf(center, angle, coords[2]);
        const diameter = foot.u - size;
        if (diameter > 0) frame.radius = diameter / 2;
        // Pursue's third point carries the orientation too. A fourth point overrides it.
        if (foot.v !== 0) frame.side = Math.sign(foot.v);
    }
    if (coords.length >= 4) {
        const orient = localOf(center, angle, coords[3]);
        if (orient.v !== 0) frame.side = Math.sign(orient.v);
    }
    return frame;
}

/**
 * The inverse: the four anchor points that describe this frame.
 *
 * Point 4 is placed at the **apex of the arc**, which is the one spot on the drawn
 * shape that is unambiguously on the bulge side — a point merely offset from the axis
 * would sit in empty space and read as a stray handle. Pursue keeps only the first
 * three of these; the fourth is what makes Envelop's orientation independent.
 *
 * @param rotationDegrees the run's aim, in the schema's unit
 */
export function anchorsForRunAndArc(
    center: Position,
    size: number,
    radius: number,
    rotationDegrees = 0,
    side = 1,
): Position[] {
    const angle = toRadians(rotationDegrees);
    const at = (u: number, v: number): Position => {
        const distance = Math.hypot(u, v);
        if (distance === 0) return center;
        const bearing = 90 - toDegrees(angle + Math.atan2(v, u));
        return turf.destination(turf.point(center), distance, bearing, {units: 'meters'}).geometry
            .coordinates as Position;
    };
    const flank = Math.sign(side) || 1;
    return [at(-size, 0), at(size, 0), at(size + 2 * radius, 0), at(size + radius, flank * radius)];
}

/**
 * # A straight line with a hook on its end — Pursue's three points
 *
 * APP-06 344000: "Point 1 defines the beginning of the straight line. Point 2 defines
 * the end of the straight line portion of the graphic. Point 3 defines the diameter and
 * orientation of the 180 degree circular arc and the tip of the arrowhead."
 *
 * So points 2 and 3 are again the ends of the arc's diameter — but unlike Envelop, the
 * standard's template runs that diameter **across** the straight line rather than along
 * it: the line arrives at the top of the hook and the arrowhead leaves from the bottom.
 * That is why this is a separate reader instead of a three-point call into
 * `runAndArcFromAnchors`, which projects onto the axis and would flatten the hook.
 *
 * With only three points there is nothing left to state which way the arc bulges, so it
 * is a convention rather than an input: **away from point 1**, which is the direction
 * the pursuit was already heading. The plate draws it exactly that way.
 */
export interface HookFrame {
    /** Point 1 — the free end of the straight line, where the letter sits. */
    start: Position;
    /** Point 2 — where the line meets the arc, and one end of the diameter. */
    join: Position;
    /** Point 3 — the arrowhead's tip, and the arc's far end. */
    tip: Position;
    /** Midpoint of join → tip, which is the arc's center. */
    center: Position;
    /** Half the diameter. */
    radius: number;
    /** Planar radians CCW from east, center → join: where the sweep starts. */
    startAngle: number;
    /** `+1` to sweep counter-clockwise from join round to tip, `-1` clockwise. */
    sweep: number;
}

export function hookFromAnchors(coords: Position[] | undefined): HookFrame | undefined {
    if (!coords || coords.length < 3) return undefined;

    const [start, join, tip] = coords;
    const diameter = meters(join, tip);
    if (!isFinite(diameter) || diameter < MIN_SIZE_M) return undefined;

    const center = turf.destination(turf.point(join), diameter / 2, turf.bearing(turf.point(join), turf.point(tip)), {
        units: 'meters',
    }).geometry.coordinates as Position;
    const radius = diameter / 2;
    const startAngle = planarAngle(center, join);

    // Which way round: whichever sweep puts the arc's apex farther from point 1. The
    // two candidates are a quarter turn either side of the diameter, so this is a
    // straight comparison rather than a sign convention that has to be kept in step
    // with however the caller happened to order its points.
    const apex = (sweep: number): Position =>
        turf.destination(turf.point(center), radius, 90 - toDegrees(startAngle + (sweep * Math.PI) / 2), {
            units: 'meters',
        }).geometry.coordinates as Position;
    const sweep = meters(start, apex(1)) >= meters(start, apex(-1)) ? 1 : -1;

    return {start, join, tip, center, radius, startAngle, sweep};
}

/**
 * The inverse, in the terms a dropped Pursue was built from: the arc's center, its
 * radius, the aim of the straight line, and which side the hook falls on.
 *
 * `lineRatio` is the straight line's length as a multiple of the radius — the symbol's
 * own proportion, which the dropped form had no way to vary and a drawn one does.
 */
export function anchorsForHook(
    center: Position,
    radius: number,
    rotationDegrees = 0,
    side = 1,
    lineRatio = 2.4,
): Position[] {
    const angle = toRadians(rotationDegrees);
    const at = (u: number, v: number): Position => {
        const distance = Math.hypot(u, v);
        if (distance === 0) return center;
        const bearing = 90 - toDegrees(angle + Math.atan2(v, u));
        return turf.destination(turf.point(center), distance, bearing, {units: 'meters'}).geometry
            .coordinates as Position;
    };
    const flank = Math.sign(side) || 1;
    return [at(-lineRatio * radius, flank * radius), at(0, flank * radius), at(0, -flank * radius)];
}

/**
 * A hook expressed the way a holder carries it: a center, a radius, an aim, a flank
 * and the line's own proportion.
 *
 * This lives here rather than in the renderer because it is a statement about what the
 * symbol *is* — which of the drawn points is the aim, and which way is "mirrored" — and
 * both renderers have to answer it identically. A holder that worked it out itself
 * would be the exact shape of defect the MapLibre parity pass keeps turning up.
 */
export interface HookPose {
    center: Position;
    radius: number;
    /** The **straight line's** aim in degrees, not the diameter's: they are square. */
    rotationDegrees: number;
    /** `+1` hook on the left of the line, `-1` on the right. */
    side: number;
    /** The line's length as a multiple of the radius. */
    lineRatio: number;
}

/** The default proportion of the dropped form, kept as the fallback for a degenerate hook. */
export const HOOK_DEFAULT_LINE_RATIO = 2.4;

export function hookPose(frame: HookFrame): HookPose {
    const {center, radius, startAngle, start} = frame;
    const distance = meters(center, start);
    const toStart = distance > 0 ? planarAngle(center, start) : startAngle;

    // **Every angle here is measured from the center**, for the reason
    // `frameFromAnchors` gives at length: `anchorsForHook` spokes its points out of the
    // center, and on a sphere the bearing from point 1 to point 2 is not the bearing
    // they were placed on. Taking the aim as `planarAngle(start, join)` instead — which
    // reads as the obvious thing — moved a 77 km pursuit 120 m on every save/restore.
    //
    // The join sits a quarter turn off the aim, on whichever flank the hook is, so the
    // aim is one of two candidates half a turn apart. The line runs *back* from the
    // join, so the right one is whichever puts point 1 behind the center along it —
    // exactly one of the two can, because flipping the candidate flips the sign.
    const candidate = (side: number): number => startAngle - (side * Math.PI) / 2;
    const along = (angle: number): number => distance * Math.cos(toStart - angle);
    const side = along(candidate(1)) < 0 ? 1 : -1;
    const angle = candidate(side);

    return {
        center,
        radius,
        rotationDegrees: toDegrees(angle),
        side,
        lineRatio: radius > 0 ? Math.abs(along(angle)) / radius : HOOK_DEFAULT_LINE_RATIO,
    };
}

/**
 * # A bowed arrow — Turn's anchor points
 *
 * APP-06 270504: "Point 1 defines the tip of the arrowhead and point 2 defines the rear
 * of the symbol. Point 3 defines the 90 degree arc... Point 3 indicates on which side of
 * the line the arc is placed."
 *
 * **Tip first.** That ordering looks backwards next to how the symbol is drawn, but it
 * is the standard's, and this family keeps it — Movement to Contact numbers its points
 * the same way. Storing them in any other order would make the saved geometry a private
 * arrangement rather than the thing APP-06 describes.
 *
 * The rule's own point count says "two" and then names a third; the text is internally
 * inconsistent in the source. The third point is honored, since a symbol that can bow
 * either way needs something to say which.
 */
export interface BowFrame {
    /** Midpoint of the chord — where a dropped turn would have been centered. */
    center: Position;
    /** Planar radians CCW from east, rear → tip. */
    angle: number;
    /** Half the chord's length. */
    size: number;
    /**
     * How deep the bow is, as a signed multiple of `size`, or undefined when the sketch
     * has only its two ends yet. Sign is the side the arc is placed.
     */
    bend?: number;
}

export function bowFromAnchors(coords: Position[] | undefined): BowFrame | undefined {
    if (!coords || coords.length < 2) return undefined;

    const [tip, rear] = coords;
    const chord = meters(rear, tip);
    if (!isFinite(chord) || chord < MIN_SIZE_M) return undefined;

    const center = turf.destination(turf.point(rear), chord / 2, turf.bearing(turf.point(rear), turf.point(tip)), {
        units: 'meters',
    }).geometry.coordinates as Position;
    const angle = planarAngle(center, tip);
    const size = chord / 2;

    const frame: BowFrame = {center, angle, size};
    if (coords.length >= 3) {
        const bow = localOf(center, angle, coords[2]);
        // The apex sits at half the control point's offset, because the curve is a
        // quadratic Bezier and its midpoint is halfway to the control. Negated because
        // `bendLine` offsets clockwise from the chord and `localOf` measures to its left.
        if (size > 0) frame.bend = (-2 * bow.v) / size;
    }
    return frame;
}

/** The inverse: `[tip, rear, bowMarker]`, APP-06's own numbering. */
export function anchorsForBow(center: Position, size: number, rotationDegrees = 0, bend = 0): Position[] {
    const angle = toRadians(rotationDegrees);
    const at = (u: number, v: number): Position => {
        const distance = Math.hypot(u, v);
        if (distance === 0) return center;
        const bearing = 90 - toDegrees(angle + Math.atan2(v, u));
        return turf.destination(turf.point(center), distance, bearing, {units: 'meters'}).geometry
            .coordinates as Position;
    };
    return [at(size, 0), at(-size, 0), at(0, (-bend * size) / 2)];
}

/**
 * # An arc with an arrow off its back — Ambush's three points
 *
 * APP-06 141700: "Point 1 is the tip of the arrowhead. Points 2 and 3 define the
 * endpoints of the curved line on the back side of the symbol."
 *
 * The curved line spans 120 degrees, so points 2 and 3 sit a third of a circle apart
 * and their chord is `2 * radius * sin(60)`. That fixes the radius without needing the
 * center to be drawn — the center is recovered from the chord instead, which is the
 * whole reason this reader exists rather than a centre-and-edge pair.
 *
 * Point 1 is honored as an actual tip rather than only a direction, so the arrow's
 * reach is a proportion the user sets. The dropped form fixed it at two radii.
 */
export interface ArcAndArrowFrame {
    /** Center of the circle the arc is cut from. */
    center: Position;
    /** Planar radians CCW from east: the direction the arrow points. */
    angle: number;
    /** Radius of the arc. */
    radius: number;
    /** How far the tip sits from the center, as a multiple of the radius. */
    arrowReach: number;
}

/** The arc's half-span. @see ArcAndArrowFrame */
const ARC_HALF_SPAN_DEG = 60;
/** Where the dropped form put the tip: two radii out along the axis. */
export const ARC_ARROW_DEFAULT_REACH = 2;

export function arcAndArrowFromAnchors(coords: Position[] | undefined): ArcAndArrowFrame | undefined {
    if (!coords || coords.length < 3) return undefined;

    const [tip, upper, lower] = coords;
    const chord = meters(upper, lower);
    if (!isFinite(chord) || chord < MIN_SIZE_M) return undefined;

    const chordMid = turf.destination(turf.point(upper), chord / 2, turf.bearing(turf.point(upper), turf.point(lower)), {
        units: 'meters',
    }).geometry.coordinates as Position;

    // **The center is solved for, not stepped to.** It is never drawn, so it has to be
    // recovered — and the obvious recovery, "half a radius back along the axis from the
    // chord's midpoint", is a planar identity that a sphere does not honor exactly. It
    // left a 55 km ambush moving 0.1 m on every save/restore, which compounds.
    //
    // Two facts pin it exactly instead. The center lies on the geodesic running from
    // point 1 through the chord's midpoint and out the far side, by the symmetry of the
    // construction; and at the true center the half-chord is `radius * sin(60)`, because
    // the arc spans 120 degrees. So walk out along that geodesic until the second holds.
    // **The bearing at the midpoint, not at the tip.** `turf.bearing(a, b)` is the
    // initial bearing at `a`; walking from the midpoint on the bearing measured at the
    // tip follows a different great circle entirely, and the solve then converges on the
    // wrong line — it put a 1.2 km ambush a full radius out.
    const outward = turf.bearing(turf.point(chordMid), turf.point(tip)) + 180;
    const at = (distance: number): Position =>
        turf.destination(turf.point(chordMid), distance, outward, {units: 'meters'}).geometry.coordinates as Position;
    // The condition is an **angle**, not a length. "Half the chord is `radius * sin(60)`"
    // is another planar identity — the chord is a geodesic distance and the sine rule
    // for it is not the flat one — and using it left the center 4.7 m out, worse than
    // the approximation it replaced. What the writer guarantees exactly is that it
    // placed this point 60 degrees off the axis, so that is what to solve for.
    const subtended = (distance: number): number => {
        const at1 = at(distance);
        const delta = toDegrees(planarAngle(at1, upper) - planarAngle(at1, tip));
        return (((delta % 360) + 540) % 360) - 180;
    };
    // A quarter turn at the chord's own midpoint, falling through 60 as the point walks
    // away from the tip — so it brackets, and it is monotonic between.
    const miss = (distance: number): number => subtended(distance) - ARC_HALF_SPAN_DEG;

    let low = 0;
    let high = Math.max(4 * (chord / 2), MIN_SIZE_M);
    while (miss(high) > 0 && high < 1e9) high *= 2;
    for (let i = 0; i < 80; i++) {
        const mid = (low + high) / 2;
        if (miss(mid) > 0) low = mid;
        else high = mid;
    }

    const center = at((low + high) / 2);
    const radius = meters(center, upper);
    return {
        center,
        angle: planarAngle(center, tip),
        radius,
        arrowReach: radius > 0 ? meters(center, tip) / radius : ARC_ARROW_DEFAULT_REACH,
    };
}

/** The inverse: `[tip, upperArcEnd, lowerArcEnd]`, APP-06's own numbering. */
export function anchorsForArcAndArrow(
    center: Position,
    radius: number,
    rotationDegrees = 0,
    arrowReach = ARC_ARROW_DEFAULT_REACH,
): Position[] {
    const angle = toRadians(rotationDegrees);
    const polar = (distance: number, planarDegrees: number): Position =>
        turf.destination(turf.point(center), distance, 90 - toDegrees(angle + toRadians(planarDegrees)), {
            units: 'meters',
        }).geometry.coordinates as Position;
    return [polar(arrowReach * radius, 0), polar(radius, ARC_HALF_SPAN_DEG), polar(radius, -ARC_HALF_SPAN_DEG)];
}
