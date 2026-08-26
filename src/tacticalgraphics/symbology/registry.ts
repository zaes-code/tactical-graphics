/**
 * # name → paint function
 *
 * The map-agnostic twin of `openlayers/controllerRegistry.ts`. A renderer asks
 * this what draws a graphic; `isPaintable` is how it finds out whether the answer
 * exists yet.
 *
 * **Deliberately not an exhaustive `Record<TacticalGraphicName, …>`.** The three
 * OpenLayers registries are exhaustive so the compiler walks you through adding a
 * graphic, and this one will be too once every style function is ported. Making it
 * exhaustive now would mean 190-odd entries pointing at a placeholder, which reads
 * as "done" and is the opposite of what a partial port should leave behind.
 *
 * ## This is not yet the single dispatch point, and that is the next job
 *
 * OpenLayers still decides which style a graphic gets from a `switch` inside
 * `LineGraphicBase` and its sibling holders, and this table restates the same
 * routing. Two places to keep in step is one too many — the end state is that the
 * holders consult this, so the routing lives beside the paint functions. Until
 * then, **a graphic added here must match what the OpenLayers holder does**, and
 * the list below was derived from that switch rather than written by hand:
 *
 * ```
 * line() entries in controllerRegistry:        52
 *   with a bespoke style function:             35   ← still to port
 *   falling through to defaultLineStyle:       17   ← DEFAULT_LINE_GRAPHICS
 * ```
 */

import type {PaintFeature, PaintContext, Paint} from '../core/paint';
import {cbrnContaminatedAreaPaint, cbrnMarkPaint} from './cbrnPaints';
import {
    cardinalBoundaryPaint,
    cardinalLabelPaint,
    contourLineBoundaryPaint,
    contourLineLabelPaint,
    nestedZonePaint,
} from './boundaryBreakPaints';
import {CROSSED_MISSION_TASKS} from '../core/symbology';
import {TacticalGraphicName, getLabel} from '../core/type';
import {antiTankDitchPaint, fortifiedLinePaint, wireObstaclePaint} from './obstaclePaints';
import {
    fortifiedPositionPaint,
    mineClusterPaint,
    minelinePaint,
    raftSitePaint,
    tripWirePaint,
} from './protectionLinePaints';
import {decisionLinePaint, mobilityCorridorPaint} from './endGlyphLinePaints';
import {sweptArcTaskPaint} from './sweptArcTaskPaints';
import {PSYOPS_ZONES, psyOpsMarkPaint, psyOpsZonePaint} from './psyOpsPaints';
import {mineFillPaint, minedAreaFencedPaint, minefieldAreaPaint} from './minePaints';
import {obstacleBypassPaint} from './obstacleBypassPaints';
import {demonstrationPaint, escortPaint} from './escortAndDemonstrationPaints';
import {directionArrowPaint} from './linePaints';
import {routeControlMeasurePaint} from './routePaints';
import {finalProtectiveFirePaint, linearSmokeTargetPaint, linearTargetPaint} from './linearTargetPaints';
import {airCorridorLabelPaint, airCorridorPaint} from './corridorPaints';
import {retrogradeTaskPaint} from './retrogradePaints';
import {airCoordinatingAreaLabelPaint, airspaceCoordinationAreaLabelPaint} from './airPaints';
import {airfieldPaint, airfieldPointLabelPaint, airfieldPointPaint} from './airfieldPaints';
import {boundaryPaint, rangeFanLabelPaint} from './boundaryPaints';
import {securityOperationLabelPaint} from './securityPaints';
import {battlePositionPaint, strongPointPaint, unexplodedOrdnanceAreaPaint} from './echelonPaints';
import {exfiltratePaint, reliefInPlacePaint, turnPaint} from './routedTaskPaints';
import {coordinatedFireLinePaint, engineerWorkLinePaint, munitionFlightPathPaint} from './midLabelLinePaints';
import {arrowheadedLinePaint, forwardLineOfOwnTroopsPaint, lineOfContactPaint} from './scallopPaints';
import {fieldsOfFirePaint, passageLanePaint} from './mobilityPaints';
import {
    barSymbolPaint,
    baseDefenseZoneLabelPaint,
    crossedMissionTaskLabelPaint,
    crossedMissionTaskPaint,
    advanceToContactPaint,
    movementToContactPaint,
    pursuitPaint,
} from './missionTaskPaints';
import {blockPaint, breachPaint, clearPaint} from './blockPaints';
import {
    attackHelicopterAxisLabelPaint,
    aviationAxisLabelPaint,
    axisOfAdvanceLabelPaint,
    avenueOfApproachLabelPaint,
    counterattackLabelPaint,
    envelopmentLabelPaint,
    frontalAttackLabelPaint,
    infiltrationLabelPaint,
    mobileDefenseLabelPaint,
    bridgeLabelPaint,
    envelopmentGraphicPaint,
    infiltrationGraphicPaint,
    mobileDefenseGraphicPaint,
    movementGraphicPaint,
    advanceToContactLabelPaint,
    movementLabelPaint,
    turningMovementLabelPaint,
} from './movementPaints';
import {
    actionAreaLabelPaint,
    areaDefaultLabelPaint,
    humanTerrainLabelPaint,
    outsideCornerDatePaint,
    areaLabelStackPaint,
    groupOrSeriesOfTargetsLabelPaint,
    positionAreaArtilleryLabelPaint,
    smokeObscurantLabelPaint,
    zoneLabelPaint,
} from './areaLabelPaints';
import {
    encirclementPaint,
    fortifiedAreaPaint,
    groupOrSeriesOfTargetsPaint,
    limitedAccessAreaPaint,
    dashedOutlinePaint,
    obstacleAreaPaint,
    restrictedTerrainPaint,
    freeFireAreaCircularPaint,
    plainOutlinePaint,
} from './areaPaints';
import {
    arcMissionTaskPaint,
    areaFillPaint,
    areaOutlinePaint,
    defaultLinePaint,
    missionTaskLabelPaint,
    obstacleLinePaint,
    phaseLinePaint,
} from './paintFunctions';

/** What a graphic's `graphic` and `label` features paint with. */
export interface GraphicPainters {
    /** The line work. Every graphic has one. */
    graphic: (feature: PaintFeature, context: PaintContext) => Paint[];
    /** The text, when it lives on a separate label feature rather than in the line work. */
    label?: (feature: PaintFeature, context: PaintContext) => Paint[];
}

/**
 * The arc-and-arrowhead mission tasks. All of them cut the gap for their letter
 * from the rendered glyph, and all are ratio-locked, so the label scale tracks the
 * circle's radius.
 *
 * `AreaDefense` belongs to the family and is **not** listed here: it is not
 * ratio-locked, and it is registered separately below so that difference stays
 * visible rather than being smuggled into a loop.
 */
