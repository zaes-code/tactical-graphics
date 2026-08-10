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
export type HandleRole = 'shape' | 'offset' | 'bend' | 'reach' | 'band' | 'mirror';

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
    /**
     * Every handle past the base's own vertex count is an `offset`.
     *
     * For the contracts whose split is not a fixed prefix but a variable one: a
     * corridor's generator emits `[...vertices, ...tangent points]`, and how many
     * vertices there are is however many the user drew. @see handleRole
     */
    offsetAfterVertices?: boolean;
}

/**
 * The retrograde tasks, whose second handle **sets which side the symbol hangs on**
 * and nothing else.
 *
 * Delay, the three withdrawals, disengage, retirement and both passages of lines all
 * draw their cane or arrow to one side of the drawn line, and every one of them can be
 * flipped to the other. The gesture is a drag of that handle across the line.
 *
 * It is a `mirror` rather than an `offset` because it carries no width: measured on a
 * retirement in OpenLayers, dragging the handle 170 px either way left `width` at
 * 200000 and moved no vertex — the only thing that changed was `mirrored`. Declaring it
 * as an offset would have made MapLibre resize the graphic on a gesture that, in the
 * other engine, only turns it over.
 *
 * **It lived in the OpenLayers controllers**, which is why MapLibre could not flip any
 * of these: `handleRole` called both handles `shape`, so a drag on the second moved a
 * vertex there while OpenLayers turned the symbol over. Measured across all seven,
 * OpenLayers flipped via handle 1 and MapLibre flipped via nothing at all.
 */
const MIRROR_HANDLE_AT_1: HandleContract = {roles: ['shape', 'mirror'], repeating: 'shape'};

/** The graphics that wear it. @see MIRROR_HANDLE_AT_1 */
const MIRROR_HANDLE_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.Delay,
    TacticalGraphicName.Withdraw,
    TacticalGraphicName.WithdrawUnderPressure,
    TacticalGraphicName.Disengage,
    TacticalGraphicName.Retirement,
    TacticalGraphicName.ForwardPassageOfLines,
    TacticalGraphicName.RearwardPassageOfLines,
];

/**
 * Whether this graphic can be flipped to the other side of its own line.
 *
 * Exported so a renderer, a properties panel or a test can ask without keeping its own
 * list — and so the answer is the same wherever it is asked.
 */
export function supportsMirror(name: TacticalGraphicName): boolean {
    return MIRROR_HANDLE_GRAPHICS.includes(name);
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

/**
 * The corridors. Their generator emits `[...base vertices, ...tangent points]`, and
 * the tail is the **width**: a tangent point sits one radius off the centre line, so
 * dragging one sets how wide the corridor is.
 *
 * The split cannot be written as a fixed prefix, which is what every other contract
 * here uses — the vertex count is however many points the user drew. So the contract
 * says "offset after the vertices" and the caller supplies the count.
 *
 * `offsetScale` is 1 rather than the shared half: the perpendicular distance from the
 * centre line to the handle *is* the radius, so it has to track the cursor 1:1 or the
 * handle runs away from it.
 */
const CORRIDOR_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.AirCorridor,
    TacticalGraphicName.LowLevelTransitRoute,
    TacticalGraphicName.MinimumRiskRoute,
    TacticalGraphicName.SafeLane,
    TacticalGraphicName.SpecialCorridor,
    TacticalGraphicName.StandardUseArmyAircraftFlightRoute,
    TacticalGraphicName.TransitCorridor,
    TacticalGraphicName.UnmannedAircraftCorridor,
];

/** What each handle of `name` does. */
export function handleContract(name: TacticalGraphicName): HandleContract {
    if (CORRIDOR_GRAPHICS.includes(name)) {
        return {roles: [], repeating: 'shape', offsetAfterVertices: true, offsetScale: 1};
    }
    if (MOVEMENT_GRAPHICS.includes(name)) {
        return {roles: ['shape', 'shape', 'offset'], repeating: 'shape', offsetScale: OFFSET_SCALE[name]};
    }
    if (BLOCK_GRAPHICS.includes(name)) {
        return {roles: ['offset'], repeating: 'shape', offsetScale: OFFSET_SCALE[name]};
    }
    if (MIRROR_HANDLE_GRAPHICS.includes(name)) {
        return MIRROR_HANDLE_AT_1;
    }
    if (BENT_GRAPHICS.includes(name)) {
        return {roles: ['bend', 'reach']};
    }
    if (RANGE_FANS.includes(name)) {
        return {roles: [], repeating: 'band'};
    }
    return SHAPE_ONLY;
}

