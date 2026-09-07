/**
 * # 270501, 270502 and 152100 read the anchor points their plates number
 *
 * All three were two-vertex LineStrings until 2026-09-06, and in each the two they had were
 * the *wrong* two: the vertical line block and disrupt are built around was derived from
 * `size`, a screen constant, and support by fire's bar and both its arrows were computed by
 * ratio off a shaft. So the operator could state neither the height of a symbol whose rule
 * says "points 1 and 2 determine the height" nor the arrowhead positions its rule calls
 * "the left and right limits of coverage".
 *
 * The plates, quoted where each assertion needs them, are in `tmp/plates/seven-draw-rules.txt`.
 */
import {
    TacticalGraphicName,
    baseVertexCount,
    drawsTipFirst,
    getPaintFunction,
    normalizeDrawnBase,
    ratioLockOf,
    renderTacticalGraphic,
} from '../index';
import type {PaintContext, PaintFeature} from '../core/paint';
import type {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';

/** A bar running due north, with the stem or the arrows aimed due east. */
const BAR_TOP: Position = [0, 0.05];
const BAR_BOTTOM: Position = [0, -0.05];
const OUT: Position = [0.08, 0];

const draw = (name: TacticalGraphicName, coords: Position[]) =>
    renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: coords},
        properties: {tacticalGraphic: {name}},
    } as unknown as Feature<LineString>);

const lines = (name: TacticalGraphicName, coords: Position[]): Position[][] =>
    ((draw(name, coords)?.graphic as Feature<MultiLineString>).geometry.coordinates ?? []) as Position[][];

const grips = (name: TacticalGraphicName, coords: Position[]): Position[] =>
    ((draw(name, coords)?.handles as Feature<MultiPoint>).geometry.coordinates ?? []) as Position[];

const metres = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

/** Whether any drawn sub-line has these two points as its own ends, either way round. */
const hasSegment = (drawn: Position[][], a: Position, b: Position) =>
    drawn.some(
        l =>
            (metres(l[0], a) < 1 && metres(l[l.length - 1], b) < 1) ||
            (metres(l[0], b) < 1 && metres(l[l.length - 1], a) < 1),
    );

/**
 * What the shared paint layer actually draws for a base — the count of `Paint` entries.
 *
 * Both renderers read this layer, so a symbol that comes back with nothing here is a symbol
 * that is missing on OpenLayers *and* MapLibre. The coordinates are put through a plain
 * spherical Mercator first because a paint function is handed projected metres and does
 * Euclidean math on them; degrees would not collapse the way metres do, which is the whole
 * subject of the test below.
 */
const MERCATOR = 20037508.34 / 180;
const toMetres = (c: Position): Position => [
    c[0] * MERCATOR,
    (Math.log(Math.tan(((90 + c[1]) * Math.PI) / 360)) * 180) / Math.PI * MERCATOR,
];

const paintedInk = (name: TacticalGraphicName, coords: Position[]): number => {
    const painter = getPaintFunction(name)?.graphic;
    const graphic = draw(name, coords)?.graphic as Feature<MultiLineString> | undefined;
    if (!painter || !graphic) return 0;
    const feature = {
        geometry: {type: 'MultiLineString', coordinates: graphic.geometry.coordinates.map(l => l.map(toMetres))},
        properties: {name},
        graphicSize: 100_000,
    } as unknown as PaintFeature;
    return painter(feature, {resolution: 40, measureText: (t: string) => t.length * 9} as unknown as PaintContext).length;
};

const midOfBar = (): Position =>
    turf.midpoint(turf.point(BAR_TOP), turf.point(BAR_BOTTOM)).geometry.coordinates as Position;

