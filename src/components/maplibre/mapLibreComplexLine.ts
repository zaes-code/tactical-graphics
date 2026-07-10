import {Map, MapMouseEvent} from 'maplibre-gl';
import {Feature, LineString, Geometry, GeoJsonProperties, FeatureCollection} from 'geojson';
import {TacticalGraphicsRegistry} from '@zaes/tactical-graphics';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import * as maplibregl from 'maplibre-gl';
import {pixelToMetres} from './utils';

// ---------------------------------------------------------------------
// Helper – turn anything that comes out of the generator into a
// proper FeatureCollection (the type MapLibre expects for a source)
// ---------------------------------------------------------------------
function toFeatureCollection(
    data: Feature<Geometry, GeoJsonProperties> | FeatureCollection<Geometry, GeoJsonProperties>,
): FeatureCollection<Geometry, GeoJsonProperties> {
    if ('features' in data) {
        // already a collection
        return data as FeatureCollection<Geometry, GeoJsonProperties>;
    }
    // single feature → wrap it
    return {
        type: 'FeatureCollection',
        features: [data],
    };
}

// ---------------------------------------------------------------------
// Drawer options
// ---------------------------------------------------------------------
export interface ComplexLineDrawerOptions {
    graphicName: TacticalGraphicName;
    labelText?: string;
    onComplete?: (id: string, baseCoords: [number, number][]) => void;
    onCancel?: () => void;
}

// ---------------------------------------------------------------------
// Main drawer class
// ---------------------------------------------------------------------
export class MapLibreComplexLineDrawer {
    private map: Map;
    private coords: [number, number][] = [];
    private isDrawing = false;
    private options: ComplexLineDrawerOptions;
    private previewSourceId = 'complex-preview';
    private previewLayerId = 'complex-preview-layer';

    constructor(map: Map, options: ComplexLineDrawerOptions) {
        this.map = map;
        this.options = {...options};
        this.handleClick = this.handleClick.bind(this);
        this.handleDoubleClick = this.handleDoubleClick.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
    }

    // -----------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------
    start() {
        if (this.isDrawing) return;
        this.isDrawing = true;
        this.coords = [];
        this.ensurePreviewSource();

        this.map.on('click', this.handleClick);
        this.map.on('dblclick', this.handleDoubleClick);
        this.map.on('mousemove', this.handleMouseMove);

        this.map.on('move', this.refreshPreviewIfDrawing);
        this.map.on('zoom', this.refreshPreviewIfDrawing);
    }

    cancel() {
        this.isDrawing = false;
        this.coords = [];
        this.map.off('click', this.handleClick);
        this.map.off('dblclick', this.handleDoubleClick);
        this.map.off('mousemove', this.handleMouseMove);
        this.map.off('move', this.refreshPreviewIfDrawing);
        this.map.off('zoom', this.refreshPreviewIfDrawing);
        this.clearPreview();
        this.options.onCancel?.();
    }

    // -----------------------------------------------------------------
    // Preview handling
    // -----------------------------------------------------------------
    private refreshPreviewIfDrawing = () => {
        if (!this.isDrawing || this.coords.length === 0) return;
        const temp: [number, number][] = [...this.coords];
        if (this.map.getSource(this.previewSourceId)) {
            this.updatePreview(temp);
        }
    };

    private ensurePreviewSource() {
        if (this.map.getSource(this.previewSourceId)) return;

        this.map.addSource(this.previewSourceId, {
            type: 'geojson',
            data: {type: 'FeatureCollection', features: []},
        });
        this.map.addLayer({
            id: this.previewLayerId,
            type: 'line',
            source: this.previewSourceId,
            paint: {'line-color': '#000', 'line-width': 3},
        });
    }

    private clearPreview() {
        const src = this.map.getSource(this.previewSourceId) as maplibregl.GeoJSONSource;
        src?.setData({type: 'FeatureCollection', features: []});
    }

    private handleClick(e: MapMouseEvent) {
        if (!this.isDrawing) return;
        this.coords.push([e.lngLat.lng, e.lngLat.lat]);
    }

    private handleMouseMove(e: MapMouseEvent) {
        if (!this.isDrawing || this.coords.length === 0) return;
        const temp: [number, number][] = [...this.coords, [e.lngLat.lng, e.lngLat.lat]];
        this.updatePreview(temp);
    }

