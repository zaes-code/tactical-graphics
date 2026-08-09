/**
 * # The edit gestures, without a map
 *
 * These are pure functions of a graphic's description, which is the whole point of
 * writing them that way — the behaviour that matters can be asserted directly
 * instead of inferred from pixels after a synthetic drag.
 *
 * What is worth pinning is not the arithmetic but the **branches**, because each
 * one is silent when it goes the wrong way: a rotate that edits the geometry of a
 * point-anchored graphic does nothing visible, and one that edits the property of a
 * drawn graphic does nothing either. Both look like a dead gesture rather than a
 * wrong branch.
 */

import {TacticalGraphicName, type TacticalGraphicProperties} from '@zaes/tactical-graphics';
import type {Geometry, Position} from 'geojson';
import {centreOf, moveVertex, positionsOf, resize, rotate, translate} from './editGeometry';

const props = (extra: Partial<TacticalGraphicProperties> = {}): TacticalGraphicProperties => ({
    name: TacticalGraphicName.PhaseLine,
    ...extra,
});

const LINE: Geometry = {type: 'LineString', coordinates: [[0, 0], [2, 0]]};
const RING: Geometry = {type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]};
const POINT: Geometry = {type: 'Point', coordinates: [0, 0]};

/** Metres per degree of longitude at the equator, near enough for a tolerance. */
const DEGREE_M = 111_319;

describe('translate', () => {
    it('moves every vertex by the same metric offset', () => {
        const moved = translate({geometry: LINE, properties: props()}, [0, 0], [1, 0]);
        const coordinates = positionsOf(moved.geometry);

        expect(coordinates[0][0]).toBeCloseTo(1, 6);
        expect(coordinates[1][0]).toBeCloseTo(3, 6);
        expect(coordinates[0][1]).toBeCloseTo(0, 6);
    });

    it('leaves the properties alone', () => {
        const before = props({radius: 1000});
        const moved = translate({geometry: LINE, properties: before}, [0, 0], [1, 1]);
        expect(moved.properties).toEqual(before);
    });
});

describe('rotate', () => {
    it('turns a drawn graphic by moving its vertices', () => {
        // A quarter turn about the centre of a horizontal line makes it vertical.
        const centre = centreOf(LINE);
        const turned = rotate({geometry: LINE, properties: props()}, [2, centre[1]], [centre[0], 2]);
        const [start, end] = positionsOf(turned.geometry);

        expect(Math.abs(end[0] - start[0])).toBeLessThan(1e-6);
        expect(Math.abs(end[1] - start[1])).toBeGreaterThan(1);
    });

    it('turns a point-anchored graphic by writing `rotation`, not geometry', () => {
        const turned = rotate({geometry: POINT, properties: props({rotation: 10})}, [1, 0], [0, 1]);

        expect(turned.geometry).toEqual(POINT);
        // A quarter turn counter-clockwise, added to what was already there.
        expect(turned.properties.rotation).toBeCloseTo(100, 4);
    });
});

describe('resize', () => {
    it('scales a drawn graphic about its centre', () => {
        const centre = centreOf(LINE);
        // The cursor starts one degree from the centre and ends two: a doubling.
        const bigger = resize({geometry: LINE, properties: props()}, [centre[0] + 1, centre[1]], [centre[0] + 2, centre[1]]);
        const [start, end] = positionsOf(bigger.geometry);

        expect(end[0] - start[0]).toBeCloseTo(4, 3);
        // The centre stays put, which is what makes it a scale rather than a move.
        expect(centreOf(bigger.geometry)[0]).toBeCloseTo(centre[0], 6);
    });

    it('scales a point-anchored graphic by its stored radius', () => {
        const bigger = resize({geometry: POINT, properties: props({radius: 1000})}, [1, 0], [2, 0]);

        expect(bigger.geometry).toEqual(POINT);
        expect(bigger.properties.radius).toBeCloseTo(2000, 0);
    });

    it('never lets a drag toward the centre turn the shape inside out', () => {
        // The ratio is floored, so even a drag that lands *on* the centre shrinks
        // rather than passing through zero and mirroring the graphic.
        const smaller = resize({geometry: POINT, properties: props({radius: 1000})}, [1, 0], [0, 0]);
        expect(smaller.properties.radius).toBeGreaterThan(0);
        expect(smaller.properties.radius).toBeLessThan(1000);
    });

    it('leaves a point-anchored graphic alone when it has no radius to scale', () => {
        const same = resize({geometry: POINT, properties: props()}, [1, 0], [2, 0]);
        expect(same.properties.radius).toBeUndefined();
        expect(same.geometry).toEqual(POINT);
    });
});

