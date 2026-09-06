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

    it('keeps points 2 and 3 exactly where they were placed', () => {
        // They are the curved line's own endpoints, so placing both is what lets the operator
        // set its span and which way it faces. Two clicks had to construct one of them.
        for (const back of [[[0, 0.05], [0, -0.05]], [[0.01, 0.09], [-0.03, -0.02]]] as Position[][]) {
            const [, two, three] = anchors([CLICKS[0], back[0], back[1]]);
            expect(meters(two, back[0])).toBeLessThan(1);
            expect(meters(three, back[1])).toBeLessThan(1);
        }
    });

    it('squares point 1 onto the bisector, wherever it was clicked', () => {
        const back: Position[] = [[0, 0.05], [0, -0.05]];
        const middle = turf.midpoint(turf.point(back[0]), turf.point(back[1])).geometry.coordinates as Position;
        for (const aim of [[0.08, 0], [0.08, 0.04], [0.06, -0.05]] as Position[]) {
            const [one] = anchors([aim, back[0], back[1]]);
            const axis = turf.bearing(turf.point(middle), turf.point(one));
            const line = turf.bearing(turf.point(back[0]), turf.point(back[1]));
            expect(Math.abs(gap(axis, line) - 90)).toBeLessThan(0.5);
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
});
