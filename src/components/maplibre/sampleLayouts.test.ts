/**
 * # The sweep's per-graphic base layouts
 *
 * `candidateGeometries` tries a two-point line, then a ring, then a point, and keeps the
 * first that builds — which is right for the great majority and silently wrong for the
 * graphics whose points are *numbered roles* rather than a path. **A wrong base does not
 * throw: it builds a lesser symbol**, and the sweep then shows that lesser symbol as though
 * it were the graphic.
 *
 * Every case below was found by looking at the sheet, not by a failing test, and each is
 * pinned here so the next one has to be a deliberate edit:
 *
 *   - **seize** took the two-point line, drew its circle and stopped — a lettered ring
 *     beside three siblings carrying arcs and arrows. It is a `SweptArcTask` like capture,
 *     evacuate and recover and needs their four points.
 *   - **exfiltrate and infiltrate** need three, and with two `Exfiltrate.generateGraphics`
 *     returns the raw coordinates: a bare straight segment, no S and no arrowhead.
 *   - **follow and assume / follow and support / fix / tactical fix** build fine on two
 *     points, but every dimension except the run between them is a *screen* size. On a
 *     cell-width run the furniture takes nearly all of it and the head sits on the tail.
 */
import {
    TacticalGraphicName,
    listTacticalGraphicNames,
    renderTacticalGraphic,
} from '@zaes/tactical-graphics';
import {acrossPointAtEnd, baseVertexCount, carriesSeparationInBase, generatorOrder, handleContract, isRectangular, normalizeDrawnBase, usesDrawnAnchors} from '@zaes/tactical-graphics';
import type {Feature, Position} from 'geojson';
import {sampleFeatureCollection} from './sampleGallery';

/**
 * The sample base the sweep hands `name`.
 *
 * Read from `sampleFeatureCollection`, which is what the app actually draws from — both
 * engines restore that collection rather than each building its own sheet.
 */
function sampleBase(name: TacticalGraphicName): number[][] {
    const feature = sampleFeatureCollection(undefined, [name]).features
        .find(f => (f.properties as {tacticalGraphic?: {name?: string}})?.tacticalGraphic?.name === name);
    const geometry = feature?.geometry;
    if (!geometry || geometry.type !== 'LineString') return [];
    return geometry.coordinates as number[][];
}

/** End-to-end reach of a base, in degrees — the run its screen-sized furniture sits on. */
const reachOf = (base: number[][]): number =>
    base.length < 2 ? 0 : Math.hypot(base[base.length - 1][0] - base[0][0], base[base.length - 1][1] - base[0][1]);

describe('the swept-arc tasks all get four points', () => {
    const FAMILY = [
        TacticalGraphicName.Capture,
        TacticalGraphicName.Seize,
        TacticalGraphicName.Evacuate,
        TacticalGraphicName.Recover,
    ];

    it.each(FAMILY)('%s is handed the four numbered points its generator reads', name => {
        expect(sampleBase(name)).toHaveLength(4);
    });

    it('lays all four out identically, so the sheet compares them', () => {
        // Relative to each sample's own first point: the four differ only in where the cell
        // is, and a sibling drifting out of the group is exactly how seize went unnoticed.
        const shapes = FAMILY.map(name => {
            const base = sampleBase(name);
            return base.map(([x, y]) => [+(x - base[0][0]).toFixed(6), +(y - base[0][1]).toFixed(6)]);
        });
        for (const shape of shapes) expect(shape).toEqual(shapes[0]);
    });
});

