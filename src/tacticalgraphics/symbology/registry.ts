/**
 * # name → paint function
 *
 * The map-agnostic twin of `openlayers/controllerRegistry.ts`. A renderer asks
 * this what draws a graphic; `isPaintable` is how it finds out whether the answer
 * exists yet.
 *
 * **Deliberately not an exhaustive `Record<TacticalGraphicName, …>`.** The three
 * OpenLayers registries are exhaustive so the compiler walks you through adding a
 * graphic, and this one will be too once every style function is ported. Making it
 * exhaustive now would mean 190-odd entries pointing at a placeholder, which reads
 * as "done" and is the opposite of what a partial port should leave behind.
 *
 * ## This is not yet the single dispatch point, and that is the next job
 *
 * OpenLayers still decides which style a graphic gets from a `switch` inside
 * `LineGraphicBase` and its sibling holders, and this table restates the same
 * routing. Two places to keep in step is one too many — the end state is that the
 * holders consult this, so the routing lives beside the paint functions. Until
 * then, **a graphic added here must match what the OpenLayers holder does**, and
 * the list below was derived from that switch rather than written by hand:
 *
 * ```
 * line() entries in controllerRegistry:        52
 *   with a bespoke style function:             35   ← still to port
 *   falling through to defaultLineStyle:       17   ← DEFAULT_LINE_GRAPHICS
 * ```
 */

import type {PaintFeature, PaintContext, Paint} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {
    areaDefaultLabelPaint,
    areaLabelStackPaint,
    groupOrSeriesOfTargetsLabelPaint,
    positionAreaArtilleryLabelPaint,
    smokeObscurantLabelPaint,
    zoneLabelPaint,
} from './areaLabelPaints';
import {
    encirclementPaint,
    fortifiedAreaPaint,
    groupOrSeriesOfTargetsPaint,
    limitedAccessAreaPaint,
    obstacleAreaPaint,
} from './areaPaints';
import {
    arcMissionTaskPaint,
    areaOutlinePaint,
    defaultLinePaint,
    missionTaskLabelPaint,
    obstacleLinePaint,
    phaseLinePaint,
} from './paintFunctions';

/** What a graphic's `graphic` and `label` features paint with. */
export interface GraphicPainters {
    /** The line work. Every graphic has one. */
    graphic: (feature: PaintFeature, context: PaintContext) => Paint[];
    /** The text, when it lives on a separate label feature rather than in the line work. */
    label?: (feature: PaintFeature, context: PaintContext) => Paint[];
}

/**
 * The arc-and-arrowhead mission tasks. All of them cut the gap for their letter
 * from the rendered glyph, and all are ratio-locked, so the label scale tracks the
 * circle's radius.
 *
 * `AreaDefense` belongs to the family and is **not** listed here: it is not
 * ratio-locked, and it is registered separately below so that difference stays
 * visible rather than being smuggled into a loop.
 */
const ARC_MISSION_TASKS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.Contain,
    TacticalGraphicName.Control,
    TacticalGraphicName.CordonAndSearch,
    TacticalGraphicName.Isolate,
    TacticalGraphicName.Occupy,
    TacticalGraphicName.Retain,
    TacticalGraphicName.Secure,
];

/**
 * The Lines-category graphics with no bespoke style — designation above each end,
 * date-time group below, dashed when planned.
 *
 * Derived from `LineGraphicBase`'s style switch: every `line()` entry that reaches
 * its `default:` branch.
 *
 * `MovingConvoy` and `HaltedConvoy` are **not** here. They belong to the set by
 * shape — the same generator, the same default style — but both are switched off
 * on purpose (`ai/excluded-graphics.md`, 2026-08-02, "for now"), so their enum
 * members are commented out. Reviving them means uncommenting seven sites, of
 * which this list is now one.
 */
const DEFAULT_LINE_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.BattlefieldHandoverLine,
    TacticalGraphicName.BridgeheadLine,
    TacticalGraphicName.CommonSensorBoundary,
    TacticalGraphicName.DelayLine,
    TacticalGraphicName.FinalCoordinationLine,
    TacticalGraphicName.FireSupportCoordinationLine,
    TacticalGraphicName.ForwardEdgeOfBattleArea,
    TacticalGraphicName.IdentificationFriendOrFoeOff,
    TacticalGraphicName.IdentificationFriendOrFoeOn,
    TacticalGraphicName.IntelligenceCoordinationLine,
    TacticalGraphicName.LimitOfAdvance,
    TacticalGraphicName.LineOfDeparture,
    TacticalGraphicName.LineOfDepartureOrLineOfContact,
    TacticalGraphicName.ReleaseLine,
    TacticalGraphicName.RestrictiveFireLine,
];

