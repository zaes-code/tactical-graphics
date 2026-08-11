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
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelFillColor, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicName} from '../core/type';
import {
    ANTI_TANK_DITCH_STYLES,
    ANTI_TANK_HEIGHT_RATIO,
    ANTI_TANK_TOOTH_PX,
} from '../graphics/AntiTankDitch';
import {DEFAULT_WIRE_STYLE, WIRE_MARK_PX, WIRE_STYLES} from '../graphics/WireObstacle';
import {
    FORTIFIED_CRENEL_PX,
    FORTIFIED_HEIGHT_PX,
    FORTIFIED_MERLON_PX,
    castellatedPath,
    centreSegmentIndex,
    decorationScale,
    offsetBelow,
    parallelPath,
    pathLength,
    uprightRotation,
    walkPath,
} from './decorations';
import {amplifierDash, getFullLabel, lineColorOf, scaleOf} from './paintFunctions';

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
 * entirely leaves the user unable to find what they drew, which is worse than a
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
        const railOffset = {under: -height / 2, centre: 0, over: height / 2};

        if (style.rail || width <= 0) {
            for (const at of style.railsAt ?? ['centre']) {
                paints.push({
                    geometry: {type: 'LineString', coordinates: parallelPath(path, railOffset[at])},
                    stroke,
                });
            }
        }
        if (width <= 0) return paints;

        const total = pathLength(path);
        const innerGap = (style.innerGap ?? 0) * width;
        const step = width + innerGap;
        const period = style.perGroup * width + (style.perGroup - 1) * innerGap + style.gap * width;
        const marks: ProjectedPosition[][] = [];

        for (let start = period / 2; start < total; start += period) {
            for (let i = 0; i < style.perGroup; i++) {
                const d = start + i * step;
                if (d + width / 2 > total) break;
                const at = walkPath(path, d);
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

        if (marks.length) paints.push({geometry: {type: 'MultiLineString', coordinates: marks}, stroke});
        return paints;
    };
}

/** How far inside its bounding notch a mine disc is drawn. */
const MINE_CLEARANCE = 0.5;

/**
 * The three anti-tank ditches: under construction, completed, and reinforced with
 * mines.
 *
 * The drawn route, plus a run of triangular teeth along it, plus — for the mined
 * variant — a disc in each notch between them.
 *
 * **Every slot holds a tooth**, so consecutive teeth share a base corner and their
 * bases run edge to edge. That is what makes the mined form possible at all: a mine
 * goes in the notch *between* two teeth, so the run can neither begin nor end with
 * one, and a ditch with fewer than two teeth cannot carry any.
 *
 * **A filled tooth is not also stroked.** A stroke straddles the edge it draws, so
 * it inflates the shape by half a line width all round, and two teeth sharing a
 * base corner then overlap by a full stroke instead of meeting cleanly. The fill
 * states the shape exactly.
 *
 * The mine's size is **bounded, not chosen**: the notch is an upward triangle, and
 * a disc centred `mineDepth` down touches both its edges at
 * `mineDepth · sin(halfAngle)`. `MINE_CLEARANCE` holds it well inside that, because
 * a disc drawn to the limit meets the filled teeth either side and the three merge
 * into one black mass.
 */
export function antiTankDitchPaint(name: TacticalGraphicName): ObstaclePaint {
    return (feature, context) => {
        const path = drawnPath(feature);
        if (path.length < 2) return [];

        const color = lineColorOf(feature);
        const {filled, mines} = ANTI_TANK_DITCH_STYLES[name] ?? {filled: false, mines: false};
        const stroke = {color, widthPx: LINE_WIDTH()};
        const paints: Paint[] = [{geometry: {type: 'LineString', coordinates: path}, stroke}];

        const scale = decorationScale(path, false, context.resolution, ANTI_TANK_TOOTH_PX * ANTI_TANK_HEIGHT_RATIO);
        const width = ANTI_TANK_TOOTH_PX * scale * context.resolution;
        if (width <= 0) return paints;

        const depth = width * ANTI_TANK_HEIGHT_RATIO;
        const total = pathLength(path);

        const teeth = Math.floor(total / width);
        if (teeth < 1 || (mines && teeth < 2)) return paints;

        // Centre the run, so the pattern sits on the route rather than flush to one end.
        const lead = (total - teeth * width) / 2;

        /** A point `along` the route, `off` metres to the tooth side of it. */
        const at = (along: number, off: number): ProjectedPosition | null => {
            const p = walkPath(path, Math.min(Math.max(along, 0), total));
            if (!p) return null;
            const [tx, ty] = p.tangent;
            return [p.point[0] - ty * off, p.point[1] + tx * off];
        };

        for (let i = 0; i < teeth; i++) {
            const a = at(lead + i * width, 0);
            const b = at(lead + (i + 1) * width, 0);
            const apex = at(lead + (i + 0.5) * width, -depth);
            if (!a || !b || !apex) continue;

            const ring: ProjectedPosition[] = [a, b, apex, a];
            paints.push(filled
                ? {geometry: {type: 'Polygon', coordinates: [ring]}, fill: {color}}
                : {geometry: {type: 'LineString', coordinates: ring}, stroke});
        }

        if (!mines) return paints;

        const halfAngleSin = (width / 2) / Math.hypot(width / 2, depth);
        const mineDepth = depth * 0.72;
        const radius = mineDepth * halfAngleSin * MINE_CLEARANCE;

        for (let i = 1; i < teeth; i++) {
            const centre = at(lead + i * width, -mineDepth);
            if (!centre) continue;
            const ring: ProjectedPosition[] = [];
            for (let d = 0; d <= 360; d += 20) {
                const t = (d * Math.PI) / 180;
                ring.push([centre[0] + Math.cos(t) * radius, centre[1] + Math.sin(t) * radius]);
            }
            // Mines are mines, not outlines of one: always solid whatever the teeth do,
            // and unstroked for the same reason the filled teeth are.
            paints.push({geometry: {type: 'Polygon', coordinates: [ring]}, fill: {color}});
        }

        return paints;
    };
}

/**
 * The fortified line: square merlons standing off the drawn line, with the
 * designation below its centre.
 *
 * Shares `fortifiedRing`'s pattern-fitting with the fortified *area* — a whole
 * number of merlons distributed over the length rather than repeated at a fixed
 * pitch — so the two families stay visually consistent.
 */
export function fortifiedLinePaint(name: TacticalGraphicName): ObstaclePaint {
    return (feature, context) => {
        const path = drawnPath(feature);
        if (path.length < 2) return [];

        const scale = decorationScale(path, false, context.resolution, FORTIFIED_HEIGHT_PX);
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

        const text = getFullLabel(name, feature.properties.label ?? '').trim();
        if (!text) return paints;

        // Under the centre-most drawn segment: the merlons take the upper side, so the
        // two never compete. `offsetBelow` normalises against the map's down, so the
        // label stays beneath whichever way the line was drawn.
        const segIdx = centreSegmentIndex(path);
        const a = path[segIdx];
        const b = path[segIdx + 1];
        const mid: ProjectedPosition = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

        paints.push({
            geometry: {type: 'Point', coordinates: offsetBelow(mid, a, b, context.resolution, 8)},
            text: {
                text,
                font: fontStyle,
                fill: getLabelFillColor(),
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