describe('exfiltrate and infiltrate get the three points that make an S', () => {
    const PAIR = [TacticalGraphicName.Exfiltrate, TacticalGraphicName.Infiltration];

    it.each(PAIR)('%s is handed three points', name => {
        expect(sampleBase(name)).toHaveLength(3);
    });

    it.each(PAIR)('%s offsets point 2 off the chord, which is what bends the S', name => {
        // APP-06 343700 reads point 2 as the centre of the two arcs, and `createSCurve`
        // takes its *perpendicular offset from the 1 -> 3 chord* as the depth and the side.
        // On the chord it is no offset at all, `radius` comes out zero, and the function
        // returns the bare two-point chord — a straight line where an S should be.
        const [p1, p2, p3] = sampleBase(name);
        const chordX = p3[0] - p1[0];
        const chordY = p3[1] - p1[1];
        const length = Math.hypot(chordX, chordY);
        const offset = Math.abs(((p2[0] - p1[0]) * -chordY + (p2[1] - p1[1]) * chordX) / length);
        expect(offset).toBeGreaterThan(0);
        // And not so deep that the arcs eat the straights: `createSCurve` caps the radius at
        // 0.24 of the chord, so past that the S is all turn and no run.
        expect(offset / length).toBeLessThan(0.24);
    });

    it.each(PAIR)('%s draws a curve rather than the raw segment', name => {
        // The two-point case returns `[coords]` — two points, no arrowhead. Anything built
        // from three has a densified path and a head, so the count is the discriminator.
        const {graphic} = renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name, radius: 180_000}},
            geometry: {type: 'LineString', coordinates: sampleBase(name)},
        } as never);
        const geometry = graphic.geometry as {type: string; coordinates: number[][][]};
        expect(geometry.type).toBe('MultiLineString');
        expect(geometry.coordinates[0].length).toBeGreaterThan(10);
    });
});

describe('the minimum safe distance zones draw rings, not a segment', () => {
    /*
     * Both fell to a straight line and neither complained: 272100 returns the raw
     * coordinates below three points, 272101 below six. Found by measuring the rendered
     * extent of every sample and asking which had none — a two-point horizontal base has
     * zero height, and a graphic whose plate is a pair of concentric rings should not.
     */
    it('gives 272100 a centre and a point on each ring', () => {
        expect(sampleBase(TacticalGraphicName.MinimumSafeDistanceZone)).toHaveLength(3);
    });

    it('gives 272101 an even count of at least six, two rings traced end to end', () => {
        const base = sampleBase(TacticalGraphicName.MinimumSafeDistanceMultipleStrike);
        expect(base.length).toBeGreaterThanOrEqual(6);
        expect(base.length % 2).toBe(0);
    });

    it.each([
        TacticalGraphicName.MinimumSafeDistanceZone,
        TacticalGraphicName.MinimumSafeDistanceMultipleStrike,
    ])('%s renders two rings with real height', name => {
        const {graphic} = renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name, radius: 180_000}},
            geometry: {type: 'LineString', coordinates: sampleBase(name)},
        } as never);
        const rings = (graphic.geometry as {coordinates: number[][][]}).coordinates;
        expect(rings).toHaveLength(2);
        // Height, because a flat base gives a flat fallback: this is the assertion that
        // fails against the unfixed sample and the one the eye was making.
        for (const ring of rings) {
            const ys = ring.map(p => p[1]);
            expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.5);
        }
        // Nested: the inner ring's extent has to sit inside the outer one's.
        const spanOf = (r: number[][]) => Math.max(...r.map(p => p[0])) - Math.min(...r.map(p => p[0]));
        expect(spanOf(rings[0])).toBeLessThan(spanOf(rings[1]));
    });
});

describe('the symbols whose furniture is a screen size get a longer run', () => {
    const LONG = [
        TacticalGraphicName.FollowAndAssume,
        TacticalGraphicName.FollowAndSupport,
        TacticalGraphicName.Fix,
        TacticalGraphicName.TacticalFix,
    ];

    /** A graphic with no such furniture, for the comparison to mean anything. */
    const ORDINARY = TacticalGraphicName.PhaseLine;

    it.each(LONG)('%s is drawn on a longer run than an ordinary line graphic', name => {
        expect(reachOf(sampleBase(name))).toBeGreaterThan(reachOf(sampleBase(ORDINARY)) * 1.4);
    });

    it('does not lengthen anything else', () => {
        // A blanket "make line samples longer" would repack the whole sheet and is not what
        // was asked for. Only the graphics whose plates say "varies only in length" need it.
        const ordinary = reachOf(sampleBase(ORDINARY));
        const longer = listTacticalGraphicNames()
            .filter(name => !LONG.includes(name as TacticalGraphicName))
            .filter(name => {
                const base = sampleBase(name as TacticalGraphicName);
                return base.length === 2 && reachOf(base) > ordinary * 1.01;
            });
        expect(longer).toEqual([]);
    });
});

