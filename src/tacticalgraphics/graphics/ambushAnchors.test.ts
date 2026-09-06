/**
 * # APP-06 141700's three anchor points, all of them placed
 *
 * > **Anchor Points.** This symbol requires three anchor points. Point 1 is the tip of the
 * > arrowhead. Points 2 and 3 define the endpoints of the curved line on the back side of the
 * > symbol.
 * >
 * > **Size/Shape.** […] The rear of the arrowhead line shall connect to the midpoint of the
 * > line between points 2 and 3. The arrowhead line shall be perpendicular to the line formed
 * > by points 2 and 3.
 *
 * **The same pair of sentences 152000 attack by fire carries**, and the same consequence:
 * three freely placed points over-constrain the arrow. Points 2 and 3 are what the plate
 * gives the curved back's endpoints to, so point 1 yields — squared onto their bisector,
 * keeping only its reach from the middle. Both graphics were two-click draws that guessed
 * point 3 until 2026-09-06. (User's call: "ambush is similar, make the same changes there".)
 *
 * The arc's radius follows from the chord rather than being set: the curve spans a known 120
 * degrees, so the two placed endpoints determine it. That is also why squaring point 1 is
 * load-bearing rather than tidy — `arcAndArrowFromAnchors` solves for the centre by walking
 * the geodesic from the chord's midpoint through the tip, which is the symmetry axis only if
 * the tip is on it.
 */
import type {Feature, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';
import {renderTacticalGraphic} from '../core/render';
import {normalizeDrawnBase} from '../core/drawnBase';
import {ARC_ARROW_MIN_REACH, anchorsForArcAndArrow, arcAndArrowFromAnchors} from '../core/anchors';
import {drawClickCount} from '../core/symbology';
import {baseVertexCount, usesDrawnAnchors} from '../core/handles';
import {TacticalGraphicName} from '../core/type';

const NAME = TacticalGraphicName.Ambush;
/** The tip, then the curved back's two endpoints. */
const CLICKS: Position[] = [[0.08, 0], [0, 0.05], [0, -0.05]];

const meters = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});
const gap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const anchors = (clicks: Position[]) => normalizeDrawnBase(NAME, clicks);

