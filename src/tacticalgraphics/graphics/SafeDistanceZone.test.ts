import geometryService from '../core/GeometryService';
import {defaultStandoffMetres, MINIMUM_SAFE_DISTANCE_DEFAULT_STANDOFF_PX} from './SafeDistanceZone';
import {renderTacticalGraphic} from '../core/render';
import * as turf from '../core/turf';
import {TacticalGraphicName} from '../core/type';

import type {Feature, LineString, MultiLineString, Position} from 'geojson';

/** A square ring, counter-clockwise, roughly 2 km on a side at this latitude. */
const SQUARE: Position[] = [
    [-77.01, 38.99],
    [-76.99, 38.99],
    [-76.99, 39.01],
    [-77.01, 39.01],
    [-77.01, 38.99],
];

const draw = (coordinates: Position[], width?: number) =>
    renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates},
        properties: {tacticalGraphic: {name: TacticalGraphicName.MinimumSafeDistanceMultipleStrike, width}},
    } as Feature<LineString>);

const ringsOf = (render: ReturnType<typeof draw>) => (render.graphic!.geometry as MultiLineString).coordinates;

/** Shortest distance in metres from a point to a ring's edges. */
const distanceToRing = (ring: Position[], p: Position) =>
    turf.pointToLineDistance(turf.point(p), turf.lineString(ring), {units: 'meters'});

describe('minimum safe distance zone, multiple strike', () => {
    describe('offsetRingOutward', () => {
        it('holds every edge a uniform distance out', () => {
            const out = geometryService.offsetRingOutward(SQUARE, 500);
            // Sample the ORIGINAL ring's edge midpoints and measure to the offset ring.
            // Measuring vertex-to-vertex would report the miter length instead, which is
            // legitimately longer at a corner.
            for (let i = 0; i < SQUARE.length - 1; i++) {
                const mid = turf.midpoint(turf.point(SQUARE[i]), turf.point(SQUARE[i + 1])).geometry.coordinates;
                expect(distanceToRing(out, mid)).toBeGreaterThan(450);
                expect(distanceToRing(out, mid)).toBeLessThan(550);
            }
        });

        it('emits one vertex per input vertex, as the plate requires', () => {
            // "an equal number of points for both polygons" — a buffer would round the
            // corners into extra points and break that.
            expect(geometryService.offsetRingOutward(SQUARE, 500)).toHaveLength(SQUARE.length);
        });

        it('grows the ring whichever way it was traced', () => {
            const area = (ring: Position[]) =>
                Math.abs(ring.slice(0, -1).reduce((a, [x1, y1], i, r) => {
                    const [x2, y2] = r[(i + 1) % r.length];
                    return a + (x1 * y2 - x2 * y1);
                }, 0));
            const clockwise = [...SQUARE].reverse();
            expect(area(geometryService.offsetRingOutward(SQUARE, 500))).toBeGreaterThan(area(SQUARE));
            expect(area(geometryService.offsetRingOutward(clockwise, 500))).toBeGreaterThan(area(clockwise));
        });

        it('leaves a ring alone when there is nothing to offset', () => {
            expect(geometryService.offsetRingOutward(SQUARE, 0)).toEqual(SQUARE);
            expect(geometryService.offsetRingOutward(SQUARE, -100)).toEqual(SQUARE);
            expect(geometryService.offsetRingOutward([[0, 0], [1, 1]], 500)).toEqual([[0, 0], [1, 1]]);
        });

        it('caps the miter rather than launching a sharp corner off the map', () => {
            // A very sharp spike: without the cap the apex vertex flies away as cos -> 0.
            const spike: Position[] = [[-77, 39], [-76.9, 39.0005], [-76.8, 39], [-76.9, 38.9], [-77, 39]];
            const out = geometryService.offsetRingOutward(spike, 500);
            for (const p of out) {
                expect(distanceToRing(spike, p)).toBeLessThan(500 * 4 + 1);
            }
        });
    });

    describe('the seed both engines share', () => {
        it('is half a screen inch, turned into metres by the caller', () => {
            // 48 px at 96 CSS dpi. The function multiplies rather than assuming a zoom, so
            // the caller supplies GROUND metres per pixel and gets metres back.
            expect(defaultStandoffMetres(TacticalGraphicName.MinimumSafeDistanceMultipleStrike, 10)).toBe(480);
            expect(MINIMUM_SAFE_DISTANCE_DEFAULT_STANDOFF_PX).toBe(48);
        });

        it('answers for nothing else', () => {
            // Both renderers seed from this one function. If it ever started answering for
            // a graphic whose `width` is a half-width, that graphic's rails would silently
            // become a standoff on both engines at once.
            expect(defaultStandoffMetres(TacticalGraphicName.MinimumSafeDistanceZone, 10)).toBeUndefined();
            expect(defaultStandoffMetres(TacticalGraphicName.AirCorridor, 10)).toBeUndefined();
            expect(defaultStandoffMetres(TacticalGraphicName.MainAxisOfAdvance, 10)).toBeUndefined();
        });
    });

    describe('the drawn symbol', () => {
        it('derives zone 2 from zone 1 when a width is filed', () => {
            const rings = ringsOf(draw(SQUARE, 1000));
            expect(rings).toHaveLength(2);
            // Zone 1 is what was traced, untouched.
            expect(rings[0]).toEqual(SQUARE);
            // Zone 2 stands off by the FULL width the operator typed, not half of it:
            // toGraphicOptions halves `width` for the corridors and this doubles it back.
            const mid = turf.midpoint(turf.point(SQUARE[0]), turf.point(SQUARE[1])).geometry.coordinates;
            expect(distanceToRing(rings[1], mid)).toBeGreaterThan(900);
            expect(distanceToRing(rings[1], mid)).toBeLessThan(1100);
        });

        it('reshapes zone 2 with zone 1', () => {
            const moved: Position[] = [[-77.01, 38.99], [-76.97, 38.985], [-76.99, 39.01], [-77.01, 39.01], [-77.01, 38.99]];
            const before = ringsOf(draw(SQUARE, 1000))[1];
            const after = ringsOf(draw(moved, 1000))[1];
            expect(after).not.toEqual(before);
            expect(after).toHaveLength(moved.length);
        });

        it('still draws a graphic that is only part-traced', () => {
            expect(ringsOf(draw([[-77, 39], [-76.99, 39]], 1000))).toHaveLength(1);
        });

        /**
         * The legacy pair. A graphic saved before zone 2 became derived carries no width
         * and holds both rings end to end; it has to keep rendering exactly as it did.
         */
        it('renders a pre-existing traced pair unchanged when no width is filed', () => {
            const inner: Position[] = [[-77.01, 38.99], [-76.99, 38.99], [-76.99, 39.01]];
            const outer: Position[] = [[-77.02, 38.98], [-76.98, 38.98], [-76.98, 39.02]];
            const rings = ringsOf(draw([...inner, ...outer]));
            expect(rings).toHaveLength(2);
            expect(rings[0]).toEqual([...inner, inner[0]]);
            expect(rings[1]).toEqual([...outer, outer[0]]);
        });
    });
});
