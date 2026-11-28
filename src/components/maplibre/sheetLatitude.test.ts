/**
 * # The sample sheet has to stay inside the world it is drawn on
 *
 * The grid started at 44 degrees north and stepped south a row at a time, so with 285
 * samples in 14 columns the last row sat at **-96** — past the pole. Long before that it
 * passed Mercator's limit, where a symbol has no honest projection: the sweep's own range
 * fan at 89 south measured 39,204 x 0 km against 360 x 360 at the equator, and the two
 * engines drew that nonsense differently until they were taught to clamp the same way.
 *
 * A sheet whose job is comparing symbols must draw every one of them as the symbol it is.
 */

import {MERCATOR_MAX_LATITUDE, TacticalGraphicName} from '@zaes/tactical-graphics';
import {sampleFeatureCollection} from './sampleGallery';

/** Every latitude the sheet places a sample at. */
const latitudes = (only?: readonly TacticalGraphicName[]): number[] => {
    const walk = (node: unknown, into: number[]): number[] => {
        if (!Array.isArray(node) || !node.length) return into;
        if (typeof node[0] === 'number') { into.push((node as number[])[1]); return into; }
        node.forEach(child => walk(child, into));
        return into;
    };
    return sampleFeatureCollection(undefined, only)
        .features.flatMap(feature => walk((feature.geometry as {coordinates?: unknown}).coordinates, []));
};

describe('where the sweep puts its samples', () => {
    it('keeps every one inside the projectable world', () => {
        const lats = latitudes();
        expect(lats.length).toBeGreaterThan(200);
        expect(Math.min(...lats)).toBeGreaterThan(-MERCATOR_MAX_LATITUDE);
        expect(Math.max(...lats)).toBeLessThan(MERCATOR_MAX_LATITUDE);
    });

    /** Centred, so it grows symmetrically rather than marching off one end. */
    it('straddles the equator', () => {
        const lats = latitudes();
        expect(Math.max(...lats)).toBeGreaterThan(0);
        expect(Math.min(...lats)).toBeLessThan(0);
    });

    /** A narrowed sweep packs into fewer rows, and stays inside all the same. */
    it('holds for a filtered sweep', () => {
        const few = latitudes([TacticalGraphicName.PhaseLine, TacticalGraphicName.AirCorridor]);
        expect(few.length).toBeGreaterThan(0);
        expect(Math.min(...few)).toBeGreaterThan(-MERCATOR_MAX_LATITUDE);
        expect(Math.max(...few)).toBeLessThan(MERCATOR_MAX_LATITUDE);
    });
});
