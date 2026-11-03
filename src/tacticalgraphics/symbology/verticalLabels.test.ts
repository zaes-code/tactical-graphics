/**
 * # An exactly vertical line labels both its ends the same way
 *
 * Two clicks in one pixel column draw it. The ends read in opposite directions and the bottom
 * label sat on the line, on every two-ended line (found turning each line graphic through four
 * directions, 2026-11-01).
 */
import type {PaintContext, PaintFeature} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {offsetAbove, uprightRotation} from './decorations';
import {defaultLinePaint} from './paintFunctions';

beforeEach(() => resetTacticalGraphicsConfig());

describe('a vertical segment', () => {
    it('reads bottom to top whichever way it was drawn', () => {
        expect(uprightRotation([0, 0], [0, 10])).toBeCloseTo(-Math.PI / 2, 9);
        expect(uprightRotation([0, 10], [0, 0])).toBeCloseTo(-Math.PI / 2, 9);
    });

    it('puts "above" on the west, where the top of that text is', () => {
        expect(offsetAbove([0, 0], [0, 0], [0, 10], 1, 5)[0]).toBeLessThan(0);
        expect(offsetAbove([0, 0], [0, 10], [0, 0], 1, 5)[0]).toBeLessThan(0);
    });
});

describe('a default line drawn straight up', () => {
    const context: PaintContext = {resolution: 100, measureText: text => text.length * 9};
    const feature: PaintFeature = {
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: [[0, 0], [0, 60000]]},
        properties: {name: TacticalGraphicName.LightLine, designation: 'ALPHA'},
    } as PaintFeature;

    it('sets both names the same way up, on the same side, clear of the line', () => {
        const names = defaultLinePaint(TacticalGraphicName.LightLine)(feature, context).filter(p => p.text?.text.includes('ALPHA'));
        expect(names).toHaveLength(2);
        for (const p of names) {
            expect(p.text!.rotation).toBeCloseTo(-Math.PI / 2, 9);
            expect((p.geometry.coordinates as number[])[0]).toBeLessThan(0);
        }
        // Each runs inward from its own end.
        expect(names.map(p => p.text!.align)).toEqual(['left', 'right']);
    });
});
