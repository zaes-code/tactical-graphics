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
