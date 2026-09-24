import type {Map as MapLibreMap, SkySpecification} from 'maplibre-gl';
import {BASEMAP_LAYER_ID} from './basemapStyle';

/**
 * The demo's 3D view for MapLibre: a tilted camera over real terrain.
 *
 * **Demo-only, and excluded from the published entry point.** Terrain, sky and camera
 * are the host's basemap, not symbology; a consumer who wants them sets them on their own
 * map with three MapLibre calls. What this file proves is the part that *is* the
 * library's: the graphics are native line, fill and symbol layers, so MapLibre drapes
 * them over the terrain with no change to the paint layer.
 *
 * **Keyless, like the tiles.** Elevation is the AWS Open Data Terrain Tiles in Terrarium
 * encoding, which need no account; a key would be a published secret, since the demo is
 * public. Their sources are credited in the attribution control, as their terms ask.
 *
 * The screen-sized decorations are sized against one meters-per-pixel at the view center.
 * Tilted, the near edge of the screen covers fewer meters per pixel than the far edge, so
 * teeth and dashes grow toward the camera. That is perspective, and it is what a 3D view
 * is meant to look like. @see projection.ts, ViewTransform
 */

const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const TERRAIN_ATTRIBUTION =
    '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Terrain Tiles: Mapzen, AWS Open Data</a>';

// Two sources over the same tiles. MapLibre advises against feeding the terrain mesh and
// the hillshade layer from one source: they want the DEM at different zooms, and sharing
// makes the shading step at tile seams.
const TERRAIN_SOURCE_ID = 'tilt-terrain';
const HILLSHADE_SOURCE_ID = 'tilt-hillshade';
const HILLSHADE_LAYER_ID = 'tilt-hillshade';

/** How far the camera leans on entering 3D. 60° shows the horizon without hiding the ground. */
export const TILT_PITCH = 60;
/** A slight turn off north, so relief reads as relief rather than as a stretched map. */
const TILT_BEARING = -20;
/** Terrain is exaggerated a little: at unit scale most ground looks flat from operational heights. */
const TERRAIN_EXAGGERATION = 1.5;
const EASE_MS = 1200;

/**
 * The horizon, per mode. Dark matches the inverted basemap so the far edge fades into
 * the map instead of a daylight sky above a night map.
 */
function skyFor(dark: boolean): SkySpecification {
    return dark
        ? {
              'sky-color': '#0b1522',
              'horizon-color': '#1d2f45',
              'fog-color': '#1a1f27',
              'sky-horizon-blend': 0.6,
              'horizon-fog-blend': 0.6,
              'fog-ground-blend': 0.7,
              'atmosphere-blend': 0.6,
          }
        : {
              'sky-color': '#7fb6e8',
              'horizon-color': '#dcecf8',
              'fog-color': '#eef3f7',
              'sky-horizon-blend': 0.5,
              'horizon-fog-blend': 0.6,
              'fog-ground-blend': 0.7,
              'atmosphere-blend': 0.6,
          };
}

/** Relief that reads under both palettes: shadows darken, highlights barely lift. */
function hillshadePaint(dark: boolean) {
    return {
        'hillshade-exaggeration': dark ? 0.45 : 0.35,
        'hillshade-shadow-color': dark ? '#000000' : '#3d4a57',
        'hillshade-highlight-color': dark ? '#5a6b7d' : '#ffffff',
        'hillshade-accent-color': dark ? '#10161d' : '#5d6b78',
    } as const;
}

/**
 * The layer the hillshade goes beneath: whatever sits directly above the basemap, which
 * is the first of the graphics. Above the tiles so it shades them, below every symbol so
 * it never dims the line work.
 */
function layerAboveBasemap(map: MapLibreMap): string | undefined {
    const layers = map.getStyle().layers ?? [];
    const basemap = layers.findIndex(l => l.id === BASEMAP_LAYER_ID);
    const anchor = basemap >= 0 ? basemap : layers.findIndex(l => l.id === 'background');
    return layers[anchor + 1]?.id;
}

function addTerrain(map: MapLibreMap, dark: boolean): void {
    if (!map.getSource(TERRAIN_SOURCE_ID)) {
        map.addSource(TERRAIN_SOURCE_ID, {
            type: 'raster-dem',
            tiles: [TERRAIN_TILES],
            encoding: 'terrarium',
            tileSize: 256,
            maxzoom: 15,
            attribution: TERRAIN_ATTRIBUTION,
        });
    }
    if (!map.getSource(HILLSHADE_SOURCE_ID)) {
        map.addSource(HILLSHADE_SOURCE_ID, {type: 'raster-dem', tiles: [TERRAIN_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 15});
    }
    if (!map.getLayer(HILLSHADE_LAYER_ID)) {
        map.addLayer({id: HILLSHADE_LAYER_ID, type: 'hillshade', source: HILLSHADE_SOURCE_ID, paint: hillshadePaint(dark)}, layerAboveBasemap(map));
    }
    map.setTerrain({source: TERRAIN_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION});
    map.setSky(skyFor(dark));
}

function removeTerrain(map: MapLibreMap): void {
    map.setTerrain(null);
    if (map.getLayer(HILLSHADE_LAYER_ID)) map.removeLayer(HILLSHADE_LAYER_ID);
    if (map.getSource(HILLSHADE_SOURCE_ID)) map.removeSource(HILLSHADE_SOURCE_ID);
    if (map.getSource(TERRAIN_SOURCE_ID)) map.removeSource(TERRAIN_SOURCE_ID);
}

/** Whether the camera may turn and lean. Flat, the paint model's north-up view is kept. */
function setCameraFreedom(map: MapLibreMap, free: boolean): void {
    const toggle = (handler: {enable(): void; disable(): void}) => (free ? handler.enable() : handler.disable());
    toggle(map.dragRotate);
    toggle(map.touchPitch);
    toggle(map.touchZoomRotate);
    if (free) map.keyboard.enableRotation();
    else map.keyboard.disableRotation();
}

/**
 * Into 3D: terrain and sky first, then the camera leans over. Terrain before the ease so
 * the ground rises under a moving camera rather than popping up when it lands.
 */
export function enterTiltView(map: MapLibreMap, dark: boolean, animate = true): void {
    addTerrain(map, dark);
    setCameraFreedom(map, true);
    map.setMaxPitch(80);
    map.easeTo({pitch: TILT_PITCH, bearing: TILT_BEARING, duration: animate ? EASE_MS : 0});
}

/**
 * Back to the flat, north-up view. The terrain comes off once the camera has landed, so
 * the ground does not drop out from under the last frames of the ease.
 */
export function exitTiltView(map: MapLibreMap, animate = true): void {
    setCameraFreedom(map, false);
    const finish = () => {
        // A re-entry during the ease has put the terrain back on purpose; leave it.
        if (map.getPitch() !== 0) return;
        removeTerrain(map);
    };
    if (!animate) {
        map.jumpTo({pitch: 0, bearing: 0});
        finish();
        return;
    }
    map.once('moveend', finish);
    map.easeTo({pitch: 0, bearing: 0, duration: EASE_MS});
}

/** Re-tint the sky and the relief when the app's mode changes. No-op when flat. */
export function repaintTiltView(map: MapLibreMap, dark: boolean): void {
    if (!map.getTerrain()) return;
    map.setSky(skyFor(dark));
    const paint = hillshadePaint(dark);
    if (map.getLayer(HILLSHADE_LAYER_ID)) {
        (Object.keys(paint) as (keyof typeof paint)[]).forEach(p => map.setPaintProperty(HILLSHADE_LAYER_ID, p, paint[p]));
    }
}
