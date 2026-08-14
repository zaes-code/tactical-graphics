import {Feature, LineString, MultiLineString, Position} from 'geojson';
import * as turf from './turf';
import {baseGeometryFor, renderTacticalGraphic} from './render';
import {TacticalGraphicName} from './type';
import {getSpecifications, TacticalGraphicSpecification} from './specifications';

/**
 * Rules taken verbatim from APP-06 Edition E Chapter 8, pinned as behavior.
 *
 * These are the constructions a geometry test would otherwise never question: the
 * symbol looks plausible whichever way it is built, so only the standard says which
 * is right. Each block quotes the rule it enforces so a future reader can check the
 * assertion against the document rather than against this file.
 *
 * @see ai/app-6.md for how the disagreements were found and what was withdrawn.
 */

const meters = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

const lineBase = (name: TacticalGraphicName, coordinates: Position[], props: Record<string, unknown> = {}): Feature => ({
    type: 'Feature',
    properties: {tacticalGraphic: {name, ...props}},
    geometry: {type: 'LineString', coordinates},
});

const drawn = (feature: Feature): Position[] => {
    const g = renderTacticalGraphic(feature).graphic.geometry as MultiLineString | LineString;
    return g.type === 'MultiLineString' ? g.coordinates[0] : g.coordinates;
};

describe('APP-06 280100 — abatis', () => {
    // "This symbol requires at least two anchor points, points 1 and 2, to define the
    //  line. Additional points can be defined to extend the line."
    const SHORT: Position[] = [[-77.0, 38.9], [-76.97, 38.905], [-76.94, 38.92]];
    const LONG: Position[] = [[-77.0, 38.9], [-76.97, 38.905], [-76.5, 38.99]];
    const TOOTH = 260;

    it('is driven by a drawn line, not by a dropped point', () => {
        expect(baseGeometryFor(TacticalGraphicName.Abatis)).toBe('LineString');
    });

    // "The first and last anchor points determine the length of the line. The size of
    //  the tooth does not change."
    it('keeps the tooth the same size however long the route is', () => {
        const short = drawn(lineBase(TacticalGraphicName.Abatis, SHORT, {radius: TOOTH}));
        const long = drawn(lineBase(TacticalGraphicName.Abatis, LONG, {radius: TOOTH}));

        // Points 0 and 2 are the tooth's feet; the route continues from there.
        const shortTooth = meters(short[0], short[2]);
        const longTooth = meters(long[0], long[2]);

        expect(shortTooth).toBeCloseTo(TOOTH, 0);
        expect(longTooth).toBeCloseTo(TOOTH, 0);
        // The routes really do differ, or the assertion above proves nothing.
        expect(meters(long[0], long[long.length - 1])).toBeGreaterThan(meters(short[0], short[short.length - 1]) * 3);
    });

    it('follows the road rather than straightening to its endpoints', () => {
        const path = drawn(lineBase(TacticalGraphicName.Abatis, SHORT, {radius: TOOTH}));
        // Two feet plus an apex is three; anything beyond that is the drawn route's
        // own bend surviving into the symbol.
        expect(path.length).toBeGreaterThan(3);
    });

    it('never lets the tooth swallow the whole obstacle', () => {
        const tiny: Position[] = [[-77.0, 38.9], [-76.999, 38.9002]];
        const path = drawn(lineBase(TacticalGraphicName.Abatis, tiny, {radius: TOOTH}));
        const total = meters(tiny[0], tiny[1]);
        expect(meters(path[0], path[2])).toBeLessThanOrEqual(total / 2 + 1);
    });

    it('puts the apex on the other side when mirrored', () => {
        const plain = drawn(lineBase(TacticalGraphicName.Abatis, SHORT, {radius: TOOTH}));
        const flipped = drawn(lineBase(TacticalGraphicName.Abatis, SHORT, {radius: TOOTH, mirrored: true}));
        // Same feet, apex reflected across the route.
        expect(meters(plain[0], flipped[0])).toBeCloseTo(0, 1);
        expect(meters(plain[1], flipped[1])).toBeGreaterThan(TOOTH);
    });

    it('offers the two ends and the apex as handles', () => {
        const handles = renderTacticalGraphic(lineBase(TacticalGraphicName.Abatis, SHORT, {radius: TOOTH})).handles;
        expect(handles.geometry.type).toBe('MultiPoint');
        expect((handles.geometry as {coordinates: Position[]}).coordinates).toHaveLength(3);
    });
});

