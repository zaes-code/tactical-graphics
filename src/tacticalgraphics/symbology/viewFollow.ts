import type {PaintContext, ProjectedBounds, ProjectedPosition} from '../core/paint';

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
