import type {PaintContext, PaintFeature, ProjectedBounds, ProjectedPosition} from '../core/paint';
import {distanceAlongPath} from './curvedText';

/**
 * How far, in screen pixels, a label moved onto the view keeps clear of its edge.
 *
 * Enough that the first glyph is not cut by the map's border, and small enough that the
 * label still reads as belonging to the line that leaves the screen there.
 */
export const VIEW_EDGE_INSET_PX = 16;

/** The view shrunk by `px` screen pixels on every side, or `undefined` when nothing is left of it. */
export function insetView(context: PaintContext, px: number = VIEW_EDGE_INSET_PX): ProjectedBounds | undefined {
    const view = context.view;
    if (!view) return undefined;
    const d = px * context.resolution;
    const inset = {minX: view.minX + d, minY: view.minY + d, maxX: view.maxX - d, maxY: view.maxY - d};
    return inset.minX < inset.maxX && inset.minY < inset.maxY ? inset : undefined;
}

/** Whether `p` lies inside `view`, edges included. */
export function inView(p: ProjectedPosition, view: ProjectedBounds): boolean {
    return p[0] >= view.minX && p[0] <= view.maxX && p[1] >= view.minY && p[1] <= view.maxY;
}

/** The part of segment `a`→`b` inside `view` (Liang–Barsky), or `undefined` when it misses. */
function clipSegment(a: ProjectedPosition, b: ProjectedPosition, view: ProjectedBounds): [ProjectedPosition, ProjectedPosition] | undefined {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    let t0 = 0;
    let t1 = 1;
    const edges: [number, number][] = [
        [-dx, a[0] - view.minX],
        [dx, view.maxX - a[0]],
        [-dy, a[1] - view.minY],
        [dy, view.maxY - a[1]],
    ];
    for (const [p, q] of edges) {
        if (p === 0) {
            if (q < 0) return undefined;
            continue;
        }
        const r = q / p;
        if (p < 0) {
            if (r > t1) return undefined;
            if (r > t0) t0 = r;
        } else {
            if (r < t0) return undefined;
            if (r < t1) t1 = r;
        }
    }
    const at = (t: number): ProjectedPosition => [a[0] + dx * t, a[1] + dy * t];
    return [t0 === 0 ? a : at(t0), t1 === 1 ? b : at(t1)];
}

function length(path: ProjectedPosition[]): number {
    let total = 0;
    for (let i = 1; i < path.length; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    return total;
}

/**
 * The longest unbroken run of `path` inside `view`, cut where it crosses the view's edge,
 * in the path's own direction. `undefined` when no part of the path is inside.
 *
 * A line that leaves the view and comes back has several runs; the longest is the one a
 * label has the most room on, and so the one an operator reads as "the line".
 */
export function visibleStretch(path: ProjectedPosition[], view: ProjectedBounds): ProjectedPosition[] | undefined {
    const runs: ProjectedPosition[][] = [];
    let run: ProjectedPosition[] | undefined;
    for (let i = 0; i < path.length - 1; i++) {
        const clipped = clipSegment(path[i], path[i + 1], view);
        if (!clipped) {
            run = undefined;
            continue;
        }
        const [from, to] = clipped;
        // A segment continues the current run only when it was not cut where it starts.
        if (run && from === path[i]) {
            run.push(to);
        } else {
            run = [from, to];
            runs.push(run);
        }
        if (to !== path[i + 1]) run = undefined;
    }
    let best: ProjectedPosition[] | undefined;
    let bestLength = 0;
    for (const r of runs) {
        const l = length(r);
        if (l > bestLength) {
            best = r;
            bestLength = l;
        }
    }
    return best;
}

/** `path` from its start up to `point`, which is assumed to lie on it. */
export function pathUpTo(path: ProjectedPosition[], point: ProjectedPosition): ProjectedPosition[] {
    let best = 0;
    let bestDistance = Infinity;
    let bestT = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const [a, b] = [path[i], path[i + 1]];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
        const d = Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
        if (d < bestDistance) {
            bestDistance = d;
            best = i;
            bestT = t;
        }
    }
    const kept = path.slice(0, best + 1);
    if (bestT > 0) kept.push(point);
    return kept;
}

/**
 * The point `s` along `path`, clamped to its ends, with the segment it falls on — the
 * direction a label laid there reads along.
 */
export function pointAlong(path: ProjectedPosition[], s: number): {at: ProjectedPosition; from: ProjectedPosition; to: ProjectedPosition} {
    let walked = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const [a, b] = [path[i], path[i + 1]];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (walked + len >= s || i === path.length - 2) {
            const t = len === 0 ? 0 : Math.max(0, Math.min(1, (s - walked) / len));
            return {at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], from: a, to: b};
        }
        walked += len;
    }
    return {at: path[0], from: path[0], to: path[path.length - 1]};
}