describe('APP-06 271201 — demolition readiness states', () => {
    // "Points 1 and 2 determine the centerline of the symbol and point 3 determines
    //  its width."
    const STATES = [
        TacticalGraphicName.ExplosivesPlannedStateOfReadiness,
        TacticalGraphicName.ExplosivesStateOfReadiness1Safe,
        TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable,
    ];
    const ROUTE: Position[] = [[-0.4, 51.4], [-0.1, 51.6]];

    const rails = (name: TacticalGraphicName, width = 2000, coords = ROUTE) => {
        const g = renderTacticalGraphic(lineBase(name, coords, {width})).graphic.geometry as MultiLineString;
        return g.coordinates;
    };

    it.each(STATES)('%s is built from a drawn centerline', name => {
        expect(baseGeometryFor(name)).toBe('LineString');
    });

    it.each(STATES)('%s lays two rails either side of that centerline', name => {
        const [left, right] = rails(name);
        expect(left).toHaveLength(2);
        expect(right).toHaveLength(2);
        // Both rails run parallel to the drawn line...
        const bearing = (p: Position[]) => turf.bearing(turf.point(p[0]), turf.point(p[1]));
        expect(bearing(left)).toBeCloseTo(bearing(right), 1);
        // ...and sit on opposite sides of it.
        const drawnBearing = turf.bearing(turf.point(ROUTE[0]), turf.point(ROUTE[1]));
        expect(bearing(left)).toBeCloseTo(drawnBearing, 1);
    });

    it.each(STATES)('%s spaces the rails by the width it is given', name => {
        const gapAt = (width: number) => meters(rails(name, width)[0][0], rails(name, width)[1][0]);
        expect(gapAt(6000)).toBeGreaterThan(gapAt(2000) * 2);
    });

    // The defect this replaced: a fixed 45° bearing meant the pair could not be laid
    // across a road running any other way.
    it.each(STATES)('%s takes its bearing from the road, not from a constant', name => {
        const east = rails(name, 2000, [[-0.4, 51.5], [0.1, 51.5]])[0];
        const north = rails(name, 2000, [[-0.4, 51.3], [-0.4, 51.7]])[0];
        const bearing = (p: Position[]) => turf.bearing(turf.point(p[0]), turf.point(p[1]));
        expect(Math.abs(bearing(east) - bearing(north))).toBeGreaterThan(45);
    });

    it.each(STATES)('%s offers the movement contract: start, end and a width handle', name => {
        const handles = renderTacticalGraphic(lineBase(name, ROUTE, {width: 2000})).handles;
        expect((handles.geometry as {coordinates: Position[]}).coordinates).toHaveLength(3);
    });
});

/**
 * Advance to contact, APP-06 342900: "The symbol requires N anchor points, where N is
 * between 3 and 50." A drawn route arrow — and a **different symbol** from FM 1-02.2's
 * movement to contact, which is why it is its own graphic. @see the pair of tests below.
 *
 * The bolt is asserted in the arrow's **own frame** rather than by eye. Both of the
 * first two attempts at it looked plausible in a screenshot and were wrong in a way
 * only numbers showed: one ran the strokes back along the head's flank, and the next
 * put them on the wrong side entirely.
 */
