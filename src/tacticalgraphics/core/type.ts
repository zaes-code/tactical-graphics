import {Feature, GeoJsonTypes, Position} from "geojson";

export type PositionType = Position | Position[] | Position[][] | Position[][][];

/**
 * A single `[lon, lat]` (optionally `[lon, lat, alt]`) coordinate.
 *
 * Structurally identical to GeoJSON's `Position` and OpenLayers' `Coordinate`,
 * so it interoperates with both. Declared here so the geometry layer stays
 * free of any map-library dependency.
 */
export type Coordinate = Position;

/** Base options accepted by every graphic generator. */
export interface BaseGraphicOptions {
    /** Hostility affiliation — affects fill/stroke color. */
    hostility?: TacticalGraphicHostility;
    /** Planned vs present — affects line dash pattern. */
    status?: TacticalGraphicStatus;
    /** Generic size scalar used by several graphics (deprecated: prefer radius/width). */
    size?: number;
    /** Rotation in degrees. */
    rotation?: number;
    /** @see TacticalGraphicProperties.mirrored */
    mirrored?: boolean;
    /** Generic radius used by circular/movement graphics. */
    radius?: number;
}

/** Options for movement/arrow-style line graphics. */
export interface MovementOptions extends BaseGraphicOptions {
    /** Arrow-head / body width scalar relative to resolution. Required for movement graphics. */
    radius: number;
}

/** Options for air-corridor strip graphics. */
export interface CorridorOptions extends BaseGraphicOptions {
    /** Half-width of the corridor in map units. */
    width?: number;
}

/**
 * Options for the rectangular target (APP-06 240802), the one rectangle built entirely
 * from amplifiers rather than from anchor points.
 *
 * Its plate takes **one** anchor point and states the shape outright: "the target length
 * (AM1) in metres and target width (AM) in metres", plus a target attitude (AN). Every
 * other rectangle in the set is two points and a width, which is why this bag exists
 * rather than a `length` on `BaseGraphicOptions` that nothing else would read.
 *
 * `rotation` carries the attitude. The plate quotes AN in mils and this is degrees, like
 * every other angle in the schema — one rotation rather than a parallel field for the same
 * physical quantity, converted for display if a host wants mils.
 */
export interface RectangularTargetOptions extends BaseGraphicOptions {
    /** Full length in metres, along the attitude bearing — amplifier AM1. */
    length?: number;
    /** Half the full width in metres, across the attitude — amplifier AM, halved on the way in. */
    radius?: number;
}

/** Options for area graphics that carry an echelon modifier (e.g. BattlePosition). */
export interface EchelonAreaOptions extends BaseGraphicOptions {
    echelon?: TacticalGraphicEchelon;
}

/** Options for circular area graphics drawn with a center + radius. */
export interface CircularAreaOptions extends BaseGraphicOptions {
    /** Radius in map units. */
    radius?: number;
}

/** Options for the Encirclement graphic which uses a hostility arrow color. */
export interface EncirclementOptions extends BaseGraphicOptions {
    hostility?: TacticalGraphicHostility;
}

/** Options for route / supply-route graphics. */
export interface RouteOptions extends BaseGraphicOptions {
    direction?: RouteDirection;
}

/**
 * Options for security-operation fan graphics (Cover/Guard/Screen).
 *
 * **Every dimension is optional**, because they are fixed ratios of one another and of
 * `size`. Pass `size` alone and the proportions follow.
 *
 * These were badges until 2026-08-29 — not resized, describing no ground extent, sized
 * by a screen constant times the live map resolution. APP-06 gives them four anchor
 * points, so they are drawn from two now and the generator builds the arms from the
 * **base**: a two-point `LineString` of `[the arrowhead, that arm's inner end]`. Given
 * such a base the generator ignores these options, which is why a renderer that still
 * forces a `radius` in gets exactly the geometry it would have got without one.
 *
 * They remain for the other way round — placing one of these three from a single point
 * and a size, which is how a symbol dropped on an existing unit is positioned.
 * @see SecurityOperation.dimensions
 */
export interface SecurityOperationOptions extends BaseGraphicOptions {
    /** Distance from the center to where each arm's line begins, in meters. */
    centerPadding?: number;
    /**
     * Distance from the center to the label anchor, in meters.
     *
     * Separate from `centerPadding` so the gap between the label and the line
     * that follows it is a number someone can set, rather than whatever falls out
     * of a ratio. It used to be `centerPadding / 1.5`, which pinned the gap at a
     * third of the padding — 25px at the shipped padding, and impossible to change
     * without moving the arms as well.
     *
     * Omitted keeps the old ratio, so an external caller passing the previous
     * option set gets the previous geometry.
     */
    labelPadding?: number;
    arrowLength?: number;
    arrowDepth?: number;
    arrowHeadLength?: number;
    arrowHeadDegree?: number;
}

/**
 * One band of a multi-band weapon/sensor range fan. `range` is the outer
 * radius in **kilometers** (the inner radius is whatever the previous
 * band's range was, or 0 for the innermost band). FM 1-02.2 Table 5-26
 * templates.
 *
 * The sector variant (WeaponSensorRangeFanSector) lets each band carry
 * its own `leftAzimuthDeg` / `rightAzimuthDeg` — absolute compass
 * bearings (degrees CW from north). The arc sweeps clockwise from left
 * to right (handling 0°/360° wraps automatically). The single global
 * center azimuth lives on `RangeFanOptions` / `RangeFanConfig.centerAzimuthDeg`
 * and drives the axis arrow direction; it falls back to the controller's
 * drawn bearing. The circular variant ignores azimuth fields entirely.
 */
export interface RangeFanBand {
    /**
     * How far the band reaches, in **meters** — like `radius`, `width` and `decorationSize`.
     *
     * **This was kilometers before 4.0.0.** Both APP-06 range fan plates say otherwise in
     * as many words — 242200 (sector) *"All ranges in metres"*, 242100 (circular) *"All
     * units in metres"* — and their examples read `RG 5000`, `MAX RG(1) 28,500`. A 5 km
     * band used to render `RG 5` where the standard renders `RG 5000`.
     *
     * The earlier note here defended kilometers on the grounds that an envelope is quoted
     * that way and metres would put three zeroes on every ring. The label answers that by
     * grouping thousands (`5,000`) rather than by changing the unit. (User's call,
     * 2026-08-31.)
     *
     * **There is no migration.** A fan saved before 4.0.0 carries a kilometer number and
     * will render a thousand times too small; that break was taken deliberately rather
     * than carrying a schema version for one field. @see formatRange
     */
    range: number;
    /** Optional user-entered name shown above the auto-generated range line. */
    label?: string;
    /**
     * Optional altitude for this band, rendered as `ALT <altitude>` beneath the range.
     *
     * A number in the configured {@link AltitudeUnit}, like the graphic's own altitudes,
     * and measured from the graphic's `altitudeDatum` — every band of one fan shares it,
     * because a fan quoting each ring against a different datum would not be one picture.
     * A string still renders untouched. @see formatAltitude
     */
    altitude?: number;
    /** Sector only — absolute bearing of the band's left edge, degrees CW from north. */
    leftAzimuthDeg?: number;
    /** Sector only — absolute bearing of the band's right edge, degrees CW from north. */
    rightAzimuthDeg?: number;
}

/**
 * User-facing range-fan configuration, as it appears under
 * `properties.tacticalGraphic.rangeFan`. Only the two range fan graphics
 * consume it; every other graphic ignores it.
 */
export interface RangeFanConfig {
    bands: RangeFanBand[];
    /** Degrees CW from north. Sector only. Falls back to the drawn bearing. */
    centerAzimuthDeg?: number;
}

/**
 * Options for the doctrinal weapon/sensor range fan graphics. Both
 * circular and sector variants accept `bands` (multi-ring rendering).
 * The sector variant additionally accepts a single global
 * `centerAzimuthDeg` (absolute, degrees CW from north) — when omitted
 * the sector defaults to the bearing drawn by the controller. Per-band
 * deflection from that center is carried on `RangeFanBand` itself.
 */
