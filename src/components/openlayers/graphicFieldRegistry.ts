/**
 * Declarative per-graphic field registry.
 *
 * Each entry in GRAPHIC_FIELDS declares which data fields are relevant for
 * a given graphic. The Feature Properties modal reads this to decide which
 * inputs to render, replacing the old scattered feature-flag approach
 * (graphicType / hasEchelon / hasCountryCode).
 *
 * Adding a new graphic: add one entry below pointing at an existing profile
 * constant or a custom GraphicFieldSet literal. The Record type ensures
 * every TacticalGraphicName is covered at compile time.
 */

import {TacticalGraphicName} from '@zaes/tactical-graphics';

// ── Public type ───────────────────────────────────────────────────────────────

export type GraphicFieldSet = {
    /** Primary name / identifier shown on the graphic (labels.label). */
    identifier1: boolean;
    /** Second identifier + country codes (Boundary, ACA unit name). */
    identifier2: boolean;
    /** Start date/time (labels.startDate). */
    dtg1: boolean;
    /** End date/time (labels.endDate). */
    dtg2: boolean;
    hostility: boolean;
    /** Confidence — always shown conditionally when hostility = hostile/faker; no separate flag needed. */
    status: boolean;
    /** Echelon selector (BattlePosition, StrongPoint, Boundary). */
    echelon: boolean;
    /** Route direction selector (Route / MSR / ASR). */
    direction: boolean;
    /** Min altitude inputs (airspace graphics). */
    altitude1: boolean;
    /** Max altitude inputs (airspace graphics). */
    altitude2: boolean;
    /** Width field (Airspace Area). */
    width: boolean;
    /** Grids field (Airspace Coordination Area). */
    grids: boolean;
    /** Used for FinalProtectiveFire */
    weapon: boolean;
    /**
     * Multi-band weapon/sensor range fan editor (bands list + altitude per
     * band; sector graphic also gets left/right azimuth fields). Only the
     * two range fan graphics consume this — every other graphic stays
     * unaffected.
     */
    rangeFan: boolean;
};

// ── Helper ────────────────────────────────────────────────────────────────────

function f(
    identifier1: boolean,
    identifier2: boolean,
    dtg1: boolean,
    dtg2: boolean,
    hostility: boolean,
    status: boolean,
    extra: Partial<Pick<GraphicFieldSet, 'echelon' | 'direction' | 'altitude1' | 'altitude2' | 'width' | 'grids' | 'weapon' | 'rangeFan' >> = {},
): GraphicFieldSet {
    return {
        identifier1,
        identifier2,
        dtg1,
        dtg2,
        hostility,
        status,
        echelon: false,
        direction: false,
        altitude1: false,
        altitude2: false,
        width: false,
        grids: false,
        weapon: false,
        rangeFan: false,
        ...extra,
    };
}

// ── Named profiles ────────────────────────────────────────────────────────────

/** Shape with no user-facing label (forms of maneuver, range fans, etc.). */
const SHAPE_ONLY = f(false, false, false, false, false, false);
const SHAPE_AND_DTG = f(false, false, true, true, false, false);
/** Generic line: identifier + start/end date at both ends. */
const GENERIC_LINE = f(true, false, false, false, false, true);
const FIRE_SUPPORT_LINE = f(true, false, true, true, false, true);
/** Phase line: primary identifier at each end, no date. */
const PHASE_LINE = f(true, false, false, false, true, false);
/** Boundary: dual identifier with country codes + echelon. */
const BOUNDARY = f(true, true, false, false, true, true, {echelon: true});
/** Route control measure: identifier + direction selector. */
const ROUTE = f(true, false, false, false, false, true, {direction: true});

/** Generic area: identifier + dates. */
const NAME_FIELD_ONLY = f(true, false, false, false, false, false);
const AREA_SIMPLE = f(true, false, false, false, false, true);
const FIRE_SUPPORT_AREA = f(true, false, true, true, false, true);

/** Air corridor: identifier + dates (operationally time-bounded). */
const AIR_CORRIDOR = f(true, false, true, true, false, false,
    {width: true, altitude1: true, altitude2: true});
/**
 * Airspace coordination area / engagement zone: identifier + dates + altitude.
 * FM 1-02.2 Table 5-23 template lists T, X, X1, W, W1 only — no second
 * identifier (Field AS is not specified for engagement zones or ACAs).
 */
