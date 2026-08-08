import type {FeatureCollection} from 'geojson';
import {TACTICAL_GRAPHIC_KEY, TacticalGraphicHostility, TacticalGraphicName} from '@zaes/tactical-graphics';

/**
 * # The MapLibre spike's fixture
 *
 * Three graphics at fixed lon/lat, as **one plain GeoJSON FeatureCollection** —
 * the same document both renderers are handed.
 *
 * That shape is the experiment, not a convenience. `properties.tacticalGraphic`
 * is the library's portable description: the OpenLayers side loads this through
 * `restoreTacticalGraphics`, the MapLibre side through `buildTacticalGraphic`,
 * and neither is given anything the other did not get. If the two pictures differ,
 * the difference is in a renderer — there is no third input to blame.
 *
 * ## Why these three
 *
 * They are the three *kinds* of work the 69 style functions are made of, chosen in
 * `ai/maplibre-renderer.md` before any code existed:
 *
 * - **Phase line** — a plain stroke, and the honest baseline. Even it needs a text
 *   measurement to place its end labels.
 * - **Obstacle line** — teeth that are not in the geometry at all. Built per frame
 *   from the view scale, shrunk against the shape's own on-screen size, dropped
 *   entirely below 3 px. This is the one that decides whether a declarative
 *   renderer is possible.
 * - **Secure** — a point-anchored circle whose one-letter label sits in a hole cut
 *   to the size of the glyph that actually renders.
 *
 * Demo-only. Excluded from both published entry points, like `sampleGallery.ts`.
 */

/**
 * Radius in metres for the point-anchored sample.
 *
 * Chosen so the circle is ~150 screen px at the demo's opening view, which is
 * large enough for the label gap to be doing visible work and small enough that
 * `decorationScale` is not clamping anything. Both engines open at the same scale
 * — MapLibre zoom 3 is OpenLayers zoom 4 — so one number serves both.
 */
const SECURE_RADIUS_M = 1_400_000;

export const SPIKE_SAMPLES: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: [[-42, 26], [-2, 26]]},
            properties: {
                role: 'base',
                symbolId: 'spike-phase-line',
                graphicName: TacticalGraphicName.PhaseLine,
                [TACTICAL_GRAPHIC_KEY]: {
                    name: TacticalGraphicName.PhaseLine,
                    label: 'BLUE',
                },
            },
        },
        {
            // Hostile, so the same fixture also checks that the affiliation colour
            // reaches the MapLibre line work — the rule is that hostile line work
            // goes red while text amplifiers stay black.
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: [[-42, 8], [-2, 8]]},
            properties: {
                role: 'base',
                symbolId: 'spike-obstacle-line',
                graphicName: TacticalGraphicName.ObstacleLine,
                [TACTICAL_GRAPHIC_KEY]: {
                    name: TacticalGraphicName.ObstacleLine,
                    label: 'A1',
                    hostility: TacticalGraphicHostility.hostileFaker,
                },
            },
        },
        {
            type: 'Feature',
            geometry: {type: 'Point', coordinates: [-22, -14]},
            properties: {
                role: 'base',
                symbolId: 'spike-secure',
                graphicName: TacticalGraphicName.Secure,
                [TACTICAL_GRAPHIC_KEY]: {
                    name: TacticalGraphicName.Secure,
                    radius: SECURE_RADIUS_M,
                    rotation: 0,
                },
            },
        },
    ],
};
