/**
 * APP-06 344300 defeat — four solid arrows converging on a `D`.
 *
 * **Every shape assertion is made in the arrow's own frame**, not in map coordinates: the
 * question is whether the shaft is parallel-sided and the head is the width the plate
 * measures, and both of those are statements about distance along the axis and distance
 * across it. Asserting the corner coordinates instead would pin the fixture's latitude and
 * say nothing about the shape. @see ai/app-6.md, "Assert bolt geometry in the arrow's own
 * frame".
 *
 * The numbers come from the Template at 600 dpi — the ink was segmented into its four
 * arrows and one profiled perpendicular to its axis. @see Defeat for the measurement.
 */
import {renderTacticalGraphic} from '../core/render';
import {defeatPaint} from './missionTaskPaints';
import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicHostility, TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig, configureTacticalGraphics} from '../core/config';
import type {Feature, GeometryCollection, Point, Polygon, Position} from 'geojson';

const ORIGIN: Position = [0, 0];
const SIZE = 20_000;
/** The four diagonals, in the order the generator emits them. @see Defeat */
const ARROW_ANGLES = [45, 135, 225, 315];

const context = (): PaintContext => ({
    resolution: 1,
    measureText: (text: string) => text.length * 8,
});

/**
 * Through the public API, not by constructing the generator.
 *
 * Every other suite in this repository does the same, and there is a reason beyond taste:
 * `core/symbology` imports `core/render`, which loads the registry, which imports every
 * generator — so a test that reaches for `new Defeat()` first enters that cycle from the
 * wrong side and the registry registers `undefined`. It also means these assertions cover
 * `TacticalGraphicsBase.generate`, which is what actually runs.
 */
const base = (): Feature<Point> => ({
    type: 'Feature',
    properties: {tacticalGraphic: {name: TacticalGraphicName.Defeat, radius: SIZE, rotation: 0}},
    geometry: {type: 'Point', coordinates: ORIGIN},
});

const build = (): Feature<GeometryCollection> =>
    renderTacticalGraphic(base()).graphic as Feature<GeometryCollection>;

/** The rings, as planar positions. The fixture sits on the equator so degrees are linear. */
const rings = (): Position[][] =>
    (build().geometry.geometries as Polygon[]).map(polygon => polygon.coordinates[0]);

/**
 * A ring's vertices resolved into `(along, across)` in the arrow's own frame, where `along`
 * runs outward from the centre and `across` is to its left.
 *
 * **The unit is whatever the generator emits and every assertion is a ratio**, so this says
 * nothing about degrees against metres. It went the other way first -- comparing against
 * `SIZE * Math.SQRT2` in metres, where the output is EPSG:4326 degrees -- and every
 * proportion came out four orders of magnitude wrong while the symbol was correct.
 */
const frame = (ring: Position[], angleDeg: number) => {
    const a = (angleDeg * Math.PI) / 180;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    return ring.slice(0, -1).map(([x, y]) => ({
        along: x * ux + y * uy,
        across: -x * uy + y * ux,
    }));
};

