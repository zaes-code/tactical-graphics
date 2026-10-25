/**
 * # Envelopment's "E", in the gap its run cuts for it
 *
 * The letter keeps the scale the graphic gives it and is never floored: once that would put it
 * under 6 px, or the graphic is under twice the letter, there is no letter and the run is
 * drawn whole. Both halves ask `approachLetterScale`, because OpenLayers
 * paints them as two features. (User, 2026-10-24.) @see letterInGapScale
 */
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {MIN_LEGIBLE_TEXT_PX} from '../core/config';
import {envelopmentGraphicPaint, envelopmentLabelPaint} from './movementPaints';
import {scaleOf} from './paintFunctions';

const context: PaintContext = {
    resolution: 10,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
};

/** A run of `length` along x and an arm standing up from its end, as the two halves see them. */
function envelopment(length: number): {graphic: PaintFeature; label: PaintFeature} {
    const bounds = {minX: 0, minY: 0, maxX: length, maxY: length / 2};
    const properties = {name: TacticalGraphicName.Envelopment};
    return {
        graphic: {
            geometry: {type: 'MultiLineString', coordinates: [[[0, 0], [length, 0]], [[length, 0], [length, length / 2]]]},
            properties,
            bounds,
        } as unknown as PaintFeature,
        label: {geometry: {type: 'MultiPoint', coordinates: [[0, 0], [length, 0]]}, properties, bounds} as unknown as PaintFeature,
    };
}

const linesOf = (paints: Paint[]) => paints.map(p => (p.geometry as {coordinates: ProjectedPosition[]}).coordinates);

describe('envelopment', () => {
    it('draws its letter at its own scale, and drops it and closes the run once the letter would be under 6 px', () => {
        // 100 px: the graphic cap puts the letter over 6 px, and it is drawn at exactly that.
        const legible = envelopment(1000);
        const desired = scaleOf(legible.label, context);
        expect(desired * 16).toBeGreaterThan(MIN_LEGIBLE_TEXT_PX);
        const [letter] = envelopmentLabelPaint()(legible.label, context);
        expect(letter.text!.scale!).toBeCloseTo(desired, 9);
        const lines = linesOf(envelopmentGraphicPaint()(legible.graphic, context));
        expect(lines).toHaveLength(3);
        expect(lines[1][0][0] - lines[0][1][0]).toBeGreaterThan(0);

        // 30 px: the graphic cap would draw the letter at under 4 px, so no letter, and the run is whole.
        const small = envelopment(300);
        expect(scaleOf(small.label, context) * 16).toBeLessThan(MIN_LEGIBLE_TEXT_PX);
        expect(envelopmentLabelPaint()(small.label, context)).toEqual([]);
        expect(linesOf(envelopmentGraphicPaint()(small.graphic, context))).toEqual([[[0, 0], [300, 0]], [[300, 0], [300, 150]]]);

        // 5 px, under twice the letter: no letter, and the run is drawn whole.
        const tiny = envelopment(50);
        expect(envelopmentLabelPaint()(tiny.label, context)).toEqual([]);
        expect(linesOf(envelopmentGraphicPaint()(tiny.graphic, context))).toEqual([[[0, 0], [50, 0]], [[50, 0], [50, 25]]]);
    });
});
