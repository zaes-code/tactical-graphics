/**
 * # Decoration geometry — the shapes that only exist at render time
 *
 * Obstacle teeth, fortified merlons, FLOT scallops, the gap cut around a mission
 * task's letter. None of these are in the GeoJSON `renderTacticalGraphic`
 * returns; all of them are synthesised, per frame, from the current view scale.
 * That synthesis happens in 128 places inside `openlayerStyles.ts` today, which
 * is what makes it unreachable from any other renderer — and what leaves a
 * raw-GeoJSON consumer holding a skeleton.
 *
 * This module is the first of those 128 moved out. Everything here is:
 *
 * - **Planar.** Coordinates are EPSG:3857 metres and the math is plain Euclidean
 *   vector work — `Math.hypot`, `Math.atan2`, unit vectors. No turf, no
 *   `GeometryService`: both expect geographic degrees, and mixing the two is the
 *   mistake the repo's coordinate rules exist to prevent.
 * - **Pure.** No DOM, no canvas, no renderer. Text widths arrive through
 *   {@link PaintContext.measureText}.
 * - **Screen-aware.** A decoration's size is a pixel count times the resolution,
 *   computed here rather than baked into geometry, because `n * resolution` is a
 *   constant number of screen pixels at every zoom and a metric offset is not.
 */

import type {PaintContext, ProjectedPosition} from '../core/paint';

/** Total length of a path, in projected metres. */
export function pathLength(path: ProjectedPosition[]): number {
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
        total += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    }
    return total;
}

/**
 * Index of the segment containing the path's halfway point. Where a line
 * graphic's label goes, so it lands on the middle of the *drawn* line rather than
 * on whichever vertex happens to be central in the array.
 */
export function centreSegmentIndex(coords: ProjectedPosition[]): number {
    const lengths: number[] = [];
    let total = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        const len = Math.hypot(coords[i + 1][0] - coords[i][0], coords[i + 1][1] - coords[i][1]);
        lengths.push(len);
        total += len;
    }
    let travelled = 0;
    for (let i = 0; i < lengths.length; i++) {
        travelled += lengths[i];
        if (travelled >= total / 2) return i;
    }
    return Math.max(0, lengths.length - 1);
}

/** Width of `text` in screen pixels at `font`, scaled. @see PaintContext.measureText */
export function textWidth(context: PaintContext, text: string, font: string, scale: number): number {
    return context.measureText(text, font) * scale;
}

/**
 * The share of a shape's own on-screen size its decoration may occupy before it
 * starts shrinking.
 *
 * The open share is much the smaller of the two because it is measured against
 * the path's whole length while the decoration repeats along it — a tooth a
 * twentieth of the line long is already prominent. A closed ring is measured
 * against its smaller side, which the decoration spans only once.
 */
const DECORATION_MAX_SHARE_CLOSED = 0.1;
const DECORATION_MAX_SHARE_OPEN = 0.05;

/** Below this many screen pixels a decoration is dropped rather than drawn. */
export const DECORATION_MIN_PX = 3;

/**
 * How much to shrink a decoration so it still fits the symbol it decorates, 0–1.
 * Zero means "draw the plain line or ring" — every decoration builder returns its
 * input path unchanged when the pattern comes out non-positive.
 *
 * A constant pixel size is right in the middle of the range and wrong at both
 * ends. Too small a shape cannot carry its own decoration — the sample gallery
 * draws areas 15 px across — and the same is true of a full-size graphic seen
 * from far enough out, which is the case this exists for.
 *
 * The rule is deliberately about the *shape*, not the zoom. A graphic 120 px
 * across needs the same treatment whether it got that way by being drawn small or
 * by the user zooming out, and a resolution threshold would only catch the second.
 */
export function decorationScale(path: ProjectedPosition[], closed: boolean, resolution: number, heightPx: number): number {
    let availablePx: number;
    if (closed) {
        const xs = path.map(p => p[0]);
        const ys = path.map(p => p[1]);
        availablePx = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / resolution;
    } else {
        availablePx = pathLength(path) / resolution;
    }
    const share = closed ? DECORATION_MAX_SHARE_CLOSED : DECORATION_MAX_SHARE_OPEN;
    const scale = Math.max(0, Math.min(1, (availablePx * share) / heightPx));

    // Below a few pixels a tooth, merlon or wave crest is not a symbol any more, it is
    // texture on the stroke — and a row of 2 px bumps reads as a fuzzy line rather than
    // as an obstacle. Drop it and let the plain geometry stand.
    return heightPx * scale < DECORATION_MIN_PX ? 0 : scale;
}

