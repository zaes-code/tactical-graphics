/**
 * # Where a cover, guard or screen turns and scales from
 *
 * APP-06 342201/342202/342203 are four-point symbols drawn from two clicks: point 1 is one
 * arrowhead, point 2 its inner end, and the second arm is **mirrored about the gap** — so
 * the symbol runs on past point 2 and its middle is not the midpoint of the two drawn
 * points. That middle is where the two letters meet and where the host's injected unit
 * symbol goes.
 *
 * `rotationAnchor` is every renderer's *frame origin*: the point a rotate turns about and
 * the point a resize scales from. It answered "first vertex" for these, which is an
 * arrowhead at the far end of a symbol 410 px across — so the whole graphic swung and grew
 * about a corner of itself rather than about the symbol in its middle. (User's call,
 * 2026-09-06: "the axis of rotation and resize [...] need to go off the center of the
 * graphic where the symbol may or may not be".)
 *
 * The assertion that matters is the last one: the gesture's axis and the *painted* symbol's
 * position are the same point, reached from opposite directions — one from the base a
 * gesture has, one from the rendered line work the paint has. They were computed twice
 * before, and a symbol that does not sit on its own axis of rotation is what that costs.
 */
import type {Feature, MultiLineString, Position} from 'geojson';
import * as turf from '../core/turf';
import {renderTacticalGraphic} from '../core/render';
import {rotationAnchor, rotationPivot} from '../core/handles';
import {TacticalGraphicName} from '../core/type';
import {SECURITY_OPERATION_GRAPHICS, securityOperationAnchors, securityOperationBaseCentre} from './SecurityOperation';

/** One arm drawn west to east: the arrowhead, then its inner end. */
const TIP: Position = [-2, 10];
const INNER: Position = [2, 10];
const BASE = {type: 'LineString', coordinates: [TIP, INNER]};

const meters = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

/** The rendered symbol's own extent, flattened. */
function drawnPositions(name: TacticalGraphicName): Position[] {
    const rendered = renderTacticalGraphic({
        type: 'Feature',
        properties: {tacticalGraphic: {name}},
        geometry: {type: 'LineString', coordinates: [TIP, INNER]},
    } as Feature);
    return (rendered.graphic.geometry as MultiLineString).coordinates.flat() as Position[];
}

describe('a security operation turns and scales about its middle', () => {
    it.each(SECURITY_OPERATION_GRAPHICS.map(n => [String(n), n] as const))(
        '%s pivots past point 2, not on point 1',
        (_label, name) => {
            const anchor = rotationAnchor(BASE, name);
            // Not the arrowhead, and not point 2 either — the gap carries it further.
            expect(meters(anchor, TIP)).toBeGreaterThan(meters(INNER, TIP));
            expect(meters(anchor, INNER)).toBeGreaterThan(1);
            // Rotate and resize share the frame origin, which is the whole point: the user
            // asked for both. @see rotationPivot
            expect(rotationPivot(BASE, name)).toEqual(anchor);
        },
    );

    it.each(SECURITY_OPERATION_GRAPHICS.map(n => [String(n), n] as const))(
        '%s pivots on the middle of what it actually draws',
        (_label, name) => {
            const positions = drawnPositions(name);
            const xs = positions.map(p => p[0]);
            const middleX = (Math.min(...xs) + Math.max(...xs)) / 2;
            // Within a percent of the arm: the drawn extent includes the arrowhead barbs,
            // so it is not exactly the gap's centre, but the two must not be far apart.
            const arm = meters(TIP, INNER);
            expect(Math.abs(rotationAnchor(BASE, name)[0] - middleX) / (arm / 111_320)).toBeLessThan(0.05);
        },
    );

    it('reads the centre from the base, and refuses a base that cannot describe an arm', () => {
        // A gesture only ever has the base, so this is the form that has to answer. A short
        // or degenerate one returns undefined rather than a guess — `rotationAnchor` then
        // falls through to its ordinary rule instead of pivoting on nonsense.
        expect(securityOperationBaseCentre([TIP, INNER])).toBeDefined();
        expect(securityOperationBaseCentre([TIP])).toBeUndefined();
        expect(securityOperationBaseCentre([TIP, TIP])).toBeUndefined();
        expect(securityOperationBaseCentre(undefined)).toBeUndefined();
    });

    it('leaves the escort alone, whose point 1 already is its centre', () => {
        // 343600 states it outright — "Point 1 defines the centre of the graphic" — so it is
        // a three-point symbol with the centre placed, not derived, and the ordinary rule is
        // already right for it. It carries an injected centre symbol like these three, which
        // is exactly why it is worth pinning that it is *not* treated like them.
        expect(SECURITY_OPERATION_GRAPHICS).not.toContain(TacticalGraphicName.Escort);
        expect(rotationAnchor(BASE, TacticalGraphicName.Escort)).toEqual(TIP);
    });
});

