/**
 * Declarative registry that maps every TacticalGraphicName to a factory
 * function that produces the correct TacticalGraphicHandler.
 *
 * Adding a new graphic requires only one entry here instead of touching a
 * 300-line switch statement.
 */

import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {TacticalGraphicHandler} from './openlayersAdapter';
import {AreaGraphicBase} from './graphics/AreaGraphicBase';
import {
    CircularAreaGraphicBase,
    EnvelopmentGraphicBase,
    AmbushGraphicBase,
    ContainGraphicBase,
    PursuitGraphicBase,
    MissionTaskGraphicBase,
    TurnGraphicBase,
} from './graphics/MissionTaskGraphicBase';
import {RangeFanGraphicBase} from './graphics/RangeFanGraphicBase';
import {SecurityOperationGraphicBase} from './graphics/SecurityOperationGraphicBase';
// import {SearchArea} from './graphics/SearchArea';
import {MovementGraphicBase} from './graphics/MovementGraphicBase';
import {RetrogradeTask} from './graphics/RetrogradeTask';
import {Exfiltrate} from './graphics/Exfiltrate';
import {ReliefInPlace} from './graphics/ReliefInPlace';
import {Block} from './graphics/Block';
import {Boundary} from './graphics/Boundary';
import {AirCorridor} from './graphics/AirCorridor';
import {LineGraphicBase} from './graphics/LineGraphicBase';
import {LineGraphicController} from './controllers/LineGraphicController';
import {MissionTaskController, PointDropController} from './controllers/MissionTaskController';
import {PolygonGraphicController, RectangularAreaGraphicController} from './controllers/PolygonGraphicController';
// import {SearchAreaController} from './controllers/SearchAreaController';
import {SecurityOperationsController} from './controllers/SecurityOperationsController';

type ControllerFactory = (name: TacticalGraphicName, resolution: number) => TacticalGraphicHandler;

// ─── helpers ──────────────────────────────────────────────────────────────────

const polygon = (name: TacticalGraphicName, res: number) =>
    new PolygonGraphicController(new AreaGraphicBase(name, res, res));

const polygonRect = (name: TacticalGraphicName, res: number) =>
    new RectangularAreaGraphicController(new AreaGraphicBase(name, res, res));

const movement = (maxPts = 0) => (name: TacticalGraphicName, res: number) =>
    new LineGraphicController(new MovementGraphicBase(name, 20 * res, res), maxPts || undefined, name);

// MobileDefense has no vertices worth editing: its ellipse is fully defined by
// its two endpoints, and rotate / resize / move already reshape it from them.
// Clearing `base` on the base feature drops it from the Modify interaction's
// feature set (getRenderedFeaturesByProp('base')), so the "Modify vertices" mode
// has nothing to show — no dashed axis line across the ellipse — while every
// other edit mode still works. Draw and the sample gallery are unchanged.
const mobileDefense = (name: TacticalGraphicName, res: number) => {
    const controller = new LineGraphicController(new MovementGraphicBase(name, 20 * res, res));
    controller.graphic.base.set('base', false);
    return controller;
};

const line = (maxPts = 0) => (name: TacticalGraphicName, res: number) =>
    new LineGraphicController(new LineGraphicBase(name, res), maxPts || undefined, name);

/**
 * A line graphic whose shape is the arrangement of its own vertices, so an edit-mode drag
 * moves the grabbed one instead of scaling the whole graphic.
 *
 * `minVertices` is a *visual* floor, not an editing convenience: a fields-of-fire V stops
 * reading as one the moment its two segments straighten into a line.
 */
const vertexLine = (maxPts: number, minVertices: number, anchorVertex?: number) => (name: TacticalGraphicName, res: number) => {
    const controller = new LineGraphicController(new LineGraphicBase(name, res), maxPts || undefined, name);
    controller.editStretches = true;
    return controller.enableVertexDragging(minVertices, anchorVertex);
};

