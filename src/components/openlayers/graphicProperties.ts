/**
 * Bridges the map-agnostic `properties.tacticalGraphic` schema (see
 * `tacticalgraphics/core/render.ts`) onto OpenLayers features.
 *
 * Amplifiers — the graphic's label, hostility, status, DTGs — used to live in
 * JavaScript memory: on the graphic-holder instance, passed to style functions
 * as a closure argument, with a WeakMap linking a feature back to its holder.
 * That made a drawn graphic unserializable and locked styling to the holder.
 *
 * They now live on the feature, under the same key the core library uses. Style
 * functions read them with {@link readGraphicLabels}; graphic holders write them
 * with {@link writeGraphicProperties} whenever the user edits a label.
 *
 * A feature carrying these properties can be styled with no holder instance at
 * all — which is what makes `readFeatures(geojson)` round-trip.
 */

import type {Feature} from 'ol';
import type {FeatureLike} from 'ol/Feature';
import {TACTICAL_GRAPHIC_KEY, applyAmplifierAliases} from '@zaes/tactical-graphics';
import type { TacticalGraphicRole} from '@zaes/tactical-graphics';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {GraphicLabels} from '../../utils/graphicLinkRegistry';
import type {GraphicGeometryState} from '../graphicAmplifiers';

export {TACTICAL_GRAPHIC_KEY};

/**
 * Returned when a feature carries no amplifiers yet — during the draw
 * interaction, or for a feature built outside the graphic holders. Frozen so a
 * style function can't accidentally mutate the shared default.
 */
const NO_LABELS: GraphicLabels = Object.freeze({designation: ''});

/**
 * The subset of `TacticalGraphicProperties` that describes *how the shape was built*
 * rather than what it says. Persisting these is what makes a reloaded graphic
 * editable rather than merely visible.
 *
 * Every member is portable: meters and degrees, meaningful to any renderer. Values that
 * only mean something to *this* renderer — the drawing resolution, and the
 * security-operation `scale` that is only interpretable when multiplied by it — are not
 * here. They live under the snapshot's `renderer` object; see `persistence.ts`.
 *
 * **Moved to `components/graphicAmplifiers.ts`** and re-exported here. It is a
 * description of a graphic's shape inputs, which both renderers need, and this
 * module imports `ol`. @see graphicAmplifiers.ts
 */
export type {GraphicGeometryState};

/** Feature property naming which part of a graphic a feature is. */
export const ROLE_KEY = 'role' as const;

/**
 * Tags a feature with its part in the graphic.
 *
 * The core library already stamps `role` on the GeoJSON `renderTacticalGraphic`
 * returns (`TacticalGraphicRole`), but the OpenLayers holders build their features
 * by hand and never did — leaving no reliable way to tell a base feature from a
 * label. The `base` boolean is not that way: `mobileDefense` and the point-anchored
 * holders deliberately clear it to keep themselves out of the Modify interaction,
 * so it means "vertex-editable", not "is the base".
 *
 * Returns the feature so it can wrap a constructor call inline.
 */
export function assignRole<T extends Feature>(feature: T, role: TacticalGraphicRole): T {
    feature.set(ROLE_KEY, role);
    return feature;
}

/** Reads the role tag, or `undefined` for a feature that predates the tagging. */
export function readRole(feature: FeatureLike): TacticalGraphicRole | undefined {
    return feature.get(ROLE_KEY) as TacticalGraphicRole | undefined;
}

/**
 * Reads a feature's amplifiers. Never returns undefined, so style functions can
 * use the result without a null check — an unlabelled graphic styles as if the
 * user left every field blank.
 */
export function readGraphicLabels(feature: FeatureLike): GraphicLabels {
    const bag = feature.get(TACTICAL_GRAPHIC_KEY) as GraphicLabels | undefined;
    return bag ? applyAmplifierAliases(bag) : NO_LABELS;
}

/**
 * Stamps a graphic's name, amplifiers and geometry inputs onto every feature it
 * owns, and marks each feature dirty so the map redraws it.
 *
 * The explicit `changed()` is load-bearing. `ol/Object.set` only dispatches
 * `propertychange` and `change:<key>` — it never calls `changed()`, so the
 * feature's revision counter does not move. A VectorSource happens to listen
 * for `propertychange` and would redraw anyway, but a feature not yet added to
 * a source, or rendered through any other path, would silently keep its old
 * label. `changed()` restores exactly the behavior of the `.changed()` calls
 * this function replaced.
 *
 * `geometry` carries the *inputs* a holder needs to reproduce its shape — `size`,
 * `radius`, `rotation`. Without it a graphic serializes to the right picture and the
 * wrong state: the rendered geometry survives, but the numbers that produced it live
 * only on the holder instance, so a reloaded graphic cannot be rotated or resized.
 * Only holders whose state the *user* can change need to pass it — anything derived
 * from the drawing resolution is reproduced for free by rebuilding through
 * `getController(name, drawingResolution)`.
 */
export function writeGraphicProperties(
    features: (Feature | undefined)[],
    name: TacticalGraphicName,
    labels: GraphicLabels,
    geometry?: GraphicGeometryState,
): void {
    const properties = {name, ...labels, ...geometry};
    for (const feature of features) {
        if (!feature) continue;
        feature.set(TACTICAL_GRAPHIC_KEY, properties);
        feature.changed();
    }
}

/**
 * Reads back the geometry inputs `writeGraphicProperties` stamped. Returns an empty
 * object for a feature that carries none, so a caller can spread it unconditionally.
 */
export function readGraphicGeometryState(feature: FeatureLike): GraphicGeometryState {
    const stored = feature.get(TACTICAL_GRAPHIC_KEY) as (GraphicLabels & GraphicGeometryState) | undefined;
    const bag = stored && applyAmplifierAliases(stored);
    if (!bag) return {};
    const {radius, decorationSize, width, length, rotation, bend, mirrored} = bag;
    const state: GraphicGeometryState = {};
    if (radius !== undefined) state.radius = radius;
    if (decorationSize !== undefined) state.decorationSize = decorationSize;
    if (width !== undefined) state.width = width;
    if (length !== undefined) state.length = length;
    if (rotation !== undefined) state.rotation = rotation;
    if (bend !== undefined) state.bend = bend;
    if (mirrored !== undefined) state.mirrored = mirrored;
    return state;
}
