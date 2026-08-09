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
const RANGE_FANS: readonly TacticalGraphicName[] = [
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
