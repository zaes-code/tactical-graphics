/**
 * # 341900's four anchor points, three of which are clicked
 *
 * > **Anchor Points.** This symbol requires four anchor points. Point 1 defines the tip of
 * > the arrowhead. Point 2 defines the end of the straight line portion of the first arrow.
 * > Points 3 and 4 define the length of the second straight line.
 * >
 * > **Size/Shape.** Points 1 and 2 and points 3 and 4 determine the length of each side.
 * > Points 2 and 3 shall be connected by a smooth, curved line.
 *
 * Relief in place had **no geometry coverage at all** — it appeared in three OpenLayers
 * suites and in none of the library's own — which is how a preview that drew the symbol
 * backwards for the whole of a draw got as far as a user's screen. Its shape rules are
 * 343300 demonstration's, read through the same function, so what is asserted here is the
 * half that is 341900's alone: the direction its half-drawn form points, and the two
 * opposed arrows that make it a relief rather than a demonstration.
 *
 * @see hairpinAnchors — the reading, stated once for both graphics
 * @see escortAndDemonstrationPaints.test.ts — the shared rules, asserted on 343300
 */
import type {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';
import {renderTacticalGraphic} from '../core/render';
import {drawClickCount} from '../core/symbology';
import {anchorVertex, baseVertexCount} from '../core/handles';
import {TacticalGraphicName} from '../core/type';

const NAME = TacticalGraphicName.ReliefInPlace;

/** APP-06's own order: the arrowhead tip, the first straight's end, then across it. */
/*
 * **Kept small on purpose.** These are geodesics, and two of them a few degrees apart in
 * latitude differ in initial bearing by the meridians' own convergence — nearly 3 degrees
 * across a 12-degree leg, which is the sphere rather than the symbol. At the size a relief
 * in place is actually drawn the effect is a hundredth of a degree.
 */
const P1: Position = [-0.8, 20];
const P2: Position = [0.4, 20];
const P3: Position = [0.4, 19.4];

const render = (coordinates: Position[]) =>
    renderTacticalGraphic({
        type: 'Feature',
        properties: {tacticalGraphic: {name: NAME}},
        geometry: {type: 'LineString', coordinates},
    } as Feature);

const parts = (coordinates: Position[]) => (render(coordinates).graphic.geometry as MultiLineString).coordinates;
const bearing = (a: Position, b: Position) => turf.bearing(turf.point(a), turf.point(b));
const meters = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});
/** Angular distance between two bearings, 0 to 180. */
const gap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('APP-06 341900 — relief in place', () => {
    it('is drawn in three clicks and stored as four', () => {
        // Point 4 is where "parallel and the same length" puts it, so it carries no
        // decision and is not asked for. @see hairpinAnchors
        expect(drawClickCount(NAME)).toBe(3);
        expect(baseVertexCount(NAME)).toBe(4);
        // …and it gets an inert dot rather than a grip, since a drag could not move it.
        expect(anchorVertex(NAME)).toBe(3);
    });

    it('runs the first straight from point 1 to point 2, and the second back', () => {
        const drawn = parts([P1, P2, P3]);
        // Three parts before the arrowheads: the second straight, the turn, the first.
        expect(drawn.length).toBeGreaterThanOrEqual(3);
        const first = drawn[2];
        expect(meters(first[1], P1)).toBeLessThan(1);
        expect(meters(first[0], P2)).toBeLessThan(1);
        // Equal, and opposed — the two formations pass in opposite directions, which is
        // what the symbol says.
        expect(meters(drawn[0][0], drawn[0][1])).toBeCloseTo(meters(first[0], first[1]), -1);
        expect(gap(bearing(first[0], first[1]), bearing(drawn[0][0], drawn[0][1]))).toBeCloseTo(180, 0);
    });

    /**
     * **The half-drawn symbol points where the finished one will.**
     *
     * Two points is what the operator sees between click 1 and click 2 — and 341900 read
     * that pair *end-for-end*, a flip left over from its time in `TIP_FIRST_GRAPHICS`. So
     * the preview drew the arrows backwards for the whole of the draw and the symbol
     * snapped round on the last click. (User's report, 2026-09-06: "when drawing rip the
     * graphic appears wrong direction after click 1 and then correct/flips after click 2".)
     */
    it('previews the same direction it will finish in', () => {
        const preview = parts([P1, P2]);
        const finished = parts([P1, P2, P3]);
        // The first straight runs P1 → P2 in both, so the arrowhead is at the same end
        // before and after the third click.
        expect(gap(bearing(preview[2][0], preview[2][1]), bearing(finished[2][0], finished[2][1]))).toBeLessThan(1);
        expect(meters(preview[2][1], P1)).toBeLessThan(1);
    });

    it('holds the legs parallel and equal wherever point 3 is dragged', () => {
        // Both engines drag a base vertex straight to the pointer, so the constraint can
        // only live in the re-derivation. Point 3 on either side of the first leg mirrors
        // the symbol; neither side may splay it.
        for (const third of [[0.4, 19.4], [0.4, 20.6], [0.9, 19.2], [-0.2, 20.7]] as Position[]) {
            const drawn = parts([P1, P2, third]);
            const [first, second] = [drawn[2], drawn[0]];
            expect(meters(second[0], second[1]) / meters(first[0], first[1])).toBeCloseTo(1, 2);
            expect(gap(bearing(first[0], first[1]), bearing(second[0], second[1]))).toBeCloseTo(180, 0);
        }
    });

    it('publishes a grip on each placed point and none on the derived one', () => {
        const handles = (render([P1, P2, P3]).handles.geometry as MultiPoint).coordinates;
        expect(handles).toHaveLength(3);
        expect(meters(handles[0], P1)).toBeLessThan(1);
        expect(meters(handles[1], P2)).toBeLessThan(1);
    });

    it('carries a LineString base, whatever it was handed', () => {
        // A raw-GeoJSON reader can hand it anything; a half base must still draw rather
        // than throw, which is what the preview depends on.
        for (const coordinates of [[P1, P2], [P1, P2, P3], [P1, P2, P3, [-0.8, 19.4]]] as Position[][]) {
            const geometry = render(coordinates).graphic.geometry as MultiLineString;
            expect(geometry.type).toBe('MultiLineString');
            expect(geometry.coordinates.length).toBeGreaterThanOrEqual(3);
        }
    });
});

/** Silences the unused-type warning for the base shape this file documents. */
export type _Base = Feature<LineString>;