describe('342201: the two arrows vary independently', () => {
    /*
     * > Size/Shape. Points 1 and 2 and Points 3 and 4 determine the length of the arrows.
     * > **The length and orientation of the arrows can vary independently.**
     * >
     * > Orientation. […] The tactical symbol indicator is centred between point 2 and point 3.
     *
     * The operator drew one arm until 2026-09-06 and the second was mirrored from it, so the
     * two were always equal in length and always collinear. Both of those are things the
     * plate says need not hold. (User's call: "we need to let them pick the 4 points".)
     */
    const P1: Position = [-2, 10];
    const P2: Position = [0.4, 10];
    /** Point 3 nowhere near the mirror's place, and point 4 on a different bearing. */
    const P3: Position = [1.2, 10.9];
    const P4: Position = [2.6, 12.4];
    const FOUR = [P1, P2, P3, P4];

    const rendered = (coordinates: Position[]) =>
        renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name: TacticalGraphicName.Screen}},
            geometry: {type: 'LineString', coordinates},
        } as Feature);

    it('keeps each arrow at the length and bearing its own two points give it', () => {
        const parts = (rendered(FOUR).graphic.geometry as MultiLineString).coordinates;
        // The generator emits `[arm, head, arm, head]`; each arm runs from its inner end out.
        const [armA, , armB] = parts;
        // **Measured as a ratio, because an arm is a folded polyline.** `ARM_PROFILE` steps
        // sideways before the arrowhead, so an arm's end-to-end distance is its length times
        // sqrt(1 + depth^2) — about 1.2% longer. That factor is the same for both arms and
        // cancels here, where comparing either against its own two points would not.
        const endToEnd = (line: Position[]) => meters(line[0], line[line.length - 1]);
        expect(endToEnd(armB) / endToEnd(armA)).toBeCloseTo(meters(P3, P4) / meters(P2, P1), 2);
        // Each starts exactly at its own inner end, which is not folded and is exact.
        expect(meters(armA[0], P2)).toBeLessThan(1);
        expect(meters(armB[0], P3)).toBeLessThan(1);
        // …and the two lengths differ, which the old mirrored construction could not express.
        expect(Math.abs(endToEnd(armA) - endToEnd(armB))).toBeGreaterThan(meters(P2, P1) * 0.1);
        const bearing = (line: Position[]) =>
            turf.bearing(turf.point(line[0]), turf.point(line[line.length - 1]));
        const opposed = Math.abs(Math.abs(bearing(armA) - bearing(armB)) - 180);
        expect(opposed).toBeGreaterThan(5);
    });

    it('centres the symbol between points 2 and 3, wherever they are', () => {
        // The plate names this construction outright. It is also the only one that always
        // has an answer: the two arms' axes extended meet at the same place while they are
        // symmetric, and nowhere at all once they are parallel.
        const centre = rotationAnchor({type: 'LineString', coordinates: FOUR}, TacticalGraphicName.Screen);
        const midpoint = turf.midpoint(turf.point(P2), turf.point(P3)).geometry.coordinates as Position;
        expect(meters(centre, midpoint)).toBeLessThan(1);
    });

    it('publishes a grip on each of the four, where they were put', () => {
        const handles = (rendered(FOUR).handles.geometry as {coordinates: Position[]}).coordinates;
        expect(handles).toHaveLength(4);
        FOUR.forEach((point, i) => expect(meters(handles[i], point)).toBeLessThan(1));
    });

    it('upgrades a two-point save without moving it', () => {
        /*
         * The one property that makes the change safe: every screen already saved is two
         * points, and the second arm is laid out as the mirror the generator used to derive.
         * The old centre sat `HALF_GAP_RATIO` of an arm beyond point 2, and the derived
         * point 3 sits twice that — so the plate's midpoint lands exactly where the old
         * centre was, and the picture does not move.
         */
        const two = [TIP, INNER];
        const four = securityOperationAnchors(two)!;
        expect(four).toHaveLength(4);
        const before = JSON.stringify((rendered(two).graphic.geometry as MultiLineString).coordinates);
        const after = JSON.stringify((rendered(four).graphic.geometry as MultiLineString).coordinates);
        expect(after).toEqual(before);
    });
});
