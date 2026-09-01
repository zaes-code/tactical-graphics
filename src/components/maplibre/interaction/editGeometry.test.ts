/**
 * # The edit gestures, without a map
 *
 * These are pure functions of a graphic's description, which is the whole point of
 * writing them that way — the behavior that matters can be asserted directly
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
import {
    centerOf,
    moveVertex,
    positionsOf,
    insertVertex,
    resize,
    rotate,
    setBandRange,
    setBend,
    setOffset,
    setReach,
    translate,
} from './editGeometry';

const props = (extra: Partial<TacticalGraphicProperties> = {}): TacticalGraphicProperties => ({
    name: TacticalGraphicName.PhaseLine,
    ...extra,
});

const LINE: Geometry = {type: 'LineString', coordinates: [[0, 0], [2, 0]]};
const RING: Geometry = {type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]};
const POINT: Geometry = {type: 'Point', coordinates: [0, 0]};

/** Meters per degree of longitude at the equator, near enough for a tolerance. */
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
        // A quarter turn about the center of a horizontal line makes it vertical.
        const center = centerOf(LINE);
        const turned = rotate({geometry: LINE, properties: props()}, [2, center[1]], [center[0], 2]);
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
    it('scales a drawn graphic about its center', () => {
        const center = centerOf(LINE);
        // The cursor starts one degree from the center and ends two: a doubling.
        const bigger = resize({geometry: LINE, properties: props()}, [center[0] + 1, center[1]], [center[0] + 2, center[1]]);
        const [start, end] = positionsOf(bigger.geometry);

        expect(end[0] - start[0]).toBeCloseTo(4, 3);
        // The center stays put, which is what makes it a scale rather than a move.
        expect(centerOf(bigger.geometry)[0]).toBeCloseTo(center[0], 6);
    });

    it('scales a point-anchored graphic by its stored radius', () => {
        const bigger = resize({geometry: POINT, properties: props({radius: 1000})}, [1, 0], [2, 0]);

        expect(bigger.geometry).toEqual(POINT);
        expect(bigger.properties.radius).toBeCloseTo(2000, 0);
    });

    it('never lets a drag toward the center turn the shape inside out', () => {
        // The ratio is floored, so even a drag that lands *on* the center shrinks
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

describe('centerOf', () => {
    it('turns a drawn line about its first vertex, as OpenLayers does', () => {
        // Not the middle of the extent, which is what this used to be. Every
        // line-family symbol grows from p0 — an axis of advance stretches along its
        // bearing from there — and `LineGraphicController.getCenter` returns
        // `coordinates[0]` for exactly that reason. Pivoting about the middle here
        // meant one drag turned the graphic two different ways in the two engines.
        const lopsided: Geometry = {type: 'LineString', coordinates: [[0, 0], [0.1, 0], [0.2, 0], [4, 0]]};
        expect(centerOf(lopsided)).toEqual([0, 0]);
    });

    it('turns a point-anchored graphic about its own point', () => {
        expect(centerOf({type: 'Point', coordinates: [3, -2]} as Geometry)).toEqual([3, -2]);
    });

    it('measures a polygon in projected meters, not the mean of the degrees', () => {
        // Mercator stretches with latitude, so the middle of a ring spanning 0° to 60°
        // north sits well north of 30° on screen. `Polygon.getInteriorPoint` runs on
        // projected coordinates, so matching it means projecting here too.
        const tall: Geometry = {
            type: 'Polygon',
            coordinates: [[[-1, 0], [1, 0], [1, 60], [-1, 60], [-1, 0]]],
        } as Geometry;
        expect(centerOf(tall)[1]).toBeGreaterThan(33);
    });

    it('survives an empty geometry', () => {
        expect(centerOf({type: 'LineString', coordinates: []})).toEqual([0, 0]);
    });
});

describe('metric behavior', () => {
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

    it('keeps a translated line the same length in meters', () => {
        const moved = translate({geometry: LINE, properties: props()}, [0, 0], [10, 40]);
        const [start, end] = positionsOf(moved.geometry);
        // Still two degrees of longitude apart, since a Mercator offset preserves it.
        expect((end[0] - start[0]) * DEGREE_M).toBeCloseTo(2 * DEGREE_M, 0);
    });
});

describe('setOffset — the width handle', () => {
    // A degree of longitude at the equator, near enough for a drag distance.
    const DEGREE = 111_319;

    it('sets a full width from the perpendicular distance, doubled', () => {
        // The base runs east along the equator; the cursor sits one degree north of
        // it. At the default sensitivity that is half the drag, doubled to a full
        // width — so one degree back out again.
        const widened = setOffset({geometry: LINE, properties: props()}, [1, 1], {resolution: 1});
        expect(widened.properties.width).toBeCloseTo(DEGREE, -3);
    });

    it('honors a graphic that draws its handle closer in', () => {
        // A handle drawn one width out rather than two tracks the cursor 1:1, so the
        // same drag sets twice the width.
        const tight = setOffset({geometry: LINE, properties: props()}, [1, 1], {offsetScale: 1, resolution: 1});
        expect(tight.properties.width).toBeCloseTo(2 * DEGREE, -3);
    });

    it('measures against the nearest segment of a bent base', () => {
        // The second leg runs north, so a cursor beside *it* is a small perpendicular
        // distance — measuring from the first leg would read the whole leg length.
        const bent: Geometry = {type: 'LineString', coordinates: [[0, 0], [2, 0], [2, 4]]};
        const widened = setOffset({geometry: bent, properties: props()}, [2.2, 3], {resolution: 1});

        expect(widened.properties.width).toBeLessThan(DEGREE);
        expect(widened.properties.width).toBeGreaterThan(0);
    });

    it('flips the graphic only on a decisive drag to the other side', () => {
        // The sign of the perpendicular sets the side, but a pixel of jitter across
        // the line must not flip it — otherwise the graphic flickers while the user is
        // only trying to widen it.
        const jitter = setOffset({geometry: LINE, properties: props()}, [1, -0.00001], {resolution: DEGREE});
        expect(jitter.properties.mirrored).toBeUndefined();

        const decisive = setOffset({geometry: LINE, properties: props()}, [1, -1], {resolution: 1});
        expect(decisive.properties.mirrored).toBe(true);
    });

    it('leaves a base with one point alone', () => {
        const same = setOffset({geometry: POINT, properties: props()}, [1, 1], {resolution: 1});
        expect(same.properties.width).toBeUndefined();
    });
});

describe('resize carries the sizes the vertices do not', () => {
    /**
     * A corridor's width and a line graphic's decoration are filed beside the geometry,
     * not in it. Scaling only the vertices made the graphic longer with its rails and its
     * chevrons unchanged — an air corridor resized 1.5x came out 420 x 40 px against
     * OpenLayers' 431 x 51, so the same gesture drew a different symbol on each engine.
     * OpenLayers has scaled them together since `LineGraphicController.handleResize`,
     * which states the rule in the user's own words: resize the whole graphic as is.
     */
    const corridor = () => ({
        geometry: LINE,
        properties: props({name: TacticalGraphicName.AirCorridor, width: 40_000, decorationSize: 15_000}),
    });

    it('scales the width and the decoration with the line', () => {
        const before = corridor();
        // From one end of the base to twice its distance from the centre: a 2x resize.
        const bigger = resize(before, [2, 0], [3, 0]);

        const grew = positionsOf(bigger.geometry)[1][0] / positionsOf(before.geometry)[1][0];
        expect(grew).toBeGreaterThan(1);
        expect(bigger.properties.width! / before.properties.width!).toBeCloseTo(grew, 2);
        expect(bigger.properties.decorationSize! / before.properties.decorationSize!).toBeCloseTo(grew, 2);
    });

    it('leaves a graphic that carries neither alone', () => {
        const plain = {geometry: LINE, properties: props()};
        const bigger = resize(plain, [2, 0], [3, 0]);

        expect(bigger.properties.width).toBeUndefined();
        expect(bigger.properties.decorationSize).toBeUndefined();
    });

    /**
     * `radius` is the *same* number as the half-width on this family — it is what
     * `setOffset` replays on restore — so scaling it here as well would compound.
     */
    it('does not scale the radius of a drawn graphic', () => {
        const before = {geometry: LINE, properties: props({radius: 20_000, width: 40_000})};
        expect(resize(before, [2, 0], [3, 0]).properties.radius).toBe(20_000);
    });

    /**
     * The other half of the same rule, and the half that reads backwards until you know
     * what the number is.
     *
     * A hostile Encirclement's `decorationSize` is the width of the *gaps* its outline is
     * cut into for the `ENY` amplifiers — a hole sized to hold text, not a decoration
     * sized to match the shape. Scaling it with a 1.5x resize opened the gaps to 293 km
     * against OpenLayers' 196 while the text in them stayed the size it was.
     *
     * OpenLayers splits this by controller family: `LineGraphicController.handleResize`
     * scales the size along with the line, `PolygonGraphicController.handleResize`
     * transforms the base and nothing else. Here the base's geometry type says the same
     * thing, which is why the assertion is on a ring rather than on a name.
     */
    it('leaves an area’s decoration size alone — it is a label gap, not a decoration', () => {
        const before = {
            geometry: RING,
            properties: props({name: TacticalGraphicName.Encirclement, decorationSize: 195_678}),
        };
        const bigger = resize(before, [2, 1], [3, 1]);

        // The ring itself did grow — otherwise the assertion below proves nothing.
        expect(positionsOf(bigger.geometry)[1][0]).toBeGreaterThan(positionsOf(before.geometry)[1][0]);
        expect(bigger.properties.decorationSize).toBe(195_678);
    });
});

describe('setBend and setReach — the curve handles', () => {
    const curve = () => ({
        geometry: POINT,
        properties: props({radius: 100_000, rotation: 0, bend: 0.5}),
    });

    it('bends toward the side the cursor is on, and flips across the chord', () => {
        // Rotation 0 means the chord runs east, so its clockwise perpendicular points
        // south — a cursor to the south gives a positive bend.
        const south = setBend(curve(), [0, -0.5], b => b);
        const north = setBend(curve(), [0, 0.5], b => b);

        expect(south.properties.bend).toBeGreaterThan(0);
        expect(north.properties.bend).toBeLessThan(0);
        expect(south.geometry).toEqual(POINT);
    });

    it('is scaled by the graphic, so the handle tracks the pointer at any size', () => {
        const small = setBend({geometry: POINT, properties: props({radius: 50_000, rotation: 0})}, [0, -0.5], b => b);
        const large = setBend({geometry: POINT, properties: props({radius: 200_000, rotation: 0})}, [0, -0.5], b => b);

        expect(Math.abs(small.properties.bend!)).toBeGreaterThan(Math.abs(large.properties.bend!));
    });

    it('applies the family clamp', () => {
        const clamped = setBend(curve(), [0, -20], () => 0.9);
        expect(clamped.properties.bend).toBe(0.9);
    });

    it('leaves a graphic with no size alone — the bend would divide by it', () => {
        const same = setBend({geometry: POINT, properties: props({rotation: 0})}, [0, -1], b => b);
        expect(same.properties.bend).toBeUndefined();
    });

    it('takes both size and bearing from the tip, and leaves the bend', () => {
        const reached = setReach(curve(), [1, 0]);

        expect(reached.properties.radius).toBeGreaterThan(100_000);
        expect(reached.properties.rotation).toBeCloseTo(0, 4);
        // Unitless, so the curve keeps its proportion through a resize.
        expect(reached.properties.bend).toBe(0.5);

        const north = setReach(curve(), [0, 1]);
        expect(north.properties.rotation).toBeCloseTo(90, 4);
    });

    /**
     * **The same drag has to mean the same size wherever on Earth it is made.**
     *
     * Both verbs measure the cursor in mercator metres, which are stretched by
     * `1 / cos(latitude)`, and both write a figure the generators read as a real
     * distance. Left unconverted, a graphic dragged out at 50 degrees north came out
     * 1.56x the one dragged identically on the equator — and disagreed with OpenLayers,
     * which takes both off geodesic anchor points. @see mercator.ts
     *
     * A degree of *longitude* is the control here: it shortens with latitude on the
     * ground by exactly the factor mercator inflates by, so a one-degree reach east is
     * the same projected length everywhere and a different ground length at each
     * parallel. The assertion is that the stored radius follows the ground.
     */
    it('stores a ground distance, so latitude does not change what a drag means', () => {
        const reachAt = (latitude: number) =>
            setReach({geometry: {type: 'Point', coordinates: [0, latitude]}, properties: props({radius: 100_000, rotation: 0})}, [1, latitude])
                .properties.radius!;

        // A degree of longitude: ~111 km at the equator, ~72 km at 50 degrees north.
        expect(reachAt(0) / 1000).toBeCloseTo(111.3, 0);
        expect(reachAt(50) / 1000).toBeCloseTo(71.6, 0);
        // Unconverted, both read 111 km — the number the projection reports, not the one
        // the ground does.
        expect(reachAt(50)).toBeLessThan(reachAt(0));
    });

    it('reads the same bend from the same gesture at any latitude', () => {
        const bendAt = (latitude: number) =>
            setBend(
                {geometry: {type: 'Point', coordinates: [0, latitude]}, properties: props({radius: 55_660, rotation: 0})},
                [0.5, latitude - 0.25],
                b => b,
            ).properties.bend!;

        // Half a degree along and a quarter down, at both parallels: the same shape of
        // drag relative to the graphic, so the same bend.
        expect(bendAt(50)).toBeCloseTo(bendAt(0), 1);
    });
});

describe('setBandRange — the range-fan handles', () => {
    const fan = (ranges: number[]) => ({
        geometry: POINT,
        properties: props({
            name: TacticalGraphicName.WeaponSensorRangeFanCircular,
            radius: 100_000,
            rangeFan: {bands: ranges.map(range => ({range}))},
        }),
    });

    it('sets the band it was given, in metres', () => {
        // One degree of longitude is about 111 km — 111,000 metres, which is the unit a
        // band stores as of 3.2.0. Both range fan plates say so outright.
        // @see RangeFanBand.range
        const edited = setBandRange(fan([10_000, 200_000, 400_000]), 1, [1, 0]);
        expect(edited.properties.rangeFan!.bands[1].range / 1000).toBeCloseTo(111, 0);
        // And leaves its neighbors where they were.
        expect(edited.properties.rangeFan!.bands[0].range).toBe(10_000);
        expect(edited.properties.rangeFan!.bands[2].range).toBe(400_000);
    });

    it('never lets a band pass the one outside it', () => {
        // Dragging band 0 far out would otherwise reorder the rings, and the handle the
        // user is holding would end up attached to a different band.
        const edited = setBandRange(fan([10_000, 50_000, 400_000]), 0, [4, 0]);
        expect(edited.properties.rangeFan!.bands[0].range).toBeLessThan(50_000);
    });

    it('never lets a band pass the one inside it', () => {
        const edited = setBandRange(fan([100, 200, 400]), 1, [0.1, 0]);
        expect(edited.properties.rangeFan!.bands[1].range).toBeGreaterThan(100);
    });

    it('drives the radius when the user has typed no bands', () => {
        // The fan is rendering the fallback single band derived from `radius`, so the
        // drag must not invent a band the user never entered.
        const edited = setBandRange({geometry: POINT, properties: props({radius: 100_000})}, 0, [1, 0]);
        expect(edited.properties.rangeFan).toBeUndefined();
        expect(edited.properties.radius).toBeCloseTo(111_000, -3);
    });

    it('ignores a band index that is not there', () => {
        const before = fan([10, 200]);
        expect(setBandRange(before, 5, [1, 0])).toEqual(before);
    });
});


describe('insertVertex', () => {
    const LINE_BASE = {type: 'LineString' as const, coordinates: [[0, 0], [10, 0], [20, 0]]};
    const RING = {type: 'Polygon' as const, coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]]};

    it('adds the vertex inside the segment that ends at the index', () => {
        const after = insertVertex({geometry: LINE_BASE, properties: props()}, 1, [5, 0]);
        expect((after.geometry as typeof LINE_BASE).coordinates).toEqual([[0, 0], [5, 0], [10, 0], [20, 0]]);
    });

    it('leaves every other vertex where it was', () => {
        const after = insertVertex({geometry: LINE_BASE, properties: props()}, 2, [15, 3]);
        expect((after.geometry as typeof LINE_BASE).coordinates).toEqual([[0, 0], [10, 0], [15, 3], [20, 0]]);
    });

    it('keeps a ring closed', () => {
        const after = insertVertex({geometry: RING, properties: props()}, 2, [10, 5]);
        const ring = (after.geometry as typeof RING).coordinates[0];
        expect(ring).toHaveLength(5);
        expect(ring[0]).toEqual(ring[ring.length - 1]);
    });

    it('refuses an index that would open a ring', () => {
        // The closing position is not a segment a user can see, so inserting there is
        // not an edit they can have meant.
        expect(insertVertex({geometry: RING, properties: props()}, 3, [1, 1]).geometry).toEqual(RING);
        expect(insertVertex({geometry: RING, properties: props()}, 0, [1, 1]).geometry).toEqual(RING);
    });

    it('refuses an index off either end', () => {
        expect(insertVertex({geometry: LINE_BASE, properties: props()}, 0, [1, 1]).geometry).toEqual(LINE_BASE);
        expect(insertVertex({geometry: LINE_BASE, properties: props()}, 9, [1, 1]).geometry).toEqual(LINE_BASE);
    });

    it('produces a vertex the reshape gesture can then move', () => {
        const inserted = insertVertex({geometry: LINE_BASE, properties: props()}, 1, [5, 0]);
        const moved = moveVertex(inserted, 1, [5, 8]);
        expect((moved.geometry as typeof LINE_BASE).coordinates).toEqual([[0, 0], [5, 8], [10, 0], [20, 0]]);
    });
});
