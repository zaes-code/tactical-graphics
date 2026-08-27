import type {Feature, FeatureCollection} from 'geojson';
import type {GeoJSONSource, Map as MapLibreMap} from 'maplibre-gl';
import {
    TacticalGraphicHostility,
    TacticalGraphicName,
    getDrawMarkerColor,
    getHandleColor,
    LINE_WIDTH,
    formatDistance,
    groundLength,
    MERCATOR_MAX_LATITUDE,
    latitudeFromMercatorY,
    getInertHandleColor,
    isRectangular,
    getLabelFillColor,
    getLabelHaloColor,
    getSecuritySymbolSize,
    hasBakedDecoration,
    CENTER_SYMBOL_GRAPHICS,
    escortSymbolSizePx,
    resolveSecuritySymbol,
    securitySymbolRevision,
    securitySymbolSidc,
    subscribeSecuritySymbolChange,
} from '@zaes/tactical-graphics';
import type {PaintContext, ProjectedPosition} from '@zaes/tactical-graphics';
import {resolutionOf, toLonLat, toMercator} from '../projection';
import {buildTacticalGraphic, paintTacticalGraphic, withDrawingResolution, type MapLibreTacticalGraphic} from '../maplibreAdapter';
import {
    GRAPHIC_ID_PROPERTY,
    bucketPaintsInto,
    handleLayer,
    vertexHintLayer,
    iconLayer,
    patternFillLayer,
    measureLabelLayer,
    sketchLayer,
    emptyBuckets,
    circleLayer,
    featureCollection,
    fillLayer,
    lineLayer,
    renderHatchImage,
    symbolLayer,
} from './paintToLayers';

/**
 * # Path B — realize the geometry, then let MapLibre draw it
 *
 * The declarative renderer. Every mark becomes a GeoJSON feature in a source and
 * every source is drawn by a native layer, so the GPU does the work and MapLibre
 * owns labeling and collision.
 *
 * ## The whole difficulty, in one method
 *
 * {@link realize}. A `line` layer renders what its source holds, and an obstacle
 * line's teeth are not in the source — they are a function of the current
 * resolution. So the geometry has to be rebuilt and re-uploaded **every time the
 * zoom changes**, which is the cost `ai/maplibre-renderer.md` lists as risk 1 and
 * says the spike must measure rather than estimate. {@link lastRealizeMs} and
 * {@link lastFeatureCount} are that measurement.
 *
 * Panning is free — the geometry is in world coordinates and MapLibre transforms
 * it — so this is bound to zoom changes only, which is the saving grace. An eased
 * zoom, though, is many zoom changes.
 *
 * ## Debounced to `zoom`, not `render`
 *
 * The overlay redraws per frame because redrawing is cheap. Re-realizing is not:
 * it walks every graphic's paint function, reprojects every coordinate to lon/lat
 * and hands MapLibre new GeoJSON to parse and re-tile. Doing that per frame of an
 * eased zoom is what would make this approach untenable, so it is deferred to
 * `zoomend` with a coarse threshold during the gesture. The visible consequence is
 * that decorations are momentarily the wrong screen size mid-zoom — teeth stretch
 * and snap back — which an overlay never does.
 */

const SOURCE_PREFIX = 'tg-';

/** The editor's two layers, named so the interaction layer can query them. */
export const HANDLE_LAYER_ID = 'tg-handle';
export const SKETCH_LAYER_ID = 'tg-sketch';
/** The security operations' host-provided center symbol. @see core/securitySymbol.ts */
export const SYMBOL_ICON_LAYER_ID = 'tg-icon';

/**
 * The glyph stack MapLibre renders labels with.
 *
 * MapLibre draws text from pre-generated SDF glyph PBFs served over HTTP; there is
 * no path to the system font a canvas would use. That makes text a **hosting
 * dependency** the OpenLayers renderer does not have, and it is the sharpest
 * practical difference between the two paths: a deployment either self-hosts a
 * glyph set or points at someone else's server.
 *
 * MapLibre's own demo server is used here because the spike is keyless by
 * decision. A real deployment must self-host — an external font server is a
 * runtime dependency, breaks offline and under a strict CSP, and is not something
 * to build a product on.
 */
const GLYPHS_URL = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
/**
 * **The stack name has to exist on the glyph server, and a wrong one fails almost
 * silently.** `Open Sans Bold` — the obvious transliteration of this library's
 * `bold …px sans-serif` — is not served by MapLibre's demo server, which has
 * `Open Sans Semibold`, `Noto Sans Regular` and `Noto Sans Bold`. The 404 is a
 * network entry and nothing else: the map renders, every other layer is fine, and
 * the labels come out as unreadable specks.
 *
 * This is the second half of the glyph problem. The first is that text needs a
 * server at all; the second is that the font a paint list names (a CSS shorthand,
 * resolved by the browser against whatever it has) and the font MapLibre renders
 * (a fixed stack, baked into a PBF) are different namespaces, so every font this
 * library uses has to be *mapped* to a stack that has been pre-generated. The
 * canvas overlay has neither problem.
 */
const FONT_STACK = 'Noto Sans Bold';

/** How much the zoom must move mid-gesture before the geometry is rebuilt. */
const ZOOM_REALIZE_THRESHOLD = 0.34;

/**
 * Shortest gap between two mid-gesture rebuilds, in milliseconds.
 *
 * The zoom threshold alone does not bound the cost: a fast wheel spin crosses it
 * on every step, so a twelve-step zoom ran eleven full rebuilds. This puts a
 * ceiling on that regardless of how fast the input arrives.
 *
 * It only ever *delays* a rebuild — `zoomend` and `moveend` are unthrottled, so
 * the gesture always finishes with the geometry correct for where it landed. What
 * a user can see is that a decoration keeps the size it had a fraction of a second
 * ago while the wheel is still spinning.
 */
const MID_GESTURE_MIN_INTERVAL_MS = 120;

/**
 * Handle dimensions, matching `createHandleFeature` on the OpenLayers side so the
 * two editors feel the same under the hand.
 */