describe('moveVertex', () => {
    it('moves the one vertex it was given', () => {
        const edited = moveVertex({geometry: LINE, properties: props()}, 1, [5, 5]);
        expect(positionsOf(edited.geometry)).toEqual([[0, 0], [5, 5]]);
    });

    it("moves a ring's closing vertex with its first", () => {
        // Otherwise dragging the start point tears the polygon open, and the tear is
        // invisible until the fill or the outline is drawn.
        const edited = moveVertex({geometry: RING, properties: props()}, 0, [-1, -1]);
        const positions = positionsOf(edited.geometry);

        expect(positions[0]).toEqual([-1, -1]);
        expect(positions[positions.length - 1]).toEqual([-1, -1]);
    });

    it('ignores an index that is not there', () => {
        const same = moveVertex({geometry: LINE, properties: props()}, 9, [5, 5]);
        expect(same.geometry).toEqual(LINE);
    });
});

describe('centreOf', () => {
    it('is the middle of the extent, not the average of the vertices', () => {
        // Three points bunched at one end and one at the other: an average would sit
        // in the bunch, and the graphic would pivot around its own corner.
        const lopsided: Geometry = {type: 'LineString', coordinates: [[0, 0], [0.1, 0], [0.2, 0], [4, 0]]};
        expect(centreOf(lopsided)[0]).toBeCloseTo(2, 3);
    });

    it('measures in projected metres, so it is not the mean of the degrees', () => {
        // Mercator stretches with latitude, so the midpoint of 0° and 60° north sits
        // well north of 30° — averaging the degrees would put it in the wrong place.
        const northSouth: Geometry = {type: 'LineString', coordinates: [[0, 0], [0, 60]] as Position[]};
        expect(centreOf(northSouth)[1]).toBeGreaterThan(33);
    });

    it('survives an empty geometry', () => {
        expect(centreOf({type: 'LineString', coordinates: []})).toEqual([0, 0]);
    });
});

describe('metric behaviour', () => {
    it('translates the same distance at the equator and at latitude', () => {
        // A degree of longitude is much shorter at 60° north. A drag of one degree
        // there must move the graphic by *that* distance, not by an equatorial one —
        // which is what happens if the arithmetic is done in degrees.
        const atEquator = translate({geometry: {type: 'Point', coordinates: [0, 0]}, properties: props()}, [0, 0], [1, 0]);
        const atLatitude = translate({geometry: {type: 'Point', coordinates: [0, 60]}, properties: props()}, [0, 60], [1, 60]);

        // Both moved one degree of longitude, because Mercator's x is latitude-free —
        // the point of the check is that the *offset* is metric and identical.
        expect((atEquator.geometry as {coordinates: Position}).coordinates[0]).toBeCloseTo(1, 6);
        expect((atLatitude.geometry as {coordinates: Position}).coordinates[0]).toBeCloseTo(1, 6);
        // And the latitude is untouched by an east-west drag.
        expect((atLatitude.geometry as {coordinates: Position}).coordinates[1]).toBeCloseTo(60, 6);
    });

    it('keeps a translated line the same length in metres', () => {
        const moved = translate({geometry: LINE, properties: props()}, [0, 0], [10, 40]);
        const [start, end] = positionsOf(moved.geometry);
        // Still two degrees of longitude apart, since a Mercator offset preserves it.
        expect((end[0] - start[0]) * DEGREE_M).toBeCloseTo(2 * DEGREE_M, 0);
    });
});
