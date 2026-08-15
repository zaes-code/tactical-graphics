/**
 * # The protection lines that carry a fixed mark
 *
 * Mineline, mine cluster, trip wire, raft site and fortified position — APP-06 290101,
 * 290400, 290500, 290800 and 291000. @see ProtectionLine.ts for the geometry half.
 *
 * Three of them hang a **fixed-size** mark off the drawn line: the trip wire's stake, the
 * raft site's crossed arrowheads, the fortified position's two legs. Their draw rules all
 * say the symbol *"varies only in length"*, which is the standard stating in words the
 * rule this library already has — a size that is not proportional to the graphic is a
 * screen size, and a screen size is computed here rather than baked into the geometry at
 * whatever zoom the user drew at.
 *
 * The mark size comes from `endMarkScale` rather than `decorationScale`, for the reason
 * given where it is defined: a cap tuned for a pattern repeating twenty times along a line
 * is the wrong cap for one mark at its end.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelFillColor, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicName, getLabel} from '../core/type';
import {centerSegmentIndex, endFrame, endMarkScale, offsetAbove, uprightRotation} from './decorations';
import {PLANNED_DASH_PX, amplifierDash, lineColorOf, scaleOf} from './paintFunctions';

type ProtectionPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** Screen-pixel clearance between the line and the nearest edge of an amplifier. */
const LABEL_OFFSET_PX = 8;

/** The path a line graphic was drawn along. */
function drawnPath(feature: PaintFeature): ProjectedPosition[] {
    const geometry = feature.geometry;
    if (geometry.type === 'LineString' || geometry.type === 'MultiPoint') return geometry.coordinates;
    if (geometry.type === 'MultiLineString') return geometry.coordinates[0] ?? [];
    return [];
}

/** A text amplifier with the usual halo. */
function amplifier(
    at: ProjectedPosition,
    text: string,
    scale: number,
    rotation: number,
    align: 'left' | 'center' | 'right',
): Paint {
    return {
        geometry: {type: 'Point', coordinates: at},
        text: {
            text,
            font: fontStyle,
            fill: getLabelFillColor(),
            halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
            rotation,
            align,
            baseline: 'bottom',
            scale,
        },
    };
}

/**
 * APP-06 290101 mineline: the drawn line, `N` above each end, and the free-text modifier
 * above its middle.
 *
 * The end labels hang off the **outside** of the line — aligned left at a start that runs
 * east, right at one that runs west — so the text grows away from the graphic rather than
 * back across it, the same rule the engineer work line uses.
 */
export function minelinePaint(name: TacticalGraphicName): ProtectionPaint {
    return (feature, context) => {
        const path = drawnPath(feature);
        if (path.length < 2) return [];

        const scale = scaleOf(feature, context);
        const endLabel = getLabel(name);
        const start = path[0];
        const afterStart = path[1];
        const end = path[path.length - 1];
        const beforeEnd = path[path.length - 2];

        const paints: Paint[] = [{
            geometry: {type: 'LineString', coordinates: path},
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)},
        }];

        paints.push(amplifier(
            offsetAbove(start, start, afterStart, context.resolution, LABEL_OFFSET_PX),
            endLabel, scale, uprightRotation(start, afterStart),
            afterStart[0] >= start[0] ? 'left' : 'right',
        ));
        paints.push(amplifier(
            offsetAbove(end, beforeEnd, end, context.resolution, LABEL_OFFSET_PX),
            endLabel, scale, uprightRotation(beforeEnd, end),
            end[0] >= beforeEnd[0] ? 'right' : 'left',
        ));

        const modifier = (feature.properties.label ?? '').trim();
        if (!modifier) return paints;

        const segIdx = centerSegmentIndex(path);
        const a = path[segIdx];
        const b = path[segIdx + 1];
        const mid: ProjectedPosition = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        paints.push(amplifier(
            offsetAbove(mid, a, b, context.resolution, LABEL_OFFSET_PX),
            modifier, scale, uprightRotation(a, b), 'center',
        ));
        return paints;
    };
}

/**
 * APP-06 290400 mine cluster: the dome and its chord, both broken.
 *
 * **Always dashed, whatever the status.** The row's own note settles it — *"the dashed
 * lines in this symbol shall be displayed in present and anticipated status"* — so the
 * break is part of the symbol and not a reading of `status`, exactly as it is on the zone
 * of fire. @see dashedOutlinePaint
 */
export function mineClusterPaint(): ProtectionPaint {
    return feature => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];
        return [{
            geometry,
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: PLANNED_DASH_PX},
        }];
    };
}

/**
 * The trip wire's stake, at scale 1 in units of the mark size — a stem crossing the wire,
 * a short bar above it, and a tail hooking away below.
 *
 * Written as `[along, left]` against the frame at point 1, `along` running toward point 2.
 * Taken off the template, where the wire between the two anchor points measures one unit.
 */
const TRIP_WIRE_STEM: readonly ProjectedPosition[] = [[0, 0.99], [0, -0.74]];
const TRIP_WIRE_TAIL: readonly ProjectedPosition[] = [[0, -0.74], [0.24, -1.04], [0.61, -1.22]];
const TRIP_WIRE_BAR: readonly ProjectedPosition[] = [[-0.44, 0.65], [0.51, 0.65]];
/** How far the wire runs *past* point 1, away from point 2. */
const TRIP_WIRE_TAIL_OVERHANG = 0.9;

/** Size of the trip wire's stake, in screen pixels before `endMarkScale`. */
const TRIP_WIRE_MARK_PX = 44;

