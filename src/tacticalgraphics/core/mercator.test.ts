/**
 * # A drag is measured on a screen and stored as a distance
 *
 * The conversion between the two is one line of trigonometry, which is exactly why it
 * went missing: nothing looks wrong at the equator, every test fixture in this repository
 * draws near it, and the error grows with latitude. So these assertions are latitudes,
 * not arithmetic — the point is that the numbers *differ* the further north the symbol is,
 * and by how much.
 *
 * @see mercator.ts for the defect this was factored out of.
 */

import {groundLength, latitudeFromMercatorY, mercatorScale, projectedLength} from './mercator';

describe('mercatorScale', () => {
    it('is one on the equator, and grows with latitude', () => {
        expect(mercatorScale(0)).toBeCloseTo(1, 6);
        expect(mercatorScale(35)).toBeCloseTo(1.221, 3);
        expect(mercatorScale(50)).toBeCloseTo(1.556, 3);
        expect(mercatorScale(65)).toBeCloseTo(2.366, 3);
    });

    it('is symmetric about the equator', () => {
        expect(mercatorScale(-50)).toBeCloseTo(mercatorScale(50), 9);
    });

    /**
     * A pole is a singularity, not an error case. Left unclamped this returns `Infinity`,
     * and the radius derived from it would be `Infinity` too — a graphic that vanishes
     * rather than one that is merely enormous.
     */
    it('stays finite at the poles', () => {
        expect(Number.isFinite(mercatorScale(90))).toBe(true);
        expect(Number.isFinite(mercatorScale(-90))).toBe(true);
        expect(mercatorScale(90)).toBeGreaterThan(mercatorScale(89));
    });
});

describe('the two directions', () => {
    it('undo each other', () => {
        for (const latitude of [0, 12.5, 35, 50, 65, -44]) {
            expect(groundLength(projectedLength(1000, latitude), latitude)).toBeCloseTo(1000, 6);
        }
    });

    /**
     * The figure from the defect: 120 px of drag at zoom 5 is 587 km of projected metres,
     * which is 377 km of ground at 50 degrees north. The symbol was drawn at the first
     * number and the read-out stated it.
     */
    it('turns the drag that started this into the distance it really was', () => {
        expect(groundLength(587_036, 50) / 1000).toBeCloseTo(377.3, 1);
    });
});

describe('latitudeFromMercatorY', () => {
    it('reads back the latitude a northing stands for', () => {
        // The Web Mercator northings of these parallels, to the metre.
        expect(latitudeFromMercatorY(0)).toBeCloseTo(0, 9);
        expect(latitudeFromMercatorY(4_163_881)).toBeCloseTo(35, 4);
        expect(latitudeFromMercatorY(6_446_275)).toBeCloseTo(50, 4);
        expect(latitudeFromMercatorY(-6_446_275)).toBeCloseTo(-50, 4);
    });

    /**
     * The pairing that matters: both engines hold a projected centre and need the scale
     * at it, so the northing has to arrive at the same answer the latitude would.
     */
    it('feeds the scale factor without a map library in between', () => {
        expect(mercatorScale(latitudeFromMercatorY(6_446_275))).toBeCloseTo(mercatorScale(50), 4);
    });
});
