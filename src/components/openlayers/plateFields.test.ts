/**
 * # Dialog fields the plates letter, and the ones they do not
 *
 * Each row here was a mismatch found by the 2026-10-31 QA pass, read against MIL-STD-2525E
 * Change 1 Appendix L first and APP-06 where 2525E has no entry. A field the plate boxes and
 * the dialog does not offer can never be filled in; a field the dialog offers and the plate
 * does not box puts text on a symbol the standard does not letter.
 */

import {TacticalGraphicName as N} from '@zaes/tactical-graphics';
import {getGraphicFields} from './graphicFieldRegistry';

describe('fields the plate boxes are offered', () => {
    it.each([
        // 271100 bridge or gap: T between the rails, W - W1 below the point 2 end.
        [N.Bridge, {identifier1: true, dtg1: true, dtg2: true}],
        // 270800: W below the area. 270801 boxes none.
        [N.MinedArea, {dtg1: true}],
        [N.MinedAreaFenced, {dtg1: false}],
        // 340800: W over the D. 344100 / 344200: W above the line.
        [N.Delay, {dtg1: true, dtg2: false}],
        [N.ForwardPassageOfLines, {dtg1: true, dtg2: false}],
        [N.RearwardPassageOfLines, {dtg1: true, dtg2: false}],
        // 152700 / 152900: T and W - W1 beside the fixed letter.
        [N.FrontalAttack, {identifier1: true, dtg1: true, dtg2: true}],
        [N.TurningMovement, {identifier1: true, dtg1: true, dtg2: true}],
    ] as const)('%s', (name, expected) => {
        expect(getGraphicFields(name)).toMatchObject(expected);
    });
});

describe('a designation the plate has no box for is not offered', () => {
    it.each([
        N.RegimentalSupportArea, // 310500: bare RSA
        N.BombArea, // 240808: bare BOMB
        N.TerminallyGuidedMunitionFootprint, // 242000: bare TGMF
        N.Encirclement, // 151800: only the two N boxes
        N.UnexplodedExplosiveOrdnanceArea, // 271000: only UXO in the gaps
        N.FieldsOfFire, // 140500-140504: the box at point 1 is the grey unit symbol
        N.FinalProtectiveFireLeft,
        N.FinalProtectiveFireRight,
        N.PrincipalDirectionOfFire,
        N.SecondaryDirectionOfFire,
    ])('%s', name => {
        expect(getGraphicFields(name).identifier1).toBe(false);
    });
});
