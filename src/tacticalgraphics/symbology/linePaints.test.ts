/**
 * # A hostile supporting attack keeps its ENY when its label is too small to read
 *
 * `ENY` is set behind the name on the supporting attack. Once the two would be under 6 px,
 * the name goes and `ENY` takes the anchor at 6 px; once the arrow is under twice `ENY`,
 * neither is drawn. (User, 2026-10-24.) @see legibleDesignation
 */
import type {Paint, PaintContext, PaintFeature} from '../core/paint';
import {TacticalGraphicHostility, TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {directionArrowPaint} from './linePaints';

const context: PaintContext = {
    resolution: 1,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
};

/** An arrow `length` px long, pointing east, whose stamped extent, `boundsPx`, caps its labels. */
const arrow = (length: number, boundsPx: number): Paint[] =>
    directionArrowPaint(TacticalGraphicName.DirectionOfSupportingAttack)(
        {
            geometry: {
                type: 'MultiLineString',
                coordinates: [
                    [[0, 0], [length, 0]],
                    [[length - 5, 3], [length, 0], [length - 5, -3]],
                ],
            },
            properties: {
                name: TacticalGraphicName.DirectionOfSupportingAttack,
                designation: 'BLUE',
                hostility: TacticalGraphicHostility.hostileFaker,
            },
            bounds: {minX: 0, minY: 0, maxX: boundsPx, maxY: 0},
        } as unknown as PaintFeature,
        context,
    );

const texts = (paints: Paint[]) => paints.filter(p => p.text?.text).map(p => p.text!);

beforeEach(() => resetTacticalGraphicsConfig());

describe('directionArrowPaint', () => {
    it('sets BLUE and ENY apart while legible', () => {
        expect(texts(arrow(400, 400)).map(t => t.text)).toEqual(['BLUE', 'ENY']);
    });

    it('draws ENY alone at 6 px once the label would be under it', () => {
        const [only, ...rest] = texts(arrow(100, 10));
        expect(rest).toEqual([]);
        expect(only.text).toBe('ENY');
        expect(16 * only.scale!).toBeCloseTo(6, 9);
    });

    it('draws no label on an arrow under twice ENY', () => {
        expect(texts(arrow(20, 10))).toEqual([]);
    });
});
