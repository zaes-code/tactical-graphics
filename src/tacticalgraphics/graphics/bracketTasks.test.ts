/**
 * # The bracket mission tasks state a height and a length, separately
 *
 * APP-06 340200 breach, 340300 bypass, 340500 clear and 340400 canalize by inheritance all
 * carry the same Size/Shape sentence: *"Points 1 and 2 determine the symbol's height and
 * point 3 determines its length."* Two dimensions, two places.
 *
 * **341800 penetrate joined them on 2026-09-06**, and it is the same rule word for word —
 * points 1 and 2 the vertical line's endpoints, point 3 the rear, height and length stated
 * separately. Only the drawing past that differs: one arrow rather than three. It was the
 * last of the block family carrying a derived width handle for a dimension its own plate
 * gives an anchor point. (User's call: "penetration should be the same behaviour as clear
 * with its 3 points".)
 *
 * All four were ratio-locked at 0.3 until 2026-09-06 — the height *was* the length times a
 * constant — so the plates' two independent numbers were one, and the third anchor point had
 * nothing to do. These assert the pair are genuinely independent, which is the thing a ratio
 * lock cannot be. @see frontEdgeFrame, RATIO_LOCK
 */
import {TacticalGraphicName, drawsTipFirst, normalizeDrawnBase, ratioLockOf, renderTacticalGraphic} from '../index';
import {frontEdgeFromAnchors} from './frontEdgeFrame';
import type {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';

const FOUR = [
    TacticalGraphicName.Breach,
    TacticalGraphicName.Bypass,
    TacticalGraphicName.Canalize,
    TacticalGraphicName.Clear,
    TacticalGraphicName.Penetration,
];

/** A front edge running due north, with the rear out to the west. */
const anchors = (height: number, length: number, rotationDeg = 0): Position[] => {
    const centre: Position = [0, 0];
    const one = turf.destination(turf.point(centre), height / 2, 180 + rotationDeg, {units: 'meters'})
        .geometry.coordinates as Position;
    const two = turf.destination(turf.point(centre), height / 2, 0 + rotationDeg, {units: 'meters'})
        .geometry.coordinates as Position;
    const rear = turf.destination(turf.point(centre), length, 270 + rotationDeg, {units: 'meters'})
        .geometry.coordinates as Position;
    return [one, two, rear];
};

const render = (name: TacticalGraphicName, coords: Position[]) =>
    renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: coords},
        properties: {tacticalGraphic: {name}},
    } as unknown as Feature<LineString>);

const metres = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