/**
 * The area graphics with no bespoke style — a plain outline in the affiliation's
 * colour, dashed when planned.
 *
 * Derived from `getStyleFromLabels`: every `polygon` / `polygonRect` entry that
 * falls past its 15 named special cases. The largest single family in the library.
 */
const DEFAULT_AREA_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.AirSpaceCoordinationAreaIrregular,
    TacticalGraphicName.AirSpaceCoordinationAreaRectangular,
    TacticalGraphicName.AirToAirRefuelingRestrictedOperationsZone,
    TacticalGraphicName.Airfield,
    TacticalGraphicName.AirheadLine,
    TacticalGraphicName.AreaOfOperations,
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular,
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneRectangular,
    TacticalGraphicName.AssaultPosition,
    TacticalGraphicName.AssemblyArea,
    TacticalGraphicName.AttackPosition,
    TacticalGraphicName.BaseCamp,
    TacticalGraphicName.BlueKillBoxIrregular,
    TacticalGraphicName.BlueKillBoxRectangular,
    TacticalGraphicName.BrigadeSupportArea,
    TacticalGraphicName.CallForFireZoneIrregular,
    TacticalGraphicName.CallForFireZoneRectangular,
    TacticalGraphicName.CensorZoneIrregular,
    TacticalGraphicName.CensorZoneRectangular,
    TacticalGraphicName.CorpsSupportArea,
    TacticalGraphicName.CriticalFriendlyZoneIrregular,
    TacticalGraphicName.CriticalFriendlyZoneRectangular,
    TacticalGraphicName.DeadSpaceAreaIrregular,
    TacticalGraphicName.DeadSpaceAreaRectangular,
    TacticalGraphicName.DetaineeHoldingArea,
    TacticalGraphicName.DivisionSupportArea,
    TacticalGraphicName.DropZone,
    TacticalGraphicName.EngagementArea,
    TacticalGraphicName.FireSupportAreaIrregular,
    TacticalGraphicName.FireSupportAreaRectangular,
    TacticalGraphicName.ForwardArmingAndRefuelingPoint,
    TacticalGraphicName.FreeFireAreaIrregular,
    TacticalGraphicName.FreeFireAreaRectangular,
    TacticalGraphicName.GuerrillaBase,
    TacticalGraphicName.HighAltitudeMissileEngagementZone,
    TacticalGraphicName.HighDensityAirspaceControlZone,
    TacticalGraphicName.JointEngagementZone,
    TacticalGraphicName.KillZone,
    TacticalGraphicName.LandingZone,
    TacticalGraphicName.LowAltitudeMissileEngagementZone,
    TacticalGraphicName.MissileEngagementZone,
    TacticalGraphicName.NamedAreaOfInterest,
    TacticalGraphicName.ObjectiveArea,
    TacticalGraphicName.PickupZone,
    TacticalGraphicName.PositionAreaArtilleryIrregular,
    TacticalGraphicName.PositionAreaArtilleryRectangular,
    TacticalGraphicName.PurpleKillBoxIrregular,
    TacticalGraphicName.PurpleKillBoxRectangular,
    TacticalGraphicName.RefugeeHoldingArea,
    TacticalGraphicName.RestrictedOperationsZone,
    TacticalGraphicName.RestrictiveFireAreaIrregular,
    TacticalGraphicName.RestrictiveFireAreaRectangular,
    TacticalGraphicName.ShortRangeAirDefenseEngagementZone,
    TacticalGraphicName.SmokeObscurant,
    TacticalGraphicName.TargetAreaIrregular,
    TacticalGraphicName.TargetAreaOfInterest,
    TacticalGraphicName.TargetAreaRectangular,
    TacticalGraphicName.UnmannedAircraftRestrictedOperationsZone,
    TacticalGraphicName.WeaponEngagementZone,
];


/**
 * The zone families that share one label layout: prefix over name centred, the two
 * date-time groups outside the shape's upper-left.
 *
 * Split by variant because the date anchor differs. A rectangle's corner is a real
 * vertex and a circle has none, so both use the bounding box; an irregular polygon's
 * bounding-box corner can sit far outside the shape, so those use the real vertex.
 */
