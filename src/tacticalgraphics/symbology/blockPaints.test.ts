/**
 * # The block family's letter, zoomed out
 *
 * The letter used to shrink with the graphic until the legibility floor removed it, while
 * the gap cut for it stayed: zoomed out, the symbol was mostly hole. It now holds at 6 px,
 * then goes, and the line closes behind it (user, 2026-10-24). @see letterInGapScale
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {MIN_LEGIBLE_TEXT_PX, resetTacticalGraphicsConfig} from '../core/config';
import {TacticalGraphicName} from '../core/type';
import {blockPaint, breachPaint, clearPaint} from './blockPaints';

/** One map unit per screen pixel, so every coordinate below reads as pixels. */
const context: PaintContext = {
    resolution: 1,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
};

/** A feature whose stamped size puts the family's desired letter well under 6 px. */
const feature = (lines: ProjectedPosition[][]): PaintFeature => ({
    geometry: {type: 'MultiLineString', coordinates: lines},
    properties: {name: TacticalGraphicName.Breach},
    graphicSize: 4,
});

const letterPx = (paints: Paint[]): number | undefined => {
    const text = paints.find(p => p.text)?.text;
    return text ? 24 * text.scale! : undefined;
};

const strokeLines = (paints: Paint[]): ProjectedPosition[][] => {
    const line = paints.find(p => p.stroke)!.geometry as {coordinates: ProjectedPosition[][]};
    return line.coordinates;
};

/** A line the paints draw whole, beside the one carrying the letter. */
const BAR: ProjectedPosition[] = [[0, -20], [0, 20]];

beforeEach(() => resetTacticalGraphicsConfig());

describe('the block family keeps its letter at 6 px, then drops it and closes the line', () => {
    it('block', () => {
        const small = blockPaint('B')(feature([[[0, 0], [100, 0]], BAR]), context);
        expect(letterPx(small)).toBeCloseTo(MIN_LEGIBLE_TEXT_PX, 6);
        expect(strokeLines(small)).toHaveLength(3); // the bar, and the shaft either side of the gap

        const tiny = blockPaint('B')(feature([[[0, 0], [10, 0]], BAR]), context);
        expect(letterPx(tiny)).toBeUndefined();
        expect(strokeLines(tiny)).toEqual([BAR, [[0, 0], [10, 0]]]);
    });

    it('breach', () => {
        const small = breachPaint('B')(feature([BAR, [[0, 0], [100, 0]]]), context);
        expect(letterPx(small)).toBeCloseTo(MIN_LEGIBLE_TEXT_PX, 6);
        expect(strokeLines(small)).toHaveLength(3);

        const tiny = breachPaint('B')(feature([BAR, [[0, 0], [10, 0]]]), context);
        expect(letterPx(tiny)).toBeUndefined();
        expect(strokeLines(tiny)).toEqual([BAR, [[0, 0], [10, 0]]]);
    });

    it('clear', () => {
        const prongs = (length: number): ProjectedPosition[][] => [BAR, BAR, BAR, BAR, [[0, 0], [length, 0]]];
        const small = clearPaint('C')(feature(prongs(100)), context);
        expect(letterPx(small)).toBeCloseTo(MIN_LEGIBLE_TEXT_PX, 6);
        expect(strokeLines(small)).toHaveLength(6);

        const tiny = clearPaint('C')(feature(prongs(10)), context);
        expect(letterPx(tiny)).toBeUndefined();
        expect(strokeLines(tiny)).toHaveLength(5);
        expect(strokeLines(tiny)[4]).toEqual([[0, 0], [10, 0]]);
    });
});
