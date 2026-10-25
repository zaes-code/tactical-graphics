/**
 * # Text that bends with its line
 *
 * A label laid along an arrow used to be one straight run of text turned to the segment it
 * was anchored on. That holds while the label fits on that segment. A name and two date-time
 * groups do not, and past the segment's end the text kept going straight while the arrow
 * turned, so it ran out through the wall. Smooth lines made it common, since a rounded arrow
 * has no long straight segment left except the one under its head. (User, 2026-10-23: labels
 * never leave the graphic, and follow the curve.)
 *
 * **Glyph by glyph, as point text, so every engine draws it the same.** OpenLayers and MapLibre
 * can each lay text along a line, but differently, and both refuse one that does not fit;
 * Cesium and ArcGIS cannot bend text at all. A run of single characters, each standing on the
 * path and turned to it, is something all four already draw.
 */

import type {Paint, PaintContext, ProjectedPosition, TextSpec} from '../core/paint';

/** Where the run sits on the path: from `at` onward, back from `at`, or centered on it. */
export type PathTextAlign = 'start' | 'end' | 'center';

interface Walk {
    points: ProjectedPosition[];
    /** Distance along the path to each point, in map units. */
    distances: number[];
    length: number;
}

function walk(path: ProjectedPosition[]): Walk {
    const distances = [0];
    for (let i = 1; i < path.length; i++) {
        distances.push(distances[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    }
    return {points: path, distances, length: distances[distances.length - 1]};
}

function segmentAt(w: Walk, s: number): number {
    for (let i = 1; i < w.distances.length; i++) if (s <= w.distances[i]) return i - 1;
    return w.distances.length - 2;
}

function pointAt(w: Walk, s: number): ProjectedPosition {
    const clamped = Math.max(0, Math.min(w.length, s));
    const i = segmentAt(w, clamped);
    const span = w.distances[i + 1] - w.distances[i];
    const t = span === 0 ? 0 : (clamped - w.distances[i]) / span;
    const [a, b] = [w.points[i], w.points[i + 1]];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** How far along the path the point nearest `p` lies. */
export function distanceAlongPath(path: ProjectedPosition[], p: ProjectedPosition): number {
    const w = walk(path);
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
        const [a, b] = [path[i], path[i + 1]];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared));
        const d = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
        if (d < bestDistance) {
            bestDistance = d;
            best = w.distances[i] + t * Math.sqrt(lengthSquared);
        }
    }
    return best;
}

/**
 * The run of text along `path`, or `undefined` when the caller's own straight label is right:
 * the run lies on one segment of the path, where a straight label already follows it.
 *
 * `path` is in map units and runs the way the graphic does; `at` is a distance along it, and
 * `align` says which end of the run sits there. The text reads left to right on screen whichever
 * way the path runs. A run longer than the whole path is shrunk to fit it, which is what lets the
 * legibility floor take it away on a short arrow rather than letting it overhang.
 *
 * Halos are painted in a pass of their own, before any glyph. One label drawn as one string
 * gets that for free; drawn as many, each glyph's halo would otherwise cover the edge of the
 * one before it.
 */
export function textAlongPath(
    path: ProjectedPosition[],
    at: number,
    align: PathTextAlign,
    spec: TextSpec,
    context: PaintContext,
): Paint[] | undefined {
    if (path.length < 2 || !spec.text) return undefined;
    const w = walk(path);
    if (w.length === 0) return undefined;

    let scale = spec.scale ?? 1;
    const chars = Array.from(spec.text);
    const widthsAt1 = chars.map(c => context.measureText(c, spec.font) * context.resolution);
    const totalAt1 = widthsAt1.reduce((sum, x) => sum + x, 0);
    if (totalAt1 <= 0) return undefined;
    if (totalAt1 * scale > w.length) scale = w.length / totalAt1;
    const total = totalAt1 * scale;

    const wanted = align === 'start' ? at : align === 'end' ? at - total : at - total / 2;
    const start = Math.max(0, Math.min(w.length - total, wanted));
    const end = start + total;
    if (start === wanted && scale === (spec.scale ?? 1) && segmentAt(w, start) === segmentAt(w, end)) return undefined;

    // Left to right on screen: the run is read from whichever end lies further west.
    const forward = pointAt(w, end)[0] >= pointAt(w, start)[0];
    const halos: Paint[] = [];
    const glyphs: Paint[] = [];
    let offset = 0;
    for (let i = 0; i < chars.length; i++) {
        const width = widthsAt1[i] * scale;
        const middle = forward ? start + offset + width / 2 : end - offset - width / 2;
        offset += width;
        if (!chars[i].trim()) continue;

        // Turned to the chord the glyph spans rather than to one segment, so a glyph sitting on
        // a vertex of the rounded path takes the curve's direction there.
        const a = pointAt(w, middle - width / 2);
        const b = pointAt(w, middle + width / 2);
        const [dx, dy] = forward ? [b[0] - a[0], b[1] - a[1]] : [a[0] - b[0], a[1] - b[1]];
        const glyph: TextSpec = {...spec, text: chars[i], scale, rotation: -Math.atan2(dy, dx), align: 'center', baseline: 'middle', glyph: true};
        const geometry = {type: 'Point' as const, coordinates: pointAt(w, middle)};
        // A transparent fill, not the halo's color: MapLibre sorts overlapping symbols by their
        // place on screen, so a halo glyph can be drawn after a letter, and a filled one hides it.
        if (spec.halo) halos.push({geometry, text: {...glyph, fill: 'rgba(0,0,0,0)'}});
        glyphs.push({geometry, text: {...glyph, halo: undefined}});
    }
    return [...halos, ...glyphs];
}
