import {IGraphicGenerator, TacticalGraphicName} from "./type";
import {AirCorridor} from "../graphics/AirCorridor";
import {ObstacleLine, Phaseline} from "../graphics/Phaseline";
import {Airfield} from "../graphics/Airfield";
import {FortifiedPosition, MineCluster, Mineline, RaftSite, TripWire} from "../graphics/ProtectionLine";
import {DecisionLine, MobilityCorridor} from "../graphics/EndGlyphLine";
import {SweptArcTask} from "../graphics/SweptArcTask";
import {Demonstration, Escort} from "../graphics/EscortAndDemonstration";
import {ObstacleBypass} from "../graphics/ObstacleBypass";
import {MinimumSafeDistanceMultipleStrike, MinimumSafeDistanceZone} from "../graphics/SafeDistanceZone";
import {AreaGraphic, RectangularArea, EncirclementArea, FortifiedArea, Obstacle, ObstacleFree} from "../graphics/AreaGraphic";
import {RectangularTarget} from "../graphics/RectangularTarget";
import {EllipticalArea, RadarSearchDoctrine} from "../graphics/MaritimeArea";
import {isRectangular} from "./handles";
import {
    AreaDefense,
    CircularArea,
    Contain,
    Control,
    CordonAndKnock,
    CordonAndSearch,
    Deny,
    Locate,
    Isolate,
    Occupy,
    Retain,
    Secure
} from "../graphics/MissionTask";
import {SearchArea} from "../graphics/SearchArea";
import {SecurityOperation} from "../graphics/SecurityOperation";
import {Block} from "../graphics/Block";
import {Breach} from "../graphics/Breach";
import {Bypass} from "../graphics/Bypass";
import {Canalize} from "../graphics/Canalize";
import {Clear} from "../graphics/Clear";
import {Disrupt} from "../graphics/Disrupt";
import {Exfiltrate, Infiltration, RetrogradeTask} from "../graphics/RetrogradeTask";
import {FieldsOfFire} from "../graphics/FieldsOfFire";
import {ForwardLineOfOwnTroops, LineOfContact} from "../graphics/ForwardLineOfOwnTroops";
import {Bridge} from "../graphics/Bridge";
import {Ford, FordHard} from "../graphics/Ford";
import {FerryCrossing} from "../graphics/FerryCrossing";
import {PassageLane} from "../graphics/PassageLane";
import {SafeLaneOrGap} from "../graphics/SafeLaneOrGap";
import {OverheadWire} from "../graphics/OverheadWire";
import {Fix} from "../graphics/Fix";
import {Turn} from "../graphics/Turn";
import {AviationDirectionOfAttack, DirectionOfMainAttack, DirectionOfMainAttackFeint, DirectionOfSupportingAttack} from "../graphics/Direction";
import {FollowTask} from "../graphics/FollowTask";
import {AttackHelicopterAxisOfAdvance, AvenueOfApproach, AviationAxisOfAdvance, Counterattack, CounterattackByFire, MainAttack, MainAttackFeint, SupportingAttack} from "../graphics/Movement";
import {Penetration} from "../graphics/Penetration";
import {FightingPosition, FortifiedLine} from "../graphics/FieldFortification";
import {Exploitation} from "../graphics/Exploitation";
import {
    Ambush,
    // DoubleEnvelopment,
    Envelopment,
    // FlankAttack,
    FrontalAttack,
    InfiltrationLane,
    MobileDefense,
    AdvanceToContact,
    MovementToContact,
    Pursuit,
    ReliefInPlace,
    TurningMovement,
} from "../graphics/FormsOfManeuver";
import {WeaponRangeFanCircular, WeaponRangeFanSector} from "../graphics/RangeFan";
import {NamedBlockArrow} from "../graphics/AdditionalMissionTasks";
import {Defeat} from '../graphics/Defeat';
import {CrossedMissionTask} from "../graphics/CrossedMissionTask";
import {Abatis} from "../graphics/Abatis";
import {WireObstacle} from "../graphics/WireObstacle";
import {ExplosivesReadiness} from "../graphics/ExplosivesReadiness";
import {RoadblockComplete} from "../graphics/RoadblockComplete";
import {AntiTankDitch} from "../graphics/AntiTankDitch";