const ARC_MISSION_TASKS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.Contain,
    TacticalGraphicName.Control,
    TacticalGraphicName.CordonAndKnock,
    TacticalGraphicName.CordonAndSearch,
    TacticalGraphicName.Deny,
    TacticalGraphicName.Locate,
    TacticalGraphicName.Isolate,
    TacticalGraphicName.Occupy,
    TacticalGraphicName.Retain,
    TacticalGraphicName.Secure,
];

/**
 * The Lines-category graphics with no bespoke style — designation above each end,
 * date-time group below, dashed when planned.
 *
 * Derived from `LineGraphicBase`'s style switch: every `line()` entry that reaches
 * its `default:` branch.
 *
 * `MovingConvoy` and `HaltedConvoy` are **not** here. They belong to the set by
 * shape — the same generator, the same default style — but both are switched off
 * on purpose (`ai/excluded-graphics.md`, 2026-08-02, "for now"), so their enum
 * members are commented out. Reviving them means uncommenting seven sites, of
 * which this list is now one.
 */
const DEFAULT_LINE_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.BattlefieldHandoverLine,
    TacticalGraphicName.BridgeheadLine,
    TacticalGraphicName.CommonSensorBoundary,
    TacticalGraphicName.DelayLine,
    TacticalGraphicName.FinalCoordinationLine,
    TacticalGraphicName.FireSupportCoordinationLine,
    TacticalGraphicName.ForwardEdgeOfBattleArea,
    TacticalGraphicName.IdentificationFriendOrFoeOff,
    TacticalGraphicName.IdentificationFriendOrFoeOn,
    TacticalGraphicName.IntelligenceCoordinationLine,
    TacticalGraphicName.LimitOfAdvance,
    TacticalGraphicName.LineOfDeparture,
    TacticalGraphicName.LineOfDepartureOrLineOfContact,
    TacticalGraphicName.ReleaseLine,
    TacticalGraphicName.LightLine,
    TacticalGraphicName.LineGeneric,
    TacticalGraphicName.HandoverLine,
    TacticalGraphicName.NamedAreaOfInterestLine,
    TacticalGraphicName.HoldingLine,
    TacticalGraphicName.NoFireLine,
    TacticalGraphicName.BattlefieldCoordinationLine,
    TacticalGraphicName.RestrictiveFireLine,
];

/**
 * The area graphics with no bespoke style — a plain outline in the affiliation's
 * color, dashed when planned.
 *
 * Derived from `getStyleFromLabels`: every `polygon` / `polygonRect` entry that
 * falls past its 15 named special cases. The largest single family in the library.
 */
const DEFAULT_AREA_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.AirSpaceCoordinationAreaIrregular,
    TacticalGraphicName.AirSpaceCoordinationAreaRectangular,
    TacticalGraphicName.AirToAirRefuelingRestrictedOperationsZone,
    TacticalGraphicName.AirfieldZone,
    TacticalGraphicName.AirheadLine,
    TacticalGraphicName.AreaOfOperations,
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular,
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneRectangular,
    TacticalGraphicName.AssaultPosition,
    TacticalGraphicName.BombArea,
    TacticalGraphicName.TerminallyGuidedMunitionFootprint,
    TacticalGraphicName.Bridgehead,
    TacticalGraphicName.EnemyPrisonerOfWarHoldingArea,
    TacticalGraphicName.HumanTerrain,
    TacticalGraphicName.PenetrationBox,
    TacticalGraphicName.Area,
    TacticalGraphicName.JointTacticalActionArea,
    TacticalGraphicName.SubmarineActionArea,
    TacticalGraphicName.SubmarineGeneratedActionArea,
    TacticalGraphicName.AreaGeneric,
    TacticalGraphicName.AssemblyArea,
    TacticalGraphicName.AttackPosition,
    TacticalGraphicName.BaseCamp,
    TacticalGraphicName.BlueKillBoxIrregular,
    TacticalGraphicName.BlueKillBoxRectangular,
    TacticalGraphicName.BrigadeSupportArea,
    TacticalGraphicName.CallForFireZoneIrregular,
    TacticalGraphicName.CallForFireZoneRectangular,
    TacticalGraphicName.TargetBuildUpAreaIrregular,
    TacticalGraphicName.TargetBuildUpAreaRectangular,
    TacticalGraphicName.TargetValueAreaIrregular,
    TacticalGraphicName.TargetValueAreaRectangular,
    TacticalGraphicName.ZoneOfResponsibilityIrregular,
    TacticalGraphicName.ZoneOfResponsibilityRectangular,
    TacticalGraphicName.CensorZoneIrregular,
    TacticalGraphicName.CensorZoneRectangular,
    TacticalGraphicName.CorpsSupportArea,
    TacticalGraphicName.CriticalFriendlyZoneIrregular,
    TacticalGraphicName.CriticalFriendlyZoneRectangular,
    TacticalGraphicName.DeadSpaceAreaIrregular,
    TacticalGraphicName.DeadSpaceAreaRectangular,
    TacticalGraphicName.DetaineeHoldingArea,
    TacticalGraphicName.DivisionSupportArea,
    TacticalGraphicName.FighterEngagementZone,
    TacticalGraphicName.ExtractionZone,
    TacticalGraphicName.RegimentalSupportArea,
    TacticalGraphicName.DropZone,
    TacticalGraphicName.EngagementArea,
    TacticalGraphicName.FireSupportAreaIrregular,
    TacticalGraphicName.FireSupportAreaRectangular,
    TacticalGraphicName.ForwardArmingAndRefuelingPoint,
    TacticalGraphicName.FreeFireAreaIrregular,
    TacticalGraphicName.FreeFireAreaRectangular,
    TacticalGraphicName.GuerrillaBase,
    TacticalGraphicName.HighAltitudeMissileEngagementZone,
    TacticalGraphicName.HighDensityAirspaceControlZone,
    TacticalGraphicName.JointEngagementZone,
    TacticalGraphicName.KillZone,
    TacticalGraphicName.LandingZone,
    TacticalGraphicName.LowAltitudeMissileEngagementZone,
    TacticalGraphicName.MissileEngagementZone,
    TacticalGraphicName.NamedAreaOfInterest,
    TacticalGraphicName.ObjectiveArea,
    TacticalGraphicName.PickupZone,
    TacticalGraphicName.PositionAreaArtilleryIrregular,
    TacticalGraphicName.PositionAreaArtilleryRectangular,
    TacticalGraphicName.PurpleKillBoxIrregular,
    TacticalGraphicName.PurpleKillBoxRectangular,
    TacticalGraphicName.RefugeeHoldingArea,
    TacticalGraphicName.RestrictedOperationsZone,
    TacticalGraphicName.RestrictiveFireAreaIrregular,
    TacticalGraphicName.RestrictiveFireAreaRectangular,
    TacticalGraphicName.ShortRangeAirDefenseEngagementZone,
    TacticalGraphicName.SmokeObscurant,
    TacticalGraphicName.TargetAreaIrregular,
    TacticalGraphicName.TargetAreaOfInterest,
    TacticalGraphicName.TargetAreaRectangular,
    TacticalGraphicName.UnmannedAircraftRestrictedOperationsZone,
    TacticalGraphicName.WeaponEngagementZone,
];


