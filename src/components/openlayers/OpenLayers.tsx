import React, {useEffect, useRef, useState} from 'react';
import 'ol/ol.css';
import '../../styles/map.css';

import {createMap, getColorByHostility} from './openlayerStyles';
import MapControls from '../MapControls';
import ol from 'ol/dist/ol';
import TacticalGraphicsDialog from '../tactical-graphics-dialog';
import {InteractionType, TacticalGraphicsManager} from './TacticalGraphicsManager';
import {clearAllGraphics, drawProvenSamples} from './sampleGallery';
import {restoreTacticalGraphics, serializeTacticalGraphics} from './persistence';
import {TacticalGraphicHostility, TacticalGraphicName} from '@zaes/tactical-graphics';
import {isEmpty} from '../../utils/isEmpty';
import {setDarkModeFlag} from '../../settings';

interface Props {
    darkMode: boolean;
}

const OpenLayersMapComponent: React.FC<Props> = ({darkMode}) => {
    const [map, setMap] = useState<ol.Map | null>(null);
    const mapRef = useRef<HTMLDivElement | null>(null);
    const [interactionMode, setInteractionMode] = useState<InteractionType>(InteractionType.view);
    const selectedShape = useRef<TacticalGraphicName>(TacticalGraphicName.AirCorridor);
    const modeRef = useRef(interactionMode);
    const tacticalGraphicManager = useRef<TacticalGraphicsManager>(null);

    useEffect(() => {
        modeRef.current = interactionMode;
        tacticalGraphicManager.current?.setInteractionMode(interactionMode);
    }, [interactionMode]);

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
            };
        }

        return () => olMap.setTarget(undefined);
    }, []);

    // Swap tile source when dark mode changes
    useEffect(() => {
        if (!map) return;
        // Keep singleton in sync with React state so StyleFunctions read the right value
        setDarkModeFlag(darkMode);
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

    const handleDrawTacticalGraphic = () => {
        setInteractionMode(InteractionType.drawing);
        tacticalGraphicManager.current?.handleDrawTacticalGraphic(selectedShape.current);
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

            <MapControls
                onDrawTacticalGraphics={handleDrawTacticalGraphic}
                onToggleInteraction={setInteractionMode}
                onShapeChange={setSelectedShape}
                onReset={resetMap}
                onDrawSamples={drawSamples}
                onClearAll={clearAll}
                onExportGeoJson={exportGeoJson}
                onImportGeoJson={importGeoJson}
                interactionMode={interactionMode}
                isRotating={modeRef.current === InteractionType.rotate}
                isResizing={modeRef.current === InteractionType.resize}
                isRepositioning={modeRef.current === InteractionType.translate}
                isModifying={modeRef.current === InteractionType.modify}
                defaultShape={selectedShape.current}
            />
        </>
    );
};

export default OpenLayersMapComponent;
