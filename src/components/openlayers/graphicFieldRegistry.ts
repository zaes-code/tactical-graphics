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

import {TacticalGraphicName, hasRadiusReadout, supportsHostility} from '@zaes/tactical-graphics';

// ── Public type ───────────────────────────────────────────────────────────────

export type GraphicFieldSet = {
    /** Primary name / identifier shown on the graphic (labels.label). */
    identifier1: boolean;
    /** Second identifier + country codes (Boundary, ACA unit name). */
    identifier2: boolean;
    /**
     * Field H — additional information, where the plate sets it *beside* the designation
     * rather than instead of it. @see TacticalGraphicProperties.additionalInfo
     */
    additionalInfo: boolean;
    /** Start date/time (labels.startDate). */
    dtg1: boolean;
    /** End date/time (labels.endDate). */
    dtg2: boolean;
    hostility: boolean;
    /** Confidence — always shown conditionally when hostility = hostile/faker; no separate flag needed. */
    status: boolean;
    /** Echelon selector (BattlePosition, StrongPoint, Boundary). */
    echelon: boolean;
    /** Mine-type selector (the two mine areas). @see TacticalGraphicMineType */
    mineType: boolean;
    /**
     * Sector 1 mobility selector -- APP-06 Table 8-24's `MOBILITY` category.
     *
     * Three graphics, because the table's Remarks column names three: limited access
     * area, restricted terrain, severely restricted terrain. @see TacticalGraphicMobility
     */
    mobility: boolean;
    /**
     * Sector 2 terrain selector -- APP-06 Table 8-25. The restricted-terrain pair only;
     * the limited access area's Template has no box for one. @see TacticalGraphicTerrain
     */
    terrain: boolean;
    /** Route direction selector (Route / MSR / ASR). */
    direction: boolean;
    /** Min altitude inputs (airspace graphics). */
    altitude1: boolean;
    /** Max altitude inputs (airspace graphics). */
    altitude2: boolean;
    /** Width field (Airspace Area). */
    width: boolean;
    /** Rectangle length in meters — only the rectangular target carries one. */
    length: boolean;
    /** Circle radius in meters — the graphics a user resizes by a radius. */
    radius: boolean;
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
    status: boolean,
    extra: Partial<Pick<GraphicFieldSet, 'additionalInfo' | 'echelon' | 'mineType' | 'mobility' | 'terrain' | 'direction' | 'altitude1' | 'altitude2' | 'width' | 'length' | 'radius' | 'grids' | 'weapon' | 'rangeFan' >> = {},
): GraphicFieldSet {
    return {
        identifier1,
        identifier2,
        additionalInfo: false,
        dtg1,
        dtg2,
        // Not a per-graphic choice — see supportsHostility(). getGraphicFields
        // overwrites this; the value here is only a placeholder for the type.
        hostility: false,
        status,
        echelon: false,
        mineType: false,
        mobility: false,
        terrain: false,
        direction: false,
        altitude1: false,
        altitude2: false,
        width: false,
        length: false,
        radius: false,
        grids: false,
        weapon: false,
        rangeFan: false,
        ...extra,
    };
}

// ── Named profiles ────────────────────────────────────────────────────────────

/** Shape with no user-facing label (forms of maneuver, range fans, etc.). */
const SHAPE_ONLY = f(false, false, false, false, false);
const SHAPE_AND_DTG = f(false, false, true, true, false);
/** The plain lines that carry a designation and a status, and no dates. */
const GENERIC_LINE = f(true, false, false, false, true);

/**
 * Line, generic (APP-06 110400): the designation and the date-time group, both ends.
 *
 * Its Template sets **T** above each end of the line and **W - W1** below each, which is
 * exactly what `defaultLinePaint` already draws — the fields were simply not offered, so a
 * user could see the shape and never fill in the only two amplifiers it has. The status is
 * not among them.
 */
const LINE_GENERIC = f(true, false, true, true, false);

/**
 * Obstacle line: identifier only.
 *
 * No status. `obstacleLineStyleFunc` never reads it — the graphic has no planned form to
 * dash — so offering the control put a setting in the dialog that changed nothing on the
 * map, which is the same trap "Label Plate" was.
 */
const OBSTACLE_LINE = f(true, false, false, false, false);
/** The two mine areas: free text plus the Table 8-24 mine type drawn inside. */
const MINE_AREA = f(true, false, true, true, false, {mineType: true});

/**
 * Restricted terrain and severely restricted terrain (APP-06 152400, 152500).
 *
 * Sector 1, Sector 2 and field H -- and **nothing else**, which is the whole Template.
 * There is no `T` box, no status form, and no identity: the pair describe ground, so they
 * are exempt in `supportsHostility` and `getGraphicFields` clears the flag anyway. The
 * plate's note is explicit about H: *"Field H must be displayed and contain the cause of
 * the restriction."*
 */
const SECTOR_MODIFIER_TERRAIN = f(false, false, false, false, false, {
    mobility: true,
    terrain: true,
    additionalInfo: true,
});

