/**
 * # The graphics doctrine colours green
 *
 * APP-06 Edition E Version 2, para 8.1.4.3, *Standard Identity Colouring Control Measures*:
 *
 * > Obstacles and obstructions as shown in this chapter (friendly, hostile, neutral,
 * > unknown, or factional) are to be drawn using the colour **green**. However, if the
 * > colour green is not available obstacles are to be drawn using black.
 *
 * Two things in that sentence decide how this file is used.
 *
 * **It is not an affiliation colour.** The parenthesis is exhaustive on purpose, and the
 * same paragraph says so outright: *"The use of green and yellow for obstacles and CBRN is
 * in contradiction to the Standard Identities."* A hostile obstacle is green, not red — the
 * plates carry the affiliation on a red enemy diamond drawn *beside* the symbol rather than
 * in the symbol. So this rule wins over `getColorByHostility`, and it is the only family in
 * the library where affiliation loses outright. @see lineColorOf
 *
 * **Black is the sanctioned fallback**, not a compromise someone invented. That is what
 * `obstacleColors: false` selects, and why the off state is spelled as returning to the
 * affiliation colour rather than as a second palette entry.
 *
 * ## Where the membership came from
 *
 * Read off the plates rather than reasoned from the code ranges: every Example cell in
 * APP-06 is a raster, so each of the 310 coded graphics had its own row cropped and its
 * green counted against total inked pixels. Thirty-four came back green, all inside
 * `27xxxx`, `28xxxx` and `29xxxx`. The eight graphics APP-06 does not code were checked
 * against FM 1-02.2 separately, where only **obstacle group** is green — Table 5-19,
 * Countermobility symbols.
 *
 * **The category is not the answer and must not be substituted for this list.** Taking
 * everything filed under `MobilityAndCountermobility` gives 51 and is wrong twice over: 17
 * of them are mobility measures rather than obstacles — routes, MSR and ASR, the four
 * crossings, the three bypasses, the convoys — and are drawn black; while UXO area sits
 * outside that category, under Areas, and is green. An obstruction by effect rather than by
 * intent still obstructs.
 *
 * One near miss is worth recording so nobody re-adds it. `SeverelyRestrictedTerrain`
 * (152500) shows a green-hatched example beside its black one and is **not** in this set:
 * its plate's own note reads *"Optional sector 2 defined colour cross hatching"*, which is a
 * user-chosen fill and not the obstacle rule. @see sectorModifierPaints
 */
import {TacticalGraphicName} from './type';

/**
 * The 35 graphics 8.1.4.3 reaches.
 *
 * Ordered by the entity code the plate carries, so the three ranges stay legible; obstacle
 * group is last because FM 1-02.2 codes nothing.
 */
export const OBSTACLE_GRAPHICS: ReadonlySet<TacticalGraphicName> = new Set([
    // 27xxxx — obstacle areas and effects
    TacticalGraphicName.ObstacleBelt, // 270100
    TacticalGraphicName.ObstacleZone, // 270200
    TacticalGraphicName.ObstacleFreeArea, // 270300
    TacticalGraphicName.ObstacleRestrictedArea, // 270400
    TacticalGraphicName.Block, // 270501
    TacticalGraphicName.Disrupt, // 270502
    TacticalGraphicName.Fix, // 270503
    TacticalGraphicName.Turn, // 270504
    TacticalGraphicName.MinefieldDynamicDepiction, // 270707
    TacticalGraphicName.MinedArea, // 270800
    TacticalGraphicName.MinedAreaFenced, // 270801
    TacticalGraphicName.UnexplodedExplosiveOrdnanceArea, // 271000 — filed under Areas, still an obstruction
    TacticalGraphicName.ExplosivesPlannedStateOfReadiness, // 271201
    TacticalGraphicName.ExplosivesStateOfReadiness1Safe, // 271202
    TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable, // 271203
    TacticalGraphicName.RoadblockCompleteExecuted, // 271204

    // 28xxxx
    TacticalGraphicName.Abatis, // 280100
    TacticalGraphicName.OverheadWire, // 282003

    // 29xxxx — obstacle lines, ditches and wire
    TacticalGraphicName.ObstacleLine, // 290100
    TacticalGraphicName.Mineline, // 290101
    TacticalGraphicName.AntiTankDitchUnderConstruction, // 290201
    TacticalGraphicName.AntiTankDitchCompleted, // 290202
    TacticalGraphicName.AntiTankDitchReinforcedWithMines, // 290203
    TacticalGraphicName.WireUnspecified, // 290301
    TacticalGraphicName.WireSingleFence, // 290302
    TacticalGraphicName.WireDoubleFence, // 290303
    TacticalGraphicName.WireDoubleApronFence, // 290304
    TacticalGraphicName.WireLowWireFence, // 290305
    TacticalGraphicName.WireHighWireFence, // 290306
    TacticalGraphicName.WireSingleConcertina, // 290307
    TacticalGraphicName.WireDoubleStrandConcertina, // 290308
    TacticalGraphicName.WireTripleStrandConcertina, // 290309
    TacticalGraphicName.MineCluster, // 290400
    TacticalGraphicName.TripWire, // 290500

    // FM 1-02.2 only, Table 5-19
    TacticalGraphicName.ObstacleGroup,
]);

/** Whether 8.1.4.3's green applies to this graphic. */
export function drawsAsObstacle(name: TacticalGraphicName | undefined): boolean {
    return !!name && OBSTACLE_GRAPHICS.has(name);
}