export interface RangeFanOptions extends BaseGraphicOptions {
    bands?: RangeFanBand[];
    centerAzimuthDeg?: number;
}

/**
 * Options for the Turn tactical mission task.
 *
 * `size` is the half-length of the curve's chord; `bend` is what makes the
 * turn sharper or shallower, and `headSize` keeps the arrowhead out of both —
 * it is a flat distance rather than a fraction of `size`, so resizing the
 * curve does not resize the head.
 */
export interface TurnOptions extends BaseGraphicOptions {
    size?: number;
    rotation?: number;
    /**
     * Depth of the bow as a signed multiple of `size`. Larger = sharper turn;
     * negative bends the other way. Defaults to `TURN_DEFAULT_BEND`.
     */
    bend?: number;
    /** Arrowhead length in **meters**. Defaults to a fraction of `size`. */
    headSize?: number;
    /**
     * Half the gap left in the curve for the "T", in **meters**. Defaults to a
     * fraction of `size`. Set it from the rendered glyph where the label does
     * not scale with the graphic. Clamped so a gap can never swallow the curve.
     */
    labelGap?: number;
}

/**
 * Union of all typed option bags.
 * Use the specific interface when you know the graphic type;
 * use this union at the generic adapter boundary.
 */
export type GraphicOptions =
    | TurnOptions
    | BaseGraphicOptions
    | MovementOptions
    | CorridorOptions
    | EchelonAreaOptions
    | CircularAreaOptions
    | EncirclementOptions
    | RectangularTargetOptions
    | RouteOptions
    | SecurityOperationOptions
    | RangeFanOptions;

/** @deprecated Use BaseGraphicOptions instead */
export type IBaseGraphicOptions = BaseGraphicOptions;

/** @deprecated Use MovementOptions instead */
export type MovementGraphicOptions = MovementOptions;

/** @deprecated Use BaseGraphicOptions instead. Retains required size/rotation for backwards compatibility. */
export interface PointGraphicOptions extends BaseGraphicOptions {
    size: number;
    rotation: number;
    /**
     * Half the gap left in the circle for the one-letter label, in **degrees of
     * arc**, for the arc-and-arrowhead mission tasks (Secure, Isolate, Retain,
     * Occupy, Control, Contain, Cordon and Search).
     *
     * Omit it and the generator leaves its own doctrinal default, so a consumer
     * reading the raw GeoJSON gets a circle with a legible hole in it. A renderer
     * that measures its own glyph passes `0` and cuts the gap at draw time —
     * which is what the OpenLayers layer does, for the same reason `Turn` takes a
     * `labelGap`: an angular gap is a constant *fraction* of the circle, and the
     * label it makes room for is not.
     */
    labelGapDegrees?: number;
}

/** @deprecated Use EncirclementOptions instead */
export type EncirclementAreaOptions = EncirclementOptions;

export interface IGraphicGenerator<T extends GraphicOptions = GraphicOptions> {
    readonly name: string;
    readonly type: string;

    generate(baseCoords: Feature, opts?: T): ITacticalGraphic;
}

export interface ITacticalGraphic {
    readonly name: string;
    readonly type: "Point" | "LineString" | "Polygon";
    base: Feature;
    graphic: Feature;
    labels: Feature;
    handles: Feature;
}

