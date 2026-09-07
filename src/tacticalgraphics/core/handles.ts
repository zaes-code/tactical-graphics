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
 * **Getting a role wrong is silent.** A drag on a mis-labeled handle does
 * something plausible — it resizes instead of setting a width, or bends the wrong
 * graphic — rather than failing, so there is nothing to catch it but knowing.
 */

import {TacticalGraphicName} from './type';
import {drawnAnchorFrame} from './drawnAnchors';
import {drawsTipFirst} from './drawOrder';
import {reservedLeadPx} from './decorationSizes';
import {SECURITY_OPERATION_GRAPHICS, securityOperationBaseCentre} from '../graphics/SecurityOperation';

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
 * - `extend` — moves **one end of a two-ended symbol**, leaving the other where it is. The
 *   grip is an anchor point and it follows the cursor; the far end is the anchor. Distinct
 *   from `reach`, which measures from the centre and so moves *both* ends at once.
 * - `opening` — sets a sector's half-angle, **symmetrically about its axis**. One grip for
 *   one number, which is what 200700's *stop relative bearing* is: "an equal angle either
 *   side of the search axis". Distinct from `band`, which moves a distance, and from the
 *   weapon fan's per-band arc ends, which are two independent absolute bearings.
 * - `mirror` — turns the symbol over, without moving a vertex. Dragging it must not
 *   resize: it is a reflection, not a dimension. @see MIRROR_HANDLE_AT_0
 */
export type HandleRole = 'shape' | 'offset' | 'bend' | 'reach' | 'extend' | 'band' | 'mirror' | 'opening';

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
    /**
     * Which anchor point an `extend` drag pins, by index. Defaults to 0.
     *
     * An `extend` grip lengthens the symbol from the *other* end of its chord, so a reader
     * has to know which end that is — and the two graphics that carry the role number their
     * points in opposite directions. Turn stores `[tip, rear, bend]`, so the grip is the rear
     * and the tip (index 0) stays. Envelopment stores `[point 1, point 2, ...]` and its grip
     * *is* point 1, so point 2 (index 1) stays.
     *
     * Stated here rather than by name in a renderer, because which end a drag holds still is
     * a fact about the symbol. @see setExtend
     */
    extendAnchor?: number;
    /**
     * Which way a mirror drag is measured, for a point-anchored graphic.
     *
     * - `across` (the default) — the flip reflects the symbol **across** its own axis,
     *   so the perpendicular component decides it. An abatis's chevron swaps sides of
     *   its route this way.
     * - `along` — the flip reflects the symbol **about the perpendicular**, so the
     *   along-axis component decides it. A pursuit's semicircle bulges east or west of
     *   the same axis, and measuring its perpendicular meant dragging *north* flipped
     *   a graphic that visibly moves *east and west*.
     *
     * Getting it wrong is not a refusal, it is a gesture whose direction has nothing to
     * do with what it changes.
     */
    mirrorAxis?: 'across' | 'along';
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
const MIRROR_HANDLE_AT_0: HandleContract = {roles: ['mirror', 'shape'], repeating: 'shape'};

/**
 * The seven tasks drawn as a straight line with a 180 degree cane on its back end.
 *
 * One APP-06 rule between them, quoted in full on the generator: point 1 the arrowhead tip,
 * point 2 the end of the straight line, point 3 the arc's diameter and side. 342500 has no
 * Draw Rules cell and inherits 342400's. @see RetrogradeTask
 */
const CANE_ARROW_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.Delay,
    TacticalGraphicName.Withdraw,
    TacticalGraphicName.WithdrawUnderPressure,
    TacticalGraphicName.Disengage,
    TacticalGraphicName.Retirement,
    TacticalGraphicName.ForwardPassageOfLines,
    TacticalGraphicName.RearwardPassageOfLines,
];

/** The graphics that wear it. @see MIRROR_HANDLE_AT_0 */
const MIRROR_HANDLE_GRAPHICS: readonly TacticalGraphicName[] = [
    // The seven cane arrows left on 2026-09-06, for the reason 152800 left the day before:
    // their point 3 states which side the arc falls on, so dragging it across the line *is*
    // the flip, and a grip whose only job is to flip is no longer something they need.
    // @see RetrogradeTask
    // 344000 left on 2026-09-06, last of the family and for the identical reason: its own
    // rule says *"Point 3 defines the diameter and orientation of the 180 degree circular
    // arc"*, so dragging that point across the line **is** the flip. It kept the grip after
    // its seven siblings and 152800 dropped theirs, which put a *mirror* handle at index 0
    // where every sibling has a shape vertex — so the one gesture a user reaches for first,
    // dragging the arc's end, did something entirely different on this symbol.
    // (User's report: "pursuit point 3 drag still doesn't behave like other cane graphics
    // […] I'm trying to have consistency across similar graphics".)
    //
    // This one carries the handle elsewhere in its own contract below, but it mirrors just
    // the same, and `supportsMirror` is the question a panel or a test asks.
    TacticalGraphicName.Abatis,
    // 152800 left this list on 2026-09-06: its point 3 states which side the arc falls on,
    // so the flip is a placed point rather than an amplifier and there is no mirror gesture
    // left to advertise. @see MobileDefense.frame
];

/**
 * The graphics APP-06 defines from **drawn anchor points** rather than a dropped
 * center, and which this library is converting to match.
 *
 * > This symbol requires four anchor points. Point 1 defines the beginning of the
 * > straight line. Point 2 defines the end of the straight line portion of the
 * > graphic. Point 3 defines the diameter. (343500 Envelop)
 *
 * Each of these grew here as a center plus a `size` and a `rotation`, so the symbol is
 * right but its proportions are not the user's to set. Converting one means its base
 * geometry becomes a `LineString` carrying those points — which is what `core/anchors.ts`
 * converts to and from, so the shape maths each generator already has is untouched.
 *
 * **The list is the conversion's progress**, and a name is added only once its
 * generator, its holder and its restore path all agree. Exported so a renderer, a
 * restore shim and a test all ask the same question.
 */
const DRAWN_ANCHOR_GRAPHICS: readonly TacticalGraphicName[] = [
    /*
     * **141700 left on 2026-09-06**, the way 344000 pursuit did. This list routes the centre /
     * size / rotation machinery a graphic needs when its points are read back as a *frame*,
     * and that machinery is what made every edit drag a scale — so the arrow tip could not be
     * lengthened without resizing the arc with it. Its three points are its shape now.
     * @see squareOntoBisector
     */
    TacticalGraphicName.Contain,
    // **The four points are the base; they are just not the user's to place.** The
    // demonstration is dropped on one click and points 2, 3 and 4 are derived from point
    // 1 — but the standard describes the symbol by four anchor points, and that is what
    // the base carries and what a snapshot holds. Membership here is about the *shape of
    // the description*; whether a vertex can be dragged is a separate question, and the
    // answer for this one is no. @see DERIVED_ANCHOR_GRAPHICS
    //
    // **343300 left on 2026-09-06.** Its four points are placed now, not derived, so it is an
    // ordinary drawn line whose vertices are its shape — it needs none of the centre / size /
    // rotation machinery this list exists to route. @see Demonstration
    //
    // **344000 left on 2026-09-06**, the same way and for the same reason. Its holder
    // decomposed every drag into centre / size / rotation / mirrored / lineRatio and laid the
    // three points back out from them, so dragging one point moved the other two — which is
    // what made it feel unlike the seven cane arrows it draws the same picture as. Its points
    // are its shape now. @see Pursuit.generateHandles
    TacticalGraphicName.Envelopment,
    TacticalGraphicName.TacticalTurn,
    TacticalGraphicName.Turn,
];

/** @see DRAWN_ANCHOR_GRAPHICS */
export function usesDrawnAnchors(name: TacticalGraphicName): boolean {
    return DRAWN_ANCHOR_GRAPHICS.includes(name);
}

/**
 * Two-anchor symbols whose points 1 and 2 are **corners**, so neither end is the pivot.
 *
 * The default rule below — a line turns and scales about its first vertex — reads that
 * vertex as *"where the user started drawing, and where the symbol grows from"*. That is
 * right for a path: an axis of advance stretches along its bearing from p0, and moving p0
 * would slide it off the thing it was drawn against. It is wrong for a symbol the standard
 * describes as a *shape between two corners*, because such a symbol has no growing end —
 * anchoring on one makes a resize walk it sideways out of one corner, which is what a user
 * reported for the mine cluster on 2026-09-05: the ratio was right and the symbol moved.
 *
 * **Membership is a plate reading, not a shape.** These are exactly the rows whose Anchor
 * Points paragraph says *corners*, found by extracting that paragraph for all 309 coded
 * graphics — three of them, and no near-misses:
 *
 * | Code | Graphic | The plate's words |
 * |---|---|---|
 * | 218400 | navigational line | *"Points 1 and 2 define the corner points of the symbol."* |
 * | 290400 | mine cluster | *"Points 1 and 2 define the corners of the symbol."* |
 * | 291000 | fortified position | *"Points 1 and 2 define the corners on the front of the symbol."* |
 *
 * **The neighbours that read almost the same and are deliberately out.** Ferry crossing and
 * raft site *"define the tips"* — a tip is a feature, not a corner, though both ends carry
 * the same one. Bearing line and linear target *"define the endpoints"*. Trip wire is the
 * clearest exclusion of all: its points *"define the length and orientation"* and point 2
 * sits **at the mine**, so one end is a real place and pivoting there is meaningful. The
 * nineteen rectangular zones say points 1 and 2 *"will be located in the centre"* of their
 * two ends and are already out of the stretch path entirely, having two gestures of their
 * own. @see NO_EDIT_STRETCH
 *
 * `Contain` reaches the same midpoint by the other door, {@link DRAWN_ANCHOR_GRAPHICS},
 * which carries per-name frames this list deliberately does not need: two corners have a
 * midpoint and nothing else to work out.
 */
