/**
 * The MapLibre renderer across many zoom changes, against a recording fake map.
 *
 * Written for the defect it guards (user's report, 2026-09-21): the first zoom correction for
 * dash length rewrote each dash layer's `line-dasharray` on every realize. Tiles MapLibre had
 * already built kept pointing at the old pattern, its line render threw in
 * `setConstantDashPositions`, and the frame aborted before the symbol layer drew. Zooming all
 * the way in and out a few times left the sample gallery with no labels at all.
 *
 * WebGL does not exist in jsdom, so the crash itself cannot happen here. What can be asserted
 * is the thing that caused it, and the result the user cares about:
 *
 * - a dash layer's pattern is fixed when it is added and **never** set again;
 * - every dash drawn, once MapLibre's own zoom stretch is applied, stays within the cap;
 * - the layer count stays a small constant however long the zooming goes on;
 * - the labels are still in the symbol source at the end.
 *
 * The on-screen half is `npm run sweep:zoom` (`scripts/zoom-cycle-labels.mjs`), which drives
 * the real app and fails on the page errors the crash produced.
 */
import {TacticalGraphicName, TacticalGraphicStatus, DASH_CAP_PX, resetTacticalGraphicsConfig} from '@zaes/tactical-graphics';
import {buildTacticalGraphic} from '../maplibreAdapter';
import {NativeLayerRenderer} from './NativeLayerRenderer';
import {dashZoomStep} from './paintToLayers';

interface FakeLayer {
    id: string;
    type: string;
    source?: string;
    paint?: Record<string, unknown>;
}

/** Just enough of `maplibregl.Map` for the renderer, recording what it is asked to do. */
class FakeMap {
    zoom = 5;
    readonly layers = new Map<string, FakeLayer>();
    readonly sources = new Map<string, {data: {features: Array<{properties?: Record<string, unknown>}>}; setData(d: unknown): void}>();
    readonly paintWrites: Array<{layer: string; property: string}> = [];

    // The gallery sits around 10E 40N; the bounds follow the zoom so culling behaves.
    private readonly center = [10, 40];

    getZoom = () => this.zoom;
    on = () => undefined;
    off = () => undefined;
    setGlyphs = () => undefined;
    hasImage = () => true;
    addImage = () => undefined;
    project = () => ({x: 0, y: 0});
    queryRenderedFeatures = () => [];
    getLayer = (id: string) => this.layers.get(id);
    getStyle = () => ({layers: Array.from(this.layers.values())});
    removeLayer = (id: string) => this.layers.delete(id);
    removeSource = (id: string) => this.sources.delete(id);
    setLayoutProperty = () => undefined;
    setFilter = () => undefined;
    moveLayer = () => undefined;

    addSource = (id: string, spec: {data: {features: []}}) => {
        const source = {
            data: spec.data,
            setData(d: unknown) {
                this.data = d as typeof spec.data;
            },
        };
        this.sources.set(id, source);
    };
    getSource = (id: string) => this.sources.get(id);

    addLayer = (layer: FakeLayer) => {
        if (this.layers.has(layer.id)) throw new Error(`layer ${layer.id} added twice`);
        this.layers.set(layer.id, {...layer, paint: {...layer.paint}});
    };

    setPaintProperty = (layer: string, property: string, value: unknown) => {
        this.paintWrites.push({layer, property});
        const target = this.layers.get(layer);
        if (target) target.paint = {...target.paint, [property]: value};
    };

    getBounds = () => {
        // Half a world at zoom 0, halving per level, around the gallery.
        const half = 180 / Math.pow(2, this.zoom);
        const [lon, lat] = this.center;
        return {
            getWest: () => lon - half,
            getEast: () => lon + half,
            getSouth: () => Math.max(-85, lat - half / 2),
            getNorth: () => Math.min(85, lat + half / 2),
        };
    };
}

/** The graphics whose dashes this is about: two symbol dashes and a status dash. */
function sampleGraphics() {
    const line = (lon: number) => ({type: 'LineString' as const, coordinates: [[lon, 40], [lon + 0.6, 40.05], [lon + 0.62, 40.2]]});
    return [
        buildTacticalGraphic(TacticalGraphicName.Counterattack, line(9), {designation: 'ALPHA'}),
        buildTacticalGraphic(TacticalGraphicName.FordEasy, line(10)),
        buildTacticalGraphic(TacticalGraphicName.PhaseLine, {type: 'LineString', coordinates: [[9, 39.6], [11, 39.6]]}, {
            designation: 'BRAVO',
            status: TacticalGraphicStatus.planned,
        }),
    ].filter((g): g is NonNullable<typeof g> => !!g);
}

