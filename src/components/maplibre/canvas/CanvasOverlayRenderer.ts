import type {FeatureCollection} from 'geojson';
import type {Map as MapLibreMap} from 'maplibre-gl';
import {toSnapshot, withFadedPaints} from '@zaes/tactical-graphics';
import type {Paint, PaintContext} from '@zaes/tactical-graphics';
import {viewTransformOf} from '../projection';
import {paintToCanvas} from './paintToCanvas';
import {
    buildTacticalGraphic,
    paintTacticalGraphic,
    type MapLibreTacticalGraphic,
} from '../maplibreAdapter';

/**
 * # Path A — a 2D canvas overlay synced to MapLibre's camera
 *
 * MapLibre renders the basemap and owns the camera; the tactical graphics are
 * painted onto a canvas stacked over its WebGL canvas and redrawn on every frame
 * MapLibre draws.
 *
 * ## Why the sync is on `render` and not `move`
 *
 * `move` fires once per camera *change*; `render` fires once per frame MapLibre
 * actually paints, including the interpolated frames of an eased zoom. Listening
 * to `move` leaves the graphics a frame behind the tiles during a flyTo, which
 * reads as the symbols sliding across the map. This is the single thing an
 * overlay has to get right, and it is cheap to get right.
 *
 * ## What this approach costs, stated plainly
 *
 * The graphics are CPU-rasterised into a canvas that is composited over the GPU
 * one. There is no GPU labeling, no label collision detection, and no
 * data-driven styling: MapLibre is drawing the basemap and nothing else. Anyone
 * evaluating this should read it as "MapLibre for the basemap and camera", not as
 * a MapLibre renderer.
 *
 * What it buys is exactness. `measureText` here is the same ruler the gap math
 * used, at the same moment, so a hole and the glyph inside it cannot drift apart
 * — which is the failure mode to expect from
 * the declarative path.
 */
export class CanvasOverlayRenderer {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly graphics: MapLibreTacticalGraphic[] = [];
    /** Each dimmed graphic's opacity, by id. @see setOpacity */
    private readonly opacities = new Map<string, number>();
    private readonly onRender = () => this.draw();
    private measureCanvas: CanvasRenderingContext2D | null = null;

    /** Marks drawn on the last frame — read by the perf probe. */
    lastPaintCount = 0;
    /** Milliseconds the last frame took, paint functions plus rasterisation. */
    lastFrameMs = 0;

    constructor(private readonly map: MapLibreMap) {
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'tg-maplibre-overlay';
        map.getCanvasContainer().appendChild(this.canvas);

        const ctx = this.canvas.getContext('2d');
        if (!ctx) throw new Error('CanvasOverlayRenderer: a 2D context is required');
        this.ctx = ctx;

        map.on('render', this.onRender);
        map.on('resize', this.onRender);
        this.draw();
    }

    /**
     * Text width in CSS pixels.
     *
     * Measured on a **separate** context from the one being painted: setting
     * `font` on the drawing context mid-frame to take a measurement would clobber
     * the font a text mark is about to render with, and the bug only shows on
     * marks that measure and draw in the same paint list.
     */
    private readonly context: PaintContext = {
        resolution: 0,
        measureText: (text, font) => {
            if (!this.measureCanvas) this.measureCanvas = document.createElement('canvas').getContext('2d');
            if (!this.measureCanvas) return 0;
            this.measureCanvas.font = font;
            return this.measureCanvas.measureText(text).width;
        },
    };

    add(graphic: MapLibreTacticalGraphic): void {
        this.graphics.push(graphic);
        this.map.triggerRepaint();
    }

    /**
     * Builds from a drawn base and adds in one step, defaulting `drawingResolution`
     * to the map's current one — which is what a draw gesture means by it, and what
     * the OpenLayers holders stamp. @see buildTacticalGraphic
     */
    addDrawn(
        name: Parameters<typeof buildTacticalGraphic>[0],
        geometry: Parameters<typeof buildTacticalGraphic>[1],
        properties?: Parameters<typeof buildTacticalGraphic>[2],
        drawingResolution = viewTransformOf(this.map).resolution,
    ): MapLibreTacticalGraphic | undefined {
        const graphic = buildTacticalGraphic(name, geometry, properties, drawingResolution);
        if (graphic) this.add(graphic);
        return graphic;
    }

