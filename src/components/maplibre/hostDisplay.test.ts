/**
 * # Removing and dimming one graphic
 *
 * A host that decides what is on the map, rather than the operator drawing it, takes
 * single graphics off and puts them back, and draws some fainter than others. These pin
 * that contract: removal is per id and deselects, hidden is simply removed, and opacity is
 * view state that reaches every mark the graphic drew and never the snapshot.
 * @see NativeLayerRenderer.remove
 * @see NativeLayerRenderer.setOpacity
 */

import type {Feature as GeoFeature, Geometry} from 'geojson';
import {TacticalGraphicName, toSnapshot, type TacticalGraphicsEngine} from '@zaes/tactical-graphics';
import {createTacticalGraphics} from './createTacticalGraphics';
import {NativeLayerRenderer} from './native/NativeLayerRenderer';
import {
    GRAPHIC_ID_PROPERTY,
    OPACITY_PROPERTY,
    circleLayer,
    fillLayer,
    iconLayer,
    lineLayer,
    patternFillLayer,
    symbolLayer,
} from './native/paintToLayers';

/** Just enough of `maplibregl.Map` for the renderer and the interaction layer. */
class FakeMap {
    zoom = 5;
    private readonly layers = new Map<string, {id: string; paint?: Record<string, unknown>}>();
    readonly sources = new Map<string, {data: unknown; setData(d: unknown): void}>();

    getZoom = () => this.zoom;
    getBearing = () => 0;
    on = () => undefined;
    off = () => undefined;
    setGlyphs = () => undefined;
    hasImage = () => true;
    addImage = () => undefined;
    project = () => ({x: 0, y: 0});
    unproject = () => ({lng: 0, lat: 0});
    queryRenderedFeatures = () => [];
    getCanvasContainer = () => null;
    private readonly canvas = document.createElement('canvas');
    getCanvas = () => this.canvas;
    dragPan = {enable: () => undefined, disable: () => undefined};
    getLayer = (id: string) => this.layers.get(id);
    getStyle = () => ({layers: Array.from(this.layers.values())});
    removeLayer = (id: string) => this.layers.delete(id);
    removeSource = (id: string) => this.sources.delete(id);
    setLayoutProperty = () => undefined;
    setFilter = () => undefined;
    moveLayer = () => undefined;
    setPaintProperty = () => undefined;
    addSource = (id: string, spec: {data: unknown}) => {
        this.sources.set(id, {
            data: spec.data,
            setData(d: unknown) {
                this.data = d;
            },
        });
    };
    getSource = (id: string) => this.sources.get(id);
    addLayer = (layer: {id: string}) => void this.layers.set(layer.id, layer);
    getBounds = () => ({getWest: () => -180, getEast: () => 180, getSouth: () => -85, getNorth: () => 85});
}

/** A phase line with a designation, saved under `symbolId`. */
const phaseLine = (symbolId: string): GeoFeature<Geometry> =>
    ({
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates: [
                [-1, 0],
                [0, 0.5],
                [1, 0],
            ],
        },
        properties: {
            role: 'base',
            symbolId,
            graphicName: TacticalGraphicName.PhaseLine,
            tacticalGraphic: {name: TacticalGraphicName.PhaseLine, designation: 'BLUE'},
        },
    }) as GeoFeature<Geometry>;

function makeEngine(callbacks: {onChange?: () => void; onSelect?: (g: unknown) => void} = {}) {
    const map = new FakeMap();
    const renderer = new NativeLayerRenderer(map as never);
    const engine: TacticalGraphicsEngine = createTacticalGraphics(map as never, {renderer, ...callbacks});
    return {engine, renderer, map};
}

/** Every drawn feature's properties, from every source the renderer filled. */
function drawn(map: FakeMap): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    for (const {data} of Array.from(map.sources.values())) {
        const features = (data as {features?: Array<{properties?: Record<string, unknown>}>}).features ?? [];
        for (const f of features) if (f.properties?.[GRAPHIC_ID_PROPERTY]) out.push(f.properties);
    }
    return out;
}

const of = (map: FakeMap, id: string) => drawn(map).filter(p => p[GRAPHIC_ID_PROPERTY] === id);

