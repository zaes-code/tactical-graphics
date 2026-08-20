/**
 * # Labels may follow their affiliation, and by default do not
 *
 * FM 1-02.2 colours *line work* by affiliation and leaves text amplifiers black: a
 * hostile phase line is red and its "PL BLUE" is not. That is the library's default and
 * `hostilityExemptions.test.ts` pins it.
 *
 * `labelUsesHostilityColor` offers the other behaviour as a host's choice — a dark or
 * busy basemap often wants the amplifier to read as part of the symbol. This suite pins
 * both halves, and that the switch supersedes `labelFillColor` rather than mixing with it.
 */

import {
    TacticalGraphicHostility,
    TacticalGraphicName,
    TacticalGraphicsConfig,
    getColorByHostility,
    getLabelFillColor,
    setTacticalGraphicsConfig,
} from '@zaes/tactical-graphics';
import {labelColorOf, lineColorOf} from './paintFunctions';
import type {PaintFeature} from '@zaes/tactical-graphics';

const featureWith = (hostility: TacticalGraphicHostility): PaintFeature => ({
    geometry: {type: 'LineString', coordinates: [[0, 0], [1000, 0]]},
    properties: {name: TacticalGraphicName.PhaseLine, hostility},
} as unknown as PaintFeature);

afterEach(() => setTacticalGraphicsConfig(new TacticalGraphicsConfig({})));

describe('by default a label is text, not line work', () => {
    it('takes the label fill whatever the affiliation', () => {
        for (const hostility of [TacticalGraphicHostility.friend, TacticalGraphicHostility.hostileFaker]) {
            expect(labelColorOf(featureWith(hostility))).toBe(getLabelFillColor());
        }
    });

    it('leaves the line work coloured by affiliation, as doctrine requires', () => {
        expect(lineColorOf(featureWith(TacticalGraphicHostility.hostileFaker)))
            .toBe(getColorByHostility(TacticalGraphicHostility.hostileFaker));
    });
});

describe('with labelUsesHostilityColor on', () => {
    beforeEach(() => setTacticalGraphicsConfig(new TacticalGraphicsConfig({labelUsesHostilityColor: true})));

    it('colours the label by affiliation', () => {
        expect(labelColorOf(featureWith(TacticalGraphicHostility.hostileFaker)))
            .toBe(getColorByHostility(TacticalGraphicHostility.hostileFaker));
        expect(labelColorOf(featureWith(TacticalGraphicHostility.friend)))
            .toBe(getColorByHostility(TacticalGraphicHostility.friend));
    });

    /**
     * The label follows its own line work exactly — including the exemptions. A graphic
     * that does not take a hostility colour must not take one on its text either, or the
     * two halves of one symbol disagree.
     */
    it('follows the line work, exemptions included', () => {
        for (const hostility of Object.values(TacticalGraphicHostility)) {
            const feature = featureWith(hostility);
            expect(labelColorOf(feature)).toBe(lineColorOf(feature));
        }
    });

    /**
     * **It supersedes `labelFillColor` outright.** The two are one either/or, which is
     * why the demo greys the colour picker while this is on: a host that saw both live
     * would reasonably expect them to combine, and there is no sensible way to combine
     * "this exact colour" with "whatever the affiliation is".
     */
    it('outranks an explicit label fill', () => {
        setTacticalGraphicsConfig(new TacticalGraphicsConfig({
            labelUsesHostilityColor: true,
            labelFillColor: '#123456',
        }));
        expect(labelColorOf(featureWith(TacticalGraphicHostility.hostileFaker)))
            .toBe(getColorByHostility(TacticalGraphicHostility.hostileFaker));
    });

    it('is off again once the host clears it', () => {
        setTacticalGraphicsConfig(new TacticalGraphicsConfig({labelUsesHostilityColor: false}));
        expect(labelColorOf(featureWith(TacticalGraphicHostility.hostileFaker))).toBe(getLabelFillColor());
    });
});
