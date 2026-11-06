/**
 * # The echeloned positions
 *
 * Battle position, strong point and the unexploded-ordnance area: closed shapes
 * that break their outline open and set a symbol in the gap.
 *
 * The first two carry an **echelon glyph** — the Ø, dots, bars, X's and ++ that say team
 * through command — which is drawn rather than lettered, so it is line work and
 * takes the affiliation's color like the outline it sits in. (The boundary's
 * echelon is the documented exception that stays black; these are not it.)
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicEchelon, TacticalGraphicStatus} from '../core/type';
import {cutGapAlongPath, decorationScale, gapFits, joinedAtSeam, pathLength, runVector, splitAtCorners, splitPathAroundAll} from './decorations';
import {PLANNED_DASH_PX, lineColorOf, scaleOf, labelColorOf} from './paintFunctions';
import {midSegmentInView} from './viewFollow';
import {labelGapPx} from './labelFit';

type AreaPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** Screen-pixel clearance either side of the echelon glyph in its gap. */
const ECHELON_GAP_PX = 10;
/** Where along the opening segment the gap is centred. */
const ECHELON_OPENING_MIDPOINT = 0.5;

/** Echelon glyph dimensions, in screen pixels at scale 1. */
const ECHELON_DOT_RADIUS_PX = 5;
const ECHELON_SPACING_PX = 12;
const ECHELON_HALF_LENGTH_PX = 10;

/** Clear space between one X and the next, in screen pixels. @see echelonMarks */
const ECHELON_CROSS_GAP_PX = 2;

/**
 * The most of its own segment the echelon glyph may span before it is shrunk.
 *
 * **0.2 is not a new number.** It is the hole every caller already cuts for the glyph:
 * `ECHELON_GAP_FROM` to `ECHELON_GAP_TO` is a fifth of the opening segment, and the
 * boundary's `BOUNDARY_GAP_SHARE` is a tenth either side of the middle. Capping the glyph
 * at the same share is what keeps it inside the gap it is drawn in — measured before this,
 * a corps glyph on an 80 px boundary spanned 35 px against a 28 px hole, so its outer arms
 * lay across the line, and on a 40 px one it took half the symbol. @see decorationScale, the same shape-relative rule for repeating marks
 */
const ECHELON_SPAN_SHARE = 0.2;

/** Screen-pixel length of a strong point's cross tie, and the spacing between ties. */
const CROSS_TIE_PX = 10;

/** The gap cut for the unexploded-ordnance area's "UXO", in screen pixels. */
const UXO_GAP_WIDTH_PX = 40;

interface OpenedRing {
    /** Every edge of the ring, with the opening segment split around its gap. */
    outline: ProjectedPosition[][];
    /** Center of the gap — where the echelon glyph goes. */
    midGap: ProjectedPosition;
    /** The opening segment's direction. */
    dx: number;
    dy: number;
}

/**
 * The way a battle position's echelon faces: **south**, the bottom of APP-06 151200's template,
 * away from the enemy its example puts at the top.
 *
 * A fixed direction rather than the bag's `rotation`, which is degrees on a point-based graphic
 * and means nothing to an outline turned by its own vertices. Reading it as a radian facing made
 * the side depend on who wrote the bag: OpenLayers never passes it for an area, so its ring opened
 * on the south edge, while MapLibre passed the `rotation: 0` a sample sheet or an import filed and
 * opened the west edge.
 */
const ECHELON_FACING: readonly [number, number] = [0, -1];

/**
 * The outward direction of the edge a position opens on: the reverse of the bag's
 * `openingDirection`, which points from the opening into the shape, or south when it is unset.
 * @see TacticalGraphicProperties.openingDirection
 */
function openingFacing(feature: PaintFeature): readonly [number, number] {
    const degrees = feature.properties.openingDirection;
    if (typeof degrees !== 'number' || !Number.isFinite(degrees)) return ECHELON_FACING;
    const radians = (degrees * Math.PI) / 180;
    return [-Math.cos(radians), -Math.sin(radians)];
}

/**
 * `1` for a ring wound counter-clockwise, `-1` for clockwise, by the shoelace sum.
 *
 * A drawn ring comes either way round — the operator chooses by where they click next — so the
 * outward side of an edge has to be worked out rather than assumed. Assuming counter-clockwise
 * opened a clockwise battle position on its north edge.
 */
