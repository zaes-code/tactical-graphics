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
    toGraphicOptions,
} from './core/render';

export type {GraphicLabels, TacticalGraphicProperties, TacticalGraphicRender, TacticalGraphicRole} from './core/render';

// ── Names, categories, symbology ────────────────────────────────────────────
export {
    TacticalGraphicName,
    TacticalGraphicHostility,
    AltitudeDatum,
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
export {resolveBands, resolveBandAzimuths, resolveCenterAzimuth, resolveRangeFanBands} from './graphics/RangeFan';

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
    ENVELOPMENT_FLIP_THRESHOLD,
    envelopmentBendFrom,
} from './graphics/FormsOfManeuver';

export {TacticalGraphicCategory, GRAPHIC_CATEGORIES} from './core/categories';
export {TacticalGraphicSpecification, GRAPHIC_SPECIFICATIONS, getSpecifications, hasSpecification, listNamesBySpecification} from './core/specifications';

// ── Escape hatches for advanced use ─────────────────────────────────────────
export {TacticalGraphicsRegistry} from './core/TacticalGraphicsRegistry';
export {default as geometryService} from './core/GeometryService';

/**
 * Configuration — label size, line width, and the colors. All optional; omit a field
 * and you get the doctrinal FM 1-02.2 value.
 *
 * Lives in the map-agnostic half deliberately. None of it knows what a renderer is:
 * pixel sizes and affiliation colors are properties of the symbology, so a second
 * renderer inherits them rather than reinventing them, and a host configures the library
 * once no matter how many views it has.
 *
 * There is one palette — `DEFAULT_PALETTE`. The library cannot see your basemap, so it
 * never picks colors for you: keep whatever sets your app needs and send one. After
 * changing anything, tell your renderer to invalidate; with OpenLayers that is
 * `source.forEachFeature(f => f.changed())`.
 */
export {
    BASE_FONT_SIZE_PX,
    DEFAULT_LINE_WIDTH,
    AltitudeUnit,
    ALTITUDE_UNIT_SUFFIX,
    getAltitudeUnit,
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
 * Override readers, for a renderer resolving a color. Each returns `undefined` when the
 * host has not overridden that color, leaving the renderer to supply the doctrinal
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
 * ## Symbology — colors, line weight and label scale
 *
 * The doctrinal color table and the three label-scale formulas, resolved against the
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
    allowedGestures,
    supportsHostility,
    CROSSED_MISSION_TASKS,
    RADIUS_GRAPHICS,
    formatDistance,
    formatAltitude,
    hasRadiusReadout,
    GLYPH_CUT_GAP_GRAPHICS,
    RATIO_LOCKED_MISSION_TASKS,
} from './core/symbology';

/**
 * ## Paint lists — what a symbol looks like, as data
 *
 * `renderTacticalGraphic` says where a graphic is; a paint list says how it is drawn.
 * The decorations this library synthesizes at render time — obstacle teeth, the gap cut
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
 * The renderer-agnostic style layer: what a graphic looks like, as data. `isPaintable`
 * is how a renderer asks whether a graphic has a paint function — true for 215 of the
 * 216 registered names. @see ai/maplibre-renderer.md
 *
 * ### Everything below is a renderer contract, not a helper
 *
 * `/openlayers` and `/maplibre` are **separately published entry points**. They consume
 * the map-agnostic half by package name, exactly as a third-party renderer would:
 *
 * ```ts
 * // src/components/openlayers/graphics/decorationPx.ts
 * export {decorationMeters} from '@zaes/tactical-graphics';
 * ```
 *
 * So these exports are not incidental surface that leaked out of the barrel — they are
 * the interface between the geometry and anything that draws it, and un-exporting one
 * stops the renderer subpaths compiling for every consumer. They look like internals
 * because their names describe what they compute rather than who they are for; that is
 * the only reason this needs saying.
 *
 * The same applies to the sizing helpers further down (`decorationMeters`,
 * `arrowheadMeters`, `crossedMissionTaskMeters`) and to the handle contract. **Before
 * removing anything here, grep `src/components/` — a renderer probably imports it.**
 */
