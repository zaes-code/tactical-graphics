/**
 * Declarative registry that maps every TacticalGraphicName to a factory
 * function that produces the correct TacticalGraphicHandler.
 *
 * Adding a new graphic requires only one entry here instead of touching a
 * 300-line switch statement.
 */

import {CROSSED_HALF_WIDTH_PX, TacticalGraphicName, allowedGestures, dropSizePx, groundLength} from '@zaes/tactical-graphics';
import {TacticalGraphicHandler} from './openlayersAdapter';
import {AreaGraphicBase} from './graphics/AreaGraphicBase';
import {RectangularAreaGraphicBase} from './graphics/RectangularAreaGraphicBase';
import {
    CircularAreaGraphicBase,
    EnvelopmentGraphicBase,
    AmbushGraphicBase,
    ContainGraphicBase,
    PursuitGraphicBase,
    DemonstrationGraphicBase,
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
import {PolygonGraphicController} from './controllers/PolygonGraphicController';
// import {SearchAreaController} from './controllers/SearchAreaController';
import {SecurityOperationsController} from './controllers/SecurityOperationsController';

/**
 * `resolution` is the zoom the graphic is being created at; `sizing` is that same
 * resolution corrected for **where** it is being created.
 *
 * They differ because a pixel constant times the raw resolution is a *projected* length,
 * and Web Mercator inflates those by 1/cos(latitude) — so a decoration, a badge or a
 * default width derived that way came out twice its intended size at 60 degrees north.
 * Anything measured in screen pixels multiplies `sizing`; `resolution` is what the
 * holder files as its drawing zoom, because the label scale is anchored to the zoom
 * itself and is not a distance at all. @see screenMeters
 */
type ControllerFactory = (name: TacticalGraphicName, resolution: number, sizing: number) => TacticalGraphicHandler;

// ─── helpers ──────────────────────────────────────────────────────────────────

const polygon = (name: TacticalGraphicName, res: number, sizing: number) =>
    new PolygonGraphicController(new AreaGraphicBase(name, sizing, res));

/**
 * A rectangular zone: two anchor points and a width, so it draws like a two-point line and
 * edits like one — `Modify` drags point 1 and point 2, the third handle is the width.
 * @see RectangularAreaGraphicBase
 */
const polygonRect = (name: TacticalGraphicName, res: number, sizing: number) => {
    // **Vertex dragging, explicitly.** The two anchor points are the only thing an
    // operator moves to change the zone's length, and `LineGraphicController` routes a
    // vertex grab only for the graphics that ask. The library holds the axis to its own
    // bearing, so the drag lengthens rather than turns. @see constrainRectangleAxis
    const graphic = new RectangularAreaGraphicBase(name, res, sizing);
    const controller = new LineGraphicController(graphic, 2, name).enableVertexDragging(2);

    // The holder has to know the draw from an edit, and `shapingFromGesture` cannot tell
    // it: the controller raises that around a vertex drag too, which is the one case that
    // most needs the axis held. @see RectangularAreaGraphicBase.drawing
    const started = controller.onDrawStartFunc;
    const ended = controller.onDrawEndFunc;
    controller.onDrawStartFunc = event => {
        graphic.drawing = true;
        started(event);
    };
    controller.onDrawEndFunc = event => {
        graphic.drawing = false;
        ended(event);
    };

    // A rotate turns about point 1, so only point 2 moves — the same shape a length drag
    // has, and the axis constraint would hold the zone level and merely shorten it.
    // @see RectangularAreaGraphicBase.rotating
    const rotate = controller.handleRotate.bind(controller);
    controller.handleRotate = (delta: number) => {
        graphic.rotating = true;
        try {
            rotate(delta);
        } finally {
            graphic.rotating = false;
        }
    };
    return controller;
};

const movement = (maxPts = 0) => (name: TacticalGraphicName, res: number, sizing: number) =>
    new LineGraphicController(new MovementGraphicBase(name, 20 * sizing, res), maxPts || undefined, name);

// MobileDefense has no vertices worth editing: its ellipse is fully defined by
// its two endpoints, and rotate / resize / move already reshape it from them.
// Clearing `base` on the base feature drops it from the Modify interaction's
// feature set (getRenderedFeaturesByProp('base')), so the "Modify vertices" mode
// has nothing to show — no dashed axis line across the ellipse — while every
// other edit mode still works. Draw and the sample gallery are unchanged.
const mobileDefense = (name: TacticalGraphicName, res: number, sizing: number) => {
    const controller = new LineGraphicController(new MovementGraphicBase(name, 20 * sizing, res));
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
    // **`editStretches` is left to the constructor**, which reads the library's rule.
    // Forcing it true here contradicted that for the one graphic that wants vertex
    // handles *and* an inert body — `Fix` — and put the two engines back out of step.
    return controller.enableVertexDragging(minVertices, anchorVertex);
};

const block = (name: TacticalGraphicName, res: number, sizing: number) =>
    new LineGraphicController(new Block(name, sizing * 20, res), 2, name);

const retrograde = (name: TacticalGraphicName, res: number, sizing: number) =>
    new LineGraphicController(new RetrogradeTask(name, sizing * 20, res), 2, name);

// No maxPoints: an exfiltration route bends, so the user draws as many vertices as
// the route needs and every one of them keeps an edit handle.
const exfiltrate = (name: TacticalGraphicName, res: number, sizing: number) =>
    // Three anchor points, each meaning something. @see GeometryService.createSCurve
    new LineGraphicController(new Exfiltrate(name, sizing * 20, res), 3, name).enableVertexDragging(3, 0);

const reliefInPlace = (name: TacticalGraphicName, res: number, sizing: number) =>
    new LineGraphicController(new ReliefInPlace(name, sizing * 20, res), 2, name);

const corridor = (name: TacticalGraphicName, res: number, sizing: number) =>
    new LineGraphicController(new AirCorridor(name, sizing * 20, res));

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
 * Every one-click graphic: the crossed mission tasks, the airfield, the completed
 * roadblock. One click plants it whole, and whether it may then be scaled or turned is
 * the portable table's business rather than this factory's.
 *
 * **The drop size comes from `dropSizePx`, not from a literal here.** It used to be
 * `res * 50`, `res * 34` and `res * 100` in three separate factories, which is the same
 * fact stated three times in the half of the codebase MapLibre cannot see — so MapLibre
 * had to guess at one-click-ness from `allowedGestures`, and guessed wrong the moment a
 * one-click graphic became resizable.
 *
 * It is a screen size converted at the moment of the drop: a metre default is a different
 * symbol at every zoom, and at a low one it lands a few pixels across with its handles
 * piled on top of each other.
 */
const pointDrop = (name: TacticalGraphicName, res: number, sizing: number) =>
    dropped(name, res, sizing, (n, size) => new MissionTaskGraphicBase(n, size, res));

/**
 * The demonstration: dropped like the rest, but its base carries the four anchor points
 * APP-06 describes it by rather than the single click that placed them.
 * @see DemonstrationGraphicBase
 */
const demonstrationDrop = (name: TacticalGraphicName, res: number, sizing: number) =>
    dropped(name, res, sizing, (n, size) => new DemonstrationGraphicBase(n, size, res));

const dropped = (
    name: TacticalGraphicName,
    res: number,
    sizing: number,
    build: (name: TacticalGraphicName, size: number) => MissionTaskGraphicBase,
) => {
    const px = dropSizePx(name) ?? CROSSED_HALF_WIDTH_PX;
    const size = sizing * px;
    return new PointDropController(
        build(name, size),
        size,
        allowedGestures(name).resize,
        // The controller re-derives this where the click lands, which is exact; `size`
        // above is the same number sized for the view centre, and is what the holder
        // starts life with. @see PointDropController.drop
        {px, resolution: res},
        allowedGestures(name).rotate,
    );
};

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
    [TacticalGraphicName.SubmarineActionArea]: polygon,
    [TacticalGraphicName.SubmarineGeneratedActionArea]: polygon,
    [TacticalGraphicName.AreaGeneric]: polygon,
    [TacticalGraphicName.ZoneOfFire]: polygon,
    [TacticalGraphicName.RestrictedTerrain]: polygon,
    [TacticalGraphicName.SeverelyRestrictedTerrain]: polygon,
    [TacticalGraphicName.BiologicalContaminatedArea]: polygon,
    [TacticalGraphicName.BiologicalContaminatedAreaToxicIndustrialMaterial]: polygon,
    [TacticalGraphicName.ChemicalContaminatedAreaToxicIndustrialMaterial]: polygon,
    [TacticalGraphicName.RadiologicalContaminatedAreaToxicIndustrialMaterial]: polygon,
    [TacticalGraphicName.ChemicalContaminatedArea]: polygon,
    [TacticalGraphicName.NuclearContaminatedArea]: polygon,
    [TacticalGraphicName.RadiologicalContaminatedArea]: polygon,
    [TacticalGraphicName.ArtilleryManeuverArea]: polygon,
    [TacticalGraphicName.ArtilleryReservedArea]: polygon,
    [TacticalGraphicName.AssemblyArea]:                          polygon,
    [TacticalGraphicName.EngagementArea]:                        polygon,
    [TacticalGraphicName.RefugeeHoldingArea]:                    polygon,
    [TacticalGraphicName.BrigadeSupportArea]:                    polygon,
    [TacticalGraphicName.AirfieldZone]: polygon,
    [TacticalGraphicName.RadiationDoseRateContourLine]: polygon,
    [TacticalGraphicName.MinefieldDynamicDepiction]: polygon,
    [TacticalGraphicName.MinedAreaFenced]: polygon,
    [TacticalGraphicName.PsyOpsZoneIrregular]: polygon,
    [TacticalGraphicName.PsyOpsZoneRectangular]: polygonRect,
    [TacticalGraphicName.PsyOpsZoneCircular]: circularArea,
    // Dropped on one click and static, like the crossed tasks: no resize, no rotate.
    [TacticalGraphicName.Airfield]:                              pointDrop,
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
    [TacticalGraphicName.BattlePositionPreparedButNotOccupied]:     polygon,
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
    [TacticalGraphicName.AvenueOfApproach]:    movement(),
    [TacticalGraphicName.MainAxisOfAdvance]:   movement(),
    [TacticalGraphicName.MainAxisOfAdvanceFeint]: movement(),
    [TacticalGraphicName.AviationAxisOfAdvance]: movement(),
    [TacticalGraphicName.SupportingAxisOfAdvance]:    movement(),
    [TacticalGraphicName.Counterattack]:       movement(),
    [TacticalGraphicName.CounterattackByFire]: movement(),
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
    [TacticalGraphicName.LineGeneric]: line(),
    [TacticalGraphicName.HandoverLine]: line(),
    [TacticalGraphicName.NamedAreaOfInterestLine]: line(),
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
    // The mineline extends with extra vertices; the other four are defined by two
    // anchor points and nothing else, so their draw stops at two.
    // Four anchor points, each meaning something different, so every one is draggable.
    // Handle 0 is the circle's centre and moves the whole graphic.
    [TacticalGraphicName.Capture]:                          vertexLine(4, 4, 0),
    // Centre first, then the two ends -- the order the standard numbers them.
    [TacticalGraphicName.Escort]:                           vertexLine(3, 3, 0),
    // Dropped whole, not drawn: its four points are one fixed shape. @see Demonstration
    [TacticalGraphicName.Demonstration]:                    demonstrationDrop,
    [TacticalGraphicName.Evacuate]:                         vertexLine(4, 4, 0),
    [TacticalGraphicName.Recover]:                          vertexLine(4, 4, 0),
    [TacticalGraphicName.DecisionLine]:                     line(),
    [TacticalGraphicName.MobilityCorridor]:                 line(),
    // Three anchor points: two arrow tips and the rear. Handle 2 is the rear, which is
    // the one that moves the whole shape.
    // Centre, then the two radii. Handle 0 is the centre and moves the whole zone.
    [TacticalGraphicName.MinimumSafeDistanceZone]:          vertexLine(3, 3, 0),
    // An even number of points, half per ring, so the draw cannot be capped.
    [TacticalGraphicName.MinimumSafeDistanceMultipleStrike]: vertexLine(0, 6, 0),
    [TacticalGraphicName.ObstacleBypassEasy]:               vertexLine(3, 3, 2),
    [TacticalGraphicName.ObstacleBypassDifficult]:          vertexLine(3, 3, 2),
    [TacticalGraphicName.ObstacleBypassImpossible]:         vertexLine(3, 3, 2),
    [TacticalGraphicName.Mineline]:                         line(),
    [TacticalGraphicName.MineCluster]:                      line(2),
    [TacticalGraphicName.TripWire]:                         line(2),
    [TacticalGraphicName.RaftSite]:                         line(2),
    [TacticalGraphicName.FortifiedPosition]:                line(2),
    [TacticalGraphicName.DirectionOfMainAttack]:            line(),
    [TacticalGraphicName.DirectionOfSupportingAttack]:      line(),
    [TacticalGraphicName.DirectionOfMainAttackFeint]:       line(),
    [TacticalGraphicName.AviationDirectionOfAttack]:           line(),
    [TacticalGraphicName.FerryCrossing]:                    line(2),
    // The end handle moves that vertex — lengthening the lane is what dragging its
    // end means — while the resize icon still scales the whole symbol. @see Abatis
    [TacticalGraphicName.PassageLane]:                      vertexLine(2, 2),
    [TacticalGraphicName.TacticalFix]:                              vertexLine(2, 2),
    // The apex is vertex 0: APP-06 140500 numbers this symbol from its vertex, and the
    // base follows the standard now. It was 1 while the legs were drawn first. @see anchorVertex
    [TacticalGraphicName.FieldsOfFire]:                     vertexLine(3, 3, 0),

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
    // **The end handle moves that vertex; the resize icon scales the whole obstacle.**
    // Its two points are the run, and lengthening the run is what a user means by
    // dragging its end — the chevron is a decoration with its own size, not something
    // the drag should be stretching. Scaling everything together is the affordance's
    // job. @see vertexLine
    [TacticalGraphicName.Abatis]:                 vertexLine(2, 2),
    // The demolition family is a drawn centerline with a width, so it takes the
    // movement contract: two vertices plus an offset handle. @see ai/app-6.md "F2"
    [TacticalGraphicName.ExplosivesPlannedStateOfReadiness]: movement(2),
    [TacticalGraphicName.ExplosivesStateOfReadiness1Safe]: movement(2),
    [TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable]: movement(2),
    // Roadblock complete stays point-dropped: its symbol is two overlapping X's,
    // which no centerline-and-width rule in APP-06 describes. @see ai/app-6.md "F2"
    [TacticalGraphicName.RoadblockCompleteExecuted]: pointDrop,
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
    [TacticalGraphicName.Deny]: missionTask,
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
    [TacticalGraphicName.Fix]:      vertexLine(2, 2),
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
    // Literally the exfiltration's controller and holder. @see RetrogradeTask.ts
    [TacticalGraphicName.Infiltration]:       exfiltrate,
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
    [TacticalGraphicName.Destroy]:    pointDrop,
    [TacticalGraphicName.Interdict]:  pointDrop,
    [TacticalGraphicName.Neutralize]: pointDrop,
    [TacticalGraphicName.Suppress]:   pointDrop,

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
    resolution: number,
    /**
     * Where the graphic is going, in degrees — the latitude its screen-pixel sizes are
     * spent at. Defaults to the equator, where a projected metre and a real one agree,
     * which is what every caller assumed before this existed. @see ControllerFactory
     */
    latitude: number = 0,
): TacticalGraphicHandler {
    const factory = CONTROLLER_REGISTRY[graphicName];
    if (!factory) {
        throw new Error(
            `[TacticalGraphics] No controller registered for graphic "${graphicName}". ` +
            `Add an entry to controllerRegistry.ts to support this graphic.`
        );
    }
    return factory(graphicName, resolution, groundLength(resolution, latitude));
}