describe('the bracket mission tasks read three placed points', () => {
    it.each(FOUR)('grips exactly the three points its plate numbers — %s', name => {
        // Every grip is a point the operator put down, in the plate's own order. The block
        // contract put a *derived* offset handle first and the segment's two ends after it.
        const coords = anchors(60_000, 90_000);
        const grips = (render(name, coords)!.handles as Feature<MultiPoint>).geometry.coordinates;
        expect(grips).toHaveLength(3);
        grips.forEach((g, i) => expect(metres(g, coords[i])).toBeLessThan(1));
    });

    it.each(FOUR)('is no longer ratio-locked, because its plate states two dimensions — %s', name => {
        /*
         * **The registry assertion, and the one that actually catches the lock.**
         *
         * `RATIO_LOCK` is read by the renderers — `Block.setBaseFeature` derives `size` from
         * the base length, and MapLibre's `ratioLockedSize` does the same — so a lock is
         * invisible to the generator and to `renderTacticalGraphic`. The frame test below
         * passes with or without it, which is worth knowing: it proves the reader is right,
         * not that the lock is gone. This proves the lock is gone.
         *
         * It has to be gone because a lock says the aspect ratio is not the user's to set,
         * and all four plates say the opposite in one sentence: *"Points 1 and 2 determine
         * the symbol's height and point 3 determines its length."*
         */
        expect(ratioLockOf(name)).toBeUndefined();
    });

    it.each(FOUR)('is no longer drawn tip-first, because its base is in the plate order — %s', name => {
        /*
         * **The other registry fact the frame tests cannot see.** `TacticalGraphicsBase.generate`
         * reverses a tip-first base on the way in, and it did so for these four because the
         * two-point base numbered the front first while the generators built the front at the
         * *last* vertex. With points 1, 2 and 3 stored in the plate's own order there is
         * nothing to reconcile, and reversing a three-point base hands the reader point 3 and
         * point 2 as its front edge.
         *
         * Asserted here rather than through a rendered symbol because the reversal is applied
         * before the generator runs: a frame test calls the reader directly and never sees it.
         * @see legacyAxis, which keeps the flip for the two-point saves that still need it
         */
        expect(drawsTipFirst(name)).toBe(false);
    });

    it.each(FOUR)('takes its height from points 1 and 2 alone — %s', name => {
        /*
         * Holding the length still and doubling the distance between points 1 and 2 doubles
         * the symbol's own width across the axis, and leaves the length alone.
         */
        const short = frontEdgeFromAnchors(anchors(40_000, 90_000))!;
        const tall = frontEdgeFromAnchors(anchors(80_000, 90_000))!;
        expect(tall.half / short.half).toBeCloseTo(2, 3);
        // ...and the length is untouched by it.
        expect(metres(tall.axis[0], tall.axis[1])).toBeCloseTo(metres(short.axis[0], short.axis[1]), -2);
    });

    it.each(FOUR)('takes its length from point 3 alone — %s', name => {
        const near = frontEdgeFromAnchors(anchors(60_000, 50_000))!;
        const far = frontEdgeFromAnchors(anchors(60_000, 150_000))!;
        expect(metres(far.axis[0], far.axis[1]) / metres(near.axis[0], near.axis[1])).toBeCloseTo(3, 1);
        // ...and the height is untouched by it.
        expect(far.half).toBeCloseTo(near.half, 3);
    });

    it('discards point 3\'s component along the front edge', () => {
        /*
         * All three stating rules say the rear line is "the same height as the opening and
         * parallel to it", so nothing drawn can express an along-edge offset — a third click
         * that slid sideways would move a handle without changing the picture. 270501 makes
         * the same projection explicit for its own rear point.
         */
        const square = frontEdgeFromAnchors(anchors(60_000, 90_000))!;
        const slid = anchors(60_000, 90_000);
        // Slide point 3 a long way along the edge's own direction; the frame must not follow.
        const SLIDE = 70_000;
        slid[2] = turf.destination(turf.point(slid[2]), SLIDE, 0, {units: 'meters'}).geometry.coordinates as Position;
        const after = frontEdgeFromAnchors(slid)!;

        /*
         * **Not exactly zero, and the residual is spherical rather than logical.** The
         * decomposition is planar — `reach * sin(toRear - edgeBearing)` — applied to geodesic
         * bearings, so a 70 km slide leaves about 3.6 m on a 90 km symbol, four thousandths
         * of one percent. What matters is the two orders of magnitude: an unprojected reading
         * would carry the whole 70 km into the frame.
         */
        expect(metres(after.axis[0], square.axis[0])).toBeLessThan(SLIDE / 500);
        expect(after.half).toBeCloseTo(square.half, 6);
    });

    it.each(FOUR)('stores the third click on the symbol, not where it landed — %s', name => {
        /*
         * **What routing the clicks through `sideAnchors` actually buys.** A raw third click
         * still *draws* the right symbol, because the frame reader projects on every render —
         * so the picture is no evidence either way. What it changes is where the stored point
         * sits, and therefore where its grip sits: unprojected it floats off beside the
         * symbol, at wherever the operator happened to release.
         *
         * Clicked well off the perpendicular, the stored point 3 must land on it.
         */
        const clicks = anchors(60_000, 90_000);
        const strayed = turf.destination(turf.point(clicks[2]), 45_000, 0, {units: 'meters'})
            .geometry.coordinates as Position;
        const stored = normalizeDrawnBase(name, [clicks[0], clicks[1], strayed]);

        expect(stored).toHaveLength(3);
        // On the perpendicular through the front edge's midpoint: square to points 1 and 2.
        const midpoint = turf.midpoint(turf.point(clicks[0]), turf.point(clicks[1])).geometry.coordinates as Position;
        const edgeBearing = turf.bearing(turf.point(clicks[0]), turf.point(clicks[1]));
        const toStored = turf.bearing(turf.point(midpoint), turf.point(stored[2]));
        const between = ((toStored - edgeBearing) % 360 + 360) % 360;
        expect(Math.min(Math.abs(between - 90), Math.abs(between - 270))).toBeLessThan(0.5);
        // ...and the stray click was nowhere near it.
        expect(metres(stored[2], strayed)).toBeGreaterThan(10_000);
    });

    it.each(FOUR)('still draws a graphic saved as two points and a size — %s', name => {
        // Everything written before 2026-09-06 is a two-point axis with the height derived
        // beside it. Those files have to keep rendering.
        const legacy = renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: [[0, 0], [0.5, 0]]},
            properties: {tacticalGraphic: {name, radius: 20_000, decorationSize: 20_000}},
        } as unknown as Feature<LineString>);
        const drawn = (legacy!.graphic as Feature<MultiLineString>).geometry.coordinates;
        expect(drawn.length).toBeGreaterThan(2);
    });
});

describe('clear keeps its arrows square to the front edge at any rotation', () => {
    /*
     * 340500 is the one of the four whose Size/Shape adds constraints beyond the frame:
     * *"The tip of the middle arrowhead will be at the midpoint of the vertical line. The
     * arrows will stay perpendicular to the vertical line, regardless of the rotational
     * orientation of the symbol as a whole."* The second clause is the one that is easy to
     * satisfy at one bearing and nowhere else, so it is asserted at several.
     */
    it.each([0, 37, 90, 143, 250])('holds the arrows perpendicular at %s degrees', rotation => {
        const coords = anchors(60_000, 90_000, rotation);
        const frame = frontEdgeFromAnchors(coords)!;

        // The axis the arrows are laid along, against the front edge points 1 and 2 give.
        const axisBearing = turf.bearing(turf.point(frame.axis[0]), turf.point(frame.axis[1]));
        const edgeBearing = turf.bearing(turf.point(coords[0]), turf.point(coords[1]));
        const between = ((axisBearing - edgeBearing) % 360 + 360) % 360;
        expect(Math.min(Math.abs(between - 90), Math.abs(between - 270))).toBeLessThan(0.5);
    });

    it('runs the middle arrow to the midpoint of the front edge', () => {
        const coords = anchors(60_000, 90_000);
        const frame = frontEdgeFromAnchors(coords)!;
        const midpoint = turf.midpoint(turf.point(coords[0]), turf.point(coords[1])).geometry.coordinates as Position;
        // The axis's far end *is* that midpoint, which is where the middle arrowhead lands.
        expect(metres(frame.axis[1], midpoint)).toBeLessThan(1);
    });
});
