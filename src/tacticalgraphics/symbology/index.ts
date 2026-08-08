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
    pathLength,
    textWidth,
    uprightRotation,
} from './decorations';

export {
    arcMissionTaskPaint,
    formatFullLabel,
    getFullLabel,
    missionTaskLabelPaint,
    obstacleLinePaint,
    phaseLinePaint,
} from './paintFunctions';

export {getPaintFunction, isPaintable, PAINTABLE_GRAPHICS} from './registry';