/**
 * # The shared sheet stores the base a draw would
 *
 * `sampleFeatureCollection` is what **both** engines restore from, so a base it gets wrong
 * is wrong twice. Every sweep defect reported over 2026-09-05/06 was of that kind — squat
 * symbols, two grips where a hand-drawn graphic had three, a grip half a symbol from any
 * stored point — and in each case the symbol drawn by hand was already correct.
 *
 * `normalizeDrawnBase` is the door every draw and every restore comes in by, and it is
 * idempotent. So running it over the sheet's own base is the comparison that was missing:
 * anything it *moves* is a shape no draw can produce.
 *
 * Stated in degrees, which is what `candidateGeometries` lays out in, so there is no
 * projection slack to allow for — unlike the OpenLayers sweep, which works in metres.
 * @see sampleGallery.test.ts, "the sweep stores the base a draw would"
 */
describe('the shared sample sheet stores drawable bases', () => {
    /** What `sampleFeatureCollection` validates its candidates with. @see SAMPLE_RADIUS_M */
    const SAMPLE_RADIUS_M = 180_000;

    const NAMES = listTacticalGraphicNames() as TacticalGraphicName[];

    it('hands every graphic a base its own normalizer leaves alone', () => {
        const moved: string[] = [];
        for (const name of NAMES) {
            const base = sampleBase(name);
            if (base.length < 2) continue;
            const settled = normalizeDrawnBase(name, base as Position[]);
            const span = Math.max(reachOf(base), 1e-9);
            const worst = settled.length === base.length
                ? Math.max(...settled.map((p, i) => Math.hypot(p[0] - base[i][0], p[1] - base[i][1])))
                : Infinity;
            // A thousandth of the symbol's own reach. The layouts are built in the same
            // units the normalizer reads, so anything above that is a different shape.
            if (worst / span > 1e-3) moved.push(`${name} (${base.length} -> ${settled.length})`);
        }
        expect(moved).toEqual([]);
    });

    it('publishes every grip on a point the base actually stores', () => {
        /*
         * A handle that is not on a vertex is a handle a vertex drag cannot pick up — which
         * is exactly what "the sweep ones can't be dragged from point 3" was. Only for the
         * graphics whose grips *are* their vertices: one publishing a derived frame says so
         * through `usesDrawnAnchors`, and its grips are not vertices by design.
         */
        const stray: string[] = [];
        for (const name of NAMES) {
            if (usesDrawnAnchors(name) || isRectangular(name) || baseVertexCount(name) === undefined) continue;
            const base = sampleBase(name);
            if (base.length < 2) continue;
            let handles;
            try {
                handles = renderTacticalGraphic({
                    type: 'Feature',
                    // The same amplifiers the sheet validates its candidate with. Without
                    // them the arrow generators get an undefined size and produce NaN
                    // coordinates, which is the probe's fault and not the sheet's.
                    properties: {tacticalGraphic: {name, radius: SAMPLE_RADIUS_M, rotation: 0}},
                    geometry: {type: 'LineString', coordinates: base},
                } as Feature).handles?.geometry;
            } catch (error) {
                // A base the sheet stores that its own generator refuses is the same defect
                // one vertex further on, so it is reported rather than thrown.
                stray.push(`${name} does not render: ${(error as Error).message}`);
                continue;
            }
            if (!handles || handles.type !== 'MultiPoint') continue;
            const span = Math.max(reachOf(base), 1e-9);
            const contract = handleContract(name);
            handles.coordinates.forEach((handle, index) => {
                // **Only the grips the library says are vertices.** `handleContract` is what
                // both renderers read to decide what a grip *does*, and an `offset` or
                // `mirror` grip is a derived mark by design — the block family's width handle
                // sits three sizes off the base on purpose. Asking those to be on a vertex
                // would be asserting that the contract does not work.
                const role = contract.roles[index] ?? contract.repeating;
                if (role !== 'shape') return;
                const nearest = Math.min(...base.map(b => Math.hypot(handle[0] - b[0], handle[1] - b[1])));
                if (nearest / span > 0.05) stray.push(`${name} ${(100 * nearest / span).toFixed(0)}%`);
            });
        }
        expect(stray).toEqual([]);
    });
});

