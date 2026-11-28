/**
 * # Smooth lines through the OpenLayers façade
 *
 * `refreshStyles` rebuilds what the setting reshapes, in place: the same holders, the same
 * features, the same base, and a view choice such as "name only" left alone. The rendered line
 * work has to match what the shared adapter builds, which is what every other engine draws.
 * @see rebuildGraphicsForConfig
 */

import Map from 'ol/Map';
import View from 'ol/View';
import type {Feature as OLFeature} from 'ol';
import {toLonLat} from 'ol/proj';
import {
    buildPaintedGraphic,
    configureTacticalGraphics,
    resetTacticalGraphicsConfig,
    smoothingKindOf,
    type TacticalGraphicName,
} from '@zaes/tactical-graphics';
import {createTacticalGraphics} from './createTacticalGraphics';
import {sampleFeatureCollection} from '../maplibre/sampleGallery';

beforeAll(() => {
    if (!('ResizeObserver' in window)) {
        (window as unknown as {ResizeObserver: unknown}).ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    }
});

afterEach(() => resetTacticalGraphicsConfig());

function makeMap(): Map {
    const target = document.createElement('div');
    Object.defineProperty(target, 'clientWidth', {value: 800});
    Object.defineProperty(target, 'clientHeight', {value: 600});
    document.body.appendChild(target);
    return new Map({target, view: new View({center: [0, 0], zoom: 4})});
}

/** Every feature on the map, keyed by symbol id and role. */
function featuresByRole(map: Map): globalThis.Map<string, OLFeature> {
    const out = new globalThis.Map<string, OLFeature>();
    map.getLayers().getArray().forEach(layer => {
        const source = (layer as unknown as {getSource?: () => {getFeatures?: () => OLFeature[]} | null}).getSource?.();
        source?.getFeatures?.()?.forEach(f => out.set(`${f.get('symbolId')}|${f.get('role')}`, f));
    });
    return out;
}

const coordinatesOf = (f: OLFeature | undefined) => JSON.stringify((f?.getGeometry() as unknown as {getCoordinates?: () => unknown})?.getCoordinates?.());

const numbers = (x: unknown): number[] =>
    Array.isArray(x) ? x.flatMap(numbers) : typeof x === 'number' ? [x] : [];

describe('smooth lines on OpenLayers', () => {
    const snapshot = sampleFeatureCollection();

    it('rebuilds the listed graphics in place, and only those', () => {
        const map = makeMap();
        const engine = createTacticalGraphics(map);
        engine.restore(snapshot);
        const ids = snapshot.features.map(f => f.properties!.symbolId as string);
        const nameOf = (id: string) => snapshot.features.find(f => f.properties!.symbolId === id)!.properties!.graphicName as TacticalGraphicName;
        engine.setAmplifiersHidden?.(ids[0], true);

        const before = featuresByRole(map);
        const hard = new globalThis.Map([...before].map(([k, f]) => [k, coordinatesOf(f)]));

        configureTacticalGraphics({smoothLines: true});
        engine.refreshStyles();
        const after = featuresByRole(map);

        const replaced = [...before].filter(([k, f]) => after.get(k) !== f).map(([k]) => k);
        expect(replaced).toEqual([]);
        const basesMoved = ids.filter(id => coordinatesOf(after.get(`${id}|base`)) !== hard.get(`${id}|base`));
        expect(basesMoved).toEqual([]);
        const otherMoved = ids.filter(id => !smoothingKindOf(nameOf(id)) && coordinatesOf(after.get(`${id}|graphic`)) !== hard.get(`${id}|graphic`));
        expect(otherMoved).toEqual([]);
        const reshaped = ids.filter(id => coordinatesOf(after.get(`${id}|graphic`)) !== hard.get(`${id}|graphic`));
        expect(reshaped.length).toBeGreaterThan(100);
        expect(engine.amplifiersHidden?.(ids[0])).toBe(true);

        configureTacticalGraphics({smoothLines: false});
        engine.refreshStyles();
        const back = featuresByRole(map);
        const notRestored = ids.filter(id => {
            const [x, y] = [numbers(JSON.parse(coordinatesOf(back.get(`${id}|graphic`)) ?? 'null')), numbers(JSON.parse(hard.get(`${id}|graphic`) ?? 'null'))];
            return x.length !== y.length || x.some((v, i) => Math.abs(v - y[i]) > 1e-3);
        });
        expect(notRestored).toEqual([]);
        engine.destroy();
    });

    it('draws the same line work the shared adapter builds', () => {
        configureTacticalGraphics({smoothLines: true});
        const map = makeMap();
        const engine = createTacticalGraphics(map);
        engine.restore(snapshot);
        const drawn = featuresByRole(map);

        const disagree: string[] = [];
        let compared = 0;
        for (const feature of snapshot.features) {
            const name = feature.properties!.graphicName as TacticalGraphicName;
            if (!smoothingKindOf(name)) continue;
            const id = feature.properties!.symbolId as string;
            const ol = drawn.get(`${id}|graphic`);
            const shared = buildPaintedGraphic(name, feature.geometry, feature.properties!.tacticalGraphic);
            if (!ol || !shared) continue;
            compared++;
            // Both in lon/lat, so the comparison is free of either engine's projection.
            const olGeometry = (ol.getGeometry() as unknown as {getCoordinates: () => unknown}).getCoordinates();
            const olLonLat = numbers(olGeometry);
            const ours: number[] = [];
            for (let i = 0; i < olLonLat.length; i += 2) ours.push(...toLonLat([olLonLat[i], olLonLat[i + 1]]));
            const theirs = numbers(shared.graphic.geometry.type === 'GeometryCollection' ? [] : (shared.graphic.geometry as {coordinates: unknown}).coordinates);
            const back: number[] = [];
            for (let i = 0; i < theirs.length; i += 2) back.push(...toLonLat([theirs[i], theirs[i + 1]]));
            if (ours.length !== back.length || ours.some((v, i) => Math.abs(v - back[i]) > 1e-7)) disagree.push(name);
        }
        expect(disagree).toEqual([]);
        expect(compared).toBeGreaterThan(150);
        engine.destroy();
    });
});
