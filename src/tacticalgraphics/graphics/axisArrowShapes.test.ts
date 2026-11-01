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
