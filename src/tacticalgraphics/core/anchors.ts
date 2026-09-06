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

/**
 * Point 1 set on the perpendicular bisector of points 2 and 3, keeping its reach.
 *
 * **The projection two of APP-06's symbols need, for one shared pair of sentences.** 141700
 * ambush and 152000 attack by fire both say it:
 *
 * > The rear of the arrowhead line shall connect to the midpoint of the line between points 2
 * > and 3. The arrowhead line shall be perpendicular to the line formed by points 2 and 3.
 *
 * Three freely placed points cannot satisfy both — the arrow would have to start at point 1,
 * meet the midpoint *and* stand square, which is one condition too many. Points 2 and 3 are
 * what the plate gives the back line's length and orientation to, so point 1 is the one that
 * yields: it is read for the one thing the symbol can express, **how far the arrow reaches
 * from the middle**, and its component along the back line is dropped rather than stored and
 * ignored. Both sentences then hold by construction rather than by the operator's aim.
 * (User's call, 2026-09-06.)
 *
 * The same arithmetic `sideAnchors` performs for the bracket tasks and the obstacle bypasses,
 * about a midpoint instead of an edge's end.
 *
 * `undefined` when the click carries no across-component at all — it is on the back line, so
 * there is no side to read and no arrow to draw — leaving the caller to keep what it had.
 */
/**
 * How far off the bisector a point may sit and still count as on it, as a share of its reach.
 *
 * A thousandth: far below anything an operator can aim at, and far above the drift a geodesic
 * round trip introduces. @see squareOntoBisector
 */
const ON_BISECTOR_TOLERANCE = 1e-3;

export function squareOntoBisector(tip: Position, one: Position, two: Position): Position | undefined {
    const middle = turf.midpoint(turf.point(one), turf.point(two)).geometry.coordinates as Position;
    const back = turf.bearing(turf.point(one), turf.point(two));
    const reach = turf.distance(turf.point(middle), turf.point(tip), {units: 'meters'});
    if (!isFinite(reach) || reach <= 0) return undefined;

    const toTip = turf.bearing(turf.point(middle), turf.point(tip));
    const across = reach * Math.sin(((toTip - back) * Math.PI) / 180);
    if (!isFinite(across) || across === 0) return undefined;

    /*
     * **A point already on the bisector is left exactly where it is.**
     *
     * Walking out and back is not the identity on a sphere: the projection is geodesic, so
     * re-deriving a tip that needs no correction still moves it a few parts in a thousand of
     * the radius. That is invisible once, and it is not invisible on a base that goes back
     * through this reader on every render — it walks. Returning the point untouched when its
     * along-component is already negligible keeps the reading idempotent to the metre.
     */
    const along = reach * Math.cos(((toTip - back) * Math.PI) / 180);
    if (Math.abs(along) < reach * ON_BISECTOR_TOLERANCE) return tip;

    return turf.destination(turf.point(middle), Math.abs(across), back + Math.sign(across) * 90, {
        units: 'meters',
    }).geometry.coordinates as Position;
}

/**
 * The least the arrow may reach, as a multiple of the arc's radius.
 *
 * **The arrowhead has to clear the arc.** The arrow runs from the chord's midpoint at `0.5r`
 * out to `reach * r`, and its head is `0.25r` long at 30 degrees — so the barbs sit
 * `0.25r * cos(30) = 0.217r` back from the tip. For them to fall outside the arc at all the
 * tip must reach past `1.217r`, and below that the head is drawn *inside* the bulge it is
 * supposed to be leaving. A little over that, so the head clears rather than grazes.
 *
 * Enforced in the reading rather than in the drawing, which is what makes it hold for an edit
 * as well as a draw: both engines drag a base vertex straight to the pointer, and every
 * render goes back through here. (User's call, 2026-09-06: "don't ever let the arrow tip fall
 * into the arch during drawing or editing".)
 */
export const ARC_ARROW_MIN_REACH = 1.25;