const HANDLE_RADIUS_PX = 5;
/** Width of the sketch line while a graphic is being drawn. */
const SKETCH_WIDTH_PX = 2;
/** The radius read-out's layers and its dash, in screen pixels. @see setMeasure */
export const MEASURE_LAYER_ID = 'tg-measure';
/** The "a drag here adds a vertex" marker. @see setVertexHint */
export const VERTEX_HINT_LAYER_ID = 'tg-vertex-hint';
export const MEASURE_LABEL_LAYER_ID = 'tg-measure-label';
const MEASURE_DASH = [8, 6];

/** Dash of that sketch line, in pixels — a drawing is not a graphic yet. */
const SKETCH_DASH = [4, 4];


/**
 * A short, stable key for an image source.
 *
 * FNV-1a over the `src`. It only has to tell one provider's answers apart from
 * another's within a session, and a `data:` URI is far too long to use as a MapLibre
 * image id directly — the id is written into every symbol feature's properties too,
 * so it travels with the source data on each rebuild.
 *
 * Exported for its test only; it is not on the `/maplibre` barrel.
 */
export function imageKey(src: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < src.length; i++) {
        hash ^= src.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}

/**
 * The map's own backing-store ratio. Matches the clamp `MapLibre.tsx` passes as
 * `pixelRatio`, so a raster drawn here lands on whole device pixels.
 */
function canvasPixelRatio(): number {
    return Math.max(1, window.devicePixelRatio || 1);
}

/**
 * Redraws a symbol at the resolution it will actually be shown at.
 *
 * **Why not hand MapLibre the `Image`.** `addImage(id, image)` takes it at its own
 * intrinsic size and calls those CSS pixels, so the sprite is whatever milsymbol
 * happened to emit — 73 px for a 25 px symbol — and the GPU then rescales it to the
 * wanted size and again by the device ratio, with linear filtering both times. Beside
 * OpenLayers, which hands the browser an `Icon` with an explicit `width` and lets it
 * scale the *vector* into a HiDPI canvas, the difference reads as a softer symbol.
 *
 * An SVG scales losslessly, so drawing it once at `wantedPx * ratio` device pixels and
 * declaring that ratio leaves the GPU nothing to interpolate.
 *
 * Returns `undefined` when there is no 2D context to draw into — a headless or
 * hostile environment — and the caller falls back to the intrinsic-size path rather
 * than losing the symbol.
 */
function rasterise(image: HTMLImageElement, wantedPx: number, ratio: number): ImageData | undefined {
    const naturalW = image.naturalWidth || image.width;
    const naturalH = image.naturalHeight || image.height;
    if (!naturalW || !naturalH) return undefined;

    // Height follows the symbol's own aspect: milsymbol's SVG is not square — the
    // echelon marks sit above the frame — and forcing a square would squash it.
    const width = Math.max(1, Math.round(wantedPx * ratio));
    const height = Math.max(1, Math.round((naturalH / naturalW) * wantedPx * ratio));

    try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return undefined;
        ctx.drawImage(image, 0, 0, width, height);
        return ctx.getImageData(0, 0, width, height);
    } catch {
        return undefined;
    }
}

export class NativeLayerRenderer {
    private readonly graphics: MapLibreTacticalGraphic[] = [];
    /** The in-progress draw's picture of itself, or null. @see setPreview */
    private preview: MapLibreTacticalGraphic | null = null;
    /**
     * Every layer this renderer owns, for hit-testing.
     *
     * `queryRenderedFeatures` with no layer filter would also return basemap
     * features, and the basemap has a lot of them — so the query has to name the
     * layers, and the dash-keyed line layers are created lazily, so the list has to
     * be kept rather than derived.
     */
    private readonly layerIds: string[] = [];
    private readonly lineLayerKeys = new Set<string>();
    private lastRealizedZoom = Number.NaN;
    /** When the last rebuild finished, for the mid-gesture throttle. */
    private lastRealizeEndedAt = 0;
    private installed = false;

    /** Milliseconds the last geometry realization took. The number the spike is for. */
    lastRealizeMs = 0;
    /** GeoJSON features uploaded on that realization. */
    lastFeatureCount = 0;
    /** How many times the geometry has been rebuilt since construction. */
    realizeCount = 0;
    /**
     * Where the last realization's time went, in milliseconds.
     *
     * Kept because "realize costs 26 ms" is not actionable and "22 of the 26 are in
     * `setData`" is. Three numbers, taken from a clock that is already running.
     */
    lastRealizeBreakdown: {paint: number; bucket: number; upload: number} = {paint: 0, bucket: 0, upload: 0};
    /** How many graphics survived the cull on the last realization. */
    lastVisibleCount = 0;
    /** Set while a coalesced rebuild is pending. @see scheduleRealize */
    private realizePending = false;
    /**
     * The graphic whose handles are showing, or null.
     *
     * Only one graphic's handles are drawn at a time, exactly as OpenLayers only
     * un-hides the selected graphic's. Two hundred graphics' worth of handles is
     * not an editor, it is a starfield.
     */
    private selectedId: string | null = null;
    /** The line being drawn, in projected meters, or null when not drawing. */
    private sketch: ProjectedPosition[] | null = null;
    /** The radius read-out line, center to rim, while a graphic is sized. @see setMeasure */
    private measure: [ProjectedPosition, ProjectedPosition] | null = null;
    /** Where a drag would add a vertex, while the cursor hovers a segment. @see setVertexHint */
    private vertexHint: ProjectedPosition | null = null;
    /** Icon names already handed to `loadImage`, so each is rasterised once. */
    private readonly registeredIcons = new Set<string>();
    /** Rasterised width per icon, for turning a wanted size into `icon-size`. */
    private readonly iconSizes = new globalThis.Map<string, number>();
    /** The provider/size revision those icons were built at. */
    private symbolRevision = -1;
    /** The resolution the screen-sized graphics were last rebuilt at. */
    private lastRebuildResolution = Number.NaN;
    /**
     * Whether handles belong to the selection alone rather than to every graphic.
     * True in `edit` mode only. @see handleBearers
     */
    private selectionScopedHandles = false;

    /** Whether a handle-bearing mode is selected. @see setHandleMode */
    private handleModeActive = false;

