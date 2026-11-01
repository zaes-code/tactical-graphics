/**
 * # An axis of advance's T, W - W1 and ENY, each where its plate boxes it
 *
 * 151401 to 151406 and 342900 letter T inside the body toward the rear and W - W1 as a
 * separate group just behind the head; a hostile one boxes N outside the rails at the rear
 * (APP-06 8.1.4, "ENY" in at least two places). They used to be one `T  W - W1` run behind
 * the head, at the tail on the aviation axes, with no ENY at all.
 */
import type {Geometry, Position} from 'geojson';
import {buildPaintedGraphic, paintGraphic, resetTacticalGraphicsConfig} from '../index';
import {TacticalGraphicHostility, TacticalGraphicName as N} from '../core/type';
import type {Paint, PaintContext} from '../core/paint';

afterEach(() => resetTacticalGraphicsConfig());

const resolution = 30;
const context: PaintContext = {resolution, measureText: (text: string) => text.length * 9};

/** Stored tip first, pointing east: the tip, the rear, then the back of the arrowhead. */
const base: Geometry = {type: 'LineString', coordinates: [[0.2, 0], [0, 0], [0.19, 0.01]]};

const AXES = [
    N.MainAxisOfAdvance,
    N.SupportingAxisOfAdvance,
    N.MainAxisOfAdvanceFeint,
    N.AviationAxisOfAdvance,
    N.AttackHelicopterAxisOfAdvance,
    N.AdvanceToContact,
];

function texts(name: N, hostility: TacticalGraphicHostility): Paint[] {
    const properties = {designation: 'DAVID', startDate: '011200Z', endDate: '021800Z', radius: 1000, hostility};
    const graphic = buildPaintedGraphic(name, base, properties, resolution)!;
    return paintGraphic(graphic, context).filter(p => p.text && p.text.fill !== 'rgba(0,0,0,0)');
}

/** The mean x of the marks whose text, joined, reads `value`. */
function meanX(paints: Paint[], value: string): number {
    const chars = new Set(Array.from(value));
    const marks = paints.filter(p => p.text!.text === value || (p.text!.glyph && chars.has(p.text!.text)));
    expect(marks.length).toBeGreaterThan(0);
    return marks.reduce((sum, p) => sum + (p.geometry.coordinates as Position)[0], 0) / marks.length;
}

describe.each(AXES)('%s', name => {
    it('sets T behind W - W1, and W - W1 toward the head', () => {
        const paints = texts(name, TacticalGraphicHostility.friend);
        const all = paints.map(p => p.text!.text).join('');
        expect(all).toContain('DAVID');
        expect(all).toContain('011200Z - 021800Z');
        const nameRun = paints.filter(p => p.text!.text === 'DAVID' || 'DAVID'.includes(p.text!.text));
        const dateRun = paints.filter(p => p.text!.text.includes('011200Z') || (p.text!.glyph && /[0-9Z -]/.test(p.text!.text)));
        const nameX = nameRun.reduce((s, p) => s + (p.geometry.coordinates as Position)[0], 0) / nameRun.length;
        const dateX = dateRun.reduce((s, p) => s + (p.geometry.coordinates as Position)[0], 0) / dateRun.length;
        // The head is east.
        expect(dateX).toBeGreaterThan(nameX);
    });

    it('says ENY twice at the rear when hostile, and never when friendly', () => {
        const hostile = texts(name, TacticalGraphicHostility.hostileFaker);
        const eny = hostile.filter(p => p.text!.text === 'ENY');
        expect(eny).toHaveLength(2);
        const nameX = meanX(hostile, 'DAVID');
        for (const mark of eny) expect((mark.geometry.coordinates as Position)[0]).toBeLessThan(nameX);
        // One each side of the axis.
        const ys = eny.map(p => (p.geometry.coordinates as Position)[1]);
        expect(Math.sign(ys[0])).toBe(-Math.sign(ys[1]));
        expect(texts(name, TacticalGraphicHostility.friend).some(p => p.text!.text === 'ENY')).toBe(false);
    });
});
