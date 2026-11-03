/**
 * # Removing and dimming one graphic through the OpenLayers façade
 *
 * The MapLibre twin is `maplibre/hostDisplay.test.ts`; the two assert the same sequence
 * so the engines cannot drift apart on it. @see TacticalGraphicsEngine.remove
 * @see TacticalGraphicsEngine.setOpacity
 */

import Map from 'ol/Map';
import View from 'ol/View';
import type Feature from 'ol/Feature';
import type {Style} from 'ol/style';
import type {StyleFunction} from 'ol/style/Style';
import type {Feature as GeoFeature, Geometry} from 'geojson';
import {TacticalGraphicName, toSnapshot} from '@zaes/tactical-graphics';
import {createTacticalGraphics} from './createTacticalGraphics';
import {GRAPHIC_OPACITY_KEY} from './graphicOpacity';

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

/** Every feature on the map that belongs to `symbolId`, with the style function that draws it. */
const drawnOf = (map: Map, symbolId: string) =>
    map
        .getLayers()
        .getArray()
        .flatMap(layer => {
            const holder = layer as unknown as {
                getSource?: () => {getFeatures?: () => Feature[]} | null;
                getStyleFunction?: () => StyleFunction | undefined;
            };
            const features =
                holder
                    .getSource?.()
                    ?.getFeatures?.()
                    ?.filter(f => f.get('symbolId') === symbolId) ?? [];
            return features.map(feature => ({feature, style: feature.getStyleFunction() ?? holder.getStyleFunction?.()}));
        });

/** Every stroke and text color the graphic's style functions produce. */
function colorsOf(map: Map, symbolId: string): string[] {
    const colors: string[] = [];
    for (const {feature, style} of drawnOf(map, symbolId)) {
        const produced = style?.(feature, 1000);
        const styles = (Array.isArray(produced) ? produced : produced ? [produced] : []) as Style[];
        for (const s of styles) {
            const stroke = s.getStroke()?.getColor();
            if (typeof stroke === 'string') colors.push(stroke);
            const text = s.getText()?.getFill()?.getColor();
            if (typeof text === 'string') colors.push(text);
        }
    }
    return colors;
}

describe('removing one graphic', () => {
    it('takes that graphic off and leaves the rest', () => {
        const map = makeMap();
        const engine = createTacticalGraphics(map);
        engine.restore(toSnapshot([phaseLine('a'), phaseLine('b')]));
        expect(drawnOf(map, 'a').length).toBeGreaterThan(0);

        expect(engine.remove?.('a')).toBe(true);
        expect(drawnOf(map, 'a')).toEqual([]);
        expect(drawnOf(map, 'b').length).toBeGreaterThan(0);
        expect(engine.snapshot().features.map(f => f.properties?.symbolId)).toEqual(['b']);
        engine.destroy();
    });

    it('reports a change, and nothing for an id it does not hold', () => {
        let changes = 0;
        const engine = createTacticalGraphics(makeMap(), {onChange: () => changes++});
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
        const engine = createTacticalGraphics(makeMap(), {onSelect: g => selections.push(g)});
        engine.restore(toSnapshot([phaseLine('a'), phaseLine('b')]));
        engine.select('a');
        selections.length = 0;

        engine.remove?.('b');
        expect(engine.getSelection()?.id).toBe('a');
        expect(selections).toEqual([]);

        engine.remove?.('a');
        expect(engine.getSelection()).toBeNull();
        expect(selections).toEqual([null]);
        engine.destroy();
    });
});

describe('dimming one graphic', () => {
    it('fades every color it draws, and no other graphic', () => {
        const map = makeMap();
        const engine = createTacticalGraphics(map);
        engine.restore(toSnapshot([phaseLine('a'), phaseLine('b')]));
        const before = colorsOf(map, 'a');
        expect(before.length).toBeGreaterThan(0);

        engine.setOpacity?.('a', 0.4);
        expect(drawnOf(map, 'a').every(({feature}) => feature.get(GRAPHIC_OPACITY_KEY) === 0.4)).toBe(true);
        expect(colorsOf(map, 'a')).not.toEqual(before);
        expect(colorsOf(map, 'a').every(c => /rgba\(.*,\s*0\.4\)$/.test(c))).toBe(true);
        expect(drawnOf(map, 'b').some(({feature}) => feature.get(GRAPHIC_OPACITY_KEY) !== undefined)).toBe(false);

        engine.setOpacity?.('a', 1);
        expect(colorsOf(map, 'a')).toEqual(before);
        engine.destroy();
    });

    it('is view state: never in the snapshot, gone after restore', () => {
        const map = makeMap();
        const engine = createTacticalGraphics(map);
        engine.restore(toSnapshot([phaseLine('a')]));
        engine.setOpacity?.('a', 0.5);
        expect(JSON.stringify(engine.snapshot())).not.toContain(`"${GRAPHIC_OPACITY_KEY}"`);

        engine.restore(engine.snapshot());
        expect(drawnOf(map, 'a').some(({feature}) => feature.get(GRAPHIC_OPACITY_KEY) !== undefined)).toBe(false);
        engine.destroy();
    });
});
