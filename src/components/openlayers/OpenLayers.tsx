import React, {useEffect, useRef, useState} from 'react';
import 'ol/ol.css';
import '../../styles/map.css';

// MapControls is no longer rendered here — it moved up to `MapRendering` so one
// panel can drive either engine. @see components/mapEngine.ts
import {createMap, getColorByHostility} from './openlayerStyles';
import ol from 'ol/dist/ol';
import TacticalGraphicsDialog from '../tactical-graphics-dialog';
import {InteractionType, TacticalGraphicsManager} from './TacticalGraphicsManager';
import {clearAllGraphics, drawProvenSamples} from './sampleGallery';
import {restoreTacticalGraphics, serializeTacticalGraphics} from './persistence';
import {TacticalGraphicHostility, TacticalGraphicName, TacticalGraphicsConfigOptions} from '@zaes/tactical-graphics';
import {
    getSecurityOperationSymbolSize,
    setSecurityOperationSymbolSize,
    useMilsymbolSecurityOperationSymbols,
} from './securityOperationSymbol';
import ms from 'milsymbol';
import {isEmpty} from '../../utils/isEmpty';
import type {FeatureCollection} from 'geojson';
import {SPIKE_SAMPLES} from '../spikeSamples';
import type {MapEngineHandle} from '../mapEngine';
import {FULL_CAPABILITIES} from '../mapEngine';

// The demo is a consumer, so it supplies the centre symbol for Cover / Guard /
// Screen the way any consumer would — by handing over the milsymbol it already
// depends on. The library names milsymbol nowhere, which is what makes the
// optional peer dependency actually optional; this is the other half of that.
// Module scope, not an effect: it is global state and idempotent, and a graphic
// drawn before the first render would otherwise come up with an empty centre.
useMilsymbolSecurityOperationSymbols(ms);

interface Props {
    darkMode: boolean;
    /** The user's config overrides. Used as an invalidation trigger, not read directly. */
    graphicsSettings: TacticalGraphicsConfigOptions;
    /** Hands the controls panel something to drive. @see mapEngine.ts */
    onReady(handle: MapEngineHandle | null): void;
    /** Mirrored up so the shared panel can show the current edit mode. */
    onInteractionModeChange(mode: InteractionType): void;
}

const OpenLayersMapComponent: React.FC<Props> = ({darkMode, graphicsSettings, onReady, onInteractionModeChange}) => {
    const [map, setMap] = useState<ol.Map | null>(null);
    const mapRef = useRef<HTMLDivElement | null>(null);
    const [interactionMode, setInteractionMode] = useState<InteractionType>(InteractionType.view);
    const selectedShape = useRef<TacticalGraphicName>(TacticalGraphicName.AirCorridor);
    const modeRef = useRef(interactionMode);
    const tacticalGraphicManager = useRef<TacticalGraphicsManager>(null);

    useEffect(() => {
        modeRef.current = interactionMode;
        tacticalGraphicManager.current?.setInteractionMode(interactionMode);
        onInteractionModeChange(interactionMode);
    }, [interactionMode, onInteractionModeChange]);

    useEffect(() => {
        if (!mapRef.current) return;
        const olMap = createMap(mapRef.current);
        setMap(olMap);
        tacticalGraphicManager.current = new TacticalGraphicsManager(olMap);

        // The manager drops back to `view` by itself when a draw finishes or is
        // cancelled. Mirror that into React state, or the draw button keeps
        // reading "Drawing…" long after the draw is over.
        tacticalGraphicManager.current.onInteractionModeChange = setInteractionMode;

        // Test hook for scripts/drive-app.mjs, which drives the draw/edit flow in a
        // real browser and asserts on feature properties. Stripped from production
        // builds. Nothing in the app may read this.
        if (process.env.NODE_ENV !== 'production') {
            (window as unknown as Record<string, unknown>).__tacticalGraphics = {
                map: olMap,
                manager: tacticalGraphicManager.current,
                // The centre-symbol controls, so a driving script can change the size
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
            capabilities: FULL_CAPABILITIES,
            startDrawing: name => {
                selectedShape.current = name;
                setInteractionMode(InteractionType.drawing);
                tacticalGraphicManager.current?.startDrawing(name);
            },
            setInteractionMode,
            reset: () => {
                tacticalGraphicManager.current?.renderingVectorSource.clear();
                setInteractionMode(InteractionType.view);
            },
            drawSamples: hostility => {
                const mgr = tacticalGraphicManager.current;
                if (!mgr) return;
                setInteractionMode(InteractionType.view);
                const {drawn, failed} = drawProvenSamples(mgr, hostility);
                // eslint-disable-next-line no-console
                if (failed.length) console.warn(`Sample sweep: ${drawn} drawn, ${failed.length} failed.`);
            },
            clearAll: () => {
                const mgr = tacticalGraphicManager.current;
                if (!mgr) return;
                clearAllGraphics(mgr);
                setInteractionMode(InteractionType.view);
            },
            exportGeoJson: () => {
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
            },
            importGeoJson: async file => {
                const mgr = tacticalGraphicManager.current;
                if (!mgr) return;
                setInteractionMode(InteractionType.view);
                try {
                    const snapshot = JSON.parse(await file.text());
                    clearAllGraphics(mgr);
                    const {restored, failed} = restoreTacticalGraphics(mgr, snapshot);
                    // eslint-disable-next-line no-console
                    if (failed.length) console.warn(`Import: ${restored} restored, ${failed.length} failed.`, failed);
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.error('Import failed — not readable as a tactical graphics GeoJSON.', e);
                }
            },
        });

        return () => {
            onReady(null);
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
        // config, chrome colours included. This effect only swaps the basemap layers and
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
        // `hostilityColor` caches a *resolved* colour, so a feature drawn in one mode would
        // keep that mode's colour forever. Re-derive it before invalidating, or the sweep
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
    // feature that hasn't otherwise changed keeps its old stroke width and colours until
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
            // *resolved* colour, so re-tinting an affiliation has to re-derive it.
            if (hostility && f.get('hostilityColor')) {
                f.set('hostilityColor', getColorByHostility(hostility));
            }
            f.changed();
        });
    }, [map, graphicsSettings]);

    const handleDrawTacticalGraphic = () => {
        setInteractionMode(InteractionType.drawing);
        tacticalGraphicManager.current?.startDrawing(selectedShape.current);
    };

    const setSelectedShape = (value: TacticalGraphicName) => {
        selectedShape.current = value;
    };

    const resetMap = () => {
        if (!map) return;
        tacticalGraphicManager.current?.renderingVectorSource.clear();
        setInteractionMode(InteractionType.view);
    };

    const drawSamples = (hostility?: TacticalGraphicHostility) => {
        const mgr = tacticalGraphicManager.current;
        if (!mgr) return;
        setInteractionMode(InteractionType.view);
        const {drawn, failed} = drawProvenSamples(mgr, hostility);
        if (failed.length) {
            // eslint-disable-next-line no-console
            console.warn(`Sample sweep: ${drawn} drawn, ${failed.length} failed.`);
        }
    };

    const clearAll = () => {
        const mgr = tacticalGraphicManager.current;
        if (!mgr) return;
        clearAllGraphics(mgr);
        setInteractionMode(InteractionType.view);
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
        setInteractionMode(InteractionType.view);
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

    return (
        <>
            <div ref={mapRef} className="map-container"/>

            {map && tacticalGraphicManager.current && (
                <TacticalGraphicsDialog map={map} tacticalGraphicsManager={tacticalGraphicManager.current}/>
            )}
        </>
    );
};

export default OpenLayersMapComponent;