/**
 * The role of one handle, or `shape` when the index is past the contract.
 *
 * `vertexCount` — how many points the user drew — is only consulted by the contracts
 * that split on it, the corridors. Omitting it there leaves every handle `shape`,
 * which is what MapLibre did: it drew the corridor's width handles and gave them
 * nothing to do, so a corridor could not be widened in that engine at all.
 */
export function handleRole(name: TacticalGraphicName, index: number, vertexCount?: number): HandleRole {
    const contract = handleContract(name);
    if (contract.offsetAfterVertices && vertexCount !== undefined && index >= vertexCount) return 'offset';
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

/**
 * How many points a graphic's base takes, when the answer is fixed.
 *
 * A drawing rule, and a portable one: it says what the *symbol* is, not how one
 * renderer collects clicks. A fields-of-fire is two segments meeting at an apex —
 * one segment is a line with an arrowhead at each end, three is a shape FM 1-02.2
 * does not draw — so the draw has to end on the third click whichever engine is
 * collecting them.
 *
 * It lived in `openlayers/controllerRegistry.ts` as an argument to a factory, which
 * is why MapLibre had no limit at all: its draw waited for a double-click that a
 * fixed-vertex graphic never sends, so **a fields-of-fire could not be drawn there**
 * — five clicks and no graphic.
 *
 * `undefined` means "as many as the user wants", which is most line graphics.
 */
const BASE_VERTEX_COUNT: Partial<Record<TacticalGraphicName, number>> = {
    // Two segments, three points. The only graphic here that is not two points.
    [TacticalGraphicName.FieldsOfFire]: 3,

    // Two points: a start and an end, and the symbol is built between them.
    [TacticalGraphicName.FerryCrossing]: 2,
    [TacticalGraphicName.PassageLane]: 2,
    [TacticalGraphicName.TacticalFix]: 2,
    [TacticalGraphicName.Fix]: 2,
    [TacticalGraphicName.LinearTarget]: 2,
    [TacticalGraphicName.FinalProtectiveFire]: 2,
    [TacticalGraphicName.LinearSmokeTarget]: 2,

    // The block family: the bar is drawn across the line the user gives it.
    [TacticalGraphicName.TacticalBlock]: 2,
    [TacticalGraphicName.Breach]: 2,
    [TacticalGraphicName.Bypass]: 2,
    [TacticalGraphicName.Canalize]: 2,
    [TacticalGraphicName.Clear]: 2,
    [TacticalGraphicName.TacticalDisrupt]: 2,
    [TacticalGraphicName.Penetration]: 2,
    [TacticalGraphicName.Exploitation]: 2,
    [TacticalGraphicName.Block]: 2,
    [TacticalGraphicName.Disrupt]: 2,
    [TacticalGraphicName.AttackByFire]: 2,
    [TacticalGraphicName.SupportByFire]: 2,

    // The retrograde tasks: an axis from where the force is to where it goes.
    [TacticalGraphicName.Delay]: 2,
    [TacticalGraphicName.Withdraw]: 2,
    [TacticalGraphicName.WithdrawUnderPressure]: 2,
    [TacticalGraphicName.Disengage]: 2,
    [TacticalGraphicName.Retirement]: 2,
    [TacticalGraphicName.ForwardPassageOfLines]: 2,
    [TacticalGraphicName.RearwardPassageOfLines]: 2,
};

/**
 * The base vertex that **moves the graphic instead of reshaping it**.
 *
 * Fields of fire is the only one today: its apex. Dragging the apex under a reshape
 * would bend the V about a point the user thinks of as its origin, so OpenLayers
 * makes that vertex inert in modify mode and leaves moving to translate — the same
 * contract the inert centre dot has on a point-anchored graphic.
 *
 * It was the third argument to `vertexLine` in the OpenLayers registry, so MapLibre
 * did not know: measured on a fields of fire in modify mode, dragging the apex was
 * inert in OpenLayers and reshaped the graphic in MapLibre.
 */
const ANCHOR_VERTEX: Partial<Record<TacticalGraphicName, number>> = {
    [TacticalGraphicName.FieldsOfFire]: 1,
};

/**
 * Graphics whose base is a **rectangle**, and must stay one.
 *
 * Fourteen area variants that FM 1-02.2 draws as a box: the rectangular kill boxes,
 * fire-support areas, zones and target areas. The user draws two opposite corners and
 * the shape is derived; the four vertices are a *consequence* of that box, not points
 * with meanings of their own.
 *
 * So none of them may be dragged individually and none may be added to. Moving one
 * corner of a rectangle produces a quadrilateral, which is a different shape and not
 * one this symbol has — and the rectangular variants exist precisely because a
 * separate irregular-area variant is already available for when a user wants one.
 *
 * **It lived in an OpenLayers holder, invisible to anything else.**
 * `RectangularAreaGraphicController` draws with `createBox()` and then calls
 * `base.set('base', false)`, which quietly withdraws the graphic from the Modify
 * interaction — that single flag is the whole of how OpenLayers keeps these
 * rectangular. MapLibre had no way to know, so it let a corner be dragged to any
 * angle, and once a segment drag could add vertices it let a rectangle grow a fifth.
 */
const RECTANGULAR_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.FreeFireAreaRectangular,
    TacticalGraphicName.NoFireAreaRectangular,
    TacticalGraphicName.RestrictiveFireAreaRectangular,
    TacticalGraphicName.PositionAreaArtilleryRectangular,
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneRectangular,
    TacticalGraphicName.CallForFireZoneRectangular,
    TacticalGraphicName.CensorZoneRectangular,
    TacticalGraphicName.CriticalFriendlyZoneRectangular,
    TacticalGraphicName.DeadSpaceAreaRectangular,
    TacticalGraphicName.BlueKillBoxRectangular,
    TacticalGraphicName.PurpleKillBoxRectangular,
    TacticalGraphicName.TargetAreaRectangular,
    TacticalGraphicName.FireSupportAreaRectangular,
    TacticalGraphicName.AirSpaceCoordinationAreaRectangular,
];

