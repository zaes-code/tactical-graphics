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
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicHostility, TacticalGraphicMineType, TacticalGraphicName} from '../core/type';
import {MINE_GLYPH_GAP_PX, mineGlyph, mineGlyphExtent, mineGlyphPitch} from './minePaints';
import {
    DECORATION_MIN_PX,
    endFrame,
    endMarkScale,
    pathLength,
    splitPathAroundAll,
    uprightRotation,
    walkPath,
} from './decorations';
import {
    PLANNED_DASH_PX,
    amplifierDash,
    hostilityOf,
    lineColorOf,
    plannedStatusRing,
    scaleOf,
    labelColorOf,
} from './paintFunctions';

type ProtectionPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** Screen-pixel clearance between the line and the nearest edge of an amplifier. */
const LABEL_OFFSET_PX = 8;
/** Screen-pixel clearance between a mineline's end and the letter beyond it. */
const MINELINE_LABEL_GAP_PX = 10;
/**
 * How far a mine cluster's planned ring stands off its dome, as a multiple of the dome's
 * own radius.
 *
 * **A ratio, because the symbol is one.** The dome is half the chord and nothing about it
 * is a screen size, so a ring held a fixed number of pixels away comes apart from it the
 * moment the graphic is resized: the same symbol drawn four times as large wore a
 * standoff a quarter as deep, and at the sizes an operator actually draws one the ring
 * grazed the arc. Measured off 290400's own Planned Example — a fit of the black ring
 * against the green dome gives 1.16 — so the standard states the proportion too, in the
 * only place it can.
 */
const MINE_CLUSTER_RING_RATIO = 1.15;

/**
 * The least clearance between a mine cluster's dome and its ring, in screen pixels.
 *
 * A floor, not the rule: below about a 67-pixel dome the proportional standoff closes to
 * less than this, and two dash patterns that near each other read as one ragged arc.
 * The same shape of rule as a repeating decoration's minimum — the proportion governs,
 * and legibility puts a floor under it.
 */
const MINE_CLUSTER_RING_GAP_PX = 10;

/** The path a line graphic was drawn along. */
function drawnPath(feature: PaintFeature): ProjectedPosition[] {
    const geometry = feature.geometry;
    if (geometry.type === 'LineString' || geometry.type === 'MultiPoint') return geometry.coordinates;
    if (geometry.type === 'MultiLineString') return geometry.coordinates[0] ?? [];
    return [];
}

/** A text amplifier with the usual halo. */
function amplifier(
    feature: PaintFeature, at: ProjectedPosition,
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
            fill: labelColorOf(feature),
            halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
            rotation,
            align,
            baseline: 'middle',
            scale,
        },
    };
}

/**
 * Diameter of one mineline mine, in screen pixels, and the share of the line's own
 * on-screen length one of them may span before it shrinks.
 *
 * The pixel figure is a **ceiling**, reached on a line long enough to carry it; the share
 * is what decides the size on everything shorter, which is the shape-relative rule every
 * repeating decoration here follows.
 *
 * **Its own share, not `decorationScale`'s.** That function allows 5%, which suits an
 * obstacle's teeth — twenty small marks whose job is texture. A mine is the symbol rather
 * than texture on it, and 290101's Example draws about a dozen of them at 7% each. At 5% a
 * mineline came out as a dotted line, which is a different symbol. Same reasoning as
 * `endMarkScale`, one family over. @see decorationScale
 */
const MINELINE_MINE_PX = 18;
const MINELINE_MINE_SHARE = 0.07;

/**
 * Where the mines sit along the line, how big each is, and where the line is cut for them.
 *
 * A whole number of them, centred on the route, exactly as the obstacle teeth are fitted:
 * repeating at a fixed pitch instead would leave a ragged half-gap at one end that moves
 * as the line is dragged. @see antiTankDitchPaint
 *
 * **The spacing is the glyph's own width plus a fixed clear space**, not a multiple of the
 * disc, because the seven glyphs are not the same width — an antipersonnel mine with
 * directional effects reaches 2.2 radii one way and 1.5 the other. @see mineGlyphPitch
 */
