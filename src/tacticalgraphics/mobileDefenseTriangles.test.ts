/**
 * # Mobile defense's teeth stay equilateral at every size
 *
 * The four triangles on the ellipse are built from a chord of the arc and an apex
 * pushed out perpendicular to it. The base is a chord, so it widens with the ellipse;
 * the height used to be `min(radius * 0.9, minorR * 1.1)`, which stops growing as soon
 * as the arrowhead size caps it. So the teeth flattened as the graphic was resized —
 * gradually, and only past the point where the cap bit, which is why it reads as "they
 * don't keep their ratio" rather than as a shape that is simply wrong.
 *
 * These measure the three sides rather than looking at the picture: a tooth a few
 * percent off equilateral is invisible next to an ellipse and obvious in a number.
 */

import * as turf from '@turf/turf';
import {renderTacticalGraphic} from './core/render';
import {TacticalGraphicName} from './core/type';

/** Points in a closed triangle ring: three corners plus the repeated first. */
const TRIANGLE_RING = 4;

/** The teeth, as [side, side, side] in metres. */
function triangleSides(halfSpanDegrees: number, radius: number): number[][] {
    const rendered = renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: [[-halfSpanDegrees, 0], [halfSpanDegrees, 0]]},
        properties: {tacticalGraphic: {name: TacticalGraphicName.MobileDefense, rotation: 0, radius}},
    } as never)!;

    const members = (rendered.graphic.geometry as {coordinates: number[][][]}).coordinates;
    return members
        .filter(ring => ring.length === TRIANGLE_RING)
        .map(([a, b, c]) => [
            turf.distance(a, b, {units: 'meters'}),
            turf.distance(b, c, {units: 'meters'}),
            turf.distance(c, a, {units: 'meters'}),
        ]);
}

describe('mobile defense teeth', () => {
    it('draws four of them', () => {
        expect(triangleSides(4, 300_000)).toHaveLength(4);
    });

    it.each([0.5, 1, 2, 4, 8, 16])('is equilateral on a %s-degree half span', halfSpan => {
        for (const sides of triangleSides(halfSpan, 300_000)) {
            const longest = Math.max(...sides);
            const shortest = Math.min(...sides);
            // Within 2%. Not exact, and cannot be: the sides are geodesics on a sphere,
            // so a triangle spanning degrees of latitude is very slightly irregular.
            expect((longest - shortest) / longest).toBeLessThan(0.02);
        }
    });

    it('is equilateral whatever arrowhead size it is given', () => {
        // The height used to be capped by this number, so a small one flattened the
        // teeth while a large one did not — the cap is gone and neither should now.
        for (const radius of [20, 50_000, 300_000, 2_000_000]) {
            for (const sides of triangleSides(4, radius)) {
                const longest = Math.max(...sides);
                expect((longest - Math.min(...sides)) / longest).toBeLessThan(0.02);
            }
        }
    });

    it('grows the teeth with the graphic, rather than pinning them', () => {
        const small = triangleSides(2, 300_000)[0][0];
        const large = triangleSides(8, 300_000)[0][0];
        // Four times the span, four times the tooth — within the sphere's own error.
        expect(large / small).toBeGreaterThan(3.5);
        expect(large / small).toBeLessThan(4.5);
    });
});
