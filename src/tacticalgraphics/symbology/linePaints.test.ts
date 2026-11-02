/**
 * # A hostile supporting attack keeps its ENY when its label is too small to read
 *
 * `ENY` is set behind the name on the supporting attack. Once the two would be under 6 px,
 * the name goes and `ENY` takes the anchor at 6 px; once the arrow is under twice `ENY`,
 * neither is drawn. (User, 2026-10-24.) @see legibleDesignation
 */
import type {Paint, PaintContext, PaintFeature} from '../core/paint';
import {TacticalGraphicHostility, TacticalGraphicName} from '../core/type';
import {TacticalGraphicsConfig, resetTacticalGraphicsConfig, setTacticalGraphicsConfig} from '../core/config';
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

// These pin the ENY marks, which a host switches on. @see TacticalGraphicsConfigOptions.enemyLabels
beforeEach(() => setTacticalGraphicsConfig(new TacticalGraphicsConfig({enemyLabels: true})));

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

/**
 * APP-06 140601, 140602, 140603 and 140605 all box N behind T on the shaft, and every Enemy
 * example reads `ENY MAIN`, set in a break of the line.
 */
describe('the four direction-of-attack arrows', () => {
    const DIRECTION_ARROWS = [
        TacticalGraphicName.DirectionOfMainAttack,
        TacticalGraphicName.DirectionOfSupportingAttack,
        TacticalGraphicName.DirectionOfMainAttackFeint,
        TacticalGraphicName.AviationDirectionOfAttack,
    ];
    const paintArrow = (name: TacticalGraphicName, hostility: TacticalGraphicHostility): Paint[] =>
        directionArrowPaint(name)(
            {
                geometry: {
                    type: 'MultiLineString',
                    coordinates: [
                        [[0, 0], [400, 0]],
                        [[390, 6], [400, 0], [390, -6]],
                    ],
                },
                properties: {name, designation: 'BLUE', hostility},
            } as unknown as PaintFeature,
            context,
        );

    it.each(DIRECTION_ARROWS)('%s carries ENY behind its name when hostile', name => {
        expect(texts(paintArrow(name, TacticalGraphicHostility.hostileFaker)).map(t => t.text)).toEqual(['BLUE', 'ENY']);
        expect(texts(paintArrow(name, TacticalGraphicHostility.friend)).map(t => t.text)).toEqual(['BLUE']);
    });

    it.each(DIRECTION_ARROWS)('%s breaks its shaft where each word sits, with the shaft between', name => {
        // `A —N—T—>`: ENY and the name are two breaks, and the line shows between them
        // (user, 2026-11-02).
        const paints = paintArrow(name, TacticalGraphicHostility.hostileFaker);
        const shaft = paints[0].geometry;
        expect(shaft.type).toBe('MultiLineString');
        const runs = (shaft as {coordinates: number[][][]}).coordinates;
        expect(runs).toHaveLength(3);
        const breaks = [0, 1].map(i => [runs[i][runs[i].length - 1][0], runs[i + 1][0][0]]);
        const words = paints.filter(p => p.text?.kind !== 'amplifier' && p.text);
        expect(words).toHaveLength(2);
        for (const t of words) {
            const x = (t.geometry.coordinates as number[])[0];
            expect(breaks.some(([from, to]) => x > from && x <= to)).toBe(true);
        }
    });

    it.each(DIRECTION_ARROWS)('%s cuts one break when ENY is off', name => {
        resetTacticalGraphicsConfig();
        const runs = (paintArrow(name, TacticalGraphicHostility.hostileFaker)[0].geometry as {coordinates: number[][][]}).coordinates;
        expect(runs).toHaveLength(2);
    });
});