describe('APP-06 344300 defeat — the geometry', () => {
    it('draws four arrows and nothing else', () => {
        const collection = build();
        expect(collection.geometry.type).toBe('GeometryCollection');
        expect(collection.geometry.geometries).toHaveLength(4);
        for (const geometry of collection.geometry.geometries) expect(geometry.type).toBe('Polygon');
    });

    it('closes every ring on seven distinct corners', () => {
        // Tail pair, head base pair, head corner pair, tip. A ring that did not close would
        // render as an open path under a fill rule that guesses.
        for (const ring of rings()) {
            expect(ring).toHaveLength(8);
            expect(ring[0]).toEqual(ring[ring.length - 1]);
        }
    });

    it('puts one arrow in each quadrant, on the diagonals', () => {
        // Not on the cardinals: turned 45 degrees this is a picture the standard does not
        // draw, which is why rotation is refused. @see RESIZE_ONLY_SYMBOLS
        const tips = rings().map(ring => {
            // The tip is the vertex nearest the centre.
            const sorted = [...ring].sort((p, q) => Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1]));
            return sorted[0];
        });
        const bearings = tips.map(([x, y]) => Math.round((Math.atan2(y, x) * 180) / Math.PI));
        expect(bearings.slice().sort((a, b) => a - b)).toEqual([-135, -45, 45, 135]);
    });

    /** Every measurement of one arrow, as a fraction of that arrow's own reach. */
    const proportions = (i: number, angleDeg: number) => {
        const points = frame(rings()[i], angleDeg);
        const reach = Math.max(...points.map(p => p.along));
        const across = points.map(p => p.across);
        // The shaft's half-width is the smallest non-zero |across| -- the tip is the only
        // vertex sitting on the axis.
        const shaftHalf = Math.min(...across.map(Math.abs).filter(v => v > reach * 1e-6));
        return {
            reach,
            points,
            tip: Math.min(...points.map(p => p.along)) / reach,
            headHalf: Math.max(...across) / reach,
            shaftHalf: shaftHalf / reach,
            headBase: Math.min(...points.filter(p => Math.abs(p.across) > shaftHalf * 1.5).map(p => p.along)) / reach,
        };
    };

    it('holds the plate proportions: 0.192 tip, 0.222 head, 0.12 half-width, 0.048 shaft', () => {
        for (const [i, angleDeg] of ARROW_ANGLES.map((a, n) => [n, a] as const)) {
            const p = proportions(i, angleDeg);
            expect(p.tip).toBeCloseTo(0.192, 3);
            expect(p.headHalf).toBeCloseTo(0.12, 3);
            expect(p.shaftHalf).toBeCloseTo(0.048, 3);
            // Tip to the head's base, where the width steps down to the shaft.
            expect(p.headBase - p.tip).toBeCloseTo(0.222, 3);
        }
    });

    it('builds all four arrows at the same size', () => {
        const reaches = ARROW_ANGLES.map((angleDeg, i) => proportions(i, angleDeg).reach);
        for (const reach of reaches) expect(reach / reaches[0]).toBeCloseTo(1, 6);
    });

    it('keeps the shaft parallel-sided rather than tapered', () => {
        // What this establishes: the four shaft corners sit at the width they were asked
        // for, so the arrow is a rectangle and not a wedge. A wrong `across` sign, a head
        // half-width leaking into the shaft, or an arrow built from a fraction of the wrong
        // quantity all show up here.
        //
        // What it does NOT establish, and the comment here claimed to until it was
        // control-run: it does not choose between the polar construction and stepping along
        // the axis then sideways. Both were built and measured — the two agree to three
        // parts in a million at 0, 45, 60 and 75 degrees north — so this test passes
        // against either. @see Defeat, which no longer argues from a defect it does not have
        for (const [i, angleDeg] of ARROW_ANGLES.map((a, n) => [n, a] as const)) {
            const p = proportions(i, angleDeg);
            const shaftHalf = p.shaftHalf * p.reach;
            const shaft = p.points.filter(q => Math.abs(Math.abs(q.across) - shaftHalf) < shaftHalf * 0.01);
            const left = shaft.filter(q => q.across > 0).map(q => q.across);
            const right = shaft.filter(q => q.across < 0).map(q => -q.across);
            expect(left).toHaveLength(2);
            expect(right).toHaveLength(2);
            // 1e-4 of the half-width -- about 14 cm on this 28 km fixture, which is far
            // below a pixel at any zoom. Not tighter: the corners are placed geodesically,
            // and the two sides of an axis are not exactly mirror images on a sphere, so
            // round-off of ~5e-5 is there in correct output. The defect this discriminates
            // against is a systematic taper, which the along-then-across construction
            // produces at order (halfWidth/reach)^2 -- around 2e-3, twenty times this bound.
            // Each side constant along its own length: 1e-4 of the half-width, about 14 cm
            // on this 28 km fixture and far below a pixel at any zoom. Measured round-off
            // in correct output is 5e-5, so the bound is twice the floor rather than a
            // number picked to pass.
            expect(Math.abs(left[0] - left[1])).toBeLessThan(shaftHalf * 1e-4);
            expect(Math.abs(right[0] - right[1])).toBeLessThan(shaftHalf * 1e-4);
            // The two sides equal to each other is a looser claim and gets a looser bound.
            // Corners are placed geodesically and the two sides of an axis are not exact
            // mirror images on a sphere: this measures 1.0e-4 in correct output, so a 1e-4
            // bound fails it. That is round-off, not a shape.
            expect(Math.abs(left[0] - right[0])).toBeLessThan(shaftHalf * 1e-3);
        }
    });

    it('leaves the D a gap rather than cutting it out of the arrows', () => {
        // The crossed tasks run their arms through the middle and the style function cuts
        // them against the glyph it measures. This one stops short in the geometry, at the
        // fraction the plate stops it -- so the hole is the same on both engines and in a
        // raw-GeoJSON consumer that draws no label at all.
        const reach = proportions(0, 45).reach;
        for (const ring of rings()) {
            for (const [x, y] of ring) {
                expect(Math.hypot(x, y) / reach).toBeGreaterThan(0.19);
            }
        }
    });


    it('emits the centre and nothing else to grab', () => {
        // APP-06 344300: "This symbol requires one anchor point. The centre point defines
        // centre of the symbol." One anchor point is one handle, and it is the middle —
        // an edge handle would put the live grip beside a symbol described by its centre
        // and leave the centre showing as a grey inert dot.
        // @see TRANSLATE_ONLY_SYMBOLS, MissionTaskGraphicBase.publishHandles
        const handles = renderTacticalGraphic(base()).handles as Feature<{type: 'MultiPoint'; coordinates: Position[]}>;
        expect(handles.geometry.coordinates).toEqual([ORIGIN]);
    });

    it('puts its label at the centre', () => {
        const labels = renderTacticalGraphic(base()).labels as Feature<Point>;
        expect(labels.geometry.coordinates).toEqual(ORIGIN);
    });
});

