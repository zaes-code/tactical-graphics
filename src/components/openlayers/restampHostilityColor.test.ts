/**
 * The sample app's dark-mode and settings sweeps re-derive the `hostilityColor` the properties
 * dialog stamped. They read the loose hostility alone, so a stated Unknown or an exercise
 * graphic's Unknown went back to black on the first sweep. @see restampHostilityColor
 */
import Feature from 'ol/Feature';
import {LineString} from 'ol/geom';
import {TacticalGraphicHostility, TacticalGraphicName, getColorByHostility, getDefaultLineColor} from '@zaes/tactical-graphics';
import {writeGraphicProperties} from './graphicProperties';
import {restampHostilityColor} from './featurePropertiesSource';

const YELLOW = getColorByHostility(TacticalGraphicHostility.pending);

/** A feature as the dialog leaves it: the bag, the loose hostility, and a resolved colour. */
function dialogStamped(labels: Record<string, unknown>, color: string): Feature {
    const feature = new Feature(new LineString([[0, 0], [1000, 0]]));
    writeGraphicProperties([feature], TacticalGraphicName.PhaseLine, {designation: '', ...labels});
    feature.set('hostility', labels.hostility);
    feature.set('hostilityColor', color);
    return feature;
}

describe('restampHostilityColor', () => {
    it('keeps a stated Unknown yellow', () => {
        const f = dialogStamped({hostility: TacticalGraphicHostility.unknown, identityStated: true}, YELLOW);
        restampHostilityColor(f);
        expect(f.get('hostilityColor')).toBe(YELLOW);
    });

    it("keeps an exercise graphic's Unknown yellow", () => {
        const f = dialogStamped({hostility: TacticalGraphicHostility.unknown, exercise: true}, YELLOW);
        restampHostilityColor(f);
        expect(f.get('hostilityColor')).toBe(YELLOW);
    });

    it('keeps an unset Unknown in the default line colour, and a friend blue', () => {
        const unset = dialogStamped({hostility: TacticalGraphicHostility.unknown}, 'stale');
        restampHostilityColor(unset);
        expect(unset.get('hostilityColor')).toBe(getDefaultLineColor());
        const friend = dialogStamped({hostility: TacticalGraphicHostility.friend}, 'stale');
        restampHostilityColor(friend);
        expect(friend.get('hostilityColor')).toBe(getColorByHostility(TacticalGraphicHostility.friend));
    });

    it('leaves a feature with no stamp alone', () => {
        const f = new Feature(new LineString([[0, 0], [1000, 0]]));
        restampHostilityColor(f);
        expect(f.get('hostilityColor')).toBeUndefined();
    });
});
