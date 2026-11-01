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
import {getPaintFunction} from './registry';

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

/**
 * APP-06 270502, FM 1-02.2 Table 5-19 and MIL-STD-2525E Table L-XVI fill the obstacle
 * disrupt's three heads; 341000, the mission task, draws them open on every plate.
 */
describe('the disrupts’ arrowheads', () => {
    // The generator's sub-line order: [shaft, head] for the long, short and middle prongs, then the bar.
    const head = (x: number, y: number): ProjectedPosition[] => [[x - 10, y + 10], [x, y], [x - 10, y - 10]];
    const trident: ProjectedPosition[][] = [
        [[0, 100], [200, 100]], head(200, 100),
        [[0, 0], [100, 0]], head(100, 0),
        [[-80, 50], [150, 50]], head(150, 50),
        [[0, 0], [0, 100]],
    ];
    const drawn = (name: TacticalGraphicName): PaintFeature => ({
        geometry: {type: 'MultiLineString', coordinates: trident},
        properties: {name},
        graphicSize: LEGIBLE_SIZE,
    });
    const fills = (paints: Paint[]) => paints.filter(p => p.fill && p.geometry.type === 'Polygon');

    it('fills the obstacle effect’s three, slimmer than the open barbs', () => {
        const solid = fills(clearPaint('', 0.75, [1, 3, 5])(drawn(TacticalGraphicName.Disrupt), context));
        expect(solid).toHaveLength(3);
        const [tip, left, right] = (solid[0].geometry as {coordinates: ProjectedPosition[][]}).coordinates[0];
        const halfAngle = (p: ProjectedPosition) => Math.atan2(Math.abs(p[1] - tip[1]), Math.abs(p[0] - tip[0])) * (180 / Math.PI);
        expect(halfAngle(left)).toBeCloseTo(24, 6);
        expect(halfAngle(right)).toBeCloseTo(24, 6);
    });

    it('leaves the mission task’s open', () => {
        expect(fills(clearPaint('D', 0.75)(drawn(TacticalGraphicName.TacticalDisrupt), context))).toEqual([]);
    });

    it('is what the shared registry paints for each, so both engines agree', () => {
        expect(fills(getPaintFunction(TacticalGraphicName.Disrupt)!.graphic(drawn(TacticalGraphicName.Disrupt), context))).toHaveLength(3);
        expect(fills(getPaintFunction(TacticalGraphicName.TacticalDisrupt)!.graphic(drawn(TacticalGraphicName.TacticalDisrupt), context))).toEqual([]);
    });
});
