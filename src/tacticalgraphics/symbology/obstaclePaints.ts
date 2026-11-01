/**
 * # The countermobility line obstacles
 *
 * The nine wire obstacles, the three anti-tank ditches and the fortified line.
 * Thirteen graphics whose symbol is a **repeating mark walked along the drawn
 * line** — crosses, concertina rings, teeth, merlons — none of which is in the
 * geometry the generator returns.
 *
 * The mark tables themselves (`WIRE_STYLES`, `ANTI_TANK_DITCH_STYLES`) already
 * lived in the map-agnostic half: they describe what a symbol *is*, and were
 * exported precisely so a second renderer would not have to restate them. What was
 * still stuck in the OpenLayers style layer was the code that walks the line and
 * builds the marks, which is what this module is.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicName} from '../core/type';
import {
    ANTI_TANK_DITCH_STYLES,
    ANTI_TANK_HEIGHT_RATIO,
    ANTI_TANK_TOOTH_PX,
} from '../graphics/AntiTankDitch';
import {DEFAULT_WIRE_STYLE, WIRE_MARK_PX, WIRE_STYLES} from '../graphics/WireObstacle';
import {castellatedPath, centerSegmentIndex, centredRun, crenellatedPath, decorationScale, FORTIFIED_CRENEL_PX, FORTIFIED_HEIGHT_PX, FORTIFIED_MERLON_PX, FORTIFIED_MIN_PX, obstacleToothSize, offsetBelow, parallelPath, pathLength, splitAtCorners, uprightRotation, walkPath} from './decorations';
import {amplifierDash, getFullLabel, lineColorOf, scaleOf, labelColorOf} from './paintFunctions';
import {getFullSizeDecorations} from '../core/config';

type ObstaclePaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** The single drawn path, from a LineString or the first part of a MultiLineString. */
function drawnPath(feature: PaintFeature): ProjectedPosition[] {
    const geometry = feature.geometry;
    if (geometry.type === 'LineString') return geometry.coordinates;
    if (geometry.type === 'MultiLineString') return geometry.coordinates[0] ?? [];
    return [];
}

/**
 * The nine wire obstacles: unspecified, single/double fence, double apron, low and
 * high wire, and single/double/triple concertina.
 *
 * One walk along the line placing crosses or rings, plus however many parallel
 * wires the style asks for. `WIRE_STYLES` says which — and *where*: a low wire
 * fence and a single concertina hang their wire underneath so the marks sit on it,
 * a high wire fence and a triple strand add a second above, a double strand runs
 * its second straight through the middle so it strikes the O through.
 *
 * **Wire Unspecified has no wire at all — there the marks are the symbol.** But if
 * the marks have scaled away, the route is drawn anyway: a graphic that vanishes
 * entirely leaves the operator unable to find what they drew, which is worse than a
 * plain line.
 *
 * None of the nine has a planned form, so there is no status to read and no dash.
 */
export function wireObstaclePaint(name: TacticalGraphicName): ObstaclePaint {
    const style = WIRE_STYLES[name] ?? DEFAULT_WIRE_STYLE;

    return (feature, context) => {
        const path = drawnPath(feature);
        if (path.length < 2) return [];

        const stroke = {color: lineColorOf(feature), widthPx: LINE_WIDTH()};
        const paints: Paint[] = [];

        const scale = decorationScale(path, false, context.resolution, WIRE_MARK_PX * style.height);
        const width = WIRE_MARK_PX * scale * context.resolution;
        const height = width * style.height;
        /*
         * "Under" is **left of PT 1 -> PT 2**, so the marks stand on its right. 2525E Table
         * L-XVI and APP-06 draw 290305, 290307 and 290308 with PT 2 on the left and PT 1 on
         * the right, the marks above the rail: travelling west, above is the right. It hung on
         * the right of travel, which put the marks on the wrong side.
         */
        const railOffset = {under: height / 2, center: 0, over: -height / 2};

        if (style.rail || width <= 0) {
            for (const at of style.railsAt ?? ['center']) {
                paints.push({
                    geometry: {type: 'LineString', coordinates: parallelPath(path, railOffset[at])},
                    stroke,
                });
            }
        }
        if (width <= 0) return paints;

        const innerGap = (style.innerGap ?? 0) * width;
        const step = width + innerGap;
        /** One group's own length: its marks and the spaces inside it, and nothing outside. */
        const groupLength = style.perGroup * width + (style.perGroup - 1) * innerGap;
        const marks: ProjectedPosition[][] = [];

        /*
         * **A whole number of groups, centred on each straight run.**
         *
         * The walk used to start half a period in and carry on until the next group did not
         * fit, which leaves an uneven tail at the far end and a pattern whose phase depends
         * on where the operator happened to click. It also stepped straight through the
         * corners: a mark placed there is built on one segment's frame while sitting on the
         * join between two, so it belongs to neither. Both are what the obstacle teeth and
         * the fortified merlons fixed in September, and this is the same layout.
         * @see splitAtCorners, centredRun
         */
        for (const run of splitAtCorners(path)) {
        const runLength = pathLength(run);
        for (const from of centredRun(runLength, groupLength, style.gap * width)) {
            for (let i = 0; i < style.perGroup; i++) {
                const d = from + width / 2 + i * step;
                const at = walkPath(run, d);
                if (!at) continue;

                const [tx, ty] = at.tangent;
                const nx = -ty;
                const ny = tx;
                const corner = (u: number, v: number): ProjectedPosition => [
                    at.point[0] + tx * u + nx * v,
                    at.point[1] + ty * u + ny * v,
                ];

                if (style.mark === 'cross') {
                    marks.push([corner(-width / 2, height / 2), corner(width / 2, -height / 2)]);
                    marks.push([corner(-width / 2, -height / 2), corner(width / 2, height / 2)]);
                } else {
                    // The concertina O, closed: 360 lands back on 0 so the ring joins up.
                    const ring: ProjectedPosition[] = [];
                    for (let a = 0; a <= 360; a += 20) {
                        const t = (a * Math.PI) / 180;
                        ring.push(corner((Math.cos(t) * width) / 2, (Math.sin(t) * height) / 2));
                    }
                    marks.push(ring);
                }
            }
        }
        }

        if (marks.length) paints.push({geometry: {type: 'MultiLineString', coordinates: marks}, stroke});
        return paints;
    };
}

