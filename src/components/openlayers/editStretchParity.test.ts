/**
 * # "Does an edit drag stretch this?" is one fact, so it must have one answer
 *
 * OpenLayers reads it off the controller — `editStretches` — and MapLibre, which has no
 * controllers, reads Layer 1's `editStretches(name)`. They used to be two statements:
 * OpenLayers *computed* it (`!NO_EDIT_STRETCH.has(name)` wherever a controller was built
 * with a vertex limit, plus an explicit `true` from the mission-task factories) while
 * Layer 1 answered from a hand-kept list.
 *
 * The list did not keep up. **42 graphics disagreed** — Bridge, Gap, the fords, the
 * crossings, the whole block family, the retrogrades, the linear targets, `Deny` — every
 * one of them stretching in OpenLayers and refusing in MapLibre, where the drag did
 * nothing at all and said nothing about it. A user noticed `Deny`; the other 41 were
 * waiting.
 *
 * The controller now reads the library's answer, so the two cannot drift by construction.
 * This suite is what keeps that true if either side is ever tempted to compute its own.
 */

import {
    TacticalGraphicName,
    baseVertexCount,
    editStretches,
    listTacticalGraphicNames,
} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';

const names = listTacticalGraphicNames().filter(
    (name): name is TacticalGraphicName => name in TacticalGraphicName,
);

describe('both engines answer the same', () => {
    it('has a registry to check', () => {
        expect(names.length).toBeGreaterThan(200);
    });

    it('agrees for every registered graphic', () => {
        const disagreements: string[] = [];
        for (const name of names) {
            let controller;
            try {
                controller = getController(name, 100);
            } catch {
                continue;
            }
            const fromController = !!(controller as {editStretches?: boolean}).editStretches;
            const fromLibrary = editStretches(name);
            if (fromController !== fromLibrary) {
                disagreements.push(`${name}: controller=${fromController} library=${fromLibrary}`);
            }
        }
        expect(disagreements).toEqual([]);
    });
});

describe('the rule behind the answer', () => {
    /**
     * A fixed vertex count *is* the condition — it is the same `maxPoints` the OpenLayers
     * factories pass — so anything with one stretches unless it is deliberately exempt.
     */
    it.each([
        TacticalGraphicName.Bridge,
        TacticalGraphicName.Gap,
        TacticalGraphicName.Block,
        TacticalGraphicName.Withdraw,
        TacticalGraphicName.LinearTarget,
        TacticalGraphicName.Abatis,
    ])('%s stretches because it has a vertex count', name => {
        expect(baseVertexCount(name)).toBeDefined();
        expect(editStretches(name)).toBe(true);
    });

    /** The point-anchored circles have no vertex count and stretch anyway. */
    it.each([
        TacticalGraphicName.Deny,
        TacticalGraphicName.Locate,
        TacticalGraphicName.PsyOpsZoneCircular,
        TacticalGraphicName.Secure,
    ])('%s stretches although it has no vertex count', name => {
        expect(baseVertexCount(name)).toBeUndefined();
        expect(editStretches(name)).toBe(true);
    });

    /**
     * The exemptions survive the derivation. These have a vertex count and still do
     * nothing on an edit drag, which is the user's own list.
     */
    it.each([
        TacticalGraphicName.Breach,
        TacticalGraphicName.Bypass,
        TacticalGraphicName.Canalize,
        TacticalGraphicName.Clear,
        TacticalGraphicName.AttackByFire,
        TacticalGraphicName.SupportByFire,
        TacticalGraphicName.Fix,
    ])('%s stays exempt', name => {
        expect(baseVertexCount(name)).toBeDefined();
        expect(editStretches(name)).toBe(false);
    });
});