/**
 * The zone families that share one label layout: prefix over name centered, the two
 * date-time groups outside the shape's upper-left.
 *
 * Split by variant because the date anchor differs. A rectangle's corner is a real
 * vertex and a circle has none, so both use the bounding box; an irregular polygon's
 * bounding-box corner can sit far outside the shape, so those use the real vertex.
 */
const ZONE_GRAPHICS_BOXED: readonly TacticalGraphicName[] = [
    TacticalGraphicName.FireSupportAreaRectangular,
    TacticalGraphicName.FireSupportAreaCircular,
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneRectangular,
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular,
    TacticalGraphicName.CriticalFriendlyZoneRectangular,
    TacticalGraphicName.CriticalFriendlyZoneCircular,
    TacticalGraphicName.TargetBuildUpAreaRectangular,
    TacticalGraphicName.TargetBuildUpAreaCircular,
    TacticalGraphicName.TargetValueAreaRectangular,
    TacticalGraphicName.TargetValueAreaCircular,
    TacticalGraphicName.ZoneOfResponsibilityRectangular,
    TacticalGraphicName.ZoneOfResponsibilityCircular,
    TacticalGraphicName.CensorZoneRectangular,
    TacticalGraphicName.CensorZoneCircular,
    TacticalGraphicName.CallForFireZoneRectangular,
    TacticalGraphicName.CallForFireZoneCircular,
    TacticalGraphicName.DeadSpaceAreaRectangular,
    TacticalGraphicName.DeadSpaceAreaCircular,
    TacticalGraphicName.BlueKillBoxRectangular,
    TacticalGraphicName.BlueKillBoxCircular,
    TacticalGraphicName.PurpleKillBoxRectangular,
    TacticalGraphicName.PurpleKillBoxCircular,
];

/** The four CBRN contaminated areas, and the hazard letter each carries. */
/** The two artillery areas that write their abbreviation into their own boundary. */
export const CARDINAL_LABEL_AREAS: ReadonlyArray<readonly [TacticalGraphicName, string]> = [
    [TacticalGraphicName.ArtilleryManeuverArea, 'AMA'],
    [TacticalGraphicName.ArtilleryReservedArea, 'ARA'],
];

export const CBRN_AREAS: ReadonlyArray<readonly [TacticalGraphicName, string]> = [
    [TacticalGraphicName.BiologicalContaminatedArea, 'B'],
    [TacticalGraphicName.ChemicalContaminatedArea, 'C'],
    [TacticalGraphicName.NuclearContaminatedArea, 'N'],
    [TacticalGraphicName.RadiologicalContaminatedArea, 'R'],
];

/**
 * The toxic-industrial-material variants: the same symbol with a **T** in the bottom of
 * the triangle (APP-06 271701, 271801, 272001).
 *
 * Three, not four. The standard gives nuclear contamination no such subtype, and the gap
 * in the numbering — there is no 271901 — is the standard's, not an omission here.
 */
export const CBRN_TOXIC_AREAS: ReadonlyArray<readonly [TacticalGraphicName, string]> = [
    [TacticalGraphicName.BiologicalContaminatedAreaToxicIndustrialMaterial, 'B'],
    [TacticalGraphicName.ChemicalContaminatedAreaToxicIndustrialMaterial, 'C'],
    [TacticalGraphicName.RadiologicalContaminatedAreaToxicIndustrialMaterial, 'R'],
];

const ZONE_GRAPHICS_IRREGULAR: readonly TacticalGraphicName[] = [
    TacticalGraphicName.ZoneOfResponsibilityIrregular,
    TacticalGraphicName.TargetValueAreaIrregular,
    TacticalGraphicName.TargetBuildUpAreaIrregular,
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular,
    TacticalGraphicName.CriticalFriendlyZoneIrregular,
    TacticalGraphicName.CensorZoneIrregular,
    TacticalGraphicName.CallForFireZoneIrregular,
    TacticalGraphicName.DeadSpaceAreaIrregular,
    TacticalGraphicName.BlueKillBoxIrregular,
    TacticalGraphicName.PurpleKillBoxIrregular,
];

/** The families whose label is a plain centered stack of designation over dates. */
const STACK_LABEL_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.NoFireAreaRectangular,
    TacticalGraphicName.NoFireAreaCircular,
    TacticalGraphicName.NoFireAreaIrregular,
    TacticalGraphicName.FireSupportAreaIrregular,
    TacticalGraphicName.FreeFireAreaCircular,
    TacticalGraphicName.FreeFireAreaIrregular,
    TacticalGraphicName.FreeFireAreaRectangular,
    TacticalGraphicName.RestrictiveFireAreaCircular,
    TacticalGraphicName.RestrictiveFireAreaIrregular,
    TacticalGraphicName.RestrictiveFireAreaRectangular,
    TacticalGraphicName.LimitedAccessArea,
    TacticalGraphicName.ObstacleRestrictedArea,
];

/** The areas registered with a structural graphic painter, which still need labels. */
const SPECIAL_AREA_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.ObstacleBelt,
    TacticalGraphicName.ObstacleGroup,
    TacticalGraphicName.ObstacleZone,
    TacticalGraphicName.ObstacleFreeArea,
    TacticalGraphicName.ObstacleRestrictedArea,
    TacticalGraphicName.FortifiedArea,
    TacticalGraphicName.GroupOrSeriesOfTargets,
    TacticalGraphicName.Encirclement,
    TacticalGraphicName.LimitedAccessArea,
    TacticalGraphicName.NoFireAreaCircular,
    TacticalGraphicName.NoFireAreaIrregular,
    TacticalGraphicName.NoFireAreaRectangular,
    TacticalGraphicName.WeaponsFreeZone,
];

/**
 * The label painter for an area graphic, mirroring `getAreaLabelStylesFromLabels`.
 *
 * `undefined` means "no bespoke layout", and the caller falls back to
 * {@link areaDefaultLabelPaint} exactly as the OpenLayers switch's `default:` branch
 * does. Keeping the fallback at the call site rather than in here makes the two
 * structures line up, which matters while the routing lives in two places.
 *
 * Every area family now has one.
 */
