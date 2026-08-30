/**
 * # The host owns "name only", and the library does not
 *
 * `hideAmplifiers` was a field on the graphic's property bag until 2026-08-30, which meant
 * saving a graphic saved somebody's display preference with it — and reopening that file
 * somewhere else applied it. It says nothing about what the symbol *is*, so it came off the
 * portable description entirely and became a renderer input the host supplies.
 *
 * These guard the two halves of that. The library's half is that the flag cannot reach a
 * saved graphic; this app's half is a set of ids that survives a reload, which is what
 * `amplifierVisibility` is.
 */

import {amplifiersHidden, forgetAmplifierVisibility, hiddenAmplifierIds, setAmplifiersHidden} from './amplifierVisibility';
import {renderTacticalGraphic} from '@zaes/tactical-graphics';
import {TacticalGraphicName} from '@zaes/tactical-graphics';

beforeEach(() => forgetAmplifierVisibility());

describe('the app remembers which graphics are name-only', () => {
    it('starts remembering nothing', () => {
        expect(amplifiersHidden('a')).toBe(false);
        expect(hiddenAmplifierIds().size).toBe(0);
    });

    it('remembers a choice, per graphic', () => {
        setAmplifiersHidden('a', true);
        expect(amplifiersHidden('a')).toBe(true);
        expect(amplifiersHidden('b')).toBe(false);
    });

    it('forgets one without forgetting the rest', () => {
        setAmplifiersHidden('a', true);
        setAmplifiersHidden('b', true);
        setAmplifiersHidden('a', false);
        expect(amplifiersHidden('a')).toBe(false);
        expect(amplifiersHidden('b')).toBe(true);
    });

    it('survives a reload — it is in storage, not in memory', () => {
        setAmplifiersHidden('a', true);
        // What a fresh page would read.
        expect(JSON.parse(window.localStorage.getItem('tacticalGraphics.hiddenAmplifiers') ?? '[]')).toEqual(['a']);
    });

    it('keeps working when storage is unavailable', () => {
        // A private window, or a browser set to block site data, throws on access. The
        // toggle must still work for the session; only the remembering is lost.
        const setItem = window.localStorage.setItem;
        window.localStorage.setItem = () => {
            throw new Error('blocked');
        };
        expect(() => setAmplifiersHidden('a', true)).not.toThrow();
        window.localStorage.setItem = setItem;
    });
});

describe('the choice cannot reach a saved graphic', () => {
    it('is not a field a caller can put in the bag', () => {
        // `renderTacticalGraphic` stamps the bag it was given onto its output. If the flag
        // were still a property, it would ride along into anything serialized from it.
        const rendered = renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: [[0, 0], [0.4, 0]]},
            properties: {tacticalGraphic: {name: TacticalGraphicName.PhaseLine, designation: 'BLUE'}},
        } as never);
        expect(Object.keys(rendered.graphic.properties?.tacticalGraphic ?? {})).not.toContain('hideAmplifiers');
    });
});