/** Full zoom-in, full zoom-out, several times, in the fractional steps a wheel produces. */
function zoomCycles(cycles: number): number[] {
    const out: number[] = [];
    for (let c = 0; c < cycles; c++) {
        for (let z = 3; z <= 14; z += 0.37) out.push(z);
        for (let z = 14; z >= 3; z -= 0.41) out.push(z);
    }
    return out;
}

function labelTexts(map: FakeMap): string[] {
    const symbols = map.getSource('tg-symbols');
    return (symbols?.data.features ?? []).map(f => String(f.properties?.text ?? f.properties?.label ?? '')).filter(Boolean);
}

beforeEach(() => resetTacticalGraphicsConfig());

describe('the MapLibre dash layers, across repeated zooming', () => {
    function driven(cycles = 3) {
        const map = new FakeMap();
        const renderer = new NativeLayerRenderer(map as never);
        for (const graphic of sampleGraphics()) renderer.add(graphic);
        map.zoom = 8;
        renderer.flush();
        const before = labelTexts(map);
        for (const zoom of zoomCycles(cycles)) {
            map.zoom = zoom;
            renderer.realize();
        }
        map.zoom = 8;
        renderer.realize();
        return {map, before, after: labelTexts(map)};
    }

    it('never rewrites a live layer’s dash pattern', () => {
        const {map} = driven();
        // The write that crashed MapLibre's line render and took the labels with it.
        expect(map.paintWrites.filter(w => w.property === 'line-dasharray')).toEqual([]);
    });

    it('draws some dashes at all, so the assertions below are about something', () => {
        const {map} = driven(1);
        const dashed = Array.from(map.layers.values()).filter(l => Array.isArray(l.paint?.['line-dasharray']));
        expect(dashed.length).toBeGreaterThan(0);
    });

    it('keeps every drawn dash within the cap, and no more than a step short of it, at every zoom', () => {
        const map = new FakeMap();
        const renderer = new NativeLayerRenderer(map as never);
        for (const graphic of sampleGraphics()) renderer.add(graphic);
        renderer.flush();

        const tooLong: string[] = [];
        const tooShort: string[] = [];
        let measured = 0;
        for (const zoom of zoomCycles(1)) {
            map.zoom = zoom;
            renderer.realize();
            const stretch = Math.pow(2, zoom - Math.floor(zoom));
            for (const layer of Array.from(map.layers.values())) {
                const dash = layer.paint?.['line-dasharray'];
                if (!Array.isArray(dash) || !layer.id.startsWith('tg-line-')) continue;
                const features = map.getSource(layer.source ?? layer.id)?.data.features ?? [];
                if (!features.length) continue;
                const width = Number(features[0].properties?.width);
                // What MapLibre draws: the array, in line widths, stretched with the zoom.
                const drawn = (dash as number[]).map(d => d * width * stretch);
                measured++;
                if (Math.max(...drawn) > DASH_CAP_PX + 1e-6) tooLong.push(`zoom ${zoom.toFixed(2)} ${layer.id}: [${drawn.map(d => d.toFixed(2))}]`);
                // The correction rounds up to a quarter of a zoom level, so what is drawn is
                // between 2^-0.25 (84%) and 100% of the pattern the layer was keyed for.
                const step = dashZoomStep(zoom);
                const keyed = (dash as number[])[0] * width * Math.pow(2, step);
                if (drawn[0] / keyed < Math.pow(2, -0.25) - 1e-6) tooShort.push(`zoom ${zoom.toFixed(2)} ${layer.id}`);
            }
        }
        expect(measured).toBeGreaterThan(20);
        expect(tooLong).toEqual([]);
        expect(tooShort).toEqual([]);
    });

    it('holds the layer count to a small constant however long the zooming goes on', () => {
        const short = driven(1).map.layers.size;
        const long = driven(6).map.layers.size;
        expect(long).toBe(short);
        expect(long).toBeLessThan(60);
    });

    it('still carries every label after zooming all the way in and out, repeatedly', () => {
        const {before, after} = driven(4);
        expect(before.length).toBeGreaterThan(0);
        expect(after.sort()).toEqual(before.sort());
        expect(after.some(t => t.includes('ALPHA'))).toBe(true);
        expect(after.some(t => t.includes('BRAVO'))).toBe(true);
    });
});
