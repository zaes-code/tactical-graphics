/**
 * Declarative registry that maps every TacticalGraphicName to a factory
 * function that produces the correct TacticalGraphicHandler.
 *
 * Adding a new graphic requires only one entry here instead of touching a
 * 300-line switch statement.
 */

import {CROSSED_HALF_WIDTH_PX, TacticalGraphicName, allowedGestures, drawClickCount, dropSizePx, groundLength} from '@zaes/tactical-graphics';
import {TacticalGraphicHandler} from './openlayersAdapter';
import {AreaGraphicBase} from './graphics/AreaGraphicBase';
import {RectangularAreaGraphicBase} from './graphics/RectangularAreaGraphicBase';
import {
    CircularAreaGraphicBase,
    RectangularTargetGraphicBase,
    EnvelopmentGraphicBase,
    AmbushGraphicBase,
    ContainGraphicBase,
    PursuitGraphicBase,
    DemonstrationGraphicBase,
    MissionTaskGraphicBase,
    TurnGraphicBase,
} from './graphics/MissionTaskGraphicBase';
import {RangeFanGraphicBase} from './graphics/RangeFanGraphicBase';
import {MovementGraphicBase} from './graphics/MovementGraphicBase';
import {RetrogradeTask} from './graphics/RetrogradeTask';
import {Exfiltrate} from './graphics/Exfiltrate';
import {ReliefInPlace} from './graphics/ReliefInPlace';
import {Block} from './graphics/Block';
import {Boundary} from './graphics/Boundary';
import {AirCorridor} from './graphics/AirCorridor';
import {LineGraphicBase} from './graphics/LineGraphicBase';
import {LineGraphicController} from './controllers/LineGraphicController';
import {AnchorClickController, MissionTaskController, PointDropController, RangeClickController} from './controllers/MissionTaskController';
import {PolygonGraphicController} from './controllers/PolygonGraphicController';

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

/**
 * The demolition block: a drawn centreline and a placed side point, all three grabbable.
 *
 * `movement()` alone leaves `dragsVertices` off, which is right while a movement graphic's
 * handles are a start, an end and a *derived* offset — the offset is not a vertex, so there
 * is nothing to drag. Point 3 is a vertex here as of 2026-09-05, and the two ends have to
 * move too: dragging an end should lengthen the symbol and dragging the side should widen
 * it, each without disturbing the other. Without this the end handles did nothing an
 * operator wanted and the side handle scaled the whole graphic. (User's report.)
 *
 * `enableVertexDragging` also clears `hidesStartHandle`, which the two-point constructor
 * sets — "a point you can move needs something to grab". @see LineGraphicController
 */
const demolition = (name: TacticalGraphicName, res: number, sizing: number) =>
    new LineGraphicController(new MovementGraphicBase(name, 20 * sizing, res), 3, name).enableVertexDragging(3);

/**
 * 152800: three placed points, every one of them grabbable.
 *
 * It was a two-point ellipse whose base was deliberately kept *out* of the Modify
 * interaction — `base.set('base', false)` — on the reading that the shape was fully
 * determined by its two endpoints and had "no vertices worth editing". The plate gives it
 * three anchor points, and the third is the one that states the arc, so there is now
 * something to drag and the base belongs in the set like any other drawn line.
 * @see MobileDefense, demolition — the same shape of controller
 */
const mobileDefense = (name: TacticalGraphicName, res: number, sizing: number) =>
    new LineGraphicController(new MovementGraphicBase(name, 20 * sizing, res), 3, name).enableVertexDragging(3);

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

/**
 * The four bracket mission tasks: three placed points, every one of them grabbable.
 *
 * Capped at two until 2026-09-06, with the opening's height derived as a locked 0.3 of the
 * drawn length — so the third anchor point APP-06 gives them could not be placed, and the
 * height and the length their plates state *separately* were one number. Same holder as
 * `block`, which draws them; only the draw and the grips change.
 * @see frontEdgeFrame, Breach
 */
const bracket = (name: TacticalGraphicName, res: number, sizing: number) =>
    new LineGraphicController(new Block(name, sizing * 20, res), 3, name).enableVertexDragging(3);

