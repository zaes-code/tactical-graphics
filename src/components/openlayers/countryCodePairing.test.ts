/**
 * A country code pairs with a designation, so a graphic gets as many codes as it has names.
 *
 * This is the third time the same shape of defect has surfaced. First `identifier2` and the
 * country codes shared one flag, so final protective fire — a second designation with no
 * code — was offered two boxes nothing would draw. Splitting the flag fixed that and
 * introduced the mirror image: the fire-support areas carry a code and *no* second
 * designation, and a dialog rendering both boxes off the one flag offered them an "other
 * country code" that nothing would ever draw either.
 *
 * The rule that closes both is the same one the paints have always implemented:
 *
 * ```
 * countryCode        countryCodes
 * secondCountryCode  countryCodes && identifier2
 * ```
 *
 * @see GraphicFieldSet.countryCodes, boundaryPaint, engineerWorkLinePaint
 */

import {TacticalGraphicName, listTacticalGraphicNames} from '@zaes/tactical-graphics';
import {getGraphicFields} from './graphicFieldRegistry';

const names = listTacticalGraphicNames().filter((n): n is TacticalGraphicName => n in TacticalGraphicName);

/** Graphics offering a country code at all. */
const withCodes = names.filter(name => getGraphicFields(name).countryCodes);

/** Graphics offering a *second* country code, under the pairing rule. */
const withSecondCode = withCodes.filter(name => getGraphicFields(name).identifier2);

describe('country codes pair with designations', () => {
    it('has both kinds of graphic to check', () => {
        // A one-sided sample would let either half of the rule rot unnoticed.
        expect(withCodes.length).toBeGreaterThan(withSecondCode.length);
        expect(withSecondCode.length).toBeGreaterThan(0);
    });

    it('offers a second code only where there is a second designation', () => {
        for (const name of withCodes) {
            const fields = getGraphicFields(name);
            const offersSecondCode = fields.countryCodes && fields.identifier2;
            expect({name, second: offersSecondCode}).toEqual({name, second: fields.identifier2});
        }
    });

    it('is exactly the two dual-designation line graphics that take two codes', () => {
        // Boundary prints `T/AS` over `T1/AS1` and the engineer work line does the same;
        // nothing else in the set has two names to attach codes to.
        expect([...withSecondCode].sort()).toEqual(
            [TacticalGraphicName.Boundary, TacticalGraphicName.EngineerWorkLine].sort(),
        );
    });

    it('is the fire-support areas and the fire-support lines that take one', () => {
        /*
         * Free, no and restrictive fire areas, three variants each. Their plates letter the
         * pair `T2 ( AS )` — the establishing formation and its country — with no second
         * name beside it, so one code and one only.
         *
         * The six lines joined them on 2026-09-01. `T2 ( AS )` is the same pair on the same
         * kind of plate, and the fire support coordination line, the battlefield
         * coordination line and the coordinated fire line all draw it; the battlefield
         * handover line and the delay line follow the same ruling, and the decision line
         * letters `T` beside `AS` and sets the two apart with a slash rather than brackets.
         *
         * Pinned by name rather than counted, and the pin earned it: adding the six turned
         * this list over silently. One more appearing here would mean a graphic picked up a
         * country code without anyone checking its plate for a second designation.
         */
        const single = withCodes.filter(name => !getGraphicFields(name).identifier2);
        expect([...single].sort()).toEqual(
            [
                TacticalGraphicName.BattlefieldCoordinationLine,
                TacticalGraphicName.BattlefieldHandoverLine,
                TacticalGraphicName.CoordinatedFireLine,
                TacticalGraphicName.DecisionLine,
                TacticalGraphicName.DelayLine,
                TacticalGraphicName.FireSupportCoordinationLine,
                TacticalGraphicName.FreeFireAreaCircular,
                TacticalGraphicName.FreeFireAreaIrregular,
                TacticalGraphicName.FreeFireAreaRectangular,
                TacticalGraphicName.NoFireAreaCircular,
                TacticalGraphicName.NoFireAreaIrregular,
                TacticalGraphicName.NoFireAreaRectangular,
                TacticalGraphicName.RestrictiveFireAreaCircular,
                TacticalGraphicName.RestrictiveFireAreaIrregular,
                TacticalGraphicName.RestrictiveFireAreaRectangular,
            ].sort(),
        );
    });

    it('still keeps final protective fire out of it', () => {
        // The graphic the split was made for: a second designation, and no code at all.
        const fields = getGraphicFields(TacticalGraphicName.FinalProtectiveFire);
        expect(fields.identifier2).toBe(true);
        expect(fields.countryCodes).toBe(false);
    });
});