describe('270501 / 340100 block — a bar and a stem off its middle', () => {
    const NAMES = [TacticalGraphicName.Block, TacticalGraphicName.TacticalBlock];

    it.each(NAMES)('takes three anchor points — %s', name => {
        expect(baseVertexCount(name)).toBe(3);
    });

    it.each(NAMES)('is no longer reversed on the way into the generator — %s', name => {
        /*
         * **Asserted on the registry, not on the drawn output.** `featureInGeneratorOrder`
         * reverses the base *before* the generator runs, so a test that only looks at the ink
         * cannot tell whether the flip happened — it would pass with the entry restored and
         * prove nothing. `drawsTipFirst` is the fact that changed.
         *
         * The two blocks were on the list because a two-point base numbered the bar first
         * while `getBlockArrow` builds it on the last vertex. With three points stored in the
         * plate's own order there is nothing to reconcile, and reversing would hand the
         * generator point 3 as the bar's top. The flip a legacy pair still needs moved into
         * `Block.lines`, which is the one place that can tell two points from three.
         */
        expect(drawsTipFirst(name)).toBe(false);
    });

    it.each(NAMES)('draws the bar between points 1 and 2 — %s', name => {
        // "Points 1 and 2 define the endpoints of the symbol's vertical line."
        expect(hasSegment(lines(name, [BAR_TOP, BAR_BOTTOM, OUT]), BAR_TOP, BAR_BOTTOM)).toBe(true);
    });

    it.each(NAMES)('runs the stem from the middle of the bar out to point 3 — %s', name => {
        /*
         * "The length of the horizontal line is determined by plotting point 3 on a plane
         * extending perpendicularly from the midpoint of the vertical line." So the stem meets
         * the bar at its middle, not at either end — which is what makes the symbol a T rather
         * than an L, and what the old two-point form could not express at all.
         */
        expect(hasSegment(lines(name, [BAR_TOP, BAR_BOTTOM, OUT]), midOfBar(), OUT)).toBe(true);
    });

    it.each(NAMES)('grips exactly the three points the plate numbers — %s', name => {
        const points = grips(name, [BAR_TOP, BAR_BOTTOM, OUT]);
        expect(points).toHaveLength(3);
        [BAR_TOP, BAR_BOTTOM, OUT].forEach((p, i) => expect(metres(points[i], p)).toBeLessThan(1));
    });

    it.each(NAMES)('still draws the placed bar when point 3 has no perpendicular offset — %s', name => {
        /*
         * A base whose three points are collinear — which a catalog sweep synthesizes and a
         * hand-written file can hold, though `blockAnchors` refuses the click — leaves the
         * stem with zero length. The bar was still placed by points 1 and 2, so it must still
         * be drawn; `blockPaint` used to read a zero-length first sub-line as a reason to
         * return no paint at all and the whole symbol vanished on both engines.
         */
        const drawn = lines(name, [[0, 0], [0.4, 0], [0.8, 0]]);
        expect(hasSegment(drawn, [0, 0], [0.4, 0])).toBe(true);
        expect(paintedInk(name, [[0, 0], [0.4, 0], [0.8, 0]])).toBeGreaterThan(0);
    });

    it('pulls a click off the perpendicular back onto it', () => {
        /*
         * The projection is stated outright, and 340100 states it twice over. A click well up
         * the bar's own direction still yields a stem square to the bar — the same discipline
         * pursuit's third click gets, and the reason the T cannot come out skewed.
         */
        const stored = normalizeDrawnBase(TacticalGraphicName.Block, [BAR_TOP, BAR_BOTTOM, [0.08, 0.04]]);
        const bar = turf.bearing(turf.point(BAR_TOP), turf.point(BAR_BOTTOM));
        const toStem = turf.bearing(turf.point(midOfBar()), turf.point(stored[2]));
        const off = (((toStem - bar) % 360) + 360) % 360;
        expect(Math.min(Math.abs(off - 90), Math.abs(off - 270))).toBeLessThan(0.5);
    });
});

