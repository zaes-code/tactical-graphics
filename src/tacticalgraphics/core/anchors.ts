import {Position} from 'geojson';
import * as turf from './turf';

/**
 * # Drawn anchor points ⇄ the frame a point-anchored generator wants
 *
 * APP-06 defines most of the manoeuvre symbols from **drawn points**: "point 1 defines
 * the beginning of the straight line, point 2 the end, point 3 the diameter". This
 * library grew them the other way round — a dropped centre plus a `size` and a
 * `rotation` — so the symbols are right but the user cannot set their proportions.
 *
 * Rather than rewrite eight pieces of geometry, this converts between the two. A
 * generator keeps the shape maths it already has and asks for its frame here; the
 * frame is derived from what the user drew instead of from a centre and a scalar.
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

/** Metres between two lon/lat positions. */
function metres(a: Position, b: Position): number {
    return turf.distance(turf.point(a), turf.point(b), {units: 'meters'});
}

/**
 * What a point-anchored generator needs, recovered from the points the user drew.
 *
 * `size` is the **half**-length of the straight run, because that is what the
 * generators mean by it: they lay their axis from `-size` to `+size` about the centre.
 */
export interface DrawnFrame {
    /** Midpoint of the straight run — where a dropped symbol would have been centred. */
    center: Position;
    /** Planar radians CCW from east, along point 1 → point 2. */
    angle: number;
    /** Half the distance between point 1 and point 2. Never zero. */
    size: number;
    /**
     * Perpendicular distance from the axis to the *next* anchor point, in metres.
     *
     * APP-06 calls this the diameter on Envelopment and Pursuit and the width on the
     * demolition bars. Undefined when the user drew only two points, in which case the
     * generator keeps whatever default it had.
     */
    offset?: number;
    /** Which flank that point fell on: `+1` left of the run, `-1` right. */
    side: number;
}

/** The smallest run a frame can describe, in metres. Below this a drag is a click. */
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
    const span = metres(start, end);
    if (!isFinite(span) || span < MIN_SIZE_M) return undefined;

    const angle = planarAngle(start, end);
    const center = turf.destination(turf.point(start), span / 2, turf.bearing(turf.point(start), turf.point(end)), {
        units: 'meters',
    }).geometry.coordinates as Position;

    const frame: DrawnFrame = {center, angle, size: span / 2, side: 1};

    // A third point sets how far the symbol reaches off its own axis, and on which side.
    if (coords.length >= 3) {
        const reference = coords[coords.length - 2];
        const away = metres(center, reference);
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
    const at = (u: number, v: number): Position => {
        const distance = Math.hypot(u, v);
        if (distance === 0) return [center[0], center[1]];
        const bearing = 90 - toDegrees(angle + Math.atan2(v, u));
        return turf.destination(turf.point(center), distance, bearing, {units: 'meters'}).geometry.coordinates as Position;
    };

    const run: Position[] = [at(-size, 0), at(size, 0)];
    if (offset === undefined || !(offset > 0)) return run;
    // Inserted *before* the run's end, which is where `frameFromAnchors` looks for it.
    return [run[0], at(0, side * offset), run[1]];
}