function ringWinding(ring: ProjectedPosition[]): 1 | -1 {
    let twiceArea = 0;
    for (let i = 0; i < ring.length - 1; i++) twiceArea += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    const [first, last] = [ring[0], ring[ring.length - 1]];
    if (first[0] !== last[0] || first[1] !== last[1]) twiceArea += last[0] * first[1] - first[0] * last[1];
    return twiceArea < 0 ? -1 : 1;
}

/**
 * The index of the edge whose **outward** normal best faces `facing`, whichever way the ring
 * is wound, or `null` for a ring with no length. @see ringWinding
 */
function openingIndex(ring: ProjectedPosition[], facing: readonly [number, number]): number | null {
    const winding = ringWinding(ring);
    let best = -Infinity;
    let found: number | null = null;
    for (let i = 0; i < ring.length - 1; i++) {
        const dx = ring[i + 1][0] - ring[i][0];
        const dy = ring[i + 1][1] - ring[i][1];
        const segLen = Math.hypot(dx, dy);
        if (segLen === 0) continue;
        // Outward is the right-hand normal on a counter-clockwise ring, the left on a clockwise one.
        const dot = (winding * (dy * facing[0] - dx * facing[1])) / segLen;
        if (dot > best) {
            best = dot;
            found = i;
        }
    }
    return found;
}

/**
 * The edge the ring opens on, as its vector — the same choice `openRing` makes.
 *
 * Split out because the hole's width is now the glyph's, and the glyph's width depends on
 * the segment it is laid along: which edge comes first, then how big the mark on it may be,
 * then where to cut. @see openRing
 */
function openingSegment(ring: ProjectedPosition[], facing: readonly [number, number]): [number, number] | null {
    if (ring.length < 2) return null;
    const found = openingIndex(ring, facing);
    // As long as the run the edge belongs to, which a smoothed outline's chord is not. @see runVector
    return found === null ? null : runVector(ring, found, ECHELON_OPENING_MIDPOINT, true);
}

/**
 * Breaks a polygon's outer ring open on the edge facing `facing`, and cuts a gap in it for
 * the echelon glyph. @see openingIndex
 */
function openRing(
    ring: ProjectedPosition[],
    facing: readonly [number, number],
    resolution: number,
    /** Half the hole to cut, in screen pixels — the glyph's own half-width. @see echelonWidthPx */
    halfGapPx: number,
    /** The scale the glyph is drawn at, which its clearance follows. @see labelGapPx */
    scale: number,
): OpenedRing | null {
    if (ring.length < 2) return null;
    const openIndex = openingIndex(ring, facing);
    if (openIndex === null) return null;

    const [dx, dy] = runVector(ring, openIndex, ECHELON_OPENING_MIDPOINT, true);
    if (dx === 0 && dy === 0) return null;

    /*
     * The hole is the glyph's own width plus clearance, centred on the segment — not the
     * fixed fifth it used to be. @see echelonWidthPx
     *
     * **Cut along the ring, not inside the one segment.** A smoothed outline's opening edge is a
     * short chord of the curve, which the hole overruns. So the ring is walked from the point
     * opposite the opening, putting the opening in the middle of the walk, and the hole is cut
     * along it; the walk is then joined back up at its seam. On a hard outline whose hole fits
     * its edge this draws exactly what the one-segment cut did. @see cutGapAlongPath
     */
    const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring : [...ring, ring[0]];
    const m = closed.length - 1;
    const k = Math.floor(m / 2);
    const walk = Array.from({length: m + 1}, (_, j) => closed[(((openIndex - k + j) % m) + m) % m]);
    const cut = cutGapAlongPath(walk, k, ECHELON_OPENING_MIDPOINT, (halfGapPx + labelGapPx(ECHELON_GAP_PX, scale)) * resolution);
    const outline = splitAtCorners([...cut.after, ...cut.before.slice(1)]).filter(run => run.length > 1);

    return {outline, midGap: cut.center, dx, dy};
}

/** Sides of the polygon a team's Ø circle is drawn as, so every engine strokes it the same. */
const TEAM_CIRCLE_SIDES = 24;
/** The Ø circle's radius, against the dot's. */
const TEAM_RADIUS_SHARE = 1.4;
/** How far the Ø slash runs past its circle's centre, as a multiple of the radius. */
const TEAM_SLASH_REACH = 1.4;

