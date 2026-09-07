/**
 * # 152100's half-drawn symbol is the symbol being drawn
 *
 * > **152100 support by fire.** This symbol requires four anchor points. **Points 1 and 2
 * > define the endpoints of the straight line on the back side of the symbol. Points 3 and 4
 * > define the tips of the arrowheads.** […] The rear of the arrows should connect to points 1
 * > and 2. […] The back side of the symbol encompasses the firing position, while the
 * > arrowheads typically indicate the left and right limits of coverage.
 *
 * Four decisions, four clicks — and between them the generator drew something else. Below four
 * points it fell back to the pre-2026-09-06 description, a shaft with the bar sized as a ratio
 * of it, which takes the placed points to mean something entirely different: measured in the
 * app, a back line clicked from (550,530) to (950,530) previewed a figure spanning x 396–759
 * and y 225–839, touching neither click. Its grips collapsed too — the fallback answered
 * `[coords[0], coords[0], coords[last]]`, so three sat on point 1 and the point being placed
 * had none. (User's report, 2026-09-06: "support by fire is good but the drawing preview needs
 * to follow the correct points/handles".)
 *
 * The finished symbol was right throughout. Only the half-drawn one was wrong, which is why
 * nothing here had ever noticed: every fixture in this repository states four points.
 */
import type {Feature, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';
import {renderTacticalGraphic} from '../core/render';
import {normalizeDrawnBase} from '../core/drawnBase';
import {drawClickCount} from '../core/symbology';
import {baseVertexCount} from '../core/handles';
import {SUPPORT_BY_FIRE_PREVIEW_REACH, supportByFireAnchors} from '../core/anchors';
import {TacticalGraphicName} from '../core/type';

const NAME = TacticalGraphicName.SupportByFire;

/** The four clicks: the back line west to east, then each arrow tip north of its own end. */
const CLICKS: Position[] = [[-1, 20], [1, 20], [-1, 20.7], [1, 20.7]];

const metres = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

/** The turn from `a → b` to `a → p`, folded into ±180. Negative is left, positive is right. */
const turn = (a: Position, b: Position, p: Position) =>
    ((turf.bearing(turf.point(a), turf.point(p)) - turf.bearing(turf.point(a), turf.point(b)) + 540) % 360) - 180;

const drawn = (coords: Position[]) =>
    renderTacticalGraphic({
        type: 'Feature',
        properties: {tacticalGraphic: {name: NAME}},
        geometry: {type: 'LineString', coordinates: coords},
    } as Feature);

const ink = (coords: Position[]) => (drawn(coords).graphic.geometry as MultiLineString).coordinates.flat() as Position[];
const grips = (coords: Position[]) => (drawn(coords).handles.geometry as MultiPoint).coordinates;

/** Whether any drawn coordinate lands on `p` — the symbol actually touching a placed point. */
const inkTouches = (coords: Position[], p: Position) => ink(coords).some(c => metres(c, p) < 1);

describe('152100 resolves however many points have been placed', () => {
    it('is drawn in four clicks, and stores the four the plate numbers', () => {
        expect(baseVertexCount(NAME)).toBe(4);
        // Named in `DRAW_CLICKS` even though it equals the stored count: MapLibre asks the
        // *normalized* sketch whether a draw is finished, and the reader answers four from
        // two. Without it the draw ended on the second click. @see supportByFireAnchors
        expect(drawClickCount(NAME)).toBe(4);
    });

    it('draws nothing from a single click', () => {
        // A draw that has only just started has no back line, and a symbol built on a
        // zero-length one is a degenerate shape rather than a preview. 152000 answers the
        // same way, which is the behaviour signed off for it.
        expect(supportByFireAnchors([CLICKS[0]])).toBeUndefined();
        expect(supportByFireAnchors(undefined)).toBeUndefined();
        expect(supportByFireAnchors([CLICKS[0], CLICKS[0]])).toBeUndefined();
    });

    it('previews both arrows off the back line the operator has placed', () => {
        const [one, two] = CLICKS;
        const preview = supportByFireAnchors([one, two])!;
        expect(preview).toHaveLength(4);

        // Points 1 and 2 are exactly where they were clicked — a preview must never move a
        // point the operator placed.
        expect(metres(preview[0], one)).toBeLessThan(1);
        expect(metres(preview[1], two)).toBeLessThan(1);

        // Each tip stands square off its own end, at the same reach.
        const back = metres(one, two);
        expect(metres(preview[2], one)).toBeCloseTo(back * SUPPORT_BY_FIRE_PREVIEW_REACH, -1);
        expect(metres(preview[3], two)).toBeCloseTo(back * SUPPORT_BY_FIRE_PREVIEW_REACH, -1);
        expect(Math.abs(Math.abs(turn(one, two, preview[2])) - 90)).toBeLessThan(0.5);

        // Left of point 1 → point 2, where the Template draws its arrows: it letters PT 1 on
        // the left end and PT 2 on the right, and both arrows rise from them.
        expect(turn(one, two, preview[2])).toBeLessThan(0);
        expect(turn(one, two, preview[3])).toBeLessThan(0);
    });

    it('keeps the third click and derives a matching fourth', () => {
        const [one, two, three] = CLICKS;
        const preview = supportByFireAnchors([one, two, three])!;

        // Point 3 is the operator's, untouched…
        expect(metres(preview[2], three)).toBeLessThan(1);
        // …and point 4 has the same reach and bearing off point 2 that point 3 has off point
        // 1, so the arrows stay a pair while only one of them has been chosen. Geodesic, so
        // the second arrow is the same *length* rather than the same difference in degrees.
        expect(metres(preview[3], two)).toBeCloseTo(metres(three, one), -1);
        const first = turf.bearing(turf.point(one), turf.point(three));
        const second = turf.bearing(turf.point(two), turf.point(preview[3]));
        expect(Math.abs(((first - second + 540) % 360) - 180)).toBeLessThan(0.5);
    });

    it('leaves four placed points alone', () => {
        // Idempotent, because it runs on every render: a base it has already settled must come
        // back unchanged or an edit walks the symbol.
        const settled = supportByFireAnchors(CLICKS)!;
        settled.forEach((p, i) => expect(metres(p, CLICKS[i])).toBeLessThan(1));
        expect(normalizeDrawnBase(NAME, CLICKS)).toHaveLength(4);
        normalizeDrawnBase(NAME, normalizeDrawnBase(NAME, CLICKS)).forEach((p, i) =>
            expect(metres(p, CLICKS[i])).toBeLessThan(1),
        );
    });

    it.each([2, 3, 4])('draws through the points placed by click %s', count => {
        // **The preview is the symbol, not a stand-in for it.** The back line the operator
        // clicked has to be ink at every stage; the fallback drew a figure that touched
        // neither of its own points.
        const placed = CLICKS.slice(0, count);
        expect(inkTouches(placed, CLICKS[0])).toBe(true);
        expect(inkTouches(placed, CLICKS[1])).toBe(true);
    });

    it.each([2, 3, 4])('grips every resolved point at click %s', count => {
        const placed = CLICKS.slice(0, count);
        const resolved = supportByFireAnchors(placed)!;
        const published = grips(placed);
        expect(published).toHaveLength(4);
        resolved.forEach((p, i) => expect(metres(published[i], p)).toBeLessThan(1));
        // And they are four distinct places, rather than the collapsed set the fallback gave.
        expect(new Set(published.map(p => p.join(','))).size).toBe(4);
    });
});
