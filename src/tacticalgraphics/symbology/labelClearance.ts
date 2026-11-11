/**
 * # Keeping labels clear of each other, across a whole map
 *
 * `PaintContext.avoid` and `avoidLines` let one graphic's labels slide clear of what is already
 * on the map. This module is the pass that fills them: every graphic's line work near the view is
 * collected first, then the graphics are painted in order, each told which label boxes the ones
 * before it hold and which lines are not its own, and its own labels are added to the boxes for
 * the next. Every engine runs the same pass, so a crowded view settles the same way on each.
 * @see PaintContext.avoid
 * @see PaintContext.avoidLines
 */

import type {Paint, PaintContext, PaintFeature, ProjectedBounds, ProjectedPosition} from '../core/paint';
import {paintGeometryMembers} from '../core/paint';
import {getAutoPlaceLabels} from '../core/config';

/** Screen pixels left around a label's box, so two labels never touch. */
const LABEL_BOX_PAD_PX = 3;

/** What labels keep clear of during one pass over the map. */
export interface LabelSpace {
    /** The boxes labels placed so far hold, in projected meters. */
    boxes: ProjectedBounds[];
    /** Every graphic's line work near the view, by graphic id. */
    lines: Array<{id: string; path: ProjectedPosition[]}>;
}

/** An empty space, for the start of a pass. */
export function emptyLabelSpace(): LabelSpace {
    return {boxes: [], lines: []};
}

/** Every path in a feature's geometry: a line's coordinates, a polygon's rings. */
function pathsOf(feature: PaintFeature): ProjectedPosition[][] {
    const out: ProjectedPosition[][] = [];
    for (const geometry of paintGeometryMembers(feature.geometry)) {
        switch (geometry.type) {
            case 'LineString':
                out.push(geometry.coordinates as ProjectedPosition[]);
                break;
            case 'MultiLineString':
            case 'Polygon':
                out.push(...(geometry.coordinates as ProjectedPosition[][]));
                break;
            case 'MultiPolygon':
                for (const polygon of geometry.coordinates as ProjectedPosition[][][]) out.push(...polygon);
                break;
        }
    }
    return out;
}

/** Whether a path's box meets `view` grown by half a view on every side. */
function nearView(path: ProjectedPosition[], view: ProjectedBounds | undefined): boolean {
    if (!view) return true;
    const padX = (view.maxX - view.minX) / 2;
    const padY = (view.maxY - view.minY) / 2;
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (const [x, y] of path) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return maxX >= view.minX - padX && minX <= view.maxX + padX && maxY >= view.minY - padY && minY <= view.maxY + padY;
}

/** Adds one graphic's line work to `space`, the parts near `view` only. */
export function addGraphicLines(space: LabelSpace, id: string, feature: PaintFeature, view?: ProjectedBounds): void {
    for (const path of pathsOf(feature)) {
        if (path.length >= 2 && nearView(path, view)) space.lines.push({id, path});
    }
}

/** `context` with what the graphic `ownId` keeps its labels clear of: every box taken, every line but its own. */
export function withClearance(context: PaintContext, space: LabelSpace, ownId: string): PaintContext {
    return {
        ...context,
        avoid: space.boxes.slice(),
        avoidLines: space.lines.filter(line => line.id !== ownId).map(line => line.path),
    };
}

/**
 * The box a text paint covers, in projected meters, or null for a paint with no point text.
 * Measured with the context's own ruler and turned with the text, so the box is what the
 * renderer will draw.
 */
export function textBounds(paint: Paint, context: PaintContext): ProjectedBounds | null {
    const text = paint.text;
    if (!text || paint.geometry.type !== 'Point') return null;
    const lines = text.text.split('\n').filter(Boolean);
    if (lines.length === 0) return null;
    const scale = text.scale ?? 1;
    const size = parseFloat(/(\d*\.?\d+)px/.exec(text.font)?.[1] ?? '16') * scale;
    const width = Math.max(...lines.map(line => context.measureText(line, text.font) * scale));
    const height = size * lines.length;
    // The text's own center from its alignment and baseline, before it is turned.
    const cx = text.align === 'left' ? width / 2 : text.align === 'right' ? -width / 2 : 0;
    const cy =
        text.baseline === 'top' || text.baseline === 'hanging'
            ? height / 2
            : text.baseline === 'bottom' || text.baseline === 'alphabetic'
              ? -height / 2
              : 0;
    const r = text.rotation ?? 0;
    const [c, s] = [Math.cos(r), Math.sin(r)];
    const res = context.resolution;
    // Screen y runs down and the rotation turns with it; map y runs up.
    const dx = (cx * c - cy * s + (text.offsetXPx ?? 0)) * res;
    const dy = -(cx * s + cy * c + (text.offsetYPx ?? 0)) * res;
    const halfX = ((Math.abs(c) * width + Math.abs(s) * height) / 2 + LABEL_BOX_PAD_PX) * res;
    const halfY = ((Math.abs(s) * width + Math.abs(c) * height) / 2 + LABEL_BOX_PAD_PX) * res;
    const [x, y] = paint.geometry.coordinates as ProjectedPosition;
    return {minX: x + dx - halfX, minY: y + dy - halfY, maxX: x + dx + halfX, maxY: y + dy + halfY};
}

/** Adds the boxes a painted graphic's labels hold to `space`. */
export function takeLabels(space: LabelSpace, paints: Paint[], context: PaintContext): void {
    for (const paint of paints) {
        const box = textBounds(paint, context);
        if (box) space.boxes.push(box);
    }
}

/** One graphic to paint in a pass: its id, the feature its line work comes from, and how to paint it. */
export interface ClearanceItem<T> {
    id: string;
    feature: PaintFeature;
    item: T;
}

/**
 * Paints `items` in order with their labels kept clear of each other and of other graphics'
 * lines, returning each item's paints in the same order. `paint` is the engine's own paint call,
 * handed the context to paint with. Without a `view` on the context nothing is moved, so this
 * costs an engine that does not know its view nothing but the pass.
 */
export function paintWithClearance<T>(
    items: ClearanceItem<T>[],
    context: PaintContext,
    paint: (item: T, context: PaintContext) => Paint[],
): Paint[][] {
    if (!context.view || !getAutoPlaceLabels()) return items.map(({item}) => paint(item, context));
    const space = emptyLabelSpace();
    for (const {id, feature} of items) addGraphicLines(space, id, feature, context.view);
    return items.map(({id, item}) => {
        const own = withClearance(context, space, id);
        const paints = paint(item, own);
        takeLabels(space, paints, own);
        return paints;
    });
}