/**
 * Limited access area (APP-06 151100, FM 1-02.2 table 5-5).
 *
 * Sector 1 and field H. The two standards draw the same symbol with *different* amplifiers
 * under the Sector 1 box -- APP-06 sets field H there and FM sets `W - W1` -- and the
 * graphic follows APP-06: one box, one field, rather than a stack carrying both readings
 * of the same box. (User's call, 2026-08-26.)
 *
 * No designation either: the `LAA` above the modifier is the symbol's own literal, printed
 * by both plates, not something a user types.
 */
const LIMITED_ACCESS_AREA = f(false, false, false, false, false, {
    mobility: true,
    additionalInfo: true,
});
/**
 * Decision line: the designation, and nothing else.
 *
 * APP-06 110500 writes the end-of-line information as `T/AS` and the Example renders it
 * `1X/007`, so the paint still joins two fields with a slash when both are set. The dialog
 * offers only the first: the second half is not something this program's operators fill in,
 * and a control nobody uses is a control that gets filled in by accident. Setting
 * `secondId` on a restored or imported graphic still draws it. (User's call, 2026-08-25.)
 */
const DECISION_LINE = f(true, false, false, false, false);
/** Mobility corridor: free text plus the echelon its own note makes mandatory. */
const MOBILITY_CORRIDOR = f(true, false, false, false, false, {echelon: true});
const FIRE_SUPPORT_LINE = f(true, false, true, true, true);
/** Phase line: primary identifier at each end, no date. */
const PHASE_LINE = f(true, false, false, false, false);
/** Boundary: dual identifier with country codes + echelon. */
const BOUNDARY = f(true, true, false, false, true, {echelon: true});
/** Route control measure: identifier + direction selector. */
const ROUTE = f(true, false, false, false, true, {direction: true});

/** Generic area: identifier + dates. */
const NAME_FIELD_ONLY = f(true, false, false, false, false);

/**
 * The action areas — JTAA, SAA and SGAA (APP-06 150501-150503).
 *
 * One Template serves all three: the literal and **T** on the first line, **W - W1** on
 * the second, and an `N` at the area's west and east edges when it is hostile. So the
 * fields are the designation and the two dates; the N is not an input, it is the
 * affiliation.
 */
const ACTION_AREA = f(true, false, true, true, false);

/**
 * Area, generic (120700): the same block with **H beside T** on the first line.
 */
const AREA_GENERIC = f(true, false, true, true, false, {additionalInfo: true});

/** The airfield zone (120400) carries field H and nothing else. */
const AIRFIELD_ZONE = f(false, false, false, false, false, {additionalInfo: true});

/** Human terrain (370100): the literal `HT` with H under it. No designation. */
const HUMAN_TERRAIN = f(false, false, false, false, false, {additionalInfo: true});

/** The PsyOps zones: H over T beside the speaker, and W - W1 outside the upper left. */
const PSYOPS_ZONE = f(true, false, true, true, false, {additionalInfo: true});

/**
 * Obstacle free / restricted area: T over W - W1, inside the toothed ring.
 * Both are time-bounded by definition — an obstacle restriction is imposed for a
 * period — so the two DTGs are part of the symbol rather than an optional extra.
 */
const OBSTACLE_AREA = f(true, false, true, true, false);
const AREA_SIMPLE = f(true, false, false, false, true);
const FIRE_SUPPORT_AREA = f(true, false, true, true, true);

/** Air corridor: identifier + dates (operationally time-bounded). */
const AIR_CORRIDOR = f(true, false, true, true, false,
    {width: true, altitude1: true, altitude2: true});
/**
 * Airspace coordination area / engagement zone: identifier + dates + altitude.
 * FM 1-02.2 Table 5-23 template lists T, X, X1, W, W1 only — no second
 * identifier (Field AS is not specified for engagement zones or ACAs).
 */
const AIRSPACE_COORDINATION_AREA = f(true, false, true, true, true,
    {width: false, altitude1: true, altitude2: true});

/**
 * Movement arrow (axis of advance, direction of attack) and retrograde task.
 * FM Table 5-9 construct examples show T (name) and W/W1 (dates).
 * FM Table 5-12 note (retrograde): "W and W1 are optional amplifiers."
 */
const MOVEMENT_ARROW = f(true, false, true, true, false);

/** Movement symbol with identifier only (no dates): crossing sites, convoys, etc. */
const MOV = f(true, false, false, false, false);

/**
 * Avenue of approach (APP-06 152300): the designation, and **no date-time group**.
 *
 * Its Template carries `AA` with field `T` beside it, a field `H` set apart from the arrow,
 * and field `N` twice down the tail. There is no `W` or `W1` anywhere on it — the graphic
 * had been sharing `MOVEMENT_ARROW`, which offers both, because it is built from the same
 * arrow as the axes of advance. (User's call, 2026-08-27.)
 *
 * Field H is *not* offered yet: the plate's note says it "should be movable to avoid
 * obscuring key geographic information", and a movable amplifier is a placement decision
 * rather than a flag. Field N is per-vertex, which this schema does not express.
 */
