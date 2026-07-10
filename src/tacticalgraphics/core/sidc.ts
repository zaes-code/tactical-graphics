/**
 * Partial MIL-STD-2525E / APP-6D SIDC mapping for tactical graphics.
 *
 * SIDC format used here is the 20-character 2525E coding scheme.
 * Positions:
 *   1    - Coding Scheme        (G = Tactical Graphics)
 *   2    - Standard Identity    (F=Friend, H=Hostile, N=Neutral, U=Unknown, P=Pending)
 *   3-4  - Category / Subcategory
 *   5-6  - Status               (P=Present, A=Anticipated/Planned)
 *   7-10 - Function ID
 *   11-20- Modifiers (filled with hyphens when not used)
 *
 * The SIDC stored here uses '*' as a wildcard for the identity character (position 2)
 * so it matches regardless of hostility affiliation.
 *
 * Reference: MIL-STD-2525E Table B-II (Tactical Graphics)
 */

import {TacticalGraphicName} from './type';

// SIDC → TacticalGraphicName  (for parsing incoming data)
export const SIDC_TO_GRAPHIC: Record<string, TacticalGraphicName> = {
    // ── Movement ──────────────────────────────────────────────────────
    'G*GPGPA---': TacticalGraphicName.MainAxisOfAdvance,
    'G*GPGPAF--': TacticalGraphicName.MainAxisOfAdvanceFeint,
    'G*GPGAS---': TacticalGraphicName.SupportingAxisOfAdvance,
    'G*GPGAA---': TacticalGraphicName.AviationAxisOfAdvance,
    'G*GPGAX---': TacticalGraphicName.AttackHelicopterAxisOfAdvance,
    'G*GPGPC---': TacticalGraphicName.Counterattack,
    'G*GPGPE---': TacticalGraphicName.Exploitation,
    'G*GPGPP---': TacticalGraphicName.Penetration,

    // ── Direction Arrows ──────────────────────────────────────────────
    'G*GPGDM---': TacticalGraphicName.DirectionOfMainAttack,
    'G*GPGDS---': TacticalGraphicName.DirectionOfSupportingAttack,
    'G*GPGDMF--': TacticalGraphicName.DirectionOfMainAttackFeint,
    'G*GPGDF---': TacticalGraphicName.AviationDirectionOfAttack,

    // ── Phase Lines ───────────────────────────────────────────────────
    'G*GPGLP---': TacticalGraphicName.PhaseLine,
    'G*GPGLF---': TacticalGraphicName.ForwardEdgeOfBattleArea,
    'G*GPGLR---': TacticalGraphicName.ReleaseLine,
    'G*GPGLB---': TacticalGraphicName.BridgeheadLine,
    'G*GPGLH---': TacticalGraphicName.BattlefieldHandoverLine,
    'G*GPGLD---': TacticalGraphicName.DelayLine,
    'G*GPGLC---': TacticalGraphicName.FinalCoordinationLine,
    'G*GPGLL---': TacticalGraphicName.LimitOfAdvance,
    'G*GPGLLD--': TacticalGraphicName.LineOfDeparture,
    'G*GPGLDC--': TacticalGraphicName.LineOfDepartureOrLineOfContact,
    'G*GPGLPD--': TacticalGraphicName.ProbableLineOfDeployment,
    'G*GPGLIF--': TacticalGraphicName.IdentificationFriendOrFoeOff,
    'G*GPGLIO--': TacticalGraphicName.IdentificationFriendOrFoeOn,
    'G*GPGLFL--': TacticalGraphicName.ForwardLineOfOwnTroops,
    'G*GPGLA---': TacticalGraphicName.AirheadLine,
    'G*GPGLM---': TacticalGraphicName.MunitionFlightPath,

    // ── Fire Support Lines ────────────────────────────────────────────
    'G*GPGLS---': TacticalGraphicName.FireSupportCoordinationLine,
    'G*GPGLCF--': TacticalGraphicName.CoordinatedFireLine,
    'G*GPGLRFL-': TacticalGraphicName.RestrictiveFireLine,
    'G*GPGLICL-': TacticalGraphicName.IntelligenceCoordinationLine,
    'G*GPGLCSB-': TacticalGraphicName.CommonSensorBoundary,
    'G*GPGLEWL-': TacticalGraphicName.EngineerWorkLine,
    'G*GPGLFF--': TacticalGraphicName.FieldsOfFire,

    // ── Boundaries & Routes ───────────────────────────────────────────
    'G*GPGLBD--': TacticalGraphicName.Boundary,
    'G*GLPPR---': TacticalGraphicName.Route,
    'G*GLPPM---': TacticalGraphicName.MainSupplyRoute,
    'G*GLPPA---': TacticalGraphicName.AlternateSupplyRoute,

    // ── Air Corridors ─────────────────────────────────────────────────
    'G*GPAC----': TacticalGraphicName.AirCorridor,
    'G*GPACL---': TacticalGraphicName.LowLevelTransitRoute,
    'G*GPACM---': TacticalGraphicName.MinimumRiskRoute,
    'G*GPACS---': TacticalGraphicName.SafeLane,
    'G*GPACSP--': TacticalGraphicName.SpecialCorridor,
    'G*GPACSA--': TacticalGraphicName.StandardUseArmyAircraftFlightRoute,
    'G*GPACT---': TacticalGraphicName.TransitCorridor,
    'G*GPACU---': TacticalGraphicName.UnmannedAircraftCorridor,

    // ── Area Control Measures ─────────────────────────────────────────
    'G*GPAO----': TacticalGraphicName.ObjectiveArea,
    'G*GPAP----': TacticalGraphicName.AttackPosition,
    'G*GPAN----': TacticalGraphicName.NamedAreaOfInterest,
    'G*GPAT----': TacticalGraphicName.TargetAreaOfInterest,
    'G*GPAFA---': TacticalGraphicName.ForwardArmingAndRefuelingPoint,
    'G*GPASS---': TacticalGraphicName.AssaultPosition,
    'G*GPAA----': TacticalGraphicName.AreaOfOperations,
    'G*GPABC---': TacticalGraphicName.BaseCamp,
    'G*GPAG----': TacticalGraphicName.GuerrillaBase,
    'G*GPADH---': TacticalGraphicName.DetaineeHoldingArea,
    'G*GPAZM---': TacticalGraphicName.AssemblyArea,
    'G*GPAGE---': TacticalGraphicName.EngagementArea,
    'G*GPARH---': TacticalGraphicName.RefugeeHoldingArea,
    'G*GPASB---': TacticalGraphicName.BrigadeSupportArea,
    'G*GPASD---': TacticalGraphicName.DivisionSupportArea,
    'G*GPASC---': TacticalGraphicName.CorpsSupportArea,
    'G*GPADZ----': TacticalGraphicName.DropZone,
    'G*GPALZ---': TacticalGraphicName.LandingZone,
    'G*GPAKZ---': TacticalGraphicName.KillZone,
    'G*GPAPZ---': TacticalGraphicName.PickupZone,
    'G*GPAF----': TacticalGraphicName.Airfield,
    'G*GPABP---': TacticalGraphicName.BattlePosition,
    'G*GPABSP--': TacticalGraphicName.StrongPoint,
    // 'G*GPAS----': TacticalGraphicName.SearchArea,
    'G*GPAE----': TacticalGraphicName.Encirclement,
    'G*GPAFO---': TacticalGraphicName.FortifiedArea,
    'G*GPAUU---': TacticalGraphicName.UnexplodedExplosiveOrdnanceArea,

    // ── Fire Support Areas ────────────────────────────────────────────
    'G*GPAFFI--': TacticalGraphicName.FreeFireAreaIrregular,
    'G*GPAFFR--': TacticalGraphicName.FreeFireAreaRectangular,
    'G*GPAFFC--': TacticalGraphicName.FreeFireAreaCircular,
    'G*GPANFI--': TacticalGraphicName.NoFireAreaIrregular,
    'G*GPANFR--': TacticalGraphicName.NoFireAreaRectangular,
    'G*GPANFC--': TacticalGraphicName.NoFireAreaCircular,
    'G*GPARFI--': TacticalGraphicName.RestrictiveFireAreaIrregular,
    'G*GPARFR--': TacticalGraphicName.RestrictiveFireAreaRectangular,
    'G*GPARFC--': TacticalGraphicName.RestrictiveFireAreaCircular,
    'G*GPAPAI--': TacticalGraphicName.PositionAreaArtilleryIrregular,
    'G*GPAPAR--': TacticalGraphicName.PositionAreaArtilleryRectangular,
    'G*GPAPAC--': TacticalGraphicName.PositionAreaArtilleryCircular,
    'G*GPATII--': TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular,
    'G*GPATIR--': TacticalGraphicName.ArtilleryTargetIntelligenceZoneRectangular,
    'G*GPATIC--': TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular,
    'G*GPACFI--': TacticalGraphicName.CallForFireZoneIrregular,
    'G*GPACFR--': TacticalGraphicName.CallForFireZoneRectangular,
    'G*GPACFC--': TacticalGraphicName.CallForFireZoneCircular,
    'G*GPACNI--': TacticalGraphicName.CensorZoneIrregular,
    'G*GPACNR--': TacticalGraphicName.CensorZoneRectangular,
    'G*GPACNC--': TacticalGraphicName.CensorZoneCircular,
    'G*GPACFZI-': TacticalGraphicName.CriticalFriendlyZoneIrregular,
    'G*GPACFRI-': TacticalGraphicName.CriticalFriendlyZoneRectangular,
    'G*GPACFCI-': TacticalGraphicName.CriticalFriendlyZoneCircular,
    'G*GPADSI--': TacticalGraphicName.DeadSpaceAreaIrregular,
    'G*GPADSR--': TacticalGraphicName.DeadSpaceAreaRectangular,
    'G*GPADSC--': TacticalGraphicName.DeadSpaceAreaCircular,
    'G*GPAKBI--': TacticalGraphicName.BlueKillBoxIrregular,
    'G*GPAKBR--': TacticalGraphicName.BlueKillBoxRectangular,
    'G*GPAKBC--': TacticalGraphicName.BlueKillBoxCircular,
    'G*GPAKPI--': TacticalGraphicName.PurpleKillBoxIrregular,
    'G*GPAKPR--': TacticalGraphicName.PurpleKillBoxRectangular,
    'G*GPAKPC--': TacticalGraphicName.PurpleKillBoxCircular,
    'G*GPAFSI--': TacticalGraphicName.FireSupportAreaIrregular,
    'G*GPAFSR--': TacticalGraphicName.FireSupportAreaRectangular,
    'G*GPAFSC--': TacticalGraphicName.FireSupportAreaCircular,
    'G*GPATI---': TacticalGraphicName.TargetAreaIrregular,
    'G*GPATR---': TacticalGraphicName.TargetAreaRectangular,
    'G*GPATC---': TacticalGraphicName.TargetAreaCircular,

    // ── Airspace Areas ────────────────────────────────────────────────
    'G*GPACH---': TacticalGraphicName.HighDensityAirspaceControlZone,
    'G*GPACR---': TacticalGraphicName.RestrictedOperationsZone,
    'G*GPACAA--': TacticalGraphicName.AirToAirRefuelingRestrictedOperationsZone,
    'G*GPACUA--': TacticalGraphicName.UnmannedAircraftRestrictedOperationsZone,
    'G*GPACWE--': TacticalGraphicName.WeaponEngagementZone,
    'G*GPACJE--': TacticalGraphicName.JointEngagementZone,
    'G*GPACME--': TacticalGraphicName.MissileEngagementZone,
    'G*GPACLM--': TacticalGraphicName.LowAltitudeMissileEngagementZone,
    'G*GPACHM--': TacticalGraphicName.HighAltitudeMissileEngagementZone,
    'G*GPACSH--': TacticalGraphicName.ShortRangeAirDefenseEngagementZone,
    'G*GPACWF--': TacticalGraphicName.WeaponsFreeZone,
    'G*GPACAI--': TacticalGraphicName.AirSpaceCoordinationAreaIrregular,
    'G*GPACAR--': TacticalGraphicName.AirSpaceCoordinationAreaRectangular,
    'G*GPACAC--': TacticalGraphicName.AirSpaceCoordinationAreaCircular,

    // ── Mission Tasks ─────────────────────────────────────────────────
    'G*GPTMB---': TacticalGraphicName.TacticalBlock,
    'G*GPTMBR--': TacticalGraphicName.Breach,
    'G*GPTMBY--': TacticalGraphicName.Bypass,
    'G*GPTMC---': TacticalGraphicName.Canalize,
    'G*GPTMCL--': TacticalGraphicName.Clear,
    'G*GPTMD---': TacticalGraphicName.TacticalDisrupt,
    'G*GPTMF---': TacticalGraphicName.TacticalFix,
    'G*GPTMT---': TacticalGraphicName.TacticalTurn,
    'G*GPTMSE--': TacticalGraphicName.Secure,
    'G*GPTMI---': TacticalGraphicName.Isolate,
    'G*GPTMR---': TacticalGraphicName.Retain,
    'G*GPTMCO--': TacticalGraphicName.Control,
    'G*GPTMCS--': TacticalGraphicName.CordonAndSearch,
    'G*GPTMCN--': TacticalGraphicName.Contain,
    'G*GPTMO---': TacticalGraphicName.Occupy,
    'G*GPTMAD--': TacticalGraphicName.AreaDefense,
    'G*GPTMPE--': TacticalGraphicName.Penetration,
    'G*GPTMEX--': TacticalGraphicName.Exploitation,

    // ── Security Operations ───────────────────────────────────────────
    'G*GPSC----': TacticalGraphicName.Cover,
    'G*GPSG----': TacticalGraphicName.Guard,
    'G*GPSS----': TacticalGraphicName.Screen,

    // ── Retrograde Missions ───────────────────────────────────────────
    'G*GPRY----': TacticalGraphicName.Delay,
    'G*GPRW----': TacticalGraphicName.Withdraw,
    'G*GPRWP---': TacticalGraphicName.WithdrawUnderPressure,
    'G*GPRDI---': TacticalGraphicName.Disengage,
    'G*GPRRT---': TacticalGraphicName.Retirement,
    'G*GPRPF---': TacticalGraphicName.ForwardPassageOfLines,
    'G*GPRPR---': TacticalGraphicName.RearwardPassageOfLines,

    // ── Forms of Maneuver ─────────────────────────────────────────────
    'G*GPGPF---': TacticalGraphicName.FrontalAttack,
    // 'G*GPGPFL--': TacticalGraphicName.FlankAttack,
    'G*GPGPT---': TacticalGraphicName.TurningMovement,
    'G*GPGPI---': TacticalGraphicName.Infiltration,
    'G*GPGPM---': TacticalGraphicName.MovementToContact,
    'G*GPGPU---': TacticalGraphicName.Pursuit,
    'G*GPGPEV--': TacticalGraphicName.Envelopment,
    // 'G*GPGPDE--': TacticalGraphicName.DoubleEnvelopment,
    'G*GPGPMD--': TacticalGraphicName.MobileDefense,
    'G*GPGPAB--': TacticalGraphicName.Ambush,
    'G*GPGPRP--': TacticalGraphicName.ReliefInPlace,

    // ── Area Control Measures (additional) ───────────────────────────
    'G*GPALA---': TacticalGraphicName.LimitedAccessArea,

    // ── Convoy ───────────────────────────────────────────────────────
    'G*GPLCM---': TacticalGraphicName.MovingConvoy,
    'G*GPLCH---': TacticalGraphicName.HaltedConvoy,

    // ── Target Control Measures ───────────────────────────────────────
    // 'G*GPTRP---': TacticalGraphicName.TargetReferencePoint,
    // 'G*GPTPT---': TacticalGraphicName.PointTarget,
    'G*GPTLT---': TacticalGraphicName.LinearTarget,
    'G*GPTFPF--': TacticalGraphicName.FinalProtectiveFire,
    'G*GPTLST--': TacticalGraphicName.LinearSmokeTarget,
    'G*GPTASP--': TacticalGraphicName.SmokeObscurant,
    'G*GPTGT---': TacticalGraphicName.GroupOrSeriesOfTargets,
    // 'G*GPTST---': TacticalGraphicName.SeriesOfTargets,
    // 'G*GPTFSS--': TacticalGraphicName.FireSupportStation,

    // ── Range Fans ────────────────────────────────────────────────────
    'G*GPRFC---': TacticalGraphicName.WeaponSensorRangeFanCircular,
    'G*GPRFS---': TacticalGraphicName.WeaponSensorRangeFanSector,

    // ── Additional Mission Tasks ──────────────────────────────────────
    'G*GPTMAF--': TacticalGraphicName.AttackByFire,
    'G*GPTMDS--': TacticalGraphicName.Destroy,
    'G*GPTMEF--': TacticalGraphicName.Exfiltrate,
    'G*GPTMFA--': TacticalGraphicName.FollowAndAssume,
    'G*GPTMFS--': TacticalGraphicName.FollowAndSupport,
    'G*GPTMIN--': TacticalGraphicName.Interdict,
    'G*GPTMNT--': TacticalGraphicName.Neutralize,
    'G*GPTMSB--': TacticalGraphicName.SupportByFire,
    'G*GPTMSU--': TacticalGraphicName.Suppress,

    // ── Obstacles & Engineer ──────────────────────────────────────────
    'G*MPOB----': TacticalGraphicName.ObstacleBelt,
    'G*MPOG----': TacticalGraphicName.ObstacleGroup,
    'G*MPOZ----': TacticalGraphicName.ObstacleZone,
    'G*MPOFZ---': TacticalGraphicName.ObstacleFreeArea,
    'G*MPORZ---': TacticalGraphicName.ObstacleRestrictedArea,
    'G*MPOL----': TacticalGraphicName.ObstacleLine,
    'G*MPEB----': TacticalGraphicName.Bridge,
    'G*MPEA----': TacticalGraphicName.AssaultCrossing,
    'G*MPEG----': TacticalGraphicName.Gap,
    'G*MPEF----': TacticalGraphicName.FordEasy,
    'G*MPEFH---': TacticalGraphicName.FordDifficult,
    'G*MPEFC---': TacticalGraphicName.FerryCrossing,
    'G*MPEPL---': TacticalGraphicName.PassageLane,
};

// TacticalGraphicName → SIDC  (for exporting / serializing)
export const GRAPHIC_TO_SIDC: Partial<Record<TacticalGraphicName, string>> = Object.fromEntries(
    Object.entries(SIDC_TO_GRAPHIC).map(([sidc, name]) => [name, sidc])
) as Partial<Record<TacticalGraphicName, string>>;

/** Returns the SIDC for a given graphic, or undefined if not yet mapped. */
export function getSIDC(name: TacticalGraphicName): string | undefined {
    return GRAPHIC_TO_SIDC[name];
}

/** Resolves a TacticalGraphicName from a SIDC prefix (first 10 chars, identity wildcarded). */
export function fromSIDC(sidc: string): TacticalGraphicName | undefined {
    const key = sidc.substring(0, 2) + '*' + sidc.substring(3, 10);
    return SIDC_TO_GRAPHIC[sidc.substring(0, 10)] ?? SIDC_TO_GRAPHIC[key];
}