/**
 * 141700's three anchor points from an operator's clicks — **including a half-placed set.**
 *
 * Two clicks are the tip and one end of the curved back, which leave a family of symbols
 * rather than one: every choice of axis satisfies both of the plate's constraints. The shape
 * is held at the arc's own 120 degrees and the dropped form's reach, so the click sets only
 * the size — a preview convention, replaced the moment the third click lands.
 *
 * Three clicks place all three. Points 2 and 3 are the arc's own endpoints, so the chord they
 * make fixes the radius; point 1 is squared onto their bisector and then **held out past the
 * arc**, so the arrowhead can never be drawn inside the bulge.
 * @see squareOntoBisector, ARC_ARROW_MIN_REACH
 *
 * Fewer than two points draws nothing. It lives here rather than in the draw path alone
 * because the *generator* needs it too: `normalizeDrawnBase` runs at draw end, so mid-draw
 * the generator saw a raw sketch, failed to read a frame from it and fell through to the
 * dropped form — a default-sized symbol parked on the first click.
 */
export function arcAndArrowAnchorsFromClicks(clicks: Position[] | undefined): Position[] | undefined {
    if (!clicks || clicks.length < 2) return undefined;

    if (clicks.length >= 3) {
        /*
         * **The tip is not squared onto a bisector here, deliberately.**
         *
         * 152000 attack by fire needs that, because its back line is straight and its arrow
         * has to stand at a right angle to it. 141700's back is an *arc*, and
         * `arcAndArrowFromAnchors` already solves for the centre by walking the geodesic from
         * the chord's midpoint through the tip — so that line *is* the symmetry axis whatever
         * the tip's aim, and "the rear of the arrowhead line shall connect to the midpoint"
         * holds by construction.
         *
         * Squaring it as well was measured moving a correctly built ambush by 2.6% of its
         * radius: the projection is planar and the construction is geodesic, which is the same
         * mismatch that function's own comment warns about. A reading that moves a symbol it
         * was handed correct is a reading that walks it, since it runs on every render.
         */
        const frame = arcAndArrowFromAnchors(clicks.slice(0, 3));
        if (!frame) return undefined;

        /*
         * **The points come back off the frame, not out of the clicks.**
         *
         * A 120 degree arc symmetric about the arrow's axis has exactly two ends, and where
         * they are is settled once the centre, the radius and the aim are — so points 2 and 3
         * are not independent of each other however freely they are placed. Handing back the
         * raw clicks let the *stored* pair drift away from the pair the generator draws: a
         * drag of point 3 tilted the axis, the drawn arc moved to stay symmetric about it, and
         * the grip stayed behind on a coordinate that was no longer on the symbol. (User's
         * report, 2026-09-06: "point 3 handle falls out of the graphic during editing".)
         *
         * Re-deriving them is what makes the base and the drawing one description. It is also
         * idempotent by construction — frame to points to frame is the identity — so a base
         * that is already consistent passes through untouched, which a reading that runs on
         * every render has to be.
         */
        const reach = Math.max(frame.arrowReach, ARC_ARROW_MIN_REACH);
        return anchorsForArcAndArrow(frame.center, frame.radius, (frame.angle * 180) / Math.PI, reach);
    }

    const [tip, click] = clicks;
    const reach = ARC_ARROW_DEFAULT_REACH;
    const span = meters(tip, click);
    if (!isFinite(span) || span <= 0) return undefined;

    // Law of cosines on tip-centre-end, with the arc's half-span fixed at 60 degrees.
    const radius = span / Math.sqrt(reach * reach + 1 - 2 * reach * Math.cos((ARC_HALF_SPAN_DEG * Math.PI) / 180));
    if (!(radius > 0)) return undefined;
    const offset =
        (Math.asin(Math.min(1, (radius * Math.sin((ARC_HALF_SPAN_DEG * Math.PI) / 180)) / span)) * 180) / Math.PI;

    const toClick = turf.bearing(turf.point(tip), turf.point(click));
    const candidate = (sign: number): Position[] => {
        const centre = turf.destination(turf.point(tip), reach * radius, toClick + sign * offset, {
            units: 'meters',
        }).geometry.coordinates as Position;
        const aim = turf.bearing(turf.point(centre), turf.point(tip));
        return anchorsForArcAndArrow(centre, radius, 90 - aim, reach);
    };
    // The click is point 2, so the centre's side is chosen by which candidate puts index 1
    // nearest the cursor — measuring index 1 alone is what makes the click mean one thing.
    const [plus, minus] = [candidate(1), candidate(-1)];
    return meters(plus[1], click) <= meters(minus[1], click) ? plus : minus;
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

/**
 * # Two parallel legs joined by a half turn — the demonstration's four points
 *
 * APP-06 343300: *"Point 1 defines the tip of the arrowhead. Point 2 defines the end of
 * the straight line portion of the first arrow. [...] Points 2 and 3 shall be connected
 * by a smooth, curved line."*
 *
 * Unlike every other layout here the frame's origin is **point 1 itself**, not a centre:
 * the standard numbers the tip first and the symbol grows away from it.
 *
 * **The four points are one shape at one set of proportions**, and this is the only place
 * that says so. Two straights of equal length, parallel, joined by a turn whose diameter
 * is the gap between them — nothing in the rule invites an operator to vary those ratios,
 * and left free they drifted: the legs splayed, the turn went oval, and the symbol stopped
 * reading as a demonstration. So points 2, 3 and 4 are derived from point 1, the leg
 * length and the aim, and dragging one of them individually is not a gesture this symbol
 * offers. @see DERIVED_ANCHOR_GRAPHICS
 *
 * `openingShare` is the half-opening as a fraction of a leg. Measured off 343300's
 * Template, the legs run about 265 units against an opening of about 185.
 */
export function anchorsForParallelLegs(
    tip: Position,
    size: number,
    rotationDegrees = 0,
    openingShare = PARALLEL_LEGS_HALF_OPENING,
): Position[] {
    const angle = toRadians(rotationDegrees);
    // One origin for every point, like `anchorsForRunAndArc`: chaining translations
    // accumulates the latitude-dependent scaling each hop applies, and the second leg
    // lands short of the first. @see anchorsForRunAndArc
    const at = (u: number, v: number): Position => {
        const distance = Math.hypot(u, v);
        if (distance === 0) return tip;
        const bearing = 90 - toDegrees(angle + Math.atan2(v, u));
        return turf.destination(turf.point(tip), distance, bearing, {units: 'meters'}).geometry
            .coordinates as Position;
    };
    const opening = 2 * size * openingShare;
    return [tip, at(size, 0), at(size, opening), at(0, opening)];
}

/**
 * # The hairpin's fourth point, which is not placed — 343300 and 341900
 *
 * Both plates number four anchor points and both draw the same figure: two straights joined
 * by a half turn, with points 1 and 4 the free ends and points 2 and 3 the two ends of the
 * turn's chord.
 *
 * **The operator places three and this derives the fourth**, so the two straights are
 * parallel and the same length *by construction* rather than by a rule applied afterwards.
 * Point 4 is point 3 displaced by the vector point 2 → point 1: the second straight is the
 * first one translated across the chord.
 *
 * ## What this costs, said plainly
 *
 * The plates grant four free points — "points 3 and 4 determine the length of the second
 * straight line" reads as a length of its own — so a literal reading lets the second
 * straight differ from the first in both length and direction. This derivation gives that
 * up. Every figure either Template *draws* is still reachable, because both draw the
 * straights parallel and equal; what is no longer reachable is a splayed or lopsided
 * hairpin, which is the shape the freehand version drifted into and which neither plate
 * shows. (User's call, 2026-09-06: "the lines MUST be parallel to each other".)
 *
 * Geodesically, not by adding degrees: the displacement is taken as a distance and a bearing
 * off point 2 and replayed from point 3, so the second straight is the same length as the
 * first at any latitude. Adding the coordinate difference instead stretches it by
 * `1 / cos(latitude)` — the same trap `anchorsForParallelLegs` documents for chained hops.
 */
export function hairpinFourthPoint(p1: Position, p2: Position, p3: Position): Position {
    const reach = turf.distance(turf.point(p2), turf.point(p1), {units: 'meters'});
    if (!(reach > 0)) return p3;
    const bearing = turf.bearing(turf.point(p2), turf.point(p1));
    return turf.destination(turf.point(p3), reach, bearing, {units: 'meters'}).geometry.coordinates as Position;
}

/**
 * The hairpin's four canonical points from the three that carry a decision.
 *
 * Two readings happen here, and both are the reading the generator was going to perform
 * anyway — this stores the points where the drawing already puts them:
 *
 * 1. **Point 3 is squared.** Its component *along* the first leg is dropped and only its
 *    distance across, and the side it fell on, survive. The turn is a half circle tangent to
 *    both straights, so its diameter has to leave point 2 at a right angle; an oblique chord
 *    draws an arc that meets each leg in a kink. This is `mobileDefenceAnchors`' arithmetic
 *    exactly, for 152800's exact reason — *"the 180 degree circular arc is always
 *    perpendicular to the line"* — and 152800 is the graphic these two are built to match.
 * 2. **Point 4 is derived** from the squared point 3. @see hairpinFourthPoint
 *
 * So a drag of point 1 sets both legs' length and their shared aim, a drag of point 2 moves
 * the join, and a drag of point 3 sizes the turn and picks its side — which is the whole of
 * what either plate's Size/Shape cell describes, and no drag of any of them can splay the
 * legs or open the turn obliquely.
 *
 * Returns `undefined` below three points, so a half-finished draw shows what it has rather
 * than a guess. A point 3 that lands exactly on the leg's own axis is kept as it is: there
 * is no side to read from it, and inventing one would jump the symbol under the cursor.
 */
export function hairpinAnchors(points: Position[]): Position[] | undefined {
    if (points.length < 3) return undefined;
    const [p1, p2, click] = points;

    const axis = turf.bearing(turf.point(p2), turf.point(p1));
    const reach = turf.distance(turf.point(p2), turf.point(click), {units: 'meters'});
    if (!(reach > 0)) return undefined;

    const toClick = turf.bearing(turf.point(p2), turf.point(click));
    const across = reach * Math.sin(((toClick - axis) * Math.PI) / 180);
    const p3 = isFinite(across) && across !== 0
        ? (turf.destination(turf.point(p2), Math.abs(across), axis + Math.sign(across) * 90, {units: 'meters'})
              .geometry.coordinates as Position)
        : click;

    return [p1, p2, p3, hairpinFourthPoint(p1, p2, p3)];
}

/**
 * Which way `createSemicircle` must bulge so the turn closes the hairpin.
 *
 * **The side is not a convention, it is read off the shape.** Both 343300 and 341900 close
 * two parallel legs with a half turn, and the turn has to bulge *past* the bends, away from
 * the arrowheads — bulging back between the legs draws a flattened Z, not a U. Both
 * generators passed a hardcoded `true`, which is right for exactly one handedness: point 3
 * on one side of the first leg. Drag it across to the other side and the same flag puts the
 * arc on the inside, which is the shape the user reported on 2026-09-06 ("demonstration is
 * turning the arch inwards when dragged across").
 *
 * `createSemicircle` offsets to `chord - 90` by default and `chord + 90` when flipped, so
 * the question is which of those two points along the legs. The chord is perpendicular to
 * the legs by construction (@see hairpinAnchors), so one of them is the leg direction and
 * the other is its reverse; comparing against the tip → bend heading picks the right one at
 * any rotation and on either side.
 *
 * @param tip   point 1, the arrowhead — the end the turn must bulge *away* from
 * @param bend  point 2, where the first leg ends and the turn begins
 * @param far   point 3, the other end of the turn's diameter
 */
export function turnBulgesLeft(tip: Position, bend: Position, far: Position): boolean {
    const leg = turf.bearing(turf.point(tip), turf.point(bend));
    const chord = turf.bearing(turf.point(bend), turf.point(far));
    // Positive quarter-turn from the chord to the leg means the leg lies at `chord + 90`,
    // which is the flipped side. Normalized to (-180, 180] so it works across due north.
    return (((leg - chord + 540) % 360) - 180) > 0;
}

/**
 * The hook a half-drawn pursuit shows, as a share of the run it hangs off.
 *
 * A preview default and nothing more — 344000 states no size for the arc, and click 3 sets
 * it. A quarter keeps the semicircle clearly subordinate to the straight portion, which is
 * the proportion the plate's own Template draws. @see hookAnchorsFromClicks
 */
export const PURSUIT_PREVIEW_HOOK_SHARE = 0.25;

/**
 * 344000's three points from an operator's clicks — **including a half-placed set.**
 *
 * Two readings, and the second is why this lives here rather than in the draw path alone:
 *
 * 1. **Two clicks already describe a pursuit, so one is drawn.** The run is stated the
 *    moment the cursor leaves the first click, and the third point is constructed at a
 *    share of it until the operator states it. That is a **preview convention and not a
 *    reading of the plate** — 344000 gives the hook no default size — and click 3 replaces
 *    it with the measured value.
 * 2. **Three clicks: the third is pulled onto the perpendicular at point 2.** The click is
 *    read for how far it is across the run, which is the arc's diameter, and which side it
 *    fell on. Its component *along* the run is discarded — that is the freedom the standard
 *    does not give this symbol, and honouring it bent the hook off square.
 *
 * **Fewer than two points draws nothing**, which is the whole reason this moved out of the
 * draw path. `normalizeDrawnBase` runs at draw *end*, so mid-draw the generator saw the raw
 * sketch, failed to read a hook from one point, and fell through to the *dropped* form — a
 * default-sized symbol parked on click 1, appearing whole the instant the map was clicked.
 * The seven cane arrows show nothing there, because their fallback is driven by the line the
 * operator drew rather than by a size. (User's report, 2026-09-06: "can we stop adding the
 * previous full graphic on click 1? Do the same we do for other cane graphics".)
 */
export function hookAnchorsFromClicks(clicks: Position[] | undefined): Position[] | undefined {
    if (!clicks || clicks.length < 2) return undefined;
    const [start, join] = clicks;
    const runBearing = turf.bearing(turf.point(start), turf.point(join));

    if (clicks.length === 2) {
        const run = turf.distance(turf.point(start), turf.point(join), {units: 'meters'});
        if (!isFinite(run) || run <= 0) return undefined;
        const tip = turf.destination(turf.point(join), run * PURSUIT_PREVIEW_HOOK_SHARE, runBearing + 90, {
            units: 'meters',
        }).geometry.coordinates as Position;
        return [start, join, tip];
    }

    const click = clicks[2];
    const toClick = turf.bearing(turf.point(join), turf.point(click));
    const reach = turf.distance(turf.point(join), turf.point(click), {units: 'meters'});
    if (!isFinite(reach) || reach <= 0) return undefined;

    // The component across the run, signed: its magnitude is the diameter and its sign is
    // the flank the hook turns to.
    const across = reach * Math.sin(((toClick - runBearing) * Math.PI) / 180);
    if (!isFinite(across) || across === 0) return undefined;

    const tip = turf.destination(turf.point(join), Math.abs(across), runBearing + Math.sign(across) * 90, {
        units: 'meters',
    }).geometry.coordinates as Position;
    return [start, join, tip];
}

/**
 * The gap a half-drawn crossing shows, as a share of the bar the operator has placed.
 *
 * A preview convention and nothing else: none of these plates states a default separation,
 * and the third click sets it. A third of the bar keeps both rails legible without the
 * figure reading as a square. @see parallelRailAnchors
 */
const RAIL_PREVIEW_GAP_SHARE = 1 / 3;

/**
 * The anchor points of a **two-rail crossing**, from the clicks that place them.
 *
 * APP-06 271500 ford easy and 271600 ford difficult letter `PT 1` and `PT 2` at the ends of
 * one bar and `PT 3` on the other; 271100 bridge and 271300 assault crossing say it in words —
 * *"Points 1 and 2 define one side of the gap and points 3 and 4 define the opposite side"* —
 * and number four, the fourth being wherever "the opposite side" puts it.
 *
 * So one rail is placed end to end, and the third click states only **how far across the
 * other rail sits, and on which side**. Its component along the rail is discarded, the way
 * `sideAnchors` discards the same thing for the bracket tasks: two parallel rails of one
 * length have no way to draw an along-rail offset, so storing it would keep a number the
 * symbol cannot show and leave the grip off the bar it belongs to. (User's call, 2026-09-06:
 * "points 1, 2 for length and point 3 to determine the parallel line […] put point 3 right
 * across from point 2".)
 *
 * @param stored how many points the graphic's base holds — four for the two that number a
 * fourth, three for the fords, whose plate letters only three. The fourth is `p3` displaced
 * by `p1 → p2`, so the rails run the same way and are the same length by construction. This
 * is `hairpinFourthPoint`'s mirror image: a hairpin's legs *oppose*, and these are parallel.
 */
export function parallelRailAnchors(clicks: Position[] | undefined, stored = 4): Position[] | undefined {
    if (!clicks || clicks.length < 2) return undefined;
    const [one, two] = clicks;

    const along = turf.bearing(turf.point(one), turf.point(two));
    const bar = meters(one, two);
    if (!isFinite(bar) || bar <= 0) return undefined;

    /*
     * **Two clicks are one bar, and the far one previews beside it.**
     *
     * This is what the operator has between the second and third clicks, and points 1 and 2
     * are *"one side of the gap"* — so the bar is drawn on the line they are dragging along.
     * Read as a centreline instead, the two bars straddled the cursor and the symbol was
     * drawn through a line that is not part of it. (User's report, 2026-09-06: "when drawing
     * it, it seems we're actually drawing via the invisible middle line. The drawing cursor
     * should be along points 1, 2".)
     *
     * The gap is a **preview default and nothing more** — no plate here states one, and the
     * third click replaces it with a measured value.
     */
    const across = clicks.length >= 3
        ? (() => {
              const click = clicks[2];
              const reach = meters(two, click);
              if (!isFinite(reach) || reach <= 0) return 0;
              const toClick = turf.bearing(turf.point(two), turf.point(click));
              return reach * Math.sin(((toClick - along) * Math.PI) / 180);
          })()
        : bar * RAIL_PREVIEW_GAP_SHARE;
    if (!isFinite(across) || across === 0) return undefined;

    // Square across from point 2, which is where the plate's own PT 3 leader lands.
    const three = turf.destination(turf.point(two), Math.abs(across), along + Math.sign(across) * 90, {
        units: 'meters',
    }).geometry.coordinates as Position;
    if (stored < 4) return [one, two, three];

    const rail = meters(one, two);
    const four = turf.destination(turf.point(three), rail, along + 180, {units: 'meters'}).geometry
        .coordinates as Position;
    return [one, two, three, four];
}

/**
 * A two-rail crossing read back as the centreline and half-separation its generators draw.
 *
 * Those were built from a drawn centreline and a `radius` amplifier, which is the separation
 * stated twice — once as a number nobody could see and once nowhere at all. The points carry
 * it now, and this is the one place that converts between the two so the drawing code did not
 * have to change. @see parallelRailAnchors
 */
export function parallelRailFrame(
    coords: Position[] | undefined,
): {centre: Position[]; half: number} | undefined {
    if (!coords || coords.length < 3) return undefined;
    const [one, two, three] = coords;

    const along = turf.bearing(turf.point(one), turf.point(two));
    const reach = meters(two, three);
    if (!isFinite(reach) || !(reach > 0)) return undefined;

    const toThree = turf.bearing(turf.point(two), turf.point(three));
    const across = reach * Math.sin(((toThree - along) * Math.PI) / 180);
    if (!isFinite(across) || across === 0) return undefined;

    // The centreline runs half way between the rails, which is what the generators offset
    // from in both directions.
    const half = Math.abs(across) / 2;
    const side = along + Math.sign(across) * 90;
    const shift = (from: Position): Position =>
        turf.destination(turf.point(from), half, side, {units: 'meters'}).geometry.coordinates as Position;
    return {centre: [shift(one), shift(two)], half};
}

/** Half the demonstration's opening, as a share of one leg. @see anchorsForParallelLegs */
export const PARALLEL_LEGS_HALF_OPENING = 0.35;

/**
 * The inverse: point 1 is the origin and points 1 → 2 give the leg and the aim.
 *
 * Points 3 and 4 are **not read**. They are derived, so a set that disagrees with them —
 * a file written while the four were drawn freehand — resolves to the canonical shape
 * rather than to whatever the legs had drifted into.
 */
export function parallelLegsFromAnchors(
    coords: Position[] | undefined,
): {tip: Position; size: number; angle: number} | undefined {
    if (!coords || coords.length < 2) return undefined;
    const [tip, bend] = coords;
    const size = turf.distance(turf.point(tip), turf.point(bend), {units: 'meters'});
    if (!(size > 0)) return undefined;
    // Geodesic bearing back to the planar angle the layouts take: 0 is east, growing
    // counter-clockwise. @see anchorsForParallelLegs
    return {tip, size, angle: toRadians(90 - turf.bearing(turf.point(tip), turf.point(bend)))};
}

/**
 * # A rectangle from two anchor points and a width — APP-06's own definition
 *
 * > This symbol requires two anchor points and a width, defined in metres, to define the
 * > boundary of the area. Points 1 and 2 will be located in the centre of two opposing
 * > sides of the rectangle. […] The anchor points determine the length of the rectangle.
 * > The width, defined in metres, will determine the width of the rectangle. (240202)
 *
 * So the axis is the user's two clicks and the width is an amplifier — the length and the
 * orientation come from the points, and nothing about the shape is a corner the operator
 * places. Eighteen rectangular zones say it in those words and FM 1-02.2 table 5-24 draws
 * the same `AM` / "Width (m)" arrow down the edge.
 *
 * **This library used to let the user drag a box instead.** That produces the same
 * picture, and three things followed from it: the width was derived from the ring rather
 * than set, so it could be read but not dragged; the rectangle could not be turned,
 * because every dimension came off the projected bounding box; and the two points APP-06
 * numbers existed nowhere. (User's call, 2026-08-27.)
 *
 * `halfWidth` rather than the full figure, because that is what the generators take —
 * `toGraphicOptions` halves the public `width` on the way in, and this is the one place
 * the factor of two lives on the way back out.
 */
export function rectangleFromAxis(p1: Position, p2: Position, halfWidth: number): Position[] {
    const axis = turf.bearing(turf.point(p1), turf.point(p2));
    const off = (from: Position, bearing: number): Position =>
        halfWidth > 0
            ? (turf.destination(turf.point(from), halfWidth, bearing, {units: 'meters'}).geometry.coordinates as Position)
            : from;
    // Anticlockwise from point 1's left flank, closed.
    const a = off(p1, axis - 90);
    const b = off(p2, axis - 90);
    const c = off(p2, axis + 90);
    const d = off(p1, axis + 90);
    return [a, b, c, d, a];
}

/**
 * The inverse, for a box drawn before the conversion: the axis through the midpoints of
 * the two **shorter** sides, and half the longer dimension across it.
 *
 * Point 1 is the western of the two midpoints, or the southern when the box is taller
 * than it is wide — a drawn box records no direction, so this is a convention rather
 * than a recovery. What it does preserve is the shape: the same rectangle comes back.
 */
export function axisFromRectangleRing(
    ring: Position[] | undefined,
): {p1: Position; p2: Position; halfWidth: number} | undefined {
    if (!ring || ring.length < 4) return undefined;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of ring) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    }
    if (!isFinite(minX) || maxX <= minX || maxY <= minY) return undefined;

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const across = turf.distance(turf.point([midX, minY]), turf.point([midX, maxY]), {units: 'meters'});
    const along = turf.distance(turf.point([minX, midY]), turf.point([maxX, midY]), {units: 'meters'});

    // The axis runs along the longer dimension, so the two anchor points land on the
    // shorter sides — which is the pair the standard numbers.
    return along >= across
        ? {p1: [minX, midY], p2: [maxX, midY], halfWidth: across / 2}
        : {p1: [midX, minY], p2: [midX, maxY], halfWidth: along / 2};
}