const AVENUE_OF_APPROACH = f(true, false, false, false, false);

/**
 * Tactical mission task (Chapter 6).
 * FM 1-02.2 line 356: "they do not use modifiers or amplifiers."
 */
const MISSION_TASK = SHAPE_ONLY;

/**
 * Target acquisition area (Table 5-26).
 * FM template: T (identifier), AM (width/range), W, W1 (dates).
 */
const TARGET_ACQUISITION_AREA = f(true, false, true, true, false);

/** Area with echelon modifier (BattlePosition, StrongPoint). */
const ECH = f(true, false, false, false, true, {echelon: true});

/**
 * The 13 rectangular zones carry a **width in meters** on top of their family's
 * amplifiers. FM 1-02.2 table 5-24 draws it as an `AM` arrow down the edge labelled
 * "Width (M)", and APP-06 states it in words. It is an input rather than a printed
 * label: FM's own construct examples show only the designation and the DTGs.
 *
 * Spread onto each entry rather than added to `FIRE_SUPPORT_AREA` /
 * `TARGET_ACQUISITION_AREA`, because those constants are shared with the circular and
 * irregular variants — a circle takes a radius and an irregular area takes neither.
 * @see AreaGraphicBase, ai/app-6.md "F2"
 */

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
    [TacticalGraphicName.ProbableLineOfDeployment]: f(true, false, false, false, false),
    [TacticalGraphicName.IdentificationFriendOrFoeOff]: SHAPE_ONLY,
    [TacticalGraphicName.IdentificationFriendOrFoeOn]: SHAPE_ONLY,
    [TacticalGraphicName.FireSupportCoordinationLine]: FIRE_SUPPORT_LINE,
    [TacticalGraphicName.CommonSensorBoundary]: f(true, false, true, true, true),
    [TacticalGraphicName.LightLine]: GENERIC_LINE,
    [TacticalGraphicName.LineGeneric]: LINE_GENERIC,
    [TacticalGraphicName.HandoverLine]: GENERIC_LINE,
    [TacticalGraphicName.NamedAreaOfInterestLine]: GENERIC_LINE,
    [TacticalGraphicName.HoldingLine]: GENERIC_LINE,
    [TacticalGraphicName.NoFireLine]: FIRE_SUPPORT_LINE,
    [TacticalGraphicName.BattlefieldCoordinationLine]: FIRE_SUPPORT_LINE,
    [TacticalGraphicName.RestrictiveFireLine]: FIRE_SUPPORT_LINE,
    [TacticalGraphicName.IntelligenceCoordinationLine]: f(true, false, true, true, true),
    [TacticalGraphicName.CoordinatedFireLine]: f(true, false, true, true, true),
    [TacticalGraphicName.EngineerWorkLine]: f(true, true, false, false, true),
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
    [TacticalGraphicName.ForwardLineOfOwnTroops]: f(false, false, false, false, true),
    [TacticalGraphicName.ObstacleLine]: OBSTACLE_LINE,
    // Only the mineline takes a modifier; the other four carry no amplifier at all.
    // The decision line's two fields are drawn as `T/AS`, joined by a slash.
    // The letter is the symbol; field A is a host-injected unit symbol, not a text input.
    [TacticalGraphicName.Capture]: SHAPE_ONLY,
    // Escort's own amplifier is field A, a host-injected unit symbol, not text.
    [TacticalGraphicName.Escort]: SHAPE_ONLY,
    // `DEM` is the symbol's own literal, printed by the plate, and 343300 names no other
    // amplifier. A designation typed here had nowhere doctrinal to go. (User's call,
    // 2026-08-27.) The paint still appends one on a restored or imported graphic.
    [TacticalGraphicName.Demonstration]: SHAPE_ONLY,
    [TacticalGraphicName.Evacuate]: SHAPE_ONLY,
    [TacticalGraphicName.Recover]: SHAPE_ONLY,
    [TacticalGraphicName.DecisionLine]: DECISION_LINE,
    // Field B (echelon) is mandatory on a mobility corridor; field H is the free text.
    [TacticalGraphicName.MobilityCorridor]: MOBILITY_CORRIDOR,
    // The numbers 1 and 2 are the symbol, not an amplifier the operator sets.
    [TacticalGraphicName.MinimumSafeDistanceZone]: SHAPE_ONLY,
    [TacticalGraphicName.MinimumSafeDistanceMultipleStrike]: SHAPE_ONLY,
    // The dose the operator typed goes in the break: "30 CGH".
    [TacticalGraphicName.RadiationDoseRateContourLine]: NAME_FIELD_ONLY,
    // Free text plus the mine type the area is filled with.
    [TacticalGraphicName.MinefieldDynamicDepiction]: MINE_AREA,
    [TacticalGraphicName.MinedAreaFenced]: MINE_AREA,
    [TacticalGraphicName.PsyOpsZoneIrregular]: PSYOPS_ZONE,
    // Every rectangular variant offers the across-dimension as a typed field.
    [TacticalGraphicName.PsyOpsZoneRectangular]: {...PSYOPS_ZONE, width: true},
    [TacticalGraphicName.PsyOpsZoneCircular]: PSYOPS_ZONE,
    [TacticalGraphicName.ObstacleBypassEasy]: SHAPE_ONLY,
    [TacticalGraphicName.ObstacleBypassDifficult]: SHAPE_ONLY,
    [TacticalGraphicName.ObstacleBypassImpossible]: SHAPE_ONLY,
    [TacticalGraphicName.Mineline]: OBSTACLE_LINE,
    [TacticalGraphicName.MineCluster]: SHAPE_ONLY,
    [TacticalGraphicName.TripWire]: SHAPE_ONLY,
    [TacticalGraphicName.RaftSite]: SHAPE_ONLY,
    [TacticalGraphicName.FortifiedPosition]: SHAPE_ONLY,
    // Table 5-9 (direction of attack): T + W/W1 per FM construct examples.
    [TacticalGraphicName.DirectionOfMainAttack]: MOVEMENT_ARROW,
    [TacticalGraphicName.DirectionOfSupportingAttack]: f(true, false, true, true, true),
    [TacticalGraphicName.DirectionOfMainAttackFeint]: MOVEMENT_ARROW,
    [TacticalGraphicName.AviationDirectionOfAttack]: MOVEMENT_ARROW,
    // Mobility symbols (Table 5-16). The water-crossing set — bridge, ford easy,
    // ford difficult, ferry crossing, passage lane — carries no name: the FM plates
    // show the site symbol and a DTG, never an identifier, so the shape plus its
    // date is the whole amplifier set.
    [TacticalGraphicName.FerryCrossing]: SHAPE_ONLY,
    // Passage lane (Table 5-16): FM example shows a DTG ("at 0600 Zulu 12 FEB 2007").
    [TacticalGraphicName.PassageLane]: SHAPE_AND_DTG,
    [TacticalGraphicName.LinearTarget]: NAME_FIELD_ONLY,
    [TacticalGraphicName.FinalProtectiveFire]: f(true, true, false, false, false, {weapon: true}),
    [TacticalGraphicName.LinearSmokeTarget]: NAME_FIELD_ONLY,
    // Excluded — see ai/excluded-graphics.md
    // [TacticalGraphicName.MovingConvoy]: MOV,
    // [TacticalGraphicName.HaltedConvoy]: MOV,

    // ── Shape-only lines (hardcoded label, no user input) ───────────────────
    [TacticalGraphicName.LineOfContact]: SHAPE_ONLY,
    [TacticalGraphicName.FieldsOfFire]: f(true, false, false, false, false),

    // ── Movement (arrow) graphics ────────────────────────────────────────────
    // Table 5-9: T (name) + W/W1 (dates) per FM construct examples.
    [TacticalGraphicName.AvenueOfApproach]: AVENUE_OF_APPROACH,
    [TacticalGraphicName.MainAxisOfAdvance]: MOVEMENT_ARROW,
    [TacticalGraphicName.MainAxisOfAdvanceFeint]: MOVEMENT_ARROW,
    [TacticalGraphicName.SupportingAxisOfAdvance]: MOVEMENT_ARROW,
    [TacticalGraphicName.AviationAxisOfAdvance]: MOVEMENT_ARROW,
    [TacticalGraphicName.AttackHelicopterAxisOfAdvance]: MOVEMENT_ARROW,
    // Table 5-11 (attack/defense planning): identifier only.
    [TacticalGraphicName.Counterattack]: MOV,
    [TacticalGraphicName.CounterattackByFire]: MOV,
    // Mobility / water crossing (Table 5-16) — see the FerryCrossing note above:
    // the crossing-site symbols carry no name.
    [TacticalGraphicName.Bridge]: SHAPE_ONLY,
    [TacticalGraphicName.Gap]: f(true, false, true, false, false),
    [TacticalGraphicName.AssaultCrossing]:  f(false, false, true, false, false),
    [TacticalGraphicName.FordEasy]: SHAPE_ONLY,
    [TacticalGraphicName.FordDifficult]: SHAPE_ONLY,
    [TacticalGraphicName.InfiltrationLane]: MOV,

    // ── Countermobility obstacle effects (FM 1-02.2 table 5-19) ──────────────
    // Chapter 5 by category, but drawn as exact copies of the Chapter 6 mission
    // tasks they twin, letter aside. Shape-only for the same reason those two
    // moved off MOV: none of blockStyleFunc / clearStyleFunc / tacticalFixStyleFunc /
    // turnStyleFunc reads an amplifier, so any field here would be inert.
    [TacticalGraphicName.Block]: SHAPE_ONLY,
    [TacticalGraphicName.Disrupt]: SHAPE_ONLY,
    [TacticalGraphicName.Fix]: SHAPE_ONLY,
    [TacticalGraphicName.Turn]: SHAPE_ONLY,

    // ── Tactical mission tasks (Chapter 6) ───────────────────────────────────
    // FM 1-02.2 §6-2: "tactical mission task symbols … do not use modifiers or
    // amplifiers."  All confirmed Chapter 6 entries → MISSION_TASK (= SHAPE_ONLY).
    [TacticalGraphicName.TacticalBlock]: MISSION_TASK,
    [TacticalGraphicName.Breach]: MISSION_TASK,
    [TacticalGraphicName.Bypass]: MISSION_TASK,
    [TacticalGraphicName.Canalize]: MISSION_TASK,
    [TacticalGraphicName.Clear]: MISSION_TASK,
    [TacticalGraphicName.TacticalDisrupt]: MISSION_TASK,
    // These two sat on MOV, which switched on an identifier that nothing draws:
    // tacticalFixStyleFunc and getMissionTaskStyleFn render the doctrinal letter
    // and the line work, never labels.label. It was a dialog input that changed
    // nothing on the map — the trap the OBSTACLE_LINE note below describes — and
    // it disagreed with their two siblings directly above.
    [TacticalGraphicName.TacticalFix]: MISSION_TASK,
    [TacticalGraphicName.TacticalTurn]: MISSION_TASK,
    [TacticalGraphicName.Penetration]: MISSION_TASK,
    // Exploitation is a Chapter 5 offensive planning symbol (Table 5-10); keep identifier.
    [TacticalGraphicName.Exploitation]: SHAPE_ONLY,
    [TacticalGraphicName.AttackByFire]: MISSION_TASK,
    [TacticalGraphicName.Destroy]: MISSION_TASK,
    [TacticalGraphicName.Neutralize]: MISSION_TASK,
    [TacticalGraphicName.SupportByFire]: MISSION_TASK,
    [TacticalGraphicName.Suppress]: MISSION_TASK,
    [TacticalGraphicName.Interdict]: MISSION_TASK,
    // Excluded — see ai/excluded-graphics.md
    // [TacticalGraphicName.FollowAndAssume]: MISSION_TASK,
    // [TacticalGraphicName.FollowAndSupport]: MISSION_TASK,

    // ── Retrograde / enabling operations (Chapter 5) ─────────────────────────
    // FM Table 5-12 note: "W and W1 are optional amplifiers" for retrograde tasks.
    [TacticalGraphicName.Abatis]: SHAPE_ONLY,
    // Affiliation only; getGraphicFields derives hostility from supportsHostility().
    [TacticalGraphicName.ExplosivesPlannedStateOfReadiness]: SHAPE_ONLY,
    [TacticalGraphicName.ExplosivesStateOfReadiness1Safe]: SHAPE_ONLY,
    [TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable]: SHAPE_ONLY,
    [TacticalGraphicName.RoadblockCompleteExecuted]: SHAPE_ONLY,
    [TacticalGraphicName.AntiTankDitchUnderConstruction]: SHAPE_ONLY,
    [TacticalGraphicName.AntiTankDitchCompleted]: SHAPE_ONLY,
    [TacticalGraphicName.AntiTankDitchReinforcedWithMines]: SHAPE_ONLY,
    // The wire obstacles: no identifier, no dates, and no status - none of them has a
    // planned form to dash, so offering the control would put a setting in the dialog that
    // changes nothing on the map. Hostility is not declared here at all; getGraphicFields
    // derives it from supportsHostility(), and these qualify by not being mission tasks.
    [TacticalGraphicName.WireUnspecified]: SHAPE_ONLY,
    [TacticalGraphicName.WireSingleFence]: SHAPE_ONLY,
    [TacticalGraphicName.WireDoubleFence]: SHAPE_ONLY,
    [TacticalGraphicName.WireDoubleApronFence]: SHAPE_ONLY,
    [TacticalGraphicName.WireLowWireFence]: SHAPE_ONLY,
    [TacticalGraphicName.WireHighWireFence]: SHAPE_ONLY,
    [TacticalGraphicName.WireSingleConcertina]: SHAPE_ONLY,
    [TacticalGraphicName.WireDoubleStrandConcertina]: SHAPE_ONLY,
    [TacticalGraphicName.WireTripleStrandConcertina]: SHAPE_ONLY,
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
    // Hostility and nothing else, like its twin: 343700's Template carries `EX` and no
    // amplifier box at all. (User's call, 2026-08-27.)
    [TacticalGraphicName.Exfiltrate]: SHAPE_ONLY,

    // ── Mission task bubbles ─────────────────────────────────────────────────
    // Cover, Guard, Screen are Chapter 5 security operations (Table 5-13): keep identifier.
    [TacticalGraphicName.Cover]: SHAPE_ONLY,
    [TacticalGraphicName.Guard]: SHAPE_ONLY,
    [TacticalGraphicName.Screen]: SHAPE_ONLY,
    // Confirmed Chapter 6 tasks (Table 6-1) → no amplifiers.
    [TacticalGraphicName.Secure]: MISSION_TASK,
    [TacticalGraphicName.Isolate]: MISSION_TASK,
    [TacticalGraphicName.Retain]: MISSION_TASK,
    [TacticalGraphicName.CordonAndKnock]: MISSION_TASK,
    [TacticalGraphicName.Deny]: MISSION_TASK,
    [TacticalGraphicName.Locate]: MISSION_TASK,
    [TacticalGraphicName.CordonAndSearch]: MISSION_TASK,
    [TacticalGraphicName.Control]: MISSION_TASK,
    [TacticalGraphicName.Contain]: MISSION_TASK,
    [TacticalGraphicName.Occupy]: MISSION_TASK,
    // Area defense is a Chapter 5 defensive planning symbol (Table 5-12): keep identifier.
    [TacticalGraphicName.AreaDefense]: f(false, false, false, false, false),

    // ── Forms of maneuver (no user label) ────────────────────────────────────
    [TacticalGraphicName.MovementToContact]: SHAPE_ONLY,
    // APP-06 342900's template carries three amplifier boxes -- T over the body and
    // W . W1 inside it -- so unlike FM's badge this one takes a designation and a
    // date-time range. @see FM 1-02.2 table 5-2 for what the letters mean.
    [TacticalGraphicName.AdvanceToContact]: MOVEMENT_ARROW,
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
    [TacticalGraphicName.WeaponSensorRangeFanCircular]: f(false, false, false, false, false, {rangeFan: true}),
    [TacticalGraphicName.WeaponSensorRangeFanSector]: f(false, false, false, false, false, {rangeFan: true}),

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
    [TacticalGraphicName.BombArea]: AREA_SIMPLE,
    [TacticalGraphicName.TerminallyGuidedMunitionFootprint]: AREA_SIMPLE,
    [TacticalGraphicName.Bridgehead]: AREA_SIMPLE,
    [TacticalGraphicName.EnemyPrisonerOfWarHoldingArea]: AREA_SIMPLE,
    [TacticalGraphicName.HumanTerrain]: HUMAN_TERRAIN,
    // **Neither carries an amplifier.** 151900's and 150100's Templates are a bare closed
    // outline: no T, no H, no dates, nothing. A name field on them offered the operator a
    // label the symbol has nowhere to put.
    [TacticalGraphicName.PenetrationBox]: SHAPE_ONLY,
    [TacticalGraphicName.Area]: SHAPE_ONLY,
    [TacticalGraphicName.JointTacticalActionArea]: ACTION_AREA,
    [TacticalGraphicName.SubmarineActionArea]: ACTION_AREA,
    [TacticalGraphicName.SubmarineGeneratedActionArea]: ACTION_AREA,
    [TacticalGraphicName.AreaGeneric]: AREA_GENERIC,
    [TacticalGraphicName.ZoneOfFire]: AREA_SIMPLE,
    [TacticalGraphicName.RestrictedTerrain]: SECTOR_MODIFIER_TERRAIN,
    [TacticalGraphicName.SeverelyRestrictedTerrain]: SECTOR_MODIFIER_TERRAIN,
    // The four contaminated areas carry no amplifier either: 271700, 271800, 271900 and
    // 272000 are the hatched area, the inverted triangle and the letter that names the
    // hazard. Everything a reader needs is in the glyph.
    [TacticalGraphicName.BiologicalContaminatedArea]: SHAPE_ONLY,
    [TacticalGraphicName.BiologicalContaminatedAreaToxicIndustrialMaterial]: SHAPE_ONLY,
    [TacticalGraphicName.ChemicalContaminatedAreaToxicIndustrialMaterial]: SHAPE_ONLY,
    [TacticalGraphicName.RadiologicalContaminatedAreaToxicIndustrialMaterial]: SHAPE_ONLY,
    [TacticalGraphicName.ChemicalContaminatedArea]: SHAPE_ONLY,
    [TacticalGraphicName.NuclearContaminatedArea]: SHAPE_ONLY,
    [TacticalGraphicName.RadiologicalContaminatedArea]: SHAPE_ONLY,
    [TacticalGraphicName.ArtilleryManeuverArea]: {...(TARGET_ACQUISITION_AREA)},
    [TacticalGraphicName.ArtilleryReservedArea]: {...(TARGET_ACQUISITION_AREA)},
    [TacticalGraphicName.AssemblyArea]: AREA_SIMPLE,
    [TacticalGraphicName.EngagementArea]: AREA_SIMPLE,
    [TacticalGraphicName.RefugeeHoldingArea]: AREA_SIMPLE,
    [TacticalGraphicName.BrigadeSupportArea]: AREA_SIMPLE,
    [TacticalGraphicName.DivisionSupportArea]: AREA_SIMPLE,
    [TacticalGraphicName.CorpsSupportArea]: AREA_SIMPLE,
    [TacticalGraphicName.FighterEngagementZone]: AIRSPACE_COORDINATION_AREA,
    [TacticalGraphicName.ExtractionZone]: AREA_SIMPLE,
    [TacticalGraphicName.RegimentalSupportArea]: AREA_SIMPLE,
    [TacticalGraphicName.DropZone]: AREA_SIMPLE,
    [TacticalGraphicName.LandingZone]: AREA_SIMPLE,
    [TacticalGraphicName.KillZone]: AREA_SIMPLE,
    [TacticalGraphicName.PickupZone]: AREA_SIMPLE,
    [TacticalGraphicName.AirfieldZone]: AIRFIELD_ZONE,
    [TacticalGraphicName.Airfield]: NAME_FIELD_ONLY,
    [TacticalGraphicName.BattlePosition]: ECH,
    [TacticalGraphicName.BattlePositionPreparedButNotOccupied]: ECH,
    [TacticalGraphicName.StrongPoint]: f(true, false, false, false, false, {echelon: true}),
    [TacticalGraphicName.FreeFireAreaIrregular]: FIRE_SUPPORT_AREA,
    [TacticalGraphicName.FreeFireAreaRectangular]: {...(FIRE_SUPPORT_AREA), width: true},
    [TacticalGraphicName.FreeFireAreaCircular]: FIRE_SUPPORT_AREA,
    [TacticalGraphicName.NoFireAreaIrregular]: FIRE_SUPPORT_AREA,
    [TacticalGraphicName.NoFireAreaRectangular]: {...(FIRE_SUPPORT_AREA), width: true},
    [TacticalGraphicName.NoFireAreaCircular]: FIRE_SUPPORT_AREA,
    [TacticalGraphicName.RestrictiveFireAreaIrregular]: FIRE_SUPPORT_AREA,
    [TacticalGraphicName.RestrictiveFireAreaRectangular]: {...(FIRE_SUPPORT_AREA), width: true},
    [TacticalGraphicName.RestrictiveFireAreaCircular]: FIRE_SUPPORT_AREA,
    // Table 5-24 (fire support coordination): para 5-42 requires T and W/W1.
    [TacticalGraphicName.PositionAreaArtilleryIrregular]: FIRE_SUPPORT_AREA,
    [TacticalGraphicName.PositionAreaArtilleryRectangular]: {...(FIRE_SUPPORT_AREA), width: true},
    [TacticalGraphicName.PositionAreaArtilleryCircular]: FIRE_SUPPORT_AREA,
    // Table 5-26 template: T, AM (width), W, W1.
    [TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.ArtilleryTargetIntelligenceZoneRectangular]: {...(TARGET_ACQUISITION_AREA), width: true},
    [TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.CallForFireZoneIrregular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.CallForFireZoneRectangular]: {...(TARGET_ACQUISITION_AREA), width: true},
    [TacticalGraphicName.CallForFireZoneCircular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.TargetBuildUpAreaIrregular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.TargetBuildUpAreaRectangular]: {...(TARGET_ACQUISITION_AREA), width: true},
    [TacticalGraphicName.TargetBuildUpAreaCircular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.TargetValueAreaIrregular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.TargetValueAreaRectangular]: {...(TARGET_ACQUISITION_AREA), width: true},
    [TacticalGraphicName.TargetValueAreaCircular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.ZoneOfResponsibilityIrregular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.ZoneOfResponsibilityRectangular]: {...(TARGET_ACQUISITION_AREA), width: true},
    [TacticalGraphicName.ZoneOfResponsibilityCircular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.CensorZoneIrregular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.CensorZoneRectangular]: {...(TARGET_ACQUISITION_AREA), width: true},
    [TacticalGraphicName.CensorZoneCircular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.CriticalFriendlyZoneIrregular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.CriticalFriendlyZoneRectangular]: {...(TARGET_ACQUISITION_AREA), width: true},
    [TacticalGraphicName.CriticalFriendlyZoneCircular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.DeadSpaceAreaIrregular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.DeadSpaceAreaRectangular]: {...(TARGET_ACQUISITION_AREA), width: true},
    [TacticalGraphicName.DeadSpaceAreaCircular]: TARGET_ACQUISITION_AREA,
    // Table 5-26 kill boxes: same template as target acquisition areas.
    [TacticalGraphicName.BlueKillBoxIrregular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.BlueKillBoxRectangular]: {...(TARGET_ACQUISITION_AREA), width: true},
    [TacticalGraphicName.BlueKillBoxCircular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.PurpleKillBoxIrregular]: TARGET_ACQUISITION_AREA,
    [TacticalGraphicName.PurpleKillBoxRectangular]: {...(TARGET_ACQUISITION_AREA), width: true},
    [TacticalGraphicName.PurpleKillBoxCircular]: TARGET_ACQUISITION_AREA,
    // Table 5-25 (fire support / target areas): all variants should match.
    [TacticalGraphicName.FireSupportAreaIrregular]: f(true, false, true, true, false),
    [TacticalGraphicName.FireSupportAreaRectangular]: {...(f(true, false, true, true, false)), width: true},
    [TacticalGraphicName.FireSupportAreaCircular]: f(true, false, true, true, false),
    [TacticalGraphicName.TargetAreaIrregular]: NAME_FIELD_ONLY,
    [TacticalGraphicName.TargetAreaRectangular]: {...(NAME_FIELD_ONLY), width: true, length: true},
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
    [TacticalGraphicName.AirSpaceCoordinationAreaIrregular]: f(true, false, true, true, true,
        {width: false, altitude1: true, altitude2: true, grids: true}),
    [TacticalGraphicName.AirSpaceCoordinationAreaRectangular]: f(true, false, true, true, true,
        {width: true, altitude1: true, altitude2: true, grids: true}),
    [TacticalGraphicName.AirSpaceCoordinationAreaCircular]: f(true, false, true, true, true,
        {width: false, altitude1: true, altitude2: true, grids: true}),
    [TacticalGraphicName.Encirclement]: f(true, false, false, false, false),
    [TacticalGraphicName.UnexplodedExplosiveOrdnanceArea]: NAME_FIELD_ONLY,
    [TacticalGraphicName.FortifiedArea]: NAME_FIELD_ONLY,
    [TacticalGraphicName.AirheadLine]: NAME_FIELD_ONLY,
    [TacticalGraphicName.ObstacleBelt]: NAME_FIELD_ONLY,
    [TacticalGraphicName.ObstacleZone]: NAME_FIELD_ONLY,
    [TacticalGraphicName.ObstacleGroup]: NAME_FIELD_ONLY,
    [TacticalGraphicName.ObstacleFreeArea]: OBSTACLE_AREA,
    [TacticalGraphicName.ObstacleRestrictedArea]: OBSTACLE_AREA,
    [TacticalGraphicName.LimitedAccessArea]: LIMITED_ACCESS_AREA,
    [TacticalGraphicName.SmokeObscurant]: f(true, false, true, true, true),
    [TacticalGraphicName.GroupOrSeriesOfTargets]: NAME_FIELD_ONLY,

    // ── Field fortification ────────────────────────────────────────────────
    // FightingPosition: only rotation + size are user-editable; no labels.
    [TacticalGraphicName.FightingPosition]: SHAPE_ONLY,
    [TacticalGraphicName.FortifiedLine]: SHAPE_ONLY,

    [TacticalGraphicName.BaseDefenseZone]: SHAPE_ONLY,
};

