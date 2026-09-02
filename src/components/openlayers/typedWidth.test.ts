import {listTacticalGraphicNames, TacticalGraphicName} from '@zaes/tactical-graphics';

import {getGraphicFields} from './graphicFieldRegistry';

/**
 * **A width is either measured off the map or typed, and the dialog has to know which.**
 *
 * The properties dialog decides between a read-out and an input by asking whether a width
 * is present on the feature. That worked while every width was measured: a corridor's rails
 * are that far apart, so the number is a report and a second way to set it would have to be
 * kept in step with the drag.
 *
 * The multiple-strike safe distance zone broke the assumption. It files a width — so a
 * measurement is present — but the width is the standoff its outer ring is *derived from*,
 * not something read off the geometry. Gating on presence rendered it as a label the
 * operator could read and not change, which is how a user found it.
 */
describe('typed vs measured width', () => {
    it('marks the multiple-strike zone width as typed', () => {
        const fields = getGraphicFields(TacticalGraphicName.MinimumSafeDistanceMultipleStrike);
        expect(fields.width).toBe(true);
        expect(fields.widthTyped).toBe(true);
    });

    it('leaves a measured width alone', () => {
        // A corridor's width is read off its rails: offering an input as well would give
        // the operator two ways to set one number.
        for (const name of [TacticalGraphicName.AirCorridor, TacticalGraphicName.MainSupplyRoute]) {
            expect(getGraphicFields(name).widthTyped).toBeFalsy();
        }
    });

    it('never marks a width typed without offering the width field at all', () => {
        // `widthTyped` only changes which control a width gets. Setting it on a graphic that
        // offers no width would be a flag nothing reads — a silent no-op rather than an
        // error, so it is worth failing on.
        const contradictory = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(name => {
            const set = getGraphicFields(name);
            return set.widthTyped && !set.width;
        });
        expect(contradictory).toEqual([]);
    });
});
