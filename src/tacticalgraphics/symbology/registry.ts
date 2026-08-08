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
    arcMissionTaskPaint,
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