    private readonly onZoom = () => {
        const zoom = this.map.getZoom();
        if (Math.abs(zoom - this.lastRealizedZoom) < ZOOM_REALIZE_THRESHOLD) return;
        if (performance.now() - this.lastRealizeEndedAt < MID_GESTURE_MIN_INTERVAL_MS) return;
        this.realize();
    };
    private readonly onZoomEnd = () => this.realize();
    /**
     * A pan changes which graphics are on screen, and the cull means the ones that
     * were off it were never uploaded — so a pan has to rebuild, exactly as a zoom
     * does. `moveend` rather than `move`: the cull is generous enough that nothing
     * appears late, and rebuilding every frame of a drag is what this is avoiding.
     */
    private readonly onMoveEnd = () => this.scheduleRealize();

    private measureCanvas: CanvasRenderingContext2D | null = null;

    constructor(private readonly map: MapLibreMap) {
        this.install();
        map.on('zoom', this.onZoom);
        map.on('zoomend', this.onZoomEnd);
        map.on('moveend', this.onMoveEnd);
        // Sources are realized on zoom, so without this a provider registered after
        // the map settled would not appear until something unrelated moved it. The
        // revision check inside `realizeCenterSymbols` then throws the stale rasters
        // away; this is only what makes it look.
        this.unsubscribeSymbols = subscribeSecuritySymbolChange(() => this.scheduleRealize());
    }

    private readonly unsubscribeSymbols: () => void;

    /**
     * Text measurement, still done on a canvas.
     *
     * Worth being explicit about: even the "native" path measures its gaps with
     * `ctx.measureText` against a *browser* font, while MapLibre renders the label
     * from an SDF glyph set that is a different font at a different rasterisation.
     * The two agree closely for a common sans-serif and are not guaranteed to. This
     * is risk 3 from `ai/maplibre-renderer.md` — the gap and the glyph measured by
     * different rulers — and it is inherent to the approach rather than a bug to fix.
     */
    private readonly measureText = (text: string, font: string): number => {
        if (!this.measureCanvas) this.measureCanvas = document.createElement('canvas').getContext('2d');
        if (!this.measureCanvas) return 0;
        this.measureCanvas.font = font;
        return this.measureCanvas.measureText(text).width;
    };

    /**
     * Adds the sources and the layers that do not depend on the data.
     *
     * The style must already carry a `glyphs` URL for the symbol layer to render
     * anything, so it is set here rather than being left to the basemap style —
     * a symbol layer against a style with no glyphs renders silently empty, which
     * is a bad failure mode to leave for later.
     */
    private install(): void {
        if (this.installed) return;
        this.map.setGlyphs(GLYPHS_URL);

        for (const kind of ['fills', 'circles', 'symbols', 'icons', 'handles', 'sketch', 'measure', 'vertexHint']) {
            this.map.addSource(SOURCE_PREFIX + kind, {type: 'geojson', data: featureCollection([])});
        }
        // **The hatch goes under the solid fills, and the order is load-bearing.** These two
        // share one source, so within each the paint list's order survives — but between
        // them it does not, and whichever layer is added last wins for every graphic at
        // once. Added the other way round, a CBRN area's yellow hatch drew straight over the
        // opaque triangle meant to stop it, undoing on this engine the exact z-order fix
        // that had just been made on the other.
        //
        // Safe because a hatch in this library is always an area's own background wash and a
        // solid fill is always foreground — an arrowhead, a tooth, a glyph. Not an assumption
        // to leave implicit, so `maplibreAdapter.test.ts` asserts it over the whole registry:
        // no graphic emits a patterned fill after a solid one.
        this.map.addLayer(patternFillLayer('tg-fill-pattern', SOURCE_PREFIX + 'fills'));
        this.map.addLayer(fillLayer('tg-fill', SOURCE_PREFIX + 'fills'));
        this.map.addLayer(circleLayer('tg-circle', SOURCE_PREFIX + 'circles'));
        this.map.addLayer(symbolLayer('tg-symbol', SOURCE_PREFIX + 'symbols', FONT_STACK));
        this.map.addLayer(iconLayer(SYMBOL_ICON_LAYER_ID, SOURCE_PREFIX + 'icons'));
        this.layerIds.push('tg-fill-pattern', 'tg-fill', 'tg-circle', 'tg-symbol', SYMBOL_ICON_LAYER_ID);

        // Editor chrome, added last so it sits above every graphic. Not in `layerIds`:
        // that list is what a click hit-tests against to find a *graphic*, and a
        // handle is not one — the interaction layer queries these by name instead.
        this.map.addLayer(sketchLayer(SKETCH_LAYER_ID, SOURCE_PREFIX + 'sketch', SKETCH_DASH, SKETCH_WIDTH_PX));
        // The radius read-out: a hashed line in the inert-handle color, with the
        // distance laid **along** it so it picks up the line's own angle. Same shape as
        // OpenLayers' `createMeasureFeature`. @see setMeasure
        this.map.addLayer(sketchLayer(MEASURE_LAYER_ID, SOURCE_PREFIX + 'measure', MEASURE_DASH, LINE_WIDTH()));
        this.map.addLayer(measureLabelLayer(MEASURE_LABEL_LAYER_ID, SOURCE_PREFIX + 'measure', FONT_STACK));
        this.map.addLayer(handleLayer(HANDLE_LAYER_ID, SOURCE_PREFIX + 'handles'));
        // Above the handles: it marks the vertex a drag would create, and a real handle
        // sitting on top of that offer would hide it. @see setVertexHint
        this.map.addLayer(vertexHintLayer(VERTEX_HINT_LAYER_ID, SOURCE_PREFIX + 'vertexHint'));
        this.installed = true;
    }

    add(graphic: MapLibreTacticalGraphic): void {
        this.graphics.push(graphic);
        this.scheduleRealize();
    }

    /**
     * Rebuilds once, after the current task finishes, however many times it is asked.
     *
     * `add` used to realize immediately, which made drawing N graphics cost N full
     * rebuilds of all N — quadratic, and each one re-serializes every source and
     * makes MapLibre re-tile it in the worker. Drawing the 213-graphic gallery ran
     * 213 rebuilds and took 4.4 s; coalesced it is one rebuild.
     *
     * A microtask, not `requestAnimationFrame`: it still collapses a whole burst of
     * adds into one rebuild, but it lands before the next paint and before anything
     * that merely awaits — so a caller that adds and then reads the map sees the
     * result, and no frame ever renders the intermediate state. `flush` is there for
     * the synchronous case.
     */
    private scheduleRealize(): void {
        if (this.realizePending) return;
        this.realizePending = true;
        Promise.resolve().then(() => {
            if (!this.realizePending) return;
            this.realizePending = false;
            this.realize();
        });
    }