// ── Hostility is derived, not declared ────────────────────────────────────────

/**
 * Whether a graphic may carry a hostility — FM 1-02.2 amplifier **Field N**.
 *
 * Deliberately not an argument to `f()`, because it is not a per-graphic
 * judgement call. Chapter 5 defines exactly four control-measure composition
 * templates — boundary (figure 5-6), area (5-7), point (5-8) and line (5-9) —
 * and **every one carries Field N**, drawn at two positions on three of the
 * four, satisfying para 5-3: "Hostile graphic control measures use red. If red
 * is not available, they are drawn in black with the abbreviation 'ENY' placed
 * on the graphic in at least two places."
 *
 * Tactical mission tasks are the only exemption, and it is stated twice:
 * "Tactical mission task symbols ... do not use modifiers or amplifiers"
 * (para 1-14) and "they do not have modifiers" (para 6-2). They are Chapter 6,
 * so none of the four Chapter 5 templates reaches them.
 *
 * Deriving this from the category beats repeating a boolean 198 times: a graphic
 * added later inherits the correct answer instead of whatever was copied from
 * the profile above it.
 */
/**
 * **Moved to `core/symbology.ts`** and re-exported here so this module's surface is
 * unchanged. It is a symbology fact — FM 1-02.2 gives the Chapter 6 tactical
 * mission tasks no amplifier fields — not a property of this dialog, and a second
 * renderer needs the same answer. The paint layer now enforces it as well as this
 * registry hiding the input. @see lineColorOf
 */