/** How many X's each echelon from brigade up wears. */
const CROSS_COUNT: Partial<Record<TacticalGraphicEchelon, number>> = {
    [TacticalGraphicEchelon.brigade]: 1,
    [TacticalGraphicEchelon.division]: 2,
    [TacticalGraphicEchelon.corpsMef]: 3,
    [TacticalGraphicEchelon.army]: 4,
    [TacticalGraphicEchelon.armyGroupFront]: 5,
    [TacticalGraphicEchelon.regionTheater]: 6,
};

/**
 * The echelon glyph, MIL-STD-2525E's field B: Ø for a team or crew, dots for squad
 * through platoon, perpendicular bars for company through regiment, one X per level
 * from brigade (X) to theater (XXXXXX), and ++ for a command.
 *
 * Every size is screen pixels multiplied by the label scale, so the glyph grows
 * and shrinks with the amplifiers around it rather than with the map.
 *
 * **No echelon draws nothing.** It used to fall back to a squad's dot, which said
 * squad about every position nobody had given an echelon. `Unknown` is the same.
 */
function buildEchelonMarks(
    mid: ProjectedPosition,
    dx: number,
    dy: number,
    resolution: number,
    echelon: TacticalGraphicEchelon | undefined,
    color: string,
    scale: number,
): Paint[] {
    const segLen = Math.hypot(dx, dy);
    if (!segLen || echelon === undefined) return [];

    const ux = dx / segLen;
    const uy = dy / segLen;
    const nx = -uy;
    const ny = ux;

    const spacing = ECHELON_SPACING_PX * scale * resolution;
    const halfLength = ECHELON_HALF_LENGTH_PX * scale * resolution;
    const stroke = {color, widthPx: LINE_WIDTH()};

    const dot = (offset: number): Paint => ({
        geometry: {type: 'Point', coordinates: [mid[0] + ux * spacing * offset, mid[1] + uy * spacing * offset]},
        circle: {radiusPx: ECHELON_DOT_RADIUS_PX * scale, fill: {color}},
    });
    const bar = (offset: number): Paint => {
        const cx = mid[0] + ux * spacing * offset;
        const cy = mid[1] + uy * spacing * offset;
        return {
            geometry: {
                type: 'LineString',
                coordinates: [
                    [cx - nx * halfLength, cy - ny * halfLength],
                    [cx + nx * halfLength, cy + ny * halfLength],
                ],
            },
            stroke,
        };
    };

    /*
     * **The X's, and why their spacing is their own.**
     *
     * One for a brigade, two for a division, three for a corps or MEF, which is what FM
     * 1-02.2's table 5-3 draws on its division boundary: two X's side by side, sharing an
     * edge rather than spaced out. The dots and bars are marks on a line and take
     * `spacing`; an X is a *letter* and the pair reads as one word, so the step between
     * them is the width of the glyph itself — `halfLength * √2` is exactly corner to
     * corner — plus daylight, or the arms of neighbouring X's meet and the pair reads as a
     * lattice. Spacing them like the bars leaves a hole down the middle of the XX instead.
     *
     * **The arms are strokes, so the corner is not where the ink stops.** Stepping by the
     * geometry alone left the two X's touching however wide the gap was written: a stroke
     * of width `w` at 45 degrees puts ink `w/√2` past its own endpoint horizontally, from
     * each of the two neighbours, which is the whole of a two-pixel gap at the default line
     * width. Measured on the rendered boundary: zero empty columns between the X's before
     * this term, and the gap asked for after it. The allowance does not take `scale`,
     * because a stroke width is screen pixels and does not either.
     */
    const inkAllowance = (LINE_WIDTH() * Math.SQRT2) * resolution;
    const crossStep = halfLength * Math.SQRT2 + ECHELON_CROSS_GAP_PX * scale * resolution + inkAllowance;
    const cross = (offset: number): Paint[] => {
        const cx = mid[0] + ux * crossStep * offset;
        const cy = mid[1] + uy * crossStep * offset;
        // The tangent turned ±45°, so the X straddles the segment evenly however
        // the position was drawn.
        const cos = Math.cos(Math.PI / 4);
        const sin = Math.sin(Math.PI / 4);
        const arm = (vx: number, vy: number): Paint => ({
            geometry: {
                type: 'LineString',
                coordinates: [
                    [cx - vx * halfLength, cy - vy * halfLength],
                    [cx + vx * halfLength, cy + vy * halfLength],
                ],
            },
            stroke,
        });
        return [arm(ux * cos - uy * sin, ux * sin + uy * cos), arm(ux * cos + uy * sin, -ux * sin + uy * cos)];
    };
    const crosses = (count: number): Paint[] =>
        Array.from({length: count}, (_, i) => cross(i - (count - 1) / 2)).flat();

    /*
     * **A command's ++.** Each plus fills the same box as one X, so ++ sits in the break at
     * the size an XX does, and they step by that width plus the same daylight. A plus's
     * along-arm is a stroke end-on, so its ink runs half a line width past each end.
     */
    const plusHalf = halfLength * Math.cos(Math.PI / 4);
    const plusStep = plusHalf * 2 + ECHELON_CROSS_GAP_PX * scale * resolution + LINE_WIDTH() * resolution;
    const plus = (offset: number): Paint[] => {
        const cx = mid[0] + ux * plusStep * offset;
        const cy = mid[1] + uy * plusStep * offset;
        const line = (vx: number, vy: number): Paint => ({
            geometry: {
                type: 'LineString',
                coordinates: [
                    [cx - vx * plusHalf, cy - vy * plusHalf],
                    [cx + vx * plusHalf, cy + vy * plusHalf],
                ],
            },
            stroke,
        });
        return [line(ux, uy), line(nx, ny)];
    };

    /*
     * **A team's Ø**: a ring with a slash through it, lower left to upper right on a line
     * running east. The ring is a polygon of short strokes rather than a circle paint, which
     * every engine fills rather than strokes.
     */
    const team = (): Paint[] => {
        const radius = ECHELON_DOT_RADIUS_PX * TEAM_RADIUS_SHARE * scale * resolution;
        const ring: ProjectedPosition[] = Array.from({length: TEAM_CIRCLE_SIDES}, (_, i) => {
            const a = (i / TEAM_CIRCLE_SIDES) * 2 * Math.PI;
            return [mid[0] + radius * Math.cos(a), mid[1] + radius * Math.sin(a)];
        });
        ring.push(ring[0]);
        const reach = radius * TEAM_SLASH_REACH;
        const [sx, sy] = [(ux - uy) * Math.SQRT1_2, (ux + uy) * Math.SQRT1_2];
        return [
            {geometry: {type: 'LineString', coordinates: ring}, stroke},
            {
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [mid[0] - sx * reach, mid[1] - sy * reach],
                        [mid[0] + sx * reach, mid[1] + sy * reach],
                    ],
                },
                stroke,
            },
        ];
    };

    const crossCount = CROSS_COUNT[echelon];
    if (crossCount) return crosses(crossCount);

    switch (echelon) {
        case TacticalGraphicEchelon.teamCrew:
            return team();
        case TacticalGraphicEchelon.squad:
            return [dot(0)];
        case TacticalGraphicEchelon.section:
            return [dot(-1), dot(1)];
        case TacticalGraphicEchelon.platoonDetachment:
            return [dot(-1), dot(0), dot(1)];
        case TacticalGraphicEchelon.companyBatteryTroop:
            return [bar(0)];
        case TacticalGraphicEchelon.battalionSquadron:
            return [bar(-1), bar(1)];
        case TacticalGraphicEchelon.regimentGroup:
            return [bar(-1), bar(0), bar(1)];
        case TacticalGraphicEchelon.command:
            return [...plus(-0.5), ...plus(0.5)];
        default:
            return [];
    }
}