export function getLabel(name: TacticalGraphicName) {
    switch (name) {
        case TacticalGraphicName.ObjectiveArea:
            return 'OBJ';
        case TacticalGraphicName.AttackPosition:
            return 'ATK';
        case TacticalGraphicName.NamedAreaOfInterest:
            return 'NAI';
        case TacticalGraphicName.TargetAreaOfInterest:
            return 'TAI';
        case TacticalGraphicName.ForwardArmingAndRefuelingPoint:
            return 'FARP';
        case TacticalGraphicName.AssaultPosition:
            return 'ASLT';
        case TacticalGraphicName.AreaOfOperations:
            return 'AO';
        case TacticalGraphicName.ArtilleryReservedArea:
            return 'ARA';
        case TacticalGraphicName.ArtilleryManeuverArea:
            return 'AMA';
        case TacticalGraphicName.ZoneOfFire:
            return 'ZF';
        case TacticalGraphicName.JointTacticalActionArea:
            return 'JTAA';
        case TacticalGraphicName.SubmarineActionArea:
            return 'SAA';
        case TacticalGraphicName.SubmarineGeneratedActionArea:
            return 'SGAA';
        case TacticalGraphicName.HumanTerrain:
            return 'HT';
        case TacticalGraphicName.EnemyPrisonerOfWarHoldingArea:
            return 'EPW HOLDING AREA';
        case TacticalGraphicName.Bridgehead:
            return 'BA';
        case TacticalGraphicName.TerminallyGuidedMunitionFootprint:
            return 'TGMF';
        case TacticalGraphicName.BombArea:
            return 'BOMB';

        case TacticalGraphicName.BaseCamp:
        case TacticalGraphicName.GuerrillaBase:
        case TacticalGraphicName.DetaineeHoldingArea:
        case TacticalGraphicName.AssemblyArea:
        case TacticalGraphicName.EngagementArea:
        case TacticalGraphicName.RefugeeHoldingArea:
        case TacticalGraphicName.BrigadeSupportArea:
        case TacticalGraphicName.DivisionSupportArea:
        case TacticalGraphicName.CorpsSupportArea:
        case TacticalGraphicName.DropZone:
        case TacticalGraphicName.LandingZone:
        case TacticalGraphicName.KillZone:
        case TacticalGraphicName.PickupZone:
            return name.replace(/[^A-Z]/g, ''); // return the capital letters in the name as the label
        case TacticalGraphicName.Cover:
        case TacticalGraphicName.Control:
        case TacticalGraphicName.Contain:
        case  TacticalGraphicName.Canalize:
        case  TacticalGraphicName.Clear:
            return 'C';
        case TacticalGraphicName.Screen:
        case TacticalGraphicName.Secure:
            return 'S';
        case TacticalGraphicName.Guard:
            return 'G';
        case TacticalGraphicName.Isolate:
            return "I";
        case TacticalGraphicName.Retain:
        case TacticalGraphicName.Retirement:
            return "R";
        case TacticalGraphicName.CordonAndSearch:
            return "C/S";
        case TacticalGraphicName.CordonAndKnock:
            return "C/K";
        case TacticalGraphicName.Locate:
            return 'LOC';
        case TacticalGraphicName.Occupy:
            return "O";
        case TacticalGraphicName.AreaDefense:
            return 'AD';
        case TacticalGraphicName.TacticalBlock:
        case TacticalGraphicName.Breach:
        case TacticalGraphicName.Bypass:
            return 'B';
        case TacticalGraphicName.Penetration:
        case TacticalGraphicName.Pursuit:
            return 'P';
        case TacticalGraphicName.TacticalDisrupt:
        case TacticalGraphicName.Delay:
            return 'D';
        // The "F" used to exist only as a literal inside tacticalFixStyleFunc,
        // so this returned '' for a graphic that visibly draws one. Naming it
        // here lets the holder pass getLabel(name) and get 'F' for the mission
        // task and '' for the table 5-19 twin, with no per-name branch.
        case TacticalGraphicName.TacticalFix:
            return 'F';
        // Envelopment's "E" used to be a literal inside the movement label
        // style. Now that it is point-anchored its label comes through
        // `getMissionTaskStyleFn(getLabel(name))` like every other one, so the
        // letter has to be named here or the graphic draws without it.
        case TacticalGraphicName.Envelopment:
            return 'E';

        // offensive line
        case TacticalGraphicName.PhaseLine:
            return 'PL';
        case TacticalGraphicName.LineOfDeparture:
            return 'LD';
        case TacticalGraphicName.LimitOfAdvance:
            return 'LOA';
        case TacticalGraphicName.ForwardEdgeOfBattleArea:
            return 'FEBA';
        case TacticalGraphicName.ReleaseLine:
            return 'RL';
        case TacticalGraphicName.BridgeheadLine:
            return 'BL';
        case TacticalGraphicName.BattlefieldHandoverLine:
            return 'BHL';
        case TacticalGraphicName.DelayLine:
            return 'DLY';
        case TacticalGraphicName.FinalCoordinationLine:
            return 'FCL';
        case TacticalGraphicName.LineOfDepartureOrLineOfContact:
            return 'LD/DC';
        case TacticalGraphicName.ProbableLineOfDeployment:
            return 'PLD';
        case TacticalGraphicName.Route:
            return 'ROUTE';
        case TacticalGraphicName.MainSupplyRoute:
            return 'MSR';
        case TacticalGraphicName.AlternateSupplyRoute:
            return 'ASR';
        case TacticalGraphicName.IdentificationFriendOrFoeOff:
            return 'IFF OFF';
        case TacticalGraphicName.IdentificationFriendOrFoeOn:
            return 'IFF ON';
        // fire line
        case TacticalGraphicName.FireSupportCoordinationLine:
            return 'FSCL';
        case TacticalGraphicName.CommonSensorBoundary:
            return 'CSB';
        case TacticalGraphicName.LightLine:
            return 'LL';
        case TacticalGraphicName.HoldingLine:
            return 'HL';
        case TacticalGraphicName.NamedAreaOfInterestLine:
            return 'NAI';
        // The letter the template sets at *both* ends of a mineline, which is the
        // symbol's only distinguishing mark. @see minelinePaint
        case TacticalGraphicName.Mineline:
            return 'N';
        case TacticalGraphicName.Capture:
            return 'C';
        case TacticalGraphicName.Seize:
            return 'S';
        case TacticalGraphicName.AvenueOfApproach:
            return 'AA';
        case TacticalGraphicName.Deny:
            return 'D';
        case TacticalGraphicName.Escort:
            return 'E';
        case TacticalGraphicName.Demonstration:
            return 'DEM';
        case TacticalGraphicName.Evacuate:
            return 'E';
        case TacticalGraphicName.Recover:
            return 'R';
        // Not an abbreviation of the name — "(P)" is drawn as part of the symbol, ahead
        // of whatever the position is called. The Example reads "(P) MARS".
        case TacticalGraphicName.BattlePositionPreparedButNotOccupied:
            return '(P)';
        case TacticalGraphicName.HandoverLine:
            return 'HOL';
        case TacticalGraphicName.NoFireLine:
            return 'NFL';
        case TacticalGraphicName.BattlefieldCoordinationLine:
            return 'BCL';
        case TacticalGraphicName.FighterEngagementZone:
            return 'FEZ';
        case TacticalGraphicName.ExtractionZone:
            return 'EZ';
        case TacticalGraphicName.RegimentalSupportArea:
            return 'RSA';
        case TacticalGraphicName.RestrictiveFireLine:
            return 'RFL';
        case TacticalGraphicName.IntelligenceCoordinationLine:
            return 'ICL';

        // Coordinated Fire Line
        case TacticalGraphicName.CoordinatedFireLine:
            return 'CFL';
        case TacticalGraphicName.EngineerWorkLine:
            return 'EWL';

        case TacticalGraphicName.AirCorridor:
            return 'AC';
        case TacticalGraphicName.LowLevelTransitRoute:
            return 'LLTR';
        case TacticalGraphicName.MinimumRiskRoute:
            return 'MRR';
        case TacticalGraphicName.SafeLane:
            return 'SL';
        case TacticalGraphicName.SpecialCorridor:
            return 'SC';
        case TacticalGraphicName.StandardUseArmyAircraftFlightRoute:
            return 'SAAFR';
        case TacticalGraphicName.TransitCorridor:
            return 'TC';
        case TacticalGraphicName.UnmannedAircraftCorridor:
            return 'UA';
        case TacticalGraphicName.Disengage:
            return 'DIS'
        case TacticalGraphicName.Withdraw:
            return 'W';
        case TacticalGraphicName.WithdrawUnderPressure:
            return 'WP';
        case TacticalGraphicName.ForwardPassageOfLines:
            return 'P(F)';
        case TacticalGraphicName.RearwardPassageOfLines:
            return 'P(R)';

        case TacticalGraphicName.FreeFireAreaIrregular:
        case TacticalGraphicName.FreeFireAreaRectangular:
        case TacticalGraphicName.FreeFireAreaCircular:
            return 'FFA';

        case TacticalGraphicName.NoFireAreaIrregular:
        case TacticalGraphicName.NoFireAreaRectangular:
        case TacticalGraphicName.NoFireAreaCircular:
            return 'NFA';

        case TacticalGraphicName.RestrictiveFireAreaIrregular:
        case TacticalGraphicName.RestrictiveFireAreaRectangular:
        case TacticalGraphicName.RestrictiveFireAreaCircular:
            return 'RFA';

        // case TacticalGraphicName.PositionAreaArtilleryIrregular:
        // case TacticalGraphicName.PositionAreaArtilleryRectangular:
        // case TacticalGraphicName.PositionAreaArtilleryCircular:
        //     return 'PAA';

        case TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular:
        case TacticalGraphicName.ArtilleryTargetIntelligenceZoneRectangular:
        case TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular:
            return 'ATI ZONE';

        case TacticalGraphicName.CallForFireZoneIrregular:
        case TacticalGraphicName.CallForFireZoneRectangular:
        case TacticalGraphicName.CallForFireZoneCircular:
            return 'CFF ZONE';

        case TacticalGraphicName.TargetBuildUpAreaIrregular:
        case TacticalGraphicName.TargetBuildUpAreaRectangular:
        case TacticalGraphicName.TargetBuildUpAreaCircular:
            return 'TBA';

        case TacticalGraphicName.TargetValueAreaIrregular:
        case TacticalGraphicName.TargetValueAreaRectangular:
        case TacticalGraphicName.TargetValueAreaCircular:
            return 'TVAR';

        case TacticalGraphicName.ZoneOfResponsibilityIrregular:
        case TacticalGraphicName.ZoneOfResponsibilityRectangular:
        case TacticalGraphicName.ZoneOfResponsibilityCircular:
            return 'ZOR';

        case TacticalGraphicName.CensorZoneIrregular:
        case TacticalGraphicName.CensorZoneRectangular:
        case TacticalGraphicName.CensorZoneCircular:
            return 'CENSOR ZONE';

        case TacticalGraphicName.CriticalFriendlyZoneIrregular:
        case TacticalGraphicName.CriticalFriendlyZoneRectangular:
        case TacticalGraphicName.CriticalFriendlyZoneCircular:
            return 'CF ZONE';

        case TacticalGraphicName.DeadSpaceAreaIrregular:
        case TacticalGraphicName.DeadSpaceAreaRectangular:
        case TacticalGraphicName.DeadSpaceAreaCircular:
            return 'DA';

        case TacticalGraphicName.BlueKillBoxIrregular:
        case TacticalGraphicName.BlueKillBoxRectangular:
        case TacticalGraphicName.BlueKillBoxCircular:
            return 'BKB';

        case TacticalGraphicName.PurpleKillBoxIrregular:
        case TacticalGraphicName.PurpleKillBoxRectangular:
        case TacticalGraphicName.PurpleKillBoxCircular:
            return 'PKB';

        case TacticalGraphicName.FireSupportAreaRectangular:
        case TacticalGraphicName.FireSupportAreaIrregular:
        case TacticalGraphicName.FireSupportAreaCircular:
            return 'FSA';

        // HIDACZ, not HDACZ. FM 1-02.2 prints the abbreviation on the symbol's own
        // example block and uses HIDACZ there; the manual contains no occurrence of
        // HDACZ at all, and MIL-STD-2525 and APP-06 agree on the longer form.
        case TacticalGraphicName.HighDensityAirspaceControlZone:
            return 'HIDACZ';
        case TacticalGraphicName.RestrictedOperationsZone:
            return 'ROZ';
        case TacticalGraphicName.AirToAirRefuelingRestrictedOperationsZone:
            return 'AARROZ';
        case TacticalGraphicName.UnmannedAircraftRestrictedOperationsZone:
            return 'UAROZ';
        case TacticalGraphicName.WeaponEngagementZone:
            return 'WEZ';
        case TacticalGraphicName.JointEngagementZone:
            return 'JEZ';
        case TacticalGraphicName.MissileEngagementZone:
            return 'MEZ';
        case TacticalGraphicName.LowAltitudeMissileEngagementZone:
            return 'LOMEZ';
        case TacticalGraphicName.HighAltitudeMissileEngagementZone:
            return 'HIMEZ';
        case TacticalGraphicName.ShortRangeAirDefenseEngagementZone:
            return 'SHORADEZ';
        case TacticalGraphicName.WeaponsFreeZone:
            return 'WFZ';

        case TacticalGraphicName.AirSpaceCoordinationAreaRectangular:
        case TacticalGraphicName.AirSpaceCoordinationAreaIrregular:
        case TacticalGraphicName.AirSpaceCoordinationAreaCircular:
            return 'ACA';

        /*case TacticalGraphicName.ForwardLineOfOwnTroops:
            return '';*/
        case TacticalGraphicName.LineOfContact:
            return 'LC';

        /*case TacticalGraphicName.Airfield:
        case TacticalGraphicName.StrongPoint:
        case TacticalGraphicName.Boundary:
        case TacticalGraphicName.AviationAxisOfAdvance:
        case TacticalGraphicName.BattlePosition:
        case TacticalGraphicName.MainAxisOfAdvance:
        case TacticalGraphicName.AxisOfAttack:
        case TacticalGraphicName.SupportingAttack:
            return '';*/

        case TacticalGraphicName.Infiltration:
            return 'IN';

        // Forms of maneuver — labels are empty (distinguished by graphic shape / style)
        /*case TacticalGraphicName.MovementToContact:
        case TacticalGraphicName.FrontalAttack:
        case TacticalGraphicName.FlankAttack:
        case TacticalGraphicName.TurningMovement:
        case TacticalGraphicName.Pursuit:
        case TacticalGraphicName.Envelopment:
        case TacticalGraphicName.DoubleEnvelopment:
        case TacticalGraphicName.MobileDefense:
        case TacticalGraphicName.Ambush:
            return '';*/

        case TacticalGraphicName.ReliefInPlace:
            return 'RIP';

        case TacticalGraphicName.LimitedAccessArea:
            return 'LAA';

        /*case TacticalGraphicName.MovingConvoy:
        case TacticalGraphicName.HaltedConvoy:
            return '';*/

        // case TacticalGraphicName.TargetReferencePoint:
        //     return 'TRP';
        case TacticalGraphicName.FinalProtectiveFire:
            return 'FPF';
/*        case TacticalGraphicName.FireSupportStation:
            return 'FSS';*/

        /*case TacticalGraphicName.PointTarget:
        case TacticalGraphicName.LinearTarget:
        case TacticalGraphicName.LinearSmokeTarget:
        case TacticalGraphicName.AreaSmokeObscurantPresent:
        case TacticalGraphicName.AreaSmokeObscurantPlanned:
        case TacticalGraphicName.GroupOfTargets:
        case TacticalGraphicName.SeriesOfTargets:
        case TacticalGraphicName.WeaponSensorRangeFanCircular:
        case TacticalGraphicName.WeaponSensorRangeFanSector:
            return '';*/

        case TacticalGraphicName.AttackByFire:
            return 'AF';
        case TacticalGraphicName.Destroy:
            return 'D';
        case TacticalGraphicName.Exfiltrate:
            return 'EX';
        // Excluded — see ai/excluded-graphics.md
        // case TacticalGraphicName.FollowAndAssume:
        //     return 'F/A';
        // case TacticalGraphicName.FollowAndSupport:
        //     return 'F/S';
        case TacticalGraphicName.Interdict:
            return 'I';
        case TacticalGraphicName.Neutralize:
            return 'N';
        case TacticalGraphicName.SupportByFire:
            return 'SBF';
        case TacticalGraphicName.Suppress:
            return 'S';
        case TacticalGraphicName.TacticalTurn:
            return 'T';

        default:
            return '';
    }
}

