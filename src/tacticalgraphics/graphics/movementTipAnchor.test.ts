/**
 * # Point 1 is the end of the symbol, and 340700 says which end
 *
 * Every arrow in the movement family is built on the operator's line **minus an overhang**,
 * so that whatever the symbol draws last lands exactly on the last vertex the operator
 * placed. That is what `tipOverhang` is for, and it is why point 1 is grabbable: the mark is
 * on the click rather than somewhere past it.
 *
 * 340700 counter-attack by fire draws one thing more than the arrow — the *by fire* bracket,
 * a dashed bar with a small solid shaft and head. Inheriting 340600's overhang left that
 * bracket standing **1.85 half-widths beyond the click**, so point 1 was neither the tip of
 * anything nor the end of the symbol.
 *
 * The two rows share every word of their Draw Rules — "Point 1 defines the tip of the
 * arrowhead" — so the *Templates* are where the distinction is made, and they make it:
 *
 * - **340600** letters `PT. 1` on the counterattack arrow's own `>`.
 * - **340700** letters it past the bar, on the head of the little by-fire arrow.
 *
 * (User's report, 2026-09-06, with the wanted position drawn on a screenshot.)
 */
import type {Feature, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';
import {renderTacticalGraphic} from '../core/render';
import {TacticalGraphicName} from '../core/type';

/**
 * The whole movement family, so "fix 340700 without touching the rest" is a claim the suite
 * makes rather than one a reader has to take on faith. @see MovementGraphicBase
 */
const FAMILY = [
    TacticalGraphicName.MainAxisOfAdvance,
    TacticalGraphicName.MainAxisOfAdvanceFeint,
    TacticalGraphicName.SupportingAxisOfAdvance,
    TacticalGraphicName.AviationAxisOfAdvance,
    TacticalGraphicName.AttackHelicopterAxisOfAdvance,
    TacticalGraphicName.Counterattack,
    TacticalGraphicName.CounterattackByFire,
    TacticalGraphicName.AvenueOfApproach,
];

/** Stored tip-first: point 1, a bend, then the rear. Long enough that no trim is capped. */
const STORED: Position[] = [[3, 20], [0, 20.4], [-3, 20]];
const WIDTH = 80_000;
const RADIUS = WIDTH / 2;

const built = (name: TacticalGraphicName, coords = STORED) =>
    renderTacticalGraphic({
        type: 'Feature',
        properties: {tacticalGraphic: {name, width: WIDTH}},
        geometry: {type: 'LineString', coordinates: coords},
    } as Feature);

const ink = (name: TacticalGraphicName, coords = STORED) =>
    ((built(name, coords).graphic.geometry as MultiLineString).coordinates.flat() as Position[]);

/**
 * How far past point 1 the symbol's furthest mark reaches, **measured along its own axis**
 * and in half-widths.
 *
 * Along the axis rather than as a straight distance: a mark beside the tip is not a mark
 * beyond it, and only the second is an overhang. Negative means the symbol stops short.
 */
function reachPastPointOne(name: TacticalGraphicName, coords = STORED): number {
    const [one, two] = coords;
    const axis = turf.bearing(turf.point(two), turf.point(one));
    const along = (p: Position) => {
        const d = turf.distance(turf.point(two), turf.point(p), {units: 'meters'});
        const off = ((turf.bearing(turf.point(two), turf.point(p)) - axis) * Math.PI) / 180;
        return d * Math.cos(off);
    };
    const pointOne = along(one);
    return (Math.max(...ink(name, coords).map(along)) - pointOne) / RADIUS;
}

describe('the movement family ends on point 1', () => {
    it.each(FAMILY.map(n => [String(n), n] as const))('%s draws nothing past it', (_label, name) => {
        // A tenth of a half-width of slack: the trim is geodesic and the extension is
        // geodesic, but they are taken along bearings that differ slightly on a curved leg.
        expect(reachPastPointOne(name)).toBeLessThan(0.1);
    });

    it('puts 340700 the whole bracket inside the click, not beyond it', () => {
        /*
         * The number this closed: the bracket stood off by `BY_FIRE_STANDOFF` and ran on for
         * `BY_FIRE_SHAFT`, so its head sat 1.85 half-widths past point 1 — most of a symbol's
         * width, and consistently on the far side of whatever the click was placed against.
         */
        expect(reachPastPointOne(TacticalGraphicName.CounterattackByFire)).toBeLessThan(0.1);

        // …and the bracket is still drawn, rather than the overhang having been closed by
        // dropping it. It stands clear of the arrow's own point, which is the whole reason
        // 340700 is a different symbol from 340600.
        const arrow = reachPastPointOne(TacticalGraphicName.Counterattack);
        const byFire = ink(TacticalGraphicName.CounterattackByFire);
        const plain = ink(TacticalGraphicName.Counterattack);
        expect(byFire.length).toBeGreaterThan(plain.length);
        expect(arrow).toBeLessThan(0.1);
    });

    it('leaves 340600 exactly where it was', () => {
        // The user's constraint in their own words: "make sure not to affect the other
        // graphics in the family". 340600 is the one that shares a generator with 340700, so
        // it is the one an override could have reached. Pinned against its own points rather
        // than a recorded fixture, so this says what it means.
        const [one] = STORED;
        const furthest = ink(TacticalGraphicName.Counterattack).reduce(
            (best, c) => (turf.distance(turf.point(STORED[2]), turf.point(c), {units: 'meters'}) > best.d
                ? {d: turf.distance(turf.point(STORED[2]), turf.point(c), {units: 'meters'}), c}
                : best),
            {d: -1, c: [0, 0] as Position},
        );
        expect(turf.distance(turf.point(furthest.c), turf.point(one), {units: 'meters'})).toBeLessThan(RADIUS / 20);
    });

    it.each(FAMILY.map(n => [String(n), n] as const))('%s keeps its grip on point 1', (_label, name) => {
        // Moving where the symbol *ends* must not move where the grip is: it is the operator's
        // own vertex, which is what lets a vertex-editing tool pick it up. @see generateHandles
        const grips = (built(name).handles.geometry as MultiPoint).coordinates;
        expect(turf.distance(turf.point(grips[1]), turf.point(STORED[0]), {units: 'meters'})).toBeLessThan(1);
    });
});
