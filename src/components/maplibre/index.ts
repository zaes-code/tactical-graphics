/**
 * `@zaes/tactical-graphics/maplibre` — the MapLibre renderer.
 *
 * ## Status: a spike, not a finished renderer
 *
 * Three of the library's 69 style functions are ported. Anything else draws
 * nothing at all — ask {@link isPaintable} before you rely on a graphic, and read
 * `ai/maplibre-renderer.md` before planning around this entry point. It is wired
 * into the build so the entry-point isolation is asserted rather than assumed,
 * and so the shape of the finished thing is fixed; it is not release-ready.
 *
 * ## Two renderers, deliberately
 *
 * The spike built both candidate architectures and measured them, and both are
 * exported because the choice is a real trade rather than a solved question:
 *
 * - {@link CanvasOverlayRenderer} — a 2D canvas synced to MapLibre's camera.
 *   Style functions port 1:1 and text is measured with the same ruler that draws
 *   it. MapLibre renders only the basemap. Redraws every frame: ~7.7 ms for 1,000
 *   graphics, paid continuously while panning.
 * - {@link NativeLayerRenderer} — geometry realised into GeoJSON sources and drawn
 *   by MapLibre's own layers, on the GPU. Rebuilds geometry on zoom change only:
 *   ~4.7 ms for the same 1,000 graphics, and free while panning. Costs a glyph
 *   server for text, and shares one canvas with the basemap.
 *
 * ## What a host must do that OpenLayers does not require
 *
 * 1. **Serve MapLibre's worker.** maplibre-gl v6 locates it through
 *    `import.meta.url`, which most bundlers break; call `setWorkerUrl` with a URL
 *    you serve. Getting this wrong is silent — every GeoJSON source simply never
 *    loads. Only the native renderer needs it. @see scripts/copy-maplibre-worker.js
 * 2. **Serve glyphs, for the native renderer.** MapLibre draws text from SDF PBFs;
 *    there is no system-font path.
 * 3. **Not put a CSS filter on the map canvas.** MapLibre composites every layer
 *    into one canvas, so a filter meant for the basemap repaints the graphics too.
 *    The canvas overlay is immune; the native renderer has no escape, which is why
 *    a dark basemap there means a real dark style rather than a filter.
 *
 * `maplibre-gl` is an **optional peer** dependency, like `ol`: installing this
 * package for its geometry alone pulls in neither.
 */

// The two renderers.
export {CanvasOverlayRenderer} from './canvas/CanvasOverlayRenderer';
export {NativeLayerRenderer} from './native/NativeLayerRenderer';

// Generator output → paint-ready graphics, including the 4326 → 3857 projection.
/**
 * Draw, modify and the four handle gestures.
 *
 * Exported because a renderer without them is a picture, not an editor — and this
 * was reachable only from inside the demo, so nobody installing the package could
 * build one. `NativeLayerRenderer` draws; this turns pointer events into edits.
 */
export {MapLibreInteractions} from './interaction/MapLibreInteractions';
export type {EditMode, InteractionCallbacks} from './interaction/MapLibreInteractions';

/**
 * The geometry edits themselves, for a host driving them from its own UI rather
 * than from the pointer — a slider that sets a width, a form that sets a bearing.
 * Each takes a description and returns a new one; none of them touch a map.
 */
export {centreOf, moveVertex, positionsOf, resize, rotate, setBandRange, setBend, setOffset, setReach, translate} from './interaction/editGeometry';
export type {GraphicDescription} from './interaction/editGeometry';

export {buildTacticalGraphic, paintTacticalGraphic, projectGeometry} from './maplibreAdapter';
export type {MapLibreTacticalGraphic} from './maplibreAdapter';

// The projection seam: MapLibre's camera as an OpenLayers `resolution`, and back.
export {
    MERCATOR_HALF_WORLD,
    MERCATOR_MAX_LATITUDE,
    MERCATOR_WORLD_SIZE,
    resolutionOf,
    toLonLat,
    toMercator,
    toScreen,
    viewTransformOf,
    zoomForResolution,
} from './projection';
export type {ViewTransform} from './projection';

// The paint-list consumers, for a host driving its own rendering.
export {paintToCanvas} from './canvas/paintToCanvas';
export {bucketPaints, circleLayer, featureCollection, fillLayer, lineLayer, symbolLayer} from './native/paintToLayers';
export type {LayerBuckets} from './native/paintToLayers';

// A keyless OSM raster basemap, the same tiles the OpenLayers demo uses.
export {createBasemapStyle} from './basemapStyle';
