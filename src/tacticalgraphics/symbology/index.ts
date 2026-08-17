/**
 * # Symbology — how a graphic is drawn, as data
 *
 * The renderer-agnostic half of the style layer. `renderTacticalGraphic` says
 * where a graphic is; these say what it looks like, and return plain
 * {@link Paint} objects rather than an OpenLayers `Style`.
 *
 * **No longer a spike.** This began as three ported style functions, to measure what
 * the rest would cost and whether a declarative renderer could take them at all. The
 * port is done: `isPaintable` is true for **215 of the 216 registered names**, and both
 * shipping renderers paint through here rather than owning any symbology of their own.
 * `ai/maplibre-renderer.md` has the original estimate and how it turned out.
 *
 * **Everything exported here is a renderer contract.** `/openlayers` and `/maplibre`
 * are separately published entry points that consume it by package name, so removing
 * an export breaks them for consumers. See the note in the root barrel.
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
    freeFireAreaCircularPaint,
    plainOutlinePaint,
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

export {fitLabelScale, liftedAnchor} from './labelFit';
export {antiTankDitchPaint, fortifiedLinePaint, wireObstaclePaint} from './obstaclePaints';
export {
    fortifiedPositionPaint,
    mineClusterPaint,
    minelinePaint,
    raftSitePaint,
    tripWirePaint,
} from './protectionLinePaints';
export {decisionLinePaint, mobilityCorridorPaint} from './endGlyphLinePaints';
export {sweptArcTaskPaint} from './sweptArcTaskPaints';
export {obstacleBypassPaint} from './obstacleBypassPaints';
export {demonstrationPaint, escortPaint} from './escortAndDemonstrationPaints';
export {avenueOfApproachLabelPaint} from './movementPaints';
export {psyOpsMarkPaint, psyOpsZonePaint} from './psyOpsPaints';
export {mineFillPaint, minedAreaFencedPaint, minefieldAreaPaint, mineRowMarks} from './minePaints';
export {directionArrowPaint} from './linePaints';
export {routeControlMeasurePaint} from './routePaints';
export {finalProtectiveFirePaint, linearSmokeTargetPaint, linearTargetPaint} from './linearTargetPaints';
export {acpLabelScale, airCorridorLabelPaint, airCorridorPaint, formatWidthAmplifier} from './corridorPaints';
export {retrogradeTaskPaint} from './retrogradePaints';
export {attackHelicopterAxisLabelPaint, aviationAxisLabelPaint, axisOfAdvanceLabelPaint, counterattackLabelPaint, envelopmentLabelPaint, frontalAttackLabelPaint, infiltrationLabelPaint, mobileDefenseLabelPaint, movementGraphicPaint, movementLabelPaint, spanProportionalScale, turningMovementLabelPaint} from './movementPaints';
export {blockPaint, breachPaint, clearPaint} from './blockPaints';
export {
    CROSSED_HALF_WIDTH_PX,
    barSymbolPaint,
    baseDefenseZoneLabelPaint,
    crossedMissionTaskLabelPaint,
    crossedMissionTaskLabelScale,
    crossedMissionTaskPaint,
    movementToContactPaint,
    pursuitPaint,
} from './missionTaskPaints';
export {coordinatedFireLinePaint, dateRangeLabel, engineerWorkLinePaint, munitionFlightPathPaint} from './midLabelLinePaints';
export {arrowheadedLinePaint, forwardLineOfOwnTroopsPaint, lineOfContactPaint} from './scallopPaints';
export {fieldsOfFirePaint, passageLanePaint} from './mobilityPaints';
export {exfiltratePaint, reliefInPlacePaint, turnPaint} from './routedTaskPaints';
export {battlePositionPaint, echelonMarks, strongPointPaint, unexplodedOrdnanceAreaPaint} from './echelonPaints';
export {AIRFIELD_DROP_HALF_WIDTH_PX, airfieldPaint, airfieldPointLabelPaint, airfieldPointPaint} from './airfieldPaints';
export {airCoordinatingAreaLabelPaint, airspaceCoordinationAreaLabelPaint} from './airPaints';
export {boundaryPaint, rangeFanLabelPaint} from './boundaryPaints';
export type {ResolvedRangeFanBand} from './boundaryPaints';
export {securityOperationLabelPaint} from './securityPaints';
export {bridgeLabelPaint, envelopmentGraphicPaint, infiltrationGraphicPaint, mobileDefenseGraphicPaint} from './movementPaints';
export {getPaintFunction, isPaintable, PAINTABLE_GRAPHICS} from './registry';