/** Obstacle-line tooth dimensions, in screen pixels before `decorationScale`. */
export const OBSTACLE_TOOTH_HEIGHT_PX = 10;
export const OBSTACLE_TOOTH_BASE_PX = 10;
export const OBSTACLE_TOOTH_GAP_PX = 10;

/** An obstacle line's tooth size, in projected metres, at the current resolution. */
export function obstacleToothSize(path: ProjectedPosition[], closed: boolean, resolution: number) {
    const scale = decorationScale(path, closed, resolution, OBSTACLE_TOOTH_HEIGHT_PX);
    return {
        heightMap: OBSTACLE_TOOTH_HEIGHT_PX * scale * resolution,
        baseMap: OBSTACLE_TOOTH_BASE_PX * scale * resolution,
        gapMap: OBSTACLE_TOOTH_GAP_PX * scale * resolution,
        heightPx: OBSTACLE_TOOTH_HEIGHT_PX * scale,
    };
}

/**
 * Walks a path adding triangular teeth along it, returning one continuous
 * polyline that includes both the baseline and the teeth.
 *
 * `side` is `'up'`, or ±1 to force a side. **`'up'` is decided per segment from
 * the segment's own x-direction, not from its direction of travel.** A closed
 * ring has an inside and an outside; an open line has neither, so the only stable
 * choice is the one the map defines. Picking a side of travel is what made the
 * same line drawn right-to-left come out with its teeth on the other side.
 */
export function crenellatedPath(
    path: ProjectedPosition[],
    heightMap: number,
    baseMap: number,
    gapMap: number,
    side: number | 'up',
): ProjectedPosition[] {
    if (path.length < 2 || baseMap <= 0) return path;
    const out: ProjectedPosition[] = [];
    const unit = baseMap + gapMap;
    let nextToothAt = gapMap / 2;

    for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        out.push(a);

        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const length = Math.hypot(dx, dy);
        if (length === 0) continue;

        const ux = dx / length;
        const uy = dy / length;
        const sideSign = side === 'up' ? (ux >= 0 ? 1 : -1) : side;
        const nx = -uy * sideSign;
        const ny = ux * sideSign;

        while (nextToothAt + baseMap <= length) {
            const p1: ProjectedPosition = [a[0] + ux * nextToothAt, a[1] + uy * nextToothAt];
            const p2: ProjectedPosition = [a[0] + ux * (nextToothAt + baseMap), a[1] + uy * (nextToothAt + baseMap)];
            out.push(
                p1,
                [(p1[0] + p2[0]) / 2 + nx * heightMap, (p1[1] + p2[1]) / 2 + ny * heightMap],
                p2,
            );
            nextToothAt += unit;
        }
        nextToothAt = Math.max(0, nextToothAt - length);
    }
    out.push(path[path.length - 1]);
    return out;
}

/** Smallest angle between two directions, in radians — always in [0, π]. */
export function angleBetween(a: number, b: number): number {
    const d = Math.abs(a - b) % (2 * Math.PI);
    return d > Math.PI ? 2 * Math.PI - d : d;
}

/**
 * Trims the end of one arc that runs into a label, back to `halfGap` radians
 * clear of the label axis. Whichever end is nearer the axis is the one cut, so
 * this works for an arc that approaches the label from either side.
 *
 * The cut lands **exactly** on the gap edge rather than on the nearest sample:
 * the generator's arcs are 100 points over 160°, and at a large radius one 1.6°
 * step is several pixels — enough for the two sides of the gap to look uneven.
 *
 * Angles are measured about the projected centre, and radii are never assumed: a
 * geodesic circle is not quite a circle in EPSG:3857, so anything that
 * reconstructed a point from the graphic's size would drift off the drawn arc.
 */
export function cutArcAtLabel(
    points: ProjectedPosition[],
    centre: ProjectedPosition,
    axis: number,
    halfGap: number,
): ProjectedPosition[] {
    if (points.length < 2) return points;
    const angleAt = (p: ProjectedPosition) => Math.atan2(p[1] - centre[1], p[0] - centre[0]);
    const clearance = (p: ProjectedPosition) => angleBetween(angleAt(p), axis);

    const fromStart = clearance(points[0]) <= clearance(points[points.length - 1]);
    const seq = fromStart ? points : [...points].reverse();

    let i = 0;
    while (i < seq.length && clearance(seq[i]) < halfGap) i++;
    if (i === 0) return points;        // already clear of the label
    if (i >= seq.length) return [];    // the whole arc is inside the gap

    const before = clearance(seq[i - 1]);
    const after = clearance(seq[i]);
    const t = after > before ? (halfGap - before) / (after - before) : 0;
    const edge: ProjectedPosition = [
        seq[i - 1][0] + t * (seq[i][0] - seq[i - 1][0]),
        seq[i - 1][1] + t * (seq[i][1] - seq[i - 1][1]),
    ];
    const kept: ProjectedPosition[] = [edge, ...seq.slice(i)];
    return fromStart ? kept : kept.reverse();
}

