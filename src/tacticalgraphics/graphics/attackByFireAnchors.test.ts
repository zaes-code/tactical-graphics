/**
 * # APP-06 152000's three anchor points, from the two clicks that determine them
 *
 * > **Anchor Points:** This symbol requires three anchor points. Point 1 is the tip of the
 * > arrowhead. Points 2 and 3 define the endpoints of the straight line on the back side of
 * > the symbol.
 * >
 * > **Size/Shape:** Points 2 and 3 determine the length of the straight line on the back side
 * > of the symbol. The rear of the arrowhead line shall connect to the midpoint of the line
 * > between points 2 and 3. The arrowhead line shall be perpendicular to the line formed by
 * > points 2 and 3.
 *
 * **Those last two sentences are 141700 ambush's, word for word.** They have the same
 * consequence — fix the tip and one end of the back line and every remaining choice of axis
 * still satisfies both, so the rule describes a *family* rather than one symbol — and this
 * graphic closes it the way ambush does: the shape is held and the click sets only the size.
 * (User's call, 2026-09-06: "attack by fire should be same behaviour as ambush".)
 *
 * What it replaced: a two-point base, a bar that was a fixed 0.45 of the shaft, and a derived
 * width grip to drag it — so the back line whose "left and right limits of coverage" the
 * symbol exists to state was a ratio nobody had stated.
 */
import type {Feature, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';
import {renderTacticalGraphic} from '../core/render';
import {normalizeDrawnBase} from '../core/drawnBase';
import {drawClickCount} from '../core/symbology';
import {baseVertexCount, handleContract, ratioLockOf} from '../core/handles';
import {TacticalGraphicName} from '../core/type';

const NAME = TacticalGraphicName.AttackByFire;
/** The tip, then one end of the back line — the two clicks the draw takes. */
const CLICKS: Position[] = [[0.08, 0], [0, 0.05]];

const meters = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});
const gap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

const anchors = (clicks: Position[]) => normalizeDrawnBase(NAME, clicks);