/**
 * Block and disrupt: three placed points, every one of them grabbable.
 *
 * Capped at two until 2026-09-06, and the two were the *stem* — block's crossbar was a screen
 * constant laid across the far end, disrupt's vertical line the same. Both plates place that
 * line instead: "Points 1 and 2 define the endpoints of the symbol's vertical line."
 * Same holder as `block`, which draws them; only the draw and the grips change.
 * @see Block, Disrupt, blockAnchors, disruptAnchors
 */
const barAndStem = (name: TacticalGraphicName, res: number, sizing: number) =>
    new LineGraphicController(new Block(name, sizing * 20, res), 3, name).enableVertexDragging(3);

/**
 * 152100 support by fire: **four** placed points — the bar's two ends and both arrow tips.
 *
 * The only four-point member of this family, and the one the user's three-point list turned
 * out not to cover: its plate asks for four outright. It was two, off which the bar, both
 * arrows and their spread were computed by ratio, so the "left and right limits of coverage"
 * its arrowheads indicate were limits nobody had stated. @see supportByFireFromAnchors
 */
const firePosition = (name: TacticalGraphicName, res: number, sizing: number) =>
    new LineGraphicController(new Block(name, sizing * 20, res), 4, name).enableVertexDragging(4);

/**
 * The seven cane arrows: three placed points, every one of them grabbable.
 *
 * Capped at two until 2026-09-06, with the arc's diameter carried as a `size` amplifier and
 * its side as a `mirrored` flag - so the third anchor point APP-06 gives them could not be
 * placed and the draw ended a click early. @see RetrogradeTask, mobileDefense
 */
const retrograde = (name: TacticalGraphicName, res: number, sizing: number) =>
    new LineGraphicController(new RetrogradeTask(name, sizing * 20, res), 3, name).enableVertexDragging(3);

// No maxPoints: an exfiltration route bends, so the user draws as many vertices as
// the route needs and every one of them keeps an edit handle.
const exfiltrate = (name: TacticalGraphicName, res: number, sizing: number) =>
    // Three anchor points, each meaning something. @see GeometryService.createSCurve
    new LineGraphicController(new Exfiltrate(name, sizing * 20, res), 3, name).enableVertexDragging(3, 0);

/*
 * **Four placed points, as 341900 names them** — the two arrowhead tips and the two arrow
 * ends. It was a two-point line plus a `size` amplifier that set the U's height, which
 * forced the arrows parallel and equal and left points 3 and 4 nowhere. (User's call,
 * 2026-09-06.)
 *
 * It keeps its own holder rather than moving to `vertexLine`: the `RIP` break is cut by a
 * style this holder attaches, and a generic line holder does not know to. @see ReliefInPlace
 */
/**
 * 341900: three clicks, four stored points, and the fourth is not draggable.
 *
 * `enableVertexDragging(3)` rather than 4 — point 4 is derived so the two straights stay
 * parallel and the same length, and a grip on it would offer a freedom the shape does not
 * have. @see hairpinAnchors, ANCHOR_VERTEX
 */
const reliefInPlace = (name: TacticalGraphicName, res: number, sizing: number) =>
    new LineGraphicController(new ReliefInPlace(name, sizing * 20, res), 3, name).enableVertexDragging(3);

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
/*
 * **Three clicks: the tip, the rear, then the bend.** 270504's Template letters PT 1,
 * PT 2 and PT 3 whatever its "requires two anchor points" sentence says, and point 3
 * "indicates on which side of the line the arc is placed". It was drawn centre-to-edge
 * until 2026-09-05. @see AnchorClickController, anchorsFromClicks
 */
const turn = (name: TacticalGraphicName, res: number) => {
    const controller = new AnchorClickController(new TurnGraphicBase(name, res, res), drawClickCount(name) ?? 3);
    controller.editStretches = true;
    return controller;
};

// Envelopment follows Turn exactly: point-anchored, drawn center-to-edge so the
// first click places it and the second sizes it, with a second handle for the
// half circle's radius riding the manager's per-handle drag hook.
/*
 * **Three clicks: the run's two ends, then the diameter.** 343500 names four points, but
 * the fourth only "defines which side of the line the arc is on" — which point 3 already
 * says — so it is constructed at the arc's apex rather than asked for.
 */
