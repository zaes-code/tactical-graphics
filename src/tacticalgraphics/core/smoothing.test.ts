import {chaikinLine, chaikinRing} from './smoothing';
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
