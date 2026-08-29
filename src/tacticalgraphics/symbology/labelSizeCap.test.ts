/**
 * # A label may not outgrow its own symbol
 *
 * `labelScale` floors its zoom multiplier at 0.3 so text stays readable, and the graphic
 * under it has no floor at all — it is ground, and ground shrinks with the zoom. Far
 * enough out, every zoom-anchored label is standing on a symbol smaller than itself.
 *
 * Measured on the sample sweep three zoom levels out, the avenue of approach and the
 * counterattack — the two sized from their own span — held a text-to-graphic ratio of 0.23
 * at every zoom, while the turning movement climbed from 0.26 to 0.34, the capture family
 * from 0.31 to 0.40 and the envelopment from 0.62 to 0.80. The share here is that measured
 * 0.23, rounded: **against the same dimension, the share is the ratio you see**.
 *
 * What this file pins is the property that was broken — the ratio must not climb as the
 * graphic shrinks — and the three ways the cap must not misfire: never raising a scale,
 * never capping to nothing on a shape with no thickness, and never touching a graphic
 * whose extent nobody published.
 */

import {capLabelToGraphic, LABEL_GRAPHIC_SHARE, capLabelToSpan, LABEL_SPAN_SHARE} from './labelFit';
import {BASE_FONT_SIZE_PX, resetTacticalGraphicsConfig} from '../core/config';
import {TacticalGraphicName} from '../core/type';
import type {PaintContext, PaintFeature} from '../core/paint';

const context: PaintContext = {
    resolution: 100,
    measureText: (text, font) => text.length * parseFloat(/([0-9.]+)px/.exec(font)?.[1] ?? '16') * 0.6,
};

/** A label feature whose holder published the graphic's extent, in projected metres. */
const withBounds = (widthPx: number, heightPx: number, resolution = context.resolution): PaintFeature =>
    ({
        geometry: {type: 'Point', coordinates: [0, 0]},
        properties: {name: TacticalGraphicName.TurningMovement},
        bounds: {minX: 0, minY: 0, maxX: widthPx * resolution, maxY: heightPx * resolution},
    }) as PaintFeature;

beforeEach(() => resetTacticalGraphicsConfig());

describe('capLabelToGraphic', () => {
    it('caps the text at the published share of the graphic', () => {
        // A square 80 px across: the label may stand a quarter of that.
        const scale = capLabelToGraphic(10, withBounds(80, 80), context);
        expect(scale * BASE_FONT_SIZE_PX).toBeCloseTo(LABEL_GRAPHIC_SHARE * 80, 6);
    });

    it('only ever lowers — a label already small enough is left alone', () => {
        const desired = 0.1;
        expect(capLabelToGraphic(desired, withBounds(400, 400), context)).toBe(desired);
    });

    it('holds the ratio steady as the graphic shrinks, which is the whole point', () => {
        // The same graphic at three zooms, with a desired scale far above the cap at each
        // — standing in for the floor a zoom-anchored label hits on the way out. The ratio
        // must not climb as the graphic shrinks under it.
        const ratios = [80, 40, 20].map(sizePx => {
            const scale = capLabelToGraphic(10, withBounds(sizePx, sizePx), context);
            return (scale * BASE_FONT_SIZE_PX) / sizePx;
        });
        for (const ratio of ratios) expect(ratio).toBeLessThanOrEqual(LABEL_GRAPHIC_SHARE + 1e-9);
        expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(1e-9);
    });

    it('does not cap a straight line to nothing', () => {
        // A due-east line has no height at all. Measured against its minor extent the cap
        // would be zero and the designation would vanish; the aspect limit is what stops
        // that, by treating any graphic as at most twice as long as it is thick.
        const scale = capLabelToGraphic(10, withBounds(200, 0), context);
        expect(scale).toBeGreaterThan(0);
        expect(scale * BASE_FONT_SIZE_PX).toBeCloseTo(LABEL_GRAPHIC_SHARE * 100, 6);
    });

    it('leaves a graphic whose extent nobody published exactly as it was', () => {
        const bare = {geometry: {type: 'Point', coordinates: [0, 0]}, properties: {}} as PaintFeature;
        expect(capLabelToGraphic(1.25, bare, context)).toBe(1.25);
    });
});

describe('capLabelToSpan', () => {
    it('caps the text width at its share of the span it belongs to', () => {
        // 'ABCD' measures 4 * 16 * 0.6 = 38.4 px at scale 1 through this context.
        const scale = capLabelToSpan(context, 'ABCD', 'bold 16px sans-serif', 10, 100);
        expect(38.4 * scale).toBeCloseTo(LABEL_SPAN_SHARE * 100, 6);
    });

    it('measures the widest line of a block, not the whole string', () => {
        const font = 'bold 16px sans-serif';
        const oneLine = capLabelToSpan(context, 'ABCDEFGH', font, 10, 100);
        const twoLines = capLabelToSpan(context, 'ABCD\nABCD', font, 10, 100);
        expect(twoLines).toBeGreaterThan(oneLine);
    });

    it('passes the desired scale through when there is nothing to measure against', () => {
        expect(capLabelToSpan(context, 'AB', 'bold 16px sans-serif', 0.8, 0)).toBe(0.8);
        expect(capLabelToSpan(context, '', 'bold 16px sans-serif', 0.8, 100)).toBe(0.8);
    });
});
