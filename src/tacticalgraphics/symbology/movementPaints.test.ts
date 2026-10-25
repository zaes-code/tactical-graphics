/**
 * # Envelopment's "E", in the gap its run cuts for it
 *
 * Zoomed far out the letter shrank under the legibility floor and went, while the gap round
 * it stayed. It now stops at 6 px, and once the graphic is under twice the letter there is no
 * letter and the run is drawn whole. Both halves ask `approachLetterScale`, because OpenLayers
 * paints them as two features. (User, 2026-10-24.) @see letterInGapScale
 */
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {envelopmentGraphicPaint, envelopmentLabelPaint} from './movementPaints';

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
    it('keeps its letter at 6 px, then drops it and closes the run', () => {
        // 30 px: the graphic cap alone would draw the letter at under 4 px.
        const small = envelopment(300);
        const [letter] = envelopmentLabelPaint()(small.label, context);
        expect(letter.text!.scale! * 16).toBeCloseTo(6, 9);
        const lines = linesOf(envelopmentGraphicPaint()(small.graphic, context));
        expect(lines).toHaveLength(3);
        expect(lines[1][0][0] - lines[0][1][0]).toBeGreaterThan(0);

        // 5 px, under twice the letter: no letter, and the run is drawn whole.
        const tiny = envelopment(50);
        expect(envelopmentLabelPaint()(tiny.label, context)).toEqual([]);
        expect(linesOf(envelopmentGraphicPaint()(tiny.graphic, context))).toEqual([[[0, 0], [50, 0]], [[50, 0], [50, 25]]]);
    });
});