/**
 * # A cane arrow is sampled like a cane arrow, on both sheets
 *
 * Eight graphics draw the same picture — a straight run with a half circle hooked off its
 * far end — and 344000 pursuit is one of them. It kept coming out unlike its siblings
 * because the two sweeps each carried their own chain of `if`s over the same library
 * predicates: MapLibre was given an inline `name === Pursuit` and the OpenLayers sweep
 * never got the clause at all, so pursuit was a cane arrow on one sheet and a shallow V on
 * the other, through three separate reports. ("Pursuit, use the same cane base for this 3
 * point graphic. I've asked for that several times now.")
 *
 * What is asserted is the shape a reader can see: the same layout, to the same proportions,
 * as the seven retrograde arrows. `synthesizedBase` is now the one answer both sheets ask
 * for, so a graphic added to the family is laid out with it or the difference shows here.
 */
describe('pursuit is laid out as the cane arrow it is', () => {
    /** The seven retrograde arrows, which draw the identical picture. @see acrossPointAtEnd */
    const CANES = [
        TacticalGraphicName.Delay,
        TacticalGraphicName.Retirement,
        TacticalGraphicName.Withdraw,
        TacticalGraphicName.WithdrawUnderPressure,
        TacticalGraphicName.ForwardPassageOfLines,
        TacticalGraphicName.RearwardPassageOfLines,
        TacticalGraphicName.Disengage,
    ];

    /**
     * A base reduced to what its shape *is*, independent of where the cell sits: the run's
     * length, and the third point's distance across it as a share of that run.
     */
    const shapeOf = (name: TacticalGraphicName, stored: number[][]) => {
        // **Through the generator's own order**, not the stored one. Thirty-two graphics
        // store their points tip-first and the canes are among them; pursuit is not, so a
        // positional read compares point 1 of one against point 3 of the other and reports
        // two identical layouts as different. @see generatorOrder, TIP_FIRST_GRAPHICS
        const base = generatorOrder(name, stored as Position[]) as number[][];
        const [p1, p2, p3] = base;
        const scale = Math.cos((p1[1] * Math.PI) / 180);
        const run = Math.hypot((p2[0] - p1[0]) * scale, p2[1] - p1[1]);
        const across = Math.hypot((p3[0] - p2[0]) * scale, p3[1] - p2[1]);
        return {points: base.length, acrossOverRun: +(across / run).toFixed(3)};
    };

    it('gives pursuit the same three-point layout as the seven retrograde arrows', () => {
        const reference = shapeOf(CANES[0], sampleBase(CANES[0]));
        // The family agrees with itself first, or the comparison below means nothing.
        for (const name of CANES) expect(shapeOf(name, sampleBase(name))).toEqual(reference);
        expect(shapeOf(TacticalGraphicName.Pursuit, sampleBase(TacticalGraphicName.Pursuit))).toEqual(reference);
    });

    it('hooks pursuit\'s arc off point 2, where the arc actually is', () => {
        // The third point is the far end of the arc's diameter and the arc hooks off point
        // 2, so a mid-run third point puts the grip half a symbol from the mark it holds -
        // which is why a swept cane could not be dragged from point 3 while a hand-drawn one
        // could. @see acrossPointAtEnd
        expect(acrossPointAtEnd(TacticalGraphicName.Pursuit)).toBe(true);
        const base = generatorOrder(TacticalGraphicName.Pursuit, sampleBase(TacticalGraphicName.Pursuit) as Position[]) as number[][];
        const scale = Math.cos((base[0][1] * Math.PI) / 180);
        const along = (p: number[]) =>
            (((p[0] - base[0][0]) * scale) * ((base[1][0] - base[0][0]) * scale) + (p[1] - base[0][1]) * (base[1][1] - base[0][1]));
        // Point 3 sits at point 2's end of the run, not in the middle of it.
        const run = along(base[1]);
        expect(along(base[2]) / run).toBeCloseTo(1, 1);
    });
});

