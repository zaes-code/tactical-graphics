/**
 * @zaes-code/tactical-graphics — MIL-STD-2525E tactical graphics as plain GeoJSON.
 *
 * Describe a graphic by adding a `tacticalGraphic` object to any GeoJSON
 * feature's properties, then render it:
 *
 * ```ts
 * import {renderTacticalGraphic, TacticalGraphicName} from '@zaes-code/tactical-graphics';
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

export {TacticalGraphicCategory, GRAPHIC_CATEGORIES} from './core/categories';

// ── Escape hatches for advanced use ─────────────────────────────────────────
export {TacticalGraphicsRegistry} from './core/TacticalGraphicsRegistry';
export {default as geometryService} from './core/GeometryService';
