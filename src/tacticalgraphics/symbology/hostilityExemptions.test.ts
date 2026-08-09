/**
 * # The graphics a standard identity must not reach
 *
 * FM 1-02.2 gives the Chapter 6 tactical mission tasks no amplifier fields: a
 * hostile Breach is drawn exactly like any other Breach. Two more sets join them —
 * the line of contact, which draws both identities at once and so has nothing to
 * change, and the four table 5-19 obstacle effects, which are copies of a mission
 * task and must not diverge from what they copy.
 *
 * The demo enforced this by hiding the input. That is a UI convenience and it does
 * nothing about a hostility that arrives in an imported file, from a host writing
 * the property bag directly, or from a sweep that colours everything — which is
 * exactly what the MapLibre sample sweep did, drawing every mission task red.
 *
 * So these assert the *rendering*, not the field list.
 */

import {
    TacticalGraphicCategory,
    TacticalGraphicHostility,
    TacticalGraphicName,
    getColorByHostility,
    GRAPHIC_CATEGORIES,
    supportsHostility,
} from '../index';
import type {PaintFeature} from '../core/paint';
import {hostilityOf, lineColorOf} from './paintFunctions';

/** A feature carrying a hostility it should not be allowed to use. */
function hostileFeature(name: TacticalGraphicName, extra: Partial<PaintFeature> = {}): PaintFeature {
    return {
        geometry: {type: 'LineString', coordinates: [[0, 0], [1000, 0]]},
        properties: {name, hostility: TacticalGraphicHostility.hostileFaker},
        ...extra,
    };
}

const HOSTILE_RED = getColorByHostility(TacticalGraphicHostility.hostileFaker);
const UNAFFILIATED = getColorByHostility(TacticalGraphicHostility.unknown);

describe('supportsHostility', () => {
    it('is false for every Chapter 6 tactical mission task', () => {
        const missionTasks = (Object.keys(GRAPHIC_CATEGORIES) as TacticalGraphicName[])
            .filter(name => GRAPHIC_CATEGORIES[name] === TacticalGraphicCategory.TacticalMissionTasks);

        expect(missionTasks.length).toBeGreaterThan(20);
        expect(missionTasks.filter(supportsHostility)).toEqual([]);
    });

    it('is false for the line of contact and the four mission-task twins', () => {
        for (const name of [
            TacticalGraphicName.LineOfContact,
            TacticalGraphicName.Block,
            TacticalGraphicName.Disrupt,
            TacticalGraphicName.Fix,
            TacticalGraphicName.Turn,
        ]) {
            expect(supportsHostility(name)).toBe(false);
        }
    });

    it('is true for the ordinary control measures', () => {
        for (const name of [
            TacticalGraphicName.PhaseLine,
            TacticalGraphicName.Boundary,
            TacticalGraphicName.ObstacleBelt,
            TacticalGraphicName.AssemblyArea,
            TacticalGraphicName.ObstacleLine,
        ]) {
            expect(supportsHostility(name)).toBe(true);
        }
    });
});

describe('the paint layer refuses a hostility the symbol does not take', () => {
    it('draws an exempt graphic unaffiliated even when the bag says hostile', () => {
        for (const name of [TacticalGraphicName.TacticalBlock, TacticalGraphicName.Block, TacticalGraphicName.Fix]) {
            expect(lineColorOf(hostileFeature(name))).toBe(UNAFFILIATED);
            expect(hostilityOf(hostileFeature(name))).toBe(TacticalGraphicHostility.unknown);
        }
    });

    it('ignores a resolved hostilityColor on an exempt graphic', () => {
        // The other door: `hostilityColor` is a colour a host already resolved, so
        // honouring it would let the same value straight back in.
        const feature = hostileFeature(TacticalGraphicName.Breach, {hostilityColor: HOSTILE_RED});
        expect(lineColorOf(feature)).toBe(UNAFFILIATED);
    });

    it('still colours a graphic that does take one', () => {
        expect(lineColorOf(hostileFeature(TacticalGraphicName.PhaseLine))).toBe(HOSTILE_RED);
        expect(lineColorOf(hostileFeature(TacticalGraphicName.ObstacleLine))).toBe(HOSTILE_RED);
    });

    it('leaves an unnamed feature alone', () => {
        // A paint function can be called on a feature with no name — the parity test
        // does it — and guessing "exempt" there would silently drop every colour.
        const feature: PaintFeature = {
            geometry: {type: 'LineString', coordinates: [[0, 0], [1000, 0]]},
            properties: {hostility: TacticalGraphicHostility.hostileFaker} as PaintFeature['properties'],
        };
        expect(lineColorOf(feature)).toBe(HOSTILE_RED);
    });
});