/**
 * List of Tactical Graphics that have their underlying geometries and text labels implemented.
 * */
export enum TacticalGraphicName {

    BaseDefenseZone = 'BaseDefenseZone',
    // movement graphics
    MainAxisOfAdvance = 'MainAxisOfAdvance',
    MainAxisOfAdvanceFeint = 'MainAxisOfAdvanceFeint',
    SupportingAxisOfAdvance = 'SupportingAxisOfAdvance',
    AviationAxisOfAdvance = 'AviationAxisOfAdvance',
    AttackHelicopterAxisOfAdvance = 'AttackHelicopterAxisOfAdvance',
    AvenueOfApproach = 'AvenueOfApproach',        // APP-06 152300 Avenue of Approach
    Counterattack = 'Counterattack',
    CounterattackByFire = 'CounterattackByFire',  // APP-06 340700 Counter-Attack by Fire

    //phase lines
    PhaseLine = 'PhaseLine',

    // labeled at the start and end of the phase line.
    ForwardEdgeOfBattleArea = 'ForwardEdgeOfBattleArea',
    ReleaseLine = 'ReleaseLine',
    BridgeheadLine = 'BridgeheadLine',
    BattlefieldHandoverLine = 'BattlefieldHandoverLine',
    DelayLine = 'DelayLine',
    FinalCoordinationLine = 'FinalCoordinationLine',
    LimitOfAdvance = 'LimitOfAdvance',
    LineOfDeparture = 'LineOfDeparture',
    LineOfDepartureOrLineOfContact = 'LineOfDepartureOrLineOfContact',
    ProbableLineOfDeployment = 'ProbableLineOfDeployment',
    LightLine = 'LightLine',  // APP-06 110200 Light Line
    LineGeneric = 'LineGeneric',  // APP-06 110400 Line, Generic
    HandoverLine = 'HandoverLine',  // APP-06 141800 Handover Line (HOL)
    NamedAreaOfInterestLine = 'NamedAreaOfInterestLine',  // APP-06 142000 Named Area of Interest Line (NAI)
    HoldingLine = 'HoldingLine',  // APP-06 141500 Holding Line (HL)
    NoFireLine = 'NoFireLine',  // APP-06 260300 No Fire Line
    BattlefieldCoordinationLine = 'BattlefieldCoordinationLine',  // APP-06 260400 Battlefield Coordination Line
    FighterEngagementZone = 'FighterEngagementZone',  // APP-06 171400 Fighter Engagement Zone (FEZ)
    ExtractionZone = 'ExtractionZone',  // APP-06 150700 Extraction Zone (EZ)
    RegimentalSupportArea = 'RegimentalSupportArea',  // APP-06 310500 Regimental Support Area
    IdentificationFriendOrFoeOff = 'IdentificationFriendOrFoeOff',
    IdentificationFriendOrFoeOn = 'IdentificationFriendOrFoeOn',
    // boundaries with symbol modifiers
    Route = 'Route',
    MainSupplyRoute = 'MainSupplyRoute',
    AlternateSupplyRoute = 'AlternateSupplyRoute',

    // top bottom at both start and end of the phase lines
    CommonSensorBoundary = 'CommonSensorBoundary',
    FireSupportCoordinationLine = 'FireSupportCoordinationLine',
    RestrictiveFireLine = 'RestrictiveFireLine',
    IntelligenceCoordinationLine = 'IntelligenceCoordinationLine',

    // middle labeled linestrings
    Boundary = 'Boundary',
    CoordinatedFireLine = 'CoordinatedFireLine',
    EngineerWorkLine = 'EngineerWorkLine',

