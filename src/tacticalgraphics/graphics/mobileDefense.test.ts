/**
 * # 152800's three anchor points
 *
 * Mobile defence states its own rule, and the picture the Template draws settles the rest:
 *
 * > **Anchor Points:** This symbol requires three anchor points. Point 1 defines the tip of
 * > the arrowhead. Point 2 defines the end of the straight line portion of the symbol.
 * > Point 3 defines the diameter and orientation of the 180 degree circular arc.
 * >
 * > **Size/Shape:** Points 1 and 2 determine the length of the straight line portion of the
 * > symbol. Point 3 defines which side of the line the arc is on and the diameter of the
 * > arc. The number of barbs shall remain proportional as the area enlarges.
 *
 * It was a two-point **ellipse** with a gap in it and an arrow leaving one of its arcs —
 * not a shape the plate draws — whose only asymmetry was a hidden `mirrored` amplifier.
 * (User's call, 2026-09-06.)
 *
 * What is asserted here is the half that would drift silently: which points make the
 * straight line, that the arc's diameter is perpendicular to it and bulges away from the
 * arrowhead, that point 3's along-the-line component is discarded, and that a mobile
 * defence saved under the old description still draws on the side it was saved on.
 */
import {TacticalGraphicName} from '../core/type';
import {renderTacticalGraphic} from '../core/render';
import {baseVertexCount, handleContract} from '../core/handles';
import {normalizeDrawnBase} from '../core/drawnBase';
import type {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';

const NAME = TacticalGraphicName.MobileDefense;

/** APP-06's own order: point 1 the arrowhead, then the line's end, then the arc. */
const P1: Position = [-8, 20];
const P2: Position = [4, 20];
/**
 * Point 3, **through the same door a draw comes in by**.
 *
 * `normalizeDrawnBase` squares the third click onto the perpendicular at point 2, and the
 * generator reads it there. A hand-written base that is merely *near* the perpendicular is
 * projected on the way in, so the drawn arc lands a percent or so off the literal
 * coordinate — which is correct behaviour and a misleading thing to assert against.
 */
const P3: Position = normalizeDrawnBase(TacticalGraphicName.MobileDefense, [P1, P2, [4, 26]])[2];

const md = (coordinates: Position[], extra: object = {}) =>
    renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates},
        properties: {tacticalGraphic: {name: NAME, ...extra}},
    } as Feature<LineString>);

const rings = (out: ReturnType<typeof renderTacticalGraphic>): Position[][] =>
    (out.graphic as Feature<MultiLineString>).geometry.coordinates;

const grips = (out: ReturnType<typeof renderTacticalGraphic>): Position[] =>
    (out.handles as Feature<MultiPoint>).geometry.coordinates;

const metres = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});
const bearing = (a: Position, b: Position) => turf.bearing(turf.point(a), turf.point(b));
/** The smaller angle between two bearings, in degrees. */
const between = (a: number, b: number) => {
    const d = Math.abs(((a - b) % 360 + 360) % 360);
    return d > 180 ? 360 - d : d;
};