const AIR_COORDINATING_ZONES: readonly TacticalGraphicName[] = [
    TacticalGraphicName.HighDensityAirspaceControlZone,
    TacticalGraphicName.RestrictedOperationsZone,
    TacticalGraphicName.AirToAirRefuelingRestrictedOperationsZone,
    TacticalGraphicName.UnmannedAircraftRestrictedOperationsZone,
    TacticalGraphicName.WeaponEngagementZone,
    TacticalGraphicName.FighterEngagementZone,
    TacticalGraphicName.JointEngagementZone,
    TacticalGraphicName.MissileEngagementZone,
    TacticalGraphicName.LowAltitudeMissileEngagementZone,
    TacticalGraphicName.HighAltitudeMissileEngagementZone,
    TacticalGraphicName.ShortRangeAirDefenseEngagementZone,
    TacticalGraphicName.WeaponsFreeZone,
];

/**
 * The action areas, which share one Template: the literal and the designation on the first
 * line, the date-time group under it, and `ENY` at the west and east edges when hostile.
 * @see actionAreaLabelPaint
 */
const ACTION_AREAS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.JointTacticalActionArea,
    TacticalGraphicName.SubmarineActionArea,
    TacticalGraphicName.SubmarineGeneratedActionArea,
];

const AIRSPACE_COORDINATION_AREAS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.AirSpaceCoordinationAreaRectangular,
    TacticalGraphicName.AirSpaceCoordinationAreaIrregular,
    TacticalGraphicName.AirSpaceCoordinationAreaCircular,
];

function areaLabelPainterFor(name: TacticalGraphicName) {
    if (ZONE_GRAPHICS_BOXED.includes(name)) return zoneLabelPaint(name, false);
    if (ZONE_GRAPHICS_IRREGULAR.includes(name)) return zoneLabelPaint(name, true);
    if (STACK_LABEL_GRAPHICS.includes(name)) return areaLabelStackPaint(name);
    if (name === TacticalGraphicName.ObstacleFreeArea) return areaLabelStackPaint(name, {before: ['FREE']});
    // 310200's Template stacks its literal on two lines with the designation **under** it,
    // where every other prefixed area sets the two side by side. @see areaLabelStackPaint
    if (name === TacticalGraphicName.EnemyPrisonerOfWarHoldingArea) {
        return areaLabelStackPaint(name, {literalLines: ['EPW', 'HOLDING AREA']});
    }
    // 370100 sets its literal over field **H**, not over a designation — the one area whose
    // second line is the free text. @see actionAreaLabelPaint for the family that does both
    if (name === TacticalGraphicName.HumanTerrain) return humanTerrainLabelPaint();
    // 150501-150503 and 120700: literal - T over W - W1, with ENY on the flanks when hostile.
    if (ACTION_AREAS.includes(name)) return actionAreaLabelPaint(name);
    if (name === TacticalGraphicName.AreaGeneric) return actionAreaLabelPaint(name, {withAdditionalInfo: true});
    if (name === TacticalGraphicName.GroupOrSeriesOfTargets) return groupOrSeriesOfTargetsLabelPaint(name);
    if (name === TacticalGraphicName.SmokeObscurant) return smokeObscurantLabelPaint();
    if (AIR_COORDINATING_ZONES.includes(name)) return airCoordinatingAreaLabelPaint(name);
    if (AIRSPACE_COORDINATION_AREAS.includes(name)) return airspaceCoordinationAreaLabelPaint(name);
    // The airfield's label block is the ordinary one; what is bespoke is the runway
    // symbol drawn over it, which the paint wraps around the label. @see airfieldPaint
    // Airfield zone is the runway glyph fitted inside a drawn area; APP-06 120400 carries
    // an H amplifier rather than a text label, and the glyph is the symbol either way.
    //
    // The **airfield** itself is not here: 131900 is a one-point static symbol and gets its
    // own pair below, which is the whole difference between the two graphics.
    if (name === TacticalGraphicName.AirfieldZone) {
        return airfieldPaint(areaDefaultLabelPaint(name));
    }
    if (
        name === TacticalGraphicName.PositionAreaArtilleryCircular ||
        name === TacticalGraphicName.PositionAreaArtilleryIrregular ||
        name === TacticalGraphicName.PositionAreaArtilleryRectangular
    ) {
        return positionAreaArtilleryLabelPaint(name);
    }
    return undefined;
}


/**
 * The countermobility line obstacles: nine wire types and three anti-tank ditches.
 *
 * Derived from `LineGraphicBase`'s switch rather than hand-listed, like the other
 * families here — the routing lives there until the holders consult this registry.
 */
const WIRE_OBSTACLE_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.WireUnspecified,
    TacticalGraphicName.WireSingleFence,
    TacticalGraphicName.WireDoubleFence,
    TacticalGraphicName.WireDoubleApronFence,
    TacticalGraphicName.WireLowWireFence,
    TacticalGraphicName.WireHighWireFence,
    TacticalGraphicName.WireSingleConcertina,
    TacticalGraphicName.WireDoubleStrandConcertina,
    TacticalGraphicName.WireTripleStrandConcertina,
];

const ANTI_TANK_DITCH_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.AntiTankDitchUnderConstruction,
    TacticalGraphicName.AntiTankDitchCompleted,
    TacticalGraphicName.AntiTankDitchReinforcedWithMines,
];

/** The four direction-of-attack arrows. */
const DIRECTION_ARROW_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.DirectionOfMainAttack,
    TacticalGraphicName.DirectionOfSupportingAttack,
    TacticalGraphicName.AviationDirectionOfAttack,
    TacticalGraphicName.DirectionOfMainAttackFeint,
];

/** Route, main supply route and alternate supply route: one style, three names. */
const ROUTE_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.Route,
    TacticalGraphicName.MainSupplyRoute,
    TacticalGraphicName.AlternateSupplyRoute,
];

/** The eight air-coordinating corridors: one shape, eight doctrinal names. */
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
 * The retrograde tasks. Each takes its own designation from `getLabel`, and abatis
 * deliberately has none — a graphic with no letter gets no gap cut for one.
 */
/**
 * The bar-stack symbols: the three explosives readiness states and the executed
 * roadblock. `BAR_SYMBOL_DASHES` says which bar of each is broken.
 */
const BAR_SYMBOL_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.ExplosivesPlannedStateOfReadiness,
    TacticalGraphicName.ExplosivesStateOfReadiness1Safe,
    TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable,
    TacticalGraphicName.RoadblockCompleteExecuted,
];