    /** Runs any pending rebuild now. For a caller that cannot wait a microtask. */
    flush(): void {
        if (!this.realizePending) return;
        this.realizePending = false;
        this.realize();
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
        return {
            type: 'FeatureCollection',
            features: this.graphics.map(g => ({
                ...g.base,
                properties: {...(g.base.properties ?? {}), role: 'base', symbolId: g.id, graphicName: g.name},
            })),
        };
    }

    clear(): void {
        this.graphics.length = 0;
        this.scheduleRealize();
    }

    get count(): number {
        return this.graphics.length;
    }

    /**
     * Rebuilds every graphic's geometry at the current resolution and uploads it.
     *
     * This is the whole of path B's per-zoom cost: run the paint functions, bucket
     * the marks, reproject every coordinate to lon/lat, and hand MapLibre new
     * GeoJSON. Timed end to end.
     */
    realize(): void {
        // A scheduled rebuild is now redundant — this one supersedes it.
        this.realizePending = false;
        const started = performance.now();
        const resolution = resolutionOf(this.map);
        const context: PaintContext = {resolution, measureText: this.measureText};

        // Bucketed per graphic rather than in one pass, so each feature can be stamped
        // with the graphic it came from — which is what makes a rendered mark
        // hit-testable back to its symbol. @see GRAPHIC_ID_PROPERTY
        this.rebuildScreenSized(resolution);
        const visible = this.visibleGraphics();
        const paintedAt = performance.now();
        const perGraphic = visible.map(graphic => paintTacticalGraphic(graphic, context));
        const bucketedAt = performance.now();
        const buckets = emptyBuckets();
        for (let i = 0; i < perGraphic.length; i++) {
            bucketPaintsInto(buckets, perGraphic[i], visible[i].id);
        }
        const uploadAt = performance.now();
        let features = buckets.fills.length + buckets.circles.length + buckets.symbols.length;

        // Register any hatch this frame needs. MapLibre has no pattern primitive —
        // `fill-pattern` names an image — so the hatch the paint layer describes as
        // parameters has to be rasterised and uploaded before a fill can use it.
        // Idempotent: `hasImage` keeps this to once per distinct hatch per map.
        for (const [id, spec] of Array.from(buckets.hatches)) {
            if (this.map.hasImage(id)) continue;
            const image = renderHatchImage(spec);
            if (image) this.map.addImage(id, image, {pixelRatio: 1});
        }

        this.setData('fills', buckets.fills);
        this.setData('circles', buckets.circles);
        this.setData('symbols', buckets.symbols);

        // A dash pattern cannot be data-driven, so each distinct one needs its own
        // layer. Created lazily and never removed: they are few, and dropping a layer
        // whose data merely went empty would churn the style on every zoom.
        // `Array.from`, not a for-of over the Map: the build targets es5, where
        // iterating a Map needs --downlevelIteration.
        for (const [key, list] of Array.from(buckets.lines)) {
            features += list.length;
            const id = lineSourceId(key);
            if (!this.lineLayerKeys.has(key)) {
                this.map.addSource(id, {type: 'geojson', data: featureCollection(list)});
                const dash = key === 'solid' ? undefined : key.split('@')[0].split(',').map(Number);
                this.map.addLayer(lineLayer(id, id, dash), 'tg-symbol');
                this.lineLayerKeys.add(key);
                this.layerIds.push(id);
            } else {
                (this.map.getSource(id) as GeoJSONSource | undefined)?.setData(featureCollection(list));
            }
        }

        // **Every dash layer this frame did not fill has to be emptied.** The loop above
        // only visits the patterns present *now*, and the layers outlive the data that
        // created them — so a pattern that stopped appearing kept drawing whatever it
        // held last. Clearing the map left 87% of the ink on screen with no graphics
        // behind it, and the same stale draw happened whenever the last graphic using a
        // pattern was deleted or panned out of view.
        for (const key of Array.from(this.lineLayerKeys)) {
            if (buckets.lines.has(key)) continue;
            (this.map.getSource(lineSourceId(key)) as GeoJSONSource | undefined)?.setData(featureCollection([]));
        }

        this.realizeCenterSymbols(visible);
        this.realizeEditorMarks();
        this.lastVisibleCount = visible.length;
        this.lastRealizeBreakdown = {
            paint: bucketedAt - paintedAt,
            bucket: uploadAt - bucketedAt,
            upload: performance.now() - uploadAt,
        };
        this.lastRealizedZoom = this.map.getZoom();
        this.lastFeatureCount = features;
        this.lastRealizeMs = performance.now() - started;
        this.lastRealizeEndedAt = performance.now();
        this.realizeCount++;
    }

    private setData(kind: string, features: Parameters<typeof featureCollection>[0]): void {
        (this.map.getSource(SOURCE_PREFIX + kind) as GeoJSONSource | undefined)?.setData(featureCollection(features));
    }

    /**
     * Rebuilds the graphics whose **geometry** is a screen size, at the new zoom.
     *
     * Almost every graphic here is drawn in meters and simply scales with the map, so
     * a realization only re-runs the paint functions. The security operations are the
     * exception: every dimension of one is a pixel constant, so the generator has to
     * run again with the new resolution or the symbol grows and shrinks with the map
     * instead of holding its size.
     *
     * This is the MapLibre half of `manager.watchResolution(handler)` — the rule that
     * a graphic sized in screen pixels only holds its size because something
     * re-derives it. @see ai/conventions.md
     */
    private rebuildScreenSized(resolution: number): void {
        if (resolution === this.lastRebuildResolution) return;
        this.lastRebuildResolution = resolution;

        for (let i = 0; i < this.graphics.length; i++) {
            const graphic = this.graphics[i];
            if (!isScreenSized(graphic.name)) continue;

            const rebuilt = buildTacticalGraphic(graphic.name, graphic.base.geometry, graphic.properties, resolution);
            // A generator that refuses leaves the previous geometry up, which is the
            // right failure: a symbol at the wrong size beats no symbol.
            //
            // **The label scale keeps its original anchor.** The rebuild needs the
            // *current* resolution to re-derive the decoration, and stamping that as
            // `drawingResolution` would move the zoom the label is measured against to
            // "now" — so the scale computes as 1.0 forever and the label never grows.
            // @see withDrawingResolution
            if (rebuilt) {
                this.graphics[i] = withDrawingResolution({...rebuilt, id: graphic.id}, graphic.graphic.drawingResolution);
            }
        }
    }

