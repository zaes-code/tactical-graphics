import maplibregl, {Map, MapMouseEvent} from 'maplibre-gl';
import {Feature, LineString, Point} from 'geojson';
import * as turf from '@turf/turf';

export interface LineDrawerOptions {
    lineColor?: string;
    lineWidth?: number;
    labelText?: string;
    onComplete?: (lineId: string, coordinates: [number, number][]) => void;
    onCancel?: () => void;
}

export class MapLibreLineDrawer {
    private map: Map;
    private sourceId = 'live-line';
    private layerId = 'live-line-layer';
    private coords: [number, number][] = [];
    private mousePos: [number, number] | null = null;
    private isDrawing = false;
    private options: LineDrawerOptions;

    constructor(map: Map, options?: LineDrawerOptions) {
        this.map = map;
        this.options = {
            lineColor: 'black',
            lineWidth: 3,
            labelText: 'OBJ',
            ...options,
        };

        this.handleClick = this.handleClick.bind(this);
        this.handleDoubleClick = this.handleDoubleClick.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);

        if (this.map.isStyleLoaded()) {
            this.ensureLiveSource();
        } else {
            this.map.once('load', () => this.ensureLiveSource());
        }
    }

    private ensureLiveSource() {
        if (!this.map.getSource(this.sourceId)) {
            this.map.addSource(this.sourceId, {
                type: 'geojson',
                data: {type: 'FeatureCollection', features: []},
            });

            this.map.addLayer({
                id: this.layerId,
                type: 'line',
                source: this.sourceId,
                layout: {'line-join': 'round', 'line-cap': 'round'},
                paint: {
                    'line-color': this.options.lineColor!,
                    'line-width': this.options.lineWidth!,
                },
            });
        }
    }

    setLabelText(text: string) {
        this.options.labelText = text;
    }

    start() {
        if (this.isDrawing) return;
        this.isDrawing = true;
        this.coords = [];
        this.mousePos = null;

        this.map.doubleClickZoom.disable();
        this.map.on('click', this.handleClick);
        this.map.on('dblclick', this.handleDoubleClick);
        this.map.on('mousemove', this.handleMouseMove);
    }

    cancel() {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        this.coords = [];
        this.mousePos = null;

        this.map.doubleClickZoom.enable();
        this.map.off('click', this.handleClick);
        this.map.off('dblclick', this.handleDoubleClick);
        this.map.off('mousemove', this.handleMouseMove);

        const src = this.map.getSource(this.sourceId) as maplibregl.GeoJSONSource;
        if (src) src.setData({type: 'FeatureCollection', features: []});

        this.options.onCancel?.();
    }

    private handleClick(e: MapMouseEvent) {
        if (!this.isDrawing) return;
        this.coords.push([e.lngLat.lng, e.lngLat.lat]);
        this.updatePreview();
    }

    private handleMouseMove(e: MapMouseEvent) {
        if (!this.isDrawing) return;
        this.mousePos = [e.lngLat.lng, e.lngLat.lat];
        this.updatePreview();
    }

    private handleDoubleClick(e: MapMouseEvent) {
        e.preventDefault();
        if (!this.isDrawing || this.coords.length < 2) return;
        this.finishLine();
    }

    private updatePreview() {
        const src = this.map.getSource(this.sourceId) as maplibregl.GeoJSONSource;
        if (!src) return;

        const coords = [...this.coords];
        if (this.mousePos && this.coords.length > 0) coords.push(this.mousePos);

        const lineFeature: Feature<LineString> = {
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: coords},
            properties: {},
        };

        src.setData({
            type: 'FeatureCollection',
            features: [lineFeature],
        });
    }

    private finishLine() {
        const coords = this.coords;
        if (!coords || coords.length < 2) return;

        const lineId = `line-${Date.now()}`;

        // Final line feature
        const lineFeature: Feature<LineString> = {
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: coords},
            properties: {},
        };

        this.map.addSource(lineId, {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: [lineFeature],
            },
        });

        this.map.addLayer({
            id: `${lineId}-layer`,
            type: 'line',
            source: lineId,
            layout: {'line-join': 'round', 'line-cap': 'round'},
            paint: {
                'line-color': this.options.lineColor!,
                'line-width': this.options.lineWidth!,
            },
        });

        // --- Compute bearings per endpoint using adjacent segments ---
        const safeBearing = (from: [number, number], to: [number, number]) => {
            // turf.bearing returns -180..180 (deg clockwise from north)
            const b = turf.bearing(turf.point(from), turf.point(to));
            // ensure numeric and finite
            return Number.isFinite(b) ? b : 0;
        };

        // Convert bearing -> label rotation so text lies ALONG the segment.
        // Empirically text appears perpendicular unless we subtract 90deg.
        // If your text ends up rotated the other way, flip the sign or add 180.
        const bearingToTextRotate = (bearingDeg: number) => {
            // rotate so text is parallel to the line (adjust by -90)
            let rot = bearingDeg - 90;
            // normalize to -180..180
            if (rot > 180) rot -= 360;
            if (rot <= -180) rot += 360;
            return rot;
        };

        // choose bearings from adjacent segments:
        const startBearing = coords.length >= 2 ? safeBearing(coords[0], coords[1]) : 0;
        let endBearing = 0;
        for (let i = coords.length - 2; i >= 0; i--) {
            const from = coords[i];
            const to = coords[i + 1];
            if (from[0] !== to[0] || from[1] !== to[1]) {
                endBearing = safeBearing(from, to);
                break;
            }
        }

        const startRot = bearingToTextRotate(startBearing);
        const endRot = bearingToTextRotate(endBearing);

        // debug — inspect computed values in console if something looks off
        // remove or comment out these logs when happy
        // eslint-disable-next-line no-console
        console.log('finishLine bearings:', {startBearing, endBearing, startRot, endRot, coords});

        // Build label features for start and end
        // We'll offset labels slightly in the normal direction so they appear above the line.
        const offsetLabel = (pt: [number, number], rotationDeg: number, offsetPx = 10): [number, number] => {
            // convert rotation (deg) to a small offset in lon/lat space:
            // approximate: offset in meters relative to map (not perfect across latitudes).
            // We'll compute a small offset vector in screen space by projecting,
            // but to keep this simple and robust we compute a very small lon/lat offset using cos/sin.
            const rad = (rotationDeg + 90) * (Math.PI / 180); // +90 to move label 'above' the line
            // offset factor (degrees) — tiny fraction; you can tune this
            const factor = 0.00005; // ~5e-5 deg ~ ~5 meters at equator, adjust if needed
            return [pt[0] + Math.cos(rad) * factor, pt[1] + Math.sin(rad) * factor];
        };

        const startPt = offsetLabel(coords[0], startRot);
        const endPt = offsetLabel(coords[coords.length - 1], endRot);

        const labelFeatures: Feature<Point>[] = [
            {
                type: 'Feature',
                geometry: {type: 'Point', coordinates: startPt},
                properties: {title: this.options.labelText, rotation: startRot},
            },
            {
                type: 'Feature',
                geometry: {type: 'Point', coordinates: endPt},
                properties: {title: this.options.labelText, rotation: endRot},
            },
        ];

        const labelSourceId = `${lineId}-labels`;
        this.map.addSource(labelSourceId, {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: labelFeatures,
            },
        });

        this.map.addLayer({
            id: `${labelSourceId}-layer`,
            type: 'symbol',
            source: labelSourceId,
            layout: {
                'text-field': ['get', 'title'],
                'text-size': 16,
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold', 'sans-serif'],
                'text-anchor': 'center',
                'text-rotation-alignment': 'map',
                'text-rotate': ['get', 'rotation'],
                'text-keep-upright': false, // set false so our computed rotation isn't auto-flipped
                'symbol-placement': 'point',
            },
            paint: {
                'text-color': '#000000',
                'text-halo-color': '#ffffff',
                'text-halo-width': 1.5,
            },
        });

        this.options.onComplete?.(lineId, coords);
        this.cancel();
    }
}
