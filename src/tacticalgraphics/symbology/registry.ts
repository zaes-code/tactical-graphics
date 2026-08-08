/**
 * # name → paint function
 *
 * The map-agnostic twin of `openlayers/controllerRegistry.ts`, restricted to the
 * spike's three graphic families.
 *
 * **Deliberately not an exhaustive `Record<TacticalGraphicName, …>`.** The three
 * OpenLayers registries are exhaustive so the compiler walks you through adding a
 * graphic, and this one will be too once every style function is ported. Making
 * it exhaustive now would mean 200-odd entries pointing at a placeholder, which
 * reads as "done" and is the opposite of what a spike should leave behind.
 * {@link isPaintable} is how a renderer asks whether a graphic has been ported
 * yet, so the gap is visible rather than silently wrong.
 */

import type {PaintFeature, PaintContext, Paint} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {arcMissionTaskPaint, missionTaskLabelPaint, obstacleLinePaint, phaseLinePaint} from './paintFunctions';

/** What a graphic's `graphic` and `label` features paint with. */
export interface GraphicPainters {
    /** The line work. Every graphic has one. */
    graphic: (feature: PaintFeature, context: PaintContext) => Paint[];
    /** The text, when it lives on a separate label feature rather than in the line work. */
    label?: (feature: PaintFeature, context: PaintContext) => Paint[];
}

/**
 * The arc-and-arrowhead mission tasks. All eight cut the gap for their letter
 * from the rendered glyph, and all but `AreaDefense` are ratio-locked, so their
 * label scale tracks the circle's radius.
 *
 * `AreaDefense` also carries solid polygon teeth, which the spike's paint
 * function does not draw — it is registered here for the arc geometry only, and
 * that gap is recorded rather than hidden.
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

function buildRegistry(): Partial<Record<TacticalGraphicName, GraphicPainters>> {
    const registry: Partial<Record<TacticalGraphicName, GraphicPainters>> = {
        [TacticalGraphicName.PhaseLine]: {graphic: phaseLinePaint(TacticalGraphicName.PhaseLine)},
        [TacticalGraphicName.ObstacleLine]: {graphic: obstacleLinePaint(TacticalGraphicName.ObstacleLine)},
    };

    for (const name of ARC_MISSION_TASKS) {
        registry[name] = {
            graphic: arcMissionTaskPaint(name, true),
            label: missionTaskLabelPaint(name),
        };
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
