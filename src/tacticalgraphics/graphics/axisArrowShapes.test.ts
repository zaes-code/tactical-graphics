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
