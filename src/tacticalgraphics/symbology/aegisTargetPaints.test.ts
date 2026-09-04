/**
 * # APP-06 240804 — rectangular target, single target (AEGIS only)
 *
 * The risk in this graphic is not that it draws wrongly, it is that it draws **240802**.
 * The two share three words of a name, both are rectangles, and the obvious way to build
 * it was to point the new enum member at the existing rectangular target's paint. That
 * would have produced two symbols with one picture, which is the failure this repository
 * keeps finding — the mined anti-tank ditch, and 220103 against 220104 earlier the same
 * day. So the first test here is the one that would have caught it.
 *
 * The rest pin what the plate says and a plausible implementation would get wrong: the
 * centre cross is **upright regardless of the rectangle's bearing**, which every other
 * two-point graphic in this library would have built from the base's own axis.
 */
import {TacticalGraphicName} from '../core/type';
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {getPaintFunction, isPaintable} from './registry';
import {ARM, CROSS_MAX_HALF_PX, aegisSingleTargetPaint} from './aegisTargetPaints';
import {LABEL_GAP_PX} from './aegisTargetPaints';

const RESOLUTION = 100;
const context = {resolution: RESOLUTION, measureText: (t: string) => t.length * 9} as unknown as PaintContext;

/** The area's interior point, which is what the label slot is handed. */
function centreFeature(properties: Record<string, unknown> = {}, at: ProjectedPosition = [0, 0]): PaintFeature {
    return {
        geometry: {type: 'Point', coordinates: at},
        properties: {name: TacticalGraphicName.TargetAreaSingleTargetAegis, ...properties},
        // A generous box, so `fitSymbolScale` is not the thing under test.
        bounds: {minX: -3e6, minY: -3e6, maxX: 3e6, maxY: 3e6},
        graphicSize: 400_000,
    } as unknown as PaintFeature;
}

/** Every line the paint draws, as `[from, to]` pairs. */
const segmentsOf = (paints: Paint[]): ProjectedPosition[][] =>
    paints
        .filter(p => p.geometry.type === 'LineString')
        .map(p => (p.geometry as {coordinates: ProjectedPosition[]}).coordinates);

describe('240804 is a different symbol from 240802, not a variant of it', () => {
    it('is registered with a paint of its own', () => {
        expect(isPaintable(TacticalGraphicName.TargetAreaSingleTargetAegis)).toBe(true);
        expect(getPaintFunction(TacticalGraphicName.TargetAreaSingleTargetAegis)).toBeDefined();
    });

    it('does not share a label painter with the rectangular target', () => {
        // Identity, not output: pointing the new member at 240802's painter is precisely
        // the shortcut this file exists to refuse, and it is invisible in a rendered image
        // until someone puts the two side by side.
        const aegis = getPaintFunction(TacticalGraphicName.TargetAreaSingleTargetAegis);
        const rectangular = getPaintFunction(TacticalGraphicName.TargetAreaRectangular);
        expect(aegis?.label).toBeDefined();
        expect(aegis?.label).not.toBe(rectangular?.label);
    });

    it('draws a centre cross, which 240802 has none of', () => {
        // Two crossed arms is the whole visible difference between the two graphics.
        expect(segmentsOf(aegisSingleTargetPaint()(centreFeature(), context))).toHaveLength(2);
    });
});