describe('141700 places all three of its anchor points', () => {
    it('is drawn in three clicks, on a three-point base', () => {
        expect(drawClickCount(NAME)).toBe(3);
        expect(baseVertexCount(NAME)).toBe(3);
    });

    it('keeps the chord the clicks describe, and lands its ends on the arc', () => {
        /*
         * **Points 2 and 3 are not independent of each other, and cannot be.** A 120 degree
         * arc symmetric about the arrow's axis has exactly two ends, settled once the centre,
         * the radius and the aim are — so three clicks carry one more number than the symbol
         * can hold, and the reading absorbs it. What it keeps is what the operator was
         * actually stating: the chord's length, and where its middle is.
         *
         * That absorption is what puts the grips on the graphic. Handing back the raw clicks
         * let the stored pair drift from the pair the generator draws, and the grip stayed
         * behind on a coordinate no longer on the symbol. (User's report: "point 3 handle
         * falls out of the graphic during editing".)
         */
        for (const back of [[[0, 0.05], [0, -0.05]], [[0.01, 0.09], [-0.03, -0.02]]] as Position[][]) {
            const clicked = meters(back[0], back[1]);
            const [, two, three] = anchors([CLICKS[0], back[0], back[1]]);
            expect(meters(two, three) / clicked).toBeCloseTo(1, 2);

            // Both ends sit on the arc the frame describes, which is the property that keeps
            // a grip on the line work.
            const frame = arcAndArrowFromAnchors([CLICKS[0], two, three])!;
            expect(Math.abs(meters(frame.center, two) - frame.radius) / frame.radius).toBeLessThan(0.01);
            expect(Math.abs(meters(frame.center, three) - frame.radius) / frame.radius).toBeLessThan(0.01);
        }
    });

    it('moves nothing at all when the three clicks already agree', () => {
        // The absorption only bites on a placement the symbol cannot hold. Put the tip on the
        // chord's own bisector — which is where the plate puts it — and every point is kept.
        const back: Position[] = [[0, 0.05], [0, -0.05]];
        const onAxis: Position = [0.08, 0];
        const [one, two, three] = anchors([onAxis, back[0], back[1]]);
        expect(meters(two, back[0])).toBeLessThan(1);
        expect(meters(three, back[1])).toBeLessThan(1);
        expect(meters(one, onAxis)).toBeLessThan(1);
    });

    it('connects the arrow to the chord’s midpoint without moving the tip', () => {
        /*
         * **141700 does not need point 1 squared, and squaring it does harm.**
         *
         * 152000 attack by fire does need it: its back is a straight line and the arrow has
         * to stand at a right angle to it. This one's back is an *arc*, and
         * `arcAndArrowFromAnchors` already solves for the centre by walking the geodesic from
         * the chord's midpoint through the tip — so that line is the symmetry axis whatever
         * the aim, and the plate's "the rear of the arrowhead line shall connect to the
         * midpoint" holds by construction.
         *
         * Adding a projection on top was measured moving a correctly built ambush by 2.6% of
         * its radius, because the projection is planar and the construction is geodesic. A
         * reading that shifts a symbol it was handed correct is one that walks it, since it
         * runs on every render — so what is asserted is that it does not.
         */
        const built = anchorsForArcAndArrow([-1.5, 51.2], 200_000, 30, 2);
        const read = anchors(built);
        read.forEach((p, i) => expect(meters(p, built[i])).toBeLessThan(1));
    });

    it('never lets the arrowhead fall inside the arc', () => {
        /*
         * The arrow runs from the chord's midpoint at `0.5r` out to `reach * r`, and its head
         * is `0.25r` long at 30 degrees — so the barbs sit `0.217r` back from the tip and the
         * head is drawn *inside* the bulge for any reach below about 1.22. Held just clear of
         * that, in the reading rather than the drawing, so it holds for an edit as well as a
         * draw. (User's call: "don't ever let the arrow tip fall into the arch during drawing
         * or editing.") @see ARC_ARROW_MIN_REACH
         */
        const centre: Position = [-1.5, 51.2];
        const radius = 200_000;
        for (const asked of [3, 1.8, 1.3, 1.1, 0.6, 0.05]) {
            const read = anchors(anchorsForArcAndArrow(centre, radius, 30, asked));
            const frame = arcAndArrowFromAnchors(read)!;
            expect(frame.arrowReach).toBeGreaterThanOrEqual(ARC_ARROW_MIN_REACH - 0.01);
            // …and a reach that already clears it is left exactly alone.
            if (asked >= ARC_ARROW_MIN_REACH) expect(frame.arrowReach).toBeCloseTo(asked, 2);
        }
    });

    it('publishes a grip on each of the three', () => {
        // The derived pair already landed exactly on points 1 and 2; point 3 had none, so the
        // one endpoint an operator would reach for to reshape the curve could not be grabbed.
        const settled = anchors(CLICKS);
        const grips = (renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name: NAME}},
            geometry: {type: 'LineString', coordinates: settled},
        } as Feature).handles.geometry as MultiPoint).coordinates;
        expect(grips).toHaveLength(3);
        grips.forEach((g, i) => expect(meters(g, settled[i])).toBeLessThan(1));
    });

    it('still previews from two clicks, holding the shape', () => {
        // The second click shows a whole symbol rather than nothing, at the arc's own 120
        // degrees and the dropped form's reach — a preview convention, replaced by the third
        // click. @see ambushAnchors
        const preview = anchors([CLICKS[0], CLICKS[1]]);
        expect(preview).toHaveLength(3);
        expect(meters(preview[0], CLICKS[0])).toBeLessThan(1);
        expect(meters(preview[1], CLICKS[1])).toBeLessThan(1);
    });

    it('is idempotent, so an edit does not walk the symbol', () => {
        const settled = anchors(CLICKS);
        anchors(settled).forEach((p, i) => expect(meters(p, settled[i])).toBeLessThan(1));
    });

    it('lengthens the arrow alone when point 1 moves, leaving the arc alone', () => {
        /*
         * **The reach and the radius are separate numbers, and the gesture has to keep them
         * separate.** Every edit drag ran through a scale about the centre — `editStretches`
         * on an `AnchorClickController` — so grabbing the arrow tip resized the whole symbol,
         * arc and all. Nothing about the geometry required that. (User's call, 2026-09-06:
         * "allow the user to drag point 1 to lengthen the arrow line w/o resizing
         * wholesomely. Only the resize icon should resize wholesomely.")
         *
         * Asserted through the library's own reader, which is what both engines run on an
         * edited base: move point 1 out along its axis and the chord — and so the arc's
         * radius, which follows from it — must not move at all.
         */
        const settled = anchors(CLICKS);
        const chord = meters(settled[1], settled[2]);
        const middle = turf.midpoint(turf.point(settled[1]), turf.point(settled[2]))
            .geometry.coordinates as Position;
        const reach = meters(middle, settled[0]);

        // The tip dragged twice as far out, along the bisector it already sits on.
        const axis = turf.bearing(turf.point(middle), turf.point(settled[0]));
        const pulled = turf.destination(turf.point(middle), reach * 2, axis, {units: 'meters'})
            .geometry.coordinates as Position;
        const after = anchors([pulled, settled[1], settled[2]]);

        expect(meters(after[1], after[2])).toBeCloseTo(chord, -1);
        expect(meters(middle, after[0]) / reach).toBeCloseTo(2, 1);
    });

    it('is no longer read back as a frame, which is what made every drag a scale', () => {
        // `DRAWN_ANCHOR_GRAPHICS` routes the centre / size / rotation machinery a graphic
        // needs when its points are decomposed into scalars and laid back out. 141700's
        // points are its shape, so it left — the same move 344000 pursuit made, for the same
        // symptom. Asserted against the registry, which is the only thing a renderer reads.
        expect(usesDrawnAnchors(NAME)).toBe(false);
    });

    it('publishes grips read the same way the drawing is, so a rotate cannot part them', () => {
        /*
         * **A rotate does not go through the normalizer.** It writes turned coordinates
         * straight onto the base, and a turn computed in projected metres does not leave a
         * geodesic 120 degree arc exactly consistent — so the drawing settles them on the way
         * past. Publishing the grips off the *raw* base placed them from one description and
         * the arc from another, and point 3's dot sat off the symbol after a rotation.
         * (User's report, 2026-09-06: "point 3 handle goes off the graphic after rotation".)
         *
         * Simulated here as a base nudged off consistency, which is what a rotate leaves.
         */
        const settled = anchors(CLICKS);
        const nudged: Position[] = [
            settled[0],
            [settled[1][0] + 0.004, settled[1][1] - 0.003],
            [settled[2][0] - 0.002, settled[2][1] + 0.005],
        ];
        const rendered = renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name: NAME}},
            geometry: {type: 'LineString', coordinates: nudged},
        } as Feature);

        const grips = (rendered.handles.geometry as MultiPoint).coordinates;
        const drawn = (rendered.graphic.geometry as {coordinates: Position[][]}).coordinates.flat();
        // Every grip lies on a point the symbol actually draws.
        for (const grip of grips) {
            expect(Math.min(...drawn.map(d => meters(grip, d)))).toBeLessThan(1);
        }
    });
});
