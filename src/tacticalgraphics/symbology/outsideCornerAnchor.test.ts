/**
 * # A date-time group hung outside a shape's upper left
 *
 * Two families draw that block — the twenty-three fire-support and kill-box zones, and the
 * three PsyOps zones — and until 2026-09-04 they disagreed about both halves of it:
 *
 * - **where it goes.** Both took the bounding box's top-left corner for a rectangle. That
 *   was right only while rectangles were levelled; they keep the angle they were drawn on
 *   now, so the box's top edge is the height of whichever corner happens to be highest, and
 *   a tilted rectangle's dates climbed away from the corner they belong beside.
 * - **how it reads.** The zones broke after the hyphen, `dtg1-` over `dtg2`; the PsyOps
 *   zones wrote `dtg1 - dtg2` across, which is what every other date block in the library
 *   does. Nothing in the plates asks for the break.
 *
 * Both are pinned here against the shapes that tell them apart, because a levelled
 * rectangle cannot: for it the real corner and the bounding-box corner are the same point,
 * which is exactly why this went unnoticed.
 */
import {TacticalGraphicName} from '../core/type';
import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {resetTacticalGraphicsConfig} from '../core/config';
import {outsideCornerDatePaint, zoneLabelPaint} from './areaLabelPaints';

const context: PaintContext = {resolution: 10, measureText: text => text.length * 9.6};

const DATES = {startDate: '011200ZJUL', endDate: '021200ZJUL'};

/** A label feature as a holder publishes one: a bare anchor, plus the shape's facts. */
const feature = (ring: ProjectedPosition[] | undefined, name = TacticalGraphicName.CallForFireZoneRectangular): PaintFeature => {
    const xs = (ring ?? []).map(c => c[0]);
    const ys = (ring ?? []).map(c => c[1]);
    return {
        geometry: {type: 'Point', coordinates: [0, 0]},
        properties: {name, designation: '01', ...DATES},
        ring,
        bounds: ring ? {minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys)} : undefined,
    } as PaintFeature;
};

/** A closed ring, rotated counter-clockwise about the origin. */
const rectangle = (halfWidth: number, halfHeight: number, degrees = 0): ProjectedPosition[] => {
    const radians = (degrees * Math.PI) / 180;
    const corners: ProjectedPosition[] = [
        [-halfWidth, halfHeight], [halfWidth, halfHeight], [halfWidth, -halfHeight], [-halfWidth, -halfHeight],
    ];
    const turned = corners.map(([x, y]): ProjectedPosition => [
        x * Math.cos(radians) - y * Math.sin(radians),
        x * Math.sin(radians) + y * Math.cos(radians),
    ]);
    return [...turned, turned[0]];
};

/** A many-sided ring standing in for a circle, which has no corners to take. */
const circle = (radius: number): ProjectedPosition[] => {
    const ring: ProjectedPosition[] = [];
    for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        ring.push([radius * Math.cos(a), radius * Math.sin(a)]);
    }
    return ring;
};

/** The paint carrying the dates, from whichever family drew it. */
const datePaintOf = (paints: ReturnType<ReturnType<typeof zoneLabelPaint>>) =>
    paints.find(paint => paint.text?.text?.includes('011200ZJUL'));

beforeEach(() => resetTacticalGraphicsConfig());

