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
import {SECURITY_OPERATION_GRAPHICS, securityOperationBaseCentre} from './SecurityOperation';

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