describe('270502 / 341000 disrupt — three arrows off a placed bar', () => {
    const NAMES = [TacticalGraphicName.Disrupt, TacticalGraphicName.TacticalDisrupt];
    /*
     * **Built through the reader, not written by hand.** `disruptAnchors` plots point 3 on the
     * perpendicular at point 2, and a hand-written base that puts it square to the *midpoint*
     * instead is one the app never produces — the arrows then come out splayed and the ratios
     * measured against the wrong length. Going through `normalizeDrawnBase` is what the draw
     * does, so the fixture is a base that can actually exist.
     */
    const BASE = normalizeDrawnBase(TacticalGraphicName.Disrupt, [BAR_TOP, BAR_BOTTOM, OUT]);

    it.each(NAMES)('takes three anchor points and is no longer ratio-locked — %s', name => {
        /*
         * "Points 1 and 2 determine the height of the symbol and point 3 determines its
         * length." Two dimensions, stated and placed separately — which is exactly what a
         * locked height/length ratio forbids. It took its height from 0.3 of the drawn length.
         */
        expect(baseVertexCount(name)).toBe(3);
        expect(ratioLockOf(name)).toBeUndefined();
    });

    it.each(NAMES)('draws the bar between points 1 and 2 — %s', name => {
        expect(hasSegment(lines(name, BASE), BAR_TOP, BAR_BOTTOM)).toBe(true);
    });

    it.each(NAMES)('tips the longest arrow at point 3 — %s', name => {
        // "Point 3 defines the tip of the longest arrow", and the Template springs that arrow
        // from the point 2 end of the bar.
        expect(hasSegment(lines(name, BASE), BAR_BOTTOM, BASE[2])).toBe(true);
    });

    it('staggers the three arrows in the proportions the Template draws', () => {
        /*
         * "The length of the short arrows will remain in proportion to the length of the
         * longest arrow" — the rule states the relationship and leaves the numbers to the
         * picture. Measured off it at 600 dpi: 0.754 and 0.523 of the longest, with the middle
         * prong alone running a further 0.621 back behind the bar.
         */
        const drawn = lines(TacticalGraphicName.Disrupt, BASE);
        const reach = metres(BAR_BOTTOM, BASE[2]);
        const shafts = [drawn[0], drawn[2], drawn[4]];
        const lengths = shafts.map(l => metres(l[0], l[l.length - 1]));
        expect(lengths[0] / reach).toBeCloseTo(1, 2);
        expect(lengths[1] / reach).toBeCloseTo(0.523, 2);
        expect(lengths[2] / reach).toBeCloseTo(0.754 + 0.621, 2);
    });

    it.each(NAMES)('grips exactly the three points the plate numbers — %s', name => {
        const points = grips(name, BASE);
        expect(points).toHaveLength(3);
        BASE.forEach((p, i) => expect(metres(points[i], p)).toBeLessThan(1));
    });

    it('draws the arrows square to the bar even from a base that is not', () => {
        /*
         * A base can arrive from a hand-written file, or from a vertex drag not yet read back,
         * with point 3 off the perpendicular. The generator squares it every render — the same
         * thing `MobileDefense.frame` does — so the three arrows stay parallel and the grip is
         * published where the arrowhead actually is rather than where the file said.
         */
        const skewed = [BAR_TOP, BAR_BOTTOM, [0.08, 0.06] as Position];
        const drawn = lines(TacticalGraphicName.Disrupt, skewed);
        const bar = turf.bearing(turf.point(BAR_TOP), turf.point(BAR_BOTTOM));
        for (const shaft of [drawn[0], drawn[2], drawn[4]]) {
            const heading = turf.bearing(turf.point(shaft[0]), turf.point(shaft[shaft.length - 1]));
            const off = (((heading - bar) % 360) + 360) % 360;
            expect(Math.min(Math.abs(off - 90), Math.abs(off - 270))).toBeLessThan(0.5);
        }
        // ...and the third grip sits on the arrowhead the picture has, not on the stored point.
        expect(metres(grips(TacticalGraphicName.Disrupt, skewed)[2], skewed[2])).toBeGreaterThan(1);
    });
});

describe('152100 support by fire — four points, and four is what the plate asks', () => {
    const NAME = TacticalGraphicName.SupportByFire;
    const REAR_LEFT: Position = [-0.05, 0];
    const REAR_RIGHT: Position = [0.05, 0];
    const TIP_LEFT: Position = [-0.07, 0.12];
    const TIP_RIGHT: Position = [0.07, 0.12];
    const BASE = [REAR_LEFT, REAR_RIGHT, TIP_LEFT, TIP_RIGHT];

    it('takes four anchor points, not three, and is no longer ratio-locked', () => {
        /*
         * **The one the user's three-point list did not cover.** "This symbol requires four
         * anchor points. Points 1 and 2 define the endpoints of the straight line on the back
         * side of the symbol. Points 3 and 4 define the tips of the arrowheads."
         */
        expect(baseVertexCount(NAME)).toBe(4);
        expect(ratioLockOf(NAME)).toBeUndefined();
    });

    it('connects the rear of each arrow to points 1 and 2, and tips them at 3 and 4', () => {
        // "The rear of the arrows should connect to points 1 and 2." Both arrows are stated
        // end to end now; they used to be a reach and a spread computed off a shaft.
        const drawn = lines(NAME, BASE);
        expect(hasSegment(drawn, REAR_LEFT, TIP_LEFT)).toBe(true);
        expect(hasSegment(drawn, REAR_RIGHT, TIP_RIGHT)).toBe(true);
    });

    it('runs the back line between points 1 and 2, with a feather off each end', () => {
        // The bracket is one polyline — feather, bar, bar, feather — so a single stroke draws
        // it in lock-step, which is how the doctrinal figure is penned.
        const bracket = lines(NAME, BASE)[0];
        expect(bracket).toHaveLength(4);
        expect(metres(bracket[1], REAR_LEFT)).toBeLessThan(1);
        expect(metres(bracket[2], REAR_RIGHT)).toBeLessThan(1);
        // Both feathers fall on the far side of the bar from the arrows, which rise north.
        expect(bracket[0][1]).toBeLessThan(0);
        expect(bracket[3][1]).toBeLessThan(0);
    });

    it('grips exactly the four points the plate numbers', () => {
        const points = grips(NAME, BASE);
        expect(points).toHaveLength(4);
        BASE.forEach((p, i) => expect(metres(points[i], p)).toBeLessThan(1));
    });
});
