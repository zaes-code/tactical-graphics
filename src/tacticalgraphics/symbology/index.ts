/**
 * # Symbology — how a graphic is drawn, as data
 *
 * The renderer-agnostic half of the style layer. `renderTacticalGraphic` says
 * where a graphic is; these say what it looks like, and return plain
 * {@link Paint} objects rather than an OpenLayers `Style`.
 *
 * **Partial by design, and currently a spike.** Three of 69 style functions are
 * ported. The point was to measure what porting the other 66 costs and whether a
 * declarative renderer could take them at all — see `ai/maplibre-renderer.md` for
 * the answer.
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
} from './decorations';

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
} from './paintFunctions';
export type {DefaultLineOptions} from './paintFunctions';

export {
    encirclementPaint,
    fortifiedAreaPaint,
    groupOrSeriesOfTargetsPaint,
    limitedAccessAreaPaint,
    obstacleAreaPaint,
} from './areaPaints';

export {
    areaDateLabel,
    areaDefaultLabelPaint,
    areaLabelStackPaint,
    groupOrSeriesOfTargetsLabelPaint,
    positionAreaArtilleryLabelPaint,
    smokeObscurantLabelPaint,
    zoneLabelPaint,
} from './areaLabelPaints';

export {antiTankDitchPaint, fortifiedLinePaint, wireObstaclePaint} from './obstaclePaints';
export {directionArrowPaint} from './linePaints';
export {routeControlMeasurePaint} from './routePaints';
export {finalProtectiveFirePaint, linearSmokeTargetPaint, linearTargetPaint} from './linearTargetPaints';
export {acpLabelScale, airCorridorLabelPaint, airCorridorPaint, formatWidthAmplifier} from './corridorPaints';
export {getPaintFunction, isPaintable, PAINTABLE_GRAPHICS} from './registry';
