/**
 * # The units each measured amplifier is written in
 *
 * Two fields report a measurement and they do not behave the same, which is easy to
 * miss because both look like "a number on a label":
 *
 * - **Field AM (distance)** — corridor width. FM 1-02.2 calls for "meters or feet",
 *   7 characters, and table 5-23's plates render it `1200FT`. This library shows
 *   kilometres above 1 km instead, which is a **deliberate departure**: `391 km` is
 *   readable at a glance where `391358M` is not, and the quantity is unambiguous
 *   either way. Pinned here so the departure stays a decision rather than a drift.
 * - **Fields X, X1 (altitude or depth)** — "Measurement units shall be displayed in
 *   the string. Examples: 1500MSL FL150", 15 characters. Feet, metres, a flight level
 *   and a submerged depth are all legal, so the unit is a host-level setting and the
 *   number is written in it.
 *
 * The altitude half exists because a formatter that "helpfully" reads 1500 out of
 * `1500MSL` and reports `1.5 km` destroys the datum that says what the number is
 * measured from — and neither error is visible in a pixel comparison, since both
 * engines render the same wrong string identically.
 */

import {HeightUnit, TacticalGraphicsConfig, configureTacticalGraphics} from './core/config';
import type {PaintContext, PaintFeature} from './core/paint';
import {formatAltitude, formatDistance} from './core/symbology';
import {TacticalGraphicName} from './core/type';
import {formatWidthAmplifier} from './symbology/corridorPaints';
import {getPaintFunction} from './symbology/registry';

const context: PaintContext = {resolution: 100, measureText: text => text.length * 8};

const feature = (properties: Record<string, unknown>): PaintFeature =>
    ({geometry: {type: 'Point', coordinates: [0, 0]}, properties} as unknown as PaintFeature);

/** Renders a graphic's label block and returns every line of text in it. */
const labelText = (name: TacticalGraphicName, properties: Record<string, unknown>): string => {
    const painters = getPaintFunction(name);
    const label = painters?.label ?? painters?.graphic;
    if (!label) return '';
    return label(feature(properties), context)
        .map(paint => paint.text?.text ?? '')
        .join('\n');
};

afterEach(() => configureTacticalGraphics(new TacticalGraphicsConfig()));

describe('field AM — corridor width, in metres and kilometres', () => {
    it('reads in kilometres above a kilometre and metres below', () => {
        expect(formatWidthAmplifier('78000')).toBe('78 km');
        expect(formatWidthAmplifier('391357.585')).toBe('391 km');
        expect(formatWidthAmplifier('400')).toBe('400 m');
    });

    it('shows a non-numeric width verbatim — "300FT" is already a legal entry', () => {
        expect(formatWidthAmplifier('300FT')).toBe('300FT');
        expect(formatWidthAmplifier('')).toBe('');
    });

    it('says the same thing as the read-out that measures the same quantity', () => {
        expect(formatWidthAmplifier('78000')).toBe(formatDistance(78000));
    });
});

describe('fields X and X1 — altitude, in the configured unit', () => {
    it('defaults to feet, which is what every altitude in the manual is in', () => {
        expect(formatAltitude('1500')).toBe('1500FT');
    });

    it('writes the number in whichever unit the host configured', () => {
        configureTacticalGraphics(new TacticalGraphicsConfig({heightUnit: HeightUnit.Metres}));
        expect(formatAltitude('1500')).toBe('1500M');
        configureTacticalGraphics(new TacticalGraphicsConfig({heightUnit: HeightUnit.Feet}));
        expect(formatAltitude('1500')).toBe('1500FT');
    });

    it('interprets the value in that unit rather than converting it', () => {
        // 1500 under Metres is 1500 metres, not 457 — the setting says what the number
        // already meant. Converting would silently restate every altitude on the map.
        configureTacticalGraphics(new TacticalGraphicsConfig({heightUnit: HeightUnit.Metres}));
        expect(formatAltitude('1500')).toBe('1500M');
    });

    it('leaves a flight level, a datum or a depth exactly as it found it', () => {
        for (const value of ['FL150', '1500MSL', '1500FT AGL', 'GL', '20000FT AGL']) {
            expect(formatAltitude(value)).toBe(value);
        }
    });

    it('never turns an altitude into a distance', () => {
        for (const value of ['FL150', '1500MSL', '1500']) {
            expect(formatAltitude(value)).not.toMatch(/km/i);
        }
    });

    it('handles an empty or absent altitude without inventing a unit', () => {
        expect(formatAltitude('')).toBe('');
        expect(formatAltitude(undefined)).toBe('');
    });
});

describe('every graphic that renders an altitude', () => {
    /**
     * Found by rendering rather than remembered, so a new air zone joins this test by
     * existing: the eleven air-coordinating zones and the three airspace coordination
     * areas, all of which label a Point.
     *
     * The corridors carry altitudes too and are **not** in here — their label paint
     * needs the MultiPoint of turning points, so a Point feature renders nothing. They
     * are covered on their own below rather than left to a discovery that cannot see
     * them.
     */
    const withAltitude = Object.values(TacticalGraphicName).filter(name => {
        try {
            return labelText(name, {minAltitude: '1500'}).includes('1500');
        } catch {
            return false;
        }
    });

    it('is the eleven zones and the three coordination areas', () => {
        expect(withAltitude.length).toBe(14);
    });

    it('includes the corridors, which label a MultiPoint', () => {
        configureTacticalGraphics(new TacticalGraphicsConfig({heightUnit: HeightUnit.Metres}));
        const painters = getPaintFunction(TacticalGraphicName.AirCorridor);
        const paints = painters!.label!(
            {
                geometry: {type: 'MultiPoint', coordinates: [[0, 0], [1000, 0]]},
                properties: {minAltitude: '1500', maxAltitude: 'FL150'},
            } as unknown as PaintFeature,
            context,
        );
        const text = paints.map(paint => paint.text?.text ?? '').join('\n');
        expect(text).toContain('MIN ALT:    1500M');
        expect(text).toContain('MAX ALT:    FL150');
    });

    it.each(withAltitude)('%s writes its altitudes in the configured unit', name => {
        configureTacticalGraphics(new TacticalGraphicsConfig({heightUnit: HeightUnit.Metres}));
        const text = labelText(name, {minAltitude: '1500', maxAltitude: '20000'});
        expect(text).toContain('1500M');
        expect(text).toContain('20000M');
    });

    it.each(withAltitude)('%s passes a flight level through untouched', name => {
        const text = labelText(name, {minAltitude: 'FL150', maxAltitude: '1500MSL'});
        expect(text).toContain('FL150');
        expect(text).toContain('1500MSL');
        expect(text).not.toMatch(/km/i);
    });
});