    /**
     * The graphics worth rebuilding: those whose extent meets the padded viewport.
     *
     * Rebuilding all of them cost the same whether one was on screen or two hundred,
     * because every graphic was painted, converted to lon/lat and uploaded on every
     * zoom step. Zoomed in far enough that only a handful are visible, that is almost
     * entirely wasted work — and zoomed in is exactly where a user spends their time.
     *
     * The padding is a full viewport on each side. It has to cover two things the
     * bounds do not: a graphic's screen-pixel decorations, which reach beyond the
     * geometry they hang off, and a label, which can sit well outside the shape it
     * names. A generous margin costs one comparison per graphic; a tight one shows
     * as symbols clipping in and out at the edge of the map.
     *
     * A graphic with no bounds — an empty geometry — is kept rather than culled: it
     * draws nothing anyway, and guessing "off screen" for something whose extent is
     * unknown is the wrong way round.
     */
    private visibleGraphics(): MapLibreTacticalGraphic[] {
        const bounds = this.map.getBounds();
        const sw = toMercator([bounds.getWest(), Math.max(bounds.getSouth(), -MERCATOR_MAX_LATITUDE)]);
        const ne = toMercator([bounds.getEast(), Math.min(bounds.getNorth(), MERCATOR_MAX_LATITUDE)]);

        const padX = Math.abs(ne[0] - sw[0]);
        const padY = Math.abs(ne[1] - sw[1]);
        const minX = Math.min(sw[0], ne[0]) - padX;
        const maxX = Math.max(sw[0], ne[0]) + padX;
        const minY = Math.min(sw[1], ne[1]) - padY;
        const maxY = Math.max(sw[1], ne[1]) + padY;

        // The draw preview rides along: it is under the cursor by construction, and it
        // is the one graphic the user is actively looking at. @see setPreview
        const candidates = this.preview ? this.graphics.concat(this.preview) : this.graphics;
        return candidates.filter(graphic => {
            const box = graphic.graphic.bounds;
            if (!box) return true;
            return box.maxX >= minX && box.minX <= maxX && box.maxY >= minY && box.minY <= maxY;
        });
    }

    /**
     * Shows the given graphic's handles, or none.
     *
     * Separate from `realize` because selection changes far more often than geometry
     * does — a click that only moves the selection has no reason to repaint 200
     * graphics.
     */
    select(id: string | null): void {
        if (this.selectedId === id) return;
        this.selectedId = id;
        this.realizeEditorMarks();
    }

    /** The currently selected graphic's id, or null. */
    get selection(): string | null {
        return this.selectedId;
    }

    /**
     * Shows the radius read-out, or clears it.
     *
     * A hashed line from the center to the rim with the distance on it, drawn while a
     * circular graphic is sized — the same chrome as OpenLayers' measure feature, and
     * deliberately the same words: both call `formatDistance`, so the read-out, the
     * other renderer's read-out and the properties dialog cannot disagree about a
     * number the user is comparing.
     *
     * Editor chrome, so it lives in its own source rather than in the paint buckets:
     * it must never reach `snapshot`, a sample sweep or a restored map.
     */
    setMeasure(line: [ProjectedPosition, ProjectedPosition] | null): void {
        this.measure = line;
        this.realizeEditorMarks();
    }

    /**
     * Marks where a drag would add a vertex, or clears the mark.
     *
     * Called on every pointer move in modify mode, so it returns early when nothing
     * changed: repainting the editor marks on each mousemove would rebuild the handle
     * source hundreds of times a second for a dot that has not moved.
     */
    setVertexHint(position: ProjectedPosition | null): void {
        const same = this.vertexHint === position
            || (!!this.vertexHint && !!position && this.vertexHint[0] === position[0] && this.vertexHint[1] === position[1]);
        if (same) return;
        this.vertexHint = position;
        this.realizeEditorMarks();
    }

    /** Sets the line being drawn, or clears it. Repaints only the editor chrome. */
    setSketch(points: ProjectedPosition[] | null): void {
        this.sketch = points && points.length ? points : null;
        this.realizeEditorMarks();
    }

