import {TacticalGraphicName, renderTacticalGraphic} from '@zaes/tactical-graphics';

const NAMES = Object.values(TacticalGraphicName).filter(n => String(n).startsWith('Wire')) as TacticalGraphicName[];
const RAILLESS = new Set<TacticalGraphicName>([TacticalGraphicName.WireUnspecified]);

const render = (name: TacticalGraphicName, size = 300) =>
    renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: [[0, 0], [0.05, 0]]},
        properties: {tacticalGraphic: {name, decorationSize: size}},
    } as any).graphic as any;

/** Longest part, in degrees of longitude - a rail spans the line, a mark spans one width. */
const longestPart = (g: any) =>
    Math.max(...g.geometry.coordinates.map((p: any[]) => Math.max(...p.map(c => c[0])) - Math.min(...p.map(c => c[0]))));

describe('wire obstacles', () => {
    it.each(NAMES.map(n => [String(n), n] as const))('%s renders finite geometry', (_l, name) => {
        const g = render(name);
        expect(g.geometry.type).toBe('MultiLineString');
        expect(g.geometry.coordinates.length).toBeGreaterThan(1);
        for (const part of g.geometry.coordinates) for (const c of part) expect(Number.isFinite(c[0]) && Number.isFinite(c[1])).toBe(true);
    });

    // Every one of these symbolises a *wire*, so a graphic that draws only its marks is
    // missing the thing being symbolised - except Unspecified, where that is the symbol.
    it.each(NAMES.filter(n => !RAILLESS.has(n)).map(n => [String(n), n] as const))('%s draws a full-length rail', (_l, name) => {
        expect(longestPart(render(name))).toBeGreaterThan(0.04);
    });

    it.each(NAMES.filter(n => RAILLESS.has(n)).map(n => [String(n), n] as const))('%s draws no rail, only marks', (_l, name) => {
        // Every part must be mark-sized. 300 m is ~0.0027 deg here; a rail would be 0.05.
        expect(longestPart(render(name))).toBeLessThan(0.01);
    });

    it('gives each name a distinct shape', () => {
        const shapes = NAMES.map(n => JSON.stringify(render(n).geometry.coordinates));
        expect(new Set(shapes).size).toBe(NAMES.length);
    });

    // The density ladder the user specified. Asserted as an ordering rather than as counts,
    // so it survives a spacing tweak but not a mix-up of which graphic is denser.
    it('orders the fences by mark density', () => {
        const marks = (n: TacticalGraphicName) => render(n).geometry.coordinates.filter((p: any[]) => p.length === 2).length;
        const single = marks(TacticalGraphicName.WireSingleFence);
        const double = marks(TacticalGraphicName.WireDoubleFence);
        const apron = marks(TacticalGraphicName.WireDoubleApronFence);
        expect(single).toBeLessThan(double);
        expect(double).toBeLessThan(apron);
    });

    // Marks and gaps are both multiples of one width, so doubling the size halves the count.
    it('scales the ladder with the mark size', () => {
        const at = (size: number) => render(TacticalGraphicName.WireSingleFence, size).geometry.coordinates.length;
        expect(at(300)).toBeGreaterThan(at(600));
    });
});
