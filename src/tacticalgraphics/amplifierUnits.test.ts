/**
 * # The units FM 1-02.2 allows each amplifier
 *
 * Two fields report a measurement and they do not take the same units, which is easy
 * to miss because both look like "a number on a label":
 *
 * - **Field AM (distance)** — "a numeric amplifier that displays a minimum, maximum,
 *   or specific distance (range, radius, width, or length) **in meters or feet**",
 *   7 characters. Table 5-23's air corridor plates render it `1200FT` / `300FT`.
 * - **Field X, X1 (altitude or depth)** — "**Measurement units shall be displayed in
 *   the string.** Examples: 1500MSL FL150", 15 characters. Feet, metres, a flight
 *   level and a submerged depth are all legal, so the string is the user's.
 *
 * Both have been got wrong here before, in opposite directions: the width amplifier
 * was reformatted into kilometres, a unit field AM does not admit; and the standing
 * risk on altitude is the reverse, that a helpful formatter converts `FL150` or
 * `1500MSL` into a number of metres and destroys it.
 *
 * These tests exist because neither error is visible in a pixel comparison — both
 * engines render the same wrong string identically.
 */

import type {PaintContext, PaintFeature} from './core/paint';
import {formatAmplifierDistance, formatDistance} from './core/symbology';
import {TacticalGraphicName} from './core/type';
import {formatWidthAmplifier} from './symbology/corridorPaints';
import {getPaintFunction} from './symbology/registry';

describe('field AM — distance, in metres or feet', () => {
    it('appends the unit with no separator or decimal, as the plates print it', () => {
        expect(formatAmplifierDistance(1200)).toBe('1200M');
        expect(formatAmplifierDistance(300)).toBe('300M');
        expect(formatAmplifierDistance(391357.585)).toBe('391358M');
    });

    it('never reports kilometres — not a unit the field admits', () => {
        for (const metres of [1000, 12345, 391357.585, 999999]) {
            expect(formatAmplifierDistance(metres)).not.toMatch(/km/i);
        }
    });

    it('keeps a corridor width inside the field, so 78 km reads as metres', () => {
        expect(formatWidthAmplifier('78000')).toBe('78000M');
        expect(formatWidthAmplifier('391357.585')).toBe('391358M');
    });

    it('shows a non-numeric width verbatim — "300FT" is already a legal entry', () => {
        expect(formatWidthAmplifier('300FT')).toBe('300FT');
        expect(formatWidthAmplifier('')).toBe('');
    });

    it('is not the editor read-out, which measures rather than amplifies', () => {
        // Same quantity, deliberately different words: the radius shown while dragging a
        // circle is a measurement aid, not a symbol's amplifier, and reads better in km.
        expect(formatDistance(78000)).toBe('78 km');
        expect(formatAmplifierDistance(78000)).toBe('78000M');
    });
});

describe('fields X and X1 — altitude, in whatever units the user typed', () => {
    const context: PaintContext = {resolution: 100, measureText: text => text.length * 8};

    const feature = (properties: Record<string, unknown>): PaintFeature =>
        ({geometry: {type: 'Point', coordinates: [0, 0]}, properties} as unknown as PaintFeature);

    /** Every altitude string the manual shows, plus the datums its plates carry. */
    const ALTITUDES = ['1500MSL', 'FL150', '1500FT AGL', '20000FT AGL', '3000 M', 'GL'];

    /**
     * Every graphic that renders an altitude, found by rendering one and looking, so a
     * new air zone joins this test by existing rather than by being remembered.
     */
    const withAltitude = Object.values(TacticalGraphicName).filter(name => {
        const painters = getPaintFunction(name);
        const label = painters?.label ?? painters?.graphic;
        if (!label) return false;
        try {
            return label(feature({minAltitude: 'FL150'}), context).some(p => p.text?.text?.includes('FL150'));
        } catch {
            return false;
        }
    });

    it('is rendered by the air zones and coordination areas', () => {
        // 11 air-coordinating zones + 3 airspace coordination areas.
        expect(withAltitude.length).toBe(14);
    });

    it.each(withAltitude)('%s passes its altitudes through untouched', name => {
        const painters = getPaintFunction(name);
        const label = painters?.label ?? painters?.graphic;
        for (const altitude of ALTITUDES) {
            const text = label!(feature({minAltitude: altitude, maxAltitude: altitude}), context)
                .map(p => p.text?.text ?? '')
                .join('\n');
            expect(text).toContain(altitude);
        }
    });

    it.each(withAltitude)('%s never converts an altitude into a distance', name => {
        // The failure this guards: a formatter that reads "1500" out of "1500MSL" and
        // reports "1.5 km", losing the datum that says what the number is measured from.
        const painters = getPaintFunction(name);
        const label = painters?.label ?? painters?.graphic;
        const text = label!(feature({minAltitude: '1500MSL', maxAltitude: 'FL150'}), context)
            .map(p => p.text?.text ?? '')
            .join('\n');
        expect(text).not.toMatch(/km/i);
        expect(text).toContain('1500MSL');
        expect(text).toContain('FL150');
    });
});