describe('advance to contact is drawn, not dropped', () => {
    const ROUTE = {type: 'LineString' as const, coordinates: [[-0.42, 51.55], [-0.20, 51.55]]};
    const BENT = {type: 'LineString' as const, coordinates: [[-0.05, 51.5], [0.06, 51.58], [0.2, 51.6]]};

    const render = (geometry: typeof ROUTE, radius = 1400) =>
        renderTacticalGraphic({
            type: 'Feature',
            geometry: geometry as never,
            properties: {tacticalGraphic: {name: TacticalGraphicName.AdvanceToContact, radius}},
        });

    const members = (geometry: typeof ROUTE, radius = 1400) =>
        (render(geometry, radius).graphic.geometry as {coordinates: Position[][]}).coordinates;

    it('takes a LineString base', () => {
        expect(baseGeometryFor(TacticalGraphicName.AdvanceToContact)).toBe('LineString');
        expect(() => render(ROUTE)).not.toThrow();
    });

    it('accepts a multi-leg route, which the dropped form could not express at all', () => {
        const straightBody = members(ROUTE)[0];
        const bentBody = members(BENT)[0];
        expect(bentBody.length).toBeGreaterThan(straightBody.length);
    });

    it('emits the body, the head and a single bolt', () => {
        // [leftBody, head, rightBody, bolt, boltHead] — one contact mark, per the plate.
        expect(members(ROUTE)).toHaveLength(5);
    });

    /**
     * Every vertex in the arrow's frame: `x` along the axis with the tip at 1, `y`
     * across it with the head's wings at about +/-0.83.
     */
    const inArrowFrame = (geometry: typeof ROUTE) => {
        const lines = members(geometry);
        const head = lines[1];
        const [, leftWing, tip, rightWing] = head;
        const mid = [(leftWing[0] + rightWing[0]) / 2, (leftWing[1] + rightWing[1]) / 2];
        const axis = [tip[0] - mid[0], tip[1] - mid[1]];
        const len = Math.hypot(axis[0], axis[1]);
        const ux = [axis[0] / len, axis[1] / len];
        const uy = [-ux[1], ux[0]];
        const local = (p: Position) => {
            const d = [p[0] - mid[0], p[1] - mid[1]];
            return [(d[0] * ux[0] + d[1] * ux[1]) / len, (d[0] * uy[0] + d[1] * uy[1]) / len];
        };
        return {
            wing: Math.abs(local(leftWing)[1]),
            bolt: lines[3].map(local),
        };
    };

    it('keeps the whole bolt on one side of the axis', () => {
        const {bolt} = inArrowFrame(ROUTE);
        const side = Math.sign(bolt[0][1]);
        expect(side).not.toBe(0);
        expect(bolt.every(p => Math.sign(p[1]) === side)).toBe(true);
    });

    it('keeps the bolt outside the arrowhead', () => {
        // Beyond the wings, which are the widest part of the symbol — so a bolt clear of
        // them is clear of the whole outline.
        const {wing, bolt} = inArrowFrame(ROUTE);
        expect(Math.min(...bolt.map(p => Math.abs(p[1])))).toBeGreaterThan(wing);
    });

    it('holds that shape on a bent route, where the head arrives at an angle', () => {
        const {wing, bolt} = inArrowFrame(BENT);
        const side = Math.sign(bolt[0][1]);
        expect(bolt.every(p => Math.sign(p[1]) === side)).toBe(true);
        expect(Math.min(...bolt.map(p => Math.abs(p[1])))).toBeGreaterThan(wing);
    });
});

/**
 * The other half of the split, and the reason it exists.
 *
 * FM 1-02.2 table 5-10 draws movement to contact as a **badge**: a fixed arrow with
 * flared, swept-back fins and a contact bolt on *each* flank, dropped on one point with
 * unit symbols beside it. APP-06 342900 draws a route with square shoulders and *one*
 * bolt. Nothing in either standard is the other: FM never says "advance to contact",
 * APP-06 has no "movement to contact", and JMSML — the data behind MIL-STD-2525 —
 * carries neither, so 342900 is APP-06's alone.
 *
 * This pins the two apart, because the failure mode is silent: both are hollow arrows
 * with lightning bolts, and one quietly standing in for the other is exactly what
 * happened once already.
 */
describe('movement to contact and advance to contact are different symbols', () => {
    it('movement to contact is dropped on a point; advance to contact is drawn', () => {
        expect(baseGeometryFor(TacticalGraphicName.MovementToContact)).toBe('Point');
        expect(baseGeometryFor(TacticalGraphicName.AdvanceToContact)).toBe('LineString');
    });

    it('movement to contact carries two contact bolts, advance to contact one', () => {
        const badge = renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'Point', coordinates: [-0.3, 51.55]},
            properties: {tacticalGraphic: {name: TacticalGraphicName.MovementToContact, radius: 4000, rotation: 0}},
        });
        // The badge is [upperPath, lowerPath] then a line and a head per bolt.
        expect((badge.graphic.geometry as {coordinates: Position[][]}).coordinates).toHaveLength(6);

        const route = renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: [[-0.42, 51.55], [-0.20, 51.55]]} as never,
            properties: {tacticalGraphic: {name: TacticalGraphicName.AdvanceToContact, radius: 1400}},
        });
        // Three members of body and head, then one line and one head for the single bolt.
        expect((route.graphic.geometry as {coordinates: Position[][]}).coordinates).toHaveLength(5);
    });

    it('files them under one specification each, not both', () => {
        expect(getSpecifications(TacticalGraphicName.MovementToContact))
            .toEqual([TacticalGraphicSpecification.FM1_02_2]);
        expect(getSpecifications(TacticalGraphicName.AdvanceToContact))
            .toEqual([TacticalGraphicSpecification.APP6]);
    });
});
