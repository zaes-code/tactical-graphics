/**
 * # What each of a graphic's handles is for
 *
 * `generateHandles` returns a bare list of points, and their *order* is the
 * contract — index 2 on a movement graphic sets its road width, index 0 on a turn
 * sets its bend, index 3 on a range fan sets the fourth band's range. That
 * knowledge lives in the generators, so it belongs here rather than in a renderer:
 * OpenLayers currently encodes it by splitting the list across differently-styled
 * features and switching on which one was grabbed, which works but cannot be read
 * by anything else.
 *
 * **Getting a role wrong is silent.** A drag on a mis-labelled handle does
 * something plausible — it resizes instead of setting a width, or bends the wrong
 * graphic — rather than failing, so there is nothing to catch it but knowing.
 */

import {TacticalGraphicName} from './type';

/**
 * What dragging a handle does.
 *
 * - `shape` — whatever the current edit mode means. The default.
 * - `offset` — sets the graphic's **width**, from the cursor's perpendicular
 *   distance to the base. Its sign also flips `mirrored`.
 * - `bend` — sets `bend`, the unitless sharpness of a curve.
 * - `reach` — sets both size and bearing from one cursor position: the far end of
 *   a chord carries how long it is and which way it points.
 * - `band` — sets one range-fan band's range, by index.
 * - `centre` — moves the graphic. Found by position, not by index. @see NativeLayerRenderer
 */
export type HandleRole = 'shape' | 'offset' | 'bend' | 'reach' | 'band';

export interface HandleContract {
    /** Role of each handle, by index. */
    roles: HandleRole[];
    /**
     * Role for every index past `roles` — the range fans, which emit one handle per
     * band and so have no fixed length.
     */
    repeating?: HandleRole;
    /**
     * Sensitivity of an offset drag: `width = |perpendicular| × offsetScale`.
     *
     * It has to be the reciprocal of however many widths out the handle is drawn,
     * or the graphic jumps to a different size the moment the drag begins. The 0.5
     * default suits a handle drawn at two offsets out; a graphic whose handle sits
     * on the rail itself tracks the cursor 1:1.
     */
    offsetScale?: number;
}

/** The default: every handle just reshapes, and the mode decides how. */
const SHAPE_ONLY: HandleContract = {roles: [], repeating: 'shape'};

/**
 * The movement and manoeuvre family. `generateHandles` returns
 * `[start, end, offset]`, and the third is present only on the graphics that have
 * a width to set.
 */
const MOVEMENT_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.AttackHelicopterAxisOfAdvance,
    TacticalGraphicName.MainAxisOfAdvance,
    TacticalGraphicName.MainAxisOfAdvanceFeint,
    TacticalGraphicName.AviationAxisOfAdvance,
    TacticalGraphicName.SupportingAxisOfAdvance,
    TacticalGraphicName.Counterattack,
    TacticalGraphicName.InfiltrationLane,
    TacticalGraphicName.Bridge,
    TacticalGraphicName.Gap,
    TacticalGraphicName.AssaultCrossing,
    TacticalGraphicName.FordEasy,
    TacticalGraphicName.FordDifficult,
    TacticalGraphicName.FrontalAttack,
    TacticalGraphicName.TurningMovement,
    TacticalGraphicName.Infiltration,
    // FlankAttack and DoubleEnvelopment are routed here by the controller registry
    // but are commented out of the enum — see ai/excluded-graphics.md. Listing them
    // would not compile, which is the enum doing its job.
];

/**
 * The block family. Its offset handle is **first**, not last — the opposite of the
 * movement family, and the reason a renderer cannot guess the role from the index
 * alone.
 */
const BLOCK_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.TacticalBlock,
    TacticalGraphicName.Breach,
    TacticalGraphicName.Bypass,
    TacticalGraphicName.Canalize,
    TacticalGraphicName.Clear,
    TacticalGraphicName.TacticalDisrupt,
    TacticalGraphicName.Penetration,
    TacticalGraphicName.Exploitation,
    TacticalGraphicName.Block,
    TacticalGraphicName.Disrupt,
    TacticalGraphicName.AttackByFire,
    TacticalGraphicName.SupportByFire,
    // FollowAndAssume and FollowAndSupport are excluded the same way.
];