/** Whether `p` lies inside the polygon `ring` (even-odd rule). */
export function inRing(p: ProjectedPosition, ring: ProjectedPosition[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [a, b] = [ring[i], ring[j]];
        if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
}

/** The part of the polygon `ring` inside `view` (Sutherland–Hodgman), empty when none of it is. */
export function clipRing(ring: ProjectedPosition[], view: ProjectedBounds): ProjectedPosition[] {
    const edges: [(p: ProjectedPosition) => boolean, (a: ProjectedPosition, b: ProjectedPosition) => ProjectedPosition][] = [
        [p => p[0] >= view.minX, (a, b) => [view.minX, a[1] + ((b[1] - a[1]) * (view.minX - a[0])) / (b[0] - a[0])]],
        [p => p[0] <= view.maxX, (a, b) => [view.maxX, a[1] + ((b[1] - a[1]) * (view.maxX - a[0])) / (b[0] - a[0])]],
        [p => p[1] >= view.minY, (a, b) => [a[0] + ((b[0] - a[0]) * (view.minY - a[1])) / (b[1] - a[1]), view.minY]],
        [p => p[1] <= view.maxY, (a, b) => [a[0] + ((b[0] - a[0]) * (view.maxY - a[1])) / (b[1] - a[1]), view.maxY]],
    ];
    let out = ring;
    for (const [keeps, cross] of edges) {
        const input = out;
        out = [];
        for (let i = 0; i < input.length; i++) {
            const [a, b] = [input[(i + input.length - 1) % input.length], input[i]];
            if (keeps(b)) {
                if (!keeps(a)) out.push(cross(a, b));
                out.push(b);
            } else if (keeps(a)) {
                out.push(cross(a, b));
            }
        }
        if (!out.length) return [];
    }
    return out;
}

/**
 * A point well inside `ring`: the middle of the widest span across it at the height of its
 * centroid, which stays inside a concave ring where the centroid itself may not.
 */
function interiorPoint(ring: ProjectedPosition[]): ProjectedPosition | undefined {
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
        area += cross;
        cx += (ring[j][0] + ring[i][0]) * cross;
        cy += (ring[j][1] + ring[i][1]) * cross;
    }
    if (area === 0) return undefined;
    const y = cy / (3 * area);
    const xs: number[] = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [a, b] = [ring[j], ring[i]];
        if (a[1] > y !== b[1] > y) xs.push(a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    let best: ProjectedPosition | undefined;
    let widest = 0;
    for (let i = 0; i + 1 < xs.length; i += 2) {
        if (xs[i + 1] - xs[i] > widest) {
            widest = xs[i + 1] - xs[i];
            best = [(xs[i] + xs[i + 1]) / 2, y];
        }
    }
    return best ?? [cx / (3 * area), y];
}

/**
 * An area's label feature with its anchor moved into the visible part of the area, when the
 * anchor is off screen and some of the area is on it.
 *
 * Only a label that sits inside its area moves: one hung outside the outline is placed against
 * the shape on purpose. Returned unchanged when the context carries no view.
 */
export function areaLabelInView(feature: PaintFeature, context: PaintContext): PaintFeature {
    const view = insetView(context);
    const ring = feature.ring;
    if (!view || !ring || ring.length < 3 || feature.geometry.type !== 'Point') return feature;
    const at = feature.geometry.coordinates;
    if (inView(at, view) || !inRing(at, ring)) return feature;
    const visible = clipRing(ring, view);
    const moved = visible.length >= 3 ? interiorPoint(visible) : undefined;
    return moved ? {...feature, geometry: {type: 'Point', coordinates: moved}} : feature;
}

/**
 * A line's mid-label position `{index, t}`, moved to the middle of the line's visible stretch
 * when the line's own middle is off screen. Unchanged when the context carries no view, when the
 * middle is on screen, or when none of the line is.
 */
export function midSegmentInView(coords: ProjectedPosition[], mid: {index: number; t: number}, context: PaintContext): {index: number; t: number} {
    const view = insetView(context);
    if (!view) return mid;
    const [a, b] = [coords[mid.index], coords[mid.index + 1] ?? coords[mid.index]];
    if (inView([a[0] + (b[0] - a[0]) * mid.t, a[1] + (b[1] - a[1]) * mid.t], view)) return mid;
    const stretch = visibleStretch(coords, view);
    if (!stretch) return mid;
    let s = distanceAlongPath(coords, stretch[0]) + length(stretch) / 2;
    for (let i = 0; i < coords.length - 1; i++) {
        const len = Math.hypot(coords[i + 1][0] - coords[i][0], coords[i + 1][1] - coords[i][1]);
        if (s <= len || i === coords.length - 2) return {index: i, t: len === 0 ? 0 : Math.max(0, Math.min(1, s / len))};
        s -= len;
    }
    return mid;
}
