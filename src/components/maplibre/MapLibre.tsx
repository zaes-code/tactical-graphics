import React, {useEffect, useRef, useState} from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../../styles/map.css';
import '../../styles/maplibre.css';

// Named imports, not a default: maplibre-gl v6 dropped the default export that
// v4/v5 shipped. `import maplibregl from 'maplibre-gl'` typechecks under
// `allowSyntheticDefaultImports` and then fails at bundle time with
// "export 'default' was not found" — a mismatch tsc cannot see.
import {AttributionControl, Map as MapLibreMap, ScaleControl} from 'maplibre-gl';
import type {TacticalGraphicsConfigOptions} from '@zaes/tactical-graphics';

import {createBasemapStyle} from './basemapStyle';
import {resolutionOf} from './projection';

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
        map.on('load', () => setReady(true));

        // Test hook for the driving scripts, mirroring the one OpenLayers.tsx
        // installs. Stripped from production builds; nothing in the app may read it.
        if (process.env.NODE_ENV !== 'production') {
            (window as unknown as Record<string, unknown>).__tacticalGraphicsMapLibre = {
                map,
                resolutionOf: () => resolutionOf(map),
            };
        }

        return () => {
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
