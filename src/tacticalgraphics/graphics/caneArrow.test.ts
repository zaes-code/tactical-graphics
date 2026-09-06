/**
 * # The seven cane arrows are built from three anchor points
 *
 * APP-06 states one Anchor Points paragraph for all of them, word for word:
 *
 * > This symbol requires three anchor points. Point 1 defines the tip of the arrowhead.
 * > Point 2 defines the end of the straight line portion of the symbol. Point 3 defines the
 * > diameter and orientation of the 180 degree circular arc.
 *
 * 342500 (withdraw under pressure) has no Draw Rules cell of its own — its page opens with
 * the tail of 342400's paragraph continuing across the page break — so it inherits, as 94
 * other rows in the table do.
 *
 * Until 2026-09-06 the base held two points and the arc came from a `size` amplifier with a
 * `mirrored` flag for its side, so the third anchor point had nowhere to live and which way
 * the cane hung was a hidden boolean rather than a place. (User's call.)
 */
import {TacticalGraphicName, baseVertexCount, normalizeDrawnBase, renderTacticalGraphic} from '../index';
import type {Feature, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';

/** The seven, by the APP-06 code each one carries. */
const CANE_ARROWS: [TacticalGraphicName, string][] = [
    [TacticalGraphicName.Delay, '340800'],
    [TacticalGraphicName.Retirement, '342000'],
    [TacticalGraphicName.Withdraw, '342400'],
    [TacticalGraphicName.WithdrawUnderPressure, '342500'],
    [TacticalGraphicName.ForwardPassageOfLines, '344100'],
    [TacticalGraphicName.RearwardPassageOfLines, '344200'],
    [TacticalGraphicName.Disengage, '344400'],
];

/**
 * A stored base in APP-06's own order: `[tip, join, far]`.
 *
 * These are `TIP_FIRST_GRAPHICS`, so this is what persistence holds and what a user's clicks
 * become; the generator is handed the reverse. The run points due east and point 3 sits
 * north of point 2, which makes every bearing in the assertions a round number.
 */
const TIP: Position = [0.4, 0];
const JOIN: Position = [0, 0];
const FAR: Position = [0, 0.1];

const drawn = (name: TacticalGraphicName, coords: Position[], props: Record<string, unknown> = {}) =>
    renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: coords},
        properties: {tacticalGraphic: {name, ...props}},
    } as never);

const metres = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

describe('the seven cane arrows take three anchor points', () => {
    it.each(CANE_ARROWS)('%s (APP-06 %s) stores three, not two', name => {
        expect(baseVertexCount(name)).toBe(3);
    });

    it.each(CANE_ARROWS)('%s (APP-06 %s) hangs its arc off point 2, with point 3 as the diameter', name => {
        const out = drawn(name, [TIP, JOIN, FAR]);
        const parts = (out.graphic as Feature<MultiLineString>).geometry.coordinates;
        // `[straight, arrowhead, arc]` — the arc is emitted last. @see RetrogradeTask
        const arc = parts[parts.length - 1];

        // It begins where the straight ends...
        expect(metres(arc[0], JOIN)).toBeLessThan(1);
        // ...and finishes at point 3, a full diameter away.
        expect(metres(arc[arc.length - 1], FAR)).toBeLessThan(1);
        // Every point on it is one radius from the diameter's midpoint.
        const centre = turf.midpoint(turf.point(JOIN), turf.point(FAR)).geometry.coordinates as Position;
        const radius = metres(JOIN, FAR) / 2;
        for (const p of arc) expect(metres(centre, p)).toBeCloseTo(radius, -2);
    });

    it.each(CANE_ARROWS)('%s (APP-06 %s) bulges away from the arrowhead, not toward it', name => {
        // "The unit's current location is typically represented at the base of the arc" — the
        // cane hangs off the back. An arc bulging toward the tip is the symbol inside out, and
        // it is a believable picture, which is why it is asserted rather than eyeballed.
        const out = drawn(name, [TIP, JOIN, FAR]);
        const parts = (out.graphic as Feature<MultiLineString>).geometry.coordinates;
        const arc = parts[parts.length - 1];
        const apex = arc[Math.floor(arc.length / 2)];
        // The run goes east, so the apex has to sit west of point 2.
        expect(apex[0]).toBeLessThan(JOIN[0]);
    });

    it.each(CANE_ARROWS)('%s (APP-06 %s) grips all three of its anchor points', name => {
        const out = drawn(name, [TIP, JOIN, FAR]);
        const grips = (out.handles as Feature<MultiPoint>).geometry.coordinates;
        expect(grips).toHaveLength(3);
        // Emitted in generator order — point 3, point 2, point 1 — which is the order the
        // handle contract names. @see handleContract
        expect(metres(grips[0], FAR)).toBeLessThan(1);
        expect(metres(grips[1], JOIN)).toBeLessThan(1);
        expect(metres(grips[2], TIP)).toBeLessThan(1);
    });

    it.each(CANE_ARROWS)('%s (APP-06 %s) squares point 3 onto the perpendicular at point 2', name => {
        /*
         * "The 180 degree circular arc is always perpendicular to the line" — six of the seven
         * say so; 344400 disengage is the one row that omits the sentence and is drawn square
         * anyway, which is an interpretation recorded on the generator.
         *
         * So a third click off the square keeps only its across-axis component. Point 3 here
         * is dragged well down the run; the stored point must come back square to it.
         */
        const skewed: Position = [0.25, 0.1];
        const anchors = normalizeDrawnBase(name, [TIP, JOIN, skewed]);
        expect(anchors).toHaveLength(3);
        const axis = turf.bearing(turf.point(JOIN), turf.point(TIP));
        const toPoint3 = turf.bearing(turf.point(JOIN), turf.point(anchors[2]));
        const off = (((toPoint3 - axis) % 360) + 360) % 360;
        expect(Math.min(Math.abs(off - 90), Math.abs(off - 270))).toBeLessThan(0.5);
    });

    it.each(CANE_ARROWS)('%s (APP-06 %s) still draws a base saved with two points and a flag', name => {
        /*
         * A graphic saved before 2026-09-06 has `[tip, join]` and states its arc as a `size`
         * with a `mirrored` side. It has to keep rendering, and the flag has to keep choosing
         * the side — there is nothing else in a two-point base that can.
         */
        const left = drawn(name, [TIP, JOIN], {decorationSize: 8000, mirrored: false});
        const right = drawn(name, [TIP, JOIN], {decorationSize: 8000, mirrored: true});
        const arcOf = (o: ReturnType<typeof drawn>) => {
            const parts = (o.graphic as Feature<MultiLineString>).geometry.coordinates;
            return parts[parts.length - 1];
        };
        expect(arcOf(left).length).toBeGreaterThan(2);
        expect(arcOf(left)).not.toEqual(arcOf(right));
    });
});
