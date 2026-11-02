/**
 * # An axis of advance's T, W - W1 and ENY, each where its plate boxes it
 *
 * 151401 to 151406 and 342900 letter T inside the body toward the rear and W - W1 as a
 * separate group just behind the head; a hostile one boxes N outside the rails at the rear
 * (APP-06 8.1.4, "ENY" in at least two places). They used to be one `T  W - W1` run behind
 * the head, at the tail on the aviation axes, with no ENY at all.
 */
import type {Geometry, Position} from 'geojson';
import {buildPaintedGraphic, configureTacticalGraphics, paintGraphic, resetTacticalGraphicsConfig} from '../index';
import {TacticalGraphicHostility, TacticalGraphicName as N} from '../core/type';
import type {Paint, PaintContext} from '../core/paint';

// The hostile marks are pinned here, so they say so rather than lean on the default. @see TacticalGraphicsConfigOptions.enemyLabels
beforeEach(() => configureTacticalGraphics({enemyLabels: true}));
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

function texts(name: N, hostility: TacticalGraphicHostility, from: Geometry = base): Paint[] {
    const properties = {designation: 'DAVID', startDate: '011200Z', endDate: '021800Z', radius: 1000, hostility};
    const graphic = buildPaintedGraphic(name, from, properties, resolution)!;
    return paintGraphic(graphic, context).filter(p => p.text && p.text.fill !== 'rgba(0,0,0,0)');
}

/** The mean x of the marks whose text, joined, reads `value`. */
function meanX(paints: Paint[], value: string): number {
    const chars = new Set(Array.from(value));
    const marks = paints.filter(p => p.text!.text === value || (p.text!.glyph && chars.has(p.text!.text)));
    expect(marks.length).toBeGreaterThan(0);
    return marks.reduce((sum, p) => sum + (p.geometry.coordinates as Position)[0], 0) / marks.length;
}

/** The same arrow pointing west, where every label is turned upright through half a turn. */
const westBase: Geometry = {type: 'LineString', coordinates: [[-0.2, 0], [0, 0], [-0.19, -0.01]]};