    // area graphics
    Airfield = 'Airfield',
    AreaOfOperations = 'AreaOfOperations',
    BombArea = 'BombArea',
    TerminallyGuidedMunitionFootprint = 'TerminallyGuidedMunitionFootprint',
    Bridgehead = 'Bridgehead',
    EnemyPrisonerOfWarHoldingArea = 'EnemyPrisonerOfWarHoldingArea',
    HumanTerrain = 'HumanTerrain',
    PenetrationBox = 'PenetrationBox',
    Area = 'Area',
    JointTacticalActionArea = 'JointTacticalActionArea',
    SubmarineActionArea = 'SubmarineActionArea',                    // APP-06 150502 Submarine Action Area (SAA)
    SubmarineGeneratedActionArea = 'SubmarineGeneratedActionArea',  // APP-06 150503 Submarine-Generated Action Area (SGAA)
    AreaGeneric = 'AreaGeneric',
    ZoneOfFire = 'ZoneOfFire',
    RestrictedTerrain = 'RestrictedTerrain',
    SeverelyRestrictedTerrain = 'SeverelyRestrictedTerrain',
    AirfieldZone = 'AirfieldZone',
    BiologicalContaminatedArea = 'BiologicalContaminatedArea',
    // The three toxic-industrial-material variants. There is no nuclear one: APP-06 gives
    // 271900 no subtype, which is why this list has three members and not four.
    BiologicalContaminatedAreaToxicIndustrialMaterial = 'BiologicalContaminatedAreaToxicIndustrialMaterial',
    ChemicalContaminatedAreaToxicIndustrialMaterial = 'ChemicalContaminatedAreaToxicIndustrialMaterial',
    RadiologicalContaminatedAreaToxicIndustrialMaterial = 'RadiologicalContaminatedAreaToxicIndustrialMaterial',
    ChemicalContaminatedArea = 'ChemicalContaminatedArea',
    NuclearContaminatedArea = 'NuclearContaminatedArea',
    RadiologicalContaminatedArea = 'RadiologicalContaminatedArea',
    ArtilleryManeuverArea = 'ArtilleryManeuverArea',
    ArtilleryReservedArea = 'ArtilleryReservedArea',
    AssemblyArea = 'AssemblyArea',
    BaseCamp = 'BaseCamp',
    EngagementArea = 'EngagementArea',
    GuerrillaBase = 'GuerrillaBase',
    NamedAreaOfInterest = 'NamedAreaOfInterest',
    ObjectiveArea = 'ObjectiveArea',
    TargetAreaOfInterest = 'TargetAreaOfInterest',
    AssaultPosition = 'AssaultPosition',
    AttackPosition = 'AttackPosition',
    DetaineeHoldingArea = 'DetaineeHoldingArea',
    RefugeeHoldingArea = 'RefugeeHoldingArea',
    ForwardArmingAndRefuelingPoint = 'ForwardArmingAndRefuelingPoint',
    BrigadeSupportArea = 'BrigadeSupportArea',
    DivisionSupportArea = 'DivisionSupportArea',
    CorpsSupportArea = 'CorpsSupportArea',
    DropZone = 'DropZone',
    LandingZone = 'LandingZone',
    KillZone = 'KillZone',
    PickupZone = 'PickupZone',

    // areas with echelons
    BattlePosition = 'BattlePosition',
    StrongPoint = 'StrongPoint',

    // air corridors
    AirCorridor = 'AirCorridor',
    LowLevelTransitRoute = 'LowLevelTransitRoute',
    MinimumRiskRoute = 'MinimumRiskRoute',
    SafeLane = 'SafeLane',
    SpecialCorridor = 'SpecialCorridor',
    StandardUseArmyAircraftFlightRoute = 'StandardUseArmyAircraftFlightRoute',
    TransitCorridor = 'TransitCorridor',
    UnmannedAircraftCorridor = 'UnmannedAircraftCorridor',

    // security operations
    Secure = 'Secure',
    Isolate = 'Isolate',
    Retain = 'Retain',
    Control = 'Control',
    CordonAndKnock = 'CordonAndKnock',
    Locate = 'Locate',
    CordonAndSearch = 'CordonAndSearch',
    Contain = 'Contain',
    Occupy = 'Occupy',
    AreaDefense = 'AreaDefense',

    // mission tasks
    Cover = 'Cover',
    Guard = 'Guard',
    Screen = 'Screen',

    TacticalBlock = 'TacticalBlock',
    Breach = 'Breach',
    Bypass = 'Bypass',
    Canalize = 'Canalize',
    Clear = 'Clear',
    TacticalDisrupt = 'TacticalDisrupt',
    Penetration = 'Penetration',
    Exploitation = 'Exploitation',

    Disengage = 'Disengage',
    Delay = 'Delay',
    Retirement = 'Retirement',
    Withdraw = 'Withdraw',
    WithdrawUnderPressure = 'WithdrawUnderPressure',
    ForwardPassageOfLines = 'ForwardPassageOfLines',
    RearwardPassageOfLines = 'RearwardPassageOfLines',

    FreeFireAreaIrregular = 'FreeFireAreaIrregular',
    FreeFireAreaRectangular = 'FreeFireAreaRectangular',
    FreeFireAreaCircular = 'FreeFireAreaCircular',
    NoFireAreaIrregular = 'NoFireAreaIrregular',
    NoFireAreaRectangular = 'NoFireAreaRectangular',
    NoFireAreaCircular = 'NoFireAreaCircular',
    RestrictiveFireAreaIrregular = 'RestrictiveFireAreaIrregular',
    RestrictiveFireAreaRectangular = 'RestrictiveFireAreaRectangular',
    RestrictiveFireAreaCircular = 'RestrictiveFireAreaCircular',
    PositionAreaArtilleryIrregular = 'PositionAreaArtilleryIrregular',
    PositionAreaArtilleryRectangular = 'PositionAreaArtilleryRectangular',
    PositionAreaArtilleryCircular = 'PositionAreaArtilleryCircular',

    ArtilleryTargetIntelligenceZoneIrregular = 'ArtilleryTargetIntelligenceZoneIrregular',
    ArtilleryTargetIntelligenceZoneRectangular = 'ArtilleryTargetIntelligenceZoneRectangular',
    ArtilleryTargetIntelligenceZoneCircular = 'ArtilleryTargetIntelligenceZoneCircular',

    CallForFireZoneIrregular = 'CallForFireZoneIrregular',
    CallForFireZoneRectangular = 'CallForFireZoneRectangular',
    CallForFireZoneCircular = 'CallForFireZoneCircular',

    TargetBuildUpAreaIrregular = 'TargetBuildUpAreaIrregular',
    TargetBuildUpAreaRectangular = 'TargetBuildUpAreaRectangular',
    TargetBuildUpAreaCircular = 'TargetBuildUpAreaCircular',
    TargetValueAreaIrregular = 'TargetValueAreaIrregular',
    TargetValueAreaRectangular = 'TargetValueAreaRectangular',
    TargetValueAreaCircular = 'TargetValueAreaCircular',
    ZoneOfResponsibilityIrregular = 'ZoneOfResponsibilityIrregular',
    ZoneOfResponsibilityRectangular = 'ZoneOfResponsibilityRectangular',
    ZoneOfResponsibilityCircular = 'ZoneOfResponsibilityCircular',
    CensorZoneIrregular = 'CensorZoneIrregular',
    CensorZoneRectangular = 'CensorZoneRectangular',
    CensorZoneCircular = 'CensorZoneCircular',

    CriticalFriendlyZoneIrregular = 'CriticalFriendlyZoneIrregular',
    CriticalFriendlyZoneRectangular = 'CriticalFriendlyZoneRectangular',
    CriticalFriendlyZoneCircular = 'CriticalFriendlyZoneCircular',

    DeadSpaceAreaIrregular = 'DeadSpaceAreaIrregular',
    DeadSpaceAreaRectangular = 'DeadSpaceAreaRectangular',
    DeadSpaceAreaCircular = 'DeadSpaceAreaCircular',

    BlueKillBoxIrregular = 'BlueKillBoxIrregular',
    BlueKillBoxRectangular = 'BlueKillBoxRectangular',
    BlueKillBoxCircular = 'BlueKillBoxCircular',

    PurpleKillBoxIrregular = 'PurpleKillBoxIrregular',
    PurpleKillBoxRectangular = 'PurpleKillBoxRectangular',
    PurpleKillBoxCircular = 'PurpleKillBoxCircular',

    FireSupportAreaIrregular = 'FireSupportAreaIrregular',
    FireSupportAreaRectangular = 'FireSupportAreaRectangular',
    FireSupportAreaCircular = 'FireSupportAreaCircular',