const block = (name: TacticalGraphicName, res: number) =>
    new LineGraphicController(new Block(name, res * 20, res), 2, name);

const retrograde = (name: TacticalGraphicName, res: number) =>
    new LineGraphicController(new RetrogradeTask(name, res * 20, res), 2, name);

// No maxPoints: an exfiltration route bends, so the user draws as many vertices as
// the route needs and every one of them keeps an edit handle.
const exfiltrate = (name: TacticalGraphicName, res: number) =>
    new LineGraphicController(new Exfiltrate(name, res * 20, res), undefined, name);

const reliefInPlace = (name: TacticalGraphicName, res: number) =>
    new LineGraphicController(new ReliefInPlace(name, res * 20, res), 2, name);

const corridor = (name: TacticalGraphicName, res: number) =>
    new LineGraphicController(new AirCorridor(name, res * 20, res));

// Circle graphics resize on an edit-mode drag, identically to resize mode — see
// MissionTaskController.editStretches. The range fans join them now that each
// of their rings carries its own handle and a drag writes that band's range.
const missionTask = (name: TacticalGraphicName, res: number) => {
    const controller = new MissionTaskController(new MissionTaskGraphicBase(name, res, res));
    controller.editStretches = true;
    return controller;
};

// Turn adds a bend handle on top of the mission-task model. `editStretches` is
// on for the same reason as the circles — an edit-mode drag would otherwise
// pan the map — and the bend handle rides the manager's per-handle drag hook.
const turn = (name: TacticalGraphicName, res: number) => {
    const controller = new MissionTaskController(new TurnGraphicBase(name, res, res));
    controller.editStretches = true;
    return controller;
};

// Envelopment follows Turn exactly: point-anchored, drawn center-to-edge so the
// first click places it and the second sizes it, with a second handle for the
// half circle's radius riding the manager's per-handle drag hook.
const envelopment = (name: TacticalGraphicName, res: number) => {
    const controller = new MissionTaskController(new EnvelopmentGraphicBase(name, res, res));
    controller.editStretches = true;
    return controller;
};

// Pursuit needs its own holder for the same reason envelopment does: APP-06 draws it
// from anchor points, and the points have to be written and read back in that symbol's
// own layout. @see PursuitGraphicBase
// Ambush recovers its center from the chord of its arc, so it reads and writes its own
// point layout too. @see AmbushGraphicBase
const ambush = (name: TacticalGraphicName, res: number) => {
    const controller = new MissionTaskController(new AmbushGraphicBase(name, res, res));
    controller.editStretches = true;
    return controller;
};

// Contain draws the two ends of its arc rather than a center and an edge, so it needs
// its own holder for the same reason envelopment and pursuit do. @see ContainGraphicBase
const contain = (name: TacticalGraphicName, res: number) => {
    const controller = new MissionTaskController(new ContainGraphicBase(name, res, res));
    controller.editStretches = true;
    return controller;
};

const pursuit = (name: TacticalGraphicName, res: number) => {
    const controller = new MissionTaskController(new PursuitGraphicBase(name, res, res));
    controller.editStretches = true;
    return controller;
};

/**
 * The crossed mission tasks: one click drops a fixed-size badge. `res * 50` is
 * `CROSSED_HALF_WIDTH_PX` worth at the placing zoom — which the style function
 * then divides straight back out, since these render at a constant screen size
 * whatever the zoom. Passing a sane value anyway keeps the stored geometry
 * meaningful to a renderer that does not pin it, and matches the floor
 * `MIN_SIZED_MISSION_TASKS` applies.
 *
 * `editStretches` stays off: there is nothing to stretch.
 */
/**
 * Dropped whole on a single click like the crossed tasks, and resizable afterwards - the
 * user places it, then scales it if they need to. There is no vertex to drag, so the
 * shape's integrity is never at risk, and rotation stays off: `PointDropController`
 * no-ops it and the generator ignores it besides.
 *
 * `res * 100` — twice Suppress's `res * 50`, which was only the starting point these were
 * specified from, not the size they landed on.
 */