    private updatePreview(tempCoords: [number, number][]) {
        const gen = TacticalGraphicsRegistry.get(this.options.graphicName);
        if (!gen) return;

        const base: Feature<LineString> = {
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: tempCoords},
            properties: {},
        };

        const radiusMetres = pixelToMetres(this.map, 20);

        const result = gen.generate(base, {radius: radiusMetres});
        if (!result) return;

        const coll = toFeatureCollection(result.graphic);
        const src = this.map.getSource(this.previewSourceId) as maplibregl.GeoJSONSource;
        src?.setData(coll);
    }

    // -----------------------------------------------------------------
    // Finish drawing
    // -----------------------------------------------------------------
    private handleDoubleClick(e: MapMouseEvent) {
        e.preventDefault();
        if (!this.isDrawing || this.coords.length < 2) return;

        const uniqueId = Date.now();
        const gen = TacticalGraphicsRegistry.get(this.options.graphicName);
        if (!gen) return;

        const base: Feature<LineString> = {
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: this.coords},
            properties: {},
        };

        const radiusMetres = pixelToMetres(this.map, 20);
        const result = gen.generate(base, {radius: radiusMetres});
        if (!result) return;

        const {graphic, handles, labels} = result;

        // === 1. GET CURRENT PREVIEW DATA (exact same as live preview) ===
        const previewSrc = this.map.getSource(this.previewSourceId) as maplibregl.GeoJSONSource;
        if (!previewSrc) return;
        const currentPreviewData = previewSrc._data as unknown as FeatureCollection<Geometry, GeoJsonProperties>;

        // === 2. CREATE FINAL GRAPHIC SOURCE WITH *EXACT SAME DATA* ===
        const finalGraphicSourceId = `${this.options.graphicName}-graphic-${uniqueId}`;
        const finalGraphicLayerId = `${finalGraphicSourceId}-layer`;

        if (this.map.getSource(finalGraphicSourceId)) {
            this.map.removeSource(finalGraphicSourceId);
        }
        if (this.map.getLayer(finalGraphicLayerId)) {
            this.map.removeLayer(finalGraphicLayerId);
        }

        this.map.addSource(finalGraphicSourceId, {
            type: 'geojson',
            data: currentPreviewData, // ← EXACT SAME AS PREVIEW
        });

        this.map.addLayer({
            id: finalGraphicLayerId,
            type: 'line',
            source: finalGraphicSourceId,
            paint: {'line-color': '#000', 'line-width': 3},
        });

        // === 3. HANDLES ===
        const handlesColl = toFeatureCollection(handles);
        const handlesSourceId = `${this.options.graphicName}-handles-${uniqueId}`;
        const handlesLayerId = `${handlesSourceId}-layer`;

        if (this.map.getSource(handlesSourceId)) this.map.removeSource(handlesSourceId);
        if (this.map.getLayer(handlesLayerId)) this.map.removeLayer(handlesLayerId);

        this.map.addSource(handlesSourceId, {type: 'geojson', data: handlesColl});
        this.map.addLayer({
            id: handlesLayerId,
            type: 'circle',
            source: handlesSourceId,
            paint: {'circle-radius': 4, 'circle-color': '#f00'},
        });

        // === 4. LABELS ===
        const labelColl = toFeatureCollection(labels);
        labelColl.features.forEach((f, i) => {
            f.properties = {text: i === 0 ? 'LABEL' : 'End'};
        });

        const labelsSourceId = `${this.options.graphicName}-labels-${uniqueId}`;
        const labelsLayerId = `${labelsSourceId}-layer`;

        if (this.map.getSource(labelsSourceId)) this.map.removeSource(labelsSourceId);
        if (this.map.getLayer(labelsLayerId)) this.map.removeLayer(labelsLayerId);

        this.map.addSource(labelsSourceId, {type: 'geojson', data: labelColl});
        this.map.addLayer({
            id: labelsLayerId,
            type: 'symbol',
            source: labelsSourceId,
            layout: {'text-field': ['get', 'text'], 'text-size': 12},
            paint: {'text-color': '#000'},
        });

        // === 5. CLEAN UP PREVIEW (but keep source for next draw) ===
        this.clearPreview(); // clears data, keeps source/layer

        // Pass a unique ID to onComplete
        this.options.onComplete?.(`${this.options.graphicName}-${uniqueId}`, this.coords);
        this.cancel();
    }
}
