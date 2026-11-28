/**
 * # A drag is a screen gesture, so a translate is a projected offset
 *
 * `handleTranslate(deltaX, deltaY)` is implemented five times, and four of them add the
 * two numbers to a coordinate. The fifth — the line and area path — was handed a **ground
 * distance and a compass bearing** by `handleDragForLineAndPolygon`, and spent them on
 * `turf.transformTranslate`, which walks every vertex along its own great circle.
 *
 * A great circle bows poleward, so the shape came out from under the pointer by a margin
 * that changed with latitude. Measured on the sample sheet, one horizontal 90 px drag,
 * which is 4.851 degrees of longitude at the pinned zoom wherever you are:
 *
 * | latitude | asked | OpenLayers moved | latitude drift |
 * |---|---|---|---|
 * | -69.6 | 4.851 | 4.311 | -0.060 |
 * | +7    | 4.851 | 4.851 | +0.025 |
 * | +63.4 | 4.851 | 5.306 | +0.087 |
 *
 * MapLibre reported 4.851 at every one of them, which is what put the difference in
 * `compare:engines` as 24 rows of `translate moved N vs 4.851`.
 */

import {Feature} from 'ol';
import {LineString, Point, Polygon} from 'ol/geom';
import {fromLonLat, toLonLat} from 'ol/proj';
import openlayersAdapter from './openlayersAdapter';

/** 90 px at 6000 m/px — the sweep's own drag. */
const DELTA_X = 540_000;

const lineAt = (latitude: number) =>
    new Feature(new LineString([[-2, latitude], [2, latitude]].map(c => fromLonLat(c as [number, number]))));

describe('translateFeature', () => {
    it.each([-69.6, -20, 0, 40, 63.4])('moves every vertex by the offset it was given, at %s degrees', latitude => {
        const before = lineAt(latitude);
        const after = openlayersAdapter.translateFeature(before, DELTA_X, 0) as Feature<LineString>;

        const from = (before.getGeometry() as LineString).getCoordinates();
        const to = after.getGeometry()!.getCoordinates();
        for (let i = 0; i < from.length; i++) {
            expect(to[i][0] - from[i][0]).toBeCloseTo(DELTA_X, 6);
            // **Zero, not nearly zero.** A great-circle walk slid the shape poleward on a
            // horizontal drag; a projected offset cannot.
            expect(to[i][1] - from[i][1]).toBe(0);
        }
    });

    /**
     * The same offset is the same number of degrees of longitude at every latitude, which
     * is the property that makes a graphic follow the cursor on a Mercator map.
     */
    it.each([-69.6, 0, 63.4])('is the same change in longitude at %s degrees', latitude => {
        const after = openlayersAdapter.translateFeature(lineAt(latitude), DELTA_X, 0) as Feature<LineString>;
        const moved = after.getGeometry()!.getCoordinates().map(c => toLonLat(c));
        expect(moved[0][0] - -2).toBeCloseTo(4.851, 2);
    });

    it('leaves the original alone', () => {
        const before = lineAt(50);
        const first = (before.getGeometry() as LineString).getCoordinates()[0].slice();
        openlayersAdapter.translateFeature(before, DELTA_X, 12_345);
        expect((before.getGeometry() as LineString).getCoordinates()[0]).toEqual(first);
    });

    it.each([
        ['a point', new Feature(new Point(fromLonLat([3, 55])))],
        ['a ring', new Feature(new Polygon([[[0, 50], [2, 50], [2, 52], [0, 52], [0, 50]].map(c => fromLonLat(c as [number, number]))]))],
    ])('moves %s the same way', (_label, feature) => {
        const before = feature.getGeometry()!.getExtent().slice();
        const after = (openlayersAdapter.translateFeature(feature, DELTA_X, -7_000) as Feature).getGeometry()!.getExtent();

        expect(after[0] - before[0]).toBeCloseTo(DELTA_X, 6);
        expect(after[1] - before[1]).toBeCloseTo(-7_000, 6);
    });
});