/**
 * # A cane arrow *edits* like a cane arrow
 *
 * The layout tests above are about the picture. This is about the gesture, which is what a
 * user actually notices: pursuit drew correctly and still felt wrong, because it was the
 * last of the family holding a **mirror** grip at index 0 where every sibling has a shape
 * vertex — so dragging the arc's end flipped the symbol instead of moving the point, and its
 * holder decomposed each drag into centre / size / rotation / mirrored / lineRatio and laid
 * all three points back out, moving the two the user had not touched.
 * ("pursuit point 3 drag still doesn't behave like other cane graphics […] The graphic does
 * look correct, is just the editing of it seems different.")
 *
 * The contract is what both renderers read to decide what a grip does, so it is the thing to
 * assert — a picture test cannot see any of this.
 */
describe('a cane arrow edits like a cane arrow', () => {
    const FAMILY = [
        TacticalGraphicName.Delay,
        TacticalGraphicName.Retirement,
        TacticalGraphicName.Withdraw,
        TacticalGraphicName.WithdrawUnderPressure,
        TacticalGraphicName.ForwardPassageOfLines,
        TacticalGraphicName.RearwardPassageOfLines,
        TacticalGraphicName.Disengage,
        TacticalGraphicName.Pursuit,
    ];

    it.each(FAMILY.map(n => [String(n), n] as const))('%s publishes three shape grips', (_label, name) => {
        // No `mirror`, no `offset`: every grip moves a point the operator placed. Point 3
        // states which side the arc falls on, so dragging it across the line *is* the flip.
        expect(handleContract(name).roles).toEqual(['shape', 'shape', 'shape']);
    });

    it.each(FAMILY.map(n => [String(n), n] as const))('%s drags its vertices, not a frame', (_label, name) => {
        // `usesDrawnAnchors` routes the centre / size / rotation machinery a frame-read
        // graphic needs. A member of this family reads its points as its shape, so a drag
        // moves the point it grabbed and leaves the other two where they are.
        expect(usesDrawnAnchors(name)).toBe(false);
        expect(carriesSeparationInBase(name)).toBe(true);
        expect(baseVertexCount(name)).toBe(3);
    });

    it('moves only the point that was dragged', () => {
        /*
         * The property the contract exists to give. A frame-reading holder recomputed all
         * three points from the scalars it decomposed a drag into, so moving point 3 moved
         * points 1 and 2 with it — which is the whole of what "the editing seems different"
         * was. Asserted through the library's own normalizer, which is what both engines run
         * on an edited base.
         */
        for (const name of FAMILY) {
            const base: Position[] = [[-0.8, 20], [0.4, 20], [0.4, 19.6]];
            const dragged: Position[] = [base[0], base[1], [0.4, 19.2]];
            const settled = normalizeDrawnBase(name, dragged);
            expect(settled[0][0]).toBeCloseTo(base[0][0], 6);
            expect(settled[0][1]).toBeCloseTo(base[0][1], 6);
            expect(settled[1][0]).toBeCloseTo(base[1][0], 6);
            expect(settled[1][1]).toBeCloseTo(base[1][1], 6);
            // …and the point that was dragged actually moved.
            expect(Math.abs(settled[2][1] - base[2][1])).toBeGreaterThan(0.2);
        }
    });
});