/**
 * How far the glyph reaches **along** the segment, in screen pixels.
 *
 * Measured off the marks themselves rather than from the layout constants, so a new
 * echelon cannot be added with a size the cap does not know about. A dot's ink runs a
 * radius past its centre; a stroke's ends are its geometry.
 */
function alongExtentPx(marks: Paint[], mid: ProjectedPosition, ux: number, uy: number, resolution: number): number {
    let reach = 0;
    for (const mark of marks) {
        const along = (at: ProjectedPosition): number =>
            ((at[0] - mid[0]) * ux + (at[1] - mid[1]) * uy) / resolution;
        if (mark.circle && mark.geometry.type === 'Point') {
            reach = Math.max(reach, Math.abs(along(mark.geometry.coordinates)) + (mark.circle.radiusPx ?? 0));
            continue;
        }
        if (mark.geometry.type === 'LineString') {
            for (const at of mark.geometry.coordinates) reach = Math.max(reach, Math.abs(along(at)));
        }
    }
    return reach * 2;
}

/**
 * How wide the glyph comes out, in screen pixels, once the cap has had its say.
 *
 * **A gap has to follow whatever it makes room for.** Every caller cuts a hole in its own
 * line for this glyph, and each used to size that hole from a constant — a fifth of the
 * segment, plus a fixed clearance — which is right for one echelon at one zoom and wrong
 * either side of it: a corps XXX overran the hole while a squad's single dot sat in a hole
 * four times its width. The same lesson `TURN_LABEL_GAP_METERS` carries for the "T" in a
 * bowed turn: measure the thing, then cut.
 */