/**
 * The circular areas whose holder installs no style of its own — a bare ring in
 * the affiliation's color.
 */
const CIRCULAR_AREA_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular,
    TacticalGraphicName.BlueKillBoxCircular,
    TacticalGraphicName.CallForFireZoneCircular,
    TacticalGraphicName.TargetBuildUpAreaCircular,
    TacticalGraphicName.TargetValueAreaCircular,
    TacticalGraphicName.ZoneOfResponsibilityCircular,
    TacticalGraphicName.CensorZoneCircular,
    TacticalGraphicName.CriticalFriendlyZoneCircular,
    TacticalGraphicName.DeadSpaceAreaCircular,
    TacticalGraphicName.FireSupportAreaCircular,
    TacticalGraphicName.PurpleKillBoxCircular,
    TacticalGraphicName.TargetAreaCircular,
];

/** The circular areas that dash their ring and hatch their interior when planned. */
const CIRCULAR_HATCHED_WHEN_PLANNED: readonly TacticalGraphicName[] = [
    TacticalGraphicName.FreeFireAreaCircular,
    TacticalGraphicName.RestrictiveFireAreaCircular,
    TacticalGraphicName.PositionAreaArtilleryCircular,
    TacticalGraphicName.AirSpaceCoordinationAreaCircular,
];

/** The three security operations, which share one shape and one label treatment. */
const SECURITY_OPERATIONS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.Cover,
    TacticalGraphicName.Guard,
    TacticalGraphicName.Screen,
];

const RETROGRADE_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.Delay,
    TacticalGraphicName.Withdraw,
    TacticalGraphicName.WithdrawUnderPressure,
    TacticalGraphicName.Disengage,
    TacticalGraphicName.Retirement,
    TacticalGraphicName.ForwardPassageOfLines,
    TacticalGraphicName.RearwardPassageOfLines,
];

/**
 * The movement and maneuver family. Each draws plain line work and an amplifier
 * chosen per graphic — the table mirrors what `LineGraphicBase`'s movement switch
 * used to do inline.
 */
const MOVEMENT_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.AvenueOfApproach,
    TacticalGraphicName.AttackHelicopterAxisOfAdvance,
    TacticalGraphicName.MainAxisOfAdvance,
    TacticalGraphicName.MainAxisOfAdvanceFeint,
    TacticalGraphicName.AviationAxisOfAdvance,
    TacticalGraphicName.SupportingAxisOfAdvance,
    TacticalGraphicName.Counterattack,
    TacticalGraphicName.CounterattackByFire,
    TacticalGraphicName.InfiltrationLane,
    TacticalGraphicName.Bridge,
    TacticalGraphicName.Gap,
    TacticalGraphicName.AssaultCrossing,
    TacticalGraphicName.FordEasy,
    TacticalGraphicName.FordDifficult,
    TacticalGraphicName.FrontalAttack,
    TacticalGraphicName.TurningMovement,
    TacticalGraphicName.Envelopment,
    TacticalGraphicName.MobileDefense,
    TacticalGraphicName.Infiltration,
];

/** The four that share the axis-of-advance label layout. */
const AXIS_OF_ADVANCE_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.MainAxisOfAdvance,
    TacticalGraphicName.MainAxisOfAdvanceFeint,
    TacticalGraphicName.SupportingAxisOfAdvance,
    TacticalGraphicName.InfiltrationLane,
];

/** Members whose amplifier is a fixed letter or a bespoke line. */
const MOVEMENT_LABEL_PAINTS: Partial<Record<TacticalGraphicName, () => ReturnType<typeof movementLabelPaint>>> = {
    [TacticalGraphicName.Infiltration]: infiltrationLabelPaint,
    [TacticalGraphicName.Envelopment]: envelopmentLabelPaint,
    [TacticalGraphicName.MobileDefense]: mobileDefenseLabelPaint,
    [TacticalGraphicName.TurningMovement]: turningMovementLabelPaint,
    [TacticalGraphicName.FrontalAttack]: frontalAttackLabelPaint,
    [TacticalGraphicName.AvenueOfApproach]: avenueOfApproachLabelPaint,
    [TacticalGraphicName.Counterattack]: counterattackLabelPaint,
    [TacticalGraphicName.CounterattackByFire]: counterattackLabelPaint,
    [TacticalGraphicName.AviationAxisOfAdvance]: aviationAxisLabelPaint,
    [TacticalGraphicName.AttackHelicopterAxisOfAdvance]: attackHelicopterAxisLabelPaint,
};

function movementLabelFor(name: TacticalGraphicName) {
    if (AXIS_OF_ADVANCE_GRAPHICS.includes(name)) return axisOfAdvanceLabelPaint(name);
    return (MOVEMENT_LABEL_PAINTS[name] ?? movementLabelPaint)();
}

