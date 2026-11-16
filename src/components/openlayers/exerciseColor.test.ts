/**
 * The OpenLayers-only style functions read the exercise flag the same way the shared paints do:
 * an exercise graphic whose identity is unknown draws in the pending yellow (MIL-STD-2525C
 * Table II, exercise unknown). @see getColorByIdentity
 */
import Feature from 'ol/Feature';
import {TacticalGraphicHostility, TacticalGraphicName, getColorByHostility, getDefaultLineColor} from '@zaes/tactical-graphics';
import {writeGraphicProperties} from './graphicProperties';
import {readHostilityColor} from './openlayerStyles';

const stamped = (labels: Record<string, unknown>): Feature => {
    const feature = new Feature();
    writeGraphicProperties([feature], TacticalGraphicName.PhaseLine, {designation: '', ...labels});
    return feature;
};

describe('readHostilityColor inside an exercise', () => {
    it('draws exercise unknown in the pending yellow', () => {
        expect(readHostilityColor(stamped({hostility: TacticalGraphicHostility.unknown, exercise: true})))
            .toBe(getColorByHostility(TacticalGraphicHostility.pending));
    });

    it('draws a stated Unknown in the pending yellow, outside an exercise too', () => {
        expect(readHostilityColor(stamped({hostility: TacticalGraphicHostility.unknown, identityStated: true})))
            .toBe(getColorByHostility(TacticalGraphicHostility.pending));
    });

    it('keeps unknown, and an exercise with no identity, in the default line colour', () => {
        expect(readHostilityColor(stamped({hostility: TacticalGraphicHostility.unknown}))).toBe(getDefaultLineColor());
        expect(readHostilityColor(stamped({exercise: true}))).toBe(getDefaultLineColor());
    });
});