// Class used to provide a map between the Tactical Graphic Name and the generator that creates the GeoJSON representation of it.
export class TacticalGraphicsRegistry {
    private static registry = new Map<string, IGraphicGenerator>();

    static register(generator: IGraphicGenerator): void {
        if (this.registry.has(generator.name)) {
            throw new Error(`Duplicate graphic name: ${generator.name}`);
        }
        this.registry.set(generator.name, generator);

    }

    static get(name: string): IGraphicGenerator | undefined {
        return this.registry.get(name);
    }

    static list(): string[] {
        return Array.from(this.registry.keys());
    }
}

// movement graphics
TacticalGraphicsRegistry.register(new Abatis());
TacticalGraphicsRegistry.register(new WireObstacle(TacticalGraphicName.WireUnspecified));
TacticalGraphicsRegistry.register(new WireObstacle(TacticalGraphicName.WireSingleFence));
TacticalGraphicsRegistry.register(new WireObstacle(TacticalGraphicName.WireDoubleFence));
TacticalGraphicsRegistry.register(new WireObstacle(TacticalGraphicName.WireDoubleApronFence));
TacticalGraphicsRegistry.register(new WireObstacle(TacticalGraphicName.WireLowWireFence));
TacticalGraphicsRegistry.register(new WireObstacle(TacticalGraphicName.WireHighWireFence));
TacticalGraphicsRegistry.register(new WireObstacle(TacticalGraphicName.WireSingleConcertina));
TacticalGraphicsRegistry.register(new WireObstacle(TacticalGraphicName.WireDoubleStrandConcertina));
TacticalGraphicsRegistry.register(new WireObstacle(TacticalGraphicName.WireTripleStrandConcertina));

// The three demolition readiness states: one shape, dashed differently. See the class.
TacticalGraphicsRegistry.register(new ExplosivesReadiness(TacticalGraphicName.ExplosivesPlannedStateOfReadiness));
TacticalGraphicsRegistry.register(new ExplosivesReadiness(TacticalGraphicName.ExplosivesStateOfReadiness1Safe));
TacticalGraphicsRegistry.register(new ExplosivesReadiness(TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable));
TacticalGraphicsRegistry.register(new RoadblockComplete());
TacticalGraphicsRegistry.register(new AntiTankDitch(TacticalGraphicName.AntiTankDitchUnderConstruction));
TacticalGraphicsRegistry.register(new AntiTankDitch(TacticalGraphicName.AntiTankDitchCompleted));
TacticalGraphicsRegistry.register(new AntiTankDitch(TacticalGraphicName.AntiTankDitchReinforcedWithMines));

TacticalGraphicsRegistry.register(new AttackHelicopterAxisOfAdvance());
TacticalGraphicsRegistry.register(new AviationAxisOfAdvance());
TacticalGraphicsRegistry.register(new MainAttack());
TacticalGraphicsRegistry.register(new MainAttackFeint());
TacticalGraphicsRegistry.register(new SupportingAttack());
TacticalGraphicsRegistry.register(new Counterattack());
TacticalGraphicsRegistry.register(new CounterattackByFire());
TacticalGraphicsRegistry.register(new AvenueOfApproach());

let airCorridorGraphics = [
    TacticalGraphicName.AirCorridor,
    TacticalGraphicName.LowLevelTransitRoute,
    TacticalGraphicName.MinimumRiskRoute,
    TacticalGraphicName.SafeLane,
    TacticalGraphicName.SpecialCorridor,
    TacticalGraphicName.StandardUseArmyAircraftFlightRoute,
    TacticalGraphicName.TransitCorridor,
    TacticalGraphicName.UnmannedAircraftCorridor,
]
airCorridorGraphics.forEach(name => TacticalGraphicsRegistry.register(new AirCorridor(name)));

TacticalGraphicsRegistry.register(new DirectionOfMainAttack());
TacticalGraphicsRegistry.register(new DirectionOfSupportingAttack());
TacticalGraphicsRegistry.register(new DirectionOfMainAttackFeint());
TacticalGraphicsRegistry.register(new AviationDirectionOfAttack());

