/**
 * @zaes/tactical-graphics — MIL-STD-2525E / FM 1-02.2 tactical graphics as plain GeoJSON.
 *
 * Describe a graphic by adding a `tacticalGraphic` object to any GeoJSON
 * feature's properties, then render it:
 *
 * ```ts
 * import {renderTacticalGraphic, TacticalGraphicName} from '@zaes/tactical-graphics';
 *
 * const {graphic, labels} = renderTacticalGraphic({
 *     type: 'Feature',
 *     geometry: {type: 'LineString', coordinates: [[-77.04, 38.89], [-76.95, 38.95]]},
 *     properties: {tacticalGraphic: {name: TacticalGraphicName.MainAxisOfAdvance, label: '1-508 IN'}},
 * });
 * ```
 *
 * The output is GeoJSON in EPSG:4326 — render it with OpenLayers or anything
 * else that reads GeoJSON.
 */

// ── The entry point ─────────────────────────────────────────────────────────
export {
    renderTacticalGraphic,
    toFeatureCollection,
    readTacticalGraphicProperties,
    isTacticalGraphicFeature,
    listTacticalGraphicNames,
    TacticalGraphicError,
    TACTICAL_GRAPHIC_KEY,
} from './core/render';

export type {TacticalGraphicProperties, TacticalGraphicRender, TacticalGraphicRole} from './core/render';

// ── Names, categories, symbology ────────────────────────────────────────────
export {
    TacticalGraphicName,
    TacticalGraphicHostility,
    TacticalGraphicStatus,
    TacticalGraphicConfidence,
    TacticalGraphicEchelon,
    RouteDirection,
    getLabel,
    getDisplayName,
} from './core/type';

export type {
    Coordinate,
    PositionType,
    GraphicOptions,
    MovementOptions,
    /** @deprecated Use {@link MovementOptions}. */
    MovementGraphicOptions,
    RangeFanBand,
    RangeFanConfig,
    RangeFanOptions,
    TurnOptions,
    ITacticalGraphic,
    IGraphicGenerator,
} from './core/type';

/**
 * Range-fan band resolvers. A renderer that draws its own band labels needs the
 * same defaults the geometry generator applied — otherwise its labels drift from
 * the arcs. Exported for exactly that reason; the OpenLayers sample app uses
 * them in `RangeFanGraphicBase`.
 */
export {resolveBands, resolveBandAzimuths, resolveCenterAzimuth} from './graphics/RangeFan';

/**
 * Turn's bend limits and the clamp that enforces them. A renderer that lets the
 * user drag the sharpness has to clamp with the same numbers the generator
 * does, or the handle drifts off the curve at the extremes.
 */
export {TURN_DEFAULT_BEND, TURN_MIN_BEND, TURN_MAX_BEND, clampTurnBend} from './graphics/Turn';

export {TacticalGraphicCategory, GRAPHIC_CATEGORIES} from './core/categories';

// ── Escape hatches for advanced use ─────────────────────────────────────────
export {TacticalGraphicsRegistry} from './core/TacticalGraphicsRegistry';
export {default as geometryService} from './core/GeometryService';

/**
 * Configuration — label size, line width, and the colours. All optional; omit a field
 * and you get the doctrinal FM 1-02.2 value.
 *
 * Lives in the map-agnostic half deliberately. None of it knows what a renderer is:
 * pixel sizes and affiliation colours are properties of the symbology, so a second
 * renderer inherits them rather than reinventing them, and a host configures the library
 * once no matter how many views it has.
 *
 * There is one palette and it does not follow dark mode — the library cannot see your
 * basemap, so you send the colours you want. `paletteForMode` is a ready-made pair for
 * the common case. After changing anything, tell your renderer to invalidate; with
 * OpenLayers that is `source.forEachFeature(f => f.changed())`.
 */
export {
    BASE_FONT_SIZE_PX,
    DARK_MODE_PALETTE,
    DEFAULT_LINE_WIDTH,
    LIGHT_MODE_PALETTE,
    MAX_LABEL_SIZE,
    MAX_LINE_WIDTH,
    MIN_LABEL_SIZE,
    MIN_LINE_WIDTH,
    TacticalGraphicsConfig,
    configureTacticalGraphics,
    getDefaultLabelSize,
    getDefaultLineWidth,
    getTacticalGraphicsConfig,
    paletteForMode,
    resetTacticalGraphicsConfig,
    setDefaultLabelSize,
    setDefaultLineWidth,
    setTacticalGraphicsConfig,
} from './core/config';
export type {TacticalGraphicsConfigOptions} from './core/config';

/**
 * Override readers, for a renderer resolving a colour. Each returns `undefined` when the
 * host has not overridden that colour, leaving the renderer to supply the doctrinal
 * default — the fallback is the renderer's, because only it knows its own defaults.
 */
export {
    getDefaultLineColorOverride,
    getDrawMarkerColorOverride,
    getDrawMarkerOutlineColorOverride,
    getHandleColorOverride,
    getHostilityColorOverride,
    getInertHandleColorOverride,
    getLabelBackgroundFillOverride,
    getLabelFillColorOverride,
    getLabelHaloColorOverride,
    getSelectionFillColorOverride,
} from './core/config';