describe('152000 reads two clicks into the three points its plate names', () => {
    it('keeps the tip and the clicked end exactly while previewing, at two clicks', () => {
        const [tip, two, three] = anchors(CLICKS);
        expect(anchors(CLICKS)).toHaveLength(3);
        expect(meters(tip, CLICKS[0])).toBeLessThan(1);
        // The click is point 2, not "one of the two ends" — the same rule ambush settled on,
        // so the second click means the same thing every time.
        expect(meters(two, CLICKS[1])).toBeLessThan(1);
        expect(meters(three, CLICKS[1])).toBeGreaterThan(1);
    });

    it('keeps points 2 and 3 exactly where they were placed, at three clicks', () => {
        /*
         * **The back line is the operator's, length and orientation both.** *"Points 2 and 3
         * determine the length of the straight line on the back side of the symbol."* Two
         * clicks had to guess one of them; three do not. (User's call: "let's let the user
         * pick point 3 as documentation says. That will let them decide length of line 2,3".)
         */
        for (const back of [[[0, 0.05], [0, -0.05]], [[0.01, 0.09], [-0.03, -0.02]]] as Position[][]) {
            const placed: Position[] = [CLICKS[0], back[0], back[1]];
            const [, two, three] = anchors(placed);
            expect(meters(two, back[0])).toBeLessThan(1);
            expect(meters(three, back[1])).toBeLessThan(1);
        }
    });

    it('squares point 1 onto the bisector of the back line, wherever it was clicked', () => {
        /*
         * Three free points over-constrain the arrow — it cannot start at point 1, meet the
         * midpoint *and* stand square unless one of them gives. Point 1 does, and it is read
         * for the one thing the symbol can express: how far the arrow reaches from the
         * middle. Its component along the back line is dropped rather than stored and
         * ignored. ("Arrowline needs to always be at the middle/center of line 2,3.")
         */
        const back: Position[] = [[0, 0.05], [0, -0.05]];
        const middle = turf.midpoint(turf.point(back[0]), turf.point(back[1])).geometry.coordinates as Position;
        // Three very different aims for point 1, including two well off the bisector.
        for (const aim of [[0.08, 0], [0.08, 0.04], [0.06, -0.05]] as Position[]) {
            const [one] = anchors([aim, back[0], back[1]]);
            const axis = turf.bearing(turf.point(middle), turf.point(one));
            const line = turf.bearing(turf.point(back[0]), turf.point(back[1]));
            expect(Math.abs(gap(axis, line) - 90)).toBeLessThan(0.5);
            // …and the reach it kept is the across-component of the aim, not its full length.
            expect(meters(one, middle)).toBeLessThanOrEqual(meters(aim, middle) + 1);
        }
    });

    it('satisfies both of the plate\'s constraints exactly', () => {
        const [tip, two, three] = anchors(CLICKS);
        const middle = turf.midpoint(turf.point(two), turf.point(three)).geometry.coordinates as Position;

        // "The arrowhead line shall be perpendicular to the line formed by points 2 and 3."
        const axis = turf.bearing(turf.point(tip), turf.point(middle));
        const back = turf.bearing(turf.point(two), turf.point(three));
        expect(Math.abs(gap(axis, back) - 90)).toBeLessThan(0.5);

        // "The rear of the arrowhead line shall connect to the midpoint of the line between
        // points 2 and 3." Built by reflection, so the two halves are equal by construction
        // rather than to rounding.
        expect(meters(two, middle)).toBeCloseTo(meters(three, middle), 0);
    });

    it('is idempotent, and a dragged point 3 survives it', () => {
        /*
         * The reading runs on every render, not only at draw time — that is what holds the
         * constraints under an edit, since both engines drag a base vertex straight to the
         * pointer. It must therefore leave a settled base alone, **and** it must not recompute
         * point 3 from points 1 and 2 once it is stored: only the *draw* constructs it. A
         * reader that rebuilt it every time would spring the back line's far end back on every
         * render, which is the defect this same mechanism exists to prevent one point earlier.
         */
        const settled = anchors(CLICKS);
        anchors(settled).forEach((p, i) => expect(meters(p, settled[i])).toBeLessThan(1));

        const dragged: Position[] = [settled[0], settled[1], [0.02, -0.09]];
        expect(meters(anchors(dragged)[2], dragged[2])).toBeLessThan(1);
    });

    it('places all three of its points, with a grip on each', () => {
        expect(drawClickCount(NAME)).toBe(3);
        expect(baseVertexCount(NAME)).toBe(3);
        expect(handleContract(NAME).roles).toEqual(['shape', 'shape', 'shape']);

        const settled = anchors(CLICKS);
        const grips = (renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name: NAME}},
            geometry: {type: 'LineString', coordinates: settled},
        } as Feature).handles.geometry as MultiPoint).coordinates;
        expect(grips).toHaveLength(3);
        grips.forEach((g, i) => expect(meters(g, settled[i])).toBeLessThan(1));
    });

    it('is no longer ratio-locked, because its plate states the two dimensions apart', () => {
        /*
         * A lock says the aspect ratio is not the operator's to set, and 152000 gives the back
         * line its own two anchor points while point 1 gives the reach. The 0.45 survives as
         * the *preview* proportion two clicks are read through — a default, not a constraint.
         *
         * `RATIO_LOCK` is renderer-read, so a test against the generator cannot see it: this
         * asserts the registry directly, which is the only thing that can.
         * @see ai/conventions.md, "A control run has to be able to see the thing it reverts"
         */
        expect(ratioLockOf(NAME)).toBeUndefined();
    });

    it('still draws a graphic saved as two points and a size', () => {
        // Every attack by fire saved before 2026-09-06 is a shaft and nothing else. It keeps
        // drawing as the ratio-built symbol it was, and grows its third point on the first
        // edit that goes through the reader.
        const legacy = renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name: NAME, radius: 40_000}},
            geometry: {type: 'LineString', coordinates: [[0, 0], [0.08, 0]]},
        } as Feature);
        expect((legacy.graphic.geometry as {coordinates: unknown[]}).coordinates.length).toBeGreaterThan(0);
    });

    it('previews the symbol it is drawing, not that symbol reversed', () => {
        /*
         * **The mid-draw reading.** After the first click the base is `[tip, cursor]`, and a
         * two-point base used to be the legacy shaft `[bar centre, tip]` — which runs the
         * other way. So between the clicks the bar sat on the arrowhead's own point and the
         * arrowhead chased the cursor: the symbol backwards. (User's report: "after click
         * one, point 2 needs to get the handle, then point 3 gets the handle".)
         *
         * Both are read through one function now, so what the preview draws is what lands.
         */
        const sketch = renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name: NAME}},
            geometry: {type: 'LineString', coordinates: CLICKS},
        } as Feature);
        const parts = (sketch.graphic.geometry as {coordinates: Position[][]}).coordinates;

        /*
         * Read off the **shaft**, which `getAttackByFireSymbol` emits as `[bar centre, tip]`.
         * The bracket's own endpoints are its swept-back feathers rather than the bar's ends,
         * so their midpoint is not the centre — a fact that cost a first version of this
         * assertion, which measured the wrong thing and failed on correct geometry.
         */
        const settled = anchors(CLICKS);
        const middle = turf.midpoint(turf.point(settled[1]), turf.point(settled[2]))
            .geometry.coordinates as Position;
        const shaft = parts[1];
        // The arrowhead end of the shaft is point 1, where the operator clicked first — the
        // plate's own numbering — and its other end is the back line's midpoint.
        expect(meters(shaft[1], settled[0])).toBeLessThan(1);
        expect(meters(shaft[0], middle)).toBeLessThan(1);

        // …and the grip follows the point being placed, rather than the draw showing none.
        const grips = (sketch.handles.geometry as MultiPoint).coordinates;
        expect(grips).toHaveLength(3);
        expect(meters(grips[1], CLICKS[1])).toBeLessThan(1);
    });

    it('draws nothing at all from a single click', () => {
        // One point is a shaft of zero length, which built a degenerate symbol on a division
        // by nothing. A draw that has only just started shows nothing, as its siblings do.
        const one = renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name: NAME}},
            geometry: {type: 'LineString', coordinates: [CLICKS[0]]},
        } as Feature);
        expect((one.graphic.geometry as {coordinates: unknown[]}).coordinates).toHaveLength(0);
    });
});
