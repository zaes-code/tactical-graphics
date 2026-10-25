/**
 * # The block family's letter, zoomed out
 *
 * The letter keeps the scale the family gives it and is never floored: once that scale would
 * put it under 6 px it goes, and the line closes behind it. A line under twice the letter
 * closes too (user, 2026-10-24). @see letterInGapScale
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {MIN_LEGIBLE_TEXT_PX, resetTacticalGraphicsConfig} from '../core/config';
import {graphicLabelScale} from '../core/symbology';
import {TacticalGraphicName} from '../core/type';
import {blockPaint, breachPaint, clearPaint} from './blockPaints';

/** One map unit per screen pixel, so every coordinate below reads as pixels. */
const context: PaintContext = {
    resolution: 1,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
};

/** Puts the family's desired letter well under 6 px. */
const SMALL_SIZE = 4;
/** Puts the family's desired letter comfortably over 6 px. */
const LEGIBLE_SIZE = 16;

const feature = (lines: ProjectedPosition[][], graphicSize = SMALL_SIZE): PaintFeature => ({
    geometry: {type: 'MultiLineString', coordinates: lines},
    properties: {name: TacticalGraphicName.Breach},
    graphicSize,
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

/** The letter size the family asks for at `graphicSize`, with nothing capping it. */
const desiredPx = (graphicSize: number): number => 24 * graphicLabelScale(graphicSize, undefined, context.resolution);

beforeEach(() => resetTacticalGraphicsConfig());

it('the setup brackets the legibility floor', () => {
    expect(desiredPx(LEGIBLE_SIZE)).toBeGreaterThan(MIN_LEGIBLE_TEXT_PX);
    expect(desiredPx(SMALL_SIZE)).toBeLessThan(MIN_LEGIBLE_TEXT_PX);
});

describe('the block family draws its letter at its own scale, and drops it and closes the line once the letter would be under 6 px', () => {
    it('block', () => {
        const legible = blockPaint('B')(feature([[[0, 0], [100, 0]], BAR], LEGIBLE_SIZE), context);
        expect(letterPx(legible)).toBeCloseTo(desiredPx(LEGIBLE_SIZE), 6);
        expect(strokeLines(legible)).toHaveLength(3); // the bar, and the shaft either side of the gap

        const small = blockPaint('B')(feature([[[0, 0], [100, 0]], BAR]), context);
        expect(letterPx(small)).toBeUndefined();
        expect(strokeLines(small)).toEqual([BAR, [[0, 0], [100, 0]]]);

        const tiny = blockPaint('B')(feature([[[0, 0], [10, 0]], BAR]), context);
        expect(letterPx(tiny)).toBeUndefined();
        expect(strokeLines(tiny)).toEqual([BAR, [[0, 0], [10, 0]]]);
    });

    it('breach', () => {
        const legible = breachPaint('B')(feature([BAR, [[0, 0], [100, 0]]], LEGIBLE_SIZE), context);
        expect(letterPx(legible)).toBeCloseTo(desiredPx(LEGIBLE_SIZE), 6);
        expect(strokeLines(legible)).toHaveLength(3);

        const small = breachPaint('B')(feature([BAR, [[0, 0], [100, 0]]]), context);
        expect(letterPx(small)).toBeUndefined();
        expect(strokeLines(small)).toEqual([BAR, [[0, 0], [100, 0]]]);

        const tiny = breachPaint('B')(feature([BAR, [[0, 0], [10, 0]]]), context);
        expect(letterPx(tiny)).toBeUndefined();
        expect(strokeLines(tiny)).toEqual([BAR, [[0, 0], [10, 0]]]);
    });

    it('clear', () => {
        const prongs = (length: number): ProjectedPosition[][] => [BAR, BAR, BAR, BAR, [[0, 0], [length, 0]]];
        const legible = clearPaint('C')(feature(prongs(100), LEGIBLE_SIZE), context);
        expect(letterPx(legible)).toBeCloseTo(desiredPx(LEGIBLE_SIZE), 6);
        expect(strokeLines(legible)).toHaveLength(6);

        const small = clearPaint('C')(feature(prongs(100)), context);
        expect(letterPx(small)).toBeUndefined();
        expect(strokeLines(small)).toHaveLength(5);
        expect(strokeLines(small)[4]).toEqual([[0, 0], [100, 0]]);

        const tiny = clearPaint('C')(feature(prongs(10)), context);
        expect(letterPx(tiny)).toBeUndefined();
        expect(strokeLines(tiny)).toHaveLength(5);
        expect(strokeLines(tiny)[4]).toEqual([[0, 0], [10, 0]]);
    });
});
