import {TacticalGraphicName, WIRE_STYLES, renderTacticalGraphic} from '@zaes/tactical-graphics';

const NAMES = Object.values(TacticalGraphicName).filter(n => String(n).startsWith('Wire')) as TacticalGraphicName[];

const render = (name: TacticalGraphicName, coords = [[0, 0], [0.05, 0]]) =>
    renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: coords},
        properties: {tacticalGraphic: {name, decorationSize: 300}},
    } as any).graphic as any;

describe('wire obstacles', () => {
    // The marks are screen-space decorations synthesised in wireObstacleStyleFunc, so the
    // geometry is the drawn route and nothing else. Baking them here froze them in metres
    // at the drawing zoom, which is what made them grow absurdly a few zoom levels in.
    it.each(NAMES.map(n => [String(n), n] as const))('%s returns the drawn route, not the marks', (_l, name) => {
        const g = render(name);
        expect(g.geometry.type).toBe('MultiLineString');
        expect(g.geometry.coordinates).toEqual([[[0, 0], [0.05, 0]]]);
    });

    // All nine share geometry now, so the ladder is the only thing that separates them and
    // a duplicated row would silently collapse two graphics into one.
    it('gives every name a distinct row in the ladder', () => {
        const rows = NAMES.map(n => JSON.stringify(WIRE_STYLES[n]));
        expect(rows.filter(r => r === undefined || r === 'undefined')).toEqual([]);
        expect(new Set(rows).size).toBe(NAMES.length);
    });

    // The density ladder the user specified, asserted as an ordering so it survives a
    // spacing tweak but not a mix-up of which graphic is denser.
    it('orders the fences by mark density', () => {
        const period = (n: TacticalGraphicName) => WIRE_STYLES[n]!.perGroup + WIRE_STYLES[n]!.gap;
        const perMark = (n: TacticalGraphicName) => period(n) / WIRE_STYLES[n]!.perGroup;
        expect(perMark(TacticalGraphicName.WireSingleFence)).toBeGreaterThan(perMark(TacticalGraphicName.WireDoubleFence));
        expect(perMark(TacticalGraphicName.WireDoubleFence)).toBeGreaterThan(perMark(TacticalGraphicName.WireDoubleApronFence));
    });

    it('draws no rail for Unspecified, where the marks are the symbol', () => {
        expect(WIRE_STYLES[TacticalGraphicName.WireUnspecified]!.rail).toBe(false);
        for (const n of NAMES.filter(n => n !== TacticalGraphicName.WireUnspecified)) expect(WIRE_STYLES[n]!.rail).toBe(true);
    });
});