/**
 * Half-width a freshly drawn rectangular zone starts at, in screen pixels.
 *
 * **Wider than the library's generic 20 px drawn offset**, and deliberately its own
 * number: a corridor's 20 px is a rail standing off a route, where this is half of a
 * whole area — at 20 px the zone came out a letterbox and the width handle sat almost on
 * the axis. (User's call, 2026-08-27.)
 *
 * Here rather than in a holder because both engines seed it, and a zone drawn with the
 * identical two clicks has to come out the identical size on either. They disagreed by a
 * factor of two the first time this was written down in only one of them.
 */
export const RECTANGLE_DEFAULT_HALF_WIDTH_PX = 55;

/**
 * A rectangle's half-width when nobody supplied one and there is no zoom to spend a
 * screen size at — a share of its own axis.
 *
 * **The sample sweeps are why this exists.** Each engine draws its own sheet and then
 * replays its own snapshot, and the comparison's whole premise is that the two start from
 * the same base. They did until a rectangle's width became a *seeded* figure rather than
 * one measured off a drawn box: OpenLayers seeded it from the resolution its holder was
 * constructed at and MapLibre from the resolution its adapter was handed, and the two
 * sheets are built at different zooms. Measured, the same graphic: 360 km against 1,005.
 *
 * A share of the axis is resolution-free, so both sheets reach it from the geometry alone.
 * A twentieth either side is what the drawn defaults come to at an ordinary zoom.
 * @see rectangleFromAxis
 */
