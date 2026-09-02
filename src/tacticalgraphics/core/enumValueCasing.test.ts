/**
 * # One casing rule for every enum value a host can store
 *
 * The library ships thirteen exported enums, and until 2026-08-30 their values were
 * spelled three different ways at once. A single saved property bag could read
 * `{hostility: 'Hostile/Faker', status: 'present', direction: 'ONE_WAY'}` — Title Case,
 * lower case and UPPER_SNAKE in three adjacent fields — and the demo's dropdowns, which
 * print `Object.values(...)` straight into the menu, showed the operator all three.
 *
 * The rule, and the three exemptions it needs to be true:
 *
 * - **An amplifier the operator picks from a list** holds the words they read:
 *   `'Antitank Mine'`, `'Platoon/Detachment'`, `'One Way'`.
 * - **`TacticalGraphicName` is the dispatch key**, not a label. It is a PascalCase
 *   identifier matching its own key, and `getDisplayName()` is what the UI shows —
 *   which is the convention the repo already states for it.
 * - **`AltitudeDatum` and `TacticalGraphicSpecification` hold literals somebody else
 *   wrote**: `MSL`, `AGL`, `FL` are printed on the plate exactly like that, and
 *   `'FM 1-02.2'` is a document number.
 *
 * These assert the rule rather than the current values, so a new enum joins it without
 * anyone remembering to come back here.
 */

import * as config from './config';
import * as type from './type';
import * as categories from './categories';
import * as specifications from './specifications';
import {AltitudeDatum, RouteDirection, TacticalGraphicConfidence, TacticalGraphicName, TacticalGraphicStatus} from './type';
import {AltitudeUnit} from './config';
import {applyAmplifierAliases} from './render';

/** Every exported enum, found by shape so a new one is covered the day it is added. */
function exportedEnums(): Array<[string, Record<string, string>]> {
    const modules = {...config, ...type, ...categories, ...specifications} as Record<string, unknown>;
    return Object.entries(modules)
        .filter((entry): entry is [string, Record<string, string>] => {
            const [name, value] = entry;
            if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
            // An enum compiles to a PascalCase binding whose values are all strings.
            // The SCREAMING_SNAKE const tables in the same modules are not enums.
            const values = Object.values(value);
            return /^[A-Z][A-Za-z0-9]*$/.test(name) && values.length > 0 && values.every(v => typeof v === 'string');
        });
}

/** The three that hold somebody else's literal, each for a stated reason. */
const NOT_OPERATOR_FACING = new Set(['TacticalGraphicName', 'AltitudeDatum', 'TacticalGraphicSpecification']);

describe('every enum value a host can store', () => {
    it('finds the enums to check', () => {
        const names = exportedEnums().map(([n]) => n);
        expect(names).toContain('TacticalGraphicHostility');
        expect(names).toContain('RouteDirection');
        expect(names).toContain('AltitudeUnit');
        expect(names.length).toBeGreaterThanOrEqual(13);
    });

    it.each(exportedEnums().filter(([n]) => !NOT_OPERATOR_FACING.has(n)))('%s reads as the words an operator sees', (_name, members) => {
        for (const value of Object.values(members)) {
            // Every word starts capitalised. Nothing lower case, nothing UPPER_SNAKE.
            expect(value).toMatch(/^[A-Z][A-Za-z]*([ /\-][A-Za-z(][A-Za-z)\-]*)*$/);
            expect(value).not.toMatch(/_/);
        }
    });

    it('keeps the dispatch key an identifier, matching its own key', () => {
        for (const [key, value] of Object.entries(TacticalGraphicName)) expect(value).toBe(key);
    });

    it('keeps the doctrinal literals exactly as the source prints them', () => {
        expect(Object.values(AltitudeDatum)).toEqual(['MSL', 'AGL', 'FL']);
        expect(Object.values(specifications.TacticalGraphicSpecification)).toContain('FM 1-02.2');
    });

    it('spells the four that moved the way the other nine already did', () => {
        expect(Object.values(TacticalGraphicStatus)).toEqual(['Present', 'Planned']);
        expect(Object.values(TacticalGraphicConfidence)).toEqual(['Known', 'Suspected']);
        expect(Object.values(RouteDirection)).toEqual(['General', 'One Way', 'Two Way', 'Alternating']);
        expect(Object.values(AltitudeUnit)).toEqual(['Meters', 'Feet']);
    });

    it('names its members the same way throughout', () => {
        for (const [name, members] of exportedEnums()) {
            if (name === 'TacticalGraphicName' || name === 'TacticalGraphicCategory' || name === 'TacticalGraphicSpecification') continue;
            for (const key of Object.keys(members)) expect(key).toMatch(/^[a-z][A-Za-z0-9]*$/);
        }
    });
});

describe('a graphic saved before the recasing still loads', () => {
    it('translates the values that moved', () => {
        const old = {name: TacticalGraphicName.PhaseLine, status: 'present', confidence: 'suspected', direction: 'ONE_WAY'};
        expect(applyAmplifierAliases(old)).toMatchObject({
            status: TacticalGraphicStatus.present,
            confidence: TacticalGraphicConfidence.suspected,
            direction: RouteDirection.oneWay,
        });
    });

    it('leaves a current bag alone, object identity included', () => {
        const current = {name: TacticalGraphicName.PhaseLine, status: TacticalGraphicStatus.planned};
        expect(applyAmplifierAliases(current)).toBe(current);
    });

    it('does not translate a value that was never recased', () => {
        // `hostility` has always held the words it holds now, so nothing may touch it.
        const bag = {hostility: 'Hostile/Faker'};
        expect(applyAmplifierAliases(bag)).toBe(bag);
    });

    it('ignores a field holding something that is not a string', () => {
        const bag = {status: 3} as unknown as object;
        expect(applyAmplifierAliases(bag)).toBe(bag);
    });
});
