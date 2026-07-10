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
import {TACTICAL_GRAPHIC_KEY} from '@zaes/tactical-graphics';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {GraphicLabels} from '../../utils/graphicLinkRegistry';

export {TACTICAL_GRAPHIC_KEY};

/**
 * Returned when a feature carries no amplifiers yet — during the draw
 * interaction, or for a feature built outside the graphic holders. Frozen so a
 * style function can't accidentally mutate the shared default.
 */
const NO_LABELS: GraphicLabels = Object.freeze({label: ''});

/**
 * Reads a feature's amplifiers. Never returns undefined, so style functions can
 * use the result without a null check — an unlabelled graphic styles as if the
 * user left every field blank.
 */
export function readGraphicLabels(feature: FeatureLike): GraphicLabels {
    return (feature.get(TACTICAL_GRAPHIC_KEY) as GraphicLabels | undefined) ?? NO_LABELS;
}

/**
 * Stamps a graphic's name and amplifiers onto every feature it owns, and marks
 * each feature dirty so the map redraws it.
 *
 * The explicit `changed()` is load-bearing. `ol/Object.set` only dispatches
 * `propertychange` and `change:<key>` — it never calls `changed()`, so the
 * feature's revision counter does not move. A VectorSource happens to listen
 * for `propertychange` and would redraw anyway, but a feature not yet added to
 * a source, or rendered through any other path, would silently keep its old
 * label. `changed()` restores exactly the behaviour of the `.changed()` calls
 * this function replaced.
 */
export function writeGraphicProperties(
    features: (Feature | undefined)[],
    name: TacticalGraphicName,
    labels: GraphicLabels,
): void {
    const properties = {name, ...labels};
    for (const feature of features) {
        if (!feature) continue;
        feature.set(TACTICAL_GRAPHIC_KEY, properties);
        feature.changed();
    }
}