function minelineMines(
    path: ProjectedPosition[],
    resolution: number,
    type: TacticalGraphicMineType,
): {centers: ProjectedPosition[]; radius: number; gaps: {at: number; halfGap: number}[]} | undefined {
    const availablePx = pathLength(path) / resolution;
    const scale = Math.max(0, Math.min(1, (availablePx * MINELINE_MINE_SHARE) / MINELINE_MINE_PX));
    if (MINELINE_MINE_PX * scale < DECORATION_MIN_PX) return undefined;

    const radius = (MINELINE_MINE_PX * scale * resolution) / 2;
    if (radius <= 0) return undefined;

    const gap = MINE_GLYPH_GAP_PX * resolution;
    const pitch = mineGlyphPitch(type, radius, gap);
    const total = pathLength(path);
    const count = Math.floor(total / pitch);
    if (count < 1) return undefined;

    // Half a pitch in from each end of the centred run, so the first and last mine sit
    // *on* the line rather than hanging off it.
    const lead = (total - (count - 1) * pitch) / 2;
    const extent = mineGlyphExtent(type);
    const centers: ProjectedPosition[] = [];
    const gaps: {at: number; halfGap: number}[] = [];
    for (let i = 0; i < count; i++) {
        const along = lead + i * pitch;
        const at = walkPath(path, along);
        if (!at) continue;
        centers.push(at.point);
        // Cut the line to the glyph's own reach, so a hollow disc reads hollow instead of
        // wearing the stroke as a diameter. (User's call, 2026-08-27.)
        gaps.push({at: along, halfGap: Math.max(extent.left, extent.right) * radius});
    }
    return centers.length ? {centers, radius, gaps} : undefined;
}

/**
 * APP-06 290101 mineline: the drawn line strung with mines, and `N` set beyond each end.
 *
 * **The mines are the symbol, and Modifier 1 says which mine.** The row's Example draws a
 * line of beads and its Template sets a `Modifier 1` box between the two `N`s — the same
 * slot the two mine areas fill from Table 8-24, and the only modifier a *pattern* can be
 * based on. So the bead is the Table 8-24 glyph rather than a plain disc, and the middle
 * box is that glyph repeated rather than a caption. (User's call, 2026-08-27.)
 *
 * **Table 8-24's mine-type rows are remarked *"Used with minefields & mined areas only"*,
 * and a mineline is a protection line.** Read strictly, the standard does not offer these
 * modifiers here — but it does draw a `Modifier 1` box on the row, and no other table
 * populates it. The constraint is recorded rather than silently broken.
 *
 * **The line is cut where each mine sits.** A stroke running through a hollow disc is a
 * disc with a diameter, which is not one of Table 8-24's seven. @see splitPathAroundAll
 *
 * **`N` prints nothing.** The Template's box marks where a hostile marker goes, so the
 * ends carry `ENY` when the mineline is the enemy's and stay bare otherwise. They sit
 * beyond the ends and level with the line — `[N] — [Modifier 1] — [N]` is one row.
 */
