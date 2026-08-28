/**
 * # What the Feature Properties dialog needs from a map
 *
 * The dialog is ~580 lines of form and ~120 lines of map coupling. This is the
 * 120, named — so the form can serve both renderers instead of being rewritten
 * once per engine.
 *
 * The split is drawn where the *renderer* knowledge actually is:
 *
 * - **selection** — which graphic is under a click, and its current amplifiers
 * - **anchoring** — where on screen that graphic sits, for the connector cone
 * - **applying** — writing the edited amplifiers back and re-rendering
 *
 * Everything else — which fields a graphic shows, how a blank one is seeded, what
 * "changed" means — is doctrine and React, and belongs to neither engine.
 */

import type {TacticalGraphicName} from '@zaes/tactical-graphics';
import type {GraphicGeometryState, GraphicLabels} from './graphicAmplifiers';

/** The graphic a click landed on, as much of it as the dialog cares about. */
export interface SelectedGraphic {
    /**
     * Identifies the graphic to the source that produced this selection. Opaque
     * here — OpenLayers uses its `symbolId`, MapLibre its renderer id — because the
     * dialog never does anything with it except hand it back.
     */
    id: string;
    graphicName: TacticalGraphicName;
    /** The amplifiers as stored, unfiltered. The dialog narrows them by field set. */
    labels: GraphicLabels;
    /** Kept outside `labels` because it is stamped outside the bag. @see PaintFeature.echelon */
    echelon: string;
    /** Read-only geometry inputs in meters — what the user set by dragging. */
    measured: GraphicGeometryState;
    /**
     * The size the graphic was drawn at, in projected meters.
     *
     * Only the range fans read it, to seed a first band at the drawn radius so that
     * opening the editor and pressing OK does not snap the geometry to the 1 km
     * fallback.
     */
    graphicSize?: number;
}

/** The map-side half of the properties dialog. */
export interface FeaturePropertiesSource {
    /**
     * Subscribes to selection. The callback fires with the graphic a click landed
     * on, or `null` for a click on empty map. Returns an unsubscribe.
     */
    onSelect(callback: (selection: SelectedGraphic | null) => void): () => void;

    /**
     * Where the selected graphic sits, in **viewport** pixels — the coordinate space
     * `getBoundingClientRect` reports in, since the connector is drawn in a
     * page-level SVG rather than inside the map.
     *
     * Returns undefined when the graphic is off screen or the map is not ready, and
     * the connector is then simply not drawn.
     */
    anchorPixel(selection: SelectedGraphic): [number, number] | undefined;

    /** Writes the edited amplifiers back to the graphic and re-renders it. */
    apply(selection: SelectedGraphic, labels: GraphicLabels, echelon: string): void;

    /**
     * Whether a click should be ignored right now — mid-draw, most often.
     *
     * Asked before selection rather than folded into `onSelect` so the reason stays
     * with the engine that knows it: OpenLayers has an active `Draw` interaction and
     * a just-finished-drawing grace period; MapLibre has neither yet.
     */
    suppressed?(): boolean;
}
