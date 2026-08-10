/**
 * # Which graphics flip, and which handle flips them
 *
 * The retrograde tasks hang their cane or arrow to one side of the drawn line, and a
 * drag of their second handle across that line turns them over. That fact lived in the
 * OpenLayers controllers, so `handleRole` called both handles `shape` and MapLibre
 * moved a vertex where OpenLayers flipped the symbol — measured across all seven, one
 * engine flipped via handle 1 and the other flipped via nothing at all.
 *
 * These pin the two halves that were out of step: which graphics own a mirror handle,
 * and which side of the line means mirrored.
 */

import {handleRole, supportsMirror} from './core/handles';
import {listTacticalGraphicNames, renderTacticalGraphic, toFeatureCollection} from './index';
import {TacticalGraphicName} from './core/type';

/** The drawn geometry only — the flag itself is stamped onto every output feature. */
const geometryOf = (name: TacticalGraphicName, mirrored: boolean) =>
    JSON.stringify(
        toFeatureCollection(
            renderTacticalGraphic({
                type: 'Feature',
                geometry: {type: 'LineString', coordinates: [[2, 1], [3, 1.6]]},
                properties: {tacticalGraphic: {name, rotation: 0, radius: 60000, width: 30000, mirrored}},
            }),
        ).features.map(f => f.geometry),
    );

describe('mirroring', () => {
    it('gives every mirrorable graphic its mirror handle at index 1', () => {
        for (const name of listTacticalGraphicNames()) {
            if (!supportsMirror(name as TacticalGraphicName)) continue;
            expect(handleRole(name as TacticalGraphicName, 1)).toBe('mirror');
            // Handle 0 stays a shape handle: it moves the line's far end, and making it
            // a mirror too would leave the graphic no way to be reshaped.
            expect(handleRole(name as TacticalGraphicName, 0)).toBe('shape');
        }
    });

    it('names the seven retrograde tasks and nothing else', () => {
        const flagged = listTacticalGraphicNames().filter(n => supportsMirror(n as TacticalGraphicName));
        expect(flagged.sort()).toEqual([
            'Delay',
            'Disengage',
            'ForwardPassageOfLines',
            'RearwardPassageOfLines',
            'Retirement',
            'Withdraw',
            'WithdrawUnderPressure',
        ]);
    });

    it('actually changes the drawn geometry for each of them', () => {
        // A mirror handle on a graphic whose generator ignores `mirrored` would be a
        // gesture that visibly does nothing.
        for (const name of listTacticalGraphicNames()) {
            if (!supportsMirror(name as TacticalGraphicName)) continue;
            expect(geometryOf(name as TacticalGraphicName, true)).not.toEqual(geometryOf(name as TacticalGraphicName, false));
        }
    });

    it('leaves a graphic without the handle alone', () => {
        expect(supportsMirror(TacticalGraphicName.PhaseLine)).toBe(false);
        expect(handleRole(TacticalGraphicName.PhaseLine, 1)).toBe('shape');
    });
});