function buildRegistry(): Partial<Record<TacticalGraphicName, GraphicPainters>> {
    const registry: Partial<Record<TacticalGraphicName, GraphicPainters>> = {
        [TacticalGraphicName.PhaseLine]: {graphic: phaseLinePaint(TacticalGraphicName.PhaseLine)},
        [TacticalGraphicName.ObstacleLine]: {graphic: obstacleLinePaint(TacticalGraphicName.ObstacleLine)},

        // ── APP-06's protection lines ────────────────────────────────────────
        [TacticalGraphicName.Capture]: {graphic: sweptArcTaskPaint(getLabel(TacticalGraphicName.Capture))},
        [TacticalGraphicName.Escort]: {graphic: escortPaint(getLabel(TacticalGraphicName.Escort))},
        [TacticalGraphicName.Demonstration]: {graphic: demonstrationPaint(getLabel(TacticalGraphicName.Demonstration))},
        [TacticalGraphicName.Evacuate]: {graphic: sweptArcTaskPaint(getLabel(TacticalGraphicName.Evacuate))},
        [TacticalGraphicName.Recover]: {graphic: sweptArcTaskPaint(getLabel(TacticalGraphicName.Recover))},
        [TacticalGraphicName.DecisionLine]: {graphic: decisionLinePaint()},
        [TacticalGraphicName.MobilityCorridor]: {graphic: mobilityCorridorPaint()},
        [TacticalGraphicName.MinimumSafeDistanceZone]: {graphic: nestedZonePaint()},
        [TacticalGraphicName.MinimumSafeDistanceMultipleStrike]: {graphic: nestedZonePaint()},
        [TacticalGraphicName.ObstacleBypassEasy]: {graphic: obstacleBypassPaint(TacticalGraphicName.ObstacleBypassEasy)},
        [TacticalGraphicName.ObstacleBypassDifficult]: {graphic: obstacleBypassPaint(TacticalGraphicName.ObstacleBypassDifficult)},
        [TacticalGraphicName.ObstacleBypassImpossible]: {graphic: obstacleBypassPaint(TacticalGraphicName.ObstacleBypassImpossible)},
        [TacticalGraphicName.Mineline]: {graphic: minelinePaint(TacticalGraphicName.Mineline)},
        [TacticalGraphicName.MineCluster]: {graphic: mineClusterPaint()},
        [TacticalGraphicName.TripWire]: {graphic: tripWirePaint()},
        [TacticalGraphicName.RaftSite]: {graphic: raftSitePaint()},
        [TacticalGraphicName.FortifiedPosition]: {graphic: fortifiedPositionPaint()},
        [TacticalGraphicName.ProbableLineOfDeployment]: {
            graphic: defaultLinePaint(TacticalGraphicName.ProbableLineOfDeployment, {
                alwaysDashed: true,
                showDates: false,
            }),
        },
        // Same arc geometry as the ratio-locked seven, but its own label scale and a
        // set of solid polygon teeth that `arcMissionTaskPaint` fills.
        [TacticalGraphicName.AreaDefense]: {
            graphic: arcMissionTaskPaint(TacticalGraphicName.AreaDefense, false),
            label: missionTaskLabelPaint(TacticalGraphicName.AreaDefense),
        },

        // ── The areas that draw something structural ──────────────────────────
        // Teeth outward for the belt / group / zone, inward for the free and
        // restricted areas, and the restricted area alone is hatched.
        [TacticalGraphicName.ObstacleBelt]: {graphic: obstacleAreaPaint({outward: true})},
        [TacticalGraphicName.ObstacleGroup]: {graphic: obstacleAreaPaint({outward: true})},
        [TacticalGraphicName.ObstacleZone]: {graphic: obstacleAreaPaint({outward: true})},
        [TacticalGraphicName.ObstacleFreeArea]: {graphic: obstacleAreaPaint({outward: false})},
        [TacticalGraphicName.ObstacleRestrictedArea]: {graphic: obstacleAreaPaint({outward: false, hatched: true})},
        // APP-06 242600 note 1: the boundary is a broken line in *all* status
        // depictions, so the dash is the symbol rather than a status.
        [TacticalGraphicName.ZoneOfFire]: {graphic: dashedOutlinePaint(), label: areaDefaultLabelPaint(TacticalGraphicName.ZoneOfFire)},
        // Told apart from each other by texture alone. @see hatchTileSegments
        [TacticalGraphicName.RestrictedTerrain]: {graphic: restrictedTerrainPaint()},
        [TacticalGraphicName.SeverelyRestrictedTerrain]: {graphic: restrictedTerrainPaint({dense: true})},

        [TacticalGraphicName.FortifiedArea]: {graphic: fortifiedAreaPaint()},
        [TacticalGraphicName.GroupOrSeriesOfTargets]: {graphic: groupOrSeriesOfTargetsPaint()},
        [TacticalGraphicName.Encirclement]: {graphic: encirclementPaint()},

        // One hatched fill under an affiliation-colored outline.
        [TacticalGraphicName.LimitedAccessArea]: {graphic: limitedAccessAreaPaint()},
        [TacticalGraphicName.NoFireAreaCircular]: {graphic: limitedAccessAreaPaint()},
        [TacticalGraphicName.NoFireAreaIrregular]: {graphic: limitedAccessAreaPaint()},
        [TacticalGraphicName.NoFireAreaRectangular]: {graphic: limitedAccessAreaPaint()},
        [TacticalGraphicName.WeaponsFreeZone]: {graphic: limitedAccessAreaPaint()},
    };

    for (const name of ARC_MISSION_TASKS) {
        registry[name] = {
            graphic: arcMissionTaskPaint(name, true),
            label: missionTaskLabelPaint(name),
        };
    }

    for (const name of DEFAULT_LINE_GRAPHICS) {
        registry[name] = {graphic: defaultLinePaint(name)};
    }

    for (const name of DEFAULT_AREA_GRAPHICS) {
        registry[name] = {graphic: areaOutlinePaint(name)};
    }

    for (const name of WIRE_OBSTACLE_GRAPHICS) {
        registry[name] = {graphic: wireObstaclePaint(name)};
    }

    for (const name of ANTI_TANK_DITCH_GRAPHICS) {
        registry[name] = {graphic: antiTankDitchPaint(name)};
    }

    registry[TacticalGraphicName.FortifiedLine] = {graphic: fortifiedLinePaint(TacticalGraphicName.FortifiedLine)};

    for (const name of DIRECTION_ARROW_GRAPHICS) {
        registry[name] = {graphic: directionArrowPaint(name)};
    }

    for (const name of ROUTE_GRAPHICS) {
        registry[name] = {graphic: routeControlMeasurePaint(name)};
    }

    // 0.75 for the disrupts, not the 0.6 default: it centers the "D" on the middle
    // prong, which spans 0.5 to 1.0 of the user's drawn base.
    registry[TacticalGraphicName.TacticalBlock] = {graphic: blockPaint(getLabel(TacticalGraphicName.TacticalBlock))};
    registry[TacticalGraphicName.Penetration] = {graphic: blockPaint(getLabel(TacticalGraphicName.Penetration))};
    registry[TacticalGraphicName.Block] = {graphic: blockPaint(getLabel(TacticalGraphicName.Block))};
    registry[TacticalGraphicName.Bypass] = {graphic: breachPaint(getLabel(TacticalGraphicName.Bypass))};
    registry[TacticalGraphicName.Canalize] = {graphic: breachPaint(getLabel(TacticalGraphicName.Canalize))};
    registry[TacticalGraphicName.Breach] = {graphic: breachPaint(getLabel(TacticalGraphicName.Breach))};
    registry[TacticalGraphicName.Clear] = {graphic: clearPaint(getLabel(TacticalGraphicName.Clear))};
    registry[TacticalGraphicName.TacticalDisrupt] = {graphic: clearPaint(getLabel(TacticalGraphicName.TacticalDisrupt), 0.75)};
    registry[TacticalGraphicName.Disrupt] = {graphic: clearPaint(getLabel(TacticalGraphicName.Disrupt), 0.75)};

    for (const [name, label] of CARDINAL_LABEL_AREAS) {
        registry[name] = {
            graphic: cardinalBoundaryPaint(label),
            label: cardinalLabelPaint(label, areaDefaultLabelPaint(name)),
        };
    }
    for (const [name, letter] of CBRN_AREAS) {
        registry[name] = {
            graphic: cbrnContaminatedAreaPaint(),
            label: cbrnMarkPaint(letter, areaDefaultLabelPaint(name)),
        };
    }
    for (const [name, letter] of CBRN_TOXIC_AREAS) {
        registry[name] = {
            graphic: cbrnContaminatedAreaPaint(),
            label: cbrnMarkPaint(letter, areaDefaultLabelPaint(name), {toxic: true}),
        };
    }
    for (const name of MOVEMENT_GRAPHICS) {
        registry[name] = {graphic: movementGraphicPaint(), label: movementLabelFor(name)};
    }

    // Three of the family draw their own line work, and the OpenLayers holder used to
    // be the only place that said so — it installed these *after* the registry's
    // painter, so MapLibre kept the generic one and drew mobile defense's teeth
    // hollow and the two approaches without their letter gap.
    registry[TacticalGraphicName.Infiltration] = {
        graphic: infiltrationGraphicPaint(),
        label: movementLabelFor(TacticalGraphicName.Infiltration),
    };
    // Envelopment's line work is the movement family's, and so is its letter — now that
    // its generator hands over the run's two ends rather than one pre-placed point.
    //
    // It was routed to `missionTaskLabelPaint`, which draws the letter at whatever point
    // the generator named. That point is exact in 4326 and a little off the *straight
    // segment* a renderer draws between the run's reprojected ends, by an error that
    // grows with the run — so the "E" slid out of its hole as the graphic got bigger,
    // which is the one thing the hole exists to prevent. `envelopmentLabelPaint` finds
    // the quarter point on the projected segment instead, where the gap is cut.
    registry[TacticalGraphicName.Envelopment] = {
        graphic: envelopmentGraphicPaint(),
        label: envelopmentLabelPaint(),
    };
    // The crossings label themselves like an amplifier rather than like an arrow —
    // the OpenLayers holder said so and the registry did not, so MapLibre sized a
    // bridge's designation by the crossing's span and drew it several times too big.
    for (const name of [
        TacticalGraphicName.Bridge,
        TacticalGraphicName.Gap,
        TacticalGraphicName.AssaultCrossing,
    ]) {
        registry[name] = {graphic: movementGraphicPaint(), label: bridgeLabelPaint()};
    }
    registry[TacticalGraphicName.MobileDefense] = {
        graphic: mobileDefenseGraphicPaint(),
        label: movementLabelFor(TacticalGraphicName.MobileDefense),
    };

    // The four crossed tasks share one shape and differ only in their letter and in
    // which arm is hashed, so both halves are parameterised by name alone.
    for (const name of CROSSED_MISSION_TASKS) {
        registry[name] = {graphic: crossedMissionTaskPaint(name), label: crossedMissionTaskLabelPaint(name)};
    }

    // The readiness states differ only in which bar is dashed — a stroke property, so
    // it cannot live in the geometry and every one of them needs a paint function.
    for (const name of BAR_SYMBOL_GRAPHICS) {
        registry[name] = {graphic: barSymbolPaint(name)};
    }

    // The circular fire-support areas. Four of them dash and hatch when planned;
    // the rest are a bare ring. Their labels come from the zone tables below, which
    // already list the circular variants — they were skipped only because no graphic
    // painter was registered for them to hang off.
    for (const name of CIRCULAR_AREA_GRAPHICS) {
        registry[name] = {graphic: plainOutlinePaint()};
    }
    for (const name of CIRCULAR_HATCHED_WHEN_PLANNED) {
        registry[name] = {graphic: freeFireAreaCircularPaint()};
    }

    registry[TacticalGraphicName.CoordinatedFireLine] = {graphic: coordinatedFireLinePaint(TacticalGraphicName.CoordinatedFireLine)};
    registry[TacticalGraphicName.EngineerWorkLine] = {graphic: engineerWorkLinePaint(TacticalGraphicName.EngineerWorkLine)};
    registry[TacticalGraphicName.MunitionFlightPath] = {graphic: munitionFlightPathPaint()};
    registry[TacticalGraphicName.ForwardLineOfOwnTroops] = {graphic: forwardLineOfOwnTroopsPaint()};
    registry[TacticalGraphicName.LineOfContact] = {graphic: lineOfContactPaint()};
    registry[TacticalGraphicName.FieldsOfFire] = {graphic: fieldsOfFirePaint()};
    registry[TacticalGraphicName.PassageLane] = {graphic: passageLanePaint()};
    // 'F' for the mission task, '' for the table 5-19 twin and the ferry crossing.
    registry[TacticalGraphicName.TacticalFix] = {graphic: arrowheadedLinePaint(getLabel(TacticalGraphicName.TacticalFix))};
    registry[TacticalGraphicName.Fix] = {graphic: arrowheadedLinePaint(getLabel(TacticalGraphicName.Fix))};
    registry[TacticalGraphicName.FerryCrossing] = {graphic: arrowheadedLinePaint()};

    registry[TacticalGraphicName.Pursuit] = {
        graphic: pursuitPaint(TacticalGraphicName.Pursuit),
        label: missionTaskLabelPaint(TacticalGraphicName.Pursuit),
    };
    registry[TacticalGraphicName.MovementToContact] = {
        graphic: movementToContactPaint(),
        label: missionTaskLabelPaint(TacticalGraphicName.MovementToContact),
    };
    // APP-06's advance to contact: a different symbol, so a different paint. Its bolt
    // needs no screen-space offset because it leaves the wing already clear of the
    // outline, where FM's badge starts its two on the flank. @see AdvanceToContact
    registry[TacticalGraphicName.AdvanceToContact] = {
        graphic: advanceToContactPaint(),
        // APP-06 342900's T and W . W1 boxes -- the amplifier set FM's badge does not
        // carry at all. @see advanceToContactLabelPaint for why it is one line.
        label: advanceToContactLabelPaint(),
    };
    // Its label is the one hardcoded string in the family, and it tracks the circle
    // rather than the zoom.
    registry[TacticalGraphicName.BaseDefenseZone] = {
        graphic: plainOutlinePaint(),
        label: baseDefenseZoneLabelPaint(),
    };
    // Shape-only symbols: the position bracket and its arrows *are* the graphic, and
    // there is no letter to render. @see FM 1-02.2 table 6-1
    for (const name of [TacticalGraphicName.AttackByFire, TacticalGraphicName.SupportByFire]) {
        registry[name] = {graphic: plainOutlinePaint()};
    }
    // Exploitation runs through the block holder but installs no style of its own, so
    // it takes that holder's fallback — filled, not merely outlined.
    registry[TacticalGraphicName.Exploitation] = {graphic: areaFillPaint()};
    // The point-anchored tasks with no bespoke line work: a plain ring and the
    // family's centered designation.
    for (const name of [
        TacticalGraphicName.Ambush,
        TacticalGraphicName.FightingPosition,
    ]) {
        registry[name] = {graphic: plainOutlinePaint(), label: missionTaskLabelPaint(name)};
    }
    // Abatis is a drawn route carrying one fixed-size chevron, so the whole symbol is
    // in the geometry and a plain stroke draws it. It has no doctrinal designation —
    // it sat in the group above and took `missionTaskLabelPaint`, which rendered
    // nothing for it. @see Abatis, ai/app-6.md "F1"
    registry[TacticalGraphicName.Abatis] = {graphic: plainOutlinePaint()};

    // Turn's "T" comes off its own label feature, so the graphic painter takes the
    // letter only to size the gap it cuts for it.
    for (const name of [TacticalGraphicName.Turn, TacticalGraphicName.TacticalTurn]) {
        registry[name] = {graphic: turnPaint(getLabel(name)), label: missionTaskLabelPaint(name)};
    }
    registry[TacticalGraphicName.ReliefInPlace] = {graphic: reliefInPlacePaint('RIP')};
    registry[TacticalGraphicName.Exfiltrate] = {graphic: exfiltratePaint(getLabel(TacticalGraphicName.Exfiltrate))};

    // The contour line's dose sits in a single break at the top of the outline.
    registry[TacticalGraphicName.RadiationDoseRateContourLine] = {
        graphic: contourLineBoundaryPaint(),
        // Nothing under it: the dose belongs in the break, and a centre block would be
        // the same text twice.
        label: contourLineLabelPaint(() => []),
    };
    // Three shapes, one construction: an outline and a loudspeaker inside it.
    for (const name of PSYOPS_ZONES) {
        registry[name] = {
            graphic: psyOpsZonePaint(),
            label: psyOpsMarkPaint(outsideCornerDatePaint(name === TacticalGraphicName.PsyOpsZoneIrregular)),
        };
    }
    // The two mine areas: different outlines, the same row of mines inside.
    registry[TacticalGraphicName.MinefieldDynamicDepiction] = {
        graphic: minefieldAreaPaint(),
        label: mineFillPaint(),
    };
    registry[TacticalGraphicName.MinedAreaFenced] = {
        graphic: minedAreaFencedPaint(),
        label: mineFillPaint(),
    };
    // The point airfield: arms pinned to a screen size, designation beside them.
    registry[TacticalGraphicName.Airfield] = {
        graphic: airfieldPointPaint(),
        label: airfieldPointLabelPaint(TacticalGraphicName.Airfield),
    };
    registry[TacticalGraphicName.BattlePosition] = {graphic: battlePositionPaint()};
    // APP-06 151202: the same construction, broken in every status. @see battlePositionPaint
    registry[TacticalGraphicName.BattlePositionPreparedButNotOccupied] = {graphic: battlePositionPaint({alwaysDashed: true})};
    registry[TacticalGraphicName.StrongPoint] = {graphic: strongPointPaint()};
    registry[TacticalGraphicName.UnexplodedExplosiveOrdnanceArea] = {graphic: unexplodedOrdnanceAreaPaint()};

    registry[TacticalGraphicName.Boundary] = {graphic: boundaryPaint()};
    // The fans' line work is a plain stroke; everything doctrinal about them is in
    // the band labels.
    for (const name of [
        TacticalGraphicName.WeaponSensorRangeFanCircular,
        TacticalGraphicName.WeaponSensorRangeFanSector,
    ]) {
        registry[name] = {graphic: plainOutlinePaint(), label: rangeFanLabelPaint(name)};
    }

    // Cover, guard and screen. The line work paints; the center symbol does not,
    // because it is injected by the host and no renderer-agnostic description of it
    // exists. A MapLibre view also cannot yet *build* one of these through the
    // public API — the generator wants centerPadding, arrowLength, arrowDepth,
    // arrowHeadLength and arrowHeadDegree, and none of the five is in
    // TacticalGraphicProperties. Registered here so the paint half is done and the
    // remaining gap is the schema one alone.
    for (const name of SECURITY_OPERATIONS) {
        registry[name] = {graphic: plainOutlinePaint(), label: securityOperationLabelPaint(getLabel(name))};
    }

    for (const name of RETROGRADE_GRAPHICS) {
        registry[name] = {graphic: retrogradeTaskPaint(getLabel(name))};
    }

    for (const name of CORRIDOR_GRAPHICS) {
        registry[name] = {graphic: airCorridorPaint(), label: airCorridorLabelPaint(name)};
    }

    registry[TacticalGraphicName.LinearTarget] = {graphic: linearTargetPaint(TacticalGraphicName.LinearTarget)};
    registry[TacticalGraphicName.LinearSmokeTarget] = {graphic: linearSmokeTargetPaint(TacticalGraphicName.LinearSmokeTarget)};
    registry[TacticalGraphicName.FinalProtectiveFire] = {graphic: finalProtectiveFirePaint()};

    // Labels last, over whatever graphic painter was registered above. Every area
    // gets one: the bespoke layout if its family has one, the default otherwise.
    //
    // **The three at the end are areas whose *graphic* is bespoke enough to be
    // registered on their own**, which put them outside the four family lists and so
    // outside this loop — and an area's labels live on a separate feature, so with no
    // painter they simply did not draw. Measured, BattlePosition showed 28% of
    // OpenLayers' ink at a far zoom: the box, and neither its designation nor its
    // date-time group.
    for (const name of [
        ...DEFAULT_AREA_GRAPHICS,
        ...SPECIAL_AREA_GRAPHICS,
        ...CIRCULAR_AREA_GRAPHICS,
        ...CIRCULAR_HATCHED_WHEN_PLANNED,
        TacticalGraphicName.BattlePosition,
        TacticalGraphicName.BattlePositionPreparedButNotOccupied,
        TacticalGraphicName.StrongPoint,
        TacticalGraphicName.UnexplodedExplosiveOrdnanceArea,
    ]) {
        const entry = registry[name];
        if (entry) entry.label = areaLabelPainterFor(name) ?? areaDefaultLabelPaint(name);
    }

    return registry;
}

const REGISTRY = buildRegistry();

/** Every graphic that has a paint function today. */
export const PAINTABLE_GRAPHICS: readonly TacticalGraphicName[] = Object.keys(REGISTRY) as TacticalGraphicName[];

/** Whether `name` has been ported to a paint function yet. */
export function isPaintable(name: TacticalGraphicName): boolean {
    return name in REGISTRY;
}

/** The painters for `name`, or `undefined` if it has not been ported. */
export function getPaintFunction(name: TacticalGraphicName): GraphicPainters | undefined {
    return REGISTRY[name];
}
