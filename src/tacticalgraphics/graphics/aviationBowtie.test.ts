/**
 * # The aviation bow-tie stays on the line it annotates
 *
 * The bow-tie is baked into the geometry at a fixed multiple of `size` along the first
 * segment, so on a base shorter than that multiple the interpolation runs *past* P1 and
 * the mark leaves the line altogether. Measured before the fix: at a quarter of the
 * length it needs, the furthest bow-tie vertex sat **six times the line's own length**
 * beyond its end.
 *
 * `minimumFirstSegmentPx` stops a drawn graphic ever getting that short, but a base also
 * arrives from an imported file, from a host calling `renderTacticalGraphic` directly,
 * and from any renderer that has not applied the floor. So this pins the guarantee at the
 * layer that cannot be bypassed: whatever comes in, the mark is on the segment and clear
 * of the arrowhead.
 */

import {renderTacticalGraphic} from '../index';
import {TacticalGraphicName} from '../core/type';
import type {Feature, LineString, Position} from 'geojson';

const LAT = 38.9;
const METRES_PER_DEGREE_LON = 111_320 * Math.cos((LAT * Math.PI) / 180);

const base = (lengthMetres: number): Feature<LineString> => ({
    type: 'Feature',
    geometry: {type: 'LineString', coordinates: [[-77, LAT], [-77 + lengthMetres / METRES_PER_DEGREE_LON, LAT]]},
    properties: {},
});

/** Distance from the line's start, as a fraction of its length. 1.0 is the far end. */
function bowtieReach(lengthMetres: number, size: number): number | null {
    const feature = base(lengthMetres);
    const render = renderTacticalGraphic({
        ...feature,
        properties: {tacticalGraphic: {name: TacticalGraphicName.AviationDirectionOfAttack, radius: size}},
    });
    const parts = (render.graphic.geometry as {coordinates: Position[][]}).coordinates;
    // [the drawn line, the arrowhead, then the bow-tie's two halves]
    const marks = parts.slice(2).flat();
    if (!marks.length) return null;
    const start = parts[0][0];
    const along = marks.map(p => Math.abs(p[0] - start[0]) * METRES_PER_DEGREE_LON / lengthMetres);
    return Math.max(...along);
}

/**
 * Where the arrowhead's barbs begin, as a fraction of the line.
 *
 * They run back from the tip at 45°, so along the line they reach `size * cos(45°)`.
 * Charging the full `size` — which the first version of this check did — reports a
 * collision that is not there.
 */
const arrowheadStartsAt = (lengthMetres: number, size: number) => 1 - (size * Math.SQRT1_2) / lengthMetres;

describe('the aviation direction of attack bow-tie', () => {
    const SIZE = 800;

    it.each([6000, 3000, 2400, 1500, 800])('stays on the line at %i m', lengthMetres => {
        const reach = bowtieReach(lengthMetres, SIZE);
        expect(reach).not.toBeNull();
        expect(reach!).toBeLessThanOrEqual(1);
    });

    it.each([6000, 3000, 2400, 1500, 800])('stays clear of the arrowhead at %i m', lengthMetres => {
        const reach = bowtieReach(lengthMetres, SIZE);
        expect(reach!).toBeLessThan(arrowheadStartsAt(lengthMetres, SIZE));
    });

    it('sits where the plate puts it once there is room for it', () => {
        // 2.5 x size along, half a size wide: the far edge lands at 3 x size.
        expect(bowtieReach(6000, SIZE)).toBeCloseTo((3 * SIZE) / 6000, 2);
    });

    it('slides back rather than running off the end when the line is short', () => {
        const long = bowtieReach(6000, SIZE)! * 6000;
        const short = bowtieReach(1500, SIZE)! * 1500;
        expect(short).toBeLessThan(long); // moved nearer the start, in metres
    });

    /**
     * Below the length where anything fits between the start and the arrowhead there is
     * no honest placement, so the mark is omitted rather than drawn somewhere wrong. The
     * floor makes this unreachable from the UI; it is reachable from a file.
     */
    it('omits the bow-tie rather than misplacing it when there is no room at all', () => {
        expect(bowtieReach(400, SIZE)).toBeNull();
    });

    it('never leaves the line, across a wide sweep of lengths', () => {
        for (let lengthMetres = 200; lengthMetres <= 8000; lengthMetres += 100) {
            const reach = bowtieReach(lengthMetres, SIZE);
            if (reach === null) continue;
            expect({lengthMetres, reach}).toMatchObject({reach: expect.any(Number)});
            expect(reach).toBeLessThanOrEqual(1);
            expect(reach).toBeLessThan(arrowheadStartsAt(lengthMetres, SIZE));
        }
    });
});
