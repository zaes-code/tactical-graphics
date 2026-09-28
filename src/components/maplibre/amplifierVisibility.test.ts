/**
 * # "Name only" through the MapLibre façade
 *
 * The choice is view state: the engine holds it on the graphics it draws and nowhere else,
 * a restore rebuilds every graphic in full, and nothing in the published renderer touches
 * browser storage. These pin that contract. @see TacticalGraphicsEngine.setAmplifiersHidden
 *
 * The OpenLayers twin is `openlayers/amplifierVisibility.test.ts`; the two assert the same
 * sequence so the engines cannot drift apart on it.
 *
 * Until 2026-09-25 this restore read a key out of the host's local storage, the demo's own
 * record of the choice, which is how the demo's view state came to ship in the library.
 */

import type {Feature as GeoFeature, Geometry, Position} from 'geojson';
import {TacticalGraphicName, toSnapshot, type TacticalGraphicsEngine} from '@zaes/tactical-graphics';
import {createTacticalGraphics} from './createTacticalGraphics';
import {NativeLayerRenderer} from './native/NativeLayerRenderer';
import {MapLibreInteractions} from './interaction/MapLibreInteractions';
import {buildTacticalGraphic, type MapLibreTacticalGraphic} from './maplibreAdapter';

/** Just enough of `maplibregl.Map` for the renderer and the interaction layer. */
class FakeMap {
    zoom = 5;
    private readonly layers = new Map<string, {id: string; paint?: Record<string, unknown>}>();
    private readonly sources = new Map<string, {data: unknown; setData(d: unknown): void}>();

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
const phaseLine = (symbolId: string): GeoFeature<Geometry> => ({
    type: 'Feature',
    geometry: {type: 'LineString', coordinates: [[-1, 0], [0, 0.5], [1, 0]]},
    properties: {
        role: 'base',
        symbolId,
        graphicName: TacticalGraphicName.PhaseLine,
        tacticalGraphic: {name: TacticalGraphicName.PhaseLine, designation: 'BLUE'},
    },
} as GeoFeature<Geometry>);

function makeEngine(): {engine: TacticalGraphicsEngine; renderer: NativeLayerRenderer} {
    const map = new FakeMap();
    const renderer = new NativeLayerRenderer(map as never);
    return {engine: createTacticalGraphics(map as never, {renderer}), renderer};
}

describe('the MapLibre engine holds "name only" in memory', () => {
    it('draws and reports the choice, per graphic', () => {
        const {engine, renderer} = makeEngine();
        engine.restore(toSnapshot([phaseLine('mlb-1'), phaseLine('mlb-2')]));

        expect(engine.amplifiersHidden?.('mlb-1')).toBe(false);
        engine.setAmplifiersHidden?.('mlb-1', true);
        expect(engine.amplifiersHidden?.('mlb-1')).toBe(true);
        expect(engine.amplifiersHidden?.('mlb-2')).toBe(false);

        // On the paint features, which is what makes it drawn.
        const held = renderer.find('mlb-1')!;
        expect(held.graphic.hideAmplifiers).toBe(true);
        expect(held.labels?.hideAmplifiers).toBe(true);

        engine.setAmplifiersHidden?.('mlb-1', false);
        expect(engine.amplifiersHidden?.('mlb-1')).toBe(false);
        expect(renderer.find('mlb-1')!.graphic.hideAmplifiers).toBeUndefined();
        engine.destroy();
    });

    it('never writes the choice into a snapshot', () => {
        const {engine} = makeEngine();
        engine.restore(toSnapshot([phaseLine('mlb-1')]));
        engine.setAmplifiersHidden?.('mlb-1', true);
        expect(JSON.stringify(engine.snapshot())).not.toContain('hideAmplifiers');
        engine.destroy();
    });

    it('draws a restored graphic in full, keeping its id so the host can re-apply', () => {
        const {engine} = makeEngine();
        engine.restore(toSnapshot([phaseLine('mlb-1')]));
        engine.setAmplifiersHidden?.('mlb-1', true);

        engine.restore(engine.snapshot());
        expect(engine.amplifiersHidden?.('mlb-1')).toBe(false);

        // The documented recipe: the id survived, so the host's own record finds it.
        engine.setAmplifiersHidden?.('mlb-1', true);
        expect(engine.amplifiersHidden?.('mlb-1')).toBe(true);
        engine.destroy();
    });

    it('forgets everything on clearAll, and ignores an id it does not hold', () => {
        const {engine} = makeEngine();
        engine.restore(toSnapshot([phaseLine('mlb-1')]));
        engine.setAmplifiersHidden?.('mlb-1', true);
        engine.clearAll();
        expect(engine.amplifiersHidden?.('mlb-1')).toBe(false);

        expect(() => engine.setAmplifiersHidden?.('nobody', true)).not.toThrow();
        expect(engine.amplifiersHidden?.('nobody')).toBe(false);
        engine.destroy();
    });

    it('touches no browser storage', () => {
        const touched: string[] = [];
        const storage = window.localStorage;
        const spy = {
            getItem: (k: string) => (touched.push(`get ${k}`), null),
            setItem: (k: string) => void touched.push(`set ${k}`),
            removeItem: (k: string) => void touched.push(`remove ${k}`),
        };
        Object.defineProperty(window, 'localStorage', {value: spy, configurable: true});
        try {
            const {engine} = makeEngine();
            engine.restore(toSnapshot([phaseLine('mlb-1')]));
            engine.setAmplifiersHidden?.('mlb-1', true);
            engine.amplifiersHidden?.('mlb-1');
            engine.restore(engine.snapshot());
            engine.destroy();
        } finally {
            Object.defineProperty(window, 'localStorage', {value: storage, configurable: true});
        }
        expect(touched).toEqual([]);
    });
});

describe('a drag keeps the choice', () => {
    /*
     * Each drag step rebuilds the graphic from its portable bag, which does not carry the
     * flag, so a drag used to put every amplifier straight back. Driven through the private
     * `dragTo` with a linear stub projection, the way `dragPathIndependence.test.ts` does.
     */
    const PX_PER_DEGREE = 10;
    const stubMap = () => ({
        on: () => {},
        off: () => {},
        getZoom: () => 5,
        getCanvasContainer: () => null,
        project: ([lng, lat]: [number, number]) => ({x: lng * PX_PER_DEGREE, y: -lat * PX_PER_DEGREE}),
        unproject: ([x, y]: [number, number]) => ({lng: x / PX_PER_DEGREE, lat: -y / PX_PER_DEGREE}),
        dragPan: {enable: () => {}, disable: () => {}},
    });

    function translated(graphic: MapLibreTacticalGraphic): MapLibreTacticalGraphic {
        let last: MapLibreTacticalGraphic | undefined;
        const renderer = {replace: (_id: string, next: MapLibreTacticalGraphic) => (last = next), setMeasure: () => {}, find: () => undefined};
        const interactions = new MapLibreInteractions(stubMap() as never, renderer as never);
        const reach = interactions as unknown as {mode: string; dragging: unknown; dragTo(to: Position): void};
        const from: Position = [0, 0];
        reach.mode = 'translate';
        reach.dragging = {
            graphic, vertex: -1, insertAt: -1, onCenter: false, onPivot: false, handle: -1, origin: from,
            start: {geometry: graphic.base.geometry, properties: graphic.properties},
            started: true, startPixel: {x: 0, y: 0},
        };
        reach.dragTo([0.5, 0.25]);
        interactions.destroy();
        expect(last).toBeDefined();
        return last!;
    }

    const built = () => buildTacticalGraphic(
        TacticalGraphicName.PhaseLine,
        {type: 'LineString', coordinates: [[-1, 0], [0, 0.5], [1, 0]]},
        {designation: 'BLUE'},
    )!;

    it('carries "name only" onto the rebuilt graphic and its labels', () => {
        const graphic = built();
        const hidden = {
            ...graphic,
            graphic: {...graphic.graphic, hideAmplifiers: true},
            labels: graphic.labels ? {...graphic.labels, hideAmplifiers: true} : graphic.labels,
        };
        const moved = translated(hidden);
        expect(moved.graphic.hideAmplifiers).toBe(true);
        if (moved.labels) expect(moved.labels.hideAmplifiers).toBe(true);
        expect(moved.base.geometry).not.toEqual(graphic.base.geometry);
    });

    it('adds nothing to a graphic drawn in full', () => {
        const moved = translated(built());
        expect(moved.graphic.hideAmplifiers).toBeUndefined();
    });
});
