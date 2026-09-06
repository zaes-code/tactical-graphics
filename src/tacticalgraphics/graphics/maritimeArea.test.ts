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
import {EllipticalArea, RadarSearchDoctrine, radarSearchFromClicks, radarSectorOpening} from './MaritimeArea';
import {handleRole} from '../core/handles';
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

    it('aims the axis off `rotation` as an azimuth, not as a raw number', () => {
        /*
         * **The regression a user saw before any test did.** `rotation` is degrees
         * counter-clockwise from east; an azimuth is clockwise from north. The two edges went
         * through `rotationToAzimuth` and the axis did not, so the wedge opened around one
         * bearing while the axis, the three grips and field `T` were laid at the raw number —
         * `90 - 2 * rotation` away. "The line is not on the center of the angle."
         * (User's report, 2026-09-05.)
         *
         * Asserted through `rotation` on purpose: every other test here states
         * `centerAzimuthDeg`, which is the branch that was already right, and that is why a
         * suite of them all passed against it. @see rotationToAzimuth
         */
        // `centerAzimuthDeg` is cleared deliberately: the shared fixture pins it to 90, and
        // it is the branch that was already correct. Leaving it in tests nothing.
        const opts = bands([20_000, 60_000], {centerAzimuthDeg: undefined, rotation: 30});
        const grips = (rsd.generateHandles(radar, opts as never) as Feature<MultiPoint>).geometry.coordinates;
        const axis = turf.bearing(turf.point([0, 0]), turf.point(grips[2]));
        expect(axis).toBeCloseTo(60, 3); // 90 - 30

        // ...and the opening is still centred on it, which is the half the user could see.
        const ring = ringOf(opts);
        const outer = ring.filter(p => metres([0, 0], p) > 40_000);
        const bearings = outer.map(p => turf.bearing(turf.point([0, 0]), turf.point(p)));
        expect((Math.min(...bearings) + Math.max(...bearings)) / 2).toBeCloseTo(axis, 3);
    });

    it('draws a bare arc while exactly one of the two ranges is known', () => {
        /*
         * Between the second click and the third there is one distance and no decision about
         * which of the plate's two it is. Closing a sector around it would put a second arc
         * on the map at a range nobody gave. (User's call, 2026-09-04; restored with the
         * three-click draw 2026-09-05.)
         *
         * **The test is one band, not "no options at all".** It used to be the latter, which
         * no drawn symbol ever is — the holder always publishes a `size` — so the assertion
         * passed against a branch that had become unreachable. @see radarSearchFromClicks
         */
        const members = (rsd.generateGraphics(radar, bands([60_000]) as never) as Feature<GeometryCollection>)
            .geometry.geometries;
        expect(members.some(m => m.type === 'Polygon')).toBe(false);
        expect(members.some(m => m.type === 'LineString')).toBe(true);
    });

    it('closes the sector once both ranges are known, and for a symbol that states neither', () => {
        // Two bands is the finished symbol. No bands at all is a sample, a thumbnail or a
        // host drop — it has stated nothing, so the plate's own default start share stands
        // and the symbol is drawn whole rather than half-drawn.
        for (const opts of [bands([20_000, 60_000]), {size: 60_000}]) {
            const members = (rsd.generateGraphics(radar, opts as never) as Feature<GeometryCollection>)
                .geometry.geometries;
            expect(members.some(m => m.type === 'Polygon')).toBe(true);
        }
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

    it('publishes one grip per number the plate names: the two ranges and the opening', () => {
        /*
         * `[centre, start, stop, opening]`. `publishHandles` demotes the centre to the inert
         * dot — the anchor point is not a size — and leaves three draggable grips, which is
         * what `setBandRange` indexes into. The two ranges ride the search axis; the fourth
         * sits on the outer arc's right edge, where the *stop relative bearing* is.
         * @see RangeFanGraphicBase.setRadarHalfAngle
         */
        const opts = bands([20_000, 60_000], {centerAzimuthDeg: 90});
        const grips = (rsd.generateHandles(radar, opts as never) as Feature<MultiPoint>).geometry.coordinates;
        expect(grips).toHaveLength(4);
        expect(grips[0]).toEqual([0, 0]);
        expect(metres([0, 0], grips[1])).toBeCloseTo(20_000, -2);
        expect(metres([0, 0], grips[2])).toBeCloseTo(60_000, -2);
        for (const g of grips.slice(1, 3)) {
            expect(turf.bearing(turf.point([0, 0]), turf.point(g))).toBeCloseTo(90, 3);
        }
        // The opening grip: out at the stop range, one half-angle off the axis.
        expect(metres([0, 0], grips[3])).toBeCloseTo(60_000, -2);
        expect(turf.bearing(turf.point([0, 0]), turf.point(grips[3]))).toBeCloseTo(135, 3);
    });

    it('offers no grip for a range nobody has given yet', () => {
        // Mid-draw, one band: a second rim would be a grip on an undecided number, and the
        // renderers index a rim drag into `resolveBands`, so it would write past the list.
        const grips = (rsd.generateHandles(radar, bands([60_000]) as never) as Feature<MultiPoint>)
            .geometry.coordinates;
        expect(grips).toHaveLength(2);
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

describe("200700 is described by its own four numbers", () => {
    const radar: Feature<Point> = {type: 'Feature', properties: {}, geometry: {type: 'Point', coordinates: [0, 0]}};
    const rsd = new RadarSearchDoctrine();
    const metresBetween = (a: Position, b: Position) =>
        turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

    /** `[centre, startArc, stopArc, opening]` — the grips state the four back. */
    const grips = (opts: object) =>
        (rsd.generateHandles(radar, opts as never) as Feature<MultiPoint>).geometry.coordinates;

    it('reads the search axis, both ranges and the opening as the plate names them', () => {
        /*
         * **The shape a 200700 is saved in.** It rode the weapon fans' `rangeFan` bands for a
         * day, with the axis smuggled in as `rotation` and the opening as a pair of absolute
         * band azimuths — so a consumer reading the GeoJSON found a different symbol's
         * amplifiers and could not find two of the four values at all. (User's report,
         * 2026-09-05.) @see TacticalGraphicProperties.searchAxisAzimuthDeg
         */
        const points = grips({
            searchAxisAzimuthDeg: 90,
            startRange: 20_000,
            stopRange: 60_000,
            stopRelativeBearingDeg: 30,
        });
        expect(points[0]).toEqual([0, 0]);
        expect(metresBetween([0, 0], points[1])).toBeCloseTo(20_000, -2);
        expect(metresBetween([0, 0], points[2])).toBeCloseTo(60_000, -2);
        // Both range grips ride the stated axis...
        for (const g of points.slice(1, 3)) {
            expect(turf.bearing(turf.point([0, 0]), turf.point(g))).toBeCloseTo(90, 3);
        }
        // ...and the opening grip sits one stated relative bearing off it.
        expect(turf.bearing(turf.point([0, 0]), turf.point(points[3]))).toBeCloseTo(120, 3);
    });

    it('still draws a graphic saved in the old range-fan shape', () => {
        /*
         * A snapshot written before the change describes itself as a two-band fan: the ranges
         * as bands, the axis as `rotation` (degrees counter-clockwise from east) and the
         * opening as a pair of absolute band azimuths. Those files have to keep rendering, so
         * the four values are read *first* and this is the fallback, not a parallel path.
         */
        const legacy = grips({bands: [{range: 20_000}, {range: 60_000}], rotation: 0});
        expect(metresBetween([0, 0], legacy[1])).toBeCloseTo(20_000, -2);
        expect(metresBetween([0, 0], legacy[2])).toBeCloseTo(60_000, -2);
        // `rotation` 0 is due east once converted, which is the conversion the fallback owes.
        expect(turf.bearing(turf.point([0, 0]), turf.point(legacy[2]))).toBeCloseTo(90, 3);
    });

    it('prefers a stated value over the legacy one describing the same thing', () => {
        // Both shapes present is what a graphic looks like mid-migration; the named field wins,
        // or the migration would depend on which of two descriptions happened to be read.
        const both = grips({
            bands: [{range: 20_000}, {range: 60_000}],
            rotation: 0,
            searchAxisAzimuthDeg: 180,
            startRange: 5_000,
            stopRange: 90_000,
        });
        expect(metresBetween([0, 0], both[1])).toBeCloseTo(5_000, -2);
        expect(metresBetween([0, 0], both[2])).toBeCloseTo(90_000, -2);
        expect(turf.bearing(turf.point([0, 0]), turf.point(both[2]))).toBeCloseTo(180, 3);
    });

    it('holds the arc phase on a stop range with no start range yet', () => {
        // Between the second click and the third only one range is stated. Expressed in the
        // new shape that is `stopRange` present and `startRange` absent.
        const members = (rsd.generateGraphics(radar, {stopRange: 60_000, searchAxisAzimuthDeg: 90} as never) as
            Feature<GeometryCollection>).geometry.geometries;
        expect(members.some(m => m.type === 'Polygon')).toBe(false);
        expect(members.some(m => m.type === 'LineString')).toBe(true);
    });
});

describe("200700's three clicks and its opening", () => {
    const radar: Feature<Point> = {type: 'Feature', properties: {}, geometry: {type: 'Point', coordinates: [0, 0]}};
    const rsd = new RadarSearchDoctrine();
    const east = (metres: number, bearing = 90): Position =>
        turf.destination(turf.point([0, 0]), metres, bearing, {units: 'meters'}).geometry.coordinates as Position;

    it('states the axis and one range from two clicks, and holds the second back', () => {
        // Click 2 settles where the symbol looks and how far the first arc is — not which
        // of the plate's two ranges it is. That is click 3's job. @see radarSearchFromClicks
        const frame = radarSearchFromClicks([[0, 0], east(40_000)]);
        expect(frame?.centerAzimuthDeg).toBeCloseTo(90, 3);
        expect(frame?.ranges).toHaveLength(1);
        expect(frame!.ranges[0]).toBeCloseTo(40_000, -2);
    });

    it('takes only the distance from the third click, never its bearing', () => {
        /*
         * "The 200700 sector's two arcs are concentric" — the axis was settled by click 2, so
         * a third click off it states a range and nothing else. Same discipline as pursuit's.
         */
        const onAxis = radarSearchFromClicks([[0, 0], east(40_000), east(80_000)]);
        const offAxis = radarSearchFromClicks([[0, 0], east(40_000), east(80_000, 20)]);
        expect(offAxis?.centerAzimuthDeg).toBeCloseTo(onAxis!.centerAzimuthDeg, 3);
        expect(offAxis!.ranges[1]).toBeCloseTo(onAxis!.ranges[1], -2);
    });

    it('sorts the two ranges, so the stop arc may be placed first', () => {
        const frame = radarSearchFromClicks([[0, 0], east(80_000), east(30_000)]);
        expect(frame!.ranges[0]).toBeCloseTo(30_000, -2);
        expect(frame!.ranges[1]).toBeCloseTo(80_000, -2);
    });

    it('round-trips the opening grip the generator drew', () => {
        /*
         * **The reading has to be geodesic, because the placing is.** `generateHandles` walks
         * the grip out with `turf.destination`; a planar `atan2` reading it back answers
         * degrees out on a large sector away from the equator, so the wedge would jump the
         * moment it was grabbed. MapLibre's editor is planar throughout, which is why this
         * lives in the library and both engines call it. @see radarSectorOpening
         */
        const opts = {bands: [{range: 20_000}, {range: 60_000}], centerAzimuthDeg: 40};
        const grips = (rsd.generateHandles(radar, opts as never) as Feature<MultiPoint>).geometry.coordinates;
        const edges = radarSectorOpening([0, 0], 40, grips[3]);
        expect(edges).toBeDefined();
        // Untouched, the wedge opens 45 degrees either side, so the grip sits at 85.
        expect(edges!.rightAzimuthDeg).toBeCloseTo(85, 2);
        expect(edges!.leftAzimuthDeg).toBeCloseTo(355, 2);
    });

    it('refuses an opening that would close or invert the wedge', () => {
        // Dragged onto the axis there is no wedge left, and through it the arc takes the
        // long way round the circle — with no arc under the cursor to drag back.
        expect(radarSectorOpening([0, 0], 40, turf.destination(turf.point([0, 0]), 50_000, 40, {units: 'meters'})
            .geometry.coordinates as Position)).toBeUndefined();
    });

    it('routes each grip to what it edits, which is what MapLibre dispatches on', () => {
        /*
         * **The assertion that would have caught it.** 200700 is not in `RANGE_FANS`, so it
         * had no contract at all and every grip answered the default `shape` — a role
         * MapLibre's edit switch drops on the floor. The symbol drew there and then could not
         * be edited, while OpenLayers, which dispatches its rims through the holder instead,
         * worked. (User's report, 2026-09-05.)
         */
        expect([0, 1, 2, 3].map(i => handleRole(TacticalGraphicName.RadarSearchDoctrine, i)))
            .toEqual(['band', 'band', 'band', 'opening']);
    });
});
