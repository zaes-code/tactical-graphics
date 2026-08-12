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
 * The base geometry to store for a graphic the user has just drawn.
 *
 * Only ever **adds** meaning that was already implied and removes what was never
 * meant: it does not move a vertex the user placed. A graphic with nothing to tidy
 * comes back with its coordinates unchanged, so every other graphic is unaffected.
 *
 * Rings are left alone — a polygon's first and last vertex are equal on purpose, and
 * de-duplicating them would open the ring.
 */
export function normalizeDrawnBase(name: TacticalGraphicName, coordinates: Position[]): Position[] {
    if (coordinates.length < 2) return coordinates;

    const deduped = coordinates.filter((position, index) => index === 0 || !samePosition(position, coordinates[index - 1]));

    // The generator draws a V from two points by swinging the second leg. Storing that
    // leg makes it editable: `asVee` is the same function the renderer would have
    // called, so the symbol does not change shape — it just gains the handle it was
    // always missing.
    if (name === TacticalGraphicName.FieldsOfFire) return asVee(deduped);

    return deduped;
}
