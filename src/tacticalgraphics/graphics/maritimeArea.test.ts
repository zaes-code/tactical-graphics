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
import type {Feature, MultiPoint, Point, Polygon, Position} from 'geojson';
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
    const centre = at(0, 0);
    const bands = (ranges: number[]) => ({bands: ranges.map(range => ({range})), centerAzimuthDeg: 90});
    const ring = (opts: object) => (rsd.generateGraphics(centre, opts as never) as Feature<Polygon>).geometry.coordinates[0];

    it('draws an annulus between the innermost and outermost bands', () => {
        const r = ring(bands([30_000, 80_000]));
        const radii = r.map(p => metres([0, 0], p) / 1000);
        expect(Math.max(...radii)).toBeCloseTo(80, 0);
        expect(Math.min(...radii)).toBeCloseTo(30, 0);
    });

    it('gives a single band a start range rather than a wedge apex on the radar', () => {
        /*
         * A freshly drawn symbol has one ring. Zero would put the apex on the anchor point
         * and draw a pie slice, which is a different picture from every plate this symbol
         * has. @see RSD_DEFAULT_START_SHARE — a default, and an explicit band overrides it.
         */
        const radii = ring(bands([80_000])).map(p => metres([0, 0], p) / 1000);
        expect(Math.min(...radii)).toBeGreaterThan(1);
        expect(Math.min(...radii)).toBeLessThan(Math.max(...radii));
    });

    it('opens an equal angle either side of the search axis', () => {
        // "The stop relative bearing is an equal angle either side of the search axis."
        const r = ring({bands: [{range: 30_000}, {range: 80_000, leftAzimuthDeg: 60, rightAzimuthDeg: 120}], centerAzimuthDeg: 90});
        const bearings = r
            .filter(p => metres([0, 0], p) > 70_000)
            .map(p => (turf.bearing(turf.point([0, 0]), turf.point(p)) + 360) % 360);
        expect(Math.min(...bearings)).toBeCloseTo(60, 0);
        expect(Math.max(...bearings)).toBeCloseTo(120, 0);
    });

    it('anchors field T between the two arcs, on the axis', () => {
        const label = (rsd.generateLabels(centre, bands([30_000, 80_000]) as never) as Feature<Point>).geometry.coordinates;
        expect(metres([0, 0], label) / 1000).toBeCloseTo(55, 0);
        expect(turf.bearing(turf.point([0, 0]), turf.point(label))).toBeCloseTo(90, 0);
    });

    it('publishes one grip on the stop arc plus the centre', () => {
        const handles = (rsd.generateHandles(centre, bands([30_000, 80_000]) as never) as Feature<MultiPoint>).geometry.coordinates;
        expect(handles).toHaveLength(2);
        expect(metres([0, 0], handles[0]) / 1000).toBeCloseTo(80, 0);
        expect(handles[1]).toEqual([0, 0]);
    });
});