/**
 * Screen rotation for text laid along a segment, kept upright.
 *
 * Two frames meet here and the sign is easy to get wrong: map-space angles run
 * counter-clockwise from east, screen rotations run clockwise because the y-axis
 * is flipped. Hence the negation, and then the π flip that stops a label reading
 * upside down on a westward segment.
 */
export function uprightRotation(from: ProjectedPosition, to: ProjectedPosition): number {
    let rotation = -Math.atan2(to[1] - from[1], to[0] - from[0]);
    if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
    if (rotation > Math.PI) rotation -= 2 * Math.PI;
    return rotation;
}

/**
 * Offsets an anchor perpendicular to a segment, on the side that is **up on
 * screen**, by a constant number of pixels.
 *
 * "Up" is normalised against the map's north rather than taken from the
 * segment's direction of travel: a counter-clockwise perpendicular flips when the
 * same line is drawn right-to-left, which put every label below the line instead
 * of above it. A vertical segment has no up side, so the tie breaks east.
 *
 * The offset is `px × resolution`, so it is a constant screen distance at every
 * zoom — the house rule for anything that has to clear a glyph.
 */
export function offsetAbove(
    anchor: ProjectedPosition,
    a: ProjectedPosition,
    b: ProjectedPosition,
    resolution: number,
    offsetPx: number,
): ProjectedPosition {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return anchor;

    let nx = -dy / len;
    let ny = dx / len;
    if (ny < 0 || (ny === 0 && nx < 0)) {
        nx = -nx;
        ny = -ny;
    }
    const offsetMap = offsetPx * Math.abs(resolution);
    return [anchor[0] + nx * offsetMap, anchor[1] + ny * offsetMap];
}

/** The mirror of {@link offsetAbove} through the anchor — the same distance, below. */
export function offsetBelow(
    anchor: ProjectedPosition,
    a: ProjectedPosition,
    b: ProjectedPosition,
    resolution: number,
    offsetPx: number,
): ProjectedPosition {
    const [x, y] = offsetAbove(anchor, a, b, resolution, offsetPx);
    return [2 * anchor[0] - x, 2 * anchor[1] - y];
}

/** Which way a ring winds. Decides which perpendicular points out of it. */
export function ringIsClockwise(ring: ProjectedPosition[]): boolean {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        sum += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
    }
    return sum > 0;
}

/** The point and unit direction `distance` along a path. */
export function pathPointAt(path: ProjectedPosition[], distance: number): {point: ProjectedPosition; dir: ProjectedPosition} {
    let remaining = Math.max(0, distance);
    for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length === 0) continue;
        const dir: ProjectedPosition = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
        if (remaining <= length) {
            return {point: [a[0] + dir[0] * remaining, a[1] + dir[1] * remaining], dir};
        }
        remaining -= length;
    }
    const a = path[path.length - 2];
    const b = path[path.length - 1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return {point: b, dir: [(b[0] - a[0]) / length, (b[1] - a[1]) / length]};
}

/** Which perpendicular of a direction reads as "up" on screen. */
export function upSign(dir: ProjectedPosition): number {
    return dir[0] >= 0 ? 1 : -1;
}

/**
 * Teeth around a closed ring, on the side asked for.
 *
 * **`outward` is a property of the ring, not of the order its corners were
 * clicked.** A ring drawn anticlockwise has its outside on the other hand from one
 * drawn clockwise, so the winding is measured and the side sign derived from it —
 * without that, the same area drawn the other way round grows its teeth inward.
 */
export function obstacleRing(ring: ProjectedPosition[], resolution: number, outward: boolean): ProjectedPosition[] {
    const {heightMap, baseMap, gapMap} = obstacleToothSize(ring, true, resolution);
    if (heightMap <= 0) return ring;
    const outwardIsLeft = ringIsClockwise(ring);
    const sideSign = outward === outwardIsLeft ? 1 : -1;
    return crenellatedPath(ring, heightMap, baseMap, gapMap, sideSign);
}

/** Square merlon dimensions, in screen pixels before `decorationScale`. */
export const FORTIFIED_MERLON_PX = 15;
export const FORTIFIED_CRENEL_PX = 15;
export const FORTIFIED_HEIGHT_PX = 11;

/**
 * Square battlements standing off a path — the fortified line and area.
 *
 * Unlike {@link crenellatedPath}, which walks each segment independently, this
 * distributes a **whole number** of merlons over the path's total length and
 * stretches the spacing to fit. A closed ring has to come back to where it
 * started, so a pattern that simply repeats at a fixed pitch leaves a ragged
 * partial merlon at the join.
 */
