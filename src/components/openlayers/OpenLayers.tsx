import React, {useEffect, useMemo, useRef, useState} from 'react';
import 'ol/ol.css';
import '../../styles/map.css';

// MapControls is no longer rendered here — it moved up to `MapRendering` so one
// panel can drive either engine. @see components/mapEngine.ts
import {createMap, getColorByHostility} from './openlayerStyles';
import ol from 'ol/dist/ol';
import TacticalGraphicsDialog from '../tactical-graphics-dialog';
import {createOpenLayersPropertiesSource} from './featurePropertiesSource';
import {TacticalGraphicsManager} from './TacticalGraphicsManager';
import {createTacticalGraphics} from './createTacticalGraphics';
import type {EditMode, TacticalGraphicsEngine} from '@zaes/tactical-graphics';
import {clearAllGraphics} from './sampleGallery';
// The sweep's grid, shared with the MapLibre view so both engines draw the same one.
import {sampleFeatureCollection} from '../maplibre/sampleGallery';
import {restoreTacticalGraphics, serializeTacticalGraphics} from './persistence';
import {TacticalGraphicHostility, TacticalGraphicName, TacticalGraphicsConfigOptions} from '@zaes/tactical-graphics';
import {getSecurityOperationSymbolSize, setSecurityOperationSymbolSize} from './securityOperationSymbol';
import {isEmpty} from '../../utils/isEmpty';
import {readViewport, writeViewport} from '../mapViewport';
import {fromLonLat, toLonLat} from 'ol/proj';
import type {FeatureCollection} from 'geojson';
import {SPIKE_SAMPLES} from '../spikeSamples';
import type {MapEngineHandle} from '../mapEngine';
import {FULL_CAPABILITIES} from '../mapEngine';

interface Props {
    darkMode: boolean;
    /** The user's config overrides. Used as an invalidation trigger, not read directly. */
    graphicsSettings: TacticalGraphicsConfigOptions;
    /** Hands the controls panel something to drive. @see mapEngine.ts */
    onReady(handle: MapEngineHandle | null): void;
    /** Mirrored up so the shared panel can show the current edit mode. */
    onInteractionModeChange(mode: EditMode): void;
}

/**
 * How far the sample sweep keeps its content from the map's edges, in pixels — and how
 * far from the *left* edge, where the controls panel floats over the map and would
 * otherwise swallow a whole column of samples. The same two numbers `sampleGallery.ts`
 * lays its grid out with.
 */
const SAMPLE_VIEW_PADDING_PX = 14;
const SAMPLE_CONTROL_PANEL_PX = 326;