describe('removing one graphic', () => {
    it('takes that graphic off and leaves the rest', () => {
        const {engine, renderer, map} = makeEngine();
        engine.restore(toSnapshot([phaseLine('a'), phaseLine('b')]));
        renderer.flush();
        expect(of(map, 'a').length).toBeGreaterThan(0);

        expect(engine.remove?.('a')).toBe(true);
        renderer.flush();
        expect(of(map, 'a')).toEqual([]);
        expect(of(map, 'b').length).toBeGreaterThan(0);
        expect(renderer.find('a')).toBeUndefined();
        expect(engine.snapshot().features.map(f => f.properties?.symbolId)).toEqual(['b']);
        engine.destroy();
    });

    it('reports a change, and nothing for an id it does not hold', () => {
        let changes = 0;
        const {engine} = makeEngine({onChange: () => changes++});
        engine.restore(toSnapshot([phaseLine('a')]));
        changes = 0;

        expect(engine.remove?.('nobody')).toBe(false);
        expect(changes).toBe(0);
        expect(engine.remove?.('a')).toBe(true);
        expect(changes).toBe(1);
        engine.destroy();
    });

    it('deselects the graphic it removes, and tells the host', () => {
        const selections: unknown[] = [];
        const {engine, renderer} = makeEngine({onSelect: g => selections.push(g)});
        engine.restore(toSnapshot([phaseLine('a'), phaseLine('b')]));
        engine.select('a');
        selections.length = 0;

        engine.remove?.('b');
        expect(renderer.selection).toBe('a');
        expect(selections).toEqual([]);

        engine.remove?.('a');
        expect(renderer.selection).toBeNull();
        expect(selections).toEqual([null]);
        engine.destroy();
    });

    it('hides by removing: the same graphic added back draws again under its id', () => {
        const {engine, renderer, map} = makeEngine();
        engine.restore(toSnapshot([phaseLine('a')]));
        const held = renderer.find('a')!;

        renderer.remove('a');
        renderer.flush();
        expect(of(map, 'a')).toEqual([]);

        renderer.add(held);
        renderer.flush();
        expect(of(map, 'a').length).toBeGreaterThan(0);
        engine.destroy();
    });
});

describe('dimming one graphic', () => {
    it('stamps its opacity on every mark it drew, and on no other graphic', () => {
        const {engine, renderer, map} = makeEngine();
        engine.restore(toSnapshot([phaseLine('a'), phaseLine('b')]));
        engine.setOpacity?.('a', 0.4);
        renderer.flush();

        const dimmed = of(map, 'a');
        expect(dimmed.length).toBeGreaterThan(1);
        expect(dimmed.every(p => p[OPACITY_PROPERTY] === 0.4)).toBe(true);
        expect(of(map, 'b').some(p => OPACITY_PROPERTY in p)).toBe(false);
        expect(renderer.opacityOf('a')).toBe(0.4);
        expect(renderer.opacityOf('b')).toBe(1);
        engine.destroy();
    });

    it('carries nothing extra once set back to 1, and clamps out-of-range values', () => {
        const {engine, renderer, map} = makeEngine();
        engine.restore(toSnapshot([phaseLine('a')]));
        engine.setOpacity?.('a', 0.4);
        engine.setOpacity?.('a', 1);
        renderer.flush();
        expect(of(map, 'a').some(p => OPACITY_PROPERTY in p)).toBe(false);

        engine.setOpacity?.('a', -2);
        expect(renderer.opacityOf('a')).toBe(0);
        engine.setOpacity?.('a', 7);
        expect(renderer.opacityOf('a')).toBe(1);
        engine.setOpacity?.('a', Number.NaN);
        expect(renderer.opacityOf('a')).toBe(1);
        engine.destroy();
    });

    it('survives the graphic being rebuilt in place', () => {
        const {engine, renderer, map} = makeEngine();
        engine.restore(toSnapshot([phaseLine('a')]));
        engine.setOpacity?.('a', 0.5);
        renderer.replace('a', {...renderer.find('a')!});
        renderer.flush();
        expect(of(map, 'a').every(p => p[OPACITY_PROPERTY] === 0.5)).toBe(true);
        engine.destroy();
    });

    it('is view state: never in the snapshot, gone with remove, clearAll and restore', () => {
        const {engine, renderer} = makeEngine();
        engine.restore(toSnapshot([phaseLine('a')]));
        engine.setOpacity?.('a', 0.5);
        expect(JSON.stringify(engine.snapshot())).not.toContain(`"${OPACITY_PROPERTY}"`);

        engine.restore(engine.snapshot());
        expect(renderer.opacityOf('a')).toBe(1);

        engine.setOpacity?.('a', 0.5);
        engine.clearAll();
        engine.restore(toSnapshot([phaseLine('a')]));
        expect(renderer.opacityOf('a')).toBe(1);

        engine.setOpacity?.('a', 0.5);
        renderer.remove('a');
        expect(renderer.setOpacity('a', 0.5)).toBe(false);
        expect(renderer.opacityOf('a')).toBe(1);
        engine.destroy();
    });

    it('is read by every layer a graphic draws through, defaulting to opaque', () => {
        const opaque = ['coalesce', ['get', OPACITY_PROPERTY], 1];
        const paintOf = (layer: unknown) => (layer as {paint: Record<string, unknown>}).paint;
        expect(paintOf(lineLayer('l', 's', undefined))['line-opacity']).toEqual(opaque);
        expect(paintOf(fillLayer('f', 's'))['fill-opacity']).toEqual(opaque);
        expect(paintOf(patternFillLayer('p', 's'))['fill-opacity']).toEqual(opaque);
        expect(paintOf(circleLayer('c', 's'))['circle-opacity']).toEqual(opaque);
        expect(paintOf(circleLayer('c', 's'))['circle-stroke-opacity']).toEqual(opaque);
        expect(paintOf(symbolLayer('t', 's', 'Noto Sans Bold'))['text-opacity']).toEqual(opaque);
        expect(paintOf(iconLayer('i', 's'))['icon-opacity']).toEqual(opaque);
    });
});
