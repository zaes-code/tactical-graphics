/**
 * # "Name only" survives the engine switch
 *
 * The choice is a **renderer input the host supplies**, not a field on the portable
 * description — two identical corridors may reasonably differ, and none of it should travel
 * in a file another operator opens. So it is not in the snapshot, and a restore rebuilds
 * every feature without it. Something has to put it back.
 *
 * Two things were missing, and together they made the toggle survive a page reload — it is in
 * local storage — but not an engine switch, which is the one place a user watches it happen:
 *
 * - **`restampAmplifierVisibility` was never called.** It was written for this, sat in
 *   `featurePropertiesSource.ts`, and nothing referenced it.
 * - **MapLibre's restore threw away the incoming `symbolId`**, minting a fresh `mlb-N`
 *   instead — while OpenLayers' restore has always adopted the id it was given. The choice is
 *   remembered *per graphic id*, so it survived OpenLayers → MapLibre and not the way back.
 *
 * The second is the more general defect: a host keying anything by graphic id lost track of
 * the graphic on one leg of the round trip.
 */
import {TacticalGraphicName, toSnapshot} from '@zaes/tactical-graphics';
import type {Feature as GeoFeature, Geometry} from 'geojson';
import {
    amplifiersHidden,
    forgetAmplifierVisibility,
    hiddenAmplifierIds,
    setAmplifiersHidden,
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
        setAmplifiersHidden('mlb-253', true);
        expect(window.localStorage.getItem('tacticalGraphics.hiddenAmplifiers')).toContain('mlb-253');
        expect(amplifiersHidden('mlb-253')).toBe(true);
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

        setAmplifiersHidden(carried as string, true);
        expect(hiddenAmplifierIds().has('mlb-253')).toBe(true);
    });

    it('forgets a choice when it is switched off, rather than accumulating ids', () => {
        // The store is consulted on every restore, so a stale id would re-hide a graphic
        // that happens to be given that id later.
        setAmplifiersHidden('a', true);
        setAmplifiersHidden('a', false);
        expect(hiddenAmplifierIds().has('a')).toBe(false);
        expect(amplifiersHidden('a')).toBe(false);
    });

    it('survives storage being unavailable, because losing the memory beats losing the toggle', () => {
        // A private window, or a browser set to block site data, throws on access.
        const real = window.localStorage.getItem;
        try {
            (window.localStorage as unknown as {getItem: () => never}).getItem = () => {
                throw new Error('blocked');
            };
            expect(() => amplifiersHidden('a')).not.toThrow();
            expect(amplifiersHidden('a')).toBe(false);
        } finally {
            (window.localStorage as unknown as {getItem: typeof real}).getItem = real;
        }
    });
});