describe('the anchor a date block hangs from', () => {
    it('is the real top-left corner of a tilted rectangle, not the top of its box', () => {
        // Turned 20° counter-clockwise: the right-hand end lifts, so the bounding box's
        // top edge is the *top-right* corner's height and the dates used to ride up there.
        const ring = rectangle(1000, 200, 20);
        const drawn = datePaintOf(zoneLabelPaint(TacticalGraphicName.CallForFireZoneRectangular, false)(feature(ring), context));
        expect(drawn).toBeDefined();

        const corner = ring.slice(0, 4).reduce((best, c) => (c[1] - c[0] > best[1] - best[0] ? c : best));
        const at = (drawn!.geometry as {coordinates: ProjectedPosition}).coordinates;
        expect(at[0]).toBeCloseTo(corner[0], 6);
        expect(at[1]).toBeCloseTo(corner[1], 6);

        // And that is genuinely different from the old answer — a long way below it.
        const boxTop = Math.max(...ring.map(c => c[1]));
        expect(boxTop - at[1]).toBeGreaterThan(300);
    });

    it('is unchanged for a levelled rectangle, where the two answers are one point', () => {
        // The property that made this safe to change, and the reason it hid for so long.
        const ring = rectangle(1000, 200);
        const drawn = datePaintOf(zoneLabelPaint(TacticalGraphicName.CallForFireZoneRectangular, false)(feature(ring), context));
        const at = (drawn!.geometry as {coordinates: ProjectedPosition}).coordinates;
        expect(at[0]).toBeCloseTo(-1000, 6);
        expect(at[1]).toBeCloseTo(200, 6);
    });

    it('stays on the bounding box for a circle, which has no corner to take', () => {
        // Its leftmost *vertex* is level with its centre, so a vertex rule would put the
        // dates at the middle-left instead of above the shape.
        const drawn = datePaintOf(zoneLabelPaint(TacticalGraphicName.CallForFireZoneCircular, false)(feature(circle(800)), context));
        const at = (drawn!.geometry as {coordinates: ProjectedPosition}).coordinates;
        expect(at[0]).toBeCloseTo(-800, 6);
        expect(at[1]).toBeCloseTo(800, 6);
    });

    it('still takes the real vertex for an irregular shape', () => {
        // An L: its bounding-box corner sits outside the polygon entirely.
        const ring: ProjectedPosition[] = [[-900, -400], [-900, 100], [-300, 100], [-300, 600], [900, 600], [900, -400], [-900, -400]];
        const drawn = datePaintOf(zoneLabelPaint(TacticalGraphicName.CallForFireZoneIrregular, true)(feature(ring, TacticalGraphicName.CallForFireZoneIrregular), context));
        const at = (drawn!.geometry as {coordinates: ProjectedPosition}).coordinates;
        expect(at[0]).toBeCloseTo(-900, 6);
        expect(at[1]).toBeCloseTo(100, 6);
        // Not the box's corner, which is up in the notch where nothing is drawn.
        expect(at[1]).not.toBeCloseTo(600, 6);
    });

    it('falls back to the box when no ring was published at all', () => {
        const bare = {
            geometry: {type: 'Point', coordinates: [0, 0]},
            properties: {name: TacticalGraphicName.CallForFireZoneRectangular, ...DATES},
            bounds: {minX: -50, minY: -20, maxX: 50, maxY: 20},
        } as PaintFeature;
        const drawn = datePaintOf(zoneLabelPaint(TacticalGraphicName.CallForFireZoneRectangular, false)(bare, context));
        const at = (drawn!.geometry as {coordinates: ProjectedPosition}).coordinates;
        expect(at).toEqual([-50, 20]);
    });

    it('gives the PsyOps block the same corner, since it is the same block', () => {
        const ring = rectangle(1000, 200, 20);
        const psyOps = feature(ring, TacticalGraphicName.PsyOpsZoneRectangular);
        const zone = datePaintOf(zoneLabelPaint(TacticalGraphicName.CallForFireZoneRectangular, false)(feature(ring), context));
        const outside = outsideCornerDatePaint()(psyOps, context)[0];
        expect((outside.geometry as {coordinates: ProjectedPosition}).coordinates)
            .toEqual((zone!.geometry as {coordinates: ProjectedPosition}).coordinates);
    });
});

describe('how the two dates read', () => {
    it('joins them on one line for a zone', () => {
        const drawn = datePaintOf(zoneLabelPaint(TacticalGraphicName.CallForFireZoneRectangular, false)(feature(rectangle(1000, 200)), context));
        expect(drawn!.text!.text).toBe('011200ZJUL - 021200ZJUL');
        expect(drawn!.text!.text).not.toContain('\n');
    });

    it('reads identically in the PsyOps block, which is the same two dates', () => {
        const psyOps = feature(rectangle(1000, 200), TacticalGraphicName.PsyOpsZoneRectangular);
        expect(outsideCornerDatePaint()(psyOps, context)[0].text!.text).toBe('011200ZJUL - 021200ZJUL');
    });

    it('drops the separator when only one date was typed', () => {
        const one = feature(rectangle(1000, 200));
        one.properties.endDate = undefined;
        const drawn = datePaintOf(zoneLabelPaint(TacticalGraphicName.CallForFireZoneRectangular, false)(one, context));
        expect(drawn!.text!.text).toBe('011200ZJUL');
    });
});