/**
 * Graphics whose perpendicular size is locked to a fraction of their own base
 * length, so the user can rotate and resize but never change the aspect ratio.
 * The value is perpendicular-size / base-length.
 *
 * **A proportion, so both renderers have to know it.** It lived in the OpenLayers
 * holder, which recomputes the size from the base on every geometry change and
 * refuses the width drag outright. A renderer without the table has to invent a
 * size instead, and MapLibre's guess — a screen constant times the resolution —
 * drew the same breach with more than twice the line work at a close zoom.
 *
 * A ratio-locked graphic derives its size from its base *always*, in either engine.
 * That is what makes it ratio-locked: a caller-supplied size is not a size the
 * symbol may take.
 */
export const RATIO_LOCK: Partial<Record<TacticalGraphicName, number>> = {
    [TacticalGraphicName.AttackByFire]: 0.4,
    [TacticalGraphicName.SupportByFire]: 0.4,
    [TacticalGraphicName.Breach]: 0.3,
    [TacticalGraphicName.Bypass]: 0.3,
    [TacticalGraphicName.Canalize]: 0.3,
    [TacticalGraphicName.Clear]: 0.3,
    [TacticalGraphicName.TacticalDisrupt]: 0.3,
    // The table 5-19 twin behaves exactly as the mission task it copies.
    [TacticalGraphicName.Disrupt]: 0.3,
};

/** The locked perpendicular-size / base-length ratio, or undefined. @see RATIO_LOCK */
export function ratioLockOf(name: TacticalGraphicName): number | undefined {
    return RATIO_LOCK[name];
}

/**
 * How far out each family draws its offset handle, as a multiple of the width it
 * sets. A handle drawn three widths out needs a third of the drag.
 */
const OFFSET_SCALE: Partial<Record<TacticalGraphicName, number>> = {
    // The handle sits on the rail itself, one radius off the centre line.
    [TacticalGraphicName.InfiltrationLane]: 1,
    // The handle is the end of the front line, drawn at 3 × size.
    [TacticalGraphicName.Penetration]: 1 / 3,
    // The handle is the end of the crossbar, drawn at 1 × size.
    [TacticalGraphicName.TacticalBlock]: 1,
    [TacticalGraphicName.Block]: 1,
    // The handle is an arrowhead wing, `size × sin 45°` off the base line.
    [TacticalGraphicName.Exploitation]: Math.SQRT2,
};

/** The two curve-and-arrow tasks: `[bend, tip]`. */
const BENT_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.Turn,
    TacticalGraphicName.TacticalTurn,
    TacticalGraphicName.Envelopment,
];

/**
 * One handle per band, so the roles list has no fixed length.
 *
 * `generateHandles` returns `[centre, band0, band1, …]`, so **handle *i* is band
 * *i* − 1**. The centre is index 0, which the renderer also finds by position and
 * treats as a move — that agreement is not a coincidence, but the offset still has
 * to be applied or every band drag would set the wrong ring.
 */
export const RANGE_FANS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.WeaponSensorRangeFanCircular,
    TacticalGraphicName.WeaponSensorRangeFanSector,
];

/** How many leading handles come before the first band's. @see RANGE_FANS */
export const RANGE_FAN_BAND_OFFSET = 1;

/** What each handle of `name` does. */
export function handleContract(name: TacticalGraphicName): HandleContract {
    if (MOVEMENT_GRAPHICS.includes(name)) {
        return {roles: ['shape', 'shape', 'offset'], repeating: 'shape', offsetScale: OFFSET_SCALE[name]};
    }
    if (BLOCK_GRAPHICS.includes(name)) {
        return {roles: ['offset'], repeating: 'shape', offsetScale: OFFSET_SCALE[name]};
    }
    if (BENT_GRAPHICS.includes(name)) {
        return {roles: ['bend', 'reach']};
    }
    if (RANGE_FANS.includes(name)) {
        return {roles: [], repeating: 'band'};
    }
    return SHAPE_ONLY;
}

/** The role of one handle, or `shape` when the index is past the contract. */
export function handleRole(name: TacticalGraphicName, index: number): HandleRole {
    const contract = handleContract(name);
    return contract.roles[index] ?? contract.repeating ?? 'shape';
}

