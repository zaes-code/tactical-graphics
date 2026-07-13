import React, {useEffect, useRef, useState} from 'react';
import 'ol/ol.css';
import '../../styles/map.css';

import {createMap} from './openlayerStyles';
import MapControls from '../MapControls';
import ol from 'ol/dist/ol';
import TacticalGraphicsDialog from '../tactical-graphics-dialog';
import {InteractionType, TacticalGraphicsManager} from './TacticalGraphicsManager';
import {clearAllGraphics, drawProvenSamples} from './sampleGallery';
import {TacticalGraphicName} from '@zaes-code/tactical-graphics';
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
        // Invalidate per-feature style cache so StyleFunctions re-evaluate with new mode
        tacticalGraphicManager.current?.renderingVectorSource.forEachFeature(f => f.changed());
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

    const drawSamples = () => {
        const mgr = tacticalGraphicManager.current;
        if (!mgr) return;
        setInteractionMode(InteractionType.view);
        const {drawn, failed} = drawProvenSamples(mgr);
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
