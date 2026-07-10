import {IGraphicGenerator, TacticalGraphicName} from "./type";
import {AirCorridor} from "../graphics/AirCorridor";
import {ObstacleLine, Phaseline} from "../graphics/Phaseline";
import {AreaGraphic, EncirclementArea, FortifiedArea, Obstacle, ObstacleFree} from "../graphics/AreaGraphic";
import {
    AreaDefense,
    CircularArea,
    Contain,
    Control,
    CordonAndSearch,
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
import {RetrogradeTask} from "../graphics/RetrogradeTask";
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
    MovementToContact,
    Pursuit,
    ReliefInPlace,
    TurningMovement,
} from "../graphics/FormsOfManeuver";
import {WeaponRangeFanCircular, WeaponRangeFanSector} from "../graphics/RangeFan";
import {NamedBlockArrow} from "../graphics/AdditionalMissionTasks";

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
    TacticalGraphicName.AssemblyArea,
    TacticalGraphicName.EngagementArea,
    TacticalGraphicName.RefugeeHoldingArea,
    TacticalGraphicName.BrigadeSupportArea,
    TacticalGraphicName.DivisionSupportArea,
    TacticalGraphicName.CorpsSupportArea,
    TacticalGraphicName.DropZone,
    TacticalGraphicName.LandingZone,
    TacticalGraphicName.KillZone,
    TacticalGraphicName.PickupZone,
    TacticalGraphicName.Airfield,
    TacticalGraphicName.BattlePosition,
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

// Security Operations
let securityOperationGraphics = [
    TacticalGraphicName.Cover,
    TacticalGraphicName.Screen,
    TacticalGraphicName.Guard
]
securityOperationGraphics.forEach(name => TacticalGraphicsRegistry.register(new SecurityOperation(name)));

TacticalGraphicsRegistry.register(new Block());
TacticalGraphicsRegistry.register(new Breach());
TacticalGraphicsRegistry.register(new Bypass());
TacticalGraphicsRegistry.register(new Canalize());
TacticalGraphicsRegistry.register(new Clear());
TacticalGraphicsRegistry.register(new Disrupt());
TacticalGraphicsRegistry.register(new Fix());
TacticalGraphicsRegistry.register(new Turn());
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
    TacticalGraphicName.Destroy,
    TacticalGraphicName.Neutralize,
    TacticalGraphicName.SupportByFire,
    TacticalGraphicName.Suppress,
    TacticalGraphicName.Interdict,
    TacticalGraphicName.FollowAndAssume,
    TacticalGraphicName.FollowAndSupport,
];
additionalBlockTasks.forEach(name => TacticalGraphicsRegistry.register(new NamedBlockArrow(name)));

// Exfiltrate uses retrograde (cane arrow) geometry
TacticalGraphicsRegistry.register(new RetrogradeTask(TacticalGraphicName.Exfiltrate));

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