const envelopment = (name: TacticalGraphicName, res: number) => {
    const controller = new AnchorClickController(new EnvelopmentGraphicBase(name, res, res), drawClickCount(name) ?? 3);
    controller.editStretches = true;
    return controller;
};

// Pursuit needs its own holder for the same reason envelopment does: APP-06 draws it
// from anchor points, and the points have to be written and read back in that symbol's
// own layout. @see PursuitGraphicBase
// Ambush recovers its center from the chord of its arc, so it reads and writes its own
// point layout too. @see AmbushGraphicBase
/*
 * **Two clicks: the arrowhead's tip, then one end of the curved back.** 141700 names three
 * points, and its own constraints — the arrow perpendicular to the chord, meeting its
 * midpoint — leave a family of symbols rather than one. The remaining freedom is closed by
 * holding the shape and letting the click set only the size, so point 3 is constructed.
 * (User's call, 2026-09-05.) @see ambushAnchors
 */
const ambush = (name: TacticalGraphicName, res: number) => {
    const controller = new AnchorClickController(new AmbushGraphicBase(name, res, res), drawClickCount(name) ?? 2);
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

/*
 * **Three clicks: the run's two ends, then the hook.** 344000's arc "is always
 * perpendicular to the line", so the third click is taken for its distance across the run
 * and its side, and put on that perpendicular. @see pursuitAnchors
 */
const pursuit = (name: TacticalGraphicName, res: number) => {
    const controller = new AnchorClickController(new PursuitGraphicBase(name, res, res), drawClickCount(name) ?? 3);
    controller.editStretches = true;
    return controller;
};

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

/**
 * The rectangular target: one anchor point, and a box made of amplifiers.
 *
 * Point-anchored rather than `polygonRect`, because its plate gives it one anchor point and
 * not two. That puts it on the mission-task controller like every other point-anchored
 * graphic — `editStretches` for the same reason the circles have it, so an edit-mode drag
 * resizes instead of panning the map. @see RectangularTargetGraphicBase
 */
const rectangularTarget = (name: TacticalGraphicName, res: number) => {
    const controller = new MissionTaskController(new RectangularTargetGraphicBase(name, res, res));
    controller.editStretches = true;
    return controller;
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

/**
 * 200700: the range-fan holder, drawn by placing its three points.
 *
 * The holder is `rangeFan`'s — same bands, same rim handles, same band editor — and only the
 * draw differs. @see RangeClickController
 */
const radarSearch = (name: TacticalGraphicName, res: number) => {
    const controller = new RangeClickController(
        new RangeFanGraphicBase(name, res, res),
        drawClickCount(name) ?? 3,
    );
    controller.editStretches = true;
    return controller;
};

/**
 * Cover, guard and screen: **two clicks and no handles.**
 *
 * They were placed on one anchor at a fixed screen size until 2026-08-29. APP-06 gives them
 * four anchor points — two per arrow — and the operator now draws the first arrow while the
 * generator derives the second, so the pair cannot disagree. `line(2)` is the ordinary
 * fixed-vertex line controller: an edit drag scales the whole symbol, which is what these
 * want, and the generator publishes no handle points so none are drawn. @see SecurityOperation
 */
const securityOp = line(2);

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
    [TacticalGraphicName.MinedArea]: polygon,
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
    [TacticalGraphicName.TargetAreaRectangular]:                 rectangularTarget,
    // Two anchor points and a width -- the rectangle family's controller, not the
    // rectangular target's. @see RECTANGULAR_GRAPHICS
    [TacticalGraphicName.TargetAreaSingleTargetAegis]:           polygonRect,
    // APP-06 200202 / 200402 -- two anchor points and a width, so the rectangle family's
    // controller, like 240804 above. @see RECTANGULAR_GRAPHICS
    [TacticalGraphicName.DefendedAreaRectangle]:                 polygonRect,
    [TacticalGraphicName.ShipAreaOfInterestRectangle]:           polygonRect,
    /*
     * The maritime areas built from one anchor point.
     *
     * The three ellipses and the cued acquisition doctrine take `rectangularTarget`: two
     * independent dimensions and an attitude, all three typed, which is the contract that
     * factory exists for. 200300 and 200500 are a centre and a radius, which is
     * `circularArea`. 200700's four numbers are a two-ring sector, which is `rangeFan`.
     */
    [TacticalGraphicName.LaunchAreaEllipse]:                     rectangularTarget,
    [TacticalGraphicName.DefendedAreaEllipse]:                   rectangularTarget,
    [TacticalGraphicName.ShipAreaOfInterestEllipse]:             rectangularTarget,
    [TacticalGraphicName.CuedAcquisitionDoctrine]:               rectangularTarget,
    [TacticalGraphicName.NoAttackZone]:                          circularArea,
    [TacticalGraphicName.ActiveManeuverArea]:                    circularArea,
    /*
     * **One anchor point and four numbers, placed with three clicks.**
     *
     * 200700 *"requires one anchor point that defines the axis of angular rotation"*, with
     * the size and shape *"determined by additional numeric values, a search axis azimuth, a
     * start range, a stop range, and a stop relative bearing."* So it stores the range-fan
     * contract — a `Point` base, bands in the amplifiers, the band editor the field registry
     * has always offered it, and a rim handle on each of its two arcs.
     *
     * **How it is drawn is a separate question, and the answer is three clicks**: the radar,
     * then each arc, with a bare arc on the map in between. It was briefly a drop-and-drag,
     * which can only state one of the two ranges. (User's report, 2026-09-05.)
     * @see RangeClickController, radarSearchFromClicks, RangeFanGraphicBase
     */
    [TacticalGraphicName.RadarSearchDoctrine]:                   radarSearch,
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
    /*
     * **Three placed points, exactly like the demolition block.** 140800: *"This symbol
     * requires three anchor points. Points 1 and 2 define the endpoints of the infiltration
     * lane and point 3 defines one side of the lane."* That is 271201's rule in the same
     * words, so it takes the same factory. (User's call, 2026-09-05.)
     *
     * It was `movement(2)`: the draw closed on the second click and the rails appeared at a
     * seeded width for a *derived* offset handle to drag afterwards, with the number filed
     * beside a base that already described it. Now the third click places the point and the
     * rails separate and contract live as it is aimed. @see InfiltrationLane, demolition
     */
    [TacticalGraphicName.InfiltrationLane]:     demolition,

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
    /*
     * APP-06 §8.11 -- `line(2)`, not `vertexLine(2, 2)`.
     *
     * `vertexLine` is for a graphic whose *shape is the arrangement of its vertices*, so a
     * drag moves the grabbed one rather than scaling the symbol. None of these is that: each
     * draw rule says the two anchor points "define the line" and 220100's adds that the
     * symbol "varies only in length". There is no arrangement to preserve, so the plain
     * capped two-point line -- ferry crossing's and trip wire's family -- is the right one.
     *
     * **This changes no behaviour, and that is worth saying rather than leaving implied.**
     * Both factories publish the same single grip here; a capped two-point line gets one and
     * an uncapped `line()` gets two, which is why phase line shows two. The reason to move
     * is that `vertexLine` states something untrue about these symbols, not that it drew
     * them wrongly. @see tmp/probe-maritime-handles.mjs, which measured all four.
     */
    [TacticalGraphicName.BearingLine]: line(2),
    [TacticalGraphicName.BearingLineElectronic]: line(2),
    [TacticalGraphicName.BearingLineElectromagneticWarfare]: line(2),
    [TacticalGraphicName.BearingLineAcoustic]: line(2),
    [TacticalGraphicName.BearingLineAcousticAmbiguous]: line(2),
    [TacticalGraphicName.BearingLineTorpedo]: line(2),
    [TacticalGraphicName.BearingLineElectroOpticalIntercept]: line(2),
    [TacticalGraphicName.BearingLineJammer]: line(2),
    [TacticalGraphicName.BearingLineRadioDirectionFinder]: line(2),
    [TacticalGraphicName.NavigationalRhumbLine]: line(2),
    // APP-06 218400 -- two anchor points, "varies only in length", the same family.
    /*
     * **A vertex line, so the red handle lengthens the bar and leaves the ticks.**
     *
     * `line(2)` gave it no vertex handles at all, so every drag went through the stretch
     * path and scaled the whole symbol -- the ticks with it. Its plate says the symbol
     * "varies only in length", which is exactly the gesture that had no way to happen.
     * (User's call, 2026-09-04.) The follow tasks have been `vertexLine(2, 2)` for the same
     * reason, and `editStretches` still lets a drag on the *body* resize.
     */
    [TacticalGraphicName.NavigationalLine]: vertexLine(2, 2),
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
    // "Additional points can be defined to extend the line" -- no vertex limit, and
    // each vertex stands a pylon, so a drag has to move the grabbed one.
    [TacticalGraphicName.OverheadWire]:                     vertexLine(0, 2),
    // The mineline extends with extra vertices; the other four are defined by two
    // anchor points and nothing else, so their draw stops at two.
    // Four anchor points, each meaning something different, so every one is draggable.
    // Handle 0 is the circle's centre and moves the whole graphic.
    [TacticalGraphicName.Capture]:                          vertexLine(4, 4, 0),
    [TacticalGraphicName.Seize]:                            vertexLine(4, 4, 0),
    /*
     * **`vertexLine`, so the handle moves its vertex instead of scaling the symbol.**
     *
     * `line(2)` stretches: `editStretches` is true for anything with a fixed vertex count,
     * so dragging the red handle resized the whole graphic — the fish tail and the
     * arrowhead grew with the line. These two want the other behaviour, which is what this
     * factory is for: the handle lengthens the line, and the resize affordance is what
     * scales the symbol.
     *
     * `movement()` would be wrong for a third reason — it reserves an offset handle at
     * `handleCoords[2]` for a width these symbols do not have, leaving the feature empty.
     * @see visiblePathHandles for why only one of the two points shows a handle.
     */
    [TacticalGraphicName.FollowAndAssume]:                  vertexLine(2, 2),
    [TacticalGraphicName.FollowAndSupport]:                 vertexLine(2, 2),
    // Centre first, then the two ends -- the order the standard numbers them.
    [TacticalGraphicName.Escort]:                           vertexLine(3, 3, 0),
    /*
     * **Four placed points, each with a grip.** 343300 names four anchor points and this was
     * a one-click drop that laid all four out from a single centre, so the operator stated
     * position and nothing else. `vertexLine(4, 4)` is the same contract Capture and Seize
     * take. (User's call, 2026-09-06.) @see Demonstration
     */
    // Three clicks; the fourth point is derived and inert. @see hairpinAnchors, ANCHOR_VERTEX
    [TacticalGraphicName.Demonstration]:                    vertexLine(3, 3, 3),
    [TacticalGraphicName.Evacuate]:                         vertexLine(4, 4, 0),
    [TacticalGraphicName.Recover]:                          vertexLine(4, 4, 0),
    [TacticalGraphicName.DecisionLine]:                     line(),
    [TacticalGraphicName.MobilityCorridor]:                 line(),
    // Three anchor points: two arrow tips and the rear. Handle 2 is the rear, which is
    // the one that moves the whole shape.
    // Centre, then the two radii. Handle 0 is the centre and moves the whole zone.
    [TacticalGraphicName.MinimumSafeDistanceZone]:          vertexLine(3, 3, 0),
    // An even number of points, half per ring, so the draw cannot be capped.
    // Six was the old pair traced end to end. Zone 1 alone is a polygon, so three.
    [TacticalGraphicName.MinimumSafeDistanceMultipleStrike]: vertexLine(0, 3, 0),
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
    // Two anchor points exactly: 290600's entry and exit. Same controller as the
    // passage lane it shares an outline with.
    [TacticalGraphicName.SafeLaneOrGap]:                    vertexLine(2, 2),
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
    [TacticalGraphicName.TacticalBlock]:       barAndStem,
    [TacticalGraphicName.Breach]:      bracket,
    [TacticalGraphicName.Bypass]:      bracket,
    [TacticalGraphicName.Canalize]:    bracket,
    [TacticalGraphicName.Clear]:       bracket,
    [TacticalGraphicName.TacticalDisrupt]:     barAndStem,
    [TacticalGraphicName.Penetration]: block,
    [TacticalGraphicName.Exploitation]: block,

    // ── Retrograde tasks (max 2 pts) ───────────────────────────────────────
    /*
     * Abatis takes a drawn route with as many vertices as the road needs. @see ai/app-6.md "F1"
     *
     * **Uncapped, because 280100 says so outright**: *"This symbol requires at least two
     * anchor points, points 1 and 2, to define the line. Additional points can be defined
     * to extend the line."* Fifty-two rules carry that sentence and this was the only
     * graphic in the library that capped it — its own family (both anti-tank ditches, all
     * nine wire obstacles, the fortified line) has always been uncapped. The comment here
     * already said "`line()` with no vertex cap" while the code said two. (2026-09-05.)
     *
     * **Still `vertexLine`, not `line()`**, because the rest of the note below is about the
     * grip and remains true: the end handle moves that vertex; the resize icon scales the
     * whole obstacle. Its points are the run, and lengthening the run is what a user means
     * by dragging its end — the chevron is a decoration with its own size, not something
     * the drag should be stretching. Scaling everything together is the affordance's job.
     * `0` is the "no maximum" argument. @see vertexLine
     */
    [TacticalGraphicName.Abatis]:                 vertexLine(0, 2),
    /*
     * The demolition family is a drawn centreline with a width. **All three of its points
     * are placed as of 2026-09-05**: 271201 names them, and the third — which sets how far
     * apart the rails sit — was a derived offset handle with the separation carried beside
     * the base as a `width`. It is a stored vertex now, so the rails separate and contract
     * live as the third click is aimed. @see sideAnchors, ai/app-6.md "F2"
     */
    [TacticalGraphicName.ExplosivesPlannedStateOfReadiness]: demolition,
    [TacticalGraphicName.ExplosivesStateOfReadiness1Safe]: demolition,
    [TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable]: demolition,
    /*
     * **Roadblock complete joins them, as of 2026-09-05.** It was point-dropped on the
     * reading that "no centerline-and-width rule in APP-06 describes" two overlapping X's.
     * The plate says otherwise: 271204's Template letters **PT 1, PT 2 and PT 3** on the
     * crosses, and its own Draw Rules cell is *empty* — the row inherits 271201's rule,
     * the very centreline-and-width one, along with the rest of the block. A point-dropped
     * symbol also could not be laid across a road running any way but the default, which
     * is the same defect that moved the three readiness states off a fixed 45 degrees.
     * @see RoadblockComplete for how the three points are read.
     */
    // Excluded — see ai/excluded-graphics.md
    // [TacticalGraphicName.RoadblockCompleteExecuted]: demolition,
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
    [TacticalGraphicName.Block]:    barAndStem,
    [TacticalGraphicName.Disrupt]:  barAndStem,
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
    /*
     * APP-06 152200 -- fields of fire's controller exactly: three vertices, each of which
     * means something, and the apex inert so a reshape drag cannot bend the symbol about
     * its own origin. The holder and controller it used before 2026-09-04 are gone with the
     * SVG badge they drove. @see anchorVertex
     */
    [TacticalGraphicName.SearchArea]:                       vertexLine(3, 3, 0),

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
    [TacticalGraphicName.FortifiedLine]:    line(),

    // ── Range fans (point-based, multi-band doctrinal renderer) ────────────
    [TacticalGraphicName.WeaponSensorRangeFanCircular]: rangeFan,
    [TacticalGraphicName.WeaponSensorRangeFanSector]:   rangeFan,

    // ── Additional mission task block arrows ────────────────────────────────
    [TacticalGraphicName.AttackByFire]:     block,
    [TacticalGraphicName.SupportByFire]:    firePosition,
    // Excluded — see ai/excluded-graphics.md
    // [TacticalGraphicName.FollowAndAssume]:  block,
    // [TacticalGraphicName.FollowAndSupport]: block,

    // ── Crossed-line mission tasks (one click plants it; resize yes, rotate no) ──
    [TacticalGraphicName.Defeat]:     pointDrop,
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
    /*
     * The convoys: `line(2)`, capped, because both plates define the symbol by exactly two
     * anchor points and say it "varies only in length" -- ferry crossing's family, not the
     * vertex-arrangement one. @see BASE_VERTEX_COUNT, which states the same count for both
     * engines
     */
    // Vertex lines for the same reason as 218400: the red handle makes the convoy longer,
    // and the body width is a `decorationSize` only the resize gesture touches.
    [TacticalGraphicName.MovingConvoy]:     vertexLine(2, 2),
    [TacticalGraphicName.HaltedConvoy]:     vertexLine(2, 2),

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