    /**
     * Every graphic as a plain GeoJSON FeatureCollection — one **base** feature
     * each, the same shape `serializeTacticalGraphics` produces on the OpenLayers
     * side.
     *
     * The base is all that is saved because everything else is derived: the
     * geometry, the decorations and the labels all regenerate from
     * `properties.tacticalGraphic`, which is the portable description any renderer
     * consumes. Saving the drawn output instead would produce a picture rather than
     * a graphic.
     */
    snapshot(): FeatureCollection {
        /*
         * **Through `toSnapshot`, so the version stamp cannot be forgotten.** It was: this
         * renderer wrote a bare `FeatureCollection` while OpenLayers wrote one with
         * `tacticalGraphicsVersion` on it, so the two engines produced files that were
         * interchangeable in memory and not on disk. @see core/snapshot.ts
         */
        return toSnapshot(this.graphics.map(g => ({
            ...g.base,
            properties: {...(g.base.properties ?? {}), role: 'base', symbolId: g.id, graphicName: g.name},
        })));
    }

    /**
     * Nothing to do: this renderer repaints from the paint functions on **every**
     * frame, so a config change is already picked up by the next one. It exists so the
     * two renderers present the same surface — the native one bakes its paints into
     * GeoJSON sources and genuinely has to be told. @see MapEngineHandle.refreshStyles
     */
    realize(): void {
        this.map.triggerRepaint();
    }

    clear(): void {
        this.graphics.length = 0;
        this.opacities.clear();
        this.map.triggerRepaint();
    }

    /** The graphic with this id, or undefined. */
    find(id: string): MapLibreTacticalGraphic | undefined {
        return this.graphics.find(g => g.id === id);
    }

    /**
     * Takes one graphic off the map, and its opacity with it. True when there was one to
     * take. The same contract as the native renderer's. @see NativeLayerRenderer.remove
     */
    remove(id: string): boolean {
        const index = this.graphics.findIndex(g => g.id === id);
        if (index < 0) return false;
        this.graphics.splice(index, 1);
        this.opacities.delete(id);
        this.map.triggerRepaint();
        return true;
    }

    /**
     * Draws one graphic at `opacity`, 0 to 1, by fading every color in its paint list. View
     * state, never in {@link snapshot}. @see NativeLayerRenderer.setOpacity
     */
    setOpacity(id: string, opacity: number): boolean {
        if (!this.find(id)) return false;
        const clamped = Math.min(1, Math.max(0, Number.isFinite(opacity) ? opacity : 1));
        if (clamped >= 1) this.opacities.delete(id);
        else this.opacities.set(id, clamped);
        this.map.triggerRepaint();
        return true;
    }

    /** A graphic's opacity, 1 unless {@link setOpacity} dimmed it. */
    opacityOf(id: string): number {
        return this.opacities.get(id) ?? 1;
    }

    get count(): number {
        return this.graphics.length;
    }

    private resizeToMap(): {width: number; height: number} {
        const view = this.map.getCanvas();
        const width = view.clientWidth;
        const height = view.clientHeight;
        // The backing store is in device pixels and every size in this library is
        // CSS pixels, so the store is scaled up and the context scaled back down.
        // Skipping this makes every stroke and glyph blurry on a HiDPI display —
        // and, worse, makes a "10 px tooth" measure 10 device pixels there and 10
        // CSS pixels elsewhere.
        const dpr = window.devicePixelRatio || 1;
        if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
            this.canvas.width = width * dpr;
            this.canvas.height = height * dpr;
            this.canvas.style.width = `${width}px`;
            this.canvas.style.height = `${height}px`;
        }
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return {width, height};
    }

    private draw(): void {
        const started = performance.now();
        const {width, height} = this.resizeToMap();
        this.ctx.clearRect(0, 0, width, height);

        const view = viewTransformOf(this.map);
        const context: PaintContext = {resolution: view.resolution, measureText: this.context.measureText};

        const paints: Paint[] = [];
        for (const graphic of this.graphics) {
            paints.push(...withFadedPaints(paintTacticalGraphic(graphic, context), this.opacities.get(graphic.id)));
        }

        paintToCanvas(this.ctx, paints, view);

        this.lastPaintCount = paints.length;
        this.lastFrameMs = performance.now() - started;
    }

    destroy(): void {
        this.map.off('render', this.onRender);
        this.map.off('resize', this.onRender);
        this.canvas.remove();
    }
}