export function minelinePaint(name: TacticalGraphicName): ProtectionPaint {
    return (feature, context) => {
        const path = drawnPath(feature);
        if (path.length < 2) return [];

        const scale = scaleOf(feature, context);
        const color = lineColorOf(feature);
        const type = feature.properties.mineType ?? TacticalGraphicMineType.unspecified;
        const stroke = {color, widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)};

        const mines = minelineMines(path, context.resolution, type);
        const runs = mines ? splitPathAroundAll(path, mines.gaps) : [path];
        const paints: Paint[] = [{geometry: {type: 'MultiLineString', coordinates: runs}, stroke}];

        if (mines) {
            for (const center of mines.centers) {
                paints.push(...mineGlyph(center, mines.radius, type, color));
            }
        }

        // **`N` is a placeholder, not a letter.** The Template's box says *where the
        // hostile marker goes*, the way every other `N` box in the standard does — it is
        // not something to print. So the ends carry `ENY` when the mineline is the
        // enemy's and nothing at all otherwise. (User's call, 2026-08-27.)
        if (hostilityOf(feature) !== TacticalGraphicHostility.hostileFaker) return paints;

        const start = path[0];
        const afterStart = path[1];
        const end = path[path.length - 1];
        const beforeEnd = path[path.length - 2];

        // Beyond each end and reading outward, so the letters grow away from the graphic
        // rather than back across the mines.
        const labelGap = MINELINE_LABEL_GAP_PX * context.resolution;
        const outward = (from: ProjectedPosition, to: ProjectedPosition): ProjectedPosition => {
            const dx = to[0] - from[0];
            const dy = to[1] - from[1];
            const len = Math.hypot(dx, dy) || 1;
            return [to[0] + (dx / len) * labelGap, to[1] + (dy / len) * labelGap];
        };
        paints.push(amplifier(
            feature, outward(afterStart, start), 'ENY', scale,
            uprightRotation(start, afterStart), afterStart[0] >= start[0] ? 'right' : 'left',
        ));
        paints.push(amplifier(
            feature, outward(beforeEnd, end), 'ENY', scale,
            uprightRotation(beforeEnd, end), end[0] >= beforeEnd[0] ? 'left' : 'right',
        ));
        return paints;
    };
}

/**
 * A planned mine cluster's ring: the dome itself, pushed outward from the chord's midpoint
 * and closed by its own reflection in the chord.
 *
 * **Not a circle, because the dome is not one.** The dome is generated geodesically — real
 * distances on the ground, which is what the symbol means — and Mercator does not carry a
 * geodesic circle to a circle. It is within a tenth of a percent for a cluster a few tens
 * of kilometres across and out by 9% at 38°N once the chord runs to a thousand miles, at
 * which point a perfect ring drawn around a squashed dome reads as two symbols. Scaling
 * the dome's own points takes the distortion with it, so the standoff is even at every
 * latitude and size, and where the projection *does* make the dome a circle — which is
 * every size anyone draws one at — this is the same circle as before, to the pixel.
 *
 * The push is one factor for the whole curve: the ratio, or whatever larger factor the
 * floor demands at the dome's tightest point. @see MINE_CLUSTER_RING_RATIO
 */
function domeRing(chord: ProjectedPosition[], dome: ProjectedPosition[], resolution: number): ProjectedPosition[] | undefined {
    const [c0, c1] = chord;
    const mid: ProjectedPosition = [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2];
    const radii = dome.map(p => Math.hypot(p[0] - mid[0], p[1] - mid[1]));
    const tightest = Math.min(...radii);
    if (!(tightest > 0)) return undefined;

    const push = Math.max(MINE_CLUSTER_RING_RATIO, 1 + (MINE_CLUSTER_RING_GAP_PX * resolution) / tightest);
    const out = dome.map(p => [mid[0] + (p[0] - mid[0]) * push, mid[1] + (p[1] - mid[1]) * push] as ProjectedPosition);

    // The far half is the near half reflected in the chord — the axis a ring centred on the
    // chord's midpoint is symmetric about, whatever the projection did to the dome.
    const len = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) || 1;
    const u: ProjectedPosition = [(c1[0] - c0[0]) / len, (c1[1] - c0[1]) / len];
    const mirrored = out.map(p => {
        const dx = p[0] - mid[0];
        const dy = p[1] - mid[1];
        const along = dx * u[0] + dy * u[1];
        const across = dx * -u[1] + dy * u[0];
        return [mid[0] + along * u[0] + across * u[1], mid[1] + along * u[1] - across * u[0]] as ProjectedPosition;
    }).reverse();

    return [...out, ...mirrored.slice(1)];
}

