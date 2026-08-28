/**
 * # A graphic saved before 3.0.0 still has its designations
 *
 * `properties.tacticalGraphic` is what a host **saves**, so renaming a key inside it
 * silently empties that amplifier on every graphic already on disk — the symbol still
 * draws, just anonymously, which is the kind of loss nobody notices until a planner
 * opens last month's overlay.
 *
 * The rename was worth making (@see TacticalGraphicProperties.designation) and, unlike
 * the point-order change shipping in the same release, it is cheap to make survivable.
 * These tests pin that: the old key is read, it is never written back, and it never wins
 * over the current one.
 */

import {applyAmplifierAliases, readTacticalGraphicProperties, renderTacticalGraphic, TACTICAL_GRAPHIC_KEY} from '../index';
import {TacticalGraphicName} from './type';
import type {Feature} from 'geojson';

/** A feature as a 2.x host would have written it. */
const legacyFeature = (bag: Record<string, unknown>): Feature => ({
    type: 'Feature',
    geometry: {type: 'LineString', coordinates: [[-77.04, 38.89], [-76.95, 38.95]]},
    properties: {[TACTICAL_GRAPHIC_KEY]: {name: TacticalGraphicName.PhaseLine, ...bag}},
});

describe('applyAmplifierAliases', () => {
    it('reads the designations a pre-3.0.0 file calls label and secondId', () => {
        // Typed as the loose bag a saved file really is: the generic returns what it is
        // given, and what it is given here has keys this version's schema no longer names.
        const out = applyAmplifierAliases<Record<string, unknown>>({label: '1-508 IN', secondId: 'TF RAIDER'});
        expect(out.designation).toBe('1-508 IN');
        expect(out.secondDesignation).toBe('TF RAIDER');
    });

    /**
     * An old key is evidence about a file's age, not an override. A bag carrying both
     * came from a host mid-migration, and the name it writes *now* is the one it means.
     */
    it('lets the current name win when a bag carries both', () => {
        const out = applyAmplifierAliases({label: 'OLD', designation: 'NEW'});
        expect(out.designation).toBe('NEW');
    });

    it('leaves a current bag untouched, and does not copy the old names back in', () => {
        const bag = {designation: 'ALPHA', secondDesignation: 'BRAVO'};
        const out = applyAmplifierAliases(bag);
        expect(out).toBe(bag); // same object: nothing to translate, nothing allocated
        expect(Object.keys(out)).toEqual(['designation', 'secondDesignation']);
    });

    it('does not invent a designation for a graphic that never had one', () => {
        expect(applyAmplifierAliases({name: TacticalGraphicName.PhaseLine})).not.toHaveProperty('designation');
    });

    it('leaves every other amplifier alone', () => {
        const out = applyAmplifierAliases({label: 'X', additionalInfo: 'NOTE', countryCode: 'USA'});
        expect(out.additionalInfo).toBe('NOTE');
        expect(out.countryCode).toBe('USA');
    });
});

describe('the read path a saved file actually takes', () => {
    it('readTacticalGraphicProperties translates the old keys', () => {
        const props = readTacticalGraphicProperties(legacyFeature({label: 'PL ALPHA', secondId: 'PL BRAVO'}));
        expect(props?.designation).toBe('PL ALPHA');
        expect(props?.secondDesignation).toBe('PL BRAVO');
    });

    /**
     * The end a consumer sees: the rendered features carry the amplifiers stamped back
     * onto them, so a 2.x file rendered by 3.x has its designation on every output
     * feature rather than on none of them.
     */
    it('renderTacticalGraphic stamps the translated designation onto its output', () => {
        const render = renderTacticalGraphic(legacyFeature({label: 'PL ALPHA'}));
        const stamped = render.graphic.properties?.[TACTICAL_GRAPHIC_KEY] as {designation?: string};
        expect(stamped.designation).toBe('PL ALPHA');
    });
});
