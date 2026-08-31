/**
 * The doctrinal constraints APP-06 states in prose.
 *
 * These live in the Draw Rules and Note columns of a plate, never in a Template box, which
 * is why nothing asserted them until the plate sweep read them off the page. Each case
 * names the row it came from. @see docs/app6-field-validation.md
 */

import {
    DoctrinalIssueKind,
    getDoctrinalRequirements,
    hasDoctrinalRequirements,
    isTacticalGraphicComplete,
    validateTacticalGraphic,
} from './doctrine';
import {TacticalGraphicEchelon, TacticalGraphicName} from './type';

describe('mobility corridor (APP-06 142100)', () => {
    it('is incomplete without an echelon', () => {
        const {complete, issues} = validateTacticalGraphic(TacticalGraphicName.MobilityCorridor);
        expect(complete).toBe(false);
        expect(issues).toHaveLength(1);
        expect(issues[0].amplifier).toBe('B');
        expect(issues[0].field).toBe('echelon');
        expect(issues[0].kind).toBe(DoctrinalIssueKind.missing);
    });

    it('treats the `unknown` echelon as unset', () => {
        // It is the enum's own placeholder and what an unstamped feature reads as, so
        // accepting it would pass a corridor that still draws no size of force.
        expect(isTacticalGraphicComplete(TacticalGraphicName.MobilityCorridor, {echelon: TacticalGraphicEchelon.unknown})).toBe(false);
    });

    it('is complete once a real echelon is set', () => {
        expect(isTacticalGraphicComplete(TacticalGraphicName.MobilityCorridor, {echelon: TacticalGraphicEchelon.brigade})).toBe(true);
    });
});

describe('the restricted-terrain pair (APP-06 152400 / 152500)', () => {
    const both = [TacticalGraphicName.RestrictedTerrain, TacticalGraphicName.SeverelyRestrictedTerrain];

    it.each(both)('%s requires field H, the cause of the restriction', name => {
        const {complete, issues} = validateTacticalGraphic(name);
        expect(complete).toBe(false);
        expect(issues[0].amplifier).toBe('H');
        expect(issues[0].message).toMatch(/cause of the restriction/);
    });

    it.each(both)('%s is complete once the cause is given', name => {
        expect(isTacticalGraphicComplete(name, {additionalInfo: 'Gradient 35% Soft'})).toBe(true);
    });

    it('does not accept whitespace as a cause', () => {
        expect(isTacticalGraphicComplete(TacticalGraphicName.RestrictedTerrain, {additionalInfo: '   '})).toBe(false);
    });
});

describe('the minefields (APP-06 270801 / 270707)', () => {
    const both = [TacticalGraphicName.MinedAreaFenced, TacticalGraphicName.MinefieldDynamicDepiction];

    it.each(both)('%s accepts "S" for scatterable mines only', name => {
        expect(isTacticalGraphicComplete(name, {additionalInfo: 'S'})).toBe(true);
    });

    it.each(both)('%s accepts "+S" for a mix', name => {
        expect(isTacticalGraphicComplete(name, {additionalInfo: '+S'})).toBe(true);
    });

    it.each(both)('%s rejects anything else in field H', name => {
        const {complete, issues} = validateTacticalGraphic(name, {additionalInfo: 'AT'});
        expect(complete).toBe(false);
        expect(issues[0].kind).toBe(DoctrinalIssueKind.format);
    });

    it('does not require field H at all — only constrains it when present', () => {
        // The plate makes H conditional on what the field holds, not mandatory: an ordinary
        // minefield with no scatterable mines has nothing to put there.
        expect(isTacticalGraphicComplete(TacticalGraphicName.MinedAreaFenced)).toBe(true);
    });

    it('is case- and space-insensitive, since the operator types it', () => {
        expect(isTacticalGraphicComplete(TacticalGraphicName.MinedAreaFenced, {additionalInfo: ' +s '})).toBe(true);
    });
});

describe('the table is sparse by design', () => {
    it('reports an unruled graphic complete rather than erroring', () => {
        // A phase line with no name is a legal phase line. Most of the standard is like
        // this, which is why there is no exhaustive Record here.
        expect(isTacticalGraphicComplete(TacticalGraphicName.PhaseLine)).toBe(true);
        expect(hasDoctrinalRequirements(TacticalGraphicName.PhaseLine)).toBe(false);
        expect(getDoctrinalRequirements(TacticalGraphicName.PhaseLine)).toEqual([]);
    });

    it('cites a publication row for every rule it does carry', () => {
        // A rule with no source is a rule nobody can check against the standard later.
        const ruled = [
            TacticalGraphicName.MobilityCorridor,
            TacticalGraphicName.RestrictedTerrain,
            TacticalGraphicName.SeverelyRestrictedTerrain,
            TacticalGraphicName.MinedAreaFenced,
            TacticalGraphicName.MinefieldDynamicDepiction,
        ];
        for (const name of ruled) {
            expect(hasDoctrinalRequirements(name)).toBe(true);
            for (const rule of getDoctrinalRequirements(name)) {
                expect(rule.source).toMatch(/^APP-06 \d{6}$/);
                expect(rule.amplifier).toMatch(/^[A-Z][A-Z0-9]?$/);
            }
        }
    });
});
