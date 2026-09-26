/**
 * # "Name only" survives the engine switch
 *
 * The choice is a **renderer input the host supplies**, not a field on the portable
 * description — two identical corridors may reasonably differ, and none of it should travel
 * in a file another operator opens. So it is not in the snapshot, and a restore rebuilds
 * every feature without it. Something has to put it back.
 *
 * That something is the host. The engines hold the choice in memory only and draw a
 * restored graphic in full; this demo keeps its own record in local storage and re-applies
 * it after every restore through `rememberAmplifierVisibility`. Until 2026-09-25 the
 * published renderers read that record themselves, which put the demo's storage key inside
 * the library.
 *
 * It depends on one thing the engines do guarantee: **a restore keeps the incoming
 * `symbolId`**. MapLibre's once minted a fresh `mlb-N` instead, while OpenLayers' adopted
 * the id it was given, so a choice remembered per graphic id survived OpenLayers → MapLibre
 * and not the way back.
 */
import {TacticalGraphicName, toSnapshot, type TacticalGraphicsEngine} from '@zaes/tactical-graphics';
import type {Feature as GeoFeature, Geometry} from 'geojson';
import {
    forgetAmplifierVisibility,
    reapplyAmplifierVisibility,
    rememberAmplifierVisibility,
    rememberAmplifiersHidden,
    rememberedAmplifierIds,
    rememberedAmplifiersHidden,
} from './amplifierVisibility';

/** A saved base feature, as either engine writes one. */
const base = (symbolId: string): GeoFeature<Geometry> => ({
    type: 'Feature',
    geometry: {type: 'Point', coordinates: [-123.5, 32.3]},
    properties: {
        role: 'base',
        symbolId,
        graphicName: TacticalGraphicName.LaunchAreaEllipse,
        tacticalGraphic: {name: TacticalGraphicName.LaunchAreaEllipse, radius: 20_000, length: 40_000},
    },
} as GeoFeature<Geometry>);

describe('the remembered "name only" choice', () => {
    beforeEach(() => forgetAmplifierVisibility());
    afterEach(() => forgetAmplifierVisibility());

    it('is kept in local storage, so it survives a reload', () => {
        rememberAmplifiersHidden('mlb-253', true);
        expect(window.localStorage.getItem('tacticalGraphics.hiddenAmplifiers')).toContain('mlb-253');
        expect(rememberedAmplifiersHidden('mlb-253')).toBe(true);
    });

    it('is keyed by the graphic id the snapshot carries', () => {
        /*
         * **The identity that has to survive the handover.** Both engines write `symbolId`
         * onto the base feature, and both restores must adopt it — the store has no other
         * way to find the graphic again on the far side.
         */
        const snapshot = toSnapshot([base('mlb-253')]);
        const carried = snapshot.features[0].properties?.symbolId;
        expect(carried).toBe('mlb-253');

        rememberAmplifiersHidden(carried as string, true);
        expect(rememberedAmplifierIds().has('mlb-253')).toBe(true);
    });

    it('forgets a choice when it is switched off, rather than accumulating ids', () => {
        // The store is consulted on every restore, so a stale id would re-hide a graphic
        // that happens to be given that id later.
        rememberAmplifiersHidden('a', true);
        rememberAmplifiersHidden('a', false);
        expect(rememberedAmplifierIds().has('a')).toBe(false);
        expect(rememberedAmplifiersHidden('a')).toBe(false);
    });

    it('survives storage being unavailable, because losing the memory beats losing the toggle', () => {
        // A private window, or a browser set to block site data, throws on access.
        const real = window.localStorage.getItem;
        try {
            (window.localStorage as unknown as {getItem: () => never}).getItem = () => {
                throw new Error('blocked');
            };
            expect(() => rememberedAmplifiersHidden('a')).not.toThrow();
            expect(rememberedAmplifiersHidden('a')).toBe(false);
        } finally {
            (window.localStorage as unknown as {getItem: typeof real}).getItem = real;
        }
    });
});

describe('the demo re-applies what it remembers', () => {
    beforeEach(() => forgetAmplifierVisibility());
    afterEach(() => forgetAmplifierVisibility());

    /** Just enough engine to watch the two verbs the wrapper touches. */
    const fakeEngine = () => {
        const hidden = new Set<string>();
        const calls: string[] = [];
        const engine = {
            restore: () => {
                // What both real engines do: every restored graphic comes back in full.
                hidden.clear();
                calls.push('restore');
            },
            setAmplifiersHidden: (id: string, value: boolean) => {
                calls.push(`set ${id} ${value}`);
                if (value) hidden.add(id);
                else hidden.delete(id);
            },
            amplifiersHidden: (id: string) => hidden.has(id),
        } as unknown as TacticalGraphicsEngine;
        return {engine, calls};
    };

    it('puts every remembered choice back after a restore', () => {
        rememberAmplifiersHidden('mlb-253', true);
        const {engine, calls} = fakeEngine();
        const wrapped = rememberAmplifierVisibility(engine);

        wrapped.restore(toSnapshot([base('mlb-253')]));
        expect(calls).toEqual(['restore', 'set mlb-253 true']);
        expect(wrapped.amplifiersHidden?.('mlb-253')).toBe(true);
    });

    it('records a choice made through the engine, so the next restore finds it', () => {
        const {engine} = fakeEngine();
        const wrapped = rememberAmplifierVisibility(engine);

        wrapped.setAmplifiersHidden?.('ol-7', true);
        expect(rememberedAmplifiersHidden('ol-7')).toBe(true);
        wrapped.restore(toSnapshot([base('ol-7')]));
        expect(wrapped.amplifiersHidden?.('ol-7')).toBe(true);

        wrapped.setAmplifiersHidden?.('ol-7', false);
        expect(rememberedAmplifiersHidden('ol-7')).toBe(false);
        wrapped.restore(toSnapshot([base('ol-7')]));
        expect(wrapped.amplifiersHidden?.('ol-7')).toBe(false);
    });

    it('asks nothing of an engine that cannot hide amplifiers', () => {
        // The method is optional on the interface; an add-on engine may not have it.
        rememberAmplifiersHidden('a', true);
        const bare = {restore: () => {}} as unknown as TacticalGraphicsEngine;
        expect(() => reapplyAmplifierVisibility(bare)).not.toThrow();
        expect(() => rememberAmplifierVisibility(bare).restore({type: 'FeatureCollection', features: []})).not.toThrow();
    });
});