export {supportsHostility};

// ── Public accessor ───────────────────────────────────────────────────────────

/**
 * The graphics a user sizes by dragging a radius — every name routed through
 * `MissionTaskController`. They are the ones whose `radius` is a real reach from the
 * center rather than a decoration scalar, so they are the only ones worth showing it for.
 *
 * Listed rather than derived from the controller registry to keep this module free of
 * the holder imports that registry pulls in; the compiler checks every name.
 *
 * Routed through that controller but deliberately absent — sized by a radius internally,
 * but not drawn as a circle, so the number is not a dimension a reader would recognize
 * on the shape in front of them:
 *
 * - **Ambush** — a hooked arrow.
 * - **Turn**, **TacticalTurn**, **Envelopment**, **Pursuit** — bowed or hooked arrows;
 *   the radius belongs to the curve that generates them, not to anything with an edge a
 *   reader could measure to.
 *
 * `MissionTaskGraphicBase.refreshMeasure` reads this same set, so a name left out here
 * loses its measure line as well as its modal row. That coupling is deliberate — the two
 * report the same quantity, and a graphic showing a radius in one place but not the other
 * would read as a bug.
 */

export function getGraphicFields(name: TacticalGraphicName): GraphicFieldSet {
    const base = GRAPHIC_FIELDS[name] ?? f(true, false, false, false, false);
    // Both are decided centrally rather than per entry — same reasoning as `hostility`.
    return {...base, hostility: supportsHostility(name), radius: hasRadiusReadout(name)};
}
