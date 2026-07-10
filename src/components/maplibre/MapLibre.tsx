import {useEffect, useRef, useState} from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {MapLibrePolygonDrawer} from './MapLibrePolygon';
import {MapLibreLineDrawer} from './MapLibreLine';
import MapControls from '../MapControls';
import {InteractionType} from '../openlayers/TacticalGraphicsManager';
import {MapLibreAdapter} from './mapLibreAdapter';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {MapLibreComplexLineDrawer} from './mapLibreComplexLine';

export default function MapLibreWrapper() {
    const mapContainer = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const drawerRef = useRef<MapLibrePolygonDrawer | MapLibreLineDrawer | MapLibreComplexLineDrawer | null>(null);
    const [interactionMode, setInteractionMode] = useState<InteractionType>(InteractionType.view);
    const selectedShape = useRef<TacticalGraphicName>(TacticalGraphicName.Cover);
    const adapterRef = useRef<MapLibreAdapter | null>(null);

    // Refs to store original layer and source IDs
    const originalLayerIds = useRef<Set<string>>(new Set());
    const originalSourceIds = useRef<Set<string>>(new Set());

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                cancelDrawing();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (!mapContainer.current) return;

        const map = new maplibregl.Map({
            container: mapContainer.current,
            // Keyless OSM raster basemap so the demo works with no API key. Swap
            // in a vector style + your own key (MapTiler, etc.) for production.
            style: {
                version: 8,
                sources: {
                    osm: {
                        type: 'raster',
                        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                        tileSize: 256,
                        attribution: '© OpenStreetMap contributors',
                    },
                },
                layers: [{id: 'osm', type: 'raster', source: 'osm'}],
            },
            center: [-80, 25],
            zoom: 5,
        });

        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl(), 'top-right');

        map.on('load', () => {
            const style = map.getStyle();
            originalLayerIds.current = new Set(style.layers.map(layer => layer.id));
            originalSourceIds.current = new Set(Object.keys(style.sources));

            adapterRef.current = new MapLibreAdapter(map);
        });
    }, []);

    const handleDrawTacticalGraphic = () => {
        if (!adapterRef.current) return;
        setInteractionMode(InteractionType.drawing);
        drawerRef.current = adapterRef.current.getTacticalGraphicConfig(selectedShape.current, {
            onComplete: (id, coords) => {
                console.log(`${selectedShape.current} complete:`, id, coords);
            },
            onCancel: () => {
            },
        });

        if (drawerRef.current) {
            drawerRef.current.start();
        }
    };

    const clearAllDrawnFeatures = () => {
        if (!mapRef.current) return;
        const map = mapRef.current;

        const style = map.getStyle();
        if (!style) return;

        // Use the captured original IDs
        const origLayers = originalLayerIds.current;
        const origSources = originalSourceIds.current;

        // Remove layers in reverse order (safer for dependencies)
        style.layers
            .slice()
            .reverse()
            .forEach(layer => {
                if (!origLayers.has(layer.id) && map.getLayer(layer.id)) {
                    map.removeLayer(layer.id);
                }
            });

        // Remove sources
        Object.keys(style.sources).forEach(srcId => {
            if (!origSources.has(srcId) && map.getSource(srcId)) {
                map.removeSource(srcId);
            }
        });
    };

    const cancelDrawing = () => {
        drawerRef.current?.cancel();
    };

    const setSelectedShape = (value: TacticalGraphicName) => {
        selectedShape.current = value;
    };

    return (
        <div style={{position: 'relative', width: '100%', height: '100vh'}}>
            <div ref={mapContainer} style={{position: 'absolute', top: 0, bottom: 0, width: '100%'}}/>
            <MapControls
                onDrawTacticalGraphics={handleDrawTacticalGraphic}
                onToggleInteraction={setInteractionMode}
                onShapeChange={setSelectedShape}
                onReset={clearAllDrawnFeatures}
                interactionMode={interactionMode}
                isRotating={false}
                isResizing={false}
                isRepositioning={false}
                isModifying={false}
                defaultShape={selectedShape.current}
            />
        </div>
    );
}
