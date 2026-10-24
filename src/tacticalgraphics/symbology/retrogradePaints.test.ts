/**
 * # A retrograde task's letter, zoomed out
 *
 * The letter used to shrink with the graphic until the legibility floor removed it, while
 * the gap cut for it stayed. It now holds at 6 px, then goes, and the segment closes behind
 * it (user, 2026-10-24). @see letterInGapScale
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {MIN_LEGIBLE_TEXT_PX, resetTacticalGraphicsConfig} from '../core/config';
import {TacticalGraphicName} from '../core/type';
import {retrogradeTaskPaint} from './retrogradePaints';

/** One map unit per screen pixel, so every coordinate below reads as pixels. */
const context: PaintContext = {
    resolution: 1,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
};

/** A flat cane whose extent caps the letter well under 6 px. */
const feature = (length: number): PaintFeature => ({
    geometry: {type: 'MultiLineString', coordinates: [[[0, 0], [length, 0]], [[length, 0], [length, 2]]]},
    properties: {name: TacticalGraphicName.Delay},
    bounds: {minX: 0, minY: 0, maxX: length, maxY: 2},
});

const lines = (paints: Paint[]): ProjectedPosition[][] =>
    (paints.find(p => p.stroke)!.geometry as {coordinates: ProjectedPosition[][]}).coordinates;

beforeEach(() => resetTacticalGraphicsConfig());

it('a retrograde task keeps its letter at 6 px, then drops it and closes the segment', () => {
    const small = retrogradeTaskPaint('D')(feature(30), context);
    const text = small.find(p => p.text)!.text!;
    expect(24 * text.scale!).toBeCloseTo(MIN_LEGIBLE_TEXT_PX, 6);
    const [, before, after] = lines(small);
    expect(after[0][0] - before[1][0]).toBeGreaterThan(0);

    const tiny = retrogradeTaskPaint('D')(feature(10), context);
    expect(tiny.find(p => p.text)).toBeUndefined();
    // The two halves meet: nothing is cut between them.
    const [, first, second] = lines(tiny);
    expect(second[0][0] - first[1][0]).toBe(0);
});
