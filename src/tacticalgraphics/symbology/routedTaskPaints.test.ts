/**
 * # Turn, relief in place and exfiltrate keep their letters legible, or drop them and the gap
 *
 * Each cuts a gap in its own line work for a doctrinal letter. Zoomed far out the letter used
 * to shrink under the 6 px legibility floor and vanish while the gap stayed, so the symbol was
 * mostly a hole. The letter now holds at 6 px, and once the graphic is under twice its size
 * the letter goes and the line work is drawn whole. (User, 2026-10-24.) @see letterInGapScale
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {MIN_LEGIBLE_TEXT_PX, resetTacticalGraphicsConfig} from '../core/config';
import {RATIO_LOCKED_LABEL_FONT_PX} from '../core/symbology';
import {exfiltratePaint, reliefInPlacePaint, turnPaint} from './routedTaskPaints';
import {missionTaskLabelPaint} from './paintFunctions';

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

describe('turn keeps its letter at 6 px, then drops it and closes the curve', () => {
    /** A turn `lengthPx` across at 1000 m/px, as its two halves meeting at the "T". */
    const turn = (lengthPx: number, geometry: 'graphic' | 'label'): PaintFeature => {
        const L = lengthPx * 1000;
        const mid: ProjectedPosition = [L / 2, L / 8];
        return {
            geometry: geometry === 'graphic'
                ? {type: 'MultiLineString', coordinates: [[[0, 0], mid], [mid, [L, 0]]]}
                : {type: 'Point', coordinates: mid},
            properties: {name: TacticalGraphicName.TacticalTurn},
            // Drawn zoomed in, so the zoom-anchored letter is at its 0.3 floor here.
            drawingResolution: 100,
            bounds: {minX: 0, minY: 0, maxX: L, maxY: L / 8},
        };
    };
    const letter = (lengthPx: number) =>
        texts(missionTaskLabelPaint(TacticalGraphicName.TacticalTurn)(turn(lengthPx, 'label'), context(1000)))[0];
    /** Does either half of the curve still reach the letter's anchor? */
    const reachesLetter = (lengthPx: number) => {
        const mid = (turn(lengthPx, 'label').geometry as {coordinates: ProjectedPosition}).coordinates;
        return lines(turnPaint('T')(turn(lengthPx, 'graphic'), context(1000)))
            .some(line => line.some(c => Math.hypot(c[0] - mid[0], c[1] - mid[1]) < 1e-6));
    };

    it('holds the letter at the legibility floor and still opens the curve round it', () => {
        const small = letter(40);
        expect(small).toBeDefined();
        expect(16 * small.scale!).toBeCloseTo(MIN_LEGIBLE_TEXT_PX, 6);
        expect(reachesLetter(40)).toBe(false);
    });

    it('draws no letter and the curve whole once the turn is under twice the letter', () => {
        expect(letter(10)).toBeUndefined();
        expect(reachesLetter(10)).toBe(true);
    });
});

describe('relief in place and exfiltrate keep their letters at 6 px, then drop them and the gap', () => {
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
    ])('%s holds at the legibility floor in a gap, then goes with the gap', (label, name, paint, smallPx) => {
        const small = paint(label)(route(name, smallPx), context(1000));
        expect(texts(small)).toHaveLength(1);
        expect(RATIO_LOCKED_LABEL_FONT_PX * texts(small)[0].scale!).toBeCloseTo(MIN_LEGIBLE_TEXT_PX, 6);
        expect(pieces(small, smallPx)).toBe(2);

        const tiny = paint(label)(route(name, 12), context(1000));
        expect(texts(tiny)).toHaveLength(0);
        expect(pieces(tiny, 12)).toBe(1);
    });
});
