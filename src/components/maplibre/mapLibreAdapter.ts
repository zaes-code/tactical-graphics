import maplibregl from 'maplibre-gl';
import {MapLibrePolygonDrawer} from './MapLibrePolygon';
import {MapLibreLineDrawer} from './MapLibreLine';
import {TacticalGraphicsRegistry} from '@zaes/tactical-graphics';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {Feature, Geometry, FeatureCollection, LineString, GeoJsonProperties} from 'geojson';
import {MapLibreComplexLineDrawer} from './mapLibreComplexLine';
import type {LineLayerSpecification, CircleLayerSpecification, SymbolLayerSpecification} from 'maplibre-gl';
import {pixelToMetres} from './utils';

interface DrawerOptions {
    labelText?: string;
    onComplete?: (id: string, coords: [number, number][]) => void;
    onCancel?: () => void;
    onUpdate?: (id: string, coords: [number, number][]) => void;
}

export class MapLibreAdapter {
    private map: maplibregl.Map;

    constructor(map: maplibregl.Map) {
        this.map = map;
    }

    /**
     * Returns a configured drawing tool for the selected tactical graphic type
     */
    getTacticalGraphicConfig(
        graphicName: TacticalGraphicName,
        options: DrawerOptions,
    ): MapLibrePolygonDrawer | MapLibreLineDrawer | MapLibreComplexLineDrawer | null {
        const commonOpts = {...options};

        switch (graphicName) {
            // --- Simple polygon graphics ---
            case TacticalGraphicName.AssemblyArea:
                return new MapLibrePolygonDrawer(this.map, {labelText: 'AA', ...commonOpts});
            case TacticalGraphicName.AttackPosition:
                return new MapLibrePolygonDrawer(this.map, {labelText: 'ATK', ...commonOpts});
            case TacticalGraphicName.ObjectiveArea:
                return new MapLibrePolygonDrawer(this.map, {labelText: 'OBJ', ...commonOpts});
            case TacticalGraphicName.EngagementArea:
                return new MapLibrePolygonDrawer(this.map, {labelText: 'EA', ...commonOpts});
            case TacticalGraphicName.TargetAreaOfInterest:
                return new MapLibrePolygonDrawer(this.map, {labelText: 'TAI', ...commonOpts});
            case TacticalGraphicName.NamedAreaOfInterest:
                return new MapLibrePolygonDrawer(this.map, {labelText: 'NAI', ...commonOpts});

            // --- Simple line graphics ---
            case TacticalGraphicName.PhaseLine:
                return new MapLibreLineDrawer(this.map, {labelText: 'PL', ...commonOpts});
            case TacticalGraphicName.Route:
                return new MapLibreLineDrawer(this.map, {labelText: 'ROUTE', ...commonOpts});
            case TacticalGraphicName.LineOfDeparture:
                return new MapLibreLineDrawer(this.map, {labelText: 'LOD', ...commonOpts});
            case TacticalGraphicName.LimitOfAdvance:
                return new MapLibreLineDrawer(this.map, {labelText: 'LOA', ...commonOpts});
            case TacticalGraphicName.FireSupportCoordinationLine:
                return new MapLibreLineDrawer(this.map, {labelText: 'FSCL', ...commonOpts});
            case TacticalGraphicName.CoordinatedFireLine:
                return new MapLibreLineDrawer(this.map, {labelText: 'CFL', ...commonOpts});

            // --- Complex generated graphics ---
            case TacticalGraphicName.MainAxisOfAdvance:
                return new MapLibreComplexLineDrawer(this.map, {
                    graphicName,
                    ...commonOpts,
                });
            case TacticalGraphicName.AttackHelicopterAxisOfAdvance:
                return new MapLibreComplexLineDrawer(this.map, {
                    graphicName: TacticalGraphicName.AttackHelicopterAxisOfAdvance,
                    ...commonOpts,
                });
            case TacticalGraphicName.AirCorridor:
                return new MapLibreComplexLineDrawer(this.map, {
                    graphicName: TacticalGraphicName.AirCorridor,
                    ...commonOpts,
                });
            case TacticalGraphicName.AviationAxisOfAdvance:
                return new MapLibreComplexLineDrawer(this.map, {
                    graphicName: TacticalGraphicName.AviationAxisOfAdvance,
                    ...commonOpts,
                });
            case TacticalGraphicName.SupportingAxisOfAdvance:
                return new MapLibreComplexLineDrawer(this.map, {
                    graphicName: TacticalGraphicName.SupportingAxisOfAdvance,
                    ...commonOpts,
                });

            default:
                console.warn(`⚠️ No drawing config defined for ${graphicName}`);
                return null;
        }
    }

    renderTacticalGraphic(graphicName: string, baseFeature: Feature<Geometry>) {
        if (baseFeature.geometry.type !== 'LineString') return;

        const coords = (baseFeature.geometry as LineString).coordinates;
        if (!coords || coords.length < 2) return;

        const radiusMetres = pixelToMetres(this.map, 20);

        const result = TacticalGraphicsRegistry.get(graphicName)?.generate(baseFeature, {radius: radiusMetres});
        if (!result) return;

        const {graphic, handles, labels} = result;

        this.updateSource(`${graphicName}-graphic`, graphic);
        this.addLayerIfMissing(`${graphicName}-graphic`, 'line');

        this.updateSource(`${graphicName}-handles`, handles);
        this.addLayerIfMissing(`${graphicName}-handles`, 'circle');

        this.updateSource(`${graphicName}-labels`, labels);
        this.addLayerIfMissing(`${graphicName}-labels`, 'symbol');
    }

    private updateSource(id: string, data: Feature<Geometry, GeoJsonProperties> | FeatureCollection<Geometry, GeoJsonProperties>) {
        const collection: FeatureCollection<Geometry, GeoJsonProperties> = 'features' in data ? data : {
            type: 'FeatureCollection',
            features: [data]
        };

        const src = this.map.getSource(id) as maplibregl.GeoJSONSource;
        if (src) {
            src.setData(collection);
        } else {
            this.map.addSource(id, {
                type: 'geojson',
                data: collection,
            });
        }
    }

    private addLayerIfMissing(id: string, type: 'line' | 'circle' | 'symbol', paint: any = {}, layout: any = {}) {
        if (this.map.getLayer(id)) return;

        if (type === 'line') {
            const layer: LineLayerSpecification = {
                id,
                type: 'line',
                source: id,
                paint: {'line-color': '#00f', 'line-width': 3, ...paint},
            };
            this.map.addLayer(layer);
        } else if (type === 'circle') {
            const layer: CircleLayerSpecification = {
                id,
                type: 'circle',
                source: id,
                paint: {'circle-radius': 4, 'circle-color': '#f00', ...paint},
            };
            this.map.addLayer(layer);
        } else if (type === 'symbol') {
            const layer: SymbolLayerSpecification = {
                id,
                type: 'symbol',
                source: id,
                layout: {'text-field': ['get', 'text'], 'text-size': 12, ...layout},
                paint: {'text-color': '#000', ...paint},
            };
            this.map.addLayer(layer);
        }
    }

}


