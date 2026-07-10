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

/** Options for area graphics that carry an echelon modifier (e.g. BattlePosition). */
export interface EchelonAreaOptions extends BaseGraphicOptions {
    echelon?: TacticalGraphicEchelon;
}

/** Options for circular area graphics drawn with a center + radius. */
export interface CircularAreaOptions extends BaseGraphicOptions {
    /** Radius in map units. */
    radius?: number;
}

/** Options for the Encirclement graphic which uses a hostility arrow colour. */
export interface EncirclementOptions extends BaseGraphicOptions {
    hostility?: TacticalGraphicHostility;
}

/** Options for route / supply-route graphics. */
export interface RouteOptions extends BaseGraphicOptions {
    direction?: RouteDirection;
}

/** Options for security-operation fan graphics (Cover/Guard/Screen). */
export interface SecurityOperationOptions extends BaseGraphicOptions {
    centerPadding: number;
    arrowLength: number;
    arrowDepth: number;
    arrowHeadLength: number;
    arrowHeadDegree: number;
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
    range: number;
    /** Optional user-entered name shown above the auto-generated range line. */
    label?: string;
    /** Optional altitude string rendered as "ALT <altitude>" below the range label. */
    altitude?: string;
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
 * Union of all typed option bags.
 * Use the specific interface when you know the graphic type;
 * use this union at the generic adapter boundary.
 */
export type GraphicOptions =
    | BaseGraphicOptions
    | MovementOptions
    | CorridorOptions
    | EchelonAreaOptions
    | CircularAreaOptions
    | EncirclementOptions
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

        case TacticalGraphicName.HighDensityAirspaceControlZone:
            return 'HDACZ';
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
        case TacticalGraphicName.FollowAndAssume:
            return 'F/A';
        case TacticalGraphicName.FollowAndSupport:
            return 'F/S';
        case TacticalGraphicName.Interdict:
            return 'I';
        case TacticalGraphicName.Neutralize:
            return 'N';
        case TacticalGraphicName.SupportByFire:
            return 'SBF';
        case TacticalGraphicName.Suppress:
            return 'S';

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
    Counterattack = 'Counterattack',

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

    ObstacleLine = 'ObstacleLine',
    TacticalFix = 'TacticalFix',
    TacticalTurn = 'TacticalTurn',

    DirectionOfMainAttack = 'DirectionOfMainAttack',
    DirectionOfSupportingAttack = 'DirectionOfSupportingAttack',
    DirectionOfMainAttackFeint = 'DirectionOfMainAttackFeint',
    AviationDirectionOfAttack = 'AviationDirectionOfAttack',

    // Forms of maneuver / offensive operations
    Infiltration = 'Infiltration',
    InfiltrationLane = "InfiltrationLane",
    MovementToContact = 'MovementToContact',
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
    MovingConvoy = 'MovingConvoy',
    HaltedConvoy = 'HaltedConvoy',

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
    FollowAndAssume = 'FollowAndAssume',
    FollowAndSupport = 'FollowAndSupport',
    Interdict = 'Interdict',
    Neutralize = 'Neutralize',
    SupportByFire = 'SupportByFire',
    Suppress = 'Suppress',

    // Field Fortification Symbols
    FightingPosition = 'FightingPosition',
    FortifiedLine = 'FortifiedLine',
}

const DISPLAY_NAME_OVERRIDES: Partial<Record<TacticalGraphicName, string>> = {
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

export enum TacticalGraphicStatus {
    present = 'present',
    planned = 'planned',
}

export enum TacticalGraphicConfidence {
    known = 'known',
    suspected = 'suspected',
}

export enum RouteDirection {
    GENERAL = 'GENERAL',
    ONE_WAY = 'ONE_WAY',
    TWO_WAY = 'TWO_WAY',
    ALTERNATING = 'ALTERNATING',
}

export interface TacticalGraphicConfig {
    name: TacticalGraphicName;
    resolution: number;
    maxPoints?: number;
    size?: number;
    type: GeoJsonTypes;
}

// `MapLibrary` moved to `src/components/mapLibrary.ts`. It names the sample
// app's renderers, which is not the library's concern.