const ZONE_GRAPHICS_BOXED: readonly TacticalGraphicName[] = [
    TacticalGraphicName.FireSupportAreaRectangular,
    TacticalGraphicName.FireSupportAreaCircular,
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneRectangular,
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular,
    TacticalGraphicName.CriticalFriendlyZoneRectangular,
    TacticalGraphicName.CriticalFriendlyZoneCircular,
    TacticalGraphicName.CensorZoneRectangular,
    TacticalGraphicName.CensorZoneCircular,
    TacticalGraphicName.CallForFireZoneRectangular,
    TacticalGraphicName.CallForFireZoneCircular,
    TacticalGraphicName.DeadSpaceAreaRectangular,
    TacticalGraphicName.DeadSpaceAreaCircular,
    TacticalGraphicName.BlueKillBoxRectangular,
    TacticalGraphicName.BlueKillBoxCircular,
    TacticalGraphicName.PurpleKillBoxRectangular,
    TacticalGraphicName.PurpleKillBoxCircular,
];

const ZONE_GRAPHICS_IRREGULAR: readonly TacticalGraphicName[] = [
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular,
    TacticalGraphicName.CriticalFriendlyZoneIrregular,
    TacticalGraphicName.CensorZoneIrregular,
    TacticalGraphicName.CallForFireZoneIrregular,
    TacticalGraphicName.DeadSpaceAreaIrregular,
    TacticalGraphicName.BlueKillBoxIrregular,
    TacticalGraphicName.PurpleKillBoxIrregular,
];

/** The families whose label is a plain centred stack of designation over dates. */
const STACK_LABEL_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.NoFireAreaRectangular,
    TacticalGraphicName.NoFireAreaCircular,
    TacticalGraphicName.NoFireAreaIrregular,
    TacticalGraphicName.FireSupportAreaIrregular,
    TacticalGraphicName.FreeFireAreaCircular,
    TacticalGraphicName.FreeFireAreaIrregular,
    TacticalGraphicName.FreeFireAreaRectangular,
    TacticalGraphicName.RestrictiveFireAreaCircular,
    TacticalGraphicName.RestrictiveFireAreaIrregular,
    TacticalGraphicName.RestrictiveFireAreaRectangular,
    TacticalGraphicName.LimitedAccessArea,
    TacticalGraphicName.ObstacleRestrictedArea,
];

/** The areas registered with a structural graphic painter, which still need labels. */
const SPECIAL_AREA_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.ObstacleBelt,
    TacticalGraphicName.ObstacleGroup,
    TacticalGraphicName.ObstacleZone,
    TacticalGraphicName.ObstacleFreeArea,
    TacticalGraphicName.ObstacleRestrictedArea,
    TacticalGraphicName.FortifiedArea,
    TacticalGraphicName.GroupOrSeriesOfTargets,
    TacticalGraphicName.Encirclement,
    TacticalGraphicName.LimitedAccessArea,
    TacticalGraphicName.NoFireAreaCircular,
    TacticalGraphicName.NoFireAreaIrregular,
    TacticalGraphicName.NoFireAreaRectangular,
    TacticalGraphicName.WeaponsFreeZone,
];

/**
 * The label painter for an area graphic, mirroring `getAreaLabelStylesFromLabels`.
 *
 * `undefined` means "no bespoke layout", and the caller falls back to
 * {@link areaDefaultLabelPaint} exactly as the OpenLayers switch's `default:` branch
 * does. Keeping the fallback at the call site rather than in here makes the two
 * structures line up, which matters while the routing lives in two places.
 *
 * Not covered yet, and so still falling through to the default: the eleven
 * air-coordinating zones, the three airspace-coordination areas, and the airfield.
 * Each has its own dedicated function with layout this table cannot express.
 */
function areaLabelPainterFor(name: TacticalGraphicName) {
    if (ZONE_GRAPHICS_BOXED.includes(name)) return zoneLabelPaint(name, false);
    if (ZONE_GRAPHICS_IRREGULAR.includes(name)) return zoneLabelPaint(name, true);
    if (STACK_LABEL_GRAPHICS.includes(name)) return areaLabelStackPaint(name);
    if (name === TacticalGraphicName.ObstacleFreeArea) return areaLabelStackPaint(name, {before: ['FREE']});
    if (name === TacticalGraphicName.GroupOrSeriesOfTargets) return groupOrSeriesOfTargetsLabelPaint(name);
    if (name === TacticalGraphicName.SmokeObscurant) return smokeObscurantLabelPaint();
    if (
        name === TacticalGraphicName.PositionAreaArtilleryCircular ||
        name === TacticalGraphicName.PositionAreaArtilleryIrregular ||
        name === TacticalGraphicName.PositionAreaArtilleryRectangular
    ) {
        return positionAreaArtilleryLabelPaint(name);
    }
    return undefined;
}