let phaseLineGraphicNames: TacticalGraphicName[] = [
    TacticalGraphicName.PhaseLine,
    TacticalGraphicName.ForwardEdgeOfBattleArea,
    TacticalGraphicName.ReleaseLine,
    TacticalGraphicName.BridgeheadLine,
    TacticalGraphicName.BattlefieldHandoverLine,
    TacticalGraphicName.DelayLine,
    TacticalGraphicName.FinalCoordinationLine,
    TacticalGraphicName.LimitOfAdvance,
    TacticalGraphicName.LineOfDeparture,
    TacticalGraphicName.LineOfDepartureOrLineOfContact,
    TacticalGraphicName.ProbableLineOfDeployment,
    TacticalGraphicName.FireSupportCoordinationLine,
    TacticalGraphicName.CoordinatedFireLine,
    TacticalGraphicName.Boundary,
    TacticalGraphicName.Route,
    TacticalGraphicName.MainSupplyRoute,
    TacticalGraphicName.AlternateSupplyRoute,
    TacticalGraphicName.CommonSensorBoundary,
    // APP-06 §8.11. Every one is a plain two-point run — `Phaseline` is the generator for
    // every simple line here, and what makes each of these its own symbol is the letter
    // its paint sets and, for 220104, the dash. @see bearingLinePaint
    TacticalGraphicName.BearingLine,
    TacticalGraphicName.BearingLineElectronic,
    TacticalGraphicName.BearingLineElectromagneticWarfare,
    TacticalGraphicName.BearingLineAcoustic,
    TacticalGraphicName.BearingLineAcousticAmbiguous,
    TacticalGraphicName.BearingLineTorpedo,
    TacticalGraphicName.BearingLineElectroOpticalIntercept,
    TacticalGraphicName.BearingLineJammer,
    TacticalGraphicName.BearingLineRadioDirectionFinder,
    TacticalGraphicName.NavigationalRhumbLine,
    TacticalGraphicName.LightLine,
    TacticalGraphicName.LineGeneric,
    TacticalGraphicName.HandoverLine,
    TacticalGraphicName.NamedAreaOfInterestLine,
    TacticalGraphicName.HoldingLine,
    TacticalGraphicName.NoFireLine,
    TacticalGraphicName.BattlefieldCoordinationLine,
    TacticalGraphicName.RestrictiveFireLine,
    TacticalGraphicName.IntelligenceCoordinationLine,
    TacticalGraphicName.EngineerWorkLine,
    TacticalGraphicName.IdentificationFriendOrFoeOff,
    TacticalGraphicName.IdentificationFriendOrFoeOn,
    TacticalGraphicName.MunitionFlightPath,
]
phaseLineGraphicNames.forEach((name) => TacticalGraphicsRegistry.register(new Phaseline(name)));

TacticalGraphicsRegistry.register(new FieldsOfFire());

TacticalGraphicsRegistry.register(new ForwardLineOfOwnTroops());
TacticalGraphicsRegistry.register(new LineOfContact());

let bridgeGraphicNames = [TacticalGraphicName.Bridge, TacticalGraphicName.Gap, TacticalGraphicName.AssaultCrossing]
bridgeGraphicNames.forEach(name => TacticalGraphicsRegistry.register(new Bridge(name)));

TacticalGraphicsRegistry.register(new Ford());
TacticalGraphicsRegistry.register(new FordHard());

TacticalGraphicsRegistry.register(new FerryCrossing());

TacticalGraphicsRegistry.register(new PassageLane());
TacticalGraphicsRegistry.register(new SafeLaneOrGap());
TacticalGraphicsRegistry.register(new OverheadWire());

