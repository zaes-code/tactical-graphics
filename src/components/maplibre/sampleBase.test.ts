/**
 * One sample-sheet cell as a base a host can draw at a size of its own.
 * @see sampleBase
 */

import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {buildTacticalGraphic} from './maplibreAdapter';
import {sampleBase} from './sampleGallery';

const MISSION_TASKS = [
    TacticalGraphicName.Block,
    TacticalGraphicName.Seize,
    TacticalGraphicName.Screen,
    TacticalGraphicName.Delay,
    TacticalGraphicName.Destroy,
    TacticalGraphicName.Occupy,
    TacticalGraphicName.ReliefInPlace,
];

describe('sampleBase', () => {
    it.each(MISSION_TASKS)('gives %s a base that builds', name => {
        const sample = sampleBase(name)!;
        expect(sample).toBeDefined();
        expect(buildTacticalGraphic(name, sample.geometry, sample.properties)).toBeTruthy();
    });

    it('lays the sample about the origin', () => {
        const {geometry} = sampleBase(TacticalGraphicName.Block)!;
        const xs = (geometry as {coordinates: number[][]}).coordinates.map(([x]) => x);
        expect(Math.min(...xs)).toBeLessThan(0);
        expect(Math.max(...xs)).toBeGreaterThan(0);
    });
});
