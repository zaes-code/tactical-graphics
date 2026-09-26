/**
 * # An arc mission task's second click is its start point
 *
 * APP-06 says it the same way for all ten arc mission tasks: *"Point 1 defines the centre
 * point of the graphic and point 2 defines the graphic's start point and radius."* The
 * start point is the blunt end of the upper arc, `START_POINT_DEGREES` round from the
 * rotation axis, and it is where the edit handle sits.
 *
 * The draw used to file the angle to the second click as `rotation`, which is the axis the
 * letter sits on, so the start point (and its handle) landed 175 degrees away from where
 * the user clicked. These tests draw each graphic the way both engines do, from a centre
 * and a click measured in Web Mercator, and check the handle comes back under the click.
 */

import {baseGeometryFor, listTacticalGraphicNames, renderTacticalGraphic} from './core/render';
import {drawsFromStartPoint, frameFromDrag, rotationFromDrawnPoint, START_POINT_DEGREES} from './core/symbology';
import {groundLength, lonLatToMercator, mercatorToLonLat} from './core/mercator';
import {TacticalGraphicName} from './core/type';

type Pos = [number, number];

/** The ten whose plate reads "point 2 defines the graphic's start point and radius". */
const START_POINT_TASKS = [
    TacticalGraphicName.AreaDefense, // 152600
    TacticalGraphicName.Retain, // 151205
    TacticalGraphicName.Isolate, // 341500
    TacticalGraphicName.Occupy, // 341700
    TacticalGraphicName.Secure, // 342100
    TacticalGraphicName.CordonAndKnock, // 342600
    TacticalGraphicName.CordonAndSearch, // 342700
    TacticalGraphicName.Control, // 343200
    TacticalGraphicName.Deny, // 343400
    TacticalGraphicName.Locate, // 343900
];

/** Planar degrees, counter-clockwise from east, including both seams. */
const DIRECTIONS = [0, 37, 90, 135, 180, 200, 270, 315, -170];

const CENTER: Pos = [10, 45];
/** Projected metres from the centre to the click. */
const REACH = 30_000;

/** The second click at `angleDeg` from the centre, as an engine measures it. */
function clickAt(angleDeg: number): Pos {
    const [x, y] = lonLatToMercator(CENTER);
    const a = (angleDeg * Math.PI) / 180;
    return mercatorToLonLat([x + REACH * Math.cos(a), y + REACH * Math.sin(a)]) as Pos;
}

/** Metres between two lon/lat points, flat-earth. Plenty at this scale. */
function metresApart(a: Pos, b: Pos): number {
    const k = 111_320;
    const dx = (a[0] - b[0]) * k * Math.cos((CENTER[1] * Math.PI) / 180);
    const dy = (a[1] - b[1]) * k;
    return Math.hypot(dx, dy);
}

function edgeHandle(name: TacticalGraphicName, radius: number, rotation: number): Pos {
    const out = renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'Point', coordinates: CENTER},
        properties: {tacticalGraphic: {name, radius, rotation}},
    } as never);
    return (out.handles.geometry as unknown as {coordinates: Pos[]}).coordinates[0];
}

/** The ground radius both engines file for a drag of `REACH` projected metres. */
const RADIUS = groundLength(REACH, CENTER[1]);
/** A share of the radius; the handle is a geodesic walk, the click a Mercator one. */
const TOLERANCE_M = RADIUS * 0.005;

describe('the second click of an arc mission task is its start point', () => {
    describe.each(START_POINT_TASKS.map(n => [String(n), n] as const))('%s', (_label, name) => {
        it.each(DIRECTIONS)('puts the start-point handle under a click at %s degrees (OpenLayers path)', angle => {
            const frame = frameFromDrag(name, RADIUS, angle);
            expect(metresApart(edgeHandle(name, frame.size, frame.rotation), clickAt(angle))).toBeLessThan(TOLERANCE_M);
        });

        it.each(DIRECTIONS)('puts the start-point handle under a click at %s degrees (MapLibre path)', angle => {
            const rotation = rotationFromDrawnPoint(name, angle);
            expect(metresApart(edgeHandle(name, RADIUS, rotation), clickAt(angle))).toBeLessThan(TOLERANCE_M);
        });
    });

    it('files a rotation START_POINT_DEGREES short of the click, in (-180, 180]', () => {
        expect(rotationFromDrawnPoint(TacticalGraphicName.Secure, 175)).toBe(0);
        expect(rotationFromDrawnPoint(TacticalGraphicName.Secure, 0)).toBe(-175);
        expect(rotationFromDrawnPoint(TacticalGraphicName.Secure, -5)).toBe(180);
        for (const angle of DIRECTIONS) {
            const rotation = rotationFromDrawnPoint(TacticalGraphicName.Isolate, angle);
            expect(rotation).toBeGreaterThan(-180);
            expect(rotation).toBeLessThanOrEqual(180);
            expect((((rotation + START_POINT_DEGREES - angle) % 360) + 360) % 360).toBeCloseTo(0, 9);
        }
    });
});

describe('every other graphic keeps the angle to its second click as its rotation', () => {
    it.each([
        TacticalGraphicName.FreeFireAreaCircular,
        TacticalGraphicName.NoFireAreaCircular,
        TacticalGraphicName.Destroy,
        TacticalGraphicName.Turn,
    ])('%s', name => {
        for (const angle of DIRECTIONS) {
            expect(rotationFromDrawnPoint(name, angle)).toBe(angle);
            expect(frameFromDrag(name, 1000, angle).rotation).toBe(angle);
        }
    });

    it('leaves contain on its own end-to-end rule', () => {
        expect(frameFromDrag(TacticalGraphicName.Contain, 1000, 30).rotation).toBe(120);
    });
});

describe('the list is the set of graphics whose handle is on the start point', () => {
    it('matches, both ways, every Point graphic whose edge handle sits START_POINT_DEGREES round', () => {
        /*
         * The list is a reading of the plates, and the handle is where the generator puts
         * the start point. If a generator starts putting a handle there, or one of the ten
         * stops, the draw rule and the handle disagree and a user's click misses the grip.
         */
        const onStartPoint: TacticalGraphicName[] = [];
        for (const name of listTacticalGraphicNames() as TacticalGraphicName[]) {
            if (baseGeometryFor(name) !== 'Point') continue;
            let handle: Pos | undefined;
            try {
                handle = edgeHandle(name, RADIUS, 0);
            } catch {
                continue;
            }
            if (!handle) continue;
            const [x, y] = lonLatToMercator(handle);
            const [cx, cy] = lonLatToMercator(CENTER);
            if (Math.hypot(x - cx, y - cy) < REACH / 2) continue;
            const bearing = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
            if (Math.abs(bearing - START_POINT_DEGREES) < 1) onStartPoint.push(name);
        }
        expect([...onStartPoint].sort()).toEqual([...START_POINT_TASKS].sort());
        for (const name of START_POINT_TASKS) expect(drawsFromStartPoint(name)).toBe(true);
    });
});