/** `crenellatedPath`'s side sign for the right of the direction of travel. */
const RIGHT_OF_TRAVEL = -1;

/**
 * Antitank wall (MIL-STD-2525 290204): the obstacle line's teeth on the right of the
 * direction of travel, with no label.
 *
 * Its plate draws PT 1 to PT 2 left to right with the teeth hanging below, and says the
 * teeth "typically point toward enemy forces". Which side they are on is the content of
 * the symbol, so it follows the drawing order, as {@link obstacleLinePaint}'s does on the
 * other side. In neither FM 1-02.2 nor APP-06. The antitank ditches state their own side
 * in `ANTI_TANK_DITCH_STYLES`.
 */
export function antiTankWallPaint(): ObstaclePaint {
    return (feature, context) => {
        const path = drawnPath(feature);
        if (path.length < 2) return [];
        const {heightMap, baseMap, gapMap} = obstacleToothSize(path, false, context.resolution);
        const coordinates = heightMap > 0 ? crenellatedPath(path, heightMap, baseMap, gapMap, RIGHT_OF_TRAVEL) : path;
        return [{geometry: {type: 'LineString', coordinates}, stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()}}];
    };
}

/**
 * The mined ditch's gap between two teeth, and the mine in it, as shares of a tooth's width.
 *
 * 2525E 290203 draws tooth, mine, tooth, mine along the line, the teeth apart and each mine a
 * little narrower than the gap it sits in, hanging just below the line beside the teeth.
 */
const MINE_GAP = 0.8;
const MINE_RADIUS = 0.3;
const MINE_DEPTH = 0.4;

/**
 * The three anti-tank ditches: under construction, completed, and reinforced with
 * mines.
 *
 * The drawn route, plus a run of triangular teeth along it on the side
 * `ANTI_TANK_DITCH_STYLES` states, plus, for the mined variant, a disc in the gap after
 * each tooth.
 *
 * **The plain ditches' teeth touch**, so consecutive teeth share a base corner. The mined
 * ditch spaces them: tooth, mine, tooth, mine from PT 1, as MIL-STD-2525E 290203 draws it.
 *
 * **A filled tooth is not also stroked.** A stroke straddles the edge it draws, so
 * it inflates the shape by half a line width all round, and two teeth sharing a
 * base corner then overlap by a full stroke instead of meeting cleanly. The fill
 * states the shape exactly.
 */
