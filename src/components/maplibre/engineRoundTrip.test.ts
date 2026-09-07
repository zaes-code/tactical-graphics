/**
 * # A graphic's anchor points survive a trip through the other engine, both ways
 *
 * The base is the only thing persisted — "a saved graphic carries one object:
 * `properties.tacticalGraphic`" — and its coordinates are the anchor points APP-06 numbers.
 * A consumer reading our GeoJSON reads exactly those. So if a save on one engine and a
 * restore on the other move them, the symbol is saying something nobody drew, and it says it
 * silently: both engines paint a plausible picture either side of the change.
 *
 * The existing coverage stops short of this. `fullRoundTrip` takes every graphic through
 * OpenLayers' own save and restore; `drawnSizeParity` pins six names' sizes under a MapLibre
 * rebuild; the four parity suites compare one derived fact each. **Nothing took a base out of
 * one engine and into the other**, which is the trip the engine toggle makes and the trip a
 * consumer makes when two tools share a file.
 *
 * What is asserted here is deliberately narrow and is the part that carries doctrine: the
 * **coordinates**. Amplifier drift is a different question, already covered per engine, and
 * the two engines legitimately file different optional fields — MapLibre stamps a
 * `decorationSize` for a bridge where OpenLayers stamps nothing. A suite that compared whole
 * property bags would fail on that and teach everyone to ignore it.
 */
import {
    baseGeometryFor,
    baseVertexCount,
    listTacticalGraphicNames,
    normalizeDrawnBase,
    synthesizedBase,
    TacticalGraphicName,
    type TacticalGraphicProperties,
} from '@zaes/tactical-graphics';
import type {Feature as GeoJSONFeature, Position} from 'geojson';
import {buildTacticalGraphic} from './maplibreAdapter';

/** Ground metres per pixel at the drawing zoom, and again four times out for the return leg. */
const RES = 1200;
const RES_OUT = RES * 4;

/** A sample cell's worth of ground, centred somewhere with a real 1/cos(latitude). */
const CENTRE: Position = [12, 41];
const HALF = 0.4;

/**
 * The base a graphic of this kind is drawn from, in lon/lat.
 *
 * Built the way both sample sheets build one — `synthesizedBase` where a graphic states its
 * own layout, a plain run or ring otherwise — and then put through `normalizeDrawnBase`,
 * which is the door every draw and every restore comes in by. That makes the fixture a base
 * the library agrees with rather than one merely plausible, which is the distinction that
 * has produced most of this repository's sweep defects.
 */
function baseFor(name: TacticalGraphicName): GeoJSONFeature['geometry'] | undefined {
    const kind = baseGeometryFor(name);
    const [cx, cy] = CENTRE;
    if (kind === 'Point') return {type: 'Point', coordinates: [cx, cy]};
    if (kind === 'Polygon') {
        const ring: Position[] = [
            [cx - HALF, cy - HALF * 0.7],
            [cx + HALF, cy - HALF * 0.7],
            [cx + HALF, cy + HALF * 0.7],
            [cx - HALF, cy + HALF * 0.7],
        ];
        return {type: 'Polygon', coordinates: [[...ring, ring[0]]]};
    }
    if (kind !== 'LineString') return undefined;

    // **As many points as its contract states**, not a fixed three. A two-point graphic handed
    // three keeps all three — nothing reduces a free run — and the fixture would then be
    // asserting that the trip preserves a base the graphic would never have been given.
    const want = baseVertexCount(name) ?? 3;
    const stated = synthesizedBase(name, CENTRE, HALF, want);
    const run: Position[] = stated ?? (want === 2
        ? [[cx - HALF, cy], [cx + HALF, cy]]
        : Array.from({length: want}, (_, i) => {
            const t = want === 1 ? 0.5 : i / (want - 1);
            return [cx - HALF + 2 * HALF * t, cy + HALF * 0.25 * Math.sin(Math.PI * t)] as Position;
        }));
    return {type: 'LineString', coordinates: normalizeDrawnBase(name, run, RES) as Position[]};
}

/** Every coordinate of a base geometry, flattened, so two bases can be compared as points. */
function points(geometry: GeoJSONFeature['geometry'] | undefined): Position[] {
    if (!geometry) return [];
    if (geometry.type === 'Point') return [geometry.coordinates as Position];
    if (geometry.type === 'LineString') return geometry.coordinates as Position[];
    if (geometry.type === 'Polygon') return (geometry.coordinates[0] ?? []) as Position[];
    if (geometry.type === 'MultiLineString') return (geometry.coordinates.flat() as Position[]);
    return [];
}

/**
 * The worst distance between two bases, **in degrees**, or `Infinity` if they disagree about
 * how many points there are.
 *
 * Degrees rather than metres on purpose: this compares two encodings of the *same* stored
 * numbers, so the question is whether the file changed, not how far a symbol moved on the
 * ground. A geodesic distance here would hide a longitude drift near the poles behind
 * `cos(latitude)`.
 */
