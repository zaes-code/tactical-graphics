import type {Paint, ProjectedGeometry, ProjectedPosition, StrokeSpec, TextSpec} from '@zaes/tactical-graphics';
import {toScreen, type ViewTransform} from '../projection';

/**
 * # Path A — painting a paint list onto a 2D canvas
 *
 * The imperative consumer. It takes the marks a paint function returned and draws
 * them, which is what OpenLayers' renderer does with a `Style` and what makes the
 * two comparable at all.
 *
 * Everything here is mechanical, and that is the point of measuring it: the whole
 * of path A's per-mark cost is this file, so if a decoration can be *described*
 * as a paint list it can be drawn, with no per-graphic work. Contrast
 * `../native/`, where every mark has to become a layer some declarative engine
 * can evaluate.
 *
 * The canvas is a plain overlay above MapLibre's WebGL canvas, so this is
 * CPU-rasterised. That is path A's headline cost — no GPU labelling and no
 * collision detection — and its headline benefit: `ctx.measureText` is the same
 * ruler the gap math used, so a hole and the glyph in it cannot drift apart.
 */

/**
 * Applies a paint list's `scale` by rewriting the font's px size.
 *
 * Canvas has no text-scale of its own, and `ctx.scale()` is the wrong tool — it
 * would scale the halo's stroke width with the glyph, so a large label would wear
 * a thick halo and a small one a hairline. OpenLayers' `Text.scale` behaves the
 * way this does.
 *
 * Falls back to the unscaled font if the string carries no `NNpx`, which is only
 * reachable if a caller invents a font shorthand using another unit.
 */
function scaledFont(font: string, scale: number): string {
    if (scale === 1) return font;
    return font.replace(/(\d*\.?\d+)px/, (_, px: string) => `${parseFloat(px) * scale}px`);
}

function applyStroke(ctx: CanvasRenderingContext2D, stroke: StrokeSpec): void {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.widthPx;
    ctx.lineCap = stroke.cap ?? 'round';
    ctx.lineJoin = stroke.join ?? 'round';
    ctx.setLineDash(stroke.dashPx ?? []);
}

/** Traces a geometry onto the current path, in canvas pixels. */
function tracePath(ctx: CanvasRenderingContext2D, geometry: ProjectedGeometry, view: ViewTransform): void {
    const line = (coords: ProjectedPosition[], close: boolean) => {
        if (coords.length < 2) return;
        coords.forEach((position, i) => {
            const [x, y] = toScreen(position, view);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        if (close) ctx.closePath();
    };

    switch (geometry.type) {
        case 'LineString':
            line(geometry.coordinates, false);
            break;
        case 'MultiLineString':
            geometry.coordinates.forEach(part => line(part, false));
            break;
        case 'Polygon':
            geometry.coordinates.forEach(ring => line(ring, true));
            break;
        case 'MultiPolygon':
            geometry.coordinates.forEach(poly => poly.forEach(ring => line(ring, true)));
            break;
        case 'Point':
        case 'MultiPoint':
            // Nothing to trace — a point is drawn by its `circle` or `text` mark.
            break;
    }
}

/** Every anchor a point-ish geometry offers, for text and circle marks. */
function anchorsOf(geometry: ProjectedGeometry): ProjectedPosition[] {
    if (geometry.type === 'Point') return [geometry.coordinates];
    if (geometry.type === 'MultiPoint') return geometry.coordinates;
    // A text mark on a line anchors at the line's first vertex — the paint
    // functions all place their labels on an explicit Point, so this is a
    // fallback rather than a layout rule.
    if (geometry.type === 'LineString') return geometry.coordinates.slice(0, 1);
    return [];
}

/**
 * Draws one text mark at one anchor.
 *
 * **Offsets are applied in the rotated frame**, i.e. `translate → rotate →
 * fillText(offsetX, offsetY)`. That is what makes "8 px past the end of the line"
 * mean *along the line* rather than due east, which is what the phase-line label
 * wants. The upright flip in `uprightRotation` is why the paint functions still
 * have to test which way the segment runs: after the flip, local +x is always
 * screen-rightish, so a westward line needs its offset negated.
 *
 * The halo is stroked before the fill and with `lineJoin: 'round'`, or the miter
 * spikes on tight glyph corners show through as whiskers.
 */
function drawText(ctx: CanvasRenderingContext2D, spec: TextSpec, at: ProjectedPosition, view: ViewTransform): void {
    const [x, y] = toScreen(at, view);
    const font = scaledFont(spec.font, spec.scale ?? 1);

    ctx.save();
    ctx.translate(x, y);
    if (spec.rotation) ctx.rotate(spec.rotation);

    ctx.font = font;
    ctx.textAlign = spec.align ?? 'center';
    ctx.textBaseline = spec.baseline ?? 'middle';
    ctx.setLineDash([]);

    const dx = spec.offsetXPx ?? 0;
    const dy = spec.offsetYPx ?? 0;

    if (spec.halo && spec.halo.widthPx > 0) {
        ctx.lineWidth = spec.halo.widthPx;
        ctx.strokeStyle = spec.halo.color;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeText(spec.text, dx, dy);
    }

    ctx.fillStyle = spec.fill;
    ctx.fillText(spec.text, dx, dy);
    ctx.restore();
}

/**
 * Draws a whole paint list.
 *
 * Sorted by `zIndex` before drawing, with a **stable** sort — marks without one
 * keep their emitted order, which is the order a paint function chose. Handles
 * carry `HANDLE_Z_INDEX` so they land last: a handle you cannot see is a handle
 * you cannot use.
 */
export function paintToCanvas(ctx: CanvasRenderingContext2D, paints: Paint[], view: ViewTransform): void {
    const ordered = paints
        .map((paint, index) => ({paint, index}))
        .sort((a, b) => ((a.paint.zIndex ?? 0) - (b.paint.zIndex ?? 0)) || (a.index - b.index));

    for (const {paint} of ordered) {
        const {geometry, stroke, fill, text, circle} = paint;

        if (fill || stroke) {
            ctx.beginPath();
            tracePath(ctx, geometry, view);
            if (fill) {
                ctx.fillStyle = fill.color;
                ctx.fill();
            }
            if (stroke) {
                applyStroke(ctx, stroke);
                ctx.stroke();
            }
        }

        if (circle) {
            for (const anchor of anchorsOf(geometry)) {
                const [x, y] = toScreen(anchor, view);
                ctx.beginPath();
                ctx.arc(x, y, circle.radiusPx, 0, 2 * Math.PI);
                if (circle.fill) {
                    ctx.fillStyle = circle.fill.color;
                    ctx.fill();
                }
                if (circle.stroke) {
                    applyStroke(ctx, circle.stroke);
                    ctx.stroke();
                }
            }
        }

        if (text && text.text) {
            for (const anchor of anchorsOf(geometry)) drawText(ctx, text, anchor, view);
        }
    }
}