export function echelonWidthPx(
    dx: number,
    dy: number,
    resolution: number,
    echelon: TacticalGraphicEchelon | undefined,
    scale = 1,
): number {
    const segLen = Math.hypot(dx, dy);
    if (!segLen || !(resolution > 0)) return 0;
    return alongExtentPx(
        echelonMarks([0, 0], dx, dy, resolution, echelon, '#000', scale),
        [0, 0],
        dx / segLen,
        dy / segLen,
        resolution,
    );
}

/**
 * The echelon glyph, **capped against the segment it sits on**.
 *
 * Every size inside is screen pixels times the label scale, so the glyph holds its size
 * while the symbol shrinks under it: a corps boundary 40 px long wore a 20 px XXX, and the
 * outer arms of a division's XX lay across the line rather than inside the gap cut for it.
 * The cap is the general rule this library states everywhere else — a mark may not outgrow
 * the thing it marks — measured against the opening segment, which is what every caller
 * hands over and what the gap is cut from. @see ECHELON_SPAN_SHARE
 *
 * The glyph itself: Ø for a team, dots for squad through platoon, perpendicular bars for
 * company through regiment, one X per level from brigade up, ++ for a command, and nothing
 * for no echelon. @see buildEchelonMarks
 */
export function echelonMarks(
    mid: ProjectedPosition,
    dx: number,
    dy: number,
    resolution: number,
    echelon: TacticalGraphicEchelon | undefined,
    color: string,
    scale = 1,
): Paint[] {
    const segLen = Math.hypot(dx, dy);
    if (!segLen || !(resolution > 0)) return [];

    const allowedPx = (ECHELON_SPAN_SHARE * segLen) / resolution;
    const ux = dx / segLen;
    const uy = dy / segLen;

    /*
     * **Measured, shrunk and measured again**, because the glyph is not quite linear in its
     * own scale: the daylight between the X's carries a stroke-width term that stays put
     * while everything around it shrinks. A single correction therefore lands slightly wide
     * — a corps glyph came out 12.8 px against an 11.1 px allowance — and three passes put
     * every echelon inside it. Bounded rather than looped to convergence: this runs on every
     * frame of a drag.
     */
    let marks = buildEchelonMarks(mid, dx, dy, resolution, echelon, color, scale);
    let current = scale;
    for (let pass = 0; pass < 3; pass++) {
        const extentPx = alongExtentPx(marks, mid, ux, uy, resolution);
        if (!(extentPx > allowedPx) || !(extentPx > 0)) return marks;
        current *= allowedPx / extentPx;
        marks = buildEchelonMarks(mid, dx, dy, resolution, echelon, color, current);
    }
    return marks;
}

/**
 * The strong point's cross ties: short perpendicular strokes stepping along the
 * whole outline.
 *
 * **These are where the screen-fixed decorations started** — the obstacle teeth
 * and the fortified merlons were changed to match them — but they were the one
 * set never capped, so zoomed out they swamped the ring they hang off. They take
 * the same shape-relative rule as the rest now, measured across the whole outline
 * because what arrives here is already broken into segments rather than one
 * closed ring.
 */