function drift(a: GeoJSONFeature['geometry'] | undefined, b: GeoJSONFeature['geometry'] | undefined): number {
    const [pa, pb] = [points(a), points(b)];
    if (pa.length === 0 || pa.length !== pb.length) return Infinity;
    return Math.max(...pa.map((p, i) => Math.max(Math.abs(p[0] - pb[i][0]), Math.abs(p[1] - pb[i][1]))));
}

/** Below a millidegree — about 100 m — is floating point, not a moved anchor point. */
const SETTLED = 1e-6;

const NAMES = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(n => baseFor(n) !== undefined);

/**
 * What a newly drawn graphic arrives with, which is not nothing.
 *
 * "The generators need both, and neither has a safe absent value: `rotation` reaches
 * `Math.cos` and comes back NaN, and a point-anchored graphic with no radius has no size at
 * all." The draw path supplies them; a fixture that does not is testing a state the engine
 * never produces, and the build correctly answers `undefined` for it.
 * @see MapLibreInteractions.sizeFromDraw
 */
const OPENING: Omit<TacticalGraphicProperties, 'name'> = {radius: 40_000, rotation: 0};

const build = (name: TacticalGraphicName, geometry: GeoJSONFeature['geometry'], properties: Omit<TacticalGraphicProperties, 'name'>, res: number) =>
    buildTacticalGraphic(name, geometry, properties, res);

/**
 * The base the engine itself settles on, from a hand-made one.
 *
 * **Not the fixture.** A build canonicalises: 151204 contain reduces a three-point sketch onto
 * the two ends of its semicircle's opening, and both turns re-derive their anchors from the
 * frame those points describe. That is the graphic's contract doing its job, not a round-trip
 * failure, and comparing the trip against a hand-made base reports it as one — which is what
 * this suite did first time out, on exactly those three names.
 *
 * So the settling happens once, here, and everything below asks the question worth asking:
 * whether the trip moves a base the engine has already agreed with.
 */
function settled(name: TacticalGraphicName) {
    return buildTacticalGraphic(name, baseFor(name)!, OPENING, RES);
}

describe(`the base survives a cross-engine round trip (${NAMES.length} names)`, () => {
    it('has the whole registry to check, not a hand-picked few', () => {
        // The filter above drops nothing today; if a new base kind appears it will, and this
        // is what says so rather than the count quietly falling.
        expect(NAMES.length).toBe(listTacticalGraphicNames().length);
        expect(NAMES.length).toBeGreaterThan(300);
    });

    it.each(NAMES.map(n => [String(n), n] as const))('%s: settles on the first build and never again', (_label, name) => {
        const first = settled(name);
        expect(first).toBeDefined();

        // **The build is the door.** Everything MapLibre paints comes through it — drawn,
        // restored, imported, swept — so a base that changes every time it passes is a symbol
        // that walks across a save, a zoom change, or an engine switch. Once is a contract
        // being applied; twice is a defect.
        const again = build(name, first!.base.geometry, first!.properties, RES);
        expect(again).toBeDefined();
        expect(drift(first!.base.geometry, again!.base.geometry)).toBeLessThan(SETTLED);
    });

    it.each(NAMES.map(n => [String(n), n] as const))('%s: the anchor points are unmoved by the trip', (_label, name) => {
        const start = settled(name)!.base.geometry;

        // Out: what a save on this engine hands the other one.
        const out = build(name, start, OPENING, RES);
        expect(out).toBeDefined();
        expect(drift(start, out!.base.geometry)).toBeLessThan(SETTLED);

        // Back: the other engine restores at a different zoom — the normal case, since a
        // snapshot carries no viewport — and hands it back again. A screen-derived size may
        // legitimately differ across that; a coordinate may not.
        const back = build(name, out!.base.geometry, out!.properties, RES_OUT);
        expect(back).toBeDefined();
        expect(drift(start, back!.base.geometry)).toBeLessThan(SETTLED);

        // And once more at the original zoom, so a drift that only appears on the return leg
        // cannot cancel itself out.
        const home = build(name, back!.base.geometry, back!.properties, RES);
        expect(home).toBeDefined();
        expect(drift(start, home!.base.geometry)).toBeLessThan(SETTLED);
    });

    it.each(NAMES.map(n => [String(n), n] as const))('%s: holds the number of points its contract states', (_label, name) => {
        /*
         * **The count is the part a consumer reads as doctrine.** `baseVertexCount` is the
         * library's statement of how many anchor points a graphic's plate numbers, and the
         * base that comes out of a build is what a consumer's file contains — so a trip that
         * quietly added or dropped one would be the symbol saying something else. Graphics
         * with no fixed count are free-form paths and rings, and state nothing to check.
         */
        const wanted = baseVertexCount(name);
        const start = settled(name)!.base.geometry;
        if (wanted !== undefined) expect(points(start)).toHaveLength(wanted);

        const round = build(name, start, OPENING, RES)!;
        expect(points(round.base.geometry)).toHaveLength(points(start).length);
        expect(round.base.geometry.type).toBe(start.type);
    });
});