    /**
     * Registers and places the security operations' center symbols.
     *
     * The symbol is a single-point icon, which is milsymbol's job rather than this
     * library's — nothing here names milsymbol, and a host that registers no provider
     * simply gets an empty center, which is a supported state.
     *
     * MapLibre needs the image **registered by name** before a layer can reference
     * it, and `loadImage` is asynchronous. So a symbol appears on the realization
     * *after* the one that first asked for it. That is invisible in practice — the
     * load resolves in a frame or two — and the alternative, blocking a rebuild on a
     * network-shaped call, is not worth it for a decoration.
     */
    private realizeCenterSymbols(visible: MapLibreTacticalGraphic[]): void {
        // A provider or size change invalidates every rasterised icon, and comparing
        // providers by identity would miss the size half.
        if (this.symbolRevision !== securitySymbolRevision()) {
            this.symbolRevision = securitySymbolRevision();
            this.registeredIcons.clear();
        }

        const features: Array<{type: 'Feature'; geometry: {type: 'Point'; coordinates: number[]}; properties: Record<string, unknown>}> = [];

        const resolution = resolutionOf(this.map);

        for (const graphic of visible) {
            if (!CENTER_SYMBOL_GRAPHICS.has(graphic.name)) continue;
            // The security operations are placed on a point; the escort is drawn, so its
            // symbol goes in the break at the middle of its bar and takes its size from the
            // bar's span. @see escortSymbolSizePx
            const placed = graphic.name === TacticalGraphicName.Escort
                ? escortCenter(graphic, resolution)
                : graphic.base.geometry.type === 'Point'
                    ? {at: graphic.base.geometry.coordinates as number[], sizePx: getSecuritySymbolSize()}
                    : undefined;
            if (!placed) continue;
            const center = {type: 'Point' as const, coordinates: placed.at};

            const hostility = graphic.properties.hostility ?? TacticalGraphicHostility.pending;
            const symbol = resolveSecuritySymbol({
                name: graphic.name,
                // Lets a provider registered for this graphic alone win over the
                // global one. @see setGraphicSecuritySymbolProvider
                graphicId: graphic.id,
                hostility,
                sidc: securitySymbolSidc(hostility),
                sizePx: placed.sizePx,
                // The graphic's own amplifiers, which the OpenLayers provider has
                // always been handed. A provider is a host's code and may key on
                // anything in here.
                labels: {...graphic.properties, label: graphic.properties.label ?? ''},
            });
            if (!symbol) continue;

            // **Keyed on the image, not on the graphic.** The id used to be
            // `name`-`hostility`, which assumes those two decide the picture. They do
            // for the default provider and not for a host's: one that varies the
            // symbol by `labels`, or returns a per-graphic `sizePx` — milsymbol bakes
            // the requested size into the SVG, so a different size is a different
            // image — had every such graphic collapse onto the first raster
            // registered. Hashing the `src` makes two graphics share a raster exactly
            // when they asked for the same one, which is also the dedupe the old key
            // was trying to be.
            const wantedPx = symbol.sizePx ?? getSecuritySymbolSize();
            const iconId = `tg-sym-${imageKey(symbol.src)}-${Math.round(wantedPx)}@${canvasPixelRatio()}`;
            this.registerIcon(iconId, symbol.src, wantedPx);
            if (!this.map.hasImage(iconId)) continue;

            features.push({
                type: 'Feature',
                geometry: {type: 'Point', coordinates: center.coordinates as number[]},
                properties: {
                    icon: iconId,
                    // `icon-size` is a *multiplier* on the image's own pixels, so the
                    // wanted size has to be divided by what was actually rasterised.
                    // 1 in the ordinary case: the raster was drawn at exactly this
                    // size, so there is nothing left for the GPU to rescale. It only
                    // leaves 1 on the fallback path, where the SVG went in at its own
                    // intrinsic size. @see registerIcon
                    scale: wantedPx / this.iconPixels(iconId),
                    // **The symbol has to be hit-testable back to its graphic.** It is
                    // the biggest thing a security operation draws and the obvious place
                    // to click, and without this the click found a feature the hit test
                    // could not attribute — so clicking a Cover selected nothing and its
                    // properties dialog never opened. @see hitTest
                    [GRAPHIC_ID_PROPERTY]: graphic.id,
                },
            });
        }

        this.setData('icons', features);
    }

    /** Rasterises an image and registers it under `id`, once. */
    private registerIcon(id: string, src: string, wantedPx: number): void {
        if (this.registeredIcons.has(id)) return;
        this.registeredIcons.add(id);
        if (this.map.hasImage(id)) return;

        const ratio = canvasPixelRatio();
        const image = new Image();
        image.onload = () => {
            if (!this.map.hasImage(id)) {
                const raster = rasterise(image, wantedPx, ratio);
                // `pixelRatio` is what tells MapLibre these are *device* pixels, so it
                // displays the image at `width / ratio` CSS px — exactly `wantedPx` —
                // with `icon-size` left at 1.
                if (raster) this.map.addImage(id, raster, {pixelRatio: ratio});
                else this.map.addImage(id, image);
                this.iconSizes.set(id, raster ? wantedPx : image.width || getSecuritySymbolSize());
            }
            // The image arrived after the realization that asked for it, so the layer
            // has nothing referencing it yet.
            this.scheduleRealize();
        };
        // A provider that hands back an unloadable src gets an empty center rather than
        // a broken-image box, and the failure is not retried on every frame.
        image.onerror = () => this.iconSizes.set(id, getSecuritySymbolSize());
        image.src = src;
    }

    /** The rasterised width of a registered icon, in pixels. */
    private iconPixels(id: string): number {
        return this.iconSizes.get(id) || getSecuritySymbolSize();
    }

    /**
     * Uploads the handles and the sketch.
     *
     * Deliberately its own pass over its own sources: dragging a handle moves it
     * every frame, and rebuilding every graphic to reflect that would put the whole
     * realize cost inside a drag.
     */
    private realizeEditorMarks(): void {
        this.setData('handles', this.handleBearers().flatMap(graphic => {
            const center = centerHandleIndex(graphic);
            return graphic.handles.map((position, index) => ({
                type: 'Feature' as const,
                geometry: {type: 'Point' as const, coordinates: toLonLat(position)},
                properties: {
                    radius: HANDLE_RADIUS_PX,
                    [GRAPHIC_ID_PROPERTY]: graphic.id,
                    handleIndex: index,
                    // Gray for the center dot, and the color has to stay honest: it says
                    // "this one will not rotate or resize", which is true — the scale ratio
                    // divides by distance-to-center and a point on the axis carries no
                    // angle. It still moves the graphic, which is what the eye expects of a
                    // center. @see createInertHandleFeature
                    color: index === center ? getInertHandleColor() : getHandleColor(),
                },
            }));
        }));

        this.setData('vertexHint', this.vertexHint
            ? [{
                type: 'Feature' as const,
                geometry: {type: 'Point' as const, coordinates: toLonLat(this.vertexHint)},
                properties: {},
            }]
            : []);

        this.setData('measure', this.measure ? measureFeatures(this.measure) : []);

        this.setData('sketch', this.sketch && this.sketch.length >= 2
            ? [{
                type: 'Feature' as const,
                geometry: {type: 'LineString' as const, coordinates: this.sketch.map(toLonLat)},
                properties: {color: getDrawMarkerColor()},
            }]
            : []);
    }