describe('APP-06 344300 defeat — the paint', () => {
    afterEach(() => resetTacticalGraphicsConfig());

    const painted = (hostility?: TacticalGraphicHostility): PaintFeature => ({
        geometry: {
            type: 'MultiPolygon',
            coordinates: rings().map(ring => [ring as ProjectedPosition[]]),
        },
        properties: {name: TacticalGraphicName.Defeat, hostility},
    });

    it('fills the arrows and does not also stroke them', () => {
        // A stroke straddles the edge it draws, so it would inflate every arrow by half a
        // line width all round and blunt the tip the shape is read by.
        const paints = defeatPaint()(painted(), context());
        expect(paints).toHaveLength(1);
        expect(paints[0].fill).toBeDefined();
        expect(paints[0].stroke).toBeUndefined();
        expect((paints[0].geometry as {coordinates: unknown[]}).coordinates).toHaveLength(4);
    });

    it('does not turn red when hostile, because a mission task never does', () => {
        // FM 1-02.2's colour rule exempts the tactical mission tasks: they describe an
        // effect on the enemy rather than an affiliation of their own, so `supportsHostility`
        // is false for the whole category and Destroy behaves identically. Asserting the
        // opposite here -- which is what copying an area graphic's test would have said --
        // fails against correct code.
        configureTacticalGraphics({hostilityColors: {[TacticalGraphicHostility.hostileFaker]: '#ff0000'}});
        const plain = defeatPaint()(painted(), context());
        const hostile = defeatPaint()(painted(TacticalGraphicHostility.hostileFaker), context());
        expect(hostile[0].fill!.color).not.toBe('#ff0000');
        expect(hostile[0].fill!.color).toBe(plain[0].fill!.color);
    });

    it('draws nothing for a geometry carrying no rings', () => {
        const empty: PaintFeature = {
            geometry: {type: 'LineString', coordinates: [[0, 0], [1, 1]]},
            properties: {name: TacticalGraphicName.Defeat},
        };
        expect(defeatPaint()(empty, context())).toEqual([]);
    });
});
