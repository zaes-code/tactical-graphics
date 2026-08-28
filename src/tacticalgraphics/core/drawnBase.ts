/**
 * # Tidying up what a user actually drew
 *
 * Between the last click and the stored base there is a step both renderers need and
 * neither owned: turning the raw click sequence into a base the generator and the
 * edit handles can both work with.
 *
 * It exists because a **double-click broke fields of fire in both engines, by two
 * different routes**, and the fix belongs in one place rather than two:
 *
 * - OpenLayers ended the draw at two vertices. The generator then synthesized the
 *   second leg at a fixed angle on every render, so the V was real but frozen —
 *   dragging a leg swung the other one with it and the angle never changed.
 * - MapLibre delivers a double-click's two clicks as ordinary `click`s first, so the
 *   apex went in twice. That reached the three-vertex count and finished the draw
 *   with a leg of zero length: no V to open, and the tip handle sitting exactly on
 *   the apex handle.
 *
 * Both produced the same complaint — the V angle cannot be modified — so both are
 * repaired the same way: drop the repeated vertex, then **materialise** the leg the
 * generator would have synthesized, so it is a real vertex with a real handle that a
 * user can drag. The default-angle V a double-click produces is then a starting
 * point rather than a cage.
 */

import type {Position} from 'geojson';
import {asVee} from '../graphics/FieldsOfFire';
import {TacticalGraphicName} from './type';
import {generatorOrder, storedOrder} from './drawOrder';
import {levelRectangleAxis} from './anchors';
import {isRectangular} from './handles';
import geometryService from './GeometryService';

/**
 * Two positions that are the same position.
 *
 * Degrees rather than pixels, because this runs after the gesture is over and has no
 * view to ask. Small enough to catch only an exactly-repeated click — about a
 * centimeter at the equator — since a user placing two vertices deliberately close
 * together still means both of them.
 */
const DUPLICATE_EPSILON_DEG = 1e-7;

const samePosition = (a: Position, b: Position): boolean =>
    Math.abs(a[0] - b[0]) < DUPLICATE_EPSILON_DEG && Math.abs(a[1] - b[1]) < DUPLICATE_EPSILON_DEG;

/**
 * How far point 2 sits off the chord on an exfiltration or infiltration, in screen pixels.
 *
 * The S's depth. Below the floor the two 90-degree arcs are too tight to read as an S at
 * all — the symbol degenerates into the straight line the chord already is — and past the
 * ceiling the kink dominates a graphic whose subject is the route. **The side stays the
 * user's**: point 2 above the first segment or below it is a real choice, and only the
 * distance is clamped. (User's call, 2026-08-27.)
 */
export const S_CURVE_MIN_OFFSET_PX = 30;
export const S_CURVE_MAX_OFFSET_PX = 100;

/** The two graphics built from {@link GeometryService.createSCurve}. */
const S_CURVE_GRAPHICS = new Set<TacticalGraphicName>([
    TacticalGraphicName.Exfiltrate,
    TacticalGraphicName.Infiltration,
]);

/**
 * Point 2 held to a readable distance from the chord, keeping the side the user chose.
 *
 * The one place in this module that **moves** a vertex rather than adding or removing one,
 * which is why it only runs when a renderer supplied a resolution: a pixel range means
 * nothing without one, and a caller that cannot say what the zoom is gets the user's point
 * back untouched.
 */
function clampSCurveAnchor(coordinates: Position[], resolution: number): Position[] {
    if (coordinates.length < 3 || !(resolution > 0)) return coordinates;

    const [a, c, b] = [coordinates[0], coordinates[1], coordinates[2]];
    const A = geometryService.project(a);
    const B = geometryService.project(b);
    const C = geometryService.project(c);

    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const chord = Math.hypot(dx, dy);
    if (chord === 0) return coordinates;

    const ux = dx / chord;
    const uy = dy / chord;
    // Signed perpendicular offset, and how far along the chord point 2 sits.
    const offset = (C[0] - A[0]) * -uy + (C[1] - A[1]) * ux;
    const along = (C[0] - A[0]) * ux + (C[1] - A[1]) * uy;

    const side = offset < 0 ? -1 : 1;
    const min = S_CURVE_MIN_OFFSET_PX * resolution;
    const max = S_CURVE_MAX_OFFSET_PX * resolution;
    const held = Math.min(max, Math.max(min, Math.abs(offset))) * side;
    if (held === offset) return coordinates;

    const moved = geometryService.unproject([
        A[0] + ux * along + -uy * held,
        A[1] + uy * along + ux * held,
    ]);
    return [a, moved, b, ...coordinates.slice(3)];
}

/**
 * The base geometry to store for a graphic the user has just drawn.
 *
 * Adds meaning that was already implied and removes what was never meant. It moves a
 * vertex the user placed in exactly one case — the S pair's point 2, held to a readable
 * offset — and only when the caller supplies the resolution that makes a pixel range
 * meaningful. A graphic with nothing to tidy comes back unchanged.
 *
 * Rings are left alone — a polygon's first and last vertex are equal on purpose, and
 * de-duplicating them would open the ring.
 */
export function normalizeDrawnBase(
    name: TacticalGraphicName,
    coordinates: Position[],
    resolution?: number,
): Position[] {
    if (coordinates.length < 2) return coordinates;

    const deduped = coordinates.filter((position, index) => index === 0 || !samePosition(position, coordinates[index - 1]));

    // The generator draws a V from two points by swinging the second leg. Storing that
    // leg makes it editable: `asVee` is the same function the renderer would have
    // called, so the symbol does not change shape — it just gains the handle it was
    // always missing.
    // **Through the generator's own order and back.** `asVee` reads `[end, apex]`, which
    // is the order the generator sees; what is stored is APP-06's `[apex, end]`. Handing
    // it the stored order swung the second leg about a leg *end*, so a two-click V came
    // out hinged on the wrong point. @see drawOrder.ts
    if (S_CURVE_GRAPHICS.has(name) && resolution !== undefined) {
        return clampSCurveAnchor(deduped, resolution);
    }

    if (name === TacticalGraphicName.FieldsOfFire) {
        return storedOrder(name, asVee(generatorOrder(name, deduped)));
    }

    // A rectangular zone is drawn level and turned afterwards. @see levelRectangleAxis
    if (isRectangular(name)) return levelRectangleAxis(deduped);

    return deduped;
}