let areaGraphicNames = [TacticalGraphicName.ObjectiveArea,
    TacticalGraphicName.AttackPosition,
    TacticalGraphicName.NamedAreaOfInterest,
    TacticalGraphicName.TargetAreaOfInterest,
    TacticalGraphicName.ForwardArmingAndRefuelingPoint,
    TacticalGraphicName.AssaultPosition,
    TacticalGraphicName.AreaOfOperations,
    TacticalGraphicName.BaseCamp,
    TacticalGraphicName.GuerrillaBase,
    TacticalGraphicName.DetaineeHoldingArea,
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
    TacticalGraphicName.ZoneOfFire,
    TacticalGraphicName.RestrictedTerrain,
    TacticalGraphicName.SeverelyRestrictedTerrain,
    TacticalGraphicName.BiologicalContaminatedArea,
    TacticalGraphicName.BiologicalContaminatedAreaToxicIndustrialMaterial,
    TacticalGraphicName.ChemicalContaminatedArea,
    TacticalGraphicName.ChemicalContaminatedAreaToxicIndustrialMaterial,
    TacticalGraphicName.NuclearContaminatedArea,
    TacticalGraphicName.RadiologicalContaminatedArea,
    TacticalGraphicName.RadiologicalContaminatedAreaToxicIndustrialMaterial,
    TacticalGraphicName.ArtilleryManeuverArea,
    TacticalGraphicName.ArtilleryReservedArea,
    TacticalGraphicName.AssemblyArea,
    TacticalGraphicName.EngagementArea,
    TacticalGraphicName.RefugeeHoldingArea,
    TacticalGraphicName.BrigadeSupportArea,
    TacticalGraphicName.DivisionSupportArea,
    TacticalGraphicName.CorpsSupportArea,
    TacticalGraphicName.FighterEngagementZone,
    TacticalGraphicName.ExtractionZone,
    TacticalGraphicName.RegimentalSupportArea,
    TacticalGraphicName.DropZone,
    TacticalGraphicName.LandingZone,
    TacticalGraphicName.KillZone,
    TacticalGraphicName.PickupZone,
    TacticalGraphicName.AirfieldZone,
    TacticalGraphicName.RadiationDoseRateContourLine,
    TacticalGraphicName.MinefieldDynamicDepiction,
    TacticalGraphicName.MinedArea,
    TacticalGraphicName.MinedAreaFenced,
    TacticalGraphicName.PsyOpsZoneIrregular,
    TacticalGraphicName.PsyOpsZoneRectangular,
    TacticalGraphicName.BattlePosition,
    TacticalGraphicName.BattlePositionPreparedButNotOccupied,
    TacticalGraphicName.StrongPoint,

    TacticalGraphicName.FreeFireAreaIrregular,
    TacticalGraphicName.FreeFireAreaRectangular,
    TacticalGraphicName.NoFireAreaIrregular,
    TacticalGraphicName.NoFireAreaRectangular,
    TacticalGraphicName.RestrictiveFireAreaIrregular,
    TacticalGraphicName.RestrictiveFireAreaRectangular,
    TacticalGraphicName.PositionAreaArtilleryIrregular,
    TacticalGraphicName.PositionAreaArtilleryRectangular,
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular,
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneRectangular,
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
    TacticalGraphicName.CriticalFriendlyZoneIrregular,
    TacticalGraphicName.CriticalFriendlyZoneRectangular,
    TacticalGraphicName.DeadSpaceAreaIrregular,
    TacticalGraphicName.DeadSpaceAreaRectangular,
    TacticalGraphicName.BlueKillBoxIrregular,
    TacticalGraphicName.BlueKillBoxRectangular,
    TacticalGraphicName.PurpleKillBoxIrregular,
    TacticalGraphicName.PurpleKillBoxRectangular,
    TacticalGraphicName.FireSupportAreaIrregular,
    TacticalGraphicName.FireSupportAreaRectangular,
    TacticalGraphicName.TargetAreaIrregular,
    TacticalGraphicName.HighDensityAirspaceControlZone,
    TacticalGraphicName.RestrictedOperationsZone,
    TacticalGraphicName.AirToAirRefuelingRestrictedOperationsZone,
    TacticalGraphicName.UnmannedAircraftRestrictedOperationsZone,
    TacticalGraphicName.WeaponEngagementZone,
    TacticalGraphicName.JointEngagementZone,
    TacticalGraphicName.MissileEngagementZone,
    TacticalGraphicName.LowAltitudeMissileEngagementZone,
    TacticalGraphicName.HighAltitudeMissileEngagementZone,
    TacticalGraphicName.ShortRangeAirDefenseEngagementZone,
    TacticalGraphicName.WeaponsFreeZone,
    TacticalGraphicName.AirSpaceCoordinationAreaRectangular,
    TacticalGraphicName.AirSpaceCoordinationAreaIrregular,
    TacticalGraphicName.UnexplodedExplosiveOrdnanceArea,
    TacticalGraphicName.AirheadLine,
    // APP-06 240804. `isRectangular` routes it to `RectangularArea` below, which is the
    // right generator: two anchor points and a width. Its centre cross is a *paint*, not
    // geometry, because the plate fixes it upright however the box is turned.
    TacticalGraphicName.TargetAreaSingleTargetAegis,
    // APP-06 200202 and 200402: "two anchor points and a width, defined in metres" -- this
    // family's rule word for word, so `isRectangular` routes both to `RectangularArea`.
    TacticalGraphicName.DefendedAreaRectangle,
    TacticalGraphicName.ShipAreaOfInterestRectangle,
]

