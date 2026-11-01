/**
 * # The axis arrows' line work, against their plates
 *
 * Shapes only; where the labels go is pinned elsewhere.
 */
import {renderTacticalGraphic} from '../core/render';
import {TacticalGraphicName} from '../core/type';

/** Tip first, then the rear, then the width point: the order all eleven store. */
const BASE = [[1, 0], [0, 0], [0.95, 0.06]];

const drawn = (name: TacticalGraphicName) =>
    (renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: BASE},
        properties: {tacticalGraphic: {name}},
    } as never).graphic.geometry as {coordinates: number[][][]}).coordinates;

describe('avenue of approach (APP-06 152300)', () => {
    it('draws the supporting axis of advance’s single-outline arrow, not the main attack’s', () => {
        expect(drawn(TacticalGraphicName.AvenueOfApproach)).toEqual(drawn(TacticalGraphicName.SupportingAxisOfAdvance));
        expect(drawn(TacticalGraphicName.AvenueOfApproach)).not.toEqual(drawn(TacticalGraphicName.MainAxisOfAdvance));
    });
});

/**
 * 151401 / 151402 (APP-06, MIL-STD-2525E Table L-X): the walls hold their full width and cross
 * in a short twist just behind the head, not across the whole last leg.
 */
describe.each([TacticalGraphicName.AviationAxisOfAdvance, TacticalGraphicName.AttackHelicopterAxisOfAdvance])('%s', name => {
    it('keeps its body full width until about three half-widths behind the head', () => {
        const [wall] = drawn(name);
        const half = Math.abs(wall[0][1]);
        const end = wall[wall.length - 1];
        const twistStart = wall[wall.length - 2];
        // The twist starts on the wall's own side, at full width...
        expect(Math.abs(twistStart[1])).toBeCloseTo(half, 3);
        expect(Math.sign(twistStart[1])).toBe(Math.sign(wall[0][1]));
        // ...and ends on the other side three half-widths on.
        expect(Math.sign(end[1])).toBe(-Math.sign(wall[0][1]));
        expect((end[0] - twistStart[0]) / half).toBeCloseTo(3, 1);
    });
});

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('frontal attack (152700, 2525E Table L-VII)', () => {
    it('crosses its tip with a line twice the width of the head’s base', () => {
        const lines = drawn(TacticalGraphicName.FrontalAttack);
        const [, leftWing, , rightWing] = lines[1];
        const bar = lines[lines.length - 1];
        expect(dist(bar[0], bar[1]) / dist(leftWing, rightWing)).toBeCloseTo(2, 2);
    });
});

describe('turning movement (152900, 2525E Table L-VII)', () => {
    it('crosses the tail with a line three body widths long', () => {
        const lines = drawn(TacticalGraphicName.TurningMovement);
        const half = Math.abs(lines[0][0][1]);
        const line = lines[lines.length - 1];
        expect(dist(line[0], line[1]) / (2 * half)).toBeCloseTo(3, 1);
        // A third of the way up the first leg, from the rear.
        expect(line[0][0]).toBeLessThan(0.5);
    });
});

describe('advance to contact (342900, 2525E Table L-XXI)', () => {
    it('throws each bolt at least twice the body width, about 45 degrees off the heading', () => {
        const lines = drawn(TacticalGraphicName.AdvanceToContact);
        const half = Math.abs(lines[0][0][1]);
        // [left body, head, right body, bolt, bolt head, bolt, bolt head]
        for (const bolt of [lines[3], lines[5]]) {
            const start = bolt[0];
            const end = bolt[bolt.length - 1];
            expect(dist(start, end)).toBeGreaterThanOrEqual(2 * 2 * half);
            // The arrow runs along the x axis, so the bolt's angle off it is its angle off the heading.
            const off = (Math.atan2(Math.abs(end[1] - start[1]), Math.abs(end[0] - start[0])) * 180) / Math.PI;
            expect(Math.abs(off - 45)).toBeLessThan(5);
        }
    });
});
