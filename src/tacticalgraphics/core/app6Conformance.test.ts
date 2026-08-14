import {Feature, LineString, MultiLineString, Position} from 'geojson';
import * as turf from './turf';
import {baseGeometryFor, renderTacticalGraphic} from './render';
import {TacticalGraphicName} from './type';

/**
 * Rules taken verbatim from APP-06 Edition E Chapter 8, pinned as behaviour.
 *
 * These are the constructions a geometry test would otherwise never question: the
 * symbol looks plausible whichever way it is built, so only the standard says which
 * is right. Each block quotes the rule it enforces so a future reader can check the
 * assertion against the document rather than against this file.
 *
 * @see ai/app-6.md for how the disagreements were found and what was withdrawn.
 */

const metres = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

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
        const shortTooth = metres(short[0], short[2]);
        const longTooth = metres(long[0], long[2]);

        expect(shortTooth).toBeCloseTo(TOOTH, 0);
        expect(longTooth).toBeCloseTo(TOOTH, 0);
        // The routes really do differ, or the assertion above proves nothing.
        expect(metres(long[0], long[long.length - 1])).toBeGreaterThan(metres(short[0], short[short.length - 1]) * 3);
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
        const total = metres(tiny[0], tiny[1]);
        expect(metres(path[0], path[2])).toBeLessThanOrEqual(total / 2 + 1);
    });

    it('puts the apex on the other side when mirrored', () => {
        const plain = drawn(lineBase(TacticalGraphicName.Abatis, SHORT, {radius: TOOTH}));
        const flipped = drawn(lineBase(TacticalGraphicName.Abatis, SHORT, {radius: TOOTH, mirrored: true}));
        // Same feet, apex reflected across the route.
        expect(metres(plain[0], flipped[0])).toBeCloseTo(0, 1);
        expect(metres(plain[1], flipped[1])).toBeGreaterThan(TOOTH);
    });

    it('offers the two ends and the apex as handles', () => {
        const handles = renderTacticalGraphic(lineBase(TacticalGraphicName.Abatis, SHORT, {radius: TOOTH})).handles;
        expect(handles.geometry.type).toBe('MultiPoint');
        expect((handles.geometry as {coordinates: Position[]}).coordinates).toHaveLength(3);
    });
});

describe('APP-06 271201 — demolition readiness states', () => {
    // "Points 1 and 2 determine the centreline of the symbol and point 3 determines
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

    it.each(STATES)('%s is built from a drawn centreline', name => {
        expect(baseGeometryFor(name)).toBe('LineString');
    });

    it.each(STATES)('%s lays two rails either side of that centreline', name => {
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
        const gapAt = (width: number) => metres(rails(name, width)[0][0], rails(name, width)[1][0]);
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