areaGraphicNames.forEach(name => TacticalGraphicsRegistry.register(
    // **The rectangles are not drawn areas.** APP-06 defines each as two anchor points and
    // a width, so its base is the axis and its shape is derived — where an irregular area's
    // base *is* its outline. @see RectangularArea, isRectangular
    isRectangular(name) ? new RectangularArea(name) : new AreaGraphic(name),
))

/**
 * **One anchor point, not two.** Its plate builds the box from amplifiers, so it shares
 * neither a base shape nor a generator with the rectangles above. @see RectangularTarget
 */
TacticalGraphicsRegistry.register(new RectangularTarget(TacticalGraphicName.TargetAreaRectangular));

//Mission Task Graphics
TacticalGraphicsRegistry.register(new Control());
TacticalGraphicsRegistry.register(new CordonAndSearch());
TacticalGraphicsRegistry.register(new CordonAndKnock());
TacticalGraphicsRegistry.register(new Locate());
TacticalGraphicsRegistry.register(new Deny());
TacticalGraphicsRegistry.register(new Isolate());
TacticalGraphicsRegistry.register(new Retain());
TacticalGraphicsRegistry.register(new Secure());
TacticalGraphicsRegistry.register(new Contain());
TacticalGraphicsRegistry.register(new Occupy());
TacticalGraphicsRegistry.register(new AreaDefense());

let circularAreaGraphicNames = [
    TacticalGraphicName.FreeFireAreaCircular,
    TacticalGraphicName.NoFireAreaCircular,
    TacticalGraphicName.RestrictiveFireAreaCircular,
    TacticalGraphicName.PositionAreaArtilleryCircular,
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular,
    TacticalGraphicName.CallForFireZoneCircular,
    TacticalGraphicName.TargetBuildUpAreaCircular,
    TacticalGraphicName.TargetValueAreaCircular,
    TacticalGraphicName.ZoneOfResponsibilityCircular,
    TacticalGraphicName.CensorZoneCircular,
    TacticalGraphicName.CriticalFriendlyZoneCircular,
    TacticalGraphicName.DeadSpaceAreaCircular,
    TacticalGraphicName.BlueKillBoxCircular,
    TacticalGraphicName.PurpleKillBoxCircular,
    TacticalGraphicName.FireSupportAreaCircular,
    TacticalGraphicName.TargetAreaCircular,
    TacticalGraphicName.AirSpaceCoordinationAreaCircular,
    TacticalGraphicName.PsyOpsZoneCircular,
    // APP-06 200300 and 200500: "one anchor point and a radius", the circular family's rule.
    TacticalGraphicName.NoAttackZone,
    TacticalGraphicName.ActiveManeuverArea,
]
circularAreaGraphicNames.forEach(name => TacticalGraphicsRegistry.register(new CircularArea(name)));

// APP-06 131900 is a one-point symbol, not an area. @see graphics/Airfield.ts
TacticalGraphicsRegistry.register(new Airfield());
TacticalGraphicsRegistry.register(new EncirclementArea());
TacticalGraphicsRegistry.register(new FortifiedArea());

// APP-06 152200. Three anchor points and two stepped arms; not the fixed-size SVG badge
// it was before 2026-09-04. @see graphics/SearchArea.ts
TacticalGraphicsRegistry.register(new SearchArea());

/*
 * APP-06 §8.10 Table 8-12 -- the maritime control areas, in the four constructions the
 * group actually has rather than nine generators.
 *
 * The rectangles and circles reuse the families they belong to; only the ellipse and the
 * annular sector are new shapes. `CuedAcquisitionDoctrine` takes `RectangularTarget`
 * because 200600's rule is 240802's word for word -- one anchor point at the centre, a
 * length, a width and a rotation -- and reusing it is what keeps the two boxes from
 * drifting apart.
 */
[
    TacticalGraphicName.LaunchAreaEllipse,
    TacticalGraphicName.DefendedAreaEllipse,
    TacticalGraphicName.ShipAreaOfInterestEllipse,
].forEach(name => TacticalGraphicsRegistry.register(new EllipticalArea(name)));
TacticalGraphicsRegistry.register(new RectangularTarget(TacticalGraphicName.CuedAcquisitionDoctrine));
TacticalGraphicsRegistry.register(new RadarSearchDoctrine());

