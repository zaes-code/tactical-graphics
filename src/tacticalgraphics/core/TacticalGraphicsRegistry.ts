import {IGraphicGenerator, TacticalGraphicName} from "./type";
import {AirCorridor} from "../graphics/AirCorridor";
import {ObstacleLine, Phaseline} from "../graphics/Phaseline";
import {FortifiedPosition, MineCluster, Mineline, RaftSite, TripWire} from "../graphics/ProtectionLine";
import {DecisionLine, MobilityCorridor} from "../graphics/EndGlyphLine";
import {SweptArcTask} from "../graphics/SweptArcTask";
import {ObstacleBypass} from "../graphics/ObstacleBypass";
import {AreaGraphic, EncirclementArea, FortifiedArea, Obstacle, ObstacleFree} from "../graphics/AreaGraphic";
import {
    AreaDefense,
    CircularArea,
    Contain,
    Control,
    CordonAndKnock,
    CordonAndSearch,
    Locate,
    Isolate,
    Occupy,
    Retain,
    Secure
} from "../graphics/MissionTask";
// import {SearchArea} from "../graphics/SearchArea";
import {SecurityOperation} from "../graphics/SecurityOperation";
import {Block} from "../graphics/Block";
import {Breach} from "../graphics/Breach";
import {Bypass} from "../graphics/Bypass";
import {Canalize} from "../graphics/Canalize";
import {Clear} from "../graphics/Clear";
import {Disrupt} from "../graphics/Disrupt";
import {Exfiltrate, RetrogradeTask} from "../graphics/RetrogradeTask";
import {FieldsOfFire} from "../graphics/FieldsOfFire";
import {ForwardLineOfOwnTroops, LineOfContact} from "../graphics/ForwardLineOfOwnTroops";
import {Bridge} from "../graphics/Bridge";
import {Ford, FordHard} from "../graphics/Ford";
import {FerryCrossing} from "../graphics/FerryCrossing";
import {PassageLane} from "../graphics/PassageLane";
import {Fix} from "../graphics/Fix";
import {Turn} from "../graphics/Turn";
import {AviationDirectionOfAttack, DirectionOfMainAttack, DirectionOfMainAttackFeint, DirectionOfSupportingAttack} from "../graphics/Direction";
import {AttackHelicopterAxisOfAdvance, AviationAxisOfAdvance, AxisOfAttack, Counterattack, MainAttack, MainAttackFeint, SupportingAttack} from "../graphics/Movement";
import {Penetration} from "../graphics/Penetration";
import {FightingPosition, FortifiedLine} from "../graphics/FieldFortification";
import {Exploitation} from "../graphics/Exploitation";
import {
    Ambush,
    // DoubleEnvelopment,
    Envelopment,
    // FlankAttack,
    FrontalAttack,
    Infiltration,
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
TacticalGraphicsRegistry.register(new AxisOfAttack());
TacticalGraphicsRegistry.register(new Counterattack());

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
    TacticalGraphicName.AreaGeneric,
    TacticalGraphicName.ZoneOfFire,
    TacticalGraphicName.RestrictedTerrain,
    TacticalGraphicName.SeverelyRestrictedTerrain,
    TacticalGraphicName.BiologicalContaminatedArea,
    TacticalGraphicName.ChemicalContaminatedArea,
    TacticalGraphicName.NuclearContaminatedArea,
    TacticalGraphicName.RadiologicalContaminatedArea,
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
    TacticalGraphicName.Airfield,
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
    TacticalGraphicName.TargetAreaRectangular,
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
]

areaGraphicNames.forEach(name => TacticalGraphicsRegistry.register(new AreaGraphic(name)))

//Mission Task Graphics
TacticalGraphicsRegistry.register(new Control());
TacticalGraphicsRegistry.register(new CordonAndSearch());
TacticalGraphicsRegistry.register(new CordonAndKnock());
TacticalGraphicsRegistry.register(new Locate());
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
]
circularAreaGraphicNames.forEach(name => TacticalGraphicsRegistry.register(new CircularArea(name)));

TacticalGraphicsRegistry.register(new EncirclementArea());
TacticalGraphicsRegistry.register(new FortifiedArea());

// Search Area
// TacticalGraphicsRegistry.register(new SearchArea());

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
for (const bypass of [
    TacticalGraphicName.ObstacleBypassEasy,
    TacticalGraphicName.ObstacleBypassDifficult,
    TacticalGraphicName.ObstacleBypassImpossible,
]) {
    TacticalGraphicsRegistry.register(new ObstacleBypass(bypass));
}
TacticalGraphicsRegistry.register(new DecisionLine());
for (const swept of [TacticalGraphicName.Capture, TacticalGraphicName.Evacuate, TacticalGraphicName.Recover]) {
    TacticalGraphicsRegistry.register(new SweptArcTask(swept));
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
    // Excluded — see ai/excluded-graphics.md
    // TacticalGraphicName.FollowAndAssume,
    // TacticalGraphicName.FollowAndSupport,
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
    // Excluded — see ai/excluded-graphics.md
    // TacticalGraphicName.MovingConvoy,
    // TacticalGraphicName.HaltedConvoy,
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