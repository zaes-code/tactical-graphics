/**
 * The MapLibre hatch size across fractional zooms, against a recording fake map.
 *
 * MapLibre lays a `fill-pattern` out in the pixels of `floor(zoom)`, so a hatch registered at
 * its own size grows with the map between integer zooms: restricted terrain's 10 px tile
 * repeated every 15 px at zoom 5.6, where OpenLayers draws it every 10 (measured 2026-09-26).
 * What is asserted here is the size MapLibre ends up drawing, worked out the way its fill
 * shader does: the image's width over its `pixelRatio`, times the growth.
 *
 * WebGL and a real canvas do not exist in jsdom, so the raster is a stub of the right size.
 */
import {TacticalGraphicName, resetTacticalGraphicsConfig} from '@zaes/tactical-graphics';
import {buildTacticalGraphic, paintTacticalGraphic} from '../maplibreAdapter';
import {NativeLayerRenderer} from './NativeLayerRenderer';

interface Registered {
    width: number;
    pixelRatio: number;
}

/** Just enough of `maplibregl.Map` for the renderer, recording the images it registers. */
class FakeMap {
    zoom = 5;
    readonly images = new Map<string, Registered>();
    readonly sources = new Map<string, {data: {features: Array<{properties?: Record<string, unknown>}>}; setData(d: unknown): void}>();

    getZoom = () => this.zoom;
    getBearing = () => 0;
    on = () => undefined;
    off = () => undefined;
    setGlyphs = () => undefined;
    project = () => ({x: 0, y: 0});
    queryRenderedFeatures = () => [];
    getLayer = () => undefined;
    getStyle = () => ({layers: []});
    addLayer = () => undefined;
    removeLayer = () => undefined;
    removeSource = () => undefined;
    setLayoutProperty = () => undefined;
    setPaintProperty = () => undefined;
    setFilter = () => undefined;
    moveLayer = () => undefined;

    hasImage = (id: string) => this.images.has(id);
    addImage = (id: string, image: {width: number}, options?: {pixelRatio?: number}) => {
        this.images.set(id, {width: image.width, pixelRatio: options?.pixelRatio ?? 1});
    };

    addSource = (id: string, spec: {data: {features: []}}) => {
        this.sources.set(id, {
            data: spec.data,
            setData(d: unknown) {
                this.data = d as typeof spec.data;
            },
        });
    };
    getSource = (id: string) => this.sources.get(id);

    getBounds = () => {
        const half = 180 / Math.pow(2, this.zoom);
        return {
            getWest: () => 10 - half,
            getEast: () => 10 + half,
            getSouth: () => Math.max(-85, 40 - half / 2),
            getNorth: () => Math.min(85, 40 + half / 2),
        };
    };
}

beforeEach(() => {
    resetTacticalGraphicsConfig();
    // A 2D context whose only job is to hand back pixels of the size asked for.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
        const canvas = this;
        return {
            scale: () => undefined,
            beginPath: () => undefined,
            moveTo: () => undefined,
            lineTo: () => undefined,
            stroke: () => undefined,
            getImageData: (_x: number, _y: number, w: number, h: number) => ({width: w, height: h, data: new Uint8ClampedArray(w * h * 4), canvas}),
        } as never;
    });
});

afterEach(() => vi.restoreAllMocks());

describe('the MapLibre hatch, across fractional zooms', () => {
    const area = {type: 'Polygon' as const, coordinates: [[[9.8, 39.9], [10.2, 39.9], [10.2, 40.1], [9.8, 40.1], [9.8, 39.9]]]};

    it('draws at the spec size, as OpenLayers does, however far between integer zooms the map is', () => {
        const map = new FakeMap();
        const renderer = new NativeLayerRenderer(map as never);
        const sizes = new Set<number>();
        for (const name of [TacticalGraphicName.RestrictedTerrain, TacticalGraphicName.SeverelyRestrictedTerrain]) {
            const graphic = buildTacticalGraphic(name, area)!;
            renderer.add(graphic);
            // The size the paint layer asks for, read from the spec rather than the image id.
            for (const paint of paintTacticalGraphic(graphic, {resolution: 1000} as never)) {
                if (paint.fill?.pattern) sizes.add(paint.fill.pattern.sizePx);
            }
        }
        expect(Array.from(sizes)).toEqual([10]);
        const sizePx = 10;

        const off: string[] = [];
        let measured = 0;
        for (let zoom = 3; zoom <= 12; zoom += 0.07) {
            map.zoom = zoom;
            renderer.realize();
            const growth = Math.pow(2, zoom - Math.floor(zoom));
            for (const feature of map.getSource('tg-fills')?.data.features ?? []) {
                const id = String(feature.properties?.pattern ?? '');
                if (!id) continue;
                const image = map.images.get(id);
                expect(image).toBeDefined();
                const drawn = (image!.width / image!.pixelRatio) * growth;
                measured++;
                if (Math.abs(drawn / sizePx - 1) > 0.026) off.push(`zoom ${zoom.toFixed(2)}: ${drawn.toFixed(2)} px for ${sizePx}`);
            }
        }

        expect(measured).toBeGreaterThan(200);
        expect(off).toEqual([]);
    });

    it('registers whole pixel ratios, since MapLibre truncates a fractional one', () => {
        const map = new FakeMap();
        const renderer = new NativeLayerRenderer(map as never);
        renderer.add(buildTacticalGraphic(TacticalGraphicName.RestrictedTerrain, area)!);
        for (const zoom of [4.1, 5.617, 7.5, 9.93]) {
            map.zoom = zoom;
            renderer.realize();
        }
        const ratios = Array.from(map.images.values()).map(i => i.pixelRatio);
        expect(ratios.length).toBeGreaterThan(1);
        expect(ratios.every(Number.isInteger)).toBe(true);
    });
});
