/**
 * # The two maritime shapes the library did not already have
 *
 * The ellipse (200101 / 200201 / 200401) and the annular sector (200700).
 *
 * The ellipse's risks are arithmetic and both are one-character mistakes with pictures
 * that *nearly* look right:
 *
 * - **`AM1` is a radius and `length` is the full figure**, so the mapping is a factor of
 *   two. Getting it backwards draws an ellipse half as long as the operator typed, which
 *   is a plausible-looking ellipse.
 * - **The sweep runs through negative distances.** `RectangularTarget.along` refuses those
 *   the way turf does, and the first version of this generator inherited the refusal — so
 *   the whole left half of every ellipse collapsed onto its centre and the symbol drew as
 *   a half-ellipse closed by a straight line. Nothing threw; the generated thumbnail was
 *   what showed it.
 */
import {TacticalGraphicName} from '../core/type';
import {EllipticalArea, RadarSearchDoctrine} from './MaritimeArea';
import type {Feature, GeometryCollection, MultiPoint, Point, Polygon, Position} from 'geojson';
import * as turf from '../core/turf';

const at = (lon: number, lat: number): Feature<Point> => ({
    type: 'Feature',
    geometry: {type: 'Point', coordinates: [lon, lat]},
    properties: {},
});

const metres = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

describe('the ellipse', () => {
    const ellipse = new EllipticalArea(TacticalGraphicName.LaunchAreaEllipse);
    /** AM1 = 60 km, AM = 20 km, AN = 0 — the plate's own three numbers, scaled up. */
    const opts = {length: 120_000, radius: 20_000, rotation: 0};
    const ring = (o = opts, centre = at(0, 0)) =>
        (ellipse.generateGraphics(centre, o) as Feature<Polygon>).geometry.coordinates[0];

    it('closes', () => {
        const r = ring();
        expect(r.length).toBeGreaterThan(20);
        expect(r[0]).toEqual(r[r.length - 1]);
    });

    it('is a full ellipse, not a half one', () => {
        /*
         * The regression guard for the collapsed sweep. A half-ellipse's vertices all sit
         * at or east of the centre; a whole one reaches `AM1` on **both** sides.
         */
        const xs = ring().map(p => p[0]);
        expect(Math.max(...xs)).toBeGreaterThan(0.4);
        expect(Math.min(...xs)).toBeLessThan(-0.4);
    });

    it('reaches AM1 along the axis and AM across it', () => {
        // The factor-of-two check. `length` is the full major axis, so the semi-major is
        // half of it; `radius` is already the semi-minor.
        const r = ring();
        const centre: Position = [0, 0];
        const far = Math.max(...r.map(p => metres(centre, p)));
        const near = Math.min(...r.map(p => metres(centre, p)));
        expect(far / 1000).toBeCloseTo(60, 0);
        expect(near / 1000).toBeCloseTo(20, 0);
    });

    it('turns with AN', () => {
        // The plate's AN is counter-clockwise from east and the stored `rotation` is the
        // same convention, so +90 stands the ellipse on end: the long axis runs north.
        const upright = ring({...opts, rotation: 90});
        const northmost = upright.reduce((best, p) => (p[1] > best[1] ? p : best), upright[0]);
        expect(metres([0, 0], northmost) / 1000).toBeCloseTo(60, 0);
        expect(Math.abs(northmost[0])).toBeLessThan(0.01);
    });

    it('publishes the rectangular target layout: major grip, minor grip, centre', () => {
        // The holder splits `[length, width, centre]` by position, so this ordering is a
        // contract rather than a convenience. @see RectangularTarget.generateHandles
        const handles = (ellipse.generateHandles(at(0, 0), opts) as Feature<MultiPoint>).geometry.coordinates;
        expect(handles).toHaveLength(3);
        expect(metres([0, 0], handles[0]) / 1000).toBeCloseTo(60, 0);
        expect(metres([0, 0], handles[1]) / 1000).toBeCloseTo(20, 0);
        expect(handles[2]).toEqual([0, 0]);
    });

    it('anchors its label at the centre', () => {
        expect((ellipse.generateLabels(at(3, 4), opts) as Feature<Point>).geometry.coordinates).toEqual([3, 4]);
    });
});