function buildRegistry(): Partial<Record<TacticalGraphicName, GraphicPainters>> {
    const registry: Partial<Record<TacticalGraphicName, GraphicPainters>> = {
        [TacticalGraphicName.PhaseLine]: {graphic: phaseLinePaint(TacticalGraphicName.PhaseLine)},
        [TacticalGraphicName.ObstacleLine]: {graphic: obstacleLinePaint(TacticalGraphicName.ObstacleLine)},
        [TacticalGraphicName.ProbableLineOfDeployment]: {
            graphic: defaultLinePaint(TacticalGraphicName.ProbableLineOfDeployment, {
                alwaysDashed: true,
                showDates: false,
            }),
        },
        // Same arc geometry as the ratio-locked seven, but its own label scale and a
        // set of solid polygon teeth that `arcMissionTaskPaint` fills.
        [TacticalGraphicName.AreaDefense]: {
            graphic: arcMissionTaskPaint(TacticalGraphicName.AreaDefense, false),
            label: missionTaskLabelPaint(TacticalGraphicName.AreaDefense),
        },

        // ── The areas that draw something structural ──────────────────────────
        // Teeth outward for the belt / group / zone, inward for the free and
        // restricted areas, and the restricted area alone is hatched.
        [TacticalGraphicName.ObstacleBelt]: {graphic: obstacleAreaPaint({outward: true})},
        [TacticalGraphicName.ObstacleGroup]: {graphic: obstacleAreaPaint({outward: true})},
        [TacticalGraphicName.ObstacleZone]: {graphic: obstacleAreaPaint({outward: true})},
        [TacticalGraphicName.ObstacleFreeArea]: {graphic: obstacleAreaPaint({outward: false})},
        [TacticalGraphicName.ObstacleRestrictedArea]: {graphic: obstacleAreaPaint({outward: false, hatched: true})},

        [TacticalGraphicName.FortifiedArea]: {graphic: fortifiedAreaPaint()},
        [TacticalGraphicName.GroupOrSeriesOfTargets]: {graphic: groupOrSeriesOfTargetsPaint()},
        [TacticalGraphicName.Encirclement]: {graphic: encirclementPaint()},

        // One hatched fill under an affiliation-coloured outline.
        [TacticalGraphicName.LimitedAccessArea]: {graphic: limitedAccessAreaPaint()},
        [TacticalGraphicName.NoFireAreaCircular]: {graphic: limitedAccessAreaPaint()},
        [TacticalGraphicName.NoFireAreaIrregular]: {graphic: limitedAccessAreaPaint()},
        [TacticalGraphicName.NoFireAreaRectangular]: {graphic: limitedAccessAreaPaint()},
        [TacticalGraphicName.WeaponsFreeZone]: {graphic: limitedAccessAreaPaint()},
    };

    for (const name of ARC_MISSION_TASKS) {
        registry[name] = {
            graphic: arcMissionTaskPaint(name, true),
            label: missionTaskLabelPaint(name),
        };
    }

    for (const name of DEFAULT_LINE_GRAPHICS) {
        registry[name] = {graphic: defaultLinePaint(name)};
    }

    for (const name of DEFAULT_AREA_GRAPHICS) {
        registry[name] = {graphic: areaOutlinePaint(name)};
    }

    // Labels last, over whatever graphic painter was registered above. Every area
    // gets one: the bespoke layout if its family has one, the default otherwise.
    for (const name of [...DEFAULT_AREA_GRAPHICS, ...SPECIAL_AREA_GRAPHICS]) {
        const entry = registry[name];
        if (entry) entry.label = areaLabelPainterFor(name) ?? areaDefaultLabelPaint(name);
    }

    return registry;
}

const REGISTRY = buildRegistry();

/** Every graphic that has a paint function today. */
export const PAINTABLE_GRAPHICS: readonly TacticalGraphicName[] = Object.keys(REGISTRY) as TacticalGraphicName[];

/** Whether `name` has been ported to a paint function yet. */
export function isPaintable(name: TacticalGraphicName): boolean {
    return name in REGISTRY;
}

/** The painters for `name`, or `undefined` if it has not been ported. */
export function getPaintFunction(name: TacticalGraphicName): GraphicPainters | undefined {
    return REGISTRY[name];
}
