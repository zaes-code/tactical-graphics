/**
 * # A label may not leave the shape it belongs to
 *
 * A label's scale is zoom-anchored; the ground under it is not. So a centred designation
 * grows past its own outline at some zoom on every area in the library, and did — the
 * sample gallery draws areas 15 px across and their names ran three times wider than the
 * box beneath them.
 *
 * The cases below are the ones the first attempt got wrong: a geometric shrink with a floor
 * of 14%, when a long designation in a small box needs 7%.
 */

import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {fitLabelScale, liftedAnchor} from './labelFit';
import {areaDefaultLabelPaint} from './areaLabelPaints';

const FONT = 'bold 16px sans-serif';

const context = (resolution: number): PaintContext => ({
    resolution,
    measureText: (text, font) => {
        const px = parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16');
        return text.length * px * 0.6;
    },
});

/** A box `halfWidth` x `halfHeight` metres about the origin. */
const box = (halfWidth: number, halfHeight: number): ProjectedPosition[] => [
    [-halfWidth, -halfHeight], [halfWidth, -halfHeight],
    [halfWidth, halfHeight], [-halfWidth, halfHeight], [-halfWidth, -halfHeight],
];

const feature = (ring?: ProjectedPosition[], properties: Record<string, unknown> = {}): PaintFeature => ({
    geometry: {type: 'Point', coordinates: [0, 0]},
    properties: {name: TacticalGraphicName.AssemblyArea, ...properties},
    ring,
});

/** Half-width of a text block in projected metres, at a given scale. */
const halfWidthOf = (ctx: PaintContext, text: string, scale: number) =>
    (ctx.measureText(text, FONT) / 2) * scale * ctx.resolution;

beforeEach(() => resetTacticalGraphicsConfig());

describe('fitLabelScale', () => {
    it('leaves a label that already fits completely alone', () => {
        const ctx = context(1);
        // 4000 m of box for a ~120 m label: nothing to do.
        expect(fitLabelScale(feature(box(2000, 1000)), ctx, [0, 0], ['AA'], FONT, 1)).toBe(1);
    });

    it('shrinks a long designation until it is inside the box', () => {
        const ctx = context(100);
        const ring = box(2000, 1000);
        const text = 'A VERY LONG DESIGNATION';
        const scale = fitLabelScale(feature(ring), ctx, [0, 0], [text], FONT, 1);

        expect(scale).toBeLessThan(1);
        expect(halfWidthOf(ctx, text, scale)).toBeLessThan(2000);
    });

    it('goes below the 14% floor the first version could not pass', () => {
        // This is the case that made the cap look like it did nothing: a geometric shrink
        // of 24 steps at 0.92 bottoms out at 0.14, and this needs far less.
        const ctx = context(400);
        const scale = fitLabelScale(feature(box(1500, 800)), ctx, [0, 0], ['A VERY LONG DESIGNATION'], FONT, 1);
        expect(scale).toBeLessThan(0.1);
        expect(scale).toBeGreaterThan(0);
    });

    it('measures the whole block, not just its widest line', () => {
        const ctx = context(100);
        // A box wide enough for the text but too short for four rows of it.
        const wide = feature(box(9000, 300));
        const one = fitLabelScale(wide, ctx, [0, 0], ['AA'], FONT, 1);
        const four = fitLabelScale(wide, ctx, [0, 0], ['AA', 'BB', 'CC', 'DD'], FONT, 1);
        expect(four).toBeLessThan(one);
    });

    it('respects a concave notch rather than the bounding box', () => {
        const ctx = context(100);
        // An L: the bounding box is 4000x2000, but the right half is only 400 m tall.
        const ell: ProjectedPosition[] = [
            [-2000, -1000], [2000, -1000], [2000, -600], [0, -600], [0, 1000], [-2000, 1000], [-2000, -1000],
        ];
        const inBox = fitLabelScale(feature(box(2000, 1000)), ctx, [-900, 0], ['DESIGNATION'], FONT, 1);
        const inEll = fitLabelScale(feature(ell), ctx, [-900, 0], ['DESIGNATION'], FONT, 1);
        expect(inEll).toBeLessThanOrEqual(inBox);
    });

    it('leaves the scale alone when there is no shape to measure against', () => {
        // A line graphic's label, or a first render before the holder has stamped one.
        // Shrinking to nothing because the ring was not supplied is worse than overrunning.
        expect(fitLabelScale(feature(undefined), context(100), [0, 0], ['AA'], FONT, 0.8)).toBe(0.8);
    });

    it('caps the designation and its date-time group as one block', () => {
        const ctx = context(100);
        const withRing = {...feature(box(2000, 1000)), properties: {
            name: TacticalGraphicName.AssemblyArea,
            label: 'ALPHA',
            startDate: '021200ZJUN26',
            endDate: '021800ZJUN26',
        }};
        const paints = areaDefaultLabelPaint(TacticalGraphicName.AssemblyArea)(withRing, ctx);
        const scales = paints.map(p => p.text?.scale);

        // Both marks at one scale: they are separately anchored but read as one block, and
        // fitting each alone lets the pair leave a shape neither leaves by itself.
        expect(new Set(scales).size).toBe(1);
        expect(scales[0]!).toBeLessThan(1);
    });
});

describe('liftedAnchor', () => {
    it('raises the anchor by the metres it is given', () => {
        const lifted = liftedAnchor(feature(), 500);
        expect((lifted.geometry as {coordinates: ProjectedPosition}).coordinates).toEqual([0, 500]);
    });

    it('returns the feature untouched when there is nothing to lift', () => {
        const f = feature();
        expect(liftedAnchor(f, 0)).toBe(f);
    });
});
