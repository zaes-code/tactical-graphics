/**
 * # Turn, relief in place and exfiltrate keep their letters legible, or drop them and the gap
 *
 * Each cuts a gap in its own line work for a doctrinal letter. The letter keeps the scale the
 * graphic gives it and is never floored: once that would put it under 6 px, or the graphic is
 * under twice its size, the letter goes and the line work is drawn whole. (User, 2026-10-24.) @see letterInGapScale
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {MIN_LEGIBLE_TEXT_PX, resetTacticalGraphicsConfig} from '../core/config';
import {RATIO_LOCKED_LABEL_FONT_PX, labelScale} from '../core/symbology';
import {exfiltratePaint, reliefInPlacePaint, turnPaint} from './routedTaskPaints';
import {missionTaskLabelPaint, scaleOf} from './paintFunctions';
import {capLabelToGraphic} from './labelFit';

const context = (resolution: number): PaintContext => ({
    resolution,
    measureText: (text, font) => {
        const px = parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16');
        return text.length * px * 0.6;
    },
});

beforeEach(() => resetTacticalGraphicsConfig());

const lines = (paints: Paint[]): ProjectedPosition[][] =>
    paints.flatMap(p =>
        p.geometry.type === 'LineString' ? [p.geometry.coordinates] : p.geometry.type === 'MultiLineString' ? p.geometry.coordinates : [],
    );
const texts = (paints: Paint[]) => paints.filter(p => p.text).map(p => p.text!);

describe('turn draws its letter at its own scale, and drops it and closes the curve once the letter would be under 6 px', () => {
    /** Drawn at the zoom it is viewed at, so the zoom-anchored letter is at full size. */
    const AT_VIEW = 1000;
    /** Drawn zoomed in, so the zoom-anchored letter is at its 0.3 floor here. */
    const ZOOMED_IN = 100;
    /** A turn `lengthPx` across at 1000 m/px, as its two halves meeting at the "T". */
    const turn = (lengthPx: number, geometry: 'graphic' | 'label', drawingResolution = ZOOMED_IN): PaintFeature => {
        const L = lengthPx * 1000;
        const mid: ProjectedPosition = [L / 2, L / 8];
        return {
            geometry: geometry === 'graphic'
                ? {type: 'MultiLineString', coordinates: [[[0, 0], mid], [mid, [L, 0]]]}
                : {type: 'Point', coordinates: mid},
            properties: {name: TacticalGraphicName.TacticalTurn},
            drawingResolution,
            bounds: {minX: 0, minY: 0, maxX: L, maxY: L / 8},
        };
    };
    const letter = (lengthPx: number, drawingResolution = ZOOMED_IN) =>
        texts(missionTaskLabelPaint(TacticalGraphicName.TacticalTurn)(turn(lengthPx, 'label', drawingResolution), context(1000)))[0];
    /** Does either half of the curve still reach the letter's anchor? */
    const reachesLetter = (lengthPx: number, drawingResolution = ZOOMED_IN) => {
        const mid = (turn(lengthPx, 'label').geometry as {coordinates: ProjectedPosition}).coordinates;
        return lines(turnPaint('T')(turn(lengthPx, 'graphic', drawingResolution), context(1000)))
            .some(line => line.some(c => Math.hypot(c[0] - mid[0], c[1] - mid[1]) < 1e-6));
    };
    /** The scale the family asks for before the gap rule: zoom-anchored, capped by the graphic. */
    const desired = (lengthPx: number, drawingResolution: number): number =>
        capLabelToGraphic(labelScale(drawingResolution, 1000), turn(lengthPx, 'label', drawingResolution), context(1000));

    it('draws the letter at the scale it asks for and opens the curve round it', () => {
        expect(16 * desired(100, AT_VIEW)).toBeGreaterThan(MIN_LEGIBLE_TEXT_PX);
        const legible = letter(100, AT_VIEW);
        expect(legible).toBeDefined();
        expect(legible.scale!).toBeCloseTo(desired(100, AT_VIEW), 9);
        expect(reachesLetter(100, AT_VIEW)).toBe(false);
    });

    it('draws no letter and the curve whole once the letter would be under 6 px', () => {
        expect(16 * desired(40, ZOOMED_IN)).toBeLessThan(MIN_LEGIBLE_TEXT_PX);
        expect(letter(40)).toBeUndefined();
        expect(reachesLetter(40)).toBe(true);
    });

    it('draws no letter and the curve whole once the turn is under twice the letter', () => {
        expect(letter(10)).toBeUndefined();
        expect(reachesLetter(10)).toBe(true);
    });
});

describe('relief in place and exfiltrate draw their letters at their own scale, and drop them and the gap once under 6 px', () => {
    /** A route whose lettered segment is `lengthPx` long at 1000 m/px. */
    const route = (name: TacticalGraphicName, lengthPx: number): PaintFeature => {
        const L = lengthPx * 1000;
        return {
            geometry: {
                type: 'MultiLineString',
                coordinates: [[[0, L / 2], [L, L / 2]], [[L, L / 2], [L, 0]], [[L, 0], [0, 0]], [[0, 0], [L / 10, L / 20]]],
            },
            properties: {name},
            bounds: {minX: 0, minY: 0, maxX: L, maxY: L / 2},
        };
    };
    /** How many pieces the lettered segment is drawn in. */
    const pieces = (paints: Paint[], lengthPx: number) =>
        lines(paints).filter(line => line.every(c => c[1] === (lengthPx * 1000) / 2)).length;

    it.each([
        ['RIP', TacticalGraphicName.ReliefInPlace, (label: string) => reliefInPlacePaint(label), 40],
        ['EX', TacticalGraphicName.Exfiltrate, (label: string) => exfiltratePaint(label), 30],
    ])('%s is drawn at its own scale in a gap, then goes with the gap once under 6 px', (label, name, paint, smallPx) => {
        const desired = scaleOf(route(name, 100), context(1000), RATIO_LOCKED_LABEL_FONT_PX);
        expect(RATIO_LOCKED_LABEL_FONT_PX * desired).toBeGreaterThan(MIN_LEGIBLE_TEXT_PX);
        const legible = paint(label)(route(name, 100), context(1000));
        expect(texts(legible)).toHaveLength(1);
        expect(texts(legible)[0].scale!).toBeCloseTo(desired, 9);
        expect(pieces(legible, 100)).toBe(2);

        expect(RATIO_LOCKED_LABEL_FONT_PX * scaleOf(route(name, smallPx), context(1000), RATIO_LOCKED_LABEL_FONT_PX)).toBeLessThan(MIN_LEGIBLE_TEXT_PX);
        const small = paint(label)(route(name, smallPx), context(1000));
        expect(texts(small)).toHaveLength(0);
        expect(pieces(small, smallPx)).toBe(1);

        const tiny = paint(label)(route(name, 12), context(1000));
        expect(texts(tiny)).toHaveLength(0);
        expect(pieces(tiny, 12)).toBe(1);
    });
});