    /**
     * The graphics whose handles are on screen.
     *
     * **Two rules, matching what the mode means** — and matching
     * `TacticalGraphicsManager.toggleHandleFeatures` on the other engine, because the
     * same button drives both.
     *
     * In the four legacy gesture modes: *every* graphic. The host has said "everything
     * is rotatable now", so the whole map becomes editable at once and there is no
     * selection step. Showing only the selected graphic's handles here used to make the
     * two engines answer the same button differently — OpenLayers lit up four handles
     * across two graphics, MapLibre lit up none until you clicked one.
     *
     * In `edit`: only the selected graphic. The operator picked one symbol, and the
     * chrome the host draws around it would otherwise sit on top of every other
     * graphic's handles.
     */
    private handleBearers(): MapLibreTacticalGraphic[] {
        if (!this.handleModeActive) return [];
        if (!this.selectionScopedHandles) return this.visibleGraphics();
        const selected = this.selectedId ? this.find(this.selectedId) : undefined;
        if (!selected) return [];
        /*
         * **A rectangular zone wears no handle in edit mode.** `applyGesture` already
         * returns early on `isRectangular` — a box's corner is a consequence of the box,
         * not a point with a meaning of its own — so the dots were drawn in the live
         * handle color and read by nothing. The resize affordance sizes these now.
         * OpenLayers states the same rule in `toggleHandleFeatures`.
         */
        return isRectangular(selected.name) ? [] : [selected];
    }

    /**
     * Whether a handle-bearing mode is selected, and whether that mode scopes handles to
     * the selection. Set by the interaction layer, because the mode is its state; the
     * renderer only needs to know whether to draw chrome, and for which graphics.
     */
    setHandleMode(active: boolean, selectionScoped: boolean = false): void {
        if (this.handleModeActive === active && this.selectionScopedHandles === selectionScoped) return;
        this.handleModeActive = active;
        this.selectionScopedHandles = selectionScoped;
        this.realizeEditorMarks();
    }

    /** The graphic with this id, or undefined. */
    find(id: string): MapLibreTacticalGraphic | undefined {
        return this.graphics.find(g => g.id === id);
    }

    /**
     * The graphic being drawn, painted but not owned.
     *
     * Held apart from `graphics` on purpose. It is not a graphic the map *has* — it is
     * a picture of the one the next click would create — so it must not appear in a
     * `snapshot`, in `count`, or under a hit test, all of which read `graphics`. Passing
     * it through `add`/`remove` would have put it in all three, and a save taken
     * mid-gesture would have persisted a symbol the user never committed to.
     *
     * @see MapLibreInteractions.previewDraw
     */
    setPreview(graphic: MapLibreTacticalGraphic | null): void {
        if (!graphic && !this.preview) return;
        this.preview = graphic;
        this.scheduleRealize();
    }

    /**
     * Swaps a graphic for a rebuilt version of itself, keeping its place in the
     * draw order.
     *
     * Order matters because the paint list is emitted in graphic order and MapLibre
     * draws a source's features in the order they arrive: moving an edited graphic
     * to the end would lift it above whatever it used to sit under.
     */
    replace(id: string, next: MapLibreTacticalGraphic): void {
        const index = this.graphics.findIndex(g => g.id === id);
        if (index < 0) return;
        this.graphics[index] = next;
        this.scheduleRealize();
    }

    /**
     * The graphic under a screen point, or undefined.
     *
     * `radiusPx` widens the query into a box, because most of these symbols are line
     * work: a one-pixel query against a two-pixel line asks the user to be more
     * accurate than the symbol is wide.
     */
    hitTest(point: {x: number; y: number}, radiusPx = 5): MapLibreTacticalGraphic | undefined {
        const box: [[number, number], [number, number]] = [
            [point.x - radiusPx, point.y - radiusPx],
            [point.x + radiusPx, point.y + radiusPx],
        ];
        const layers = this.layerIds.filter(id => this.map.getLayer(id));
        if (!layers.length) return undefined;

        const hits = this.map.queryRenderedFeatures(box, {layers});
        for (const hit of hits) {
            const id = hit.properties?.[GRAPHIC_ID_PROPERTY];
            if (typeof id === 'string') {
                const graphic = this.find(id);
                if (graphic) return graphic;
            }
        }
        return undefined;
    }

    /**
     * Which of a graphic's handles is its center, or -1.
     *
     * Found by **position**, not by index: the documented order for the
     * point-anchored family is `[edge, center]`, but a range fan emits one handle per
     * band and the corridors emit one per turning point, so an index would be right
     * for one family and wrong for the rest. A handle sitting on the base point is
     * the center in every family that has one.
     */
    centerHandleOf(graphic: MapLibreTacticalGraphic): number {
        return centerHandleIndex(graphic);
    }

    /**
     * The handle index under a screen point, or -1.
     *
     * Queried ahead of the graphic body, because a handle sits *on* the graphic it
     * belongs to and the body would otherwise always win.
     */
    hitTestHandle(point: {x: number; y: number}, radiusPx = 8): {graphic: MapLibreTacticalGraphic; index: number} | undefined {
        if (!this.map.getLayer(HANDLE_LAYER_ID)) return undefined;

        // Searched across **every** graphic wearing handles, not just the selected one.
        // OpenLayers has no selection in these modes — the pointer finds whichever
        // handle is under it and drags that — so a MapLibre that only answered for the
        // selected graphic would draw handles the user could not grab.
        const candidates = this.handleBearers();
        const searched = candidates.length ? candidates : this.selectedHandleBearer();

        // Compared in screen space rather than through `queryRenderedFeatures`: the
        // answer needed is *which* handle, and a rendered feature carries no index.
        let best: {graphic: MapLibreTacticalGraphic; index: number} | undefined;
        let bestDistance = radiusPx;
        for (const graphic of searched) {
            graphic.handles.forEach((position, index) => {
                const projected = this.map.project(toLonLat(position) as [number, number]);
                const distance = Math.hypot(projected.x - point.x, projected.y - point.y);
                if (distance <= bestDistance) {
                    best = {graphic, index};
                    bestDistance = distance;
                }
            });
        }
        return best;
    }

    /** The selected graphic as a one-or-zero list, for the no-handle-mode case. */
    private selectedHandleBearer(): MapLibreTacticalGraphic[] {
        const selected = this.selectedId ? this.find(this.selectedId) : undefined;
        return selected ? [selected] : [];
    }

    destroy(): void {
        this.map.off('zoom', this.onZoom);
        this.map.off('zoomend', this.onZoomEnd);
        this.map.off('moveend', this.onMoveEnd);
        this.unsubscribeSymbols();
    }
}

/**
 * How close a handle must sit to the base point to count as the center, in meters
 * per unit of the graphic's own size.
 *
 * Relative rather than absolute: a graphic a kilometer across and one a thousand
 * kilometers across both have a center, and a fixed tolerance would either miss
 * the first or swallow the second's edge handle.
 */