const roadblockComplete = (name: TacticalGraphicName, res: number) =>
    new PointDropController(new MissionTaskGraphicBase(name, res * 100, res), res * 100, true);

const crossedTask = (name: TacticalGraphicName, res: number) =>
    new PointDropController(new MissionTaskGraphicBase(name, res * 50, res), res * 50);

const circularArea = (name: TacticalGraphicName, res: number) => {
    const controller = new MissionTaskController(new CircularAreaGraphicBase(name, res, res));
    controller.editStretches = true;
    return controller;
};

const rangeFan = (name: TacticalGraphicName, res: number) => {
    const controller = new MissionTaskController(new RangeFanGraphicBase(name, res, res));
    controller.editStretches = true;
    return controller;
};

const securityOp = (name: TacticalGraphicName, res: number) =>
    new SecurityOperationsController(new SecurityOperationGraphicBase(name, res));

// ─── registry ─────────────────────────────────────────────────────────────────

const CONTROLLER_REGISTRY: Record<TacticalGraphicName, ControllerFactory> = {

    [TacticalGraphicName.BaseDefenseZone]:                      missionTask,

    // ── Polygon area control measures ──────────────────────────────────────
    [TacticalGraphicName.ObjectiveArea]:                             polygon,
    [TacticalGraphicName.TargetAreaOfInterest]:                  polygon,
    [TacticalGraphicName.AttackPosition]:                        polygon,
    [TacticalGraphicName.NamedAreaOfInterest]:                   polygon,
    [TacticalGraphicName.BaseCamp]:                              polygon,
    [TacticalGraphicName.AreaOfOperations]:                      polygon,
    [TacticalGraphicName.ForwardArmingAndRefuelingPoint]:        polygon,
    [TacticalGraphicName.AssaultPosition]:                       polygon,
    [TacticalGraphicName.GuerrillaBase]:                         polygon,
    [TacticalGraphicName.DetaineeHoldingArea]:                   polygon,
    [TacticalGraphicName.BombArea]: polygon,
    [TacticalGraphicName.TerminallyGuidedMunitionFootprint]: polygon,
    [TacticalGraphicName.Bridgehead]: polygon,
    [TacticalGraphicName.EnemyPrisonerOfWarHoldingArea]: polygon,
    [TacticalGraphicName.HumanTerrain]: polygon,
    [TacticalGraphicName.PenetrationBox]: polygon,
    [TacticalGraphicName.Area]: polygon,
    [TacticalGraphicName.JointTacticalActionArea]: polygon,
    [TacticalGraphicName.AssemblyArea]:                          polygon,
    [TacticalGraphicName.EngagementArea]:                        polygon,
    [TacticalGraphicName.RefugeeHoldingArea]:                    polygon,
    [TacticalGraphicName.BrigadeSupportArea]:                    polygon,
    [TacticalGraphicName.Airfield]:                              polygon,
    [TacticalGraphicName.DivisionSupportArea]:                   polygon,
    [TacticalGraphicName.CorpsSupportArea]:                      polygon,
    [TacticalGraphicName.FighterEngagementZone]: polygon,
    [TacticalGraphicName.ExtractionZone]: polygon,
    [TacticalGraphicName.RegimentalSupportArea]: polygon,
    [TacticalGraphicName.DropZone]:                              polygon,
    [TacticalGraphicName.LandingZone]:                           polygon,
    [TacticalGraphicName.KillZone]:                              polygon,
    [TacticalGraphicName.PickupZone]:                            polygon,
    [TacticalGraphicName.BattlePosition]:                        polygon,
    [TacticalGraphicName.StrongPoint]:                           polygon,
    [TacticalGraphicName.FreeFireAreaIrregular]:                 polygon,
    [TacticalGraphicName.NoFireAreaIrregular]:                   polygon,
    [TacticalGraphicName.RestrictiveFireAreaIrregular]:          polygon,
    [TacticalGraphicName.PositionAreaArtilleryIrregular]:        polygon,
    [TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular]: polygon,
    [TacticalGraphicName.CallForFireZoneIrregular]:              polygon,
    [TacticalGraphicName.TargetBuildUpAreaIrregular]: polygon,
    [TacticalGraphicName.TargetValueAreaIrregular]: polygon,
    [TacticalGraphicName.ZoneOfResponsibilityIrregular]: polygon,
    [TacticalGraphicName.CensorZoneIrregular]:                   polygon,
    [TacticalGraphicName.CriticalFriendlyZoneIrregular]:         polygon,
    [TacticalGraphicName.DeadSpaceAreaIrregular]:                polygon,
    [TacticalGraphicName.BlueKillBoxIrregular]:                  polygon,
    [TacticalGraphicName.PurpleKillBoxIrregular]:                polygon,
    [TacticalGraphicName.TargetAreaIrregular]:                   polygon,
    [TacticalGraphicName.FireSupportAreaIrregular]:              polygon,
    [TacticalGraphicName.HighDensityAirspaceControlZone]:        polygon,
    [TacticalGraphicName.RestrictedOperationsZone]:              polygon,
    [TacticalGraphicName.AirToAirRefuelingRestrictedOperationsZone]: polygon,
    [TacticalGraphicName.UnmannedAircraftRestrictedOperationsZone]:  polygon,
    [TacticalGraphicName.WeaponEngagementZone]:                  polygon,
    [TacticalGraphicName.JointEngagementZone]:                   polygon,
    [TacticalGraphicName.MissileEngagementZone]:                 polygon,
    [TacticalGraphicName.LowAltitudeMissileEngagementZone]:      polygon,
    [TacticalGraphicName.HighAltitudeMissileEngagementZone]:     polygon,
    [TacticalGraphicName.ShortRangeAirDefenseEngagementZone]:    polygon,
    [TacticalGraphicName.WeaponsFreeZone]:                       polygon,
    [TacticalGraphicName.AirSpaceCoordinationAreaIrregular]:     polygon,
    [TacticalGraphicName.Encirclement]:                          polygon,
    [TacticalGraphicName.UnexplodedExplosiveOrdnanceArea]:       polygon,
    [TacticalGraphicName.FortifiedArea]:                         polygon,
    [TacticalGraphicName.AirheadLine]:                           polygon,
    [TacticalGraphicName.ObstacleBelt]:                          polygon,
    [TacticalGraphicName.ObstacleZone]:                          polygon,
    [TacticalGraphicName.ObstacleGroup]:                         polygon,
    [TacticalGraphicName.ObstacleFreeArea]:                      polygon,
    [TacticalGraphicName.ObstacleRestrictedArea]:                polygon,

    // ── Rectangular area variants ──────────────────────────────────────────
    [TacticalGraphicName.FreeFireAreaRectangular]:               polygonRect,
    [TacticalGraphicName.NoFireAreaRectangular]:                 polygonRect,
    [TacticalGraphicName.RestrictiveFireAreaRectangular]:        polygonRect,
    [TacticalGraphicName.PositionAreaArtilleryRectangular]:      polygonRect,
    [TacticalGraphicName.ArtilleryTargetIntelligenceZoneRectangular]: polygonRect,
    [TacticalGraphicName.CallForFireZoneRectangular]:            polygonRect,
    [TacticalGraphicName.TargetBuildUpAreaRectangular]: polygonRect,
    [TacticalGraphicName.TargetValueAreaRectangular]: polygonRect,
    [TacticalGraphicName.ZoneOfResponsibilityRectangular]: polygonRect,
    [TacticalGraphicName.CensorZoneRectangular]:                 polygonRect,
    [TacticalGraphicName.CriticalFriendlyZoneRectangular]:       polygonRect,
    [TacticalGraphicName.DeadSpaceAreaRectangular]:              polygonRect,
    [TacticalGraphicName.BlueKillBoxRectangular]:                polygonRect,
    [TacticalGraphicName.PurpleKillBoxRectangular]:              polygonRect,
    [TacticalGraphicName.TargetAreaRectangular]:                 polygonRect,
    [TacticalGraphicName.FireSupportAreaRectangular]:            polygonRect,
    [TacticalGraphicName.AirSpaceCoordinationAreaRectangular]:   polygonRect,

    // ── Movement (arrow) graphics ──────────────────────────────────────────
    [TacticalGraphicName.AttackHelicopterAxisOfAdvance]:        movement(),
    [TacticalGraphicName.MainAxisOfAdvance]:   movement(),
    [TacticalGraphicName.MainAxisOfAdvanceFeint]: movement(),
    [TacticalGraphicName.AviationAxisOfAdvance]: movement(),
    [TacticalGraphicName.SupportingAxisOfAdvance]:    movement(),
    [TacticalGraphicName.Counterattack]:       movement(),
    [TacticalGraphicName.InfiltrationLane]:     movement(),

    // ── Engineer / crossing (movement base, max 2 pts) ────────────────────
    [TacticalGraphicName.Bridge]:          movement(2),
    [TacticalGraphicName.Gap]:             movement(2),
    [TacticalGraphicName.AssaultCrossing]: movement(2),
    [TacticalGraphicName.FordEasy]:            movement(2),
    [TacticalGraphicName.FordDifficult]:        movement(2),

    // ── Simple line graphics ───────────────────────────────────────────────
    [TacticalGraphicName.PhaseLine]:                        line(),
    [TacticalGraphicName.LineOfDeparture]:                  line(),
    [TacticalGraphicName.LimitOfAdvance]:                   line(),
    [TacticalGraphicName.ForwardEdgeOfBattleArea]:          line(),
    [TacticalGraphicName.ReleaseLine]:                      line(),
    [TacticalGraphicName.BridgeheadLine]:                   line(),
    [TacticalGraphicName.BattlefieldHandoverLine]:          line(),
    [TacticalGraphicName.DelayLine]:                        line(),
    [TacticalGraphicName.FinalCoordinationLine]:            line(),
    [TacticalGraphicName.LineOfDepartureOrLineOfContact]:   line(),
    [TacticalGraphicName.ProbableLineOfDeployment]:         line(),
    [TacticalGraphicName.CommonSensorBoundary]:             line(),
    [TacticalGraphicName.LightLine]: line(),
    [TacticalGraphicName.HoldingLine]: line(),
    [TacticalGraphicName.NoFireLine]: line(),
    [TacticalGraphicName.BattlefieldCoordinationLine]: line(),
    [TacticalGraphicName.RestrictiveFireLine]:              line(),
    [TacticalGraphicName.IntelligenceCoordinationLine]:     line(),
    [TacticalGraphicName.IdentificationFriendOrFoeOff]:     line(),
    [TacticalGraphicName.IdentificationFriendOrFoeOn]:      line(),
    [TacticalGraphicName.EngineerWorkLine]:                 line(),
    [TacticalGraphicName.FireSupportCoordinationLine]:      line(),
    [TacticalGraphicName.CoordinatedFireLine]:              line(),
    [TacticalGraphicName.Route]:                            line(),
    [TacticalGraphicName.MainSupplyRoute]:                  line(),
    [TacticalGraphicName.AlternateSupplyRoute]:             line(),
    [TacticalGraphicName.MunitionFlightPath]:               line(),
    [TacticalGraphicName.ForwardLineOfOwnTroops]:           line(),
    [TacticalGraphicName.LineOfContact]:                    line(),
    [TacticalGraphicName.ObstacleLine]:                     line(),
    [TacticalGraphicName.DirectionOfMainAttack]:            line(),
    [TacticalGraphicName.DirectionOfSupportingAttack]:      line(),
    [TacticalGraphicName.DirectionOfMainAttackFeint]:       line(),
    [TacticalGraphicName.AviationDirectionOfAttack]:           line(),
    [TacticalGraphicName.FerryCrossing]:                    line(2),
    [TacticalGraphicName.PassageLane]:                      line(2),
    [TacticalGraphicName.TacticalFix]:                              line(2),
    [TacticalGraphicName.FieldsOfFire]:                     vertexLine(3, 3, 1),

    // ── Boundary (special line) ────────────────────────────────────────────
    [TacticalGraphicName.Boundary]: (_name, res) =>
        new LineGraphicController(new Boundary(res), undefined),

    // ── Air corridors ──────────────────────────────────────────────────────
    [TacticalGraphicName.AirCorridor]:                       corridor,
    [TacticalGraphicName.LowLevelTransitRoute]:              corridor,
    [TacticalGraphicName.MinimumRiskRoute]:                  corridor,
    [TacticalGraphicName.SafeLane]:                          corridor,
    [TacticalGraphicName.SpecialCorridor]:                   corridor,
    [TacticalGraphicName.StandardUseArmyAircraftFlightRoute]: corridor,
    [TacticalGraphicName.TransitCorridor]:                   corridor,
    [TacticalGraphicName.UnmannedAircraftCorridor]:                  corridor,

    // ── Block/Breach/Bypass family (max 2 pts) ─────────────────────────────
    [TacticalGraphicName.TacticalBlock]:       block,
    [TacticalGraphicName.Breach]:      block,
    [TacticalGraphicName.Bypass]:      block,
    [TacticalGraphicName.Canalize]:    block,
    [TacticalGraphicName.Clear]:       block,
    [TacticalGraphicName.TacticalDisrupt]:     block,
    [TacticalGraphicName.Penetration]: block,
    [TacticalGraphicName.Exploitation]: block,

    // ── Retrograde tasks (max 2 pts) ───────────────────────────────────────
    // Abatis takes a drawn route with as many vertices as the road needs, so it is a
    // plain line graphic — `line()` with no vertex cap. @see ai/app-6.md "F1"
    [TacticalGraphicName.Abatis]:                 line(),
    // The demolition family is a drawn centerline with a width, so it takes the
    // movement contract: two vertices plus an offset handle. @see ai/app-6.md "F2"
    [TacticalGraphicName.ExplosivesPlannedStateOfReadiness]: movement(2),
    [TacticalGraphicName.ExplosivesStateOfReadiness1Safe]: movement(2),
    [TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable]: movement(2),
    // Roadblock complete stays point-dropped: its symbol is two overlapping X's,
    // which no centerline-and-width rule in APP-06 describes. @see ai/app-6.md "F2"
    [TacticalGraphicName.RoadblockCompleteExecuted]: roadblockComplete,
    [TacticalGraphicName.AntiTankDitchUnderConstruction]: line(),
    [TacticalGraphicName.AntiTankDitchCompleted]: line(),
    [TacticalGraphicName.AntiTankDitchReinforcedWithMines]: line(),
    [TacticalGraphicName.WireUnspecified]:                 line(),
    [TacticalGraphicName.WireSingleFence]:                 line(),
    [TacticalGraphicName.WireDoubleFence]:                 line(),
    [TacticalGraphicName.WireDoubleApronFence]:            line(),
    [TacticalGraphicName.WireLowWireFence]:                line(),
    [TacticalGraphicName.WireHighWireFence]:               line(),
    [TacticalGraphicName.WireSingleConcertina]:            line(),
    [TacticalGraphicName.WireDoubleStrandConcertina]:      line(),
    [TacticalGraphicName.WireTripleStrandConcertina]:      line(),
    [TacticalGraphicName.Delay]:                  retrograde,
    [TacticalGraphicName.Withdraw]:               retrograde,
    [TacticalGraphicName.WithdrawUnderPressure]:  retrograde,
    [TacticalGraphicName.Disengage]:              retrograde,
    [TacticalGraphicName.Retirement]:             retrograde,
    [TacticalGraphicName.ForwardPassageOfLines]:  retrograde,
    [TacticalGraphicName.RearwardPassageOfLines]: retrograde,

    // ── Mission task bubbles ───────────────────────────────────────────────
    [TacticalGraphicName.Secure]:        missionTask,
    [TacticalGraphicName.Isolate]:       missionTask,
    [TacticalGraphicName.Retain]:        missionTask,
    [TacticalGraphicName.CordonAndKnock]: missionTask,
    [TacticalGraphicName.Locate]: missionTask,
    [TacticalGraphicName.CordonAndSearch]: missionTask,
    [TacticalGraphicName.Control]:       missionTask,
    [TacticalGraphicName.Contain]:       contain,
    [TacticalGraphicName.Occupy]:        missionTask,
    [TacticalGraphicName.AreaDefense]:   missionTask,
    // Point-anchored bowed arrow with a draggable bend — see Turn.ts.
    [TacticalGraphicName.TacticalTurn]:  turn,

    // ── Countermobility obstacle effects (FM 1-02.2 table 5-19) ────────────
    // Visual twins of the Chapter 6 mission tasks of the same doctrinal name,
    // differing only in that they draw no letter, so each takes the identical
    // controller. They do not share one factory: Turn is point-anchored while
    // the other three are drawn as a two-point line.
    [TacticalGraphicName.Block]:    block,
    [TacticalGraphicName.Disrupt]:  block,
    [TacticalGraphicName.Fix]:      line(2),
    [TacticalGraphicName.Turn]:     turn,

    // ── Circular area graphics ─────────────────────────────────────────────
    [TacticalGraphicName.FreeFireAreaCircular]:                  circularArea,
    [TacticalGraphicName.NoFireAreaCircular]:                    circularArea,
    [TacticalGraphicName.RestrictiveFireAreaCircular]:           circularArea,
    [TacticalGraphicName.PositionAreaArtilleryCircular]:         circularArea,
    [TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular]: circularArea,
    [TacticalGraphicName.CallForFireZoneCircular]:               circularArea,
    [TacticalGraphicName.TargetBuildUpAreaCircular]: circularArea,
    [TacticalGraphicName.TargetValueAreaCircular]: circularArea,
    [TacticalGraphicName.ZoneOfResponsibilityCircular]: circularArea,
    [TacticalGraphicName.CensorZoneCircular]:                    circularArea,
    [TacticalGraphicName.CriticalFriendlyZoneCircular]:          circularArea,
    [TacticalGraphicName.DeadSpaceAreaCircular]:                 circularArea,
    [TacticalGraphicName.BlueKillBoxCircular]:                   circularArea,
    [TacticalGraphicName.PurpleKillBoxCircular]:                 circularArea,
    [TacticalGraphicName.FireSupportAreaCircular]:               circularArea,
    [TacticalGraphicName.TargetAreaCircular]:                    circularArea,
    [TacticalGraphicName.AirSpaceCoordinationAreaCircular]:      circularArea,

    // ── Security operations ────────────────────────────────────────────────
    [TacticalGraphicName.Cover]:  securityOp,
    [TacticalGraphicName.Guard]:  securityOp,
    [TacticalGraphicName.Screen]: securityOp,

    // ── Search area ────────────────────────────────────────────────────────
    // [TacticalGraphicName.SearchArea]: (name) =>
    //     new SearchAreaController(new SearchArea(name)),

    // ── Forms of maneuver (movement arrows) ────────────────────────────────
    [TacticalGraphicName.MovementToContact]:  missionTask,
    // APP-06 342900 builds it from a path and a width, which is the movement
    // family's own model. @see AdvanceToContact
    [TacticalGraphicName.AdvanceToContact]:   movement(),
    [TacticalGraphicName.FrontalAttack]:      movement(),
    // [TacticalGraphicName.FlankAttack]:        movement(),
    [TacticalGraphicName.TurningMovement]:    movement(),
    [TacticalGraphicName.Pursuit]:            pursuit,
    [TacticalGraphicName.Envelopment]:        envelopment,
    // [TacticalGraphicName.DoubleEnvelopment]:  movement(),
    [TacticalGraphicName.MobileDefense]:      mobileDefense,
    [TacticalGraphicName.Infiltration]:       movement(),
    [TacticalGraphicName.ReliefInPlace]:      reliefInPlace,

    // ── Ambush (point-based arc graphic) ───────────────────────────────────
    [TacticalGraphicName.Ambush]: ambush,

    // ── Field fortification ────────────────────────────────────────────────
    [TacticalGraphicName.FightingPosition]: missionTask,
    [TacticalGraphicName.FortifiedLine]:    line(),

    // ── Range fans (point-based, multi-band doctrinal renderer) ────────────
    [TacticalGraphicName.WeaponSensorRangeFanCircular]: rangeFan,
    [TacticalGraphicName.WeaponSensorRangeFanSector]:   rangeFan,

    // ── Additional mission task block arrows ────────────────────────────────
    [TacticalGraphicName.AttackByFire]:     block,
    [TacticalGraphicName.SupportByFire]:    block,
    // Excluded — see ai/excluded-graphics.md
    // [TacticalGraphicName.FollowAndAssume]:  block,
    // [TacticalGraphicName.FollowAndSupport]: block,

    // ── Crossed-line mission tasks (one click drops a fixed-size badge) ─────
    [TacticalGraphicName.Destroy]:    crossedTask,
    [TacticalGraphicName.Interdict]:  crossedTask,
    [TacticalGraphicName.Neutralize]: crossedTask,
    [TacticalGraphicName.Suppress]:   crossedTask,

    // ── Exfiltrate (multi-vertex route + arrowhead) ─────────────────────────
    [TacticalGraphicName.Exfiltrate]: exfiltrate,

    // ── Additional polygon area control measures ─────────────────────────────
    [TacticalGraphicName.LimitedAccessArea]:           polygon,
    [TacticalGraphicName.SmokeObscurant]:   polygon,
    [TacticalGraphicName.GroupOrSeriesOfTargets]:              polygon,
    // [TacticalGraphicName.SeriesOfTargets]:             polygon,

    // ── Line target control measures + convoy ───────────────────────────────
    [TacticalGraphicName.LinearTarget]:        line(2),
    [TacticalGraphicName.FinalProtectiveFire]: line(2),
    [TacticalGraphicName.LinearSmokeTarget]:   line(2),
    // Excluded — see ai/excluded-graphics.md
    // [TacticalGraphicName.MovingConvoy]:     line(),
    // [TacticalGraphicName.HaltedConvoy]:     line(),

    // ── Circular / point target control measures ─────────────────────────────
    // [TacticalGraphicName.TargetReferencePoint]: circularArea,
    // [TacticalGraphicName.PointTarget]:          circularArea,
    // [TacticalGraphicName.FireSupportStation]:   circularArea,
};

/**
 * Returns the controller for a given graphic name.
 * Throws a descriptive error if no controller is registered (prevents silent no-ops).
 */
export function getController(
    graphicName: TacticalGraphicName,
    resolution: number
): TacticalGraphicHandler {
    const factory = CONTROLLER_REGISTRY[graphicName];
    if (!factory) {
        throw new Error(
            `[TacticalGraphics] No controller registered for graphic "${graphicName}". ` +
            `Add an entry to controllerRegistry.ts to support this graphic.`
        );
    }
    return factory(graphicName, resolution);
}