function crossTies(outline: ProjectedPosition[][], resolution: number, color: string): Paint[] {
    const flat = outline.flat();
    const scale = decorationScale(flat, true, resolution, CROSS_TIE_PX);
    if (scale <= 0) return [];

    const spacing = CROSS_TIE_PX * scale * resolution;
    const length = CROSS_TIE_PX * scale * resolution;
    const paints: Paint[] = [];

    for (const ring of outline) {
        let traveled = 0;
        let lastTie = 0;
        for (let i = 0; i < ring.length - 1; i++) {
            const p1 = ring[i];
            const p2 = ring[i + 1];
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const segLen = Math.hypot(dx, dy);
            if (segLen === 0) continue;

            const segStart = traveled;
            const segEnd = traveled + segLen;
            while (lastTie + spacing <= segEnd) {
                lastTie += spacing;
                if (lastTie < segStart) continue;
                const t = (lastTie - segStart) / segLen;
                const x = p1[0] + t * dx;
                const y = p1[1] + t * dy;
                paints.push({
                    geometry: {
                        type: 'LineString',
                        coordinates: [[x, y], [x + (-dy / segLen) * length, y + (dx / segLen) * length]],
                    },
                    stroke: {color, widthPx: LINE_WIDTH()},
                });
            }
            traveled = segEnd;
        }
    }
    return paints;
}

/** The outer ring of a feature's polygon, or nothing. */
function outerRing(feature: PaintFeature): ProjectedPosition[] | null {
    return feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0] ?? null : null;
}

/**
 * Battle position: the outline broken open on the facing side with the echelon
 * glyph in the gap, dashed when planned. The side is the bag's `openingDirection`,
 * south when it is unset. @see openingFacing
 *
 * `alwaysDashed` is APP-06 151202, "battle position prepared (P) but not occupied" —
 * a *different symbol*, not a status. Its template is drawn broken and its Example
 * reads "(P) MARS", so the break is the symbol saying nobody is there yet, and it
 * has to survive a graphic whose status is present. @see 242600, same reasoning.
 */
export function battlePositionPaint(opts: {alwaysDashed?: boolean} = {}): AreaPaint {
    return (feature, context) => {
        const ring = outerRing(feature);
        if (!ring) return [];
        // No echelon draws no glyph, and the ring opens only by its clearance. @see buildEchelonMarks
        const echelon = feature.echelon ?? feature.properties.echelon;
        const facing = openingFacing(feature);
        // The hole is cut to fit the glyph that goes in it, so the ring opens exactly as
        // far as this echelon needs and no further. @see echelonWidthPx
        const opening = openingSegment(ring, facing);
        const halfGlyphPx = opening
            ? echelonWidthPx(opening[0], opening[1], context.resolution, echelon, scaleOf(feature, context)) / 2
            : 0;
        const opened = openRing(ring, facing, context.resolution, halfGlyphPx, scaleOf(feature, context));
        if (!opened) return [];

        const color = lineColorOf(feature);
        return [
            {
                geometry: {type: 'MultiLineString', coordinates: opened.outline},
                stroke: {
                    color,
                    widthPx: LINE_WIDTH(),
                    dashPx: opts.alwaysDashed || feature.properties.status === TacticalGraphicStatus.planned
                        ? PLANNED_DASH_PX
                        : undefined,
                },
            },
            ...echelonMarks(opened.midGap, opened.dx, opened.dy, context.resolution, echelon, color, scaleOf(feature, context)),
        ];
    };
}

/** Strong point: the battle position's outline and echelon, plus the cross ties. */
export function strongPointPaint(): AreaPaint {
    return (feature, context) => {
        const ring = outerRing(feature);
        if (!ring) return [];
        // No echelon draws no glyph, and the ring opens only by its clearance. @see buildEchelonMarks
        const echelon = feature.echelon ?? feature.properties.echelon;
        const facing = openingFacing(feature);
        // The hole is cut to fit the glyph that goes in it, so the ring opens exactly as
        // far as this echelon needs and no further. @see echelonWidthPx
        const opening = openingSegment(ring, facing);
        const halfGlyphPx = opening
            ? echelonWidthPx(opening[0], opening[1], context.resolution, echelon, scaleOf(feature, context)) / 2
            : 0;
        const opened = openRing(ring, facing, context.resolution, halfGlyphPx, scaleOf(feature, context));
        if (!opened) return [];

        const color = lineColorOf(feature);
        return [
            {geometry: {type: 'MultiLineString', coordinates: opened.outline}, stroke: {color, widthPx: LINE_WIDTH()}},
            ...echelonMarks(opened.midGap, opened.dx, opened.dy, context.resolution, echelon, color, scaleOf(feature, context)),
            ...crossTies(opened.outline, context.resolution, color),
        ];
    };
}

