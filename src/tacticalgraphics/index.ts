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
/** Envelopment's half-circle radius, exported for the same reason as Turn's bend. */
export {
    ENVELOPMENT_DEFAULT_BEND,
    ENVELOPMENT_MIN_BEND,
    ENVELOPMENT_MAX_BEND,
    clampEnvelopmentBend,
} from './graphics/FormsOfManeuver';

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
 * There is one palette — `DEFAULT_PALETTE`. The library cannot see your basemap, so it
 * never picks colours for you: keep whatever sets your app needs and send one. After
 * changing anything, tell your renderer to invalidate; with OpenLayers that is
 * `source.forEachFeature(f => f.changed())`.
 */
export {
    BASE_FONT_SIZE_PX,
    DEFAULT_LINE_WIDTH,
    DEFAULT_PALETTE,
    MAX_LABEL_SIZE,
    MAX_LINE_WIDTH,
    MIN_LABEL_SIZE,
    MIN_LINE_WIDTH,
    TacticalGraphicsConfig,
    configureTacticalGraphics,
    getDefaultLabelSize,
    getDefaultLineWidth,
    getTacticalGraphicsConfig,
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
    getLabelFillColorOverride,
    getLabelHaloColorOverride,
} from './core/config';
export {WIRE_STYLES, DEFAULT_WIRE_STYLE, WIRE_MARK_PX} from './graphics/WireObstacle';
export type {WireStyle} from './graphics/WireObstacle';
export {BAR_SYMBOL_DASHES} from './graphics/ExplosivesReadiness';
export {ANTI_TANK_DITCH_STYLES, ANTI_TANK_TOOTH_PX, ANTI_TANK_HEIGHT_RATIO} from './graphics/AntiTankDitch';
export type {AntiTankDitchStyle} from './graphics/AntiTankDitch';

/**
 * ## Symbology — colours, line weight and label scale
 *
 * The doctrinal colour table and the three label-scale formulas, resolved against the
 * live config. These lived in `openlayerStyles.ts` until the MapLibre work, which made
 * the problem obvious: not one of them mentions OpenLayers, and a second renderer that
 * cannot reach them has to reinvent the palette and then drift from it.
 *
 * The OpenLayers layer re-exports every name here, so its surface is unchanged and there
 * is one implementation of each.
 */
export {
    CAP_HEIGHT_FRACTION,
    HALO_WIDTH,
    LINE_WIDTH,
    RATIO_LOCKED_LABEL_FONT,
    RATIO_LOCKED_LABEL_FONT_PX,
    RATIO_LOCKED_LABEL_FRACTION,
    fontStyle,
    getColorByHostility,
    getDefaultLineColor,
    getDoctrinalHostilityColor,
    getDrawMarkerColor,
    getDrawMarkerOutlineColor,
    getHandleColor,
    getInertHandleColor,
    getLabelFillColor,
    getLabelHaloColor,
    graphicLabelScale,
    labelScale,
    labelZoomMultiplier,
    maxGraphicLabelScale,
    ratioLockedLabelScale,
    withOpacity,
} from './core/symbology';

/**
 * ## Paint lists — what a symbol looks like, as data
 *
 * `renderTacticalGraphic` says where a graphic is; a paint list says how it is drawn.
 * The decorations this library synthesises at render time — obstacle teeth, the gap cut
 * around a mission task's letter, a screen-sized arrowhead — live in 128 places inside
 * OpenLayers style functions today, so a raw-GeoJSON consumer gets a skeleton. A paint
 * function returns those marks as plain data that any renderer can paint.
 *
 * @see ai/maplibre-renderer.md
 */
export {HANDLE_Z_INDEX, mapPaintGeometry, paintFilledRings, paintGeometryMembers, paintGeometryPositions, paintLineWork} from './core/paint';
export type {
    CircleSpec,
    FillSpec,
    HatchSpec,
    Paint,
    PaintColor,
    PaintContext,
    PaintFeature,
    PaintFunction,
    ProjectedGeometry,
    ProjectedInputGeometry,
    ProjectedPosition,
    StrokeSpec,
    TextSpec,
} from './core/paint';

/**
 * ## Symbology — paint functions
 *
 * The renderer-agnostic style layer. Three of 69 style functions are ported so far;
 * `isPaintable` is how a renderer asks whether a graphic has one yet. @see ai/maplibre-renderer.md
 */
export {
    DECORATION_MIN_PX,
    OBSTACLE_TOOTH_BASE_PX,
    OBSTACLE_TOOTH_GAP_PX,
    OBSTACLE_TOOTH_HEIGHT_PX,
    angleBetween,
    centreSegmentIndex,
    crenellatedPath,
    cutArcAtLabel,
    decorationScale,
    obstacleToothSize,
    offsetAbove,
    offsetBelow,
    pathLength,
    textWidth,
    uprightRotation,
} from './symbology/decorations';
export {
    PLANNED_DASH_PX,
    arcMissionTaskPaint,
    areaFillPaint,
    areaOutlinePaint,
    defaultLinePaint,
    amplifierDash,
    formatFullLabel,
    getFullLabel,
    missionTaskLabelPaint,
    obstacleLinePaint,
    phaseLinePaint,
} from './symbology/paintFunctions';
export type {DefaultLineOptions} from './symbology/paintFunctions';
export {
    encirclementPaint,
    fortifiedAreaPaint,
    groupOrSeriesOfTargetsPaint,
    limitedAccessAreaPaint,
    obstacleAreaPaint,
} from './symbology/areaPaints';
export {
    areaDateLabel,
    areaDefaultLabelPaint,
    areaLabelStackPaint,
    groupOrSeriesOfTargetsLabelPaint,
    positionAreaArtilleryLabelPaint,
    smokeObscurantLabelPaint,
    zoneLabelPaint,
} from './symbology/areaLabelPaints';
export {antiTankDitchPaint, fortifiedLinePaint, wireObstaclePaint} from './symbology/obstaclePaints';
export {directionArrowPaint} from './symbology/linePaints';
export {routeControlMeasurePaint} from './symbology/routePaints';
export {finalProtectiveFirePaint, linearSmokeTargetPaint, linearTargetPaint} from './symbology/linearTargetPaints';
export {acpLabelScale, airCorridorLabelPaint, airCorridorPaint, formatWidthAmplifier} from './symbology/corridorPaints';
export {retrogradeTaskPaint} from './symbology/retrogradePaints';
export {attackHelicopterAxisLabelPaint, aviationAxisLabelPaint, axisOfAdvanceLabelPaint, counterattackLabelPaint, envelopmentLabelPaint, frontalAttackLabelPaint, infiltrationLabelPaint, mobileDefenseLabelPaint, movementGraphicPaint, movementLabelPaint, spanProportionalScale, turningMovementLabelPaint} from './symbology/movementPaints';
export {blockPaint, breachPaint, clearPaint} from './symbology/blockPaints';
export {PAINTABLE_GRAPHICS, getPaintFunction, isPaintable} from './symbology/registry';
export type {GraphicPainters} from './symbology/registry';