describe.each(AXES)('%s', name => {
    it('keeps T at the rear on an arrow pointing west', () => {
        // Found turning each line graphic through four directions (2026-11-01): the feint and
        // advance to contact set T at the head whenever the text read against the arrow.
        const paints = texts(name, TacticalGraphicHostility.friend, westBase);
        expect(meanX(paints, '011200Z - 021800Z')).toBeLessThan(meanX(paints, 'DAVID'));
    });

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

    it('never sets T on top of W - W1 when the arrow is short', () => {
        // A stubby arrow: the name centered in the room ahead of the date used to land on the date.
        const stubby: Geometry = {type: 'LineString', coordinates: [[0.025, 0], [0, 0], [0.02, 0.01]]};
        const properties = {designation: 'DAVID', startDate: '011200Z', endDate: '021800Z', radius: 1000, hostility: TacticalGraphicHostility.friend};
        const near = 10;
        const wide: PaintContext = {resolution: near, measureText: (text: string) => text.length * 11};
        const paints = paintGraphic(buildPaintedGraphic(name, stubby, properties, near)!, wide).filter(p => p.text && p.text.fill !== 'rgba(0,0,0,0)');
        // One run, straight where it fits a segment, which cannot overlap itself.
        if (paints.length === 1) {
            expect(paints[0].text!.text).toBe('DAVID     011200Z - 021800Z');
            return;
        }
        expect(paints.length).toBeGreaterThan(5);
        const x = (p: Paint) => (p.geometry.coordinates as Position)[0];
        // The name is painted first, rear to head, then the date.
        const nameEnd = Math.max(...paints.slice(0, 5).map(x));
        expect(paints.slice(5).every(p => x(p) > nameEnd)).toBe(true);
    });

    it('keeps T at the rear of a short arrow pointing west', () => {
        // The one-run fallback read "T  W - W1" from the head back, so T sat at the head.
        const stubby: Geometry = {type: 'LineString', coordinates: [[-0.025, 0], [0, 0], [-0.02, -0.01]]};
        const properties = {designation: 'DAVID', startDate: '011200Z', endDate: '021800Z', radius: 1000, hostility: TacticalGraphicHostility.friend};
        const near = 10;
        const wide: PaintContext = {resolution: near, measureText: (text: string) => text.length * 11};
        const paints = paintGraphic(buildPaintedGraphic(name, stubby, properties, near)!, wide).filter(p => p.text && p.text.fill !== 'rgba(0,0,0,0)');
        const x = (p: Paint) => (p.geometry.coordinates as Position)[0];
        const run = paints.map(p => p.text!.text).join('');
        expect(run.indexOf('DAVID')).toBeGreaterThan(-1);
        // Turned to read from the head back, a single run starts with the dates.
        if (paints.length === 1) {
            expect(run).toBe('011200Z - 021800Z     DAVID');
            return;
        }
        // The head is west: every date glyph lies west of every name glyph.
        const nameAt = paints.filter(p => p.text!.glyph ? 'DAVI'.includes(p.text!.text) : p.text!.text === 'DAVID').map(x);
        const dateAt = paints.filter(p => p.text!.glyph ? /[0-9Z]/.test(p.text!.text) : p.text!.text.startsWith('011200Z')).map(x);
        expect(Math.max(...dateAt)).toBeLessThan(Math.min(...nameAt));
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

/** 152300's Template boxes H outside the upper rail near the rear of the symbol. */
describe('avenue of approach field H', () => {
    const paint = (hostility: TacticalGraphicHostility) => {
        const properties = {designation: 'X', additionalInfo: 'NOTE', radius: 1000, hostility};
        return paintGraphic(buildPaintedGraphic(N.AvenueOfApproach, base, properties, resolution)!, context).filter(p => p.text);
    };

    it.each([TacticalGraphicHostility.friend, TacticalGraphicHostility.hostileFaker])('sits outside the upper rail at the rear (%s)', hostility => {
        const marks = paint(hostility);
        const h = marks.find(p => p.text!.text === 'NOTE')!;
        const aa = marks.find(p => p.text!.text.startsWith('AA'))!;
        const [hx, hy] = h.geometry.coordinates as Position;
        // Behind AA, toward the rear (the rear is west), and above the arrow.
        expect(hx).toBeLessThan((aa.geometry.coordinates as Position)[0]);
        expect(hx).toBeLessThan(0.05 * 111_320);
        // Above every vertex of the line work at the rear.
        const rearTop = Math.max(
            ...paintGraphic(buildPaintedGraphic(N.AvenueOfApproach, base, {radius: 1000}, resolution)!, context)
                .filter(p => p.stroke)
                .flatMap(p => (p.geometry.coordinates as Position[][]).flat())
                .filter(([x]) => x < 0.05 * 111_320)
                .map(([, y]) => y),
        );
        expect(hy).toBeGreaterThan(rearTop);
        // Clear of a hostile arrow's upper ENY.
        for (const eny of marks.filter(p => p.text!.text === 'ENY')) {
            expect(Math.abs((eny.geometry.coordinates as Position)[1] - hy)).toBeGreaterThan(10 * resolution);
        }
    });
});

describe('avenue of approach field H is level', () => {
    // 152300 boxes H level beside a climbing arrow (user, 2026-11-02).
    it('carries no rotation on a diagonal arrow', () => {
        const diagonal: Geometry = {type: 'LineString', coordinates: ((base as {coordinates: Position[]}).coordinates).map(([x, y]) => [x, y + x] as Position)};
        const properties = {designation: 'X', additionalInfo: 'NOTE', radius: 1000, hostility: TacticalGraphicHostility.friend};
        const marks = paintGraphic(buildPaintedGraphic(N.AvenueOfApproach, diagonal, properties, resolution)!, context).filter(p => p.text);
        const h = marks.find(p => p.text!.text === 'NOTE')!;
        expect(h.text!.rotation ?? 0).toBe(0);
        expect(marks.find(p => p.text!.text.startsWith('AA'))!.text!.rotation ?? 0).not.toBe(0);
    });
});

describe.each([N.AviationAxisOfAdvance, N.AttackHelicopterAxisOfAdvance])('%s keeps its dates out of the twist', name => {
    it('ends W - W1 before the walls start to cross', () => {
        // The dates ran through the crossing on every heading (found turning each line graphic
        // through four directions, 2026-11-01).
        const properties = {designation: 'DAVID', startDate: '011200Z', endDate: '021800Z', radius: 1000, hostility: TacticalGraphicHostility.friend};
        const graphic = buildPaintedGraphic(name, base, properties, resolution)!;
        const anchors = (graphic.labels as {geometry: {coordinates: Position[]}}).geometry.coordinates;
        const crossing = anchors[2][0];
        const end = anchors[anchors.length - 1][0];
        const twistStart = crossing - (end - crossing);
        const dates = paintGraphic(graphic, context).filter(p => p.text && (p.text.glyph ? /[0-9Z]/.test(p.text.text) : p.text.text.includes('011200Z')));
        expect(dates.length).toBeGreaterThan(0);
        for (const p of dates) expect((p.geometry.coordinates as Position)[0]).toBeLessThan(twistStart);
    });
});