export function rectangleDefaultHalfWidth(axisLengthMeters: number): number {
    return axisLengthMeters * RECTANGLE_DEFAULT_WIDTH_FRACTION;
}

const RECTANGLE_DEFAULT_WIDTH_FRACTION = 1 / 20;

/** Shortest axis a rectangle may be dragged to, in metres — below this it has no shape. */
const RECTANGLE_MIN_LENGTH = 1;
/** Metres in a degree of latitude, for the local flattening. @see constrainRectangleAxis */
const DEGREE_METRES = 111_320;

/**
 * A rectangle's axis after one of its two anchor points has been dragged.
 *
 * **The drag sets the length, never the orientation.** APP-06 puts points 1 and 2 at the
 * centres of the two opposing sides, so moving one is how an operator makes the zone
 * longer or shorter — and letting the same drag swing the rectangle round meant there was
 * no way to change the length *without* risking a turn. Rotating is the rotate gesture's
 * job, and it still turns the whole symbol freely. (User's call, 2026-08-27.)
 *
 * So the moved point is projected back onto the axis the rectangle already had, measured
 * from the point that did not move.
 *
 * Returns `next` untouched when it is not one endpoint moving: a rotate moves both, a
 * translate moves both, and a rebuild moves neither. That test is the whole discriminator
 * — there is no flag to read and no gesture name at this level.
 */