describe('the centre cross', () => {
    const armsOf = (paints: Paint[]) => segmentsOf(paints);

    it('crosses at the area centre', () => {
        const at: ProjectedPosition = [500_000, -250_000];
        for (const [from, to] of armsOf(aegisSingleTargetPaint()(centreFeature({}, at), context))) {
            expect((from[0] + to[0]) / 2).toBeCloseTo(at[0], 6);
            expect((from[1] + to[1]) / 2).toBeCloseTo(at[1], 6);
        }
    });

    it('stands upright — one arm due east-west, one due north-south', () => {
        /*
         * The plate is explicit: "the centre point of the area shall always have the target
         * symbol with the same upright orientation". Projected +y is north, so an upright
         * cross is exactly an axis-aligned one, and this is the assertion that fails if
         * anyone rebuilds the arms from the base's bearing the way the rest of the
         * two-point graphics here do.
         */
        const arms = armsOf(aegisSingleTargetPaint()(centreFeature(), context));
        const bearings = arms.map(([from, to]) => Math.abs(Math.atan2(to[1] - from[1], to[0] - from[0])));
        // 0 = east-west, pi/2 = north-south. Nothing in between.
        expect(bearings.some(b => b < 1e-9)).toBe(true);
        expect(bearings.some(b => Math.abs(b - Math.PI / 2) < 1e-9)).toBe(true);
    });

    it('has arms of equal length, as the plate draws them', () => {
        const lengths = armsOf(aegisSingleTargetPaint()(centreFeature(), context)).map(([from, to]) =>
            Math.hypot(to[0] - from[0], to[1] - from[1]),
        );
        expect(lengths[0]).toBeCloseTo(lengths[1], 6);
    });

    it('never grows past its screen ceiling, however far you zoom in', () => {
        /*
         * The defect: the cross is fitted to the rectangle in *metres*, so it doubled on
         * screen with every zoom level — measured in the running app at 88 px, 177, 354 and
         * 707 across four zooms. The plate says the target symbol's size is "fixed within
         * the area", so a ceiling in screen pixels is what it wants.
         */
        const armPx = (resolution: number) => {
            const paints = aegisSingleTargetPaint()(centreFeature(), {...context, resolution} as PaintContext);
            const [from, to] = segmentsOf(paints)[0];
            return Math.hypot(to[0] - from[0], to[1] - from[1]) / resolution / 2;
        };
        // Zooming in is a smaller resolution. The half-arm must stop at the ceiling.
        for (const resolution of [50, 10, 1, 0.1]) {
            expect(armPx(resolution)).toBeLessThanOrEqual(CROSS_MAX_HALF_PX + 1e-6);
        }
        // …and actually reach it, or the test would pass against a cross of any size.
        expect(armPx(0.1)).toBeCloseTo(CROSS_MAX_HALF_PX, 6);
    });

    it('still shrinks on the way out, rather than sitting at the ceiling', () => {
        // The other half of the rule: zoomed far out the fitted metric size falls below the
        // ceiling and takes over, so the cross goes with its rectangle instead of swelling.
        const armPx = (resolution: number) => {
            const [from, to] = segmentsOf(aegisSingleTargetPaint()(centreFeature(), {...context, resolution} as PaintContext))[0];
            return Math.hypot(to[0] - from[0], to[1] - from[1]) / resolution / 2;
        };
        expect(armPx(100_000)).toBeLessThan(CROSS_MAX_HALF_PX);
        // Monotonic: further out is smaller still.
        expect(armPx(200_000)).toBeLessThan(armPx(100_000));
    });

    it('takes the identity colour and is stroked, not filled', () => {
        // The cross is the symbol's own line work rather than an amplifier, so a hostile
        // one goes red with the outline. FM 1-02.2 para 5-3.
        for (const paint of aegisSingleTargetPaint()(centreFeature(), context)) {
            if (paint.geometry.type !== 'LineString') continue;
            expect(paint.stroke?.color).toBeTruthy();
            expect(paint.fill).toBeUndefined();
        }
    });
});