const CORNER_ANCHOR_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.NavigationalLine,
    TacticalGraphicName.MineCluster,
    TacticalGraphicName.FortifiedPosition,
];

/** @see CORNER_ANCHOR_GRAPHICS */
export function usesCornerAnchors(name: TacticalGraphicName | undefined): boolean {
    return name !== undefined && CORNER_ANCHOR_GRAPHICS.includes(name);
}


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
 * The movement and maneuver family. `generateHandles` returns
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
    TacticalGraphicName.AdvanceToContact,
    TacticalGraphicName.TurningMovement,
    TacticalGraphicName.Infiltration,
    // The demolition obstacles. APP-06 271201 builds them from a centerline and a
    // width, which is this contract exactly. @see ai/app-6.md "F2"
    TacticalGraphicName.ExplosivesPlannedStateOfReadiness,
    TacticalGraphicName.ExplosivesStateOfReadiness1Safe,
    TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable,
    /*
     * **Roadblock complete joined on 2026-09-05**, when it stopped being dropped on one
     * point and took the same centreline-and-side contract as the three readiness states
     * it shares 271201's rule with. It is drawn by `movement(3)` and held by
     * `MovementGraphicBase`, so the family it belongs to is this one — and saying so is
     * what stops a renderer stamping it a `width` its own third point already carries.
     * @see carriesSeparationInBase, RoadblockComplete
     */
    // Excluded — see ai/excluded-graphics.md
    // TacticalGraphicName.RoadblockCompleteExecuted,
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
    /*
     * Breach, bypass, canalize and clear left on 2026-09-06. Their APP-06 rules give them
     * three placed anchor points — two for the opening and one for the rear — so there is no
     * derived offset handle to put first, and their three grips are all `shape`.
     * @see frontEdgeFrame
     *
     * **Block, disrupt and support by fire left the same day, for the same reason.** 270501
     * and 340100 place the bar's two ends and the stem's far end; 270502 and 341000 place the
     * bar and the longest arrow's tip; 152100 places the bar's ends *and* both arrow tips.
     * In every case the perpendicular the offset handle used to drag is a point the operator
     * states, so the family's leading `offset` grip has nothing left to set.
     * @see Block, Disrupt, supportByFireFromAnchors
     */
    /*
     * **341800 penetrate left on 2026-09-06**, for the reason the four brackets did the same
     * day: its rule is 340500 clear's word for word — points 1 and 2 the vertical line's
     * endpoints, point 3 the rear — so the perpendicular the offset handle used to drag is a
     * pair of points the operator states. @see BRACKET_GRAPHICS, frontEdgeFrame
     */
    /*
     * **152000 attack by fire left on 2026-09-06**, the last of the family. Its plate places
     * the back line's two ends, so the bar that was a ratio of the shaft — and the offset
     * grip that dragged it — are two anchor points now. @see firePositionAnchors
     */
    TacticalGraphicName.Exploitation,
    // Follow and assume / follow and support are deliberately absent: they are no
    // longer block arrows and carry their own two-point handles. @see FollowTask
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
    /*
     * **152000 left on 2026-09-06.** A lock says the aspect ratio is not the operator's to
     * set, and its plate gives the two dimensions their own anchor points: *"Points 2 and 3
     * determine the length of the straight line on the back side"*, with point 1 the tip.
     * The 0.45 the symbol is drawn at survives as the *preview* proportion two clicks are
     * read through, which is a default rather than a constraint. @see firePositionAnchors
     */
    /*
     * **Breach, bypass, canalize and clear are no longer ratio-locked** (2026-09-06).
     *
     * A lock says the aspect ratio is not the user's to change. All four plates say the
     * opposite, in the same sentence: *"Points 1 and 2 determine the symbol's height and
     * point 3 determines its length."* Two dimensions, stated separately and placed
     * separately — which is exactly what a fixed height/length ratio forbids. They took
     * their height from 0.3 of the drawn length instead, so the third anchor point had
     * nothing to do and the opening could not be sized at all. @see frontEdgeFrame
     *
     * **Disrupt and support by fire went with them**, on the same sentence. 270502 and 341000
     * read *"Points 1 and 2 determine the height of the symbol and point 3 determines its
     * length"*, and 152100 places all four of its points outright — a symbol whose height and
     * length are both stated cannot also have them locked to each other. Disrupt took its
     * height from 0.3 of the drawn length and support by fire its bar from 0.4, so in both the
     * third and fourth anchor points had nothing to do. @see Disrupt, supportByFireFromAnchors
     */
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
    // The handle is the end of the front line, drawn at 3 × size.
    [TacticalGraphicName.Penetration]: 1 / 3,
    // Block's crossbar handle left on 2026-09-06: the crossbar is points 1 and 2 now, so
    // there is no derived width for an offset grip to drag. @see Block
    // The handle is an arrowhead wing, `size × sin 45°` off the base line.
    [TacticalGraphicName.Exploitation]: Math.SQRT2,
};

/**
 * One handle per band, so the roles list has no fixed length.
 *
 * `generateHandles` returns `[center, band0, band1, …]`, so **handle *i* is band
 * *i* − 1**. The center is index 0, which the renderer also finds by position and
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
 * the tail is the **width**: a tangent point sits one radius off the center line, so
 * dragging one sets how wide the corridor is.
 *
 * The split cannot be written as a fixed prefix, which is what every other contract
 * here uses — the vertex count is however many points the user drew. So the contract
 * says "offset after the vertices" and the caller supplies the count.
 *
 * `offsetScale` is 1 rather than the shared half: the perpendicular distance from the
 * center line to the handle *is* the radius, so it has to track the cursor 1:1 or the
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

/**
 * The four bracket mission tasks: three placed anchor points, every one of them a grip.
 *
 * 340200 breach, 340300 bypass, 340500 clear and 340400 canalize by inheritance each give
 * points 1 and 2 to a front edge and point 3 to the rear. They were in `BLOCK_GRAPHICS`
 * until 2026-09-06, whose contract puts a derived *offset* handle first — a width grip for a
 * symbol whose width is now two of its own anchor points. @see frontEdgeFrame
 */
const BRACKET_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.Breach,
    TacticalGraphicName.Bypass,
    TacticalGraphicName.Canalize,
    TacticalGraphicName.Clear,
    /*
     * **341800 penetrate is a fifth, and its rule is clear's word for word.** *"Points 1 and
     * 2 define the endpoints of the symbol's vertical line. Point 3 defines the rear of the
     * symbol."* Only the drawing past that differs — one arrow rather than three — which is
     * the generator's business and not this contract's. (User's call, 2026-09-06.)
     */
    TacticalGraphicName.Penetration,
];

/**
 * Block, disrupt and support by fire: the rest of the block family whose anchor points are
 * placed rather than derived, as of 2026-09-06.
 *
 * 270501 and 340100 give points 1 and 2 to the vertical line the enemy runs into and point 3
 * to the stem; 270502 and 341000 give the same two to the vertical line and point 3 to the
 * longest arrow's tip; 152100 places its bar's two ends *and* both arrowhead tips. In every
 * one the perpendicular that used to be a derived `size` is a pair of anchor points, so
 * there is no width to default and no offset grip to put first.
 *
 * Kept apart from `BRACKET_GRAPHICS` because the two groups are not the same shape — a
 * bracket's point 3 is its rear, these three have no rear — and the reasons they left the
 * block contract read differently even though the effect is the same.
 */
/**
 * The crossings drawn as two parallel rails, whose separation is an anchor point.
 *
 * 271100 bridge, 271300 assault crossing, 271500 ford easy, 271600 ford difficult, and FM's
 * gap, which shares the bridge's generator and its picture. @see parallelRailAnchors
 */
/**
 * Whether this graphic is one of the two-rail crossings. @see RAIL_CROSSING_GRAPHICS
 *
 * Exported because a synthesised base has to know: their points 1 and 2 belong to the bar the
 * operator drags and their point 3 to the far one, and which side that lands on is a fact of
 * the plate rather than of whoever is laying the sample out. @see railCrossingBase
 */
export function drawsAsRailCrossing(name: TacticalGraphicName): boolean {
    return RAIL_CROSSING_GRAPHICS.includes(name);
}

const RAIL_CROSSING_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.Bridge,
    TacticalGraphicName.Gap,
    TacticalGraphicName.AssaultCrossing,
    TacticalGraphicName.FordEasy,
    TacticalGraphicName.FordDifficult,
];

