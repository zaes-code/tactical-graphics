/**
 * # "Name only" through the OpenLayers façade
 *
 * The choice is view state: the engine holds it on the features it draws and nowhere else,
 * a restore rebuilds every graphic in full, and nothing in the published renderer touches
 * browser storage. These pin that contract. @see TacticalGraphicsEngine.setAmplifiersHidden
 *
 * The MapLibre twin is `maplibre/amplifierVisibility.test.ts`; the two assert the same
 * sequence so the engines cannot drift apart on it.
 */

import Map from 'ol/Map';
import View from 'ol/View';
import type {Feature as GeoFeature, Geometry} from 'geojson';
import {TacticalGraphicName, toSnapshot} from '@zaes/tactical-graphics';
import {createTacticalGraphics} from './createTacticalGraphics';
import {TacticalGraphicsManager} from './TacticalGraphicsManager';

beforeAll(() => {
    // jsdom has no `ResizeObserver`, and an OpenLayers `Map` given a target constructs one.
    if (!('ResizeObserver' in window)) {
        (window as unknown as {ResizeObserver: unknown}).ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    }
});

function makeMap(): Map {
    const target = document.createElement('div');
    Object.defineProperty(target, 'clientWidth', {value: 800});
    Object.defineProperty(target, 'clientHeight', {value: 600});
    document.body.appendChild(target);
    return new Map({target, view: new View({center: [0, 0], zoom: 4})});
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

/** Every feature on the map that belongs to `symbolId`. */
const featuresOf = (map: Map, symbolId: string) =>
    map.getLayers().getArray().flatMap(layer => {
        const source = (layer as unknown as {getSource?: () => {getFeatures?: () => {get(k: string): unknown}[]} | null}).getSource?.();
        return source?.getFeatures?.()?.filter(f => f.get('symbolId') === symbolId) ?? [];
    });

describe('the OpenLayers engine holds "name only" in memory', () => {
    it('draws and reports the choice, per graphic', () => {
        const map = makeMap();
        const engine = createTacticalGraphics(map);
        engine.restore(toSnapshot([phaseLine('ol-1'), phaseLine('ol-2')]));

        expect(engine.amplifiersHidden?.('ol-1')).toBe(false);
        engine.setAmplifiersHidden?.('ol-1', true);
        expect(engine.amplifiersHidden?.('ol-1')).toBe(true);
        expect(engine.amplifiersHidden?.('ol-2')).toBe(false);

        // On the features the style functions read, which is what makes it drawn.
        const stamped = featuresOf(map, 'ol-1');
        expect(stamped.length).toBeGreaterThan(0);
        expect(stamped.every(f => f.get('hideAmplifiers') === true)).toBe(true);

        engine.setAmplifiersHidden?.('ol-1', false);
        expect(engine.amplifiersHidden?.('ol-1')).toBe(false);
        expect(featuresOf(map, 'ol-1').some(f => f.get('hideAmplifiers'))).toBe(false);
        engine.destroy();
    });

    it('never writes the choice into a snapshot', () => {
        const engine = createTacticalGraphics(makeMap());
        engine.restore(toSnapshot([phaseLine('ol-1')]));
        engine.setAmplifiersHidden?.('ol-1', true);
        expect(JSON.stringify(engine.snapshot())).not.toContain('hideAmplifiers');
        engine.destroy();
    });

    it('draws a restored graphic in full, keeping its id so the host can re-apply', () => {
        const engine = createTacticalGraphics(makeMap());
        engine.restore(toSnapshot([phaseLine('ol-1')]));
        engine.setAmplifiersHidden?.('ol-1', true);

        engine.restore(engine.snapshot());
        expect(engine.getSelection()).toBeNull();
        expect(engine.amplifiersHidden?.('ol-1')).toBe(false);

        // The documented recipe: the id survived, so the host's own record finds it.
        engine.setAmplifiersHidden?.('ol-1', true);
        expect(engine.amplifiersHidden?.('ol-1')).toBe(true);
        engine.destroy();
    });

    it('forgets everything on clearAll, and ignores an id it does not hold', () => {
        const engine = createTacticalGraphics(makeMap());
        engine.restore(toSnapshot([phaseLine('ol-1')]));
        engine.setAmplifiersHidden?.('ol-1', true);
        engine.clearAll();
        expect(engine.amplifiersHidden?.('ol-1')).toBe(false);

        expect(() => engine.setAmplifiersHidden?.('nobody', true)).not.toThrow();
        expect(engine.amplifiersHidden?.('nobody')).toBe(false);
        engine.destroy();
    });

    it('keeps the choice when the graphic is moved', () => {
        const map = makeMap();
        const manager = new TacticalGraphicsManager(map);
        const engine = createTacticalGraphics(map, {manager});
        engine.restore(toSnapshot([phaseLine('ol-1')]));
        engine.setAmplifiersHidden?.('ol-1', true);

        // Through the holder, which is what every translate drag calls.
        const holder = manager.getFeatureControllerBySymbolId('ol-1')!;
        const before = JSON.stringify(engine.snapshot().features[0].geometry);
        holder.handleTranslate(50_000, 0);
        expect(JSON.stringify(engine.snapshot().features[0].geometry)).not.toBe(before);
        expect(engine.amplifiersHidden?.('ol-1')).toBe(true);
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
            const engine = createTacticalGraphics(makeMap());
            engine.restore(toSnapshot([phaseLine('ol-1')]));
            engine.setAmplifiersHidden?.('ol-1', true);
            engine.amplifiersHidden?.('ol-1');
            engine.restore(engine.snapshot());
            engine.destroy();
        } finally {
            Object.defineProperty(window, 'localStorage', {value: storage, configurable: true});
        }
        expect(touched).toEqual([]);
    });
});