export function constrainRectangleAxis(previous: Position[] | undefined, next: Position[]): Position[] {
    if (!previous || previous.length < 2 || next.length < 2) return next;
    const movedFirst = !samePoint(previous[0], next[0]);
    const movedLast = !samePoint(previous[1], next[1]);
    if (movedFirst === movedLast) return next;

    const anchor = movedFirst ? next[1] : next[0];
    const moved = movedFirst ? next[0] : next[1];

    /*
     * **Projected in a local plane, not walked along a great circle.**
     *
     * The instruction is that a side handle changes the east-west coordinate and nothing
     * else, and a level rectangle is the ordinary case. A great-circle bearing of 90 does
     * not hold a latitude — over 4,500 km at 51 degrees north it drifts far enough to be
     * a visible tilt — so walking `along` metres at the previous bearing put the zone off
     * level on every length drag. Flattening longitude by `cos(lat)` about the anchor
     * makes "along the axis" exact for a level zone and correct to a hair for a turned
     * one, which is the whole range this has to cover.
     */
    const scale = Math.cos((anchor[1] * Math.PI) / 180) || 1e-9;
    const from = movedFirst ? previous[1] : previous[0];
    const to = movedFirst ? previous[0] : previous[1];
    const dx = (to[0] - from[0]) * scale;
    const dy = to[1] - from[1];
    const axis = Math.hypot(dx, dy);
    if (!(axis > 0)) return next;
    const ux = dx / axis;
    const uy = dy / axis;

    // The component of anchor → moved along the axis. A drag past the anchor is a
    // zero-length zone, not a flipped one, so it is held at a floor.
    const along = (moved[0] - anchor[0]) * scale * ux + (moved[1] - anchor[1]) * uy;
    const minimum = RECTANGLE_MIN_LENGTH / DEGREE_METRES;
    const held: Position = [
        anchor[0] + (ux * Math.max(minimum, along)) / scale,
        anchor[1] + uy * Math.max(minimum, along),
    ];
    return movedFirst ? [held, next[1]] : [next[0], held];
}