/**
 * The unexploded-ordnance area: "UXO" set in a gap on each of the two segments
 * that bound the shape along the rotation axis.
 *
 * The pair is found by projecting every segment's midpoint onto that axis and
 * taking the extremes, so the two labels land on opposite sides however many
 * vertices the polygon has. A shape whose extremes collapse onto one segment
 * falls back to a plain closed outline rather than labeling it twice.
 *
 * A segment shorter than the gap keeps its full length: breaking it would leave
 * nothing of the edge at all.
 */
export function unexplodedOrdnanceAreaPaint(): AreaPaint {
    return (feature, context) => {
        const ring = outerRing(feature);
        if (!ring || ring.length < 3) return [];

        const color = lineColorOf(feature);
        const rotation = feature.properties.rotation ?? 0;
        const unitRot = [Math.cos(rotation), Math.sin(rotation)];
        const gapMap = UXO_GAP_WIDTH_PX * context.resolution;

        let maxProjection = -Infinity;
        let minProjection = Infinity;
        let maxIndex = -1;
        let minIndex = -1;
        for (let i = 0; i < ring.length - 1; i++) {
            const midX = (ring[i][0] + ring[i + 1][0]) / 2;
            const midY = (ring[i][1] + ring[i + 1][1]) / 2;
            const projection = midX * unitRot[0] + midY * unitRot[1];
            if (projection > maxProjection) {
                maxProjection = projection;
                maxIndex = i;
            }
            if (projection < minProjection) {
                minProjection = projection;
                minIndex = i;
            }
        }

        if (maxIndex === minIndex || maxIndex === -1 || minIndex === -1) {
            return [{geometry: {type: 'Polygon', coordinates: [ring]}, stroke: {color, widthPx: LINE_WIDTH()}}];
        }

        const paints: Paint[] = [];
        const scale = scaleOf(feature, context);

        /*
         * **The gaps are cut along the ring, on the edge each extreme belongs to.** On a
         * hard outline that is the segment itself, so this is the one-segment cut it always
         * was; on a smoothed one the extreme edge is a short chord, and judging the gap against
         * the chord dropped both gaps and both labels. The ring is walked from halfway between
         * the two extremes, so neither gap straddles the walk's seam. @see gapFits
         */
        const m = ring.length - 1;
        const start = (maxIndex + Math.floor((((minIndex - maxIndex) % m) + m) % m / 2)) % m;
        const walk = Array.from({length: m + 1}, (_, j) => ring[(start + j) % m]);
        const gaps: {at: number; halfGap: number}[] = [];

        for (const i of [maxIndex, minIndex]) {
            const p1 = ring[i];
            const p2 = ring[i + 1];
            // The side's middle, or the middle of what is in view of it when that is off screen:
            // the gap and its `UXO` together. @see midSegmentInView
            const {t} = midSegmentInView([p1, p2], {index: 0, t: 0.5}, context);
            if (!gapFits(ring, i, t, gapMap / 2, true)) continue;
            const along = (i - start + m) % m;
            gaps.push({at: pathLength(walk.slice(0, along + 1)) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * t, halfGap: gapMap / 2});

            paints.push({
                geometry: {type: 'Point', coordinates: [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t]},
                text: {
                    text: 'UXO',
                    font: fontStyle,
                    fill: labelColorOf(feature),
                    halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                    scale,
                },
            });
        }

        // The runs left by the gaps, the two that meet at the walk's seam joined back up.
        const runs = gaps.length ? joinedAtSeam(splitPathAroundAll(walk, gaps), walk) : [walk];
        const outline = runs.flatMap(run => splitAtCorners(run)).filter(run => run.length > 1);
        paints.push({geometry: {type: 'MultiLineString', coordinates: outline}, stroke: {color, widthPx: LINE_WIDTH()}});
        return paints;
    };
}