/**
 * Whether this graphic's base is a rectangle whose corners are not individually
 * editable. Translate, rotate and resize all still apply — it is the *shape* that is
 * fixed, not the placement.
 */
export function isRectangular(name: TacticalGraphicName): boolean {
    return RECTANGULAR_GRAPHICS.includes(name);
}

/**
 * Graphics whose **edit-mode drag resizes them** when it does not land on a vertex.
 *
 * Dragging a fields-of-fire's leg — not its handle, the line between them — opens or
 * closes the V in OpenLayers, because its controller borrows the resize path for an
 * edit drag. That is what makes the two arms feel like an editable line rather than
 * a fixed shape you may only move. MapLibre translated instead, so the same drag slid
 * the whole graphic and the V angle could not be changed that way at all.
 *
 * It was `controller.editStretches = true`, set by six factories in the OpenLayers
 * registry, so no other renderer could see it. The circles are here for the same
 * reason: an edit drag on one resizes it, identically to resize mode.
 */
const EDIT_STRETCHES: readonly TacticalGraphicName[] = [
    // FireSupportStation, PointTarget and TargetReferencePoint belong here too and
    // are commented out of the enum. @see ai/excluded-graphics.md
TacticalGraphicName.Abatis,
    TacticalGraphicName.AirSpaceCoordinationAreaCircular,
    TacticalGraphicName.Ambush,
    TacticalGraphicName.AreaDefense,
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular,
    TacticalGraphicName.BaseDefenseZone,
    TacticalGraphicName.BlueKillBoxCircular,
    TacticalGraphicName.CallForFireZoneCircular,
    TacticalGraphicName.CensorZoneCircular,
    TacticalGraphicName.Contain,
    TacticalGraphicName.Control,
    TacticalGraphicName.CordonAndSearch,
    TacticalGraphicName.CriticalFriendlyZoneCircular,
    TacticalGraphicName.DeadSpaceAreaCircular,
    TacticalGraphicName.Envelopment,
    TacticalGraphicName.FieldsOfFire,
    TacticalGraphicName.FightingPosition,
    TacticalGraphicName.FireSupportAreaCircular,
    TacticalGraphicName.FreeFireAreaCircular,
    TacticalGraphicName.Isolate,
    TacticalGraphicName.MovementToContact,
    TacticalGraphicName.NoFireAreaCircular,
    TacticalGraphicName.Occupy,
    TacticalGraphicName.PositionAreaArtilleryCircular,
    TacticalGraphicName.PurpleKillBoxCircular,
    TacticalGraphicName.Pursuit,
    TacticalGraphicName.RestrictiveFireAreaCircular,
    TacticalGraphicName.Retain,
    TacticalGraphicName.Secure,
    TacticalGraphicName.TacticalTurn,
    TacticalGraphicName.TargetAreaCircular,
    TacticalGraphicName.Turn,
    TacticalGraphicName.WeaponSensorRangeFanCircular,
    TacticalGraphicName.WeaponSensorRangeFanSector,
];

/** Whether an edit drag that grabs no vertex resizes rather than moves. @see EDIT_STRETCHES */
export function editStretches(name: TacticalGraphicName): boolean {
    return EDIT_STRETCHES.includes(name);
}

/** The base vertex that is inert under a reshape, or `undefined`. @see ANCHOR_VERTEX */
export function anchorVertex(name: TacticalGraphicName): number | undefined {
    return ANCHOR_VERTEX[name];
}

/** How many points this graphic's base takes, or `undefined` for no limit. */
export function baseVertexCount(name: TacticalGraphicName): number | undefined {
    return BASE_VERTEX_COUNT[name];
}