/**
 * A rectangle drawn with two clicks, squared up.
 *
 * **Nothing calls this any more, and that is the point of saying so here.** Both renderers
 * used it on the draw, so a zone clicked out at an angle came out level and had to be turned
 * by a separate gesture (user's call, 2026-08-27) — while the rectangular target, whose drag
 * sets `rotation` directly, never behaved that way. One family of rectangles took its
 * orientation from the draw and the other nineteen refused to. **Reversed on 2026-09-04**:
 * the drawn axis is the rectangle's axis, on both engines and for all twenty.
 *
 * Kept exported because it is a correct, tested utility and removing an export is a breaking
 * change — but wiring it back into a draw path would undo a decision, not fix a bug.
 * `rectangleDrawParity.test.ts` asserts the axis survives the draw.
 *
 * The direction is kept: drag east and point 2 lands east.
 */
export function levelRectangleAxis(coordinates: Position[]): Position[] {
    if (coordinates.length < 2) return coordinates;
    const [p1, p2] = [coordinates[0], coordinates[coordinates.length - 1]];
    // **Point 2 keeps its longitude and takes point 1's latitude**, which is level by
    // construction. Walking `length` metres due east instead is not: a great-circle
    // bearing of 90 curves away from the parallel, and over 28 km at 51 degrees north it
    // lands 93 m off the latitude it started at. The zone spans the east-west extent the
    // operator dragged, which is what "make it straight" means to the person dragging.
    if (Math.abs(p2[0] - p1[0]) < 1e-9) return coordinates;
    return [p1, [p2[0], p1[1]]];
}

/** Two positions within a millimetre of each other, in degrees. */
function samePoint(a: Position, b: Position): boolean {
    return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}
