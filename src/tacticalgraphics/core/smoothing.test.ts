import {chaikinKeepingEnds, chaikinLine, chaikinRing} from './smoothing';
import {configureTacticalGraphics, resetTacticalGraphicsConfig} from './config';
import {renderTacticalGraphic, TacticalGraphicName} from '../index';

describe('chaikin smoothing', () => {
    afterEach(() => resetTacticalGraphicsConfig());

    it('keeps the ends of an open line and cuts the corner', () => {
        const line = chaikinLine([[0, 0], [1, 1], [2, 0]]);
        expect(line[0]).toEqual([0, 0]);
        expect(line[line.length - 1]).toEqual([2, 0]);
        expect(line.length).toBeGreaterThan(3);
        expect(line.some(p => p[0] === 1 && p[1] === 1)).toBe(false);
    });

    it('leaves a two-point line alone', () => {
        expect(chaikinLine([[0, 0], [1, 1]])).toEqual([[0, 0], [1, 1]]);
    });

    it('returns a closed ring', () => {
        const ring = chaikinRing([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]);
        expect(ring[0]).toEqual(ring[ring.length - 1]);
        expect(ring.length).toBe(4 * 8 + 1);
    });

    it('smooths a phase line only when configured, and never its base', () => {
        const coords = [[0, 0], [0.01, 0.01], [0.02, 0]];
        const base = {type: 'Feature', geometry: {type: 'LineString', coordinates: coords},
            properties: {tacticalGraphic: {name: TacticalGraphicName.PhaseLine}}} as any;
        const hard = renderTacticalGraphic(base)!;
        expect((hard.graphic.geometry as any).coordinates).toHaveLength(3);
        configureTacticalGraphics({smoothLines: true});
        const smooth = renderTacticalGraphic(base)!;
        expect((smooth.graphic.geometry as any).coordinates.length).toBeGreaterThan(3);
        expect(base.geometry.coordinates).toEqual(coords);
    });
});

describe('arrows keep the segments their parts are built on', () => {
    afterEach(() => resetTacticalGraphicsConfig());
    const route = [[0, 0], [0.02, 0.01], [0.04, -0.01], [0.06, 0]];
    const direction = (a: number[], b: number[]) => Math.atan2(b[1] - a[1], b[0] - a[0]);

    it('keeps the last drawn segment whole and meets it along its own line', () => {
        const line = chaikinKeepingEnds(route, false, true);
        expect(line[0]).toEqual(route[0]);
        expect(line.slice(-2)).toEqual(route.slice(-2));
        const n = line.length;
        expect(direction(line[n - 3], line[n - 2])).toBeCloseTo(direction(route[2], route[3]), 9);
    });

    it('keeps the first drawn segment too when asked', () => {
        const line = chaikinKeepingEnds(route, true, true);
        expect(line.slice(0, 2)).toEqual(route.slice(0, 2));
        expect(direction(line[1], line[2])).toBeCloseTo(direction(route[0], route[1]), 9);
        expect(line.slice(-2)).toEqual(route.slice(-2));
    });

    it('has nothing to round when both kept segments are all there is', () => {
        expect(chaikinKeepingEnds(route.slice(0, 3), true, true)).toEqual(route.slice(0, 3));
    });

    it("draws a main attack's head exactly as the hard line does", () => {
        // Four route points, then the width point the axis arrows store last.
        const base = {
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: [[0.06, 0], [0.04, -0.01], [0.02, 0.01], [0, 0], [0.0585, 0.002]]},
            properties: {tacticalGraphic: {name: TacticalGraphicName.MainAxisOfAdvance}},
        } as any;
        const hard = renderTacticalGraphic(structuredClone(base))!;
        configureTacticalGraphics({smoothLines: true});
        const smooth = renderTacticalGraphic(structuredClone(base))!;
        const head = (g: any) => g.graphic.geometry.coordinates[1];
        // Within float noise: the rails are offset along a different line before they reach the head.
        const flat = (x: number[][]) => x.flat();
        flat(head(smooth)).forEach((v, i) => expect(v).toBeCloseTo(flat(head(hard))[i], 9));
        expect(JSON.stringify(smooth.graphic.geometry)).not.toEqual(JSON.stringify(hard.graphic.geometry));
        expect(smooth.handles.geometry).toEqual(hard.handles.geometry);
    });
});
