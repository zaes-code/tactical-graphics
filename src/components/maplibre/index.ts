/**
 * `@zaes/tactical-graphics/maplibre` — the MapLibre renderer.
 *
 * ## Status: shipped in 2.0.0
 *
 * A complete renderer, not a spike. It paints **291 of the 292 registered
 * graphics** — every one of them, since `AxisOfAttack` was removed in 3.2.0
 * and no UI path anywhere in the package — and it carries draw, modify and all
 * four handle gestures. Both engines read one shared paint layer, so what a
 * symbol looks like is the same fact on each rather than two implementations
 * that can drift.
 *
 * Ask `isPaintable(name)` (from the **root** entry, `@zaes/tactical-graphics`)
 * if you want the answer for a specific graphic in code rather than trusting
 * this paragraph.
 *
 * ## Two renderers, deliberately
 *
 * Both candidate architectures were built and measured, and both are exported
 * because the choice is a real trade rather than a solved question.
 * {@link createTacticalGraphics} uses {@link NativeLayerRenderer} unless you hand
 * it another one:
 *
 * - {@link CanvasOverlayRenderer} — a 2D canvas synced to MapLibre's camera.
 *   Style functions port 1:1 and text is measured with the same ruler that draws
 *   it. MapLibre renders only the basemap. Redraws every frame: ~7.7 ms for 1,000
 *   graphics, paid continuously while panning.
 * - {@link NativeLayerRenderer} — geometry realized into GeoJSON sources and drawn
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
export {createTacticalGraphics} from './createTacticalGraphics';
export type {MapLibreEngineOptions} from './createTacticalGraphics';
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
// `EditMode` is deliberately **not** re-exported here. This layer has an internal one
// that predates the façade and lacks `drawing`, and exporting it put two different types
// under one name depending on which subpath you imported from. The portable `EditMode`
// — the one `TacticalGraphicsEngine` speaks — comes from the root entry point.
export type {InteractionCallbacks} from './interaction/MapLibreInteractions';

/**
 * The geometry edits themselves, for a host driving them from its own UI rather
 * than from the pointer — a slider that sets a width, a form that sets a bearing.
 * Each takes a description and returns a new one; none of them touch a map.
 */
export {centerOf, insertVertex, moveVertex, positionsOf, resize, rotate, setBandRange, setBend, setMirror, setOffset, setReach, translate} from './interaction/editGeometry';
export type {GraphicDescription} from './interaction/editGeometry';

export {buildTacticalGraphic, paintTacticalGraphic, projectGeometry} from './maplibreAdapter';
export type {MapLibreTacticalGraphic} from './maplibreAdapter';

// The projection seam: MapLibre's camera as an OpenLayers `resolution`, and back.
export {
    MERCATOR_HALF_WORLD,
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

/**
 * ## The library's own names, re-exported
 *
 * Configuration, the palette, the property key and the center-symbol controls belong to
 * the root entry point — they describe the *symbology*, not a renderer. The OpenLayers
 * subpath has always re-exported them as a convenience, and this one did not, so the
 * same program written for the two engines needed different import lines for things
 * that have nothing to do with either.
 *
 * They are re-exported rather than redefined: one implementation, two doors.
 * `engineFacade.test.ts` asserts the two subpaths keep offering the same set.
 */
export {
    BASE_FONT_SIZE_PX,
    DEFAULT_LINE_WIDTH,
    DEFAULT_PALETTE,
    DEFAULT_SYMBOL_SIZE_PX,
    MAX_LABEL_SIZE,
    MAX_LINE_WIDTH,
    MAX_SYMBOL_SIZE_PX,
    MIN_LABEL_SIZE,
    MIN_LINE_WIDTH,
    MIN_SYMBOL_SIZE_PX,
    TACTICAL_GRAPHIC_KEY,
    TacticalGraphicsConfig,
    configureTacticalGraphics,
    getDefaultLabelSize,
    getDefaultLineWidth,
    getDrawMarkerColor,
    getDrawMarkerOutlineColor,
    getHandleColor,
    getInertHandleColor,
    getTacticalGraphicsConfig,
    resetTacticalGraphicsConfig,
    setDefaultLabelSize,
    setDefaultLineWidth,
    setTacticalGraphicsConfig,
    supportsHostility,
} from '@zaes/tactical-graphics';
export type {MilsymbolModule, TacticalGraphicsConfigOptions} from '@zaes/tactical-graphics';
