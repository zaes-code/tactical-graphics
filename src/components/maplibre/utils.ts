import maplibregl from 'maplibre-gl';
import {Feature, FeatureCollection, Geometry, GeometryCollection, GeoJsonProperties} from 'geojson';

export function deepCloneGeoJSON<T extends Geometry>(data: Feature<T> | FeatureCollection<T>): Feature<T> | FeatureCollection<T> {
    return JSON.parse(JSON.stringify(data)) as Feature<T> | FeatureCollection<T>;
}

/** Convert a pixel size to metres at the current map centre */
export function pixelToMetres(map: maplibregl.Map, pixels: number): number {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const worldSize = 256 * Math.pow(2, zoom);
    const metersPerPixel = (40075016.686 * Math.cos((center.lat * Math.PI) / 180)) / worldSize;
    return metersPerPixel * pixels;
}

/**
 * Flatten a Feature (possibly GeometryCollection) into individual Features.
 */
export function flattenFeature(f: Feature<Geometry, GeoJsonProperties>): Feature<Geometry, GeoJsonProperties>[] {
    if (f.geometry.type === 'GeometryCollection') {
        return (f.geometry as GeometryCollection).geometries.map(g => ({
            type: 'Feature' as const,
            geometry: g,
            properties: f.properties,
        }));
    }
    return [f];
}

/**
 * Convert any generator output (Feature or FeatureCollection, possibly with GeometryCollections)
 * into a FeatureCollection containing only line-renderable geometry types.
 * MapLibre's `line` layer accepts LineString, MultiLineString, Polygon, MultiPolygon outlines.
 */
export function toLineFeatureCollection(
    data: Feature<Geometry, GeoJsonProperties> | FeatureCollection<Geometry, GeoJsonProperties>,
): FeatureCollection<Geometry, GeoJsonProperties> {
    const raw: Feature<Geometry, GeoJsonProperties>[] =
        'features' in data ? data.features : [data as Feature<Geometry, GeoJsonProperties>];
    const flat = raw.flatMap(flattenFeature);
    return {
        type: 'FeatureCollection',
        features: flat.filter(f =>
            f.geometry &&
            ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(f.geometry.type),
        ),
    };
}

/**
 * Wrap a single Feature or FeatureCollection as a FeatureCollection.
 */
export function toFeatureCollection(
    data: Feature<Geometry, GeoJsonProperties> | FeatureCollection<Geometry, GeoJsonProperties>,
): FeatureCollection<Geometry, GeoJsonProperties> {
    if ('features' in data) return data as FeatureCollection<Geometry, GeoJsonProperties>;
    return {type: 'FeatureCollection', features: [data as Feature<Geometry, GeoJsonProperties>]};
}