/**
 * Whether this graphic belongs to the movement family.
 *
 * The distinction matters beyond handles: the two OpenLayers holder families read a
 * stamped `radius` differently. `LineGraphicBase` replays it as the graphic's
 * *decoration* size — that is what its `setOffset` does on restore — while
 * `MovementGraphicBase` stamps `width` for its rails and derives the decoration from
 * the resolution every time, so a `radius` on one of those means nothing.
 *
 * A renderer choosing a decoration size has to know which it is looking at, or it
 * either ignores a size the user set or honours a number that was never meant as
 * one. @see maplibreAdapter, `bakedDecorationSize`
 */
export function isMovementGraphic(name: TacticalGraphicName): boolean {
    return MOVEMENT_GRAPHICS.includes(name);
}

/**
 * The point a rotate or a resize is measured about, given a graphic's **base**
 * geometry in lon/lat.
 *
 * Three rules, one per base shape, and they are not interchangeable:
 *
 * - **A point-anchored graphic turns about its own point.** There is nothing else
 *   it could turn about.
 * - **A drawn line turns about its first vertex.** That is where the user started
 *   the graphic, and every line-family symbol grows from it: an axis of advance
 *   stretches along its bearing from p0, and a resize that moved p0 would slide the
 *   graphic off the thing it was drawn against.
 * - **A polygon turns about a point inside itself.** The midpoint of the extent is
 *   not inside a concave ring, and a pivot outside the shape swings it away rather
 *   than turning it.
 *
 * **A renderer that picks its own is a renderer that edits differently.** These
 * lived in the OpenLayers controllers' `getCenter()` overrides, one per family, so
 * MapLibre had no way to see them and pivoted everything about the extent midpoint.
 * A fields-of-fire rotated about its middle in one engine and about its left leg in
 * the other, from the same drag.
 *
 * The polygon case returns the **extent midpoint** for a convex ring, which is where
 * an interior point lands anyway, and the average of the vertices otherwise. It is a
 * near-match for OpenLayers' `Polygon.getInteriorPoint`, not a reimplementation of
 * it; the two agree to well under a pixel on the shapes this library draws.
 */
export function rotationAnchor(geometry: {type: string; coordinates: unknown}): [number, number] {
    const positions = flattenPositions(geometry.coordinates);
    if (!positions.length) return [0, 0];

    if (geometry.type === 'Point') return positions[0];
    if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') return positions[0];

    // Measured in **projected** metres, not degrees. OpenLayers' `getInteriorPoint`
    // runs on EPSG:3857 coordinates, and Mercator's y is not linear in latitude — the
    // midpoint of 0 deg and 60 deg is 33 deg on screen and 30 deg in degrees. On a tall
    // polygon the two pivots are far enough apart to see.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [lon, lat] of positions) {
        const y = mercatorY(lat);
        if (lon < minX) minX = lon;
        if (lon > maxX) maxX = lon;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    const midpoint: [number, number] = [(minX + maxX) / 2, latitudeOf((minY + maxY) / 2)];
    return pointInRing(positions, midpoint) ? midpoint : averageOf(positions);
}

/** Mercator y for a latitude in degrees, in radians-worth of units. */
const mercatorY = (lat: number): number => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/** The inverse of {@link mercatorY}, back to degrees. */
const latitudeOf = (y: number): number => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * (180 / Math.PI);

/** Every `[x, y]` in a nested coordinate array, in order. */
function flattenPositions(node: unknown): [number, number][] {
    if (!Array.isArray(node) || !node.length) return [];
    if (typeof node[0] === 'number') return [[node[0] as number, node[1] as number]];
    return (node as unknown[]).flatMap(flattenPositions);
}

const averageOf = (positions: [number, number][]): [number, number] => [
    positions.reduce((sum, p) => sum + p[0], 0) / positions.length,
    positions.reduce((sum, p) => sum + p[1], 0) / positions.length,
];

/** Ray casting, in the plane. Good enough at the scale a pivot needs. */
function pointInRing(ring: [number, number][], [x, y]: [number, number]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}