export function antiTankDitchPaint(name: TacticalGraphicName): ObstaclePaint {
    return (feature, context) => {
        const path = drawnPath(feature);
        if (path.length < 2) return [];

        const color = lineColorOf(feature);
        const {filled, mines, side} = ANTI_TANK_DITCH_STYLES[name] ?? {filled: false, mines: false, side: 'left'};
        const stroke = {color, widthPx: LINE_WIDTH()};
        const paints: Paint[] = [{geometry: {type: 'LineString', coordinates: path}, stroke}];

        const scale = decorationScale(path, false, context.resolution, ANTI_TANK_TOOTH_PX * ANTI_TANK_HEIGHT_RATIO);
        const total = pathLength(path);
        // A tooth's slot, and for the mined ditch the gap a mine sits in after it, as a share of the tooth.
        const slot = mines ? 1 + MINE_GAP : 1;
        // Kept whole on a line too short for one slot, the tooth narrows to fit rather than
        // vanish. @see getFullSizeDecorations
        const width = Math.min(ANTI_TANK_TOOTH_PX * scale * context.resolution, getFullSizeDecorations() ? (total / slot) * 0.999 : Infinity);
        if (width <= 0) return paints;

        const depth = width * ANTI_TANK_HEIGHT_RATIO;
        const pitch = width * slot;

        const teeth = Math.floor(total / pitch);
        if (teeth < 1) return paints;

        // Center the run, so the pattern sits on the route rather than flush to one end.
        const lead = (total - teeth * pitch) / 2;
        // The left normal is (-ty, tx), so a positive offset is left of travel.
        const sign = side === 'left' ? 1 : -1;

        /** A point `along` the route, `off` meters to the tooth side of it. */
        const at = (along: number, off: number): ProjectedPosition | null => {
            const p = walkPath(path, Math.min(Math.max(along, 0), total));
            if (!p) return null;
            const [tx, ty] = p.tangent;
            return [p.point[0] - ty * off * sign, p.point[1] + tx * off * sign];
        };

        for (let i = 0; i < teeth; i++) {
            const start = lead + i * pitch;
            const a = at(start, 0);
            const b = at(start + width, 0);
            const apex = at(start + width / 2, depth);
            if (!a || !b || !apex) continue;

            const ring: ProjectedPosition[] = [a, b, apex, a];
            paints.push(filled
                ? {geometry: {type: 'Polygon', coordinates: [ring]}, fill: {color}}
                : {geometry: {type: 'LineString', coordinates: ring}, stroke});

            if (!mines) continue;
            const center = at(start + width + (width * MINE_GAP) / 2, width * MINE_DEPTH);
            if (!center) continue;
            const radius = width * MINE_RADIUS;
            const disc: ProjectedPosition[] = [];
            for (let d = 0; d <= 360; d += 20) {
                const t = (d * Math.PI) / 180;
                disc.push([center[0] + Math.cos(t) * radius, center[1] + Math.sin(t) * radius]);
            }
            // Mines are mines, not outlines of one: always solid whatever the teeth do,
            // and unstroked for the same reason the filled teeth are.
            paints.push({geometry: {type: 'Polygon', coordinates: [disc]}, fill: {color}});
        }

        return paints;
    };
}

/**
 * The fortified line: square merlons standing off the drawn line, with the
 * designation below its center.
 *
 * Shares `fortifiedRing`'s pattern-fitting with the fortified *area* — a whole
 * number of merlons distributed over the length rather than repeated at a fixed
 * pitch — so the two families stay visually consistent.
 */
export function fortifiedLinePaint(name: TacticalGraphicName): ObstaclePaint {
    return (feature, context) => {
        const path = drawnPath(feature);
        if (path.length < 2) return [];

        const scale = decorationScale(path, false, context.resolution, FORTIFIED_HEIGHT_PX, FORTIFIED_MERLON_PX, FORTIFIED_MIN_PX);
        const paints: Paint[] = [{
            geometry: {
                type: 'LineString',
                // `'up'`, not the ring winding: a line has no inside, so the only stable
                // side is the one the map defines. @see castellatedPath
                coordinates: castellatedPath(
                    path,
                    FORTIFIED_MERLON_PX * scale * context.resolution,
                    FORTIFIED_CRENEL_PX * scale * context.resolution,
                    FORTIFIED_HEIGHT_PX * scale * context.resolution,
                    'up',
                ),
            },
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)},
        }];

        const text = getFullLabel(name, feature.properties.designation ?? '').trim();
        if (!text) return paints;

        // Under the center-most drawn segment: the merlons take the upper side, so the
        // two never compete. `offsetBelow` normalizes against the map's down, so the
        // label stays beneath whichever way the line was drawn.
        const segIdx = centerSegmentIndex(path);
        const a = path[segIdx];
        const b = path[segIdx + 1];
        const mid: ProjectedPosition = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

        paints.push({
            geometry: {type: 'Point', coordinates: offsetBelow(mid, a, b, context.resolution, 8)},
            text: {
                text,
                font: fontStyle,
                fill: labelColorOf(feature),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                rotation: uprightRotation(a, b),
                align: 'center',
                baseline: 'top',
                scale: scaleOf(feature, context),
            },
        });
        return paints;
    };
}