const OpenLayersMapComponent: React.FC<Props> = ({darkMode, graphicsSettings, onReady, onInteractionModeChange}) => {
    const [map, setMap] = useState<ol.Map | null>(null);
    const mapRef = useRef<HTMLDivElement | null>(null);
    const [interactionMode, setInteractionMode] = useState<EditMode>('view');
    const selectedShape = useRef<TacticalGraphicName>(TacticalGraphicName.AirCorridor);
    const modeRef = useRef(interactionMode);
    const tacticalGraphicManager = useRef<TacticalGraphicsManager>(null);
    /** The library façade, wrapping that manager. @see createTacticalGraphics */
    const engine = useRef<TacticalGraphicsEngine | null>(null);

    useEffect(() => {
        modeRef.current = interactionMode;
        engine.current?.setInteractionMode(interactionMode);
        onInteractionModeChange(interactionMode);
    }, [interactionMode, onInteractionModeChange]);

    useEffect(() => {
        if (!mapRef.current) return;
        const olMap = createMap(mapRef.current);
        setMap(olMap);
        tacticalGraphicManager.current = new TacticalGraphicsManager(olMap);

        // Open where the other engine — or the last visit — left off. Applied before
        // the first frame, so there is no visible jump from the default view.
        const storedView = readViewport();
        if (storedView) {
            const view = olMap.getView();
            view.setCenter(fromLonLat([storedView.lon, storedView.lat]));
            view.setResolution(storedView.resolution);
        }
        const rememberView = () => {
            const view = olMap.getView();
            const center = view.getCenter();
            const resolution = view.getResolution();
            if (!center || !resolution) return;
            const [lon, lat] = toLonLat(center);
            writeViewport({lon, lat, resolution});
        };
        olMap.on('moveend', rememberView);

        // **Force a frame once the page is on screen and its container measured.**
        //
        // OpenLayers renders on demand: a frame is scheduled by an interaction, a
        // resize, or a source loading. Nothing schedules one for "the browser finally
        // laid this out" or "the tab you booted in is visible again", and a map that
        // drew its one frame into a container it had not measured — or while
        // `requestAnimationFrame` was suspended because the document was hidden —
        // stays blank until something else asks for a frame. The reported symptom is
        // exactly that: panel present, map area empty, and the tiles appearing the
        // moment the zoom changes. `updateSize` re-reads the container and `render`
        // asks for the frame; both are no-ops when the map is already correct, which
        // is why this can be unconditional.
        const revive = () => {
            if (document.visibilityState !== 'visible') return;
            olMap.updateSize();
            olMap.render();
        };
        // After layout rather than during this effect: the container's height comes
        // from a flex chain that is not resolved while React is still committing.
        const firstFrame = requestAnimationFrame(revive);
        document.addEventListener('visibilitychange', revive);
        // A back/forward restore re-shows a page without a visibility change.
        window.addEventListener('pageshow', revive);

        // **Through the library's façade**, adopting the manager rather than replacing
        // it: the demo still reaches past it for the sample sweep and the file IO, which
        // are the app's own concerns. `onModeChange` is how the engine reports a mode it
        // chose itself — a draw finishing returns to view — without which the draw button
        // keeps reading "Drawing…" long after the draw is over.
        engine.current = createTacticalGraphics(olMap, {
            manager: tacticalGraphicManager.current,
            onModeChange: setInteractionMode,
        });

        // Test hook for scripts/drive-app.mjs, which drives the draw/edit flow in a
        // real browser and asserts on feature properties. Stripped from production
        // builds. Nothing in the app may read this.
        if (process.env.NODE_ENV !== 'production') {
            (window as unknown as Record<string, unknown>).__tacticalGraphics = {
                map: olMap,
                manager: tacticalGraphicManager.current,
                // The center-symbol controls, so a driving script can change the size
                // and read back what the style function resolves. Module-level state,
                // so this is a handle on it rather than a copy.
                setSecurityOperationSymbolSize,
                getSecurityOperationSymbolSize,
                // The MapLibre spike's fixture, restored through the ordinary
                // persistence path. Both engines are handed the same GeoJSON, so a
                // side-by-side capture compares renderers rather than test rigs.
                drawSpikeSamples: (snapshot: FeatureCollection = SPIKE_SAMPLES) =>
                    restoreTacticalGraphics(tacticalGraphicManager.current!, snapshot),
            };
        }

        onReady({
            // **Every tactical-graphics verb comes from the library**, unchanged. What
            // is spelled out below is only what the *application* adds: a demo gallery,
            // and moving GeoJSON through the user's filesystem.
            ...engine.current,
            capabilities: FULL_CAPABILITIES,
            startDrawing: name => {
                selectedShape.current = name;
                engine.current?.startDrawing(name);
            },
            reset: () => {
                engine.current?.clearAll();
            },
            drawSamples: hostility => {
                // **The same grid MapLibre draws, restored through the ordinary path.**
                // The two sweeps used to be different programs — this one packed measured
                // cells under category banners, that one tiled a plain grid — so the
                // engines could not be compared by looking at them, which is most of what
                // the sweep is for. Handing both the identical GeoJSON makes them
                // identical by construction rather than by imitation.
                setInteractionMode('view');
                engine.current?.restore(sampleFeatureCollection(hostility));
                fitToGraphics();
            },
            exportGeoJson: () => {
                const snapshot = engine.current?.snapshot();
                if (!snapshot) return;
                const blob = new Blob([JSON.stringify(snapshot, null, 2)], {type: 'application/geo+json'});
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = 'tactical-graphics.geojson';
                anchor.click();
                URL.revokeObjectURL(url);
            },
            importGeoJson: async file => {
                setInteractionMode('view');
                try {
                    engine.current?.restore(JSON.parse(await file.text()));
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.error('Import failed — not readable as a tactical graphics GeoJSON.', e);
                }
            },
        });

        return () => {
            onReady(null);
            cancelAnimationFrame(firstFrame);
            olMap.un('moveend', rememberView);
            document.removeEventListener('visibilitychange', revive);
            window.removeEventListener('pageshow', revive);
            olMap.setTarget(undefined);
            // Delete the hook, don't just drop the map. Until the engine picker existed
            // this component never unmounted, so a stale `__tacticalGraphics` was
            // unreachable — now it outlives its map and *shadows* the MapLibre hook,
            // and a driving script that probes for it silently steers a dead map while
            // screenshotting a live one. Cost an hour of reading correct code as broken.
            if (process.env.NODE_ENV !== 'production') {
                delete (window as unknown as Record<string, unknown>).__tacticalGraphics;
            }
        };
    }, []);

    // Swap tile source when dark mode changes
    useEffect(() => {
        if (!map) return;
        // Nothing to publish to the library: `MapRendering` is the single writer of the
        // config, chrome colors included. This effect only swaps the basemap layers and
        // sweeps the drawn features so they re-render.
        const tileLayers = map.getLayers().getArray();
        if (isEmpty(tileLayers)) return;
        const darkTileLayer = tileLayers.find(l => l.get('name') === 'darkBaseMap');
        const lightTileLayer = tileLayers.find(l => l.get('name') === 'lightBaseMap');
        if (!darkTileLayer || !lightTileLayer) return;
        if (darkMode) {
            darkTileLayer.setVisible(true);
            lightTileLayer.setVisible(false);
        } else {
            darkTileLayer.setVisible(false);
            lightTileLayer.setVisible(true);
        }
        // `hostilityColor` caches a *resolved* color, so a feature drawn in one mode would
        // keep that mode's color forever. Re-derive it before invalidating, or the sweep
        // below faithfully re-renders the stale value.
        tacticalGraphicManager.current?.renderingVectorSource.forEachFeature(f => {
            const hostility = f.get('hostility');
            if (hostility && f.get('hostilityColor')) {
                f.set('hostilityColor', getColorByHostility(hostility));
            }
            // Invalidate per-feature style cache so StyleFunctions re-evaluate with new mode
            f.changed();
        });
    }, [map, darkMode]);

    // Re-render already-drawn graphics when any config setting changes — style functions
    // read the config live, but OL caches the rendered output per feature revision, so a
    // feature that hasn't otherwise changed keeps its old stroke width and colors until
    // something bumps its revision. Same reasoning as the dark-mode sweep above.
    //
    // `MapRendering`'s own effect publishes the config, and child effects run first — but
    // `changed()` only *marks* a feature dirty. OL repaints on the next animation frame,
    // by which point every effect in the commit has run, so the style functions do read
    // the new config.
    useEffect(() => {
        if (!map) return;
        tacticalGraphicManager.current?.renderingVectorSource.forEachFeature(f => {
            const hostility = f.get('hostility');
            // Same stale-stamp problem as the mode sweep: `hostilityColor` caches a
            // *resolved* color, so re-tinting an affiliation has to re-derive it.
            if (hostility && f.get('hostilityColor')) {
                f.set('hostilityColor', getColorByHostility(hostility));
            }
            f.changed();
        });
    }, [map, graphicsSettings]);

    const handleDrawTacticalGraphic = () => {
        setInteractionMode('drawing');
        tacticalGraphicManager.current?.startDrawing(selectedShape.current);
    };

    const setSelectedShape = (value: TacticalGraphicName) => {
        selectedShape.current = value;
    };

    const resetMap = () => {
        if (!map) return;
        tacticalGraphicManager.current?.renderingVectorSource.clear();
        setInteractionMode('view');
    };

    /**
     * Zooms the view to everything now on the map.
     *
     * **The sweep used to do this and stopped.** `drawProvenSamples` ended with a
     * `view.fit` over the grid it had just laid out; the sweep now goes through the
     * ordinary `restore` path so both engines draw identical GeoJSON, and the fit went
     * with the code that was replaced. The result was a gallery drawn correctly and
     * off screen — 273 graphics at whatever zoom the user happened to be at.
     *
     * The padding is asymmetric because the controls panel floats over the map's left
     * edge and would otherwise swallow a whole column of samples.
     */
    const fitToGraphics = (passes = 3) => {
        const manager = tacticalGraphicManager.current;
        const view = manager?.map?.getView();
        const extent = manager?.renderingVectorSource.getExtent();
        if (!view || !extent || !extent.every(Number.isFinite) || extent[2] <= extent[0]) return;
        view.fit(extent, {
            size: manager!.map.getSize(),
            padding: [SAMPLE_VIEW_PADDING_PX, SAMPLE_VIEW_PADDING_PX, SAMPLE_VIEW_PADDING_PX, SAMPLE_CONTROL_PANEL_PX],
        });

        /*
         * **Fit again, because fitting changes what there is to fit.**
         *
         * Every screen-sized graphic — the security operations, and anything else whose
         * geometry is a pixel constant times the resolution — re-derives itself on
         * `change:resolution`. So the zoom this fit chose makes those graphics grow in
         * metres, and the extent that was correct a moment ago is now too small: measured
         * on the full sweep, one pass left 1730 px of content in a 1160 px pane.
         *
         * It converges quickly because each pass moves the zoom less than the last, so a
         * small bounded number of passes is enough and a loop-until-stable is not worth
         * the risk of never settling.
         */
        if (passes > 1) requestAnimationFrame(() => fitToGraphics(passes - 1));
    };

    const drawSamples = (hostility?: TacticalGraphicHostility) => {
        setInteractionMode('view');
        engine.current?.restore(sampleFeatureCollection(hostility));
    };

    const clearAll = () => {
        const mgr = tacticalGraphicManager.current;
        if (!mgr) return;
        clearAllGraphics(mgr);
        setInteractionMode('view');
    };

    /**
     * Writes every graphic on the map to a .geojson file.
     *
     * A downloaded file rather than localStorage on purpose: the question this answers
     * is "what actually persisted?", and that is only answerable if you can open the
     * thing and read it.
     */
    const exportGeoJson = () => {
        const mgr = tacticalGraphicManager.current;
        if (!mgr) return;
        const snapshot = serializeTacticalGraphics(mgr);
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], {type: 'application/geo+json'});
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'tactical-graphics.geojson';
        anchor.click();
        URL.revokeObjectURL(url);
    };

    /** Replaces everything on the map with the graphics in `file`. */
    const importGeoJson = async (file: File) => {
        const mgr = tacticalGraphicManager.current;
        if (!mgr) return;
        setInteractionMode('view');
        try {
            const snapshot = JSON.parse(await file.text());
            clearAllGraphics(mgr);
            const {restored, failed} = restoreTacticalGraphics(mgr, snapshot);
            if (failed.length) {
                // eslint-disable-next-line no-console
                console.warn(`Import: ${restored} restored, ${failed.length} failed.`, failed);
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Import failed — not readable as a tactical graphics GeoJSON.', e);
        }
    };

    /**
     * The dialog's map half. Rebuilt only when the map is, since it closes over both
     * the map and the manager — a new object every render would re-subscribe the
     * click handler on every state change.
     */
    const propertiesSource = useMemo(
        () => (map && tacticalGraphicManager.current
            ? createOpenLayersPropertiesSource(map, tacticalGraphicManager.current)
            : null),
        // The manager is a ref, so it is not a dependency worth listing — it is
        // populated in the same effect that sets the map.
        [map],
    );

    return (
        <>
            <div ref={mapRef} className="map-container"/>

            {propertiesSource && <TacticalGraphicsDialog source={propertiesSource}/>}
        </>
    );
};

export default OpenLayersMapComponent;