describe('mobile defence — the hairpin the Template draws', () => {
    it('emits the near line, the arc, the return line, an arrowhead and four barbs', () => {
        /*
         * Nine members would be a barb too many and seven one too few — the Template draws
         * exactly four, one on each straight and one at each end of the curve, and the count
         * is what "the number of barbs shall remain proportional" is read as protecting.
         * @see MobileDefense, "Barb count"
         */
        const parts = rings(md([P1, P2, P3]));
        expect(parts).toHaveLength(8);
        // Each barb is a closed equilateral triangle, which is what the paint fills.
        const barbs = parts.slice(4);
        expect(barbs).toHaveLength(4);
        for (const barb of barbs) {
            expect(barb).toHaveLength(4);
            expect(barb[0]).toEqual(barb[barb.length - 1]);
        }
    });

    it('runs the straight line between points 1 and 2, with the arrowhead on point 1', () => {
        // *"Point 1 defines the tip of the arrowhead. Point 2 defines the end of the
        // straight line portion."* The arrowhead is an open chevron whose middle vertex is
        // the tip — pursuit puts its arrow on the *arc*, and this is the difference.
        const parts = rings(md([P1, P2, P3]));
        const [nearLine, , , arrowHead] = parts;
        expect(metres(nearLine[0], P2)).toBeLessThan(1);
        expect(metres(nearLine[1], P1)).toBeLessThan(1);
        expect(arrowHead).toHaveLength(3);
        expect(metres(arrowHead[1], P1)).toBeLessThan(1);
    });

    it('makes points 2 and 3 the ends of the arc, and bulges it away from the arrowhead', () => {
        /*
         * The Template's arc is tangent to both straights, so its radius is exactly half the
         * separation and its apex lies one radius beyond the diameter, on the far side from
         * point 1. Measured off the plate at 600 dpi: lines 420 px apart, apex 210 px past.
         */
        const [, arc] = rings(md([P1, P2, P3]));
        expect(metres(arc[0], P2)).toBeLessThan(1000);
        expect(metres(arc[arc.length - 1], P3)).toBeLessThan(1000);

        const centre: Position = [(P2[0] + P3[0]) / 2, (P2[1] + P3[1]) / 2];
        const radius = metres(P2, P3) / 2;
        const apex = arc[Math.floor(arc.length / 2)];
        expect(metres(centre, apex)).toBeCloseTo(radius, -3);
        // Past the diameter, not back over the straight line: the apex is further from the
        // arrowhead than the diameter's own ends are.
        expect(metres(P1, apex)).toBeGreaterThan(metres(P1, P2));
    });

    it('returns a line from point 3, parallel to the first and the same length', () => {
        // The rule names one "straight line portion" and the Template draws two. The second
        // mirrors the first — nothing else closes the figure. @see MobileDefense
        const [nearLine, , farLine] = rings(md([P1, P2, P3]));
        expect(metres(farLine[0], P3)).toBeLessThan(1000);
        expect(metres(farLine[0], farLine[1])).toBeCloseTo(metres(nearLine[0], nearLine[1]), -3);
        expect(between(bearing(nearLine[0], nearLine[1]), bearing(farLine[0], farLine[1]))).toBeLessThan(2);
    });

    it('discards point 3’s component along the line, keeping only how far across it is', () => {
        /*
         * **The constraint pursuit's third click carries, for the same reason.** The arc is
         * tangent to both straights, so its diameter has to leave point 2 at a right angle; a
         * point off that perpendicular describes a hairpin that does not close. A click well
         * down the line from point 2 must therefore draw the same symbol as its perpendicular
         * projection. @see mobileDefenceAnchors
         */
        const square = rings(md([P1, P2, P3]));
        /*
         * Slid a long way **along the line's own bearing** — which is not the same as sliding
         * in longitude, because the line sits at a different latitude from point 3 and a
         * degree of longitude is not a fixed direction. Walking from point 3 along the axis
         * is the only slide that leaves the across-component untouched.
         */
        const axis = bearing(P2, P1);
        const slid = turf.destination(turf.point(P3), 400_000, axis, {units: 'meters'}).geometry
            .coordinates as Position;
        const skew = rings(md([P1, P2, slid]));
        /*
         * Held to a share of the symbol rather than to an absolute distance. A slide of
         * 400 km along a *great circle* is not a slide along a straight line — the bearing
         * turns as it goes — so the across-component comes back a tenth of a percent
         * different. That residual is the sphere, not the reader; an absolute metre
         * threshold would merely be a statement about how big the fixture happens to be.
         */
        const tolerance = metres(P1, P2) * 0.005;
        for (let i = 0; i < square.length; i++) {
            expect(metres(square[i][0], skew[i][0])).toBeLessThan(tolerance);
        }
    });

    it('puts a grip on each of the three anchors, with point 3’s on the perpendicular', () => {
        /*
         * A grip whose published position and whose reader disagree is the "very jumpy
         * handle" this repository has already paid for once on envelopment. Point 3's is
         * republished where the frame reads it — square to the line — not where a free
         * vertex drag happened to leave it. @see Envelopment.generateHandles
         */
        expect(baseVertexCount(NAME)).toBe(3);
        expect(handleContract(NAME).roles).toEqual(['shape', 'shape', 'shape']);

        const slid: Position = [P3[0] - 5, P3[1]];
        const handles = grips(md([P1, P2, slid]));
        expect(handles).toHaveLength(3);
        // Generator order is the reverse of the stored one, so the arc's grip comes first.
        expect(between(bearing(P2, handles[0]), bearing(P2, P1))).toBeCloseTo(90, 0);
        expect(metres(handles[1], P2)).toBeLessThan(1);
        expect(metres(handles[2], P1)).toBeLessThan(1);
    });

    it('leaves a two-point base alone, so a saved mirrored one keeps its side', () => {
        /*
         * The only two-point mobile defences that exist are the ellipses saved before
         * 2026-09-06, and the side their arc fell on is in `mirrored` — which
         * `normalizeDrawnBase` cannot see. Upgrading them to three points there put every
         * mirrored one back on the wrong side, silently. @see anchorsFromClicks
         */
        expect(normalizeDrawnBase(NAME, [P1, P2])).toHaveLength(2);

        const plain = rings(md([P1, P2]))[2][0];
        const flipped = rings(md([P1, P2], {mirrored: true}))[2][0];
        // The return line opens to opposite sides of the straight run.
        expect(Math.sign(plain[1] - P1[1])).toBe(-Math.sign(flipped[1] - P1[1]));
    });

    it('still constrains the third of three clicks', () => {
        // The two-point exemption above must not cost the three-click constraint.
        const placed = normalizeDrawnBase(NAME, [P1, P2, [P2[0] - 5, P2[1] + 6]]);
        expect(placed).toHaveLength(3);
        /*
         * Measured as the component *along* the run, which is the quantity the reader
         * discards — and against `bearing(P1, P2)`, which is the bearing the constraint is
         * built on. Comparing the two end-to-end bearings instead would fail by the
         * convergence of the meridians (4 degrees over this run) and say nothing about the
         * projection. @see mobileDefenceAnchors
         */
        const axis = bearing(P2, P1);
        const reach = metres(P2, placed[2]);
        const along = reach * Math.cos(((bearing(P2, placed[2]) - axis) * Math.PI) / 180);
        expect(Math.abs(along)).toBeLessThan(reach * 0.01);
    });
});
