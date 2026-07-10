/**
 * Which map engine the sample app is currently rendering with.
 *
 * This is a property of the demo, not of the tactical graphics library — the
 * library emits GeoJSON and has no opinion about who draws it. It used to live
 * in `tacticalgraphics/core/type.ts`, which meant the published package carried
 * an enum naming its own consumers.
 */
export enum MapLibrary {
    OPENLAYERS = 'openlayers',
    MAPLIBRE = 'maplibre',
    CESIUM = 'cesium',
    LEAFLET = 'leaflet',
}
