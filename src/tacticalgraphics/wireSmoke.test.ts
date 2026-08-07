import {TacticalGraphicName, renderTacticalGraphic} from '@zaes/tactical-graphics';
const NAMES = Object.values(TacticalGraphicName).filter(n => String(n).startsWith('Wire')) as TacticalGraphicName[];
const render = (name: TacticalGraphicName) => renderTacticalGraphic({
    type: 'Feature', geometry: {type: 'LineString', coordinates: [[0, 0], [0.05, 0]]},
    properties: {tacticalGraphic: {name, decorationSize: 300}},
} as any).graphic as any;

describe('wire obstacles', () => {
    it.each(NAMES.map(n => [String(n), n] as const))('%s renders finite geometry', (_l, name) => {
        const g = render(name);
        expect(g.geometry.type).toBe('MultiLineString');
        expect(g.geometry.coordinates.length).toBeGreaterThan(1);
        for (const part of g.geometry.coordinates)
            for (const c of part) expect(Number.isFinite(c[0]) && Number.isFinite(c[1])).toBe(true);
    });

    // The rail is the wire itself; every one of these is a *wire* obstacle, so a graphic
    // that draws only its marks is missing the thing being symbolised.
    it.each(NAMES.map(n => [String(n), n] as const))('%s draws a full-length rail', (_l, name) => {
        const g = render(name);
        const span = (p: any[]) => Math.max(...p.map(c => c[0])) - Math.min(...p.map(c => c[0]));
        const longest = Math.max(...g.geometry.coordinates.map(span));
        expect(longest).toBeGreaterThan(0.04);
    });

    it('gives each name a distinct shape', () => {
        const shapes = NAMES.map(n => JSON.stringify(render(n).geometry.coordinates));
        expect(new Set(shapes).size).toBe(NAMES.length);
    });
});