    TargetAreaIrregular = 'TargetAreaIrregular',
    TargetAreaRectangular = 'TargetAreaRectangular',
    TargetAreaCircular = 'TargetAreaCircular',

    HighDensityAirspaceControlZone = 'HighDensityAirspaceControlZone',
    RestrictedOperationsZone = 'RestrictedOperationsZone',
    AirToAirRefuelingRestrictedOperationsZone = 'AirToAirRefuelingRestrictedOperationsZone',
    UnmannedAircraftRestrictedOperationsZone = 'UnmannedAircraftRestrictedOperationsZone',
    WeaponEngagementZone = 'WeaponEngagementZone',
    JointEngagementZone = 'JointEngagementZone',
    MissileEngagementZone = 'MissileEngagementZone',
    LowAltitudeMissileEngagementZone = 'LowAltitudeMissileEngagementZone',
    HighAltitudeMissileEngagementZone = 'HighAltitudeMissileEngagementZone',
    ShortRangeAirDefenseEngagementZone = 'ShortRangeAirDefenseEngagementZone',
    WeaponsFreeZone = 'WeaponsFreeZone',
    AirSpaceCoordinationAreaIrregular = 'AirSpaceCoordinationAreaIrregular',
    AirSpaceCoordinationAreaRectangular = 'AirSpaceCoordinationAreaRectangular',
    AirSpaceCoordinationAreaCircular = 'AirSpaceCoordinationAreaCircular',

    Encirclement = 'Encirclement',
    UnexplodedExplosiveOrdnanceArea = 'UnexplodedExplosiveOrdnanceArea',
    FortifiedArea = 'FortifiedArea',
    AirheadLine = 'AirheadLine',

    MunitionFlightPath = 'MunitionFlightPath',
    FieldsOfFire = 'FieldsOfFire',

    ForwardLineOfOwnTroops = 'ForwardLineOfOwnTroops',

    Bridge = 'Bridge',
    AssaultCrossing = 'AssaultCrossing',
    Gap = 'Gap',

    FordEasy = 'FordEasy',
    FordDifficult = 'FordDifficult',
    FerryCrossing = 'FerryCrossing',
    PassageLane = 'PassageLane',

    ObstacleBelt = 'ObstacleBelt',
    ObstacleGroup = 'ObstacleGroup',
    ObstacleZone = 'ObstacleZone',

    ObstacleFreeArea = 'ObstacleFreeArea',
    ObstacleRestrictedArea = 'ObstacleRestrictedArea',

    Abatis = 'Abatis',
    ExplosivesPlannedStateOfReadiness = 'ExplosivesPlannedStateOfReadiness',
    ExplosivesStateOfReadiness1Safe = 'ExplosivesStateOfReadiness1Safe',
    ExplosivesStateOfReadiness2ArmedButPassable = 'ExplosivesStateOfReadiness2ArmedButPassable',
    RoadblockCompleteExecuted = 'RoadblockCompleteExecuted',
    AntiTankDitchUnderConstruction = 'AntiTankDitchUnderConstruction',
    AntiTankDitchCompleted = 'AntiTankDitchCompleted',
    AntiTankDitchReinforcedWithMines = 'AntiTankDitchReinforcedWithMines',
    WireUnspecified = 'WireUnspecified',
    WireSingleFence = 'WireSingleFence',
    WireDoubleFence = 'WireDoubleFence',
    WireDoubleApronFence = 'WireDoubleApronFence',
    WireLowWireFence = 'WireLowWireFence',
    WireHighWireFence = 'WireHighWireFence',
    WireSingleConcertina = 'WireSingleConcertina',
    WireDoubleStrandConcertina = 'WireDoubleStrandConcertina',
    WireTripleStrandConcertina = 'WireTripleStrandConcertina',
    ObstacleLine = 'ObstacleLine',

    // APP-06 protection lines (Tables 8-17 and 8-18). None has an FM 1-02.2
    // counterpart. @see graphics/ProtectionLine.ts
    BattlePositionPreparedButNotOccupied = 'BattlePositionPreparedButNotOccupied',  // APP-06 151202 / FM 1-02.2 table 5-5
    // The three that share one four-point construction. @see graphics/SweptArcTask.ts
    Capture = 'Capture',                          // APP-06 343000 Capture
    Seize = 'Seize',                              // APP-06 342300 Seize
    FollowAndAssume = 'FollowAndAssume',          // APP-06 341200 Follow and Assume
    FollowAndSupport = 'FollowAndSupport',        // APP-06 341300 Follow and Support
    Deny = 'Deny',                                // APP-06 343400 Deny
    Escort = 'Escort',                            // APP-06 343600 Escort
    Demonstration = 'Demonstration',              // APP-06 343300 Demonstration/Demonstrate
    Evacuate = 'Evacuate',                        // APP-06 344500 Evacuate
    Recover = 'Recover',                          // APP-06 344600 Recover
    DecisionLine = 'DecisionLine',                // APP-06 110500 Decision Line
    MobilityCorridor = 'MobilityCorridor',        // APP-06 142100 Mobility Corridor
    // FM 1-02.2 table 5-28 "CBRN Contour Lines", and APP-06's own codes.
    PsyOpsZoneIrregular = 'PsyOpsZoneIrregular',      // APP-06 242701 PsyOps Zone, Irregular
    PsyOpsZoneRectangular = 'PsyOpsZoneRectangular',  // APP-06 242702 PsyOps Zone, Rectangular
    PsyOpsZoneCircular = 'PsyOpsZoneCircular',        // APP-06 242703 PsyOps Zone, Circular
    MinefieldDynamicDepiction = 'MinefieldDynamicDepiction',  // APP-06 270707 Minefield, Dynamic Depiction
    MinedAreaFenced = 'MinedAreaFenced',                      // APP-06 270801 Mined Area, Fenced
    MinimumSafeDistanceZone = 'MinimumSafeDistanceZone',                          // APP-06 272100
    MinimumSafeDistanceMultipleStrike = 'MinimumSafeDistanceMultipleStrike',      // APP-06 272101
    RadiationDoseRateContourLine = 'RadiationDoseRateContourLine',                // APP-06 272200
    ObstacleBypassEasy = 'ObstacleBypassEasy',            // APP-06 270601 Obstacle Bypass Easy
    ObstacleBypassDifficult = 'ObstacleBypassDifficult',  // APP-06 270602 Obstacle Bypass Difficult
    ObstacleBypassImpossible = 'ObstacleBypassImpossible',// APP-06 270603 Obstacle Bypass Impossible
    Mineline = 'Mineline',                        // APP-06 290101 Mineline
    MineCluster = 'MineCluster',                  // APP-06 290400 Mine Cluster
    TripWire = 'TripWire',                        // APP-06 290500 Trip Wire
    RaftSite = 'RaftSite',                        // APP-06 290800 Raft Site
    FortifiedPosition = 'FortifiedPosition',      // APP-06 291000 Fortified Position

    TacticalFix = 'TacticalFix',
    TacticalTurn = 'TacticalTurn',

    // FM 1-02.2 table 5-19 obstacle effects. Each is the visual twin of the
    // Chapter 6 tactical mission task of the same doctrinal name above, minus
    // the letter — the manual gives all four names both senses and numbers them
    // "1. … 2. …" in its own glossary.
    Block = 'Block',
    Disrupt = 'Disrupt',
    Fix = 'Fix',
    Turn = 'Turn',

    DirectionOfMainAttack = 'DirectionOfMainAttack',
    DirectionOfSupportingAttack = 'DirectionOfSupportingAttack',
    DirectionOfMainAttackFeint = 'DirectionOfMainAttackFeint',
    AviationDirectionOfAttack = 'AviationDirectionOfAttack',

    // Forms of maneuver / offensive operations
    Infiltration = 'Infiltration',
    InfiltrationLane = "InfiltrationLane",
    MovementToContact = 'MovementToContact',
    /** APP-06 342900. A different symbol from MovementToContact, not a rename. @see AdvanceToContact */
    AdvanceToContact = 'AdvanceToContact',
    FrontalAttack = 'FrontalAttack',
    // FlankAttack = 'FlankAttack',
    TurningMovement = 'TurningMovement',
    Pursuit = 'Pursuit',
    Envelopment = 'Envelopment',
    // DoubleEnvelopment = 'DoubleEnvelopment',
    MobileDefense = 'MobileDefense',
    Ambush = 'Ambush',
    ReliefInPlace = 'ReliefInPlace',

