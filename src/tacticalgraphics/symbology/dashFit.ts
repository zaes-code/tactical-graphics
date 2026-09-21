/**
 * # Dash size: scaled to the graphic, capped at the planned dash
 *
 * Every dashed line in the library, whether the dash is the symbol (a counterattack, a
 * ford) or its status (planned, suspected), is sized here on its way to a renderer.
 *
 * Before this there were two rules and both were wrong at one end. A status dash was a
 * fixed `[12, 8]` pixels, so a graphic 40 px across carried a pattern sized for one ten
 * times bigger and read as a few stubs. A symbol dash was cut into the geometry in meters,
 * so it grew with the zoom and had no ceiling at all. And on a counterattack drawn
 * planned, the two sat side by side at different sizes.
 *
 * The rule is the one repeating decorations already follow (`decorationScale`): **size
 * against the shape, cap at a screen constant**. A graphic at least `DASH_FULL_SIZE_PX`
 * across gets the full pattern and no more. Below that it shrinks, in steps, down to a
 * floor it never goes under. There is no "solid below the floor" as there is for obstacle
 * teeth: a planned line drawn solid would state the wrong status, so a dash stays a dash.
 *
 * **In steps, not continuously**, because MapLibre's `line-dasharray` is not data-driven:
 * every distinct pattern is its own layer, and a scale that moved with every zoom frame
 * would mint a layer per frame. Four steps keep the layer count a small constant.
 */

import type {Paint, PaintContext, ProjectedGeometry, StrokeSpec} from '../core/paint';
import {dashedPartsOf} from '../core/dashedParts';
import type {TacticalGraphicName} from '../core/type';

/**
 * Dash pattern, in screen pixels, for a graphic whose status is `planned`, and the full
 * size of every other dash. Declared here rather than in `paintFunctions.ts`, which
 * re-exports it, because that module imports this one.
 */
export const PLANNED_DASH_PX = [12, 8];

/** The longest dash any line in the library draws, in screen pixels: the planned dash's. */
export const DASH_CAP_PX = PLANNED_DASH_PX[0];

/**
 * How large a graphic has to be on screen, along its longer side, to carry full-size
 * dashes. At the cap that is eight periods of the planned pattern across it.
 */
export const DASH_FULL_SIZE_PX = 160;

/** The scales a dash pattern may take, largest first. The last is the floor. */
export const DASH_SCALE_STEPS: readonly number[] = [1, 0.75, 0.5, 0.25];

/** No segment of a fitted pattern is shorter than this, so a dash-dot keeps its dot. */
const MIN_SEGMENT_PX = 1;

/**
 * The dash scale for a graphic `shapePx` across on screen: 1 at `DASH_FULL_SIZE_PX` and
 * above, then down through `DASH_SCALE_STEPS`, never below the last.
 */
export function dashScale(shapePx: number): number {
    const raw = shapePx / DASH_FULL_SIZE_PX;
    for (const step of DASH_SCALE_STEPS) {
        if (raw >= step) return step;
    }
    return DASH_SCALE_STEPS[DASH_SCALE_STEPS.length - 1];
}

/**
 * `dashPx` capped so its longest segment is at most `DASH_CAP_PX`, then scaled.
 *
 * The cap keeps the pattern's own proportions, so the circled status ring's dash-dot
 * `[18, 6, 3, 6]` comes out `[12, 4, 2, 4]` and still reads as a dash-dot.
 */
export function fitDash(dashPx: readonly number[], scale: number): number[] {
    const longest = Math.max(...dashPx);
    const cap = longest > DASH_CAP_PX ? DASH_CAP_PX / longest : 1;
    return dashPx.map(segment => Math.max(MIN_SEGMENT_PX, segment * cap * scale));
}

/** Calls `visit` on every position in `geometry`, whatever its nesting. */
function eachPosition(geometry: ProjectedGeometry, visit: (x: number, y: number) => void): void {
    const walk = (node: unknown): void => {
        if (!Array.isArray(node)) return;
        if (typeof node[0] === 'number') {
            visit(node[0] as number, node[1] as number);
            return;
        }
        for (const child of node) walk(child);
    };
    const g = geometry as {coordinates?: unknown; geometries?: ProjectedGeometry[]};
    if (g.geometries) g.geometries.forEach(child => eachPosition(child, visit));
    else walk(g.coordinates);
}

/**
 * The longer side, in screen pixels, of the extent of everything a graphic strokes or
 * fills. Text anchors are left out: a label is not the shape its dashes have to fit.
 */
export function strokedExtentPx(paints: readonly Paint[], resolution: number): number {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const paint of paints) {
        if (!paint.stroke && !paint.fill) continue;
        eachPosition(paint.geometry, (x, y) => {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        });
    }
    if (!(maxX >= minX) || !(resolution > 0)) return 0;
    return Math.max(maxX - minX, maxY - minY) / resolution;
}

/**
 * Every dashed stroke in `paints`, fitted to the graphic they draw.
 *
 * **One scale for the whole list**, measured off all of it, so a graphic never carries two
 * dash sizes: a planned counterattack's outline and its status dash come out the same.
 * Applied by each renderer at the one place its paints pass through, beside
 * `withHiddenAmplifiers`. Idempotent only in the sense that it is meant to run once; a
 * second pass would shrink the dashes again.
 */
export function withFittedDashes(paints: Paint[], context: PaintContext): Paint[] {
    if (!paints.some(paint => paint.stroke?.dashPx?.length)) return paints;
    const scale = dashScale(strokedExtentPx(paints, context.resolution));
    return paints.map(paint => {
        const dashPx = paint.stroke?.dashPx;
        if (!dashPx?.length) return paint;
        // A mark that sized its own dash keeps it, capped. @see StrokeSpec.dashSized
        return {...paint, stroke: {...paint.stroke!, dashPx: fitDash(dashPx, paint.stroke!.dashSized ? 1 : scale)}};
    });
}

/**
 * Strokes the parts of a graphic's line work, dashing the ones `DASHED_PARTS` names.
 *
 * `parts` are the generated `MultiLineString`'s lines from index `firstIndex` on, so a
 * paint that has already drawn the first few itself can hand over the rest. Returns at
 * most two marks, one solid and one dashed, each dropped when it would be empty.
 * @see DASHED_PARTS
 */
export function strokeParts(
    name: TacticalGraphicName | string,
    parts: ProjectedPositionLines,
    stroke: StrokeSpec,
    firstIndex = 0,
): Paint[] {
    const dashed = dashedPartsOf(name);
    if (!dashed.length) return parts.length ? [{geometry: {type: 'MultiLineString', coordinates: parts}, stroke}] : [];

    const solid: ProjectedPositionLines = [];
    const broken: ProjectedPositionLines = [];
    parts.forEach((part, i) => (dashed.includes(i + firstIndex) ? broken : solid).push(part));

    const out: Paint[] = [];
    if (solid.length) out.push({geometry: {type: 'MultiLineString', coordinates: solid}, stroke});
    if (broken.length) {
        out.push({geometry: {type: 'MultiLineString', coordinates: broken}, stroke: {...stroke, dashPx: [...PLANNED_DASH_PX]}});
    }
    return out;
}

type ProjectedPositionLines = [number, number][][];
