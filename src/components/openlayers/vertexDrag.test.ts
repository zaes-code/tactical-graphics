/**
 * Vertex dragging: an edit-mode drag on an opted-in graphic moves the grabbed vertex
 * rather than scaling the whole shape.
 *
 * Opt-in matters as much as the behavior. The line family is overwhelmingly "a drawn path
 * plus decorations", where a uniform resize is what a user expects, so turning this on
 * everywhere would change 40 graphics nobody asked about.
 */
import Feature from 'ol/Feature';
import {LineString} from 'ol/geom';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {LineGraphicController} from './controllers/LineGraphicController';

const RES = 1200;
const V: number[][] = [[0, 0], [100_000, -60_000], [200_000, 0]];

const build = (name: TacticalGraphicName) => {
    const c = getController(name, RES) as LineGraphicController;
    c.setBaseFeature(new Feature(new LineString(V.map(p => [...p]))) as never);
    return c;
};

// `+ 0` normalizes the negative zero a 3857 -> 4326 -> 3857 round trip leaves behind, which
// `toEqual` distinguishes from zero. @see LineGraphicController.settle
const coordsOf = (c: LineGraphicController) =>
    (c.graphic.base.getGeometry() as LineString).getCoordinates().map(p => [Math.round(p[0]) + 0, Math.round(p[1]) + 0]);