    // Area control measure
    LimitedAccessArea = 'LimitedAccessArea',

    // Convoy
    // Excluded — see ai/excluded-graphics.md
    // MovingConvoy = 'MovingConvoy',
    // HaltedConvoy = 'HaltedConvoy',

    // Target control measures
    // TargetReferencePoint = 'TargetReferencePoint',
    // PointTarget = 'PointTarget',
    LinearTarget = 'LinearTarget',
    FinalProtectiveFire = 'FinalProtectiveFire',
    LinearSmokeTarget = 'LinearSmokeTarget',
    SmokeObscurant = 'SmokeObscurant',
    GroupOrSeriesOfTargets = 'GroupOrSeriesOfTargets',
    // SeriesOfTargets = 'SeriesOfTargets',
    // FireSupportStation = 'FireSupportStation',

    // Range fans
    WeaponSensorRangeFanCircular = 'WeaponSensorRangeFanCircular',
    WeaponSensorRangeFanSector = 'WeaponSensorRangeFanSector',

    // Line of contact
    LineOfContact = 'LineOfContact',

    // Additional mission tasks
    AttackByFire = 'AttackByFire',
    Destroy = 'Destroy',
    Exfiltrate = 'Exfiltrate',
    // Excluded — see ai/excluded-graphics.md
    // FollowAndAssume = 'FollowAndAssume',
    // FollowAndSupport = 'FollowAndSupport',
    Interdict = 'Interdict',
    Neutralize = 'Neutralize',
    SupportByFire = 'SupportByFire',
    Suppress = 'Suppress',

    // Field Fortification Symbols
    FightingPosition = 'FightingPosition',
    FortifiedLine = 'FortifiedLine',
}

const DISPLAY_NAME_OVERRIDES: Partial<Record<TacticalGraphicName, string>> = {
    [TacticalGraphicName.ArtilleryReservedArea]: 'artillery reserved area',
    [TacticalGraphicName.ArtilleryManeuverArea]: 'artillery maneuver area',
    [TacticalGraphicName.RadiologicalContaminatedArea]: 'radiological contaminated area',
    [TacticalGraphicName.NuclearContaminatedArea]: 'nuclear contaminated area',
    [TacticalGraphicName.ChemicalContaminatedArea]: 'chemical contaminated area',
    [TacticalGraphicName.BiologicalContaminatedArea]: 'biological contaminated area',
    [TacticalGraphicName.BiologicalContaminatedAreaToxicIndustrialMaterial]: 'biological contaminated area, toxic industrial material',
    [TacticalGraphicName.ChemicalContaminatedAreaToxicIndustrialMaterial]: 'chemical contaminated area, toxic industrial material',
    [TacticalGraphicName.RadiologicalContaminatedAreaToxicIndustrialMaterial]: 'radiological contaminated area, toxic industrial material',
    [TacticalGraphicName.NamedAreaOfInterestLine]: 'named area of interest line',
    [TacticalGraphicName.HandoverLine]: 'handover line',
    [TacticalGraphicName.DecisionLine]: 'decision line',
    [TacticalGraphicName.MobilityCorridor]: 'mobility corridor',
    [TacticalGraphicName.PsyOpsZoneIrregular]: 'PsyOps zone, irregular',
    [TacticalGraphicName.PsyOpsZoneRectangular]: 'PsyOps zone, rectangular',
    [TacticalGraphicName.PsyOpsZoneCircular]: 'PsyOps zone, circular',
    [TacticalGraphicName.MinefieldDynamicDepiction]: 'minefield, dynamic depiction',
    [TacticalGraphicName.MinedAreaFenced]: 'mined area, fenced',
    [TacticalGraphicName.MinimumSafeDistanceZone]: 'minimum safe distance zone',
    [TacticalGraphicName.MinimumSafeDistanceMultipleStrike]: 'minimum safe distance zone, multiple strike (STRIKWARN)',
    [TacticalGraphicName.RadiationDoseRateContourLine]: 'radiation dose rate contour line',
    [TacticalGraphicName.Mineline]: 'mineline',
    [TacticalGraphicName.MineCluster]: 'mine cluster',
    [TacticalGraphicName.TripWire]: 'trip wire',
    [TacticalGraphicName.RaftSite]: 'raft site',
    [TacticalGraphicName.FortifiedPosition]: 'fortified position',
    [TacticalGraphicName.LineGeneric]: 'line, generic',
    [TacticalGraphicName.AirfieldZone]: 'airfield zone',
    [TacticalGraphicName.SeverelyRestrictedTerrain]: 'severely restricted terrain',
    [TacticalGraphicName.RestrictedTerrain]: 'restricted terrain',
    [TacticalGraphicName.ZoneOfFire]: 'zone of fire',
    [TacticalGraphicName.AreaGeneric]: 'area, generic',
    [TacticalGraphicName.JointTacticalActionArea]: 'joint tactical action area',
    [TacticalGraphicName.SubmarineActionArea]: 'submarine action area',
    [TacticalGraphicName.SubmarineGeneratedActionArea]: 'submarine-generated action area',
    [TacticalGraphicName.Area]: 'area',
    [TacticalGraphicName.PenetrationBox]: 'penetration box',
    [TacticalGraphicName.EnemyPrisonerOfWarHoldingArea]: 'enemy prisoner of war holding area',
    [TacticalGraphicName.TerminallyGuidedMunitionFootprint]: 'terminally guided munition footprint',
    [TacticalGraphicName.AntiTankDitchUnderConstruction]: 'Anti-Tank Ditch, Under Construction',
    [TacticalGraphicName.AntiTankDitchCompleted]: 'Anti-Tank Ditch, Completed',
    [TacticalGraphicName.AntiTankDitchReinforcedWithMines]: 'Anti-Tank Ditch Reinforced, with Anti-Tank Mines',
    [TacticalGraphicName.RoadblockCompleteExecuted]: 'Roadblock Complete (Executed)',
    [TacticalGraphicName.ExplosivesPlannedStateOfReadiness]: 'Explosives, Planned State of Readiness',
    [TacticalGraphicName.ExplosivesStateOfReadiness1Safe]: 'Explosives, State of Readiness 1 (Safe)',
    [TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable]: 'Explosives, State of Readiness 2 (Armed but Passable)',
    [TacticalGraphicName.WireUnspecified]: 'Wire, Unspecified',
    [TacticalGraphicName.WireSingleFence]: 'Wire, Single Fence',
    [TacticalGraphicName.WireDoubleFence]: 'Wire, Double Fence',
    [TacticalGraphicName.WireDoubleApronFence]: 'Wire, Double Apron Fence',
    [TacticalGraphicName.WireLowWireFence]: 'Wire, Low Wire Fence',
    [TacticalGraphicName.WireHighWireFence]: 'Wire, High Wire Fence',
    [TacticalGraphicName.WireSingleConcertina]: 'Wire, Single Concertina',
    [TacticalGraphicName.WireDoubleStrandConcertina]: 'Wire, Double Strand Concertina',
    [TacticalGraphicName.WireTripleStrandConcertina]: 'Wire, Triple Strand Concertina',
    // [TacticalGraphicName.AttackHelicopterAxisOfAdvance]: 'attack helicopter axis of advance',
    [TacticalGraphicName.AviationAxisOfAdvance]: 'airborne or aviation axis of advance',
    // [TacticalGraphicName.SupportingAxisOfAdvance]: 'supporting axis of advance',
    // [TacticalGraphicName.AviationDirectionOfAttack]: 'aviation direction of attack',
    [TacticalGraphicName.FordEasy]: 'ford, easy',
    [TacticalGraphicName.FordDifficult]: 'ford, difficult',
    [TacticalGraphicName.UnmannedAircraftCorridor]: 'unmanned aircraft (UA) corridor',
    [TacticalGraphicName.FieldsOfFire]: 'fields of fire / sector of fire',
    [TacticalGraphicName.UnexplodedExplosiveOrdnanceArea]: 'unexploded explosive ordnance (UXO) area',
    [TacticalGraphicName.StandardUseArmyAircraftFlightRoute]: 'standard use Army aircraft flight route',
    [TacticalGraphicName.GroupOrSeriesOfTargets]: 'group/series of targets',
    [TacticalGraphicName.TacticalBlock]: 'block',
    [TacticalGraphicName.TacticalDisrupt]: 'disrupt',
    [TacticalGraphicName.TacticalFix]: 'fix',
    // Without this the menu reads "tactical turn" beside a "turn" in the next
    // category, while its three siblings show the bare doctrinal word in both.
    [TacticalGraphicName.TacticalTurn]: 'turn',

    [TacticalGraphicName.FortifiedLine]: 'fortified/trench line',

    // [TacticalGraphicName.LineOfContact]: 'line of contact',
    // [TacticalGraphicName.AirheadLine]: 'airhead line',
    // [TacticalGraphicName.ForwardArmingAndRefuelingPoint]: 'forward arming and refueling point',
    // [TacticalGraphicName.BattlePosition]: 'battle position',
};