export function castellatedPath(
    path: ProjectedPosition[],
    merlonMap: number,
    crenelMap: number,
    heightMap: number,
    side: number | 'up',
): ProjectedPosition[] {
    const total = pathLength(path);
    const pattern = merlonMap + crenelMap;
    if (path.length < 2 || pattern <= 0 || total < pattern) return path;

    const count = Math.max(1, Math.round(total / pattern));
    const spacing = total / count;
    const merlon = spacing * (merlonMap / pattern);

    const out: ProjectedPosition[] = [path[0]];
    for (let i = 0; i < count; i++) {
        const startAt = i * spacing + (spacing - merlon) / 2;
        const left = pathPointAt(path, startAt);
        const right = pathPointAt(path, startAt + merlon);
        const sign = side === 'up' ? upSign(left.dir) : side;
        const ln: ProjectedPosition = [-left.dir[1] * sign, left.dir[0] * sign];
        const rn: ProjectedPosition = [-right.dir[1] * sign, right.dir[0] * sign];
        out.push(
            left.point,
            [left.point[0] + ln[0] * heightMap, left.point[1] + ln[1] * heightMap],
            [right.point[0] + rn[0] * heightMap, right.point[1] + rn[1] * heightMap],
            right.point,
        );
    }
    out.push(path[path.length - 1]);
    return out;
}

/** A fortified ring's merlons, sized against the shape at this resolution. */
export function fortifiedRing(ring: ProjectedPosition[], resolution: number): ProjectedPosition[] {
    const scale = decorationScale(ring, true, resolution, FORTIFIED_HEIGHT_PX);
    if (scale <= 0) return ring;
    return castellatedPath(
        ring,
        FORTIFIED_MERLON_PX * scale * resolution,
        FORTIFIED_CRENEL_PX * scale * resolution,
        FORTIFIED_HEIGHT_PX * scale * resolution,
        ringIsClockwise(ring) ? 1 : -1,
    );
}

/** Miter ceiling, so a hairpin bend pinches rather than growing a spike. */
const MAX_MITER = 4;

/**
 * A true parallel of `path`, `d` metres to its left (negative for its right).
 *
 * Offsets each vertex along the **bisector** of its two segments, lengthened by
 * `1 / cos(half-angle)` — the standard miter. Taking the direction *at* the vertex
 * instead (which is one of the two adjoining segments) makes the two sides stop
 * being parallel on a bend: the under-wire and over-wire of a high wire fence
 * visibly splay apart.
 *
 * The miter is capped because at a hairpin `1 / cos(half-angle)` runs away to
 * infinity, and an uncapped spike looks worse than a slightly pinched corner.
 */
export function parallelPath(path: ProjectedPosition[], d: number): ProjectedPosition[] {
    if (!d || path.length < 2) return path;

    const normals: ProjectedPosition[] = [];
    for (let i = 0; i + 1 < path.length; i++) {
        const dx = path[i + 1][0] - path[i][0];
        const dy = path[i + 1][1] - path[i][1];
        const len = Math.hypot(dx, dy) || 1;
        normals.push([-dy / len, dx / len]);
    }

    return path.map((p, i) => {
        const a = normals[Math.max(i - 1, 0)];
        const b = normals[Math.min(i, normals.length - 1)];
        const mx = a[0] + b[0];
        const my = a[1] + b[1];
        const m = Math.hypot(mx, my);
        // Doubling back on itself: no bisector to speak of, so take the segment normal.
        if (m < 1e-9) return [p[0] + a[0] * d, p[1] + a[1] * d] as ProjectedPosition;
        // |a| = |b| = 1, so |a + b| = 2 cos(half-angle) and the miter factor is 2 / |a + b|.
        const miter = Math.min(2 / m, MAX_MITER);
        return [p[0] + (mx / m) * d * miter, p[1] + (my / m) * d * miter] as ProjectedPosition;
    });
}

/**
 * The point `dist` metres along `path`, with the unit tangent there.
 *
 * `null` past the end, rather than clamping to the last vertex — a caller walking a
 * repeating pattern uses that to know when to stop, and a clamped point would stack
 * every remaining mark on the final vertex.
 */
export function walkPath(path: ProjectedPosition[], dist: number): {point: ProjectedPosition; tangent: ProjectedPosition} | null {
    let acc = 0;
    for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i];
        const b = path[i + 1];
        const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (seg === 0) continue;
        if (acc + seg >= dist) {
            const t = (dist - acc) / seg;
            return {
                point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
                tangent: [(b[0] - a[0]) / seg, (b[1] - a[1]) / seg],
            };
        }
        acc += seg;
    }
    return null;
}