const CENTER_TOLERANCE_FRACTION = 0.01;

/** @see NativeLayerRenderer.centerHandleOf */
function centerHandleIndex(graphic: MapLibreTacticalGraphic): number {
    const base = graphic.base.geometry;
    if (base.type !== 'Point') return -1;

    const center = toMercator(base.coordinates as [number, number]);
    // Sized against the graphic's own extent, so the tolerance means the same thing
    // whatever scale it was drawn at.
    const bounds = graphic.graphic.bounds;
    const extent = bounds ? Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) : 0;
    const tolerance = Math.max(1, extent * CENTER_TOLERANCE_FRACTION);

    return graphic.handles.findIndex(
        handle => Math.hypot(handle[0] - center[0], handle[1] - center[1]) <= tolerance,
    );
}

/** The source and layer id for a dash pattern. One derivation, used by both passes. */
const lineSourceId = (key: string): string => `tg-line-${key.replace(/[^a-z0-9]/gi, '_')}`;

/**
 * The three graphics whose **geometry** is a screen size.
 *
 * Not the same question as "which graphics carry a centre symbol", though the two sets
 * coincided until the escort joined the second one. @see CENTER_SYMBOL_GRAPHICS
 */
const SECURITY_OPERATIONS = new Set<TacticalGraphicName>([
    TacticalGraphicName.Cover,
    TacticalGraphicName.Guard,
    TacticalGraphicName.Screen,
]);

/**
 * Whether a graphic's **geometry** is a screen size rather than a ground distance,
 * and so has to be regenerated when the zoom changes.
 *
 * Two kinds:
 *
 * - the **security operations**, badges whose every dimension — arm length, center
 *   padding, arrowheads — is a pixel constant times the resolution;
 * - everything with a **baked decoration**, whose `size` is "how big is the
 *   chevron" in screen pixels. Bridge, gap, the fords, the wire obstacles, the
 *   direction arrows.
 *
 * OpenLayers re-derives both on every zoom through `watchResolution`, so they hold
 * their size. Baking them once looks right at the zoom they were built at and
 * wrong everywhere else — and for the second kind it is not only the decoration:
 * the label anchors are spaced by the same number, and the movement label's scale
 * is proportional to that span, so a bridge's designation came out several times
 * too large. That is invisible to a comparison run at one zoom, which is why this
 * was missed until the harness grew a zoom axis.
 */
/**
 * Where an escort's centre symbol goes, and how big.
 *
 * **Read off the base, not the rendered graphic.** Everything this pass emits goes into a
 * GeoJSON source, so it has to be lon/lat, and the base is the one geometry guaranteed to
 * be — which is why the security operations beside it use `graphic.base` too. Taking the
 * rendered bar instead put the symbol nowhere at all.
 *
 * 343600 numbers points 2 and 3 as the ends of the bar, so their midpoint is where the
 * paint layer cuts the break. The size comes from the bar's on-screen span through the
 * same function the paint sizes that break with. @see escortSymbolSizePx
 */
function escortCenter(
    graphic: MapLibreTacticalGraphic,
    resolution: number,
): {at: number[]; sizePx: number} | undefined {
    const base = graphic.base.geometry;
    if (base.type !== 'LineString' || base.coordinates.length < 3) return undefined;

    const start = base.coordinates[1] as number[];
    const end = base.coordinates[2] as number[];
    const a = toMercator([start[0], start[1]]);
    const b = toMercator([end[0], end[1]]);
    const spanPx = Math.hypot(b[0] - a[0], b[1] - a[1]) / resolution;
    if (!(spanPx > 0)) return undefined;

    return {
        at: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
        sizePx: escortSymbolSizePx(spanPx),
    };
}

function isScreenSized(name: TacticalGraphicName): boolean {
    return SECURITY_OPERATIONS.has(name) || hasBakedDecoration(name);
}

/**
 * The radius read-out, as the dashed line and **a separate point for its label**.
 *
 * The label is not laid along the line, and that is the whole point of this function.
 * MapLibre's line placements — `line` and `line-center` alike — refuse a label that
 * does not fit within the geometry's own length, so the read-out silently vanished on
 * exactly the radii a user most wants it for: measured on a fresh map, "30 km",
 * "120 km" and "400 km" all failed to render and only a 1200 km radius appeared. Plain
 * `line` was worse still, spacing labels every 250 px from a half-spacing offset, which
 * put the one label near the rim instead of the middle.
 *
 * A point at the midpoint has neither problem. It always draws, it is exactly halfway,
 * and `text-rotate` lays it along the line — which is what OpenLayers' `placement:
 * 'line'` produces and what the read-out has always looked like there.
 */
function measureFeatures([from, to]: [ProjectedPosition, ProjectedPosition]): Feature[] {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];

    // **The angle from horizontal, not a compass bearing.** `text-rotate` turns the
    // glyphs clockwise from ordinary left-to-right, so an east-west line wants 0 — a
    // bearing would call that 90 and stand the read-out on end. Negated because these
    // are projected meters, where y runs north, while a clockwise screen rotation runs
    // the other way.
    let rotation = -(Math.atan2(dy, dx) * 180) / Math.PI;
    // Kept upright: past a quarter turn either way the text would read upside down, and
    // a half turn puts it the right way up along the very same line.
    if (rotation > 90) rotation -= 180;
    if (rotation < -90) rotation += 180;

    const shared = {
        color: getInertHandleColor(),
        labelColor: getLabelFillColor(),
        haloColor: getLabelHaloColor(),
    };

    return [
        {
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: [from, to].map(toLonLat)},
            properties: shared,
        },
        {
            type: 'Feature',
            geometry: {type: 'Point', coordinates: toLonLat([from[0] + dx / 2, from[1] + dy / 2])},
            // **The ground distance, not the projected one the line is drawn in.** These
            // are EPSG:3857 metres, inflated by 1/cos(latitude) — a 377 km radius at 50
            // degrees north measures 587 of them — and the number beside the line is the
            // one the operator reads and the dialog states. @see mercator.ts
            properties: {
                ...shared,
                label: formatDistance(groundLength(Math.hypot(dx, dy), latitudeFromMercatorY((from[1] + to[1]) / 2))),
                rotation,
            },
        },
    ];
}