export {
    DECORATION_MIN_PX,
    OBSTACLE_TOOTH_BASE_PX,
    OBSTACLE_TOOTH_GAP_PX,
    OBSTACLE_TOOTH_HEIGHT_PX,
    angleBetween,
    centerSegmentIndex,
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
    freeFireAreaCircularPaint,
    groupOrSeriesOfTargetsPaint,
    limitedAccessAreaPaint,
    obstacleAreaPaint,
    plainOutlinePaint,
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
export {
    CROSSED_HALF_WIDTH_PX,
    barSymbolPaint,
    baseDefenseZoneLabelPaint,
    crossedMissionTaskLabelPaint,
    crossedMissionTaskLabelScale,
    crossedMissionTaskPaint,
    movementToContactPaint,
    pursuitPaint,
} from './symbology/missionTaskPaints';
export {coordinatedFireLinePaint, dateRangeLabel, engineerWorkLinePaint, munitionFlightPathPaint} from './symbology/midLabelLinePaints';
export {arrowheadedLinePaint, forwardLineOfOwnTroopsPaint, lineOfContactPaint} from './symbology/scallopPaints';
export {fieldsOfFirePaint, passageLanePaint} from './symbology/mobilityPaints';
export {exfiltratePaint, reliefInPlacePaint, turnPaint} from './symbology/routedTaskPaints';
export {battlePositionPaint, echelonMarks, strongPointPaint, unexplodedOrdnanceAreaPaint} from './symbology/echelonPaints';
export {airfieldPaint} from './symbology/airfieldPaints';
export {airCoordinatingAreaLabelPaint, airspaceCoordinationAreaLabelPaint} from './symbology/airPaints';
export {boundaryPaint, rangeFanLabelPaint} from './symbology/boundaryPaints';
export type {ResolvedRangeFanBand} from './symbology/boundaryPaints';
export {securityOperationLabelPaint} from './symbology/securityPaints';
export {SECURITY_OPERATION_PX} from './graphics/SecurityOperation';
export {baseGeometryFor} from './core/render';
/**
 * Decoration sizing — **renderer contract**. How big a decoration looks is a statement
 * about the symbol, not about a map library, so it lives here and both renderers read
 * it: `maplibreAdapter.ts` imports all three by package name, and the OpenLayers
 * holders reach them through `graphics/decorationPx.ts`, which re-exports
 * `decorationMeters` from `@zaes/tactical-graphics` for exactly that reason.
 *
 * Removing any of these breaks `/openlayers` and `/maplibre` for consumers.
 */
export {CROSSED_MISSION_TASK_PX, arrowheadMeters, crossedMissionTaskMeters, decorationMeters, hasBakedDecoration} from './core/decorationSizes';
export {RANGE_FANS, RANGE_FAN_BAND_OFFSET, RATIO_LOCK, anchorVertex, baseVertexCount, editStretches, handleContract, handleRole, isMovementGraphic, isRectangular, ratioLockOf, rotationAnchor, supportsMirror} from './core/handles';
export {normalizeDrawnBase} from './core/drawnBase';
export {HANDLE_EDIT_MODES} from './core/engine';
export type {EditMode, EngineCallbacks, EngineCapabilities, SelectedGraphic, TacticalGraphicsEngine} from './core/engine';
export type {HandleContract, HandleRole} from './core/handles';
export {
    DEFAULT_SYMBOL_SIZE_PX,
    MAX_SYMBOL_SIZE_PX,
    MIN_SYMBOL_SIZE_PX,
    clearGraphicSecuritySymbolProviders,
    getGraphicSecuritySymbolProvider,
    getSecuritySymbolProvider,
    getSecuritySymbolSize,
    resolveSecuritySymbol,
    securitySymbolRevision,
    securitySymbolSidc,
    setGraphicSecuritySymbolProvider,
    setSecuritySymbolProvider,
    setSecuritySymbolSize,
    subscribeSecuritySymbolChange,
    useMilsymbolSecuritySymbols,
} from './core/securitySymbol';
export type {MilsymbolModule, SecuritySymbolImage, SecuritySymbolProvider, SecuritySymbolRequest} from './core/securitySymbol';
export type {AllowedGestures} from './core/symbology';
export {bridgeLabelPaint, envelopmentGraphicPaint, infiltrationGraphicPaint, mobileDefenseGraphicPaint} from './symbology/movementPaints';
export {PAINTABLE_GRAPHICS, getPaintFunction, isPaintable} from './symbology/registry';
export type {GraphicPainters} from './symbology/registry';