/**
 * APP-06 290500 trip wire: the wire from the mine to its far end, with the stake glyph at
 * point 1.
 *
 * Point 1 is the far end and point 2 sits at the mine — the mine itself is drawn grey in
 * the standard's Example column, which is its notation for *"here is how the measure is
 * used, this is not part of it"*, so nothing is drawn there.
 */
export function tripWirePaint(): ProtectionPaint {
    return (feature, context) => {
        const path = drawnPath(feature);
        if (path.length < 2) return [];

        const stroke = {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)};
        const paints: Paint[] = [{geometry: {type: 'LineString', coordinates: path}, stroke}];

        const frame = endFrame(path, true);
        const scale = endMarkScale(path, context.resolution, TRIP_WIRE_MARK_PX);
        if (!frame || scale <= 0) return paints;

        const size = TRIP_WIRE_MARK_PX * scale * context.resolution;
        const at = ([along, left]: ProjectedPosition): ProjectedPosition => [
            frame.origin[0] + (frame.u[0] * along + frame.v[0] * left) * size,
            frame.origin[1] + (frame.u[1] * along + frame.v[1] * left) * size,
        ];

        paints.push({
            geometry: {
                type: 'MultiLineString',
                coordinates: [
                    [...TRIP_WIRE_STEM, ...TRIP_WIRE_TAIL.slice(1)].map(at),
                    TRIP_WIRE_BAR.map(at),
                    [at([-TRIP_WIRE_TAIL_OVERHANG, 0]), frame.origin],
                ],
            },
            stroke,
        });
        return paints;
    };
}

/** Half the angle between a raft site's two barbs, and how far each runs past the tip. */
const RAFT_HALF_ANGLE_DEG = 38;
const RAFT_OVERSHOOT = 0.25;
/** Length of a raft site barb, in screen pixels before `endMarkScale`. */
const RAFT_BARB_PX = 30;

/**
 * APP-06 290800 raft site: a shaft with a crossed arrowhead at each end, tips on the
 * anchor points.
 *
 * The barbs run **past** the tip rather than stopping at it, which is what makes the mark
 * a cross rather than a chevron and is how the template draws it. `RAFT_HALF_ANGLE_DEG`
 * keeps the pair inside the acute angle the draw rule calls for.
 */
export function raftSitePaint(): ProtectionPaint {
    return (feature, context) => {
        const path = drawnPath(feature);
        if (path.length < 2) return [];

        const stroke = {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)};
        const paints: Paint[] = [{geometry: {type: 'LineString', coordinates: path}, stroke}];

        const scale = endMarkScale(path, context.resolution, RAFT_BARB_PX);
        if (scale <= 0) return paints;

        const size = RAFT_BARB_PX * scale * context.resolution;
        const spread = Math.tan((RAFT_HALF_ANGLE_DEG * Math.PI) / 180);
        const barbs: ProjectedPosition[][] = [];

        for (const atStart of [true, false]) {
            const frame = endFrame(path, atStart);
            if (!frame) continue;
            // A barb leaves the tip at `-along` (outward, away from the shaft) and comes
            // back through it to `+along`; the two sides differ only in which way `left`
            // points, so one loop states both.
            for (const side of [-1, 1]) {
                const point = (along: number): ProjectedPosition => [
                    frame.origin[0] + (frame.u[0] * along + frame.v[0] * along * spread * side) * size,
                    frame.origin[1] + (frame.u[1] * along + frame.v[1] * along * spread * side) * size,
                ];
                barbs.push([point(-1), point(RAFT_OVERSHOOT)]);
            }
        }

        if (barbs.length) paints.push({geometry: {type: 'MultiLineString', coordinates: barbs}, stroke});
        return paints;
    };
}

/** Depth of a fortified position's legs, in screen pixels before `endMarkScale`. */
const FORTIFIED_POSITION_LEG_PX = 48;

/**
 * APP-06 291000 fortified position: the drawn front edge, with a leg running back from
 * each end — an open bracket, closed on the enemy side.
 *
 * The legs go to the **right of `PT1 → PT2`**, the side the template puts them on, so the
 * note *"the symbol typically faces enemy forces"* becomes a rule the user can act on:
 * draw the front left-to-right across the enemy's approach and the back opens behind you.
 */
export function fortifiedPositionPaint(): ProtectionPaint {
    return (feature, context) => {
        const path = drawnPath(feature);
        if (path.length < 2) return [];

        const stroke = {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)};
        const scale = endMarkScale(path, context.resolution, FORTIFIED_POSITION_LEG_PX);
        if (scale <= 0) return [{geometry: {type: 'LineString', coordinates: path}, stroke}];

        const depth = FORTIFIED_POSITION_LEG_PX * scale * context.resolution;
        const start = endFrame(path, true);
        const end = endFrame(path, false);
        if (!start || !end) return [{geometry: {type: 'LineString', coordinates: path}, stroke}];

        // Both legs run to the right of travel, which is `-v` at the start and `+v` at the
        // end because the end frame's `u` points back along the line.
        const behind = (frame: NonNullable<ReturnType<typeof endFrame>>, sign: number): ProjectedPosition => [
            frame.origin[0] - frame.v[0] * depth * sign,
            frame.origin[1] - frame.v[1] * depth * sign,
        ];

        return [{
            geometry: {type: 'LineString', coordinates: [behind(start, 1), ...path, behind(end, -1)]},
            stroke,
        }];
    };
}