const obstacleGraphics = [
    TacticalGraphicName.ObstacleBelt,
    TacticalGraphicName.ObstacleZone,
    TacticalGraphicName.ObstacleGroup
]

obstacleGraphics.forEach(name => TacticalGraphicsRegistry.register(new Obstacle(name)));


const obstacleFreeGraphics = [
    TacticalGraphicName.ObstacleFreeArea,
    TacticalGraphicName.ObstacleRestrictedArea
]

obstacleFreeGraphics.forEach(name => TacticalGraphicsRegistry.register(new ObstacleFree(name)));

TacticalGraphicsRegistry.register(new ObstacleLine());
TacticalGraphicsRegistry.register(new Mineline());
TacticalGraphicsRegistry.register(new MinimumSafeDistanceZone());
TacticalGraphicsRegistry.register(new MinimumSafeDistanceMultipleStrike());
for (const bypass of [
    TacticalGraphicName.ObstacleBypassEasy,
    TacticalGraphicName.ObstacleBypassDifficult,
    TacticalGraphicName.ObstacleBypassImpossible,
]) {
    TacticalGraphicsRegistry.register(new ObstacleBypass(bypass));
}
TacticalGraphicsRegistry.register(new DecisionLine());
TacticalGraphicsRegistry.register(new Escort());
TacticalGraphicsRegistry.register(new Demonstration());
for (const swept of [TacticalGraphicName.Capture, TacticalGraphicName.Seize, TacticalGraphicName.Evacuate, TacticalGraphicName.Recover]) {
    TacticalGraphicsRegistry.register(new SweptArcTask(swept));
}
for (const follow of [TacticalGraphicName.FollowAndAssume, TacticalGraphicName.FollowAndSupport]) {
    TacticalGraphicsRegistry.register(new FollowTask(follow));
}
TacticalGraphicsRegistry.register(new MobilityCorridor());
TacticalGraphicsRegistry.register(new MineCluster());
TacticalGraphicsRegistry.register(new TripWire());
TacticalGraphicsRegistry.register(new RaftSite());
TacticalGraphicsRegistry.register(new FortifiedPosition());

// Security Operations
let securityOperationGraphics = [
    TacticalGraphicName.Cover,
    TacticalGraphicName.Screen,
    TacticalGraphicName.Guard
]
securityOperationGraphics.forEach(name => TacticalGraphicsRegistry.register(new SecurityOperation(name)));

// Block, Disrupt, Fix and Turn are each registered twice. FM 1-02.2 gives all
// four names both a Chapter 6 tactical mission task and a Chapter 5 table 5-19
// obstacle effect, drawn identically bar the doctrinal letter — and the letter
// is added by the renderer, not here, so one generator serves both names.
// register() keys off generator.name and throws on a duplicate, so this has to
// be two instances rather than one registered twice.
[TacticalGraphicName.TacticalBlock, TacticalGraphicName.Block].forEach(n => TacticalGraphicsRegistry.register(new Block(n)));
TacticalGraphicsRegistry.register(new Breach());
TacticalGraphicsRegistry.register(new Bypass());
TacticalGraphicsRegistry.register(new Canalize());
TacticalGraphicsRegistry.register(new Clear());
[TacticalGraphicName.TacticalDisrupt, TacticalGraphicName.Disrupt].forEach(n => TacticalGraphicsRegistry.register(new Disrupt(n)));
[TacticalGraphicName.TacticalFix, TacticalGraphicName.Fix].forEach(n => TacticalGraphicsRegistry.register(new Fix(n)));
[TacticalGraphicName.TacticalTurn, TacticalGraphicName.Turn].forEach(n => TacticalGraphicsRegistry.register(new Turn(n)));
TacticalGraphicsRegistry.register(new Penetration());
TacticalGraphicsRegistry.register(new Exploitation());

let retrogradeTasks = [
    TacticalGraphicName.Delay,
    TacticalGraphicName.Withdraw,
    TacticalGraphicName.WithdrawUnderPressure,
    TacticalGraphicName.Disengage,
    TacticalGraphicName.Retirement,
    TacticalGraphicName.ForwardPassageOfLines,
    TacticalGraphicName.RearwardPassageOfLines,
]

