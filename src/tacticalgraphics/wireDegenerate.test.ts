import {TacticalGraphicName, renderTacticalGraphic} from '@zaes/tactical-graphics';

const NAMES = Object.values(TacticalGraphicName).filter(n => String(n).startsWith('Wire')) as TacticalGraphicName[];

/**
 * What the draw interaction actually hands a generator between the first map click and the
 * second: a sketch with one point, or two identical ones. Every graphic must survive it -
 * the generator is called on every pointer move, so a throw here is a broken draw gesture,
 * not a cosmetic defect.
 */
const SKETCHES: [string, number[][]][] = [
    ['one point', [[0, 0]]],
    ['two identical points', [[0, 0], [0, 0]]],
    ['a sub-meter segment', [[0, 0], [0.000001, 0]]],
];

describe('wire obstacles mid-draw', () => {
    for (const [label, coords] of SKETCHES) {
        it.each(NAMES.map(n => [String(n), n] as const))(`%s survives ${label}`, (_l, name) => {
            const call = () =>
                renderTacticalGraphic({
                    type: 'Feature',
                    geometry: {type: 'LineString', coordinates: coords},
                    properties: {tacticalGraphic: {name, decorationSize: 300}},
                } as any);
            expect(call).not.toThrow();
            const g: any = call().graphic;
            for (const part of g.geometry.coordinates) {
                // A one-point part is not a line; OL renders nothing and some consumers throw.
                // A degenerate sketch is allowed to emit *no* parts - it is not allowed to
                // emit a broken one.
                expect(part.length).toBeGreaterThan(1);
                for (const c of part) expect(Number.isFinite(c[0]) && Number.isFinite(c[1])).toBe(true);
            }
        });
    }
});
