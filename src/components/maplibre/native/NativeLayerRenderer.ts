import type {FeatureCollection} from 'geojson';
import type {GeoJSONSource, Map as MapLibreMap} from 'maplibre-gl';
import type { PaintContext} from '@zaes/tactical-graphics';
import {resolutionOf} from '../projection';
import {paintTacticalGraphic, type MapLibreTacticalGraphic} from '../maplibreAdapter';
import {
    GRAPHIC_ID_PROPERTY,
    bucketPaints,
    mergeBuckets,
    circleLayer,
    featureCollection,
    fillLayer,
    lineLayer,
    renderHatchImage,
    symbolLayer,
} from './paintToLayers';

/**
 * # Path B — realise the geometry, then let MapLibre draw it
 *
 * The declarative renderer. Every mark becomes a GeoJSON feature in a source and
 * every source is drawn by a native layer, so the GPU does the work and MapLibre
 * owns labelling and collision.
 *
 * ## The whole difficulty, in one method
 *
 * {@link realise}. A `line` layer renders what its source holds, and an obstacle
 * line's teeth are not in the source — they are a function of the current
 * resolution. So the geometry has to be rebuilt and re-uploaded **every time the
 * zoom changes**, which is the cost `ai/maplibre-renderer.md` lists as risk 1 and
 * says the spike must measure rather than estimate. {@link lastRealiseMs} and
 * {@link lastFeatureCount} are that measurement.
 *
 * Panning is free — the geometry is in world coordinates and MapLibre transforms
 * it — so this is bound to zoom changes only, which is the saving grace. An eased
 * zoom, though, is many zoom changes.
 *
 * ## Debounced to `zoom`, not `render`
 *
 * The overlay redraws per frame because redrawing is cheap. Re-realising is not:
 * it walks every graphic's paint function, reprojects every coordinate to lon/lat
 * and hands MapLibre new GeoJSON to parse and re-tile. Doing that per frame of an
 * eased zoom is what would make this approach untenable, so it is deferred to
 * `zoomend` with a coarse threshold during the gesture. The visible consequence is
 * that decorations are momentarily the wrong screen size mid-zoom — teeth stretch
 * and snap back — which an overlay never does.
 */

const SOURCE_PREFIX = 'tg-';

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
const ZOOM_REALISE_THRESHOLD = 0.34;

export class NativeLayerRenderer {
    private readonly graphics: MapLibreTacticalGraphic[] = [];
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
    private lastRealisedZoom = Number.NaN;
    private installed = false;

    /** Milliseconds the last geometry realisation took. The number the spike is for. */
    lastRealiseMs = 0;
    /** GeoJSON features uploaded on that realisation. */
    lastFeatureCount = 0;
    /** How many times the geometry has been rebuilt since construction. */
    realiseCount = 0;
    /** Set while a coalesced rebuild is pending. @see scheduleRealise */
    private realisePending = false;

    private readonly onZoom = () => {
        const zoom = this.map.getZoom();
        if (Math.abs(zoom - this.lastRealisedZoom) < ZOOM_REALISE_THRESHOLD) return;
        this.realise();
    };
    private readonly onZoomEnd = () => this.realise();

    private measureCanvas: CanvasRenderingContext2D | null = null;

    constructor(private readonly map: MapLibreMap) {
        this.install();
        map.on('zoom', this.onZoom);
        map.on('zoomend', this.onZoomEnd);
    }

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

        for (const kind of ['fills', 'circles', 'symbols']) {
            this.map.addSource(SOURCE_PREFIX + kind, {type: 'geojson', data: featureCollection([])});
        }
        this.map.addLayer(fillLayer('tg-fill', SOURCE_PREFIX + 'fills'));
        this.map.addLayer(circleLayer('tg-circle', SOURCE_PREFIX + 'circles'));
        this.map.addLayer(symbolLayer('tg-symbol', SOURCE_PREFIX + 'symbols', FONT_STACK));
        this.layerIds.push('tg-fill', 'tg-circle', 'tg-symbol');
        this.installed = true;
    }

    add(graphic: MapLibreTacticalGraphic): void {
        this.graphics.push(graphic);
        this.scheduleRealise();
    }

    /**
     * Rebuilds once, after the current task finishes, however many times it is asked.
     *
     * `add` used to realise immediately, which made drawing N graphics cost N full
     * rebuilds of all N — quadratic, and each one re-serialises every source and
     * makes MapLibre re-tile it in the worker. Drawing the 213-graphic gallery ran
     * 213 rebuilds and took 4.4 s; coalesced it is one rebuild.
     *
     * A microtask, not `requestAnimationFrame`: it still collapses a whole burst of
     * adds into one rebuild, but it lands before the next paint and before anything
     * that merely awaits — so a caller that adds and then reads the map sees the
     * result, and no frame ever renders the intermediate state. `flush` is there for
     * the synchronous case.
     */
    private scheduleRealise(): void {
        if (this.realisePending) return;
        this.realisePending = true;
        Promise.resolve().then(() => {
            if (!this.realisePending) return;
            this.realisePending = false;
            this.realise();
        });
    }

    /** Runs any pending rebuild now. For a caller that cannot wait a microtask. */
    flush(): void {
        if (!this.realisePending) return;
        this.realisePending = false;
        this.realise();
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
        this.scheduleRealise();
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
    realise(): void {
        // A scheduled rebuild is now redundant — this one supersedes it.
        this.realisePending = false;
        const started = performance.now();
        const resolution = resolutionOf(this.map);
        const context: PaintContext = {resolution, measureText: this.measureText};

        // Bucketed per graphic rather than in one pass, so each feature can be stamped
        // with the graphic it came from — which is what makes a rendered mark
        // hit-testable back to its symbol. @see GRAPHIC_ID_PROPERTY
        const buckets = mergeBuckets(
            this.graphics.map(graphic => bucketPaints(paintTacticalGraphic(graphic, context), graphic.id)),
        );
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
            const id = `tg-line-${key.replace(/[^a-z0-9]/gi, '_')}`;
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

        this.lastRealisedZoom = this.map.getZoom();
        this.lastFeatureCount = features;
        this.lastRealiseMs = performance.now() - started;
        this.realiseCount++;
    }

    private setData(kind: string, features: Parameters<typeof featureCollection>[0]): void {
        (this.map.getSource(SOURCE_PREFIX + kind) as GeoJSONSource | undefined)?.setData(featureCollection(features));
    }

    /** The graphic with this id, or undefined. */
    find(id: string): MapLibreTacticalGraphic | undefined {
        return this.graphics.find(g => g.id === id);
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
        this.scheduleRealise();
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

    destroy(): void {
        this.map.off('zoom', this.onZoom);
        this.map.off('zoomend', this.onZoomEnd);
    }
}