retrogradeTasks.forEach(name => TacticalGraphicsRegistry.register(new RetrogradeTask(name)));

// Forms of Maneuver — movement arrow variants
TacticalGraphicsRegistry.register(new MovementToContact());
TacticalGraphicsRegistry.register(new AdvanceToContact());
TacticalGraphicsRegistry.register(new FrontalAttack());
// TacticalGraphicsRegistry.register(new FlankAttack());
TacticalGraphicsRegistry.register(new TurningMovement());
TacticalGraphicsRegistry.register(new Pursuit());
TacticalGraphicsRegistry.register(new Envelopment());
// TacticalGraphicsRegistry.register(new DoubleEnvelopment());
TacticalGraphicsRegistry.register(new MobileDefense());
TacticalGraphicsRegistry.register(new Infiltration());
TacticalGraphicsRegistry.register(new InfiltrationLane());
TacticalGraphicsRegistry.register(new Ambush());
TacticalGraphicsRegistry.register(new ReliefInPlace());

// Range fans
TacticalGraphicsRegistry.register(new WeaponRangeFanCircular());
TacticalGraphicsRegistry.register(new WeaponRangeFanSector());

// Field fortification
TacticalGraphicsRegistry.register(new FightingPosition());
TacticalGraphicsRegistry.register(new FortifiedLine());

// Additional mission task block arrows (same geometry as Block, distinguished by name/label)
const additionalBlockTasks = [
    TacticalGraphicName.AttackByFire,
    TacticalGraphicName.SupportByFire,
    // Follow and assume / follow and support were here, and are NOT block arrows —
    // that shape is why they were switched off. They have their own generator now.
    // @see FollowTask, registered above.
];
additionalBlockTasks.forEach(name => TacticalGraphicsRegistry.register(new NamedBlockArrow(name)));

// The four crossed-line mission tasks. They used to render as block arrows,
// which is not what FM 1-02.2 draws for any of them — see CrossedMissionTask.
const crossedTasks = [
    TacticalGraphicName.Destroy,
    TacticalGraphicName.Interdict,
    TacticalGraphicName.Neutralize,
    TacticalGraphicName.Suppress,
];
crossedTasks.forEach(name => TacticalGraphicsRegistry.register(new CrossedMissionTask(name)));

// Defeat takes Destroy's draw rule word for word but not its shape: four filled arrows
// converging on the letter rather than two lines crossing at it. @see Defeat
TacticalGraphicsRegistry.register(new Defeat());

// Exfiltrate is a multi-vertex route with an arrowhead and no cane hook — see the
// class comment for why it is not a RetrogradeTask.
TacticalGraphicsRegistry.register(new Exfiltrate());

// Area-type graphics (reuse AreaGraphic)
const additionalAreaGraphics = [
    TacticalGraphicName.LimitedAccessArea,
    TacticalGraphicName.SmokeObscurant,
    TacticalGraphicName.GroupOrSeriesOfTargets,
    // TacticalGraphicName.SeriesOfTargets,
];
additionalAreaGraphics.forEach(name => TacticalGraphicsRegistry.register(new AreaGraphic(name)));

// Line-type target control measures + convoy (reuse Phaseline)
const additionalLineGraphics = [
    TacticalGraphicName.LinearTarget,
    TacticalGraphicName.FinalProtectiveFire,
    TacticalGraphicName.LinearSmokeTarget,
    /*
     * The convoys, revived 2026-09-04. `Phaseline` is the right *generator* -- their base
     * is two anchor points and nothing else -- but it was not the right *symbol*: the
     * block arrow and the open triangle are built in screen space by `convoyPaint`, which
     * is what they lacked before. @see convoyPaints
     */
    TacticalGraphicName.MovingConvoy,
    TacticalGraphicName.HaltedConvoy,
];
additionalLineGraphics.forEach(name => TacticalGraphicsRegistry.register(new Phaseline(name)));

// Circular (point-based) target control measures
const additionalCircularGraphics: TacticalGraphicName[] = [
    // TacticalGraphicName.TargetReferencePoint,
    // TacticalGraphicName.PointTarget,
    // TacticalGraphicName.FireSupportStation,
    TacticalGraphicName.BaseDefenseZone,
];
additionalCircularGraphics.forEach(name => TacticalGraphicsRegistry.register(new CircularArea(name)));