describe('per-handle vertex dragging', () => {
    it('Fields of Fire opts in', () => {
        const c = build(TacticalGraphicName.FieldsOfFire);
        expect(c.dragsVertices).toBe(true);
        expect(typeof c.handleVertexDrag).toBe('function');
    });

    it('gives every two-point vertex line a grip on both ends', () => {
        /*
         * **A grip on each end, because each end can be dragged.**
         *
         * The constructor sets `hidesStartHandle` on any two-point line — "two vertices is
         * one segment: show only the handle on the far end" — which is right while the only
         * gesture is a stretch anchored there, and wrong the moment the vertex itself moves.
         * MapLibre published both all along, so this was a **cross-engine difference on
         * every `vertexLine(2, …)` graphic**: the convoys, the navigational line, `Fix`, the
         * follow tasks. Reported on the convoys — *"maplibre has two red handles (correct)
         * and openlayers has only 1"* (user, 2026-09-04).
         */
        for (const name of [TacticalGraphicName.MovingConvoy, TacticalGraphicName.HaltedConvoy,
                            TacticalGraphicName.NavigationalLine, TacticalGraphicName.Fix,
                            TacticalGraphicName.FollowAndAssume]) {
            const c = getController(name, RES) as LineGraphicController;
            expect(c.dragsVertices).toBe(true);
            expect(c.graphic.hidesStartHandle).toBe(false);
        }
    });

    it('leaves the single handle on a two-point line that does not drag vertices', () => {
        // The other half: with no vertex to move, the near handle would do nothing, so the
        // constructor's rule still stands for those. A bearing line, not a phase line —
        // `hidesStartHandle` is set for `maxPoints === 2` and a phase line has no limit, so
        // it is `undefined` there and the assertion would be about the wrong thing.
        const c = getController(TacticalGraphicName.BearingLine, RES) as LineGraphicController;
        expect(c.dragsVertices).toBe(false);
        expect(c.graphic.hidesStartHandle).toBe(true);
    });

    it('moves only the grabbed vertex', () => {
        const c = build(TacticalGraphicName.FieldsOfFire);
        c.handleVertexDrag!(2, [260_000, 40_000]);
        const after = coordsOf(c);
        expect(after[0]).toEqual([0, 0]);              // apex untouched
        expect(after[1]).toEqual([100_000, -60_000]);  // other leg untouched
        expect(after[2]).toEqual([260_000, 40_000]);   // dragged end moved
    });

    it('never drops a vertex, so the V keeps its two segments', () => {
        const c = build(TacticalGraphicName.FieldsOfFire);
        c.handleVertexDrag!(0, [100_001, -60_001]);    // dragged onto the apex
        expect(coordsOf(c)).toHaveLength(3);
    });

    it('ignores an out-of-range index rather than corrupting the geometry', () => {
        const c = build(TacticalGraphicName.FieldsOfFire);
        const before = coordsOf(c);
        c.handleVertexDrag!(9, [1, 1]);
        c.handleVertexDrag!(-1, [1, 1]);
        expect(coordsOf(c)).toEqual(before);
    });

    it('the apex moves the whole graphic, keeping the V rigid', () => {
        // **Vertex 0.** APP-06 140500 numbers this symbol from its vertex, and the base
        // was renumbered to match, so the apex is the first point rather than the middle
        // one it used to be drawn as. @see drawOrder.ts
        const c = build(TacticalGraphicName.FieldsOfFire);
        const before = coordsOf(c);
        c.handleVertexDrag!(0, [130_000, -20_000]);   // drag the apex
        const after = coordsOf(c);
        const dx = 130_000 - before[0][0];
        const dy = -20_000 - before[0][1];
        // Every vertex shifted by the same delta — the shape is unchanged, only placed.
        after.forEach((p, i) => {
            expect(p[0]).toBe(before[i][0] + dx);
            expect(p[1]).toBe(before[i][1] + dy);
        });
    });

    it.each([TacticalGraphicName.ObstacleBypassEasy, TacticalGraphicName.ObstacleBypassDifficult,
             TacticalGraphicName.ObstacleBypassImpossible])(
        'lets an obstacle bypass lengthen from its rear point — %s',
        name => {
            /*
             * **Point 3 declares no anchor, so the reshape reaches it.**
             *
             * It was `vertexLine(3, 3, 2)` until 2026-09-06 — "handle 2 is the rear, which is
             * the one that moves the whole shape" — and the manager refuses a reshape on the
             * anchor outright rather than letting it fall through to a scale. So the grip
             * APP-06 270601 gives the symbol's length, *"point 3 determines its length"*, was
             * the only grip that could not change it, while MapLibre (which reads
             * `anchorVertex` from the library, where these were never listed) let it. (User's
             * report: "it is not letting the user drag to lengthen the graphic".)
             */
            // The symbol's own layout: the two arrowhead tips on a north-south opening, the
            // rear due west of its middle. A generic V would put point 3 nowhere the plate
            // recognises. @see ObstacleBypass
            const c = getController(name, RES) as LineGraphicController;
            c.setBaseFeature(new Feature(new LineString([[0, 60_000], [0, -60_000], [-200_000, 0]])) as never);
            expect(c.dragsVertices).toBe(true);
            expect(c.anchorVertex).toBeUndefined();

            c.handleVertexDrag!(2, [-400_000, 0]);
            const after = coordsOf(c);
            expect(after[0]).toEqual([0, 60_000]);   // point 1 held
            expect(after[1]).toEqual([0, -60_000]);  // point 2 held
            // The rear followed the cursor, so the symbol is twice as long as it was.
            expect(after[2][0]).toBeLessThan(-390_000);
            expect(Math.abs(after[2][1])).toBeLessThan(1_000);
        },
    );

    it.each([TacticalGraphicName.ObstacleBypassEasy, TacticalGraphicName.ObstacleBypassDifficult,
             TacticalGraphicName.ObstacleBypassImpossible])(
        'holds an obstacle bypass rear grip on the middle of its bar — %s',
        name => {
            /*
             * **A drag comes in by the same door a draw does.** `normalizeDrawnBase` ran on
             * `drawend` and on restore only here, while MapLibre runs it on every build — so
             * a rear grip dragged sideways walked off the middle of the rear bar on this
             * engine and stayed on it on the other. Measured live before the fix: 1,454,816 m
             * of along-bar drift for one 150 px drag. @see LineGraphicController.settle
             */
            const c = getController(name, RES) as LineGraphicController;
            c.setBaseFeature(new Feature(new LineString([[0, 60_000], [0, -60_000], [-200_000, 0]])) as never);

            // Straight up the rear bar — the component the symbol has nowhere to put.
            c.handleVertexDrag!(2, [-200_000, 90_000]);
            const after = coordsOf(c);
            expect(Math.abs(after[2][1])).toBeLessThan(2_000);           // back on the axis
            expect(Math.abs(after[2][0] + 200_000)).toBeLessThan(5_000); // and no shorter
        },
    );

    it('publishes three handles: two ends and an apex', () => {
        const c = build(TacticalGraphicName.FieldsOfFire);
        expect(c.anchorVertex).toBe(0);
        const handles = c.graphic.getFeatures().find(f => f.get('role') === 'handle')?.getGeometry();
        expect((handles as unknown as {getCoordinates(): number[][]}).getCoordinates().length).toBeGreaterThanOrEqual(3);
    });

    it('leaves the free-form line family alone', () => {
        // **`PassageLane` left this list on 2026-08-21, and `Abatis` joined the other
        // one.** Both are two-point graphics whose end handle now moves that vertex:
        // lengthening the lane, or the run behind an abatis's chevron, is what dragging
        // its end means, and scaling the whole symbol is the resize affordance's job.
        for (const name of [TacticalGraphicName.PhaseLine, TacticalGraphicName.ObstacleLine,
                            TacticalGraphicName.Route]) {
            const c = getController(name, RES) as LineGraphicController;
            expect(c.dragsVertices).toBe(false);
            // The manager routes on the method's presence, so absence is the contract.
            expect(c.handleVertexDrag).toBeUndefined();
        }
    });

    it.each([TacticalGraphicName.PassageLane, TacticalGraphicName.Abatis])(
        '%s drags its own vertices',
        name => {
            const c = getController(name, RES) as LineGraphicController;
            expect(c.dragsVertices).toBe(true);
            expect(c.handleVertexDrag).toBeDefined();
        },
    );
});