describe('the designation', () => {
    const textsOf = (paints: Paint[]) => paints.map(p => p.text?.text).filter(Boolean);

    it('is drawn bare beside the cross, which is what the Example shows', () => {
        // The Template puts a boxed `T` there; the Example prints `NSFS002` with no box.
        // A box would be a polygon, and there is none.
        const paints = aegisSingleTargetPaint()(centreFeature({designation: 'NSFS002'}), context);
        expect(textsOf(paints)).toEqual(['NSFS002']);
        expect(paints.filter(p => p.geometry.type === 'Polygon')).toHaveLength(0);
    });

    it('is tucked into quadrant 1, against the vertical arm', () => {
        /*
         * Up and to the right of the centre, and *inside* the cross's reach rather than
         * hung off the horizontal arm's tip. The old placement measured from that tip, so
         * capping the arm would have stranded the label out where the tip used to be.
         */
        const paints = aegisSingleTargetPaint()(centreFeature({designation: 'NSFS002'}), context);
        const at = (paints.find(p => p.text)!.geometry as {coordinates: ProjectedPosition}).coordinates;
        const rightArmTip = Math.max(...segmentsOf(paints).flat().map(p => p[0]));
        const topArmTip = Math.max(...segmentsOf(paints).flat().map(p => p[1]));

        expect(at[0]).toBeGreaterThan(0); // right of the vertical arm
        expect(at[1]).toBeGreaterThan(0); // above the horizontal arm
        expect(at[0]).toBeLessThan(rightArmTip); // and tucked in, not out past the tip
        expect(at[1]).toBeLessThan(topArmTip);
    });

    it('grows up and to the right, away from both arms', () => {
        const label = aegisSingleTargetPaint()(centreFeature({designation: 'NSFS002'}), context).find(p => p.text);
        expect(label!.text?.align).toBe('left');
        expect(label!.text?.baseline).toBe('alphabetic');
    });

    it('sits the same distance from each arm', () => {
        /*
         * **This asserts the anchor, and the anchor is only half the story** — worth saying,
         * because the numbers here are identical under the old placement too.
         *
         * Equal offsets put the anchor on the quadrant diagonal, which is necessary and not
         * sufficient: what the eye measures is the gap to the *ink*, and that depends on the
         * baseline. `bottom` is the foot of the em box and carries descender space an
         * all-caps designation never uses, so the label floated a descender's worth further
         * above the horizontal arm than it sat right of the vertical one. `alphabetic` puts
         * the anchor on the text baseline — for `NSFS002` or `ALPHA`, the bottom of the ink.
         *
         * So the two halves are pinned by two tests: this one for the offsets, and "grows up
         * and to the right" for the baseline. Neither alone would have caught the defect.
         */
        const label = aegisSingleTargetPaint()(centreFeature({designation: 'NSFS002'}), context).find(p => p.text)!;
        const [x, y] = (label.geometry as {coordinates: ProjectedPosition}).coordinates;
        expect(x).toBeCloseTo(y, 9);
        // And it is the gap, not merely equal to itself at zero.
        expect(x).toBeCloseTo(LABEL_GAP_PX * label.text!.scale! * context.resolution, 9);
    });

    it('draws nothing but the cross when no designation was typed', () => {
        expect(textsOf(aegisSingleTargetPaint()(centreFeature(), context))).toEqual([]);
    });

    it('never lets the designation cross the rectangle`s boundary', () => {
        /*
         * Tucked into a corner quadrant, a long designation runs at the shape's edge — and
         * the box is only as wide as the operator drew it. Shrinking rather than shoving:
         * sliding the label back toward the centre would walk it out of the quadrant the
         * plate puts it in and over the arms it was just cleared of.
         */
        /*
         * Deliberately tight: 40 km x 20 km, which at this resolution is 400 x 200 px. The
         * first version of this test used a 600 km box, where a 39-character designation
         * still fits at full scale — so it passed without ever exercising the cap, which is
         * the same shape of defect as a probe that reports success for its own crash.
         */
        const HALF = 20_000;
        const ring: ProjectedPosition[] = [
            [-HALF, -HALF / 2],
            [HALF, -HALF / 2],
            [HALF, HALF / 2],
            [-HALF, HALF / 2],
            [-HALF, -HALF / 2],
        ];
        const withRing = (designation: string) =>
            ({
                geometry: {type: 'Point', coordinates: [0, 0]},
                properties: {name: TacticalGraphicName.TargetAreaSingleTargetAegis, designation},
                bounds: {minX: -HALF, minY: -HALF / 2, maxX: HALF, maxY: HALF / 2},
                ring,
                graphicSize: 400_000,
            }) as unknown as PaintFeature;

        for (const designation of ['A', 'NSFS002', 'NSFS002-ALPHA-LONG-DESIGNATION-XXXXXXXX']) {
            const paints = aegisSingleTargetPaint()(withRing(designation), context);
            const label = paints.find(p => p.text)!;
            const [x, y] = (label.geometry as {coordinates: ProjectedPosition}).coordinates;
            const scale = label.text!.scale!;
            const width = designation.length * 9 * scale * context.resolution;
            const height = 16 * scale * context.resolution;
            // Every corner of the drawn block inside the shape.
            for (const corner of [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]) {
                expect(corner[0]).toBeLessThanOrEqual(HALF);
                expect(corner[1]).toBeLessThanOrEqual(HALF / 2);
            }
        }
    });

    it('shrinks only the label that would overrun, leaving a short one alone', () => {
        // A cap that fired on everything would be indistinguishable from one that fired on
        // nothing, since both produce "a label of some size".
        const HALF = 20_000;
        const ring: ProjectedPosition[] = [
            [-HALF, -HALF / 2], [HALF, -HALF / 2], [HALF, HALF / 2], [-HALF, HALF / 2], [-HALF, -HALF / 2],
        ];
        const scaleFor = (designation: string) =>
            aegisSingleTargetPaint()(
                {
                    geometry: {type: 'Point', coordinates: [0, 0]},
                    properties: {name: TacticalGraphicName.TargetAreaSingleTargetAegis, designation},
                    bounds: {minX: -HALF, minY: -HALF / 2, maxX: HALF, maxY: HALF / 2},
                    ring,
                    graphicSize: 400_000,
                } as unknown as PaintFeature,
                context,
            ).find(p => p.text)!.text!.scale!;
        expect(scaleFor('NSFS002-ALPHA-LONG-DESIGNATION-XXXXXXXX')).toBeLessThan(scaleFor('A'));
    });

    it('stays with the symbol when the cross is capped small', () => {
        // The label's anchor is a fixed gap off the centre, not off an arm tip, so shrinking
        // the cross cannot leave it floating in space.
        const near = aegisSingleTargetPaint()(centreFeature({designation: 'NSFS002'}), {...context, resolution: 1} as PaintContext)
            .find(p => p.text)!;
        const at = (near.geometry as {coordinates: ProjectedPosition}).coordinates;
        expect(Math.hypot(at[0], at[1])).toBeLessThan(ARM);
    });
});