const AIRSPACE_COORDINATION_AREA = f(true, false, true, true, false, true,
    {width: false, altitude1: true, altitude2: true});

/**
 * Movement arrow (axis of advance, direction of attack) and retrograde task.
 * FM Table 5-9 construct examples show T (name) and W/W1 (dates).
 * FM Table 5-12 note (retrograde): "W and W1 are optional amplifiers."
 */
const MOVEMENT_ARROW = f(true, false, true, true, false, false);

/** Movement symbol with identifier only (no dates): crossing sites, convoys, etc. */
const MOV = f(true, false, false, false, false, false);

/**
 * Tactical mission task (Chapter 6).
 * FM 1-02.2 line 356: "they do not use modifiers or amplifiers."
 */
const MISSION_TASK = SHAPE_ONLY;

/**
 * Target acquisition area (Table 5-26).
 * FM template: T (identifier), AM (width/range), W, W1 (dates).
 */
const TARGET_ACQUISITION_AREA = f(true, false, true, true, false, false);

/** Area with echelon modifier (BattlePosition, StrongPoint). */
const ECH = f(true, false, false, false, false, true, {echelon: true});

// ── Registry ──────────────────────────────────────────────────────────────────

const GRAPHIC_FIELDS: Record<TacticalGraphicName, GraphicFieldSet> = {

    // region VERIFIED ------------------------------------

    // ── Phase line ─────────────────────────────────────────────────────────
    [TacticalGraphicName.PhaseLine]: PHASE_LINE,

    // ── Fire support / offensive lines ─────────────────────────────────────
    [TacticalGraphicName.ForwardEdgeOfBattleArea]: GENERIC_LINE,
    [TacticalGraphicName.ReleaseLine]: GENERIC_LINE,
    [TacticalGraphicName.BridgeheadLine]: GENERIC_LINE,
    [TacticalGraphicName.BattlefieldHandoverLine]: GENERIC_LINE,
    [TacticalGraphicName.DelayLine]: GENERIC_LINE,
    [TacticalGraphicName.FinalCoordinationLine]: GENERIC_LINE,
    [TacticalGraphicName.LimitOfAdvance]: GENERIC_LINE,
    [TacticalGraphicName.LineOfDeparture]: GENERIC_LINE,
    [TacticalGraphicName.LineOfDepartureOrLineOfContact]: GENERIC_LINE,
    [TacticalGraphicName.ProbableLineOfDeployment]: f(true, false, false, false, false, false),
    [TacticalGraphicName.IdentificationFriendOrFoeOff]: SHAPE_ONLY,
    [TacticalGraphicName.IdentificationFriendOrFoeOn]: SHAPE_ONLY,
    [TacticalGraphicName.FireSupportCoordinationLine]: FIRE_SUPPORT_LINE,
    [TacticalGraphicName.CommonSensorBoundary]: f(true, false, true, true, false, true),
    [TacticalGraphicName.RestrictiveFireLine]: FIRE_SUPPORT_LINE,
    [TacticalGraphicName.IntelligenceCoordinationLine]: f(true, false, true, true, false, true),
    [TacticalGraphicName.CoordinatedFireLine]: f(true, false, true, true, false, true),
    [TacticalGraphicName.EngineerWorkLine]: f(true, true, false, false, false, true),
    [TacticalGraphicName.MunitionFlightPath]: SHAPE_AND_DTG,

    // ── Boundary ────────────────────────────────────────────────────────────
    [TacticalGraphicName.Boundary]: BOUNDARY,

    // ── Route control measures ──────────────────────────────────────────────
    [TacticalGraphicName.Route]: ROUTE,
    [TacticalGraphicName.MainSupplyRoute]: ROUTE,
    [TacticalGraphicName.AlternateSupplyRoute]: ROUTE,

    // ── Air corridors ───────────────────────────────────────────────────────
    [TacticalGraphicName.AirCorridor]: AIR_CORRIDOR,
    [TacticalGraphicName.LowLevelTransitRoute]: AIR_CORRIDOR,
    [TacticalGraphicName.MinimumRiskRoute]: AIR_CORRIDOR,
    [TacticalGraphicName.SafeLane]: AIR_CORRIDOR,
    [TacticalGraphicName.SpecialCorridor]: AIR_CORRIDOR,
    [TacticalGraphicName.StandardUseArmyAircraftFlightRoute]: AIR_CORRIDOR,
    [TacticalGraphicName.TransitCorridor]: AIR_CORRIDOR,
    [TacticalGraphicName.UnmannedAircraftCorridor]: AIR_CORRIDOR,

    // endregion

    // ── Simple line graphics ────────────────────────────────────────────────
    [TacticalGraphicName.ForwardLineOfOwnTroops]: f(false, false, false, false, true, true),
    [TacticalGraphicName.ObstacleLine]: GENERIC_LINE,
    // Table 5-9 (direction of attack): T + W/W1 per FM construct examples.
    [TacticalGraphicName.DirectionOfMainAttack]: MOVEMENT_ARROW,
    [TacticalGraphicName.DirectionOfSupportingAttack]: f(true, false, true, true, true, true),
    [TacticalGraphicName.DirectionOfMainAttackFeint]: MOVEMENT_ARROW,
    [TacticalGraphicName.AviationDirectionOfAttack]: MOVEMENT_ARROW,
    // Mobility symbols (Table 5-16): identifier only, no hostility.
    [TacticalGraphicName.FerryCrossing]: MOV,
    [TacticalGraphicName.TacticalFix]: MOV,
    [TacticalGraphicName.TacticalTurn]: MOV,
    // Passage lane (Table 5-16): FM example shows a DTG ("at 0600 Zulu 12 FEB 2007").
    [TacticalGraphicName.PassageLane]: MOVEMENT_ARROW,
    [TacticalGraphicName.LinearTarget]: NAME_FIELD_ONLY,
    [TacticalGraphicName.FinalProtectiveFire]: f(true, true, false, false, false, false, {weapon: true}),
    [TacticalGraphicName.LinearSmokeTarget]: NAME_FIELD_ONLY,
    [TacticalGraphicName.MovingConvoy]: MOV,
    [TacticalGraphicName.HaltedConvoy]: MOV,

    // ── Shape-only lines (hardcoded label, no user input) ───────────────────
    [TacticalGraphicName.LineOfContact]: SHAPE_ONLY,
    [TacticalGraphicName.FieldsOfFire]: f(true, false, false, false, false, false),

    // ── Movement (arrow) graphics ────────────────────────────────────────────
    // Table 5-9: T (name) + W/W1 (dates) per FM construct examples.
    [TacticalGraphicName.MainAxisOfAdvance]: MOVEMENT_ARROW,
    [TacticalGraphicName.MainAxisOfAdvanceFeint]: MOVEMENT_ARROW,
    [TacticalGraphicName.SupportingAxisOfAdvance]: MOVEMENT_ARROW,
    [TacticalGraphicName.AviationAxisOfAdvance]: MOVEMENT_ARROW,
    [TacticalGraphicName.AttackHelicopterAxisOfAdvance]: MOVEMENT_ARROW,
    // Table 5-11 (attack/defense planning): identifier only.
    [TacticalGraphicName.Counterattack]: MOV,
    // Mobility / water crossing (Table 5-16): identifier only.
    [TacticalGraphicName.Bridge]: f(false, false, false, false, false, false),
    [TacticalGraphicName.Gap]: f(true, false, true, false, false, false),
    [TacticalGraphicName.AssaultCrossing]:  f(false, false, true, false, false, false),
    [TacticalGraphicName.FordEasy]: MOV,
    [TacticalGraphicName.FordDifficult]: MOV,
    [TacticalGraphicName.InfiltrationLane]: MOV,

    // ── Tactical mission tasks (Chapter 6) ───────────────────────────────────
    // FM 1-02.2 §6-2: "tactical mission task symbols … do not use modifiers or
    // amplifiers."  All confirmed Chapter 6 entries → MISSION_TASK (= SHAPE_ONLY).
    [TacticalGraphicName.TacticalBlock]: MISSION_TASK,
    [TacticalGraphicName.Breach]: MISSION_TASK,
    [TacticalGraphicName.Bypass]: MISSION_TASK,
    [TacticalGraphicName.Canalize]: MISSION_TASK,
    [TacticalGraphicName.Clear]: MISSION_TASK,
    [TacticalGraphicName.TacticalDisrupt]: MISSION_TASK,
    [TacticalGraphicName.Penetration]: MISSION_TASK,
    // Exploitation is a Chapter 5 offensive planning symbol (Table 5-10); keep identifier.
    [TacticalGraphicName.Exploitation]: SHAPE_ONLY,
    [TacticalGraphicName.AttackByFire]: MISSION_TASK,
    [TacticalGraphicName.Destroy]: MISSION_TASK,
    [TacticalGraphicName.Neutralize]: MISSION_TASK,
    [TacticalGraphicName.SupportByFire]: MISSION_TASK,
    [TacticalGraphicName.Suppress]: MISSION_TASK,
    [TacticalGraphicName.Interdict]: MISSION_TASK,
    [TacticalGraphicName.FollowAndAssume]: MISSION_TASK,
    [TacticalGraphicName.FollowAndSupport]: MISSION_TASK,

    // ── Retrograde / enabling operations (Chapter 5) ─────────────────────────
    // FM Table 5-12 note: "W and W1 are optional amplifiers" for retrograde tasks.
    [TacticalGraphicName.Delay]: SHAPE_ONLY,
    [TacticalGraphicName.Withdraw]: SHAPE_ONLY,
    [TacticalGraphicName.WithdrawUnderPressure]: SHAPE_ONLY,
    [TacticalGraphicName.Retirement]: SHAPE_ONLY,
    // Disengage appears in Table 6-1 (Ch. 6) → no amplifiers.
    [TacticalGraphicName.Disengage]: MISSION_TASK,
    // Passage of lines / relief (Table 5-13 enabling operations): identifier only.
    [TacticalGraphicName.ForwardPassageOfLines]: SHAPE_ONLY,
    [TacticalGraphicName.RearwardPassageOfLines]: SHAPE_ONLY,
    // Exfiltrate (Table 6-1, Ch. 6) → no amplifiers.
    [TacticalGraphicName.Exfiltrate]: MISSION_TASK,

    // ── Mission task bubbles ─────────────────────────────────────────────────
    // Cover, Guard, Screen are Chapter 5 security operations (Table 5-13): keep identifier.
    [TacticalGraphicName.Cover]: SHAPE_ONLY,
    [TacticalGraphicName.Guard]: SHAPE_ONLY,
    [TacticalGraphicName.Screen]: SHAPE_ONLY,
    // Confirmed Chapter 6 tasks (Table 6-1) → no amplifiers.
    [TacticalGraphicName.Secure]: MISSION_TASK,
    [TacticalGraphicName.Isolate]: MISSION_TASK,
    [TacticalGraphicName.Retain]: MISSION_TASK,
    [TacticalGraphicName.CordonAndSearch]: MISSION_TASK,
    [TacticalGraphicName.Control]: MISSION_TASK,
    [TacticalGraphicName.Contain]: MISSION_TASK,
    [TacticalGraphicName.Occupy]: MISSION_TASK,
    // Area defense is a Chapter 5 defensive planning symbol (Table 5-12): keep identifier.
    [TacticalGraphicName.AreaDefense]: f(false, false, false, false, false, false),

    // ── Forms of maneuver (no user label) ────────────────────────────────────
    [TacticalGraphicName.MovementToContact]: SHAPE_ONLY,
    [TacticalGraphicName.FrontalAttack]: SHAPE_ONLY,
    [TacticalGraphicName.TurningMovement]: SHAPE_ONLY,
    [TacticalGraphicName.Pursuit]: SHAPE_ONLY,
    [TacticalGraphicName.Envelopment]: SHAPE_ONLY,
    [TacticalGraphicName.MobileDefense]: SHAPE_ONLY,
    [TacticalGraphicName.Infiltration]: SHAPE_ONLY,
    [TacticalGraphicName.Ambush]: SHAPE_ONLY,
    [TacticalGraphicName.ReliefInPlace]: SHAPE_ONLY,

    // ── Range fans (multi-band doctrinal renderer) ──────────────────────────
    // The rangeFan flag turns on a custom editor in the dialog (bands list
    // with per-band range / altitude / label, plus left/right azimuth for
    // the sector). All other field flags stay off.
    [TacticalGraphicName.WeaponSensorRangeFanCircular]: f(false, false, false, false, false, false, {rangeFan: true}),
    [TacticalGraphicName.WeaponSensorRangeFanSector]: f(false, false, false, false, false, false, {rangeFan: true}),

    // ── Polygon area control measures ─────────────────────────────────────────
    [TacticalGraphicName.ObjectiveArea]: AREA_SIMPLE,
    [TacticalGraphicName.AttackPosition]: AREA_SIMPLE,
    [TacticalGraphicName.NamedAreaOfInterest]: AREA_SIMPLE,
    [TacticalGraphicName.TargetAreaOfInterest]: AREA_SIMPLE,
    [TacticalGraphicName.ForwardArmingAndRefuelingPoint]: AREA_SIMPLE,
    [TacticalGraphicName.AssaultPosition]: AREA_SIMPLE,
    [TacticalGraphicName.AreaOfOperations]: AREA_SIMPLE,
    [TacticalGraphicName.BaseCamp]: AREA_SIMPLE,
    [TacticalGraphicName.GuerrillaBase]: AREA_SIMPLE,
    [TacticalGraphicName.DetaineeHoldingArea]: AREA_SIMPLE,
    [TacticalGraphicName.AssemblyArea]: AREA_SIMPLE,
    [TacticalGraphicName.EngagementArea]: AREA_SIMPLE,
    [TacticalGraphicName.RefugeeHoldingArea]: AREA_SIMPLE,
    [TacticalGraphicName.BrigadeSupportArea]: AREA_SIMPLE,
    [TacticalGraphicName.DivisionSupportArea]: AREA_SIMPLE,
    [TacticalGraphicName.CorpsSupportArea]: AREA_SIMPLE,
    [TacticalGraphicName.DropZone]: AREA_SIMPLE,
    [TacticalGraphicName.LandingZone]: AREA_SIMPLE,
    [TacticalGraphicName.KillZone]: AREA_SIMPLE,
    [TacticalGraphicName.PickupZone]: AREA_SIMPLE,
    [TacticalGraphicName.Airfield]: AREA_SIMPLE,
    [TacticalGraphicName.BattlePosition]: ECH,
    [TacticalGraphicName.StrongPoint]: f(true, false, false, false, false, false, {echelon: true}),
    [TacticalGraphicName.FreeFireAreaIrregular]: FIRE_SUPPORT_AREA,
    [TacticalGraphicName.FreeFireAreaRectangular]: FIRE_SUPPORT_AREA,
    [TacticalGraphicName.FreeFireAreaCircular]: FIRE_SUPPORT_AREA,
    [TacticalGraphicName.NoFireAreaIrregular]: FIRE_SUPPORT_AREA,
    [TacticalGraphicName.NoFireAreaRectangular]: FIRE_SUPPORT_AREA,
    [TacticalGraphicName.NoFireAreaCircular]: FIRE_SUPPORT_AREA,
    [TacticalGraphicName.RestrictiveFireAreaIrregular]: FIRE_SUPPORT_AREA,
    [TacticalGraphicName.RestrictiveFireAreaRectangular]: FIRE_SUPPORT_AREA,
    [TacticalGraphicName.RestrictiveFireAreaCircular]: FIRE_SUPPORT_AREA,
    // Table 5-24 (fire support coordination): para 5-42 requires T and W/W1.
    [TacticalGraphicName.PositionAreaArtilleryIrregular]: FIRE_SUPPORT_AREA,
    [TacticalGraphicName.PositionAreaArtilleryRectangular]: FIRE_SUPPORT_AREA,
    [TacticalGraphicName.PositionAreaArtilleryCircular]: FIRE_SUPPORT_AREA,
    // Table 5-26 template: T, AM (width), W, W1.
    [TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.ArtilleryTargetIntelligenceZoneRectangular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.CallForFireZoneIrregular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.CallForFireZoneRectangular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.CallForFireZoneCircular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.CensorZoneIrregular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.CensorZoneRectangular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.CensorZoneCircular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.CriticalFriendlyZoneIrregular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.CriticalFriendlyZoneRectangular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.CriticalFriendlyZoneCircular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.DeadSpaceAreaIrregular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.DeadSpaceAreaRectangular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.DeadSpaceAreaCircular]: TARGET_ACQUISITION_AREA,
    // Table 5-26 kill boxes: same template as target acquisition areas.
    [TacticalGraphicName.BlueKillBoxIrregular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.BlueKillBoxRectangular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.BlueKillBoxCircular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.PurpleKillBoxIrregular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.PurpleKillBoxRectangular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.PurpleKillBoxCircular]: TARGET_ACQUISITION_AREA,
    // Table 5-25 (fire support / target areas): all variants should match.
    [TacticalGraphicName.FireSupportAreaIrregular]: f(true, false, true, true, false, false),
    [TacticalGraphicName.FireSupportAreaRectangular]: f(true, false, true, true, false, false),
    [TacticalGraphicName.FireSupportAreaCircular]: f(true, false, true, true, false, false),
    [TacticalGraphicName.TargetAreaIrregular]: NAME_FIELD_ONLY,
    [TacticalGraphicName.TargetAreaRectangular]: NAME_FIELD_ONLY,
    [TacticalGraphicName.TargetAreaCircular]: NAME_FIELD_ONLY,
    [TacticalGraphicName.HighDensityAirspaceControlZone]: AIRSPACE_COORDINATION_AREA,
    [TacticalGraphicName.RestrictedOperationsZone]: AIRSPACE_COORDINATION_AREA,
    [TacticalGraphicName.AirToAirRefuelingRestrictedOperationsZone]: AIRSPACE_COORDINATION_AREA,
    [TacticalGraphicName.UnmannedAircraftRestrictedOperationsZone]: AIRSPACE_COORDINATION_AREA,
    [TacticalGraphicName.WeaponEngagementZone]: AIRSPACE_COORDINATION_AREA,
    [TacticalGraphicName.JointEngagementZone]: AIRSPACE_COORDINATION_AREA,
    [TacticalGraphicName.MissileEngagementZone]: AIRSPACE_COORDINATION_AREA,
    [TacticalGraphicName.LowAltitudeMissileEngagementZone]: AIRSPACE_COORDINATION_AREA,
    [TacticalGraphicName.HighAltitudeMissileEngagementZone]: AIRSPACE_COORDINATION_AREA,
    [TacticalGraphicName.ShortRangeAirDefenseEngagementZone]: AIRSPACE_COORDINATION_AREA,
    [TacticalGraphicName.WeaponsFreeZone]: AIRSPACE_COORDINATION_AREA,
    [TacticalGraphicName.AirSpaceCoordinationAreaIrregular]: f(true, false, true, true, false, true,
        {width: false, altitude1: true, altitude2: true, grids: true}),
    [TacticalGraphicName.AirSpaceCoordinationAreaRectangular]: f(true, false, true, true, false, true,
        {width: false, altitude1: true, altitude2: true, grids: true}),
    [TacticalGraphicName.AirSpaceCoordinationAreaCircular]: f(true, false, true, true, false, true,
        {width: false, altitude1: true, altitude2: true, grids: true}),
    [TacticalGraphicName.Encirclement]: f(true, false, false, false, true, false),
    [TacticalGraphicName.UnexplodedExplosiveOrdnanceArea]: NAME_FIELD_ONLY,
    [TacticalGraphicName.FortifiedArea]: NAME_FIELD_ONLY,
    [TacticalGraphicName.AirheadLine]: NAME_FIELD_ONLY,
    [TacticalGraphicName.ObstacleBelt]: NAME_FIELD_ONLY,
    [TacticalGraphicName.ObstacleZone]: NAME_FIELD_ONLY,
    [TacticalGraphicName.ObstacleGroup]: NAME_FIELD_ONLY,
    [TacticalGraphicName.ObstacleFreeArea]: NAME_FIELD_ONLY,
    [TacticalGraphicName.ObstacleRestrictedArea]: NAME_FIELD_ONLY,
    [TacticalGraphicName.LimitedAccessArea]: f(true, false, true, true, false, false),
    [TacticalGraphicName.SmokeObscurant]: f(true, false, true, true, false, true),
    [TacticalGraphicName.GroupOrSeriesOfTargets]: NAME_FIELD_ONLY,

    // ── Field fortification ────────────────────────────────────────────────
    // FightingPosition: only rotation + size are user-editable; no labels.
    [TacticalGraphicName.FightingPosition]: SHAPE_ONLY,
    [TacticalGraphicName.FortifiedLine]: SHAPE_ONLY,

    [TacticalGraphicName.BaseDefenseZone]: SHAPE_ONLY,
};

// ── Public accessor ───────────────────────────────────────────────────────────

export function getGraphicFields(name: TacticalGraphicName): GraphicFieldSet {
    return GRAPHIC_FIELDS[name] ?? f(true, false, false, false, false, false);
}