/**
 * APP-06 290400 mine cluster: the dome and its chord, both broken.
 *
 * **Always dashed, whatever the status.** The row's own note settles it — *"the dashed
 * lines in this symbol shall be displayed in present and anticipated status"* — so the
 * break is part of the symbol and not a reading of `status`, exactly as it is on the zone
 * of fire. @see dashedOutlinePaint
 *
 * Which is precisely why the row is also *"CM Status Type: Circled"*: with the symbol's
 * own dashes spent, a planned mine cluster has nothing left to say it with, so it says it
 * by wearing a dash-dot ring. @see plannedStatusRing
 *
 * **The ring is the dome itself, pushed outward from the chord's midpoint.** It stands off
 * by {@link MINE_CLUSTER_RING_RATIO} of the dome's own radius, so the two cannot come apart
 * under a rotate, a resize, a zoom *or* a change of latitude — every term is read from the
 * line work the generator produced. @see domeRing for why it is not drawn as a circle
 *
 * The generic bounding-box ring left a wide gap above the apex and a wider one below the
 * chord, which read as two symbols rather than one; drawn exactly on the dome the two dash
 * patterns interleave into a ragged arc. (User's call, 2026-08-27.)
 */
export function mineClusterPaint(): ProtectionPaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];
        const paints: Paint[] = [{
            geometry,
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: PLANNED_DASH_PX},
        }];

        // Part 0 is the chord — points 1 and 2 as drawn — and part 1 the dome on it.
        // @see MineCluster
        const [chord, dome] = geometry.coordinates;
        const path = chord?.length >= 2 && dome?.length >= 2
            ? domeRing(chord, dome, context.resolution)
            : undefined;

        const ring = plannedStatusRing(paints, feature, context, path);
        if (ring) paints.push(ring);
        return paints;
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
        if (!frame) return paints;

        // **One unit is the distance between the two anchor points**, which is what the
        // glyph table above is written in and what the template draws: its crossbar
        // measures 0.97 of point 1 → point 2, and the whole wire measures 1.94 of the
        // crossbar. Sizing the stake as a screen constant instead broke that ratio at
        // every zoom but one — on a long wire the crossbar came out a seventh of it.
        // This symbol is not the "varies only in length" kind; 290500 makes both its
        // length *and* its proportions the two points' business. (User's call,
        // 2026-08-27.)
        const size = Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]);
        if (!(size > 0)) return paints;
        const at = ([along, left]: ProjectedPosition): ProjectedPosition => [
            frame.origin[0] + (frame.u[0] * along + frame.v[0] * left) * size,
            frame.origin[1] + (frame.u[1] * along + frame.v[1] * left) * size,
        ];

        // **The wire runs as far past point 1 as point 2 is beyond it**, so the stake
        // stands at its middle rather than a third of the way along it.
        const far: ProjectedPosition = [
            frame.origin[0] - frame.u[0] * size,
            frame.origin[1] - frame.u[1] * size,
        ];

        paints.push({
            geometry: {
                type: 'MultiLineString',
                coordinates: [
                    [...TRIP_WIRE_STEM, ...TRIP_WIRE_TAIL.slice(1)].map(at),
                    TRIP_WIRE_BAR.map(at),
                    [far, frame.origin],
                ],
            },
            stroke,
        });
        return paints;
    };
}

/** Half the angle between a raft site's two barbs. */
const RAFT_HALF_ANGLE_DEG = 38;
/** Length of a raft site barb, in screen pixels before `endMarkScale`. */
const RAFT_BARB_PX = 30;

/**
 * APP-06 290800 raft site: a shaft with a crossed arrowhead at each end, tips on the
 * anchor points.
 *
 * **The barbs stop at the tip.** They used to run a quarter of their length past it, which
 * put a cross on each end of the shaft — and the template draws a plain Y: two strokes
 * leaving the tip outward, and nothing on the shaft side of it. The overshoot was the only
 * thing making this read as an arrowhead rather than as the open fork it is. (User's call,
 * 2026-08-27.) `RAFT_HALF_ANGLE_DEG` keeps the pair inside the acute angle the draw rule
 * calls for.
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
            // A barb leaves the tip outward at `-along` and stops there; the two sides
            // differ only in which way `left` points, so one loop states both.
            for (const side of [-1, 1]) {
                const point = (along: number): ProjectedPosition => [
                    frame.origin[0] + (frame.u[0] * along + frame.v[0] * along * spread * side) * size,
                    frame.origin[1] + (frame.u[1] * along + frame.v[1] * along * spread * side) * size,
                ];
                barbs.push([frame.origin, point(-1)]);
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
