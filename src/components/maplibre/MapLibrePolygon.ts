import maplibregl, {Map, MapMouseEvent} from 'maplibre-gl';
import {Feature, Polygon, Point} from 'geojson';
import * as turf from '@turf/turf';

export interface PolygonDrawerOptions {
    lineColor?: string;
    lineWidth?: number;
    labelText?: string;
    onComplete?: (polygonId: string, coordinates: [number, number][]) => void;
    onCancel?: () => void;
}

export class MapLibrePolygonDrawer {
    private map: Map;
    private sourceId = 'live-polygon';
    private layerId = 'live-polygon-line';
    private coords: [number, number][] = [];
    private mousePos: [number, number] | null = null;
    private isDrawing = false;
    private options: PolygonDrawerOptions;

    constructor(map: Map, options?: PolygonDrawerOptions) {
        this.map = map;
        this.options = {
            lineColor: 'black',
            lineWidth: 3,
            labelText: 'OBJ',
            ...options,
        };

        this.handleClick = this.handleClick.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleDoubleClick = this.handleDoubleClick.bind(this);

        // Add live drawing source/layer once map style is loaded
        if (this.map.isStyleLoaded()) {
            this.ensureLiveSource();
        } else {
            this.map.once('load', () => this.ensureLiveSource());
        }
    }

    setLabelText(text: string) {
        this.options.labelText = text;
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

    start() {
        if (this.isDrawing) return;
        this.isDrawing = true;
        this.coords = [];
        this.mousePos = null;

        this.map.doubleClickZoom.disable();
        this.map.on('click', this.handleClick);
        this.map.on('mousemove', this.handleMouseMove);
        this.map.on('dblclick', this.handleDoubleClick);
    }

    cancel() {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        this.coords = [];
        this.mousePos = null;

        this.map.doubleClickZoom.enable();
        this.map.off('click', this.handleClick);
        this.map.off('mousemove', this.handleMouseMove);
        this.map.off('dblclick', this.handleDoubleClick);

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
        if (!this.isDrawing) return;
        e.preventDefault();

        if (this.coords.length < 3) {
            this.cancel();
            return;
        }

        const closed = [...this.coords, this.coords[0]];
        const polygonId = `polygon-${Date.now()}`;

        // Create static polygon layer
        this.map.addSource(polygonId, {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        geometry: {type: 'Polygon', coordinates: [closed]},
                        properties: {},
                    },
                ],
            },
        });

        this.map.addLayer({
            id: `${polygonId}-line`,
            type: 'line',
            source: polygonId,
            layout: {'line-join': 'round', 'line-cap': 'round'},
            paint: {
                'line-color': this.options.lineColor!,
                'line-width': this.options.lineWidth!,
            },
        });

        const poly = turf.polygon([closed]);
        const labelPoint = this.getInteriorPoint(poly);
        const [lng, lat] = labelPoint.geometry.coordinates;

        const labelSourceId = `${polygonId}-label`;
        this.map.addSource(labelSourceId, {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        geometry: {type: 'Point', coordinates: [lng, lat]},
                        properties: {title: this.options.labelText},
                    },
                ],
            },
        });

        this.map.addLayer({
            id: `${labelSourceId}-layer`,
            type: 'symbol',
            source: labelSourceId,
            layout: {
                'text-field': ['get', 'title'],
                'text-size': 18,
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold', 'sans-serif'],
                'text-anchor': 'center',
            },
            paint: {
                'text-color': '#000000',
                'text-halo-color': '#ffffff',
                'text-halo-width': 1.5,
            },
        });

        this.options.onComplete?.(polygonId, closed);
        this.cancel();
    }

    private updatePreview() {
        const src = this.map.getSource(this.sourceId) as maplibregl.GeoJSONSource;
        if (!src) return;

        const coords = [...this.coords];
        if (this.mousePos) coords.push(this.mousePos);

        const lineFeature: GeoJSON.Feature<GeoJSON.LineString> = {
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: coords},
            properties: {},
        };

        src.setData({
            type: 'FeatureCollection',
            features: [lineFeature],
        });
    }

    getInteriorPoint(polygon: Feature<Polygon>): Feature<Point> {
        // Start with centroid (faster than centerOfMass, and fine for most shapes)
        let center = turf.centroid(polygon);

        // If centroid is inside, return it
        if (turf.booleanPointInPolygon(center, polygon)) {
            return center;
        }

        // Otherwise, systematically sample interior points
        const [minX, minY, maxX, maxY] = turf.bbox(polygon);
        const steps = 30; // higher = denser grid = better accuracy
        let bestPoint: Feature<Point> | null = null;
        let bestDistance = Infinity;

        for (let i = 0; i <= steps; i++) {
            for (let j = 0; j <= steps; j++) {
                const x = minX + (i / steps) * (maxX - minX);
                const y = minY + (j / steps) * (maxY - minY);
                const candidate = turf.point([x, y]);
                if (turf.booleanPointInPolygon(candidate, polygon)) {
                    const dist = turf.distance(candidate, center);
                    if (dist < bestDistance) {
                        bestPoint = candidate;
                        bestDistance = dist;
                    }
                }
            }
        }

        // Fallback — if somehow nothing found, use pointOnFeature
        return bestPoint || turf.pointOnFeature(polygon);
    }
}