describe('the radar search doctrine sector', () => {
    const rsd = new RadarSearchDoctrine();

    /**
     * The base as 200700 describes it: **one anchor point**, the radar.
     *
     * *"This symbol requires one anchor point that defines the axis of angular rotation."*
     * Everything that gives the sector its size and aim is a number beside it, not a place:
     * a search axis azimuth, a start range, a stop range and a stop relative bearing.
     */
    const radar: Feature<Point> = {type: 'Feature', geometry: {type: 'Point', coordinates: [0, 0]}, properties: {}};

    /** Ranges in metres, the unit both range-fan plates state. @see RangeFanBand.range */
    const bands = (ranges: number[], extra: object = {}) =>
        ({bands: ranges.map(range => ({range})), centerAzimuthDeg: 90, ...extra});

    /**
     * The sector's ring, out of the collection the generator emits.
     *
     * It emits **two** members — the annulus and field `T`'s anchor — because the paint
     * places `T` from the anchor rather than reconstructing it from the ring.
     * @see RadarSearchDoctrine.generateGraphics
     */
    const ringOf = (opts: object) => {
        const members = (rsd.generateGraphics(radar, opts as never) as Feature<GeometryCollection>).geometry.geometries;
        const ring = members.find(m => m.type === 'Polygon') as Polygon;
        return ring.coordinates[0] as Position[];
    };
    const radiiKm = (ring: Position[]) => ring.map(p => metres([0, 0], p) / 1000);

    it('takes both ranges off the typed bands', () => {
        // The near band is the start range and the far one the stop range — the two the
        // plate names individually. @see fixedBands
        const r = radiiKm(ringOf(bands([20_000, 60_000])));
        expect(Math.min(...r)).toBeCloseTo(20, 1);
        expect(Math.max(...r)).toBeCloseTo(60, 1);
    });

    it('seeds the stop range from the reach the draw measured', () => {
        // Before any band is typed, `size` is the only range there is: the distance the
        // operator dragged out from the radar.
        const r = radiiKm(ringOf({size: 40_000}));
        expect(Math.max(...r)).toBeCloseTo(40, 1);
    });

    it('lets a typed band override the drawn reach', () => {
        const r = radiiKm(ringOf(bands([10_000, 25_000], {size: 90_000})));
        expect(Math.max(...r)).toBeCloseTo(25, 1);
    });

    it('aims the sector along the search axis azimuth', () => {
        // Due east: every point of the ring sits at a positive longitude.
        const ring = ringOf(bands([20_000, 60_000], {centerAzimuthDeg: 90}));
        expect(ring.every(p => p[0] > -1e-6)).toBe(true);
    });

    it('opens an equal angle either side of the search axis', () => {
        /*
         * "The stop relative bearing is an equal angle either side of the search axis" —
         * so the axis bisects the opening, and the two edges are derived from it rather
         * than stored, which is what stops them drifting apart from the aim.
         */
        const opts = bands([20_000, 60_000], {centerAzimuthDeg: 90});
        const ring = ringOf(opts);
        const outer = ring.filter(p => metres([0, 0], p) > 40_000);
        const bearings = outer.map(p => turf.bearing(turf.point([0, 0]), turf.point(p)));
        const left = Math.min(...bearings);
        const right = Math.max(...bearings);
        expect((left + right) / 2).toBeCloseTo(90, 4);
    });

    it('draws a bare arc until a range is known, not a closed sector', () => {
        /*
         * Between the drop and the first range there is one distance and no decision about
         * which of the plate's two it is. Closing a sector around it would put a second arc
         * on the map at a range nobody gave. (User's call, 2026-09-04.)
         */
        const members = (rsd.generateGraphics(radar, {} as never) as Feature<GeometryCollection>).geometry.geometries;
        expect(members.some(m => m.type === 'Polygon')).toBe(false);
        expect(members.some(m => m.type === 'LineString')).toBe(true);
    });

    it('anchors field T between the two arcs, on the axis', () => {
        // "Field T should be positioned in the centre of the search area aligned with the
        // search axis" — so out in front of the radar, not on it.
        const opts = bands([20_000, 60_000], {centerAzimuthDeg: 90});
        const at = (rsd.generateLabels(radar, opts as never) as Feature<Point>).geometry.coordinates;
        const reach = metres([0, 0], at);
        expect(reach).toBeGreaterThan(20_000);
        expect(reach).toBeLessThan(60_000);
        expect(turf.bearing(turf.point([0, 0]), turf.point(at))).toBeCloseTo(90, 3);
    });

    it('publishes the radar and one grip per arc, all on the axis', () => {
        /*
         * `[centre, start, stop]` is the range-fan contract: `publishHandles` demotes the
         * centre to the inert dot and leaves one draggable rim per band, in ascending band
         * order, which is what `setBandRange` indexes into. @see RangeFanGraphicBase
         */
        const opts = bands([20_000, 60_000], {centerAzimuthDeg: 90});
        const grips = (rsd.generateHandles(radar, opts as never) as Feature<MultiPoint>).geometry.coordinates;
        expect(grips).toHaveLength(3);
        expect(grips[0]).toEqual([0, 0]);
        expect(metres([0, 0], grips[1])).toBeCloseTo(20_000, -2);
        expect(metres([0, 0], grips[2])).toBeCloseTo(60_000, -2);
        for (const g of grips.slice(1)) {
            expect(turf.bearing(turf.point([0, 0]), turf.point(g))).toBeCloseTo(90, 3);
        }
    });

    it('reads the near band as the start range whichever order the two were typed', () => {
        /*
         * `resolveBands` sorts on every render, so which of the two is the start range is
         * decided by distance rather than by the row it was typed into — a near arc outside
         * the far one is not a shape, and this is what stops one being described.
         */
        const typedFarFirst = radiiKm(ringOf(bands([90_000, 30_000])));
        const typedNearFirst = radiiKm(ringOf(bands([30_000, 90_000])));
        expect(Math.min(...typedFarFirst)).toBeCloseTo(30, 1);
        expect(Math.max(...typedFarFirst)).toBeCloseTo(90, 1);
        expect(typedFarFirst).toEqual(typedNearFirst);
    });
});
