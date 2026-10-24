/**
 * # A retrograde task's letter, zoomed out
 *
 * The letter keeps the scale the graphic gives it and is never floored: once that would put
 * it under 6 px it goes, and the segment closes behind it (user, 2026-10-24).
 * @see letterInGapScale
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {MIN_LEGIBLE_TEXT_PX, resetTacticalGraphicsConfig} from '../core/config';
import {TacticalGraphicName} from '../core/type';
import {scaleOf} from './paintFunctions';
import {retrogradeTaskPaint} from './retrogradePaints';

/** One map unit per screen pixel, so every coordinate below reads as pixels. */
const context: PaintContext = {
    resolution: 1,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
};

/** A flat cane whose extent caps the letter: well under 6 px at 30 px long, well over it at 100. */
const feature = (length: number): PaintFeature => ({
    geometry: {type: 'MultiLineString', coordinates: [[[0, 0], [length, 0]], [[length, 0], [length, 2]]]},
    properties: {name: TacticalGraphicName.Delay},
    bounds: {minX: 0, minY: 0, maxX: length, maxY: 2},
});

const lines = (paints: Paint[]): ProjectedPosition[][] =>
    (paints.find(p => p.stroke)!.geometry as {coordinates: ProjectedPosition[][]}).coordinates;

beforeEach(() => resetTacticalGraphicsConfig());

it('a retrograde task draws its letter at its own scale, and drops it and closes the segment once the letter would be under 6 px', () => {
    const desired = scaleOf(feature(100), context, 24);
    expect(24 * desired).toBeGreaterThan(MIN_LEGIBLE_TEXT_PX);
    const legible = retrogradeTaskPaint('D')(feature(100), context);
    expect(legible.find(p => p.text)!.text!.scale!).toBeCloseTo(desired, 9);
    const [, before, after] = lines(legible);
    expect(after[0][0] - before[1][0]).toBeGreaterThan(0);

    expect(24 * scaleOf(feature(30), context, 24)).toBeLessThan(MIN_LEGIBLE_TEXT_PX);
    const small = retrogradeTaskPaint('D')(feature(30), context);
    expect(small.find(p => p.text)).toBeUndefined();
    // The two halves meet: nothing is cut between them.
    const [, smallFirst, smallSecond] = lines(small);
    expect(smallSecond[0][0] - smallFirst[1][0]).toBe(0);

    const tiny = retrogradeTaskPaint('D')(feature(10), context);
    expect(tiny.find(p => p.text)).toBeUndefined();
    const [, first, second] = lines(tiny);
    expect(second[0][0] - first[1][0]).toBe(0);
});