/** Returns the display name for a graphic using spreadsheet-defined names where available. */
export function getDisplayName(name: TacticalGraphicName): string {
    if (name in DISPLAY_NAME_OVERRIDES) return DISPLAY_NAME_OVERRIDES[name]!;
    return name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/**
 * The mine types of APP-06 Table 8-24, codes 13 through 19.
 *
 * The table lists about forty codes; these seven are the primitives and the rest are
 * combinations of two or three of them, drawn across the icon's three slots. Only the
 * primitives are modeled — @see minePaints.ts for what expressing a combination would
 * take, and why it is not here.
 */
export enum TacticalGraphicMineType {
    unspecified = 'Unspecified Mine',
    antipersonnel = 'Antipersonnel Mine',
    antipersonnelDirectional = 'Antipersonnel Mine with Directional Effects',
    antitank = 'Antitank Mine',
    antitankAntihandling = 'Antitank Mine with Antihandling Device',
    wideAreaAntitank = 'Wide Area Antitank Mine',
    mineCluster = 'Mine Cluster',
}

/**
 * The **mobility** half of APP-06 Table 8-24, the Sector 1 modifiers.
 *
 * The table holds two categories under one numbering. Codes 13-50 are `MINE TYPE` and
 * carry the remark *"Used with minefields & mined areas only"*; the fourteen here are
 * `MOBILITY`, remarked *"For use with Limited Access Area, Restricted Terrain, and
 * Severely Restricted Terrain only."* That remark is the whole reason the two are
 * separate enums rather than one: a mine glyph offered on restricted terrain, or a
 * pack animal offered on a minefield, would both be outside the standard.
 *
 * The trailing comment on each member is its Sector 1 code. They are not contiguous --
 * `dismounted` is 51, sitting past the mine block at the table's end.
 *
 * @see TacticalGraphicMineType for the other half, and `sectorModifierPaints.ts` for
 * how each of these is drawn.
 */
export enum TacticalGraphicMobility {
    unspecified = 'Unspecified',                           // 00 - draws nothing
    standardMobility = 'Standard Mobility/On-Road',        // 01
    highMobility = 'High Mobility/Off-Road',               // 02
    tracked = 'Tracked',                                   // 03
    trackedAndWheeled = 'Tracked and Wheeled Combination', // 04
    towed = 'Towed',                                       // 05
    railway = 'Railway',                                   // 06
    overSnow = 'Over-Snow (Prime Mover)',                  // 07
    sled = 'Sled',                                         // 08
    packAnimal = 'Pack Animal',                            // 09
    barge = 'Barge',                                       // 10
    amphibious = 'Amphibious',                             // 11
    noVehicles = 'No Vehicles',                            // 12
    dismounted = 'Dismounted',                             // 51
}

/**
 * APP-06 Table 8-25, the Sector 2 modifiers -- every one of them `TERRAIN`.
 *
 * Unlike Sector 1 these are **words, not glyphs**: the table's MODIFIER column prints
 * `URBAN`, `WATER`, `GROUND`, `VEGETATION`, `OBSTACLES` in type, and the plates for
 * restricted terrain set that word under the mobility icon. What each one adds beyond
 * the word is an *optional hatching color*, which is why the value here is the label
 * and the color is a separate table. @see TERRAIN_HATCH_COLORS
 */
export enum TacticalGraphicTerrain {
    unspecified = 'Unspecified',   // 00 - no word, no color
    urban = 'Urban',               // 01 - black
    water = 'Water',               // 02 - blue
    ground = 'Ground',             // 03 - brown
    vegetation = 'Vegetation',     // 04 - green
    obstacles = 'Obstacles',       // 05 - green
}

export enum TacticalGraphicEchelon {
    squad = 'Squad',
    section = 'Section',
    platoonDetachment = 'Platoon/Detachment',
    companyBatteryTroop = 'Company/Battery/Troop',
    battalionSquadron = 'Battalion/Squadron',
    regimentGroup = 'Regiment/Group',
    brigade = 'Brigade',
    unknown = 'Unknown',
}

export enum TacticalGraphicHostility {
    assumedFriend = 'Assumed Friend',
    friend = 'Friend',
    hostileFaker = 'Hostile/Faker',
    neutral = 'Neutral',
    pending = 'Pending',
    suspectJoker = 'Suspect/Joker',
    unknown = 'Unknown',
}

/**
 * FM 1-02.2's status: whether the thing the symbol describes exists yet.
 *
 * Not drawn as a word — it decides whether the line work is solid or dashed.
 */
export enum TacticalGraphicStatus {
    present = 'Present',
    planned = 'Planned',
}

/**
 * What an altitude is measured **from**.
 *
 * FM 1-02.2's field X carries a number plus the thing it is relative to — the plates
 * print `1500FT AGL` and `20000FT AGL`, and the field description's own examples are
 * `1500MSL` and `FL150`. The datum belongs to the *value*, not to the host: two zones on
 * one map can honestly be one AGL and one MSL, so a global setting could never say so.
 * That is why this is a graphic property while {@link AltitudeUnit} is configuration.
 *
 * - `MSL` — above **mean sea level**. A true height from a real datum.
 * - `AGL` — above **ground level**. Also a true height, and a different one: 1500 AGL
 *   over a 3000 ft ridge is 4500 MSL, which is why the two cannot be folded together.
 * - `FL` — a **flight level**: hundreds of feet of *pressure* altitude against the
 *   standard 1013.25 hPa setting. Deliberately not a height above anything — above the
 *   transition altitude every aircraft uses the same reference, so flight levels
 *   separate aircraft from each other rather than placing them. It renders as `FL150`,
 *   with no unit and the number meaning 15,000 ft, which is why it takes its own branch
 *   in `formatAltitude` rather than a suffix.
 */
export enum AltitudeDatum {
    meanSeaLevel = 'MSL',
    aboveGroundLevel = 'AGL',
    flightLevel = 'FL',
}

/**
 * How sure the reporter is of a hostile contact — offered only for `hostileFaker`,
 * and drawn, like status, as a dash rather than a word.
 */
export enum TacticalGraphicConfidence {
    known = 'Known',
    suspected = 'Suspected',
}

/**
 * Which way traffic runs on a route, main supply route or alternate supply route.
 *
 * Chooses the arrows drawn in the route's designation box — none, one, two opposed, or
 * one beside the word `ALT`. That word is a literal in `routePaints`, not this value:
 * nothing here is printed.
 */
export enum RouteDirection {
    general = 'General',
    oneWay = 'One Way',
    twoWay = 'Two Way',
    alternating = 'Alternating',
}

export interface TacticalGraphicConfig {
    name: TacticalGraphicName;
    resolution: number;
    maxPoints?: number;
    size?: number;
    type: GeoJsonTypes;
}

// A `MapLibrary` enum once lived here naming the sample app's renderers; it was
// never the library's concern and has been removed. The library emits GeoJSON
// and has no opinion about which map renders it.