import React, {useEffect, useRef, useState} from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../../styles/map.css';
import '../../styles/maplibre.css';

// Named imports, not a default: maplibre-gl v6 dropped the default export that
// v4/v5 shipped. `import maplibregl from 'maplibre-gl'` typechecks under
// `allowSyntheticDefaultImports` and then fails at bundle time with
// "export 'default' was not found" — a mismatch tsc cannot see.
import {AttributionControl, Map as MapLibreMap, ScaleControl, setWorkerUrl} from 'maplibre-gl';
import type {TacticalGraphicsConfigOptions} from '@zaes/tactical-graphics';

import {createBasemapStyle} from './basemapStyle';
import {resolutionOf} from './projection';
import {CanvasOverlayRenderer} from './canvas/CanvasOverlayRenderer';
import {NativeLayerRenderer} from './native/NativeLayerRenderer';
import {SPIKE_SAMPLES} from '../spikeSamples';
import {drawSpikeSamples} from './spikeDriver';

/**
 * The MapLibre half of the demo's engine picker.
 *
 * Deliberately the same shape as `openlayers/OpenLayers.tsx` — same props, same
 * dev-only window hook, same lifecycle — so `MapRendering` can swap one for the
 * other and the comparison is between renderers rather than between two
 * differently-built demo pages.
 *
 * **Not published.** Like its OpenLayers twin this is demo code; what ships from
 * `@zaes/tactical-graphics/maplibre` is the renderer underneath it.
 */

interface Props {
    darkMode: boolean;
    /** The user's config overrides. Used as an invalidation trigger, not read directly. */
    graphicsSettings: TacticalGraphicsConfigOptions;
}

/**
 * Where both engines open, so a capture of one lines up with a capture of the
 * other. The OpenLayers view uses `center: [0, 0]`, `zoom: 4` in EPSG:3857 —
 * which is MapLibre zoom 3, since MapLibre's world is 512 px at zoom 0 and
 * OpenLayers' is 256. @see resolutionOf
 */
const START_CENTER: [number, number] = [0, 0];
const START_ZOOM = 3;

/**
 * Which of the two spike paths draws the graphics.
 *
 * - `canvas` — path A, a 2D overlay synced to the camera. Style functions port
 *   1:1; MapLibre draws only the basemap.
 * - `native` — path B, geometry realised into GeoJSON sources and drawn by
 *   MapLibre's own layers. Real MapLibre rendering, at the cost of re-realising
 *   geometry on every zoom change.
 *
 * A runtime switch rather than a build flag so one capture run can compare the
 * two against each other and against OpenLayers. `?mlb=native` selects path B.
 */
export type SpikeRenderMode = 'canvas' | 'native';

/**
 * Point MapLibre at the worker bundle the app serves.
 *
 * **Required, and its absence is silent.** maplibre-gl v6 finds its own worker by
 * reading `import.meta.url`, which is not an `http(s):` URL once CRA has bundled
 * it — so MapLibre falls back to the empty string and `new Worker('')` spawns a
 * worker pointing at the document. It starts, never errors, and answers nothing.
 * The map looks fine (raster tiles decode on the main thread) while every GeoJSON
 * source sits at `isSourceLoaded() === false` forever and every vector layer
 * renders empty.
 *
 * Module scope, not an effect: it is global state, idempotent, and has to be set
 * before the first `Map` is constructed.
 *
 * @see scripts/copy-maplibre-worker.js — which puts the file in `public/`
 */
setWorkerUrl(`${process.env.PUBLIC_URL ?? ''}/maplibre-gl-worker.mjs`);

const INITIAL_MODE: SpikeRenderMode =
    new URLSearchParams(window.location.search).get('mlb') === 'native' ? 'native' : 'canvas';

const MapLibreMapComponent: React.FC<Props> = ({darkMode, graphicsSettings}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const [, setReady] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;

        const map = new MapLibreMap({
            container: containerRef.current,
            style: createBasemapStyle(),
            center: START_CENTER,
            zoom: START_ZOOM,
            // The paint model assumes a north-up, unpitched view: every screen-pixel
            // decoration is sized against a single metres-per-pixel, and a pitched
            // camera does not have one. OpenLayers' 2D renderer has no other mode
            // either, so disabling these keeps the two engines comparable rather than
            // taking something away. @see projection.ts, ViewTransform
            pitchWithRotate: false,
            dragRotate: false,
            touchZoomRotate: false,
            // Added explicitly below instead, so the compact form is unambiguous.
            attributionControl: false,
        });

        // Required by the OSM Tile Usage Policy — the tiles are donated and the
        // credit is the price. Don't remove it while trimming controls.
        map.addControl(new AttributionControl({compact: true}), 'bottom-right');
        map.addControl(new ScaleControl({unit: 'metric'}), 'bottom-left');
        map.keyboard.disableRotation();

        mapRef.current = map;

        // Both spike paths are built, and which one draws is a runtime switch, so a
        // single capture run can compare them against each other and against
        // OpenLayers without rebuilding. `renderer` is whichever is live.
        let canvas: CanvasOverlayRenderer | null = null;
        let native: NativeLayerRenderer | null = null;
        let mode: SpikeRenderMode = INITIAL_MODE;

        const renderer = () => (mode === 'native' ? native : canvas);

        const load = (snapshot = SPIKE_SAMPLES) => {
            const target = renderer();
            if (!target) return {drawn: 0, skipped: ['no renderer']};
            target.clear();
            // The spike's three graphics, from the shared fixture. Both engines are
            // handed the same GeoJSON, so any difference between the two pictures is a
            // renderer difference and there is no third input to blame.
            return drawSpikeSamples(snapshot, g => target.add(g), resolutionOf(map));
        };

        map.on('load', () => {
            canvas = new CanvasOverlayRenderer(map);
            native = new NativeLayerRenderer(map);
            // Only one draws at a time; the idle one simply holds no graphics.
            load();
            setReady(true);
        });

        // Test hook for the driving scripts, mirroring the one OpenLayers.tsx
        // installs. Stripped from production builds; nothing in the app may read it.
        if (process.env.NODE_ENV !== 'production') {
            // The fixture itself, so a probe can tile it up to gallery scale without
            // re-stating it. @see spikeSamples.ts
            (window as unknown as Record<string, unknown>).__spikeFixture = SPIKE_SAMPLES;
            (window as unknown as Record<string, unknown>).__tacticalGraphicsMapLibre = {
                map,
                resolutionOf: () => resolutionOf(map),
                get overlay() { return canvas; },
                get native() { return native; },
                get mode() { return mode; },
                setMode: (next: SpikeRenderMode) => {
                    canvas?.clear();
                    native?.clear();
                    mode = next;
                    return load();
                },
                drawSpikeSamples: (snapshot = SPIKE_SAMPLES) => load(snapshot),
            };
        }

        return () => {
            canvas?.destroy();
            native?.destroy();
            map.remove();
            mapRef.current = null;
            if (process.env.NODE_ENV !== 'production') {
                delete (window as unknown as Record<string, unknown>).__tacticalGraphicsMapLibre;
            }
        };
    }, []);

    // Nothing to publish to the library — `MapRendering` is the single writer of the
    // config. This only needs to trigger a repaint, since the paint functions read
    // the config live but the overlay caches its last frame.
    useEffect(() => {
        mapRef.current?.triggerRepaint();
    }, [graphicsSettings, darkMode]);

    return (
        <div
            ref={containerRef}
            className={`map-container${darkMode ? ' map-container--dark' : ''}`}
        />
    );
};

export default MapLibreMapComponent;