const PLACED_BLOCK_GRAPHICS: readonly TacticalGraphicName[] = [
    // 152000 joined on 2026-09-06: point 1 the arrowhead's tip, points 2 and 3 the back
    // line's ends. Two clicks rather than three, because its own constraints construct the
    // third — but every stored point is placed once they are. @see firePositionAnchors
    TacticalGraphicName.AttackByFire,
    TacticalGraphicName.Block,
    TacticalGraphicName.TacticalBlock,
    TacticalGraphicName.Disrupt,
    TacticalGraphicName.TacticalDisrupt,
    TacticalGraphicName.SupportByFire,
];

/** What each handle of `name` does. */
export function handleContract(name: TacticalGraphicName): HandleContract {
    if (CORRIDOR_GRAPHICS.includes(name)) {
        return {roles: [], repeating: 'shape', offsetAfterVertices: true, offsetScale: 1};
    }
    if (BRACKET_GRAPHICS.includes(name)) {
        return {roles: ['shape', 'shape', 'shape'], repeating: 'shape'};
    }
    /*
     * **The two four-point hairpins: every grip is a placed anchor point.**
     *
     * 343300 and 341900 both name four, and both had none of them draggable — the
     * demonstration was dropped whole and published `[edge, centre]`, and 341900 published a
     * U-height offset grip plus its two base ends. Nothing either symbol is described by was
     * grabbable. Each point moves on its own now, so there is no offset and no number beside
     * the base to write. @see Demonstration, ReliefInPlace
     */
    if (name === TacticalGraphicName.Demonstration || name === TacticalGraphicName.ReliefInPlace) {
        return {roles: ['shape', 'shape', 'shape', 'shape'], repeating: 'shape'};
    }
    /*
     * **Three shape handles where the third point is a vertex, not an offset.**
     *
     * The movement family's third handle is a *derived* width grip, so it is an `offset`:
     * dragging it writes a number beside the base. The demolition block's third point is a
     * placed vertex as of 2026-09-05 and there is no number to write — dragging it moves
     * the point, and the generator measures the separation from where it lands.
     *
     * MapLibre is what this reaches. It routes a handle drag by its role, so calling the
     * side grip an `offset` sent the drag to a width that no longer exists and the handle
     * did nothing at all — while OpenLayers, which drags vertices through its own
     * `dragsVertices` path, worked. Reported as "sideline/width dragging works on
     * openlayers but not maplibre" (user, 2026-09-05), and it is the same shape of defect
     * `handleRole`'s own note describes for the corridors. @see carriesSeparationInBase
     */
    /*
     * **The seven cane arrows answer here too.** All three of their grips are placed anchor
     * points, so all three are `shape`. They published `[mirror, shape]` until 2026-09-06:
     * one grip that only turned the symbol over and one for the arrowhead, with the arc's
     * own diameter reachable from neither, though APP-06 gives all seven a third anchor
     * point that states it. @see RetrogradeTask
     *
     * **152800 answers here too, and its history is worth keeping.** It published
     * `[end, mirror]` until 2026-09-06 — one grip that resized and one whose only job was to
     * flip the symbol across its own axis, because the side of the arc was a hidden
     * `mirrored` amplifier with no point to state it. The plate states it: point 3 gives the
     * arc its diameter *and* which side it falls on, so dragging that point across the line
     * *is* the flip, and a grip that exists only to flip is not a thing the symbol needs. Its
     * own branch returned this same triple and has been folded in. @see MobileDefense.frame
     */
    if (carriesSeparationInBase(name)) {
        return {roles: ['shape', 'shape', 'shape'], repeating: 'shape'};
    }
    if (MOVEMENT_GRAPHICS.includes(name)) {
        return {roles: ['shape', 'shape', 'offset'], repeating: 'shape', offsetScale: OFFSET_SCALE[name]};
    }
    if (BLOCK_GRAPHICS.includes(name)) {
        return {roles: ['offset'], repeating: 'shape', offsetScale: OFFSET_SCALE[name]};
    }
    // **These three first.** They mirror, so they are in `MIRROR_HANDLE_GRAPHICS` — but
    // each puts the handle at its own index, and the generic branch below would
    // otherwise claim them and put it at 0.
    //
    // The chevron's apex, which the generator emits third precisely so the flip has
    // something to grab. @see Abatis.generateHandles
    if (name === TacticalGraphicName.Abatis) {
        return {roles: ['shape', 'shape', 'mirror'], repeating: 'shape'};
    }
    if (MIRROR_HANDLE_GRAPHICS.includes(name)) {
        return MIRROR_HANDLE_AT_0;
    }
    /**
     * **Turn's three grips are APP-06 270504's three anchor points**: `[tip, rear, bend]`.
     *
     * Separate from Envelopment's contract below, which publishes `[bend, reach, extend]` —
     * the same three jobs in a different order, because the two generators emit their grips
     * in a different order. That is why they cannot share a line.
     *
     * Point 2 had no role at all until 2026-09-05 because it had no handle: the generator
     * emitted `[control, tip, centre]` and the rear of the symbol was simply not grabbable.
     * `extend` is what it wants rather than `reach` — grabbing the back of an arrow and
     * pulling should lengthen it from the front, not scale it about its middle.
     * (User's report.) @see Turn.generateHandles
     */
    if (name === TacticalGraphicName.Turn || name === TacticalGraphicName.TacticalTurn) {
        return {roles: ['reach', 'extend', 'bend']};
    }
    /**
     * **343500's three grips: the arc, the run's end, and the run's beginning.**
     *
     * `[bend, reach, extend]`, in the order `Envelopment.generateHandles` emits them.
     * Handle 0 bends the semicircle and handle 1 sets the approach's length and aim — that
     * pairing is `EnvelopmentGraphicBase.setBandRange`'s implementation and predates this.
     * Trimming Envelopment out of this contract once made MapLibre resize freely from a
     * handle OpenLayers bends with, so the same drag grew the symbol 4.6x on one engine and
     * 1.5x on the other. @see envelopmentBendFrom
     *
     * Handle 2 is new: point 1, *"the beginning of the straight line"*, which had no grip
     * while a dot that does nothing sat on the frame's centre. `extend` rather than `reach`
     * for the same reason Turn's rear takes it — pulling the back of an arrow should lengthen
     * it from the front rather than scale it about its middle. (User's call, 2026-09-05.)
     */
    if (name === TacticalGraphicName.Envelopment) {
        return {roles: ['bend', 'reach', 'extend'], extendAnchor: 1};
    }
    /*
     * **A rectangle's two anchor points, then its width.**
     *
     * APP-06 gives these two points and a width in metres, so the first two handles are
     * the base's own vertices — dragging one sets the length and the orientation — and the
     * third is the width, which is the `offset` role every widthed graphic here uses.
     *
     * `offsetScale` is 1 rather than the shared half: the handle sits exactly one
     * half-width off the axis, so it has to track the cursor 1:1 or it runs away from it.
     * Same reasoning as the corridors, whose handles sit on the rail itself.
     * @see RectangularArea.generateHandles
     */
    if (RECTANGULAR_GRAPHICS.includes(name)) {
        return {roles: ['shape', 'shape', 'offset'], offsetScale: 1};
    }
    /**
     * **The rectangular target: a length grip, then a width grip.**
     *
     * It is not in `RECTANGULAR_GRAPHICS` above — its base is one anchor point, not an
     * axis — so it needs its own line here. Grip 0 sets the length and the attitude
     * together, grip 1 sets the width across them, which is the `offset` role every
     * widthed graphic uses.
     *
     * `offsetScale` is 1 for the same reason the two-point rectangles use 1: the grip sits
     * exactly one half-width off the axis, so it has to track the cursor 1:1 or it runs
     * away from it. @see RectangularTarget.generateHandles
     */
    if (name === TacticalGraphicName.TargetAreaRectangular) {
        return {roles: ['shape', 'offset'], offsetScale: 1};
    }
    if (RANGE_FANS.includes(name)) {
        return {roles: [], repeating: 'band'};
    }
    /**
     * **200700: the radar, its two ranges, and the opening.**
     *
     * Not in `RANGE_FANS` — those publish a rim per band and nothing else, and this publishes
     * a fixed four with a different last one. Index 0 is the radar, which is inert; 1 and 2
     * are the start and stop ranges, which is the `band` role at the same
     * `RANGE_FAN_BAND_OFFSET` the fans use; 3 is the *stop relative bearing*.
     *
     * Stated here because it is what MapLibre routes drags by. Left out, all four grips
     * resolved to the default `shape`, which that switch drops on the floor — so 200700 could
     * be drawn on MapLibre and then not edited at all, while OpenLayers, which dispatches its
     * rims through the holder instead, worked. (User's report, 2026-09-05.)
     * @see RadarSearchDoctrine.generateHandles, setSectorOpening
     */
    if (name === TacticalGraphicName.RadarSearchDoctrine) {
        return {roles: ['band', 'band', 'band', 'opening']};
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
 * either ignores a size the user set or honors a number that was never meant as
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
/**
 * Graphics that pivot on their **last** vertex without being tip-first.
 *
 * `drawsTipFirst` answers two questions at once — which order the points are stored in, and
 * which end the symbol turns about — and for the two blocks those parted company on
 * 2026-09-06. 270501 and 340100 number the bar first, so the stored order is the plate's and
 * the generator reads it straight; but the end a T should swing about is still the free end
 * of its stem, which is where it swung before and is now simply the last of three points
 * rather than the last of two. Listing them keeps the gesture exactly as it was while the
 * reversal that used to imply it is gone. @see Block, drawOrder.ts
 */
const PIVOTS_ON_LAST_VERTEX: readonly TacticalGraphicName[] = [
    TacticalGraphicName.Block,
    TacticalGraphicName.TacticalBlock,
];

export function rotationAnchor(
    geometry: {type: string; coordinates: unknown},
    /**
     * The graphic, when the caller knows it. Only the drawn-anchor six need it, and only
     * because their base is a `LineString` that is **not** a drawn line: its vertices are
     * APP-06 anchor points, so the first one is a tip or a foot rather than "where the
     * user started". @see usesDrawnAnchors
     */
    name?: TacticalGraphicName,
): [number, number] {
    const positions = flattenPositions(geometry.coordinates);
    if (!positions.length) return [0, 0];

    if (geometry.type === 'Point') return positions[0];
    /*
     * **A symbol described by anchor points turns about its own centre.**
     *
     * The rule below — first vertex — is right for a drawn line and wrong for these:
     * Turn's first anchor is the tip of its arrow, so a resize measured from there had
     * almost no distance to start from and multiplied what little it had. Measured, the
     * same 1.5x drag: OpenLayers 240 -> 357 px, MapLibre 240 -> 567. OpenLayers has always
     * pivoted them about the centre — `MissionTaskController.getCenter` says so in as many
     * words — and this is that rule, in the half both engines read.
     */
    /*
     * **Ambush turns about point 2**, not about its centre. (User's call, 2026-09-05.)
     *
     * 141700's point 2 is one end of the curved back, and the back "encompasses the ambush
     * position" while "the arrowhead typically points at the target" — so what an operator
     * turns is the aim, about the position, and the position is where the arc sits rather
     * than where the frame's centre falls. Turning about the centre swung the ambush
     * itself off the ground it was placed on.
     */
    if (name === TacticalGraphicName.Ambush && positions.length >= 2) return positions[1];

    /*
     * **Cover, guard and screen turn and scale about their middle.**
     *
     * Their base is one drawn arm — point 1 the arrowhead, point 2 its inner end — and the
     * second arm is mirrored about the gap, so the *symbol* runs on past point 2 while the
     * rule below would pivot on point 1. That put the axis of rotation out at one arrowhead,
     * at the far end of a symbol 410 px across, and made a resize scale from there too: the
     * whole graphic swung and grew about a corner of itself instead of about the unit symbol
     * in its middle. (User's call, 2026-09-06 - "the axis of rotation and resize [...] need
     * to go off the center of the graphic where the symbol may or may not be".)
     *
     * The middle is `HALF_GAP_RATIO` of an arm beyond point 2, which is the generator's own
     * arithmetic and is called rather than repeated. @see securityOperationBaseCentre
     */
    if (name !== undefined && SECURITY_OPERATION_GRAPHICS.includes(name)) {
        const centre = securityOperationBaseCentre(positions);
        if (centre) return [centre[0], centre[1]];
    }

    if (name !== undefined && usesDrawnAnchors(name)) {
        const centre = drawnAnchorFrame(name, positions)?.center;
        if (centre) return [centre[0], centre[1]];
    }
    /*
     * **A corner-anchored symbol turns about the midpoint of its two corners.**
     *
     * Taken in the **Mercator frame**, not in degrees, for the reason the polygon case
     * below spells out: the pivot has to be the point OpenLayers computes from the same
     * base in projected metres, and the midpoint of 0 deg and 60 deg is 33 deg on screen
     * against 30 deg in degrees. @see CORNER_ANCHOR_GRAPHICS
     */
    if (usesCornerAnchors(name) && (geometry.type === 'LineString' || geometry.type === 'MultiLineString')) {
        const [aLon, aLat] = positions[0];
        const [bLon, bLat] = positions[positions.length - 1];
        return [(aLon + bLon) / 2, latitudeOf((mercatorY(aLat) + mercatorY(bLat)) / 2)];
    }
    /*
     * **A tip-first graphic turns about its rear, which is its *last* vertex.**
     *
     * The rule below reads "first vertex" as a shorthand for "where the user started and
     * where the symbol grows from", and for thirty-two graphics those parted company when
     * their points were renumbered into APP-06's order: point 1 is the arrowhead now, so
     * pivoting on it would resize an axis of advance backwards out of its own tip and
     * rotate every one of them about the end that is supposed to swing. The rear is the
     * same coordinate these pivoted on before the renumbering, so the gesture is
     * unchanged — only the index it lives at moved. @see drawOrder.ts
     */
    if (
        (drawsTipFirst(name) || PIVOTS_ON_LAST_VERTEX.includes(name as TacticalGraphicName)) &&
        (geometry.type === 'LineString' || geometry.type === 'MultiLineString')
    ) {
        return positions[positions.length - 1];
    }
    if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') return positions[0];

    // Measured in **projected** meters, not degrees. OpenLayers' `getInteriorPoint`
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

/**
 * The point a **rotate gesture** turns the symbol about.
 *
 * Almost always {@link rotationAnchor}, and this delegates to it. The two are separated
 * because that function answers a broader question than its name suggests: every renderer
 * uses it as the symbol's *frame origin* — the point a resize scales from, and the point
 * `setBend` and `setReach` measure their cursor offsets against. So it cannot also be the
 * place to say "but this one turns about something else": moving Turn's answer to its bend
 * point would have measured its bend, its reach and its resize from there too, which is
 * three broken gestures to fix one.
 *
 * Turn is the case that forced the split. 270504's point 3 is the bow, and an operator
 * swinging a turn is aiming it about the curve rather than about the chord's midpoint.
 * (User's call, 2026-09-05.)
 *
 * **Ambush is deliberately not here.** Its "turn about point 2" rule lives in
 * `rotationAnchor` itself, where it also moves that symbol's frame origin — which is what
 * it wants, and it has been signed off drawn that way. Left alone rather than tidied into
 * this function on the way past.
 */
export function rotationPivot(
    geometry: {type: string; coordinates: unknown},
    name?: TacticalGraphicName,
): [number, number] {
    if (name === TacticalGraphicName.Turn || name === TacticalGraphicName.TacticalTurn) {
        const positions = flattenPositions(geometry.coordinates);
        if (positions.length >= 3) return positions[2];
    }
    /*
     * **343500 turns about point 1**, the beginning of the straight line — the end the
     * operator placed first and the one the symbol is anchored to on the ground. Turning it
     * about the run's midpoint swung the start of the approach off the position it was drawn
     * from. Point 1 is anchor 0. (User's call, 2026-09-05.) @see anchorsForRunAndArc
     */
    if (name === TacticalGraphicName.Envelopment) {
        const positions = flattenPositions(geometry.coordinates);
        if (positions.length >= 1) return positions[0];
    }
    /*
     * **343300 and 341900 turn about point 1**, the arrowhead tip — the end the operator
     * places first and the one the symbol is read from. Turning about the frame's centre
     * swung the tip off the ground it was drawn on. (User's call, 2026-09-06.)
     */
    if (name === TacticalGraphicName.Demonstration || name === TacticalGraphicName.ReliefInPlace) {
        const positions = flattenPositions(geometry.coordinates);
        if (positions.length >= 1) return positions[0];
    }
    return rotationAnchor(geometry, name);
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

const RECTANGULAR_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.FreeFireAreaRectangular,
    TacticalGraphicName.NoFireAreaRectangular,
    TacticalGraphicName.RestrictiveFireAreaRectangular,
    TacticalGraphicName.PositionAreaArtilleryRectangular,
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneRectangular,
    TacticalGraphicName.CallForFireZoneRectangular,
    TacticalGraphicName.TargetBuildUpAreaRectangular,
    TacticalGraphicName.TargetValueAreaRectangular,
    TacticalGraphicName.ZoneOfResponsibilityRectangular,
    TacticalGraphicName.CensorZoneRectangular,
    TacticalGraphicName.CriticalFriendlyZoneRectangular,
    TacticalGraphicName.DeadSpaceAreaRectangular,
    TacticalGraphicName.BlueKillBoxRectangular,
    TacticalGraphicName.PurpleKillBoxRectangular,
    TacticalGraphicName.FireSupportAreaRectangular,
    TacticalGraphicName.AirSpaceCoordinationAreaRectangular,
    TacticalGraphicName.PsyOpsZoneRectangular,
    /*
     * APP-06 240804. It belongs here and **not** with `TargetAreaRectangular`, despite the
     * shared words in the name: its plate says "this symbol requires two anchor points and
     * a width (defined in metres) to define the boundary of the area. Points 1 and 2 will
     * be located on the opposite sides of the area" -- which is this family's construction
     * exactly. 240802 builds its box from typed amplifiers off a single anchor point and is
     * a different symbol. @see TargetAreaSingleTargetAegis
     */
    TacticalGraphicName.TargetAreaSingleTargetAegis,
    /*
     * APP-06 200202 and 200402. Same rule again, word for word: "requires two anchor points
     * and a width, defined in metres, to define the boundary of the area. Points 1 and 2
     * will be located in the centre of two opposing sides of the rectangle."
     *
     * They are the second and third exception to `drawnBase.test.ts`'s naming rule -- built
     * like the family and not called `...Rectangular`, because APP-06 spells these two
     * `Rectangle`. Named there rather than renamed here: a display name follows the plate.
     */
    TacticalGraphicName.DefendedAreaRectangle,
    TacticalGraphicName.ShipAreaOfInterestRectangle,
];

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

    /*
     * **The four placed point by point, from 2026-09-05.** These are the anchor counts the
     * plates state, and they are what the *base stores* — not what the operator clicks.
     * Ambush spends two clicks and envelopment three, because in each the last point the
     * standard names carries no decision and is constructed. MapLibre's draw asks whether
     * `normalizeDrawnBase(name, sketch).length` has reached the number here, so the two
     * disagreeing is exactly how a derived point is expressed. @see anchorsFromClicks
     */
    [TacticalGraphicName.Ambush]: 3,
    [TacticalGraphicName.Turn]: 3,
    [TacticalGraphicName.TacticalTurn]: 3,
    [TacticalGraphicName.Envelopment]: 4,
    [TacticalGraphicName.Pursuit]: 3,

    // Two points: a start and an end, and the symbol is built between them.
    //
    /*
     * **Abatis left again on 2026-09-05**, and the standard is why: 280100 reads *"at
     * least two anchor points, points 1 and 2, to define the line. Additional points can
     * be defined to extend the line."* It was capped at two on 2026-08-21 on the reading
     * that extra vertices "added another segment to the tail and the obstacle stopped
     * being one chevron on one line" — but that *is* the symbol. The Example draws abatis
     * marks on roads that bend, and the generator was already built for it: `path` slices
     * the tail with `lineSliceAlong`, which keeps the intermediate vertices so the
     * obstacle follows the road instead of straightening to its endpoints. One chevron
     * near the start, then the route. @see Abatis.path
     */
    [TacticalGraphicName.FerryCrossing]: 2,
    /*
     * 140800: *"requires three anchor points. Points 1 and 2 define the endpoints of the
     * infiltration lane and point 3 defines one side of the lane."*
     *
     * **Three, because the third point is one of them.** This was 2 on the reading that
     * points 1 and 2 are "the whole of what is drawn" and the third is a width handle — but
     * the standard calls it an anchor point, and the demolition block, whose rule 271201
     * states in the same words, has stored it as a vertex since 2026-09-05. Holding it at 2
     * kept the separation in a `width` amplifier beside a base that already described it,
     * which is the second copy `carriesSeparationInBase` exists to prevent, and ended the
     * draw on the second click with the width never asked for. (User's call, 2026-09-05.)
     */
    [TacticalGraphicName.InfiltrationLane]: 3,
    /*
     * **152800's three anchor points**, as of 2026-09-06. It was a two-point ellipse whose
     * only asymmetry was a hidden `mirrored` flag; the plate gives it a tip, a line end and
     * a point stating the arc's diameter and side. @see MobileDefense
     */
    [TacticalGraphicName.MobileDefense]: 3,
    [TacticalGraphicName.PassageLane]: 2,
    // 290600: "Point 1 defines the entry point and Point 2 defines the exit point."
    [TacticalGraphicName.SafeLaneOrGap]: 2,
    [TacticalGraphicName.TacticalFix]: 2,
    [TacticalGraphicName.Fix]: 2,
    [TacticalGraphicName.LinearTarget]: 2,
    [TacticalGraphicName.FinalProtectiveFire]: 2,
    [TacticalGraphicName.LinearSmokeTarget]: 2,

    // The block family: the bar is drawn across the line the user gives it.
    /*
     * **Three, as 340100 and 270501 both state**: "Points 1 and 2 define the endpoints of the
     * symbol's vertical line. Point 3 defines the endpoint of the symbol's horizontal line."
     * Held at two until 2026-09-06, and the two it had were the *stem* — so the bar was a
     * screen constant laid across the far end and neither its length nor its position was the
     * operator's to state. @see Block, blockAnchors
     */
    [TacticalGraphicName.TacticalBlock]: 3,
    /*
     * 340200, 340300, 340500 and 340400-by-inheritance each state three: two for the front
     * opening and one for the rear. @see frontEdgeFrame
     */
    [TacticalGraphicName.Breach]: 3,
    [TacticalGraphicName.Bypass]: 3,
    [TacticalGraphicName.Canalize]: 3,
    [TacticalGraphicName.Clear]: 3,
    /*
     * **Three, as 341000 and 270502 both state**: points 1 and 2 the vertical line's ends,
     * point 3 the tip of the longest arrow. Held at two along the arrows, which left the bar
     * derived from `size`. @see Disrupt, disruptAnchors
     */
    [TacticalGraphicName.TacticalDisrupt]: 3,
    [TacticalGraphicName.Penetration]: 2,
    [TacticalGraphicName.Exploitation]: 2,
    [TacticalGraphicName.Block]: 3,
    [TacticalGraphicName.Disrupt]: 3,
    [TacticalGraphicName.AttackByFire]: 2,
    /*
     * **Four, which is what 152100 asks for**: "Points 1 and 2 define the endpoints of the
     * straight line on the back side of the symbol. Points 3 and 4 define the tips of the
     * arrowheads." It was two — a shaft — off which the bar, both arrows and their spread were
     * all computed by ratio, so the "left and right limits of coverage" the arrowheads are
     * supposed to indicate were limits nobody stated. @see supportByFireFromAnchors
     */
    [TacticalGraphicName.SupportByFire]: 4,

    /*
     * **The seven cane arrows: three, not two.** APP-06 gives each of them "three anchor
     * points... Point 1 defines the tip of the arrowhead. Point 2 defines the end of the
     * straight line portion of the symbol. Point 3 defines the diameter and orientation of
     * the 180 degree circular arc." Held at 2, the third had nowhere to live and the arc came
     * from a `size` amplifier with a `mirrored` flag for its side - a hidden boolean where the
     * standard names a place. (User's call, 2026-09-06.) @see RetrogradeTask
     */
    [TacticalGraphicName.Delay]: 3,
    [TacticalGraphicName.Withdraw]: 3,
    [TacticalGraphicName.WithdrawUnderPressure]: 3,
    [TacticalGraphicName.Disengage]: 3,
    [TacticalGraphicName.Retirement]: 3,
    [TacticalGraphicName.ForwardPassageOfLines]: 3,
    [TacticalGraphicName.RearwardPassageOfLines]: 3,
    /*
     * **341900 takes four**, one per anchor point its rule names: the two arrowhead tips and
     * the two arrow ends. It was 2 plus a `size` amplifier that set the U's height, which
     * forced the two arrows parallel and equal-length and left points 3 and 4 with nowhere
     * to live. (User's call, 2026-09-06.) @see ReliefInPlace
     */
    [TacticalGraphicName.ReliefInPlace]: 4,
    /*
     * **343300 takes four too**, for the same reason and by the same rule's wording: point 1
     * the arrowhead tip, point 2 the end of the first arrow's straight portion, points 3 and
     * 4 the second straight line. It was a one-click drop whose four points were laid out
     * from one centre, so the operator stated position and nothing else. @see Demonstration
     */
    [TacticalGraphicName.Demonstration]: 4,

    // Two anchor points, the symbol built between them. These were capped in the
    // OpenLayers registry and nowhere else until 2026-08-15, which is the exact failure
    // this table's header describes: MapLibre had no limit, so its draw waited for a
    // double-click a fixed-vertex graphic never sends.
    [TacticalGraphicName.AssaultCrossing]: 2,
    [TacticalGraphicName.Bridge]: 2,
    [TacticalGraphicName.Gap]: 2,
    [TacticalGraphicName.FordEasy]: 2,
    [TacticalGraphicName.FordDifficult]: 2,
    /*
     * **The demolition block places all three of its points, from 2026-09-05.** 271201
     * states them and 271204 inherits the rule: *"Points 1 and 2 define the endpoints of
     * the symbol and point 3 defines the location of one side of the symbol"*, with
     * *"points 1 and 2 determine the centreline of the symbol and point 3 determines its
     * width."*
     *
     * Point 3 was a derived offset handle, and the separation it set was carried as a
     * `width` amplifier beside the base. It is a stored vertex now, so the separation comes
     * out of the coordinates and there is nothing to keep in step with them. (User's call.)
     */
    [TacticalGraphicName.ExplosivesPlannedStateOfReadiness]: 3,
    [TacticalGraphicName.ExplosivesStateOfReadiness1Safe]: 3,
    [TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable]: 3,
    // Excluded — see ai/excluded-graphics.md
    // [TacticalGraphicName.RoadblockCompleteExecuted]: 3,
    [TacticalGraphicName.MineCluster]: 2,
    [TacticalGraphicName.TripWire]: 2,
    [TacticalGraphicName.RaftSite]: 2,
    [TacticalGraphicName.FortifiedPosition]: 2,

    /*
     * APP-06 §8.11, the maritime control lines. Every one of their draw rules says the same
     * thing -- "requires two anchor points. Points 1 and 2 define the endpoints" -- and
     * 220100 adds that the symbol "varies only in length".
     *
     * The count has to be stated *here* and not only in the OpenLayers factory, which is
     * what `drawLimitParity` caught: registering them as `line(2)` capped the draw on one
     * engine and left the library saying "no limit", so MapLibre would have gone on
     * accepting vertices for a symbol defined by exactly two. It also feeds
     * `editStretches`, which reads a fixed vertex count as its condition.
     */
    [TacticalGraphicName.BearingLine]: 2,
    [TacticalGraphicName.BearingLineElectronic]: 2,
    [TacticalGraphicName.BearingLineElectromagneticWarfare]: 2,
    [TacticalGraphicName.BearingLineAcoustic]: 2,
    [TacticalGraphicName.BearingLineAcousticAmbiguous]: 2,
    [TacticalGraphicName.BearingLineTorpedo]: 2,
    [TacticalGraphicName.BearingLineElectroOpticalIntercept]: 2,
    [TacticalGraphicName.BearingLineJammer]: 2,
    [TacticalGraphicName.BearingLineRadioDirectionFinder]: 2,
    [TacticalGraphicName.NavigationalRhumbLine]: 2,
    // 218400: "requires two anchor points. Points 1 and 2 define the corner points".
    [TacticalGraphicName.NavigationalLine]: 2,

    /*
     * The convoys. Both plates read "this symbol requires two anchor points. Point 1
     * defines the tip of the arrowhead and point 2 defines the rear", and both add that the
     * symbol "varies only in length" -- so two points, exactly, on either engine.
     */
    [TacticalGraphicName.MovingConvoy]: 2,
    [TacticalGraphicName.HaltedConvoy]: 2,

    // Three: two arrow tips and a rear, or a centre and two ends.
    // APP-06 152200: "requires three anchor points. Point 1 defines the vertex of the
    // graphic. Points 2 and 3 define the tips of the arrowheads." @see SearchArea
    [TacticalGraphicName.SearchArea]: 3,
    [TacticalGraphicName.ObstacleBypassEasy]: 3,
    [TacticalGraphicName.ObstacleBypassDifficult]: 3,
    [TacticalGraphicName.ObstacleBypassImpossible]: 3,
    [TacticalGraphicName.Escort]: 3,
    [TacticalGraphicName.MinimumSafeDistanceZone]: 3,
    // The S pair: the straight's end, the arcs' centre, the arrowhead's tip.
    // @see GeometryService.createSCurve
    [TacticalGraphicName.Exfiltrate]: 3,
    [TacticalGraphicName.Infiltration]: 3,

    // The seventeen rectangular zones: point 1 and point 2, at the centres of the two
    // opposing sides. The width is an amplifier, not a third click.
    // @see RectangularArea, rectangleFromAxis
    ...Object.fromEntries(RECTANGULAR_GRAPHICS.map(name => [name, 2])),

    // **The rectangular target is not here, and that is the point.** APP-06 240802 requires
    // one anchor point, and a one-point base is a `Point` draw — there is no second click to
    // cap, which is why every other point-anchored graphic is absent too. This table caps
    // *line* draws; `geomHandleType` is what says a graphic is point-anchored.
    // @see RectangularTarget

    // Four, each meaning something different. @see SweptArcTask, EscortAndDemonstration
    [TacticalGraphicName.Capture]: 4,
    [TacticalGraphicName.Seize]: 4,
    /*
     * **Cover, guard and screen: the four anchor points 342201 numbers, all placed.**
     *
     * Two until 2026-09-06 — point 1 at an arrowhead, point 2 at that arrow's inner end,
     * and the second arrow mirrored from them. That made the two arrows always equal and
     * always collinear, which the plate's Size/Shape cell explicitly does not ask for:
     * *"The length and orientation of the arrows can vary independently."*
     * @see securityOperationAnchors
     */
    // 341800's three, on 340500 clear's rule. @see BRACKET_GRAPHICS
    [TacticalGraphicName.Penetration]: 3,
    // 152000's three: the tip and the back line's two ends. Drawn in two clicks, like the
    // ambush whose constraints it shares. @see firePositionAnchors, DRAW_CLICKS
    [TacticalGraphicName.AttackByFire]: 3,
    /*
     * **The two-rail crossings, in the counts their own plates use.**
     *
     * 271100 bridge and 271300 assault crossing say four outright — *"points 1 and 2 define
     * one side of the gap and points 3 and 4 define the opposite side"* — while 271500 ford
     * easy and 271600 ford difficult letter only three on their Templates, `PT 1` and `PT 2`
     * on one bar and `PT 3` on the other. All four are drawn with three clicks; only what
     * they store differs. FM's gap shares the bridge's generator and its picture, so it
     * follows it. @see parallelRailAnchors
     */
    [TacticalGraphicName.Bridge]: 4,
    [TacticalGraphicName.Gap]: 4,
    [TacticalGraphicName.AssaultCrossing]: 4,
    [TacticalGraphicName.FordEasy]: 3,
    [TacticalGraphicName.FordDifficult]: 3,
    [TacticalGraphicName.Cover]: 4,
    [TacticalGraphicName.Guard]: 4,
    [TacticalGraphicName.Screen]: 4,

    [TacticalGraphicName.FollowAndAssume]: 2,
    [TacticalGraphicName.FollowAndSupport]: 2,
    [TacticalGraphicName.Evacuate]: 4,
    [TacticalGraphicName.Recover]: 4,
    // **Not the demonstration**, though its base carries four points too. This table is a
    // rule about *clicks* — "the draw has to end on the third one" — and the demonstration
    // ends on the first, with points 2, 3 and 4 derived from it. What says so is
    // `dropSizePx`. @see anchorsForParallelLegs
};

/**
 * The base vertex that **moves the graphic instead of reshaping it**.
 *
 * Fields of fire is the only one today: its apex. Dragging the apex under a reshape
 * would bend the V about a point the user thinks of as its origin, so OpenLayers
 * makes that vertex inert in modify mode and leaves moving to translate — the same
 * contract the inert center dot has on a point-anchored graphic.
 *
 * It was the third argument to `vertexLine` in the OpenLayers registry, so MapLibre
 * did not know: measured on a fields of fire in modify mode, dragging the apex was
 * inert in OpenLayers and reshaped the graphic in MapLibre.
 *
 * **Index 0, since the apex is drawn first.** APP-06 140500 numbers this symbol from
 * its vertex -- "Point 1 defines the vertex of the symbol. Points 2 and 3 define the
 * tips of the arrowheads" -- and the base was renumbered to match, so the apex moved
 * from index 1 to index 0. Left at 1 it would have made a *leg end* inert and the apex
 * draggable, which is the bug this table exists to prevent, upside down. @see drawOrder.ts
 */
const ANCHOR_VERTEX: Partial<Record<TacticalGraphicName, number>> = {
    [TacticalGraphicName.FieldsOfFire]: 0,
    /*
     * The search area's vertex, for the same reason and at the same index: 152200 numbers
     * it point 1 and the arms' tips points 2 and 3, so the base stores `[end, apex, end]`
     * and is swapped into that numbering. Dragging the vertex under a reshape would bend
     * the whole symbol about the point the operator thinks of as its origin.
     */
    [TacticalGraphicName.SearchArea]: 0,
    /*
     * **343300 and 341900's fourth point is derived, so it gets a dot rather than a grip.**
     *
     * The operator places three; point 4 is wherever "parallel and the same length" puts it.
     * A draggable grip on it would offer a freedom the shape does not have, and taking it
     * would break the parallel the symbol is. @see hairpinAnchors
     */
    [TacticalGraphicName.Demonstration]: 3,
    [TacticalGraphicName.ReliefInPlace]: 3,
    /*
     * **Six graphics whose point 1 is the centre their figure is built about.**
     *
     * Their plates say so outright — 343000 capture, 342300 seize, 344500 evacuate and
     * 344600 recover all read *"Point 1 defines the centre of the circle. Point 2 defines
     * the radius of the circle"*; 343600 escort, *"Point 1 defines the centre of the
     * graphic"*; and 272100's, *"the centre point defines the centre of the symbol. Points
     * 1 and 2 define the radii"*. A reshape that dragged the origin would bend the symbol
     * about the point the operator thinks of as its middle, which is `FieldsOfFire`'s
     * reason exactly.
     *
     * **They were stated in the OpenLayers registry instead**, as a third argument to
     * `vertexLine`, and this table has never listed them — so MapLibre, which reads nothing
     * else, let all six drag their centre while OpenLayers refused. Same shape of defect as
     * the obstacle bypasses on 2026-09-06, opposite direction.
     *
     * 272101's multiple-strike zone declared one there too and is deliberately absent here:
     * its rule numbers no centre at all — *"add as many pairs of points as needed […] points
     * 1 through N/2 define"* one polygon — so its point 1 is a ring vertex like any other.
     * @see anchorVertex, ai/conventions.md "A symbology fact never lives in a holder"
     */
    [TacticalGraphicName.Capture]: 0,
    [TacticalGraphicName.Seize]: 0,
    [TacticalGraphicName.Evacuate]: 0,
    [TacticalGraphicName.Recover]: 0,
    [TacticalGraphicName.Escort]: 0,
    [TacticalGraphicName.MinimumSafeDistanceZone]: 0,
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

/**
 * Whether this graphic's base is a rectangle whose corners are not individually
 * editable. Translate, rotate and resize all still apply — it is the *shape* that is
 * fixed, not the placement.
 */
/**
 * The rectangular graphics that also file a **length** — the dimension *along* the
 * rectangle, as opposed to the width across it.
 *
 * Empty as of 3.2.0 — kept because the distinction is real and may return.
 *
 * This held the rectangular target, the one rectangle that files a length rather than
 * deriving it from two anchor points. It is now built from a single anchor point and its
 * amplifiers outright, so there is no drawn geometry to read a length *back* from: the
 * amplifier is the source, not the derivation. @see RectangularTarget
 */
const RECTANGLE_LENGTH_GRAPHICS: readonly TacticalGraphicName[] = [];

/** @see RECTANGLE_LENGTH_GRAPHICS */
export function carriesRectangleLength(name: TacticalGraphicName): boolean {
    return RECTANGLE_LENGTH_GRAPHICS.includes(name);
}

/**
 * The width — and, for the one graphic that files it, the length — a rectangular zone's
 * geometry implies, in **ground metres**.
 *
 * ## Why this is derived rather than remembered
 *
 * APP-06 defines these as "two anchor points **and a width, defined in metres**"; the
 * user drags a box, which produces the same rectangle, so the amplifier and the shape
 * have to drive each other. A drag writes the number; a typed number restretches the
 * shape.
 *
 * **Geodesic, not projected.** The amplifier is a figure a user reads and types, and
 * projected metres carry a 1/cos(lat) inflation that would show a 10 km zone as 16 km at
 * 51°.
 *
 * **In Layer 1 because both engines edit these.** The rule lived in
 * `AreaGraphicBase.publishRectangleWidth`, so OpenLayers rewrote the amplifier on every
 * drag and MapLibre never did: resizing a rectangular airspace zone there left `width`
 * at the value it was drawn with — 360 km against OpenLayers' 867 km for the same
 * gesture — and a snapshot handed back disagreed with its own geometry.
 * @see ai/conventions.md, "A symbology fact never lives in a holder"
 *
 * Takes a ring in **lon/lat**, which is what the portable description holds.
 */
export function rectangleAmplifiers(
    name: TacticalGraphicName,
    ring: readonly [number, number][] | undefined,
): {width?: number; length?: number} {
    if (!isRectangular(name) || !ring?.length) return {};

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    if (!isFinite(minX) || maxX <= minX) return {};

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const width = Math.round(groundMeters([midX, minY], [midX, maxY]));
    if (!carriesRectangleLength(name)) return {width};
    return {width, length: Math.round(groundMeters([minX, midY], [maxX, midY]))};
}

/**
 * Great-circle metres between two lon/lat positions.
 *
 * On the **mean** sphere, 6371008.8 m — what turf measures every other distance in this
 * library with, and what `ol/sphere.getDistance` uses on the other side of the boundary.
 * The equatorial radius was 0.11% larger, which is nothing on its own and everything when
 * two implementations of one amplifier are compared: it is the whole of the 391,193 m
 * against 390,756 m the two engines used to file for the same drawn box.
 */
export function groundMeters(a: [number, number], b: [number, number]): number {
    const R = 6371008.8;
    const toRad = (degrees: number) => (degrees * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

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
    // Abatis is deliberately absent: it became a drawn multi-vertex route, so an edit
    // drag has to move the vertex under the cursor rather than resize the whole
    // obstacle. @see ai/app-6.md "F1"
    TacticalGraphicName.AirSpaceCoordinationAreaCircular,
    TacticalGraphicName.Ambush,
    TacticalGraphicName.AreaDefense,
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular,
    TacticalGraphicName.BaseDefenseZone,
    TacticalGraphicName.BlueKillBoxCircular,
    TacticalGraphicName.CallForFireZoneCircular,
    TacticalGraphicName.TargetBuildUpAreaCircular,
    // Not a circle, but point-anchored and sized by the same rim drag, which is exactly
    // what this list is for. @see RectangularTarget
    TacticalGraphicName.TargetAreaRectangular,
    TacticalGraphicName.TargetValueAreaCircular,
    TacticalGraphicName.ZoneOfResponsibilityCircular,
    TacticalGraphicName.CensorZoneCircular,
    TacticalGraphicName.Contain,
    TacticalGraphicName.Control,
    TacticalGraphicName.CordonAndKnock,
    TacticalGraphicName.CordonAndSearch,
    TacticalGraphicName.Deny,
    TacticalGraphicName.Locate,
    // A free-form line whose controller is built with a vertex limit of its own, so no
    // count reaches it; it stretches like the rest of its family.
    TacticalGraphicName.MinimumSafeDistanceMultipleStrike,
    TacticalGraphicName.PsyOpsZoneCircular,
    TacticalGraphicName.CriticalFriendlyZoneCircular,
    TacticalGraphicName.DeadSpaceAreaCircular,
    TacticalGraphicName.Envelopment,
    TacticalGraphicName.FieldsOfFire,
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
    /*
     * The seven point-anchored maritime control areas -- APP-06 §8.10.
     *
     * Two circles sized by a rim drag, three ellipses and a rotated rectangle sized the
     * way `TargetAreaRectangular` is, and one sector fan. Every one is placed by a single
     * anchor point and sized by dragging away from it, which is what this list describes;
     * the OpenLayers factories (`circularArea`, `rectangularTarget`, `rangeFan`) all set
     * `editStretches` unconditionally, so leaving them out here would have MapLibre
     * translating where OpenLayers resizes. @see editStretchParity.test.ts, which caught it
     */
    TacticalGraphicName.NoAttackZone,
    TacticalGraphicName.ActiveManeuverArea,
    TacticalGraphicName.LaunchAreaEllipse,
    TacticalGraphicName.DefendedAreaEllipse,
    TacticalGraphicName.ShipAreaOfInterestEllipse,
    TacticalGraphicName.CuedAcquisitionDoctrine,
    /*
     * **The radar search doctrine came back on 2026-09-05**, by becoming point-anchored
     * again rather than by changing its mind: 200700 gives it one anchor point and states
     * its ranges as numbers, so there are no vertices to drag and an edit drag scales the
     * sector. It had left this list on 2026-09-04, when it was briefly three drawn points.
     * @see RadarSearchDoctrine
     */
    TacticalGraphicName.RadarSearchDoctrine,
];

/**
 * Fixed-vertex graphics that deliberately keep doing nothing on an edit-mode drag.
 *
 * The user's list, moved here from `LineGraphicController` so both engines read one
 * statement of it. `ReliefInPlace` left it on 2026-08-20: the list means "an edit drag
 * does nothing", which was reasonable beside a separate resize mode and is not beside
 * none.
 */
const NO_EDIT_STRETCH: readonly TacticalGraphicName[] = [
    /*
     * **A rectangular zone has two gestures of its own and wants neither of them
     * borrowed.** Its base carries a vertex count, which is what usually makes an
     * edit drag stretch — but dragging an anchor point sets its length and dragging the
     * third handle sets its width, and letting a stray drag scale the whole thing meant
     * both numbers moved at once. Measured on OpenLayers: a drag meant to lengthen the
     * zone put 400 km on the width as well. (User's call, 2026-08-27.)
     */
    ...RECTANGULAR_GRAPHICS,
    /*
     * **The demolition block, for the same reason, from 2026-09-05.** Its three points are
     * two jobs: dragging an end sets the symbol's length and dragging the side point sets
     * how far apart the rails sit. Letting a stray drag scale the whole graphic moved both
     * at once — reported as "the middle-outer drag changes the width but also resizes the
     * whole graphic". The resize affordance still scales it, which is the control that
     * means to. @see carriesSeparationInBase
     */
    TacticalGraphicName.ExplosivesPlannedStateOfReadiness,
    TacticalGraphicName.ExplosivesStateOfReadiness1Safe,
    TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable,
    // Excluded — see ai/excluded-graphics.md
    // TacticalGraphicName.RoadblockCompleteExecuted,
    // 140800 joined the same contract on 2026-09-05 and needs the same protection: its
    // ends set the lane's length and its side point sets the width, and a stray drag that
    // scaled the whole graphic would move both. @see carriesSeparationInBase
    TacticalGraphicName.InfiltrationLane,
    TacticalGraphicName.MobileDefense,
    TacticalGraphicName.Clear,
    TacticalGraphicName.TacticalDisrupt,
    TacticalGraphicName.TacticalFix,
    TacticalGraphicName.Disrupt,
    TacticalGraphicName.Fix,
    TacticalGraphicName.Breach,
    TacticalGraphicName.Bypass,
    TacticalGraphicName.Canalize,
    TacticalGraphicName.AttackByFire,
    TacticalGraphicName.SupportByFire,
];

/**
 * Whether an edit drag that grabs no vertex resizes rather than moves.
 *
 * **Derived, because the hand-written list had drifted 42 ways.** OpenLayers computes
 * this — `editStretches = !NO_EDIT_STRETCH.has(name)` wherever a controller is built with
 * a vertex limit, plus an explicit `true` from the mission-task factories — while this
 * answered from a list somebody had to remember to extend. Every fixed-vertex graphic
 * added since drifted: Bridge, Gap, the fords, the crossings, the block family, the
 * retrogrades, the linear targets and `Deny` all stretched in OpenLayers and refused in
 * MapLibre, where the same drag simply did nothing. `Deny` is the one a user happened to
 * notice; there were 41 others.
 *
 * A fixed vertex count *is* the condition — that is exactly the `maxPoints` the
 * OpenLayers factories pass — so it is read rather than restated. {@link EDIT_STRETCHES}
 * carries what a vertex count cannot: the point-anchored circles, whose base is a single
 * point and which stretch anyway.
 */
export function editStretches(name: TacticalGraphicName): boolean {
    if (NO_EDIT_STRETCH.includes(name)) return false;
    return EDIT_STRETCHES.includes(name) || baseVertexCount(name) !== undefined;
}

/**
 * Whether a new base vertex may be inserted where the cursor is.
 *
 * **Reported as "abatis should not accept vertices within the triangle opening"** (user,
 * 2026-09-06), and it did, on both engines: a drag anywhere on the drawn route inserted a
 * point, the head of the route is the chevron's own opening, and a point placed in there
 * destroys the tooth. `Abatis.path` builds the mark by walking the *first `size` metres of
 * the base* — apex over the midpoint, foot at the far end, the tail sliced off after it —
 * so a vertex inside that stretch bends the line the tooth is measured along and the
 * symbol comes out as a kink with a stray tick beside it.
 *
 * It is refused rather than corrected because there is nothing to correct to: 280100's
 * extra anchor points *"extend the line"*, and the line does not exist yet where the
 * chevron is. Everything past the tooth still takes as many vertices as the road needs.
 *
 * **In the map-agnostic half because both renderers gate on it.** OpenLayers asks through
 * `Modify`'s `insertVertexCondition`, MapLibre through `grabSegment`; each already had its
 * own answer to "may this graphic take a vertex at all" and neither could have had this one
 * without writing `name === Abatis` in a renderer.
 * @see ai/conventions.md, "A symbology fact never lives in a holder"
 *
 * **Screen pixels, in whatever planar space the caller measures.** The reserved stretch is
 * a screen constant — the tooth holds its size as the obstacle lengthens — so the two
 * engines pass their own projected pixels rather than a ground distance, and the same
 * gesture is refused at the same place at every zoom. `at` is where the new vertex would
 * land, which both renderers already compute to draw the hint that offers it.
 *
 * Graphics that reserve nothing answer `true` for every point, which is all but one.
 */
export function acceptsInsertedVertex(
    name: TacticalGraphicName,
    basePixels: readonly (readonly [number, number])[],
    at: readonly [number, number],
): boolean {
    const lead = reservedLeadPx(name);
    if (lead === undefined || basePixels.length < 2) return true;

    // How far along the run the candidate sits, and how long the run is — one walk, because
    // the cap below needs both. The nearest segment is found here rather than trusted from
    // the caller: OpenLayers has no segment index to hand, only a coordinate.
    let travelled = 0;
    let along = -1;
    let nearest = Infinity;
    for (let i = 1; i < basePixels.length; i++) {
        const [ax, ay] = basePixels[i - 1];
        const [bx, by] = basePixels[i];
        const dx = bx - ax;
        const dy = by - ay;
        const span = Math.hypot(dx, dy);
        if (span > 0) {
            const t = Math.min(1, Math.max(0, ((at[0] - ax) * dx + (at[1] - ay) * dy) / (span * span)));
            const distance = Math.hypot(at[0] - (ax + t * dx), at[1] - (ay + t * dy));
            if (distance < nearest) {
                nearest = distance;
                along = travelled + t * span;
            }
        }
        travelled += span;
    }
    if (along < 0) return true;

    // **Capped at half the run, exactly as the generator caps it.** `Abatis.path` never lets
    // the tooth eat more than half the obstacle, so on a route drawn barely longer than the
    // chevron the reserved stretch shrinks with it rather than swallowing the whole line.
    return along > Math.min(lead, travelled / 2);
}

/** The base vertex that is inert under a reshape, or `undefined`. @see ANCHOR_VERTEX */
export function anchorVertex(name: TacticalGraphicName): number | undefined {
    return ANCHOR_VERTEX[name];
}

/**
 * Whether this graphic's **separation lives in its base** rather than beside it as a width.
 *
 * The movement family carries a `width` amplifier because its base is a centreline and
 * nothing in it says how far the rails sit apart. The demolition block stopped being like
 * that on 2026-09-05: 271201 gives point 3 that job — *"point 3 defines the location of one
 * side of the symbol"* — and it is a stored vertex, so the distance is measured from the
 * coordinates. A renderer that stamps a width beside them is keeping a second copy of a
 * number the base already carries, and the two drift. (User's call.)
 *
 * Derived from the vertex count rather than listed: a graphic of this shape with three base
 * points has nowhere else for the third to be. @see halfWidthFromSide
 *
 * **The seven cane arrows joined on 2026-09-06.** Their point 3 states the diameter of the
 * 180 degree arc and which side of the line it falls on - a distance measured across the
 * drawn line, which is what this predicate is about, even though the thing it separates is
 * an arc rather than a pair of rails. Without them MapLibre went on defaulting a `width`
 * their generator ignores, while OpenLayers wrote none: the two engines saved the same
 * symbol differently. @see RetrogradeTask
 *
 * **152800 is named rather than derived**, because it is the one member that is not a
 * movement graphic — `isMovementGraphic` is false for it, so the derivation alone missed it
 * and it went on stamping a `width` its generator ignores. Its point 3 states exactly what
 * the block's does: the distance across the drawn line, and which side. (User's call,
 * 2026-09-06.) @see MobileDefense.frame
 */
export function carriesSeparationInBase(name: TacticalGraphicName): boolean {
    if ((baseVertexCount(name) ?? 2) < 3) return false;
    return (
        isMovementGraphic(name) ||
        name === TacticalGraphicName.MobileDefense ||
        CANE_ARROW_GRAPHICS.includes(name) ||
        /*
         * **344000 is named rather than derived, for 152800's reason.** It draws the same
         * picture as the seven cane arrows and its point 3 states the same fact — the
         * distance across the drawn line and which side — but it is not in
         * `CANE_ARROW_GRAPHICS`, because that list is one shared APP-06 rule and pursuit's
         * numbers the points the other way round: *"Point 1 defines the beginning of the
         * straight line"* where the seven make point 1 the arrowhead's tip. Same shape,
         * opposite numbering, so it is named here instead of joining a list whose doc it
         * would falsify. @see Pursuit, usesFrontEdgeBase
         */
        name === TacticalGraphicName.Pursuit ||
        /*
         * **The two-rail crossings carry their separation in the base as of 2026-09-06.** It
         * was a `radius` amplifier — the gap between the rails as a number with nowhere to
         * place it — and their plates give it an anchor point. A `width` filed beside those
         * points would be the same second copy this predicate exists to prevent.
         * @see parallelRailAnchors
         */
        RAIL_CROSSING_GRAPHICS.includes(name) ||
        /*
         * **The four bracket mission tasks state it in points 1 and 2, not in point 3.**
         *
         * The separation still lives in the base, which is what this predicate is for — it is
         * the *opening*, and 340200/340300/340500 give its two ends their own anchor points
         * ("points 1 and 2 determine the symbol's height"). Point 3 gives the length instead.
         * Different points, same fact: a `width` stamped beside them is a second copy.
         *
         * Left out, MapLibre defaulted one — 97,839 m on a breach — where OpenLayers wrote
         * none, so the same symbol saved differently on the two engines. It had been masked
         * by `ratioLockedSize`, which cleared the width as a side effect and stopped doing so
         * when these four left `RATIO_LOCK`. @see frontEdgeFrame
         */
        BRACKET_GRAPHICS.includes(name) ||
        /*
         * **Block, disrupt and support by fire, for the same reason and with the same
         * symptom.** Their vertical line — support by fire's back line — is points 1 and 2,
         * so the perpendicular is stated and a `width` beside it is a second copy. Disrupt
         * and support by fire had it masked by `RATIO_LOCK` in exactly the way the four
         * brackets did, and block never defaulted one only because it was never locked.
         * @see PLACED_BLOCK_GRAPHICS
         */
        PLACED_BLOCK_GRAPHICS.includes(name)
    );
}

/** How many points this graphic's base takes, or `undefined` for no limit. */
export function baseVertexCount(name: TacticalGraphicName): number | undefined {
    return BASE_VERTEX_COUNT[name];
}
