/**
 * # The crossed mission tasks' label tracks the symbol down and stops going up
 *
 * Destroy, interdict, neutralize and suppress were fixed-size badges until 2026-08-17: the
 * paint pinned them to a constant 100 px across, so a stored size was divided straight back
 * out and neither a resize nor a zoom could reach the picture. They now carry a real size,
 * cover ground, and scale with the map like it.
 *
 * That leaves the one-letter label with two ways to be wrong, and the library had already
 * been both:
 *
 * - **Ratio-locked outright** — the letter grows without limit as the operator drags the
 *   symbol out, until a `D` is the size of a building.
 * - **Fixed outright** — it does not shrink when the graphic does, so zooming out leaves a
 *   full-size letter sitting in a symbol that has become a few pixels of line work.
 *
 * So it is measured against the symbol's own on-screen half-width, **capped at the size the
 * symbol is dropped at**: below the cap the two shrink together, above it the graphic keeps
 * growing and the label stays legible at the size it was designed for.
 *
 * The arms' gap is measured from the same number, because a gap has to fit the label that
 * actually renders. That is the assertion that would have caught the two being computed
 * separately, which is how they were for a few hours on the way here.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {MIN_LEGIBLE_TEXT_PX, resetTacticalGraphicsConfig} from '../core/config';
import {labelScale as labelScale_} from '../core/symbology';
import {CROSSED_HALF_WIDTH_PX, crossedMissionTaskLabelPaint, crossedMissionTaskLabelScale, crossedMissionTaskPaint, pursuitPaint} from './missionTaskPaints';
import {capLabelToGraphic} from './labelFit';
import {missionTaskLabelPaint} from './paintFunctions';

const context = (resolution: number): PaintContext => ({
    resolution,
    measureText: (text, font) => {
        const px = parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16');
        return text.length * px * 0.6;
    },
});

const CROSSED = [
    TacticalGraphicName.Destroy,
    TacticalGraphicName.Interdict,
    TacticalGraphicName.Neutralize,
    TacticalGraphicName.Suppress,
];

/** The arms, as the generator lays them out: two lines crossing at the origin. */
const arms = (size: number): ProjectedPosition[][] => [
    [[-size, 0], [size, 0]],
    [[0, -size], [0, size]],
];

const labelScale = (name: TacticalGraphicName, size: number, resolution: number): number => {
    const [paint] = crossedMissionTaskLabelPaint(name)({
        geometry: {type: 'Point', coordinates: [0, 0]},
        properties: {name},
        graphicSize: size,
    } as PaintFeature, context(resolution));
    return paint.text!.scale!;
};

/** Half the gap the arms leave for the label, in screen pixels. */
const gapPx = (name: TacticalGraphicName, size: number, resolution: number): number => {
    const painted: Paint[] = crossedMissionTaskPaint(name)({
        geometry: {type: 'MultiLineString', coordinates: arms(size)},
        properties: {name},
        graphicSize: size,
        graphicCenter: [0, 0],
    } as PaintFeature, context(resolution));

    // The horizontal arm arrives as two pieces either side of the hole. The inner end of
    // the left piece is where the gap begins.
    const horizontal = painted
        .map(p => p.geometry)
        .filter((g): g is {type: 'LineString'; coordinates: ProjectedPosition[]} =>
            g.type === 'LineString' && g.coordinates.every(c => c[1] === 0));
    if (horizontal.length < 2) return 0;
    return Math.min(...horizontal.map(g => Math.min(...g.coordinates.map(c => Math.abs(c[0]))))) / resolution;
};

beforeEach(() => resetTacticalGraphicsConfig());

describe('the crossed mission tasks', () => {
    it.each(CROSSED)('%s holds its label still once the symbol passes the drop size', name => {
        // Twice the drop size and eight times it: the graphic keeps growing, the label does
        // not. Ratio-locked without a cap, these differ by a factor of four.
        const big = labelScale(name, CROSSED_HALF_WIDTH_PX * 200, 100);
        const huge = labelScale(name, CROSSED_HALF_WIDTH_PX * 800, 100);
        expect(huge).toBeCloseTo(big, 6);
    });

    it.each(CROSSED)('%s shrinks its label with the symbol below the drop size', name => {
        // The complaint this fixes: zoom out far enough and the symbol becomes a few pixels
        // of line work with a full-size letter sitting in it. Half the size on screen is half
        // the label, down to the legibility floor. @see the minimum below
        const atCap = labelScale(name, CROSSED_HALF_WIDTH_PX * 100, 100);
        const half = labelScale(name, CROSSED_HALF_WIDTH_PX * 50, 100);
        expect(half / atCap).toBeCloseTo(0.5, 6);
    });

    it.each(CROSSED)('%s draws its letter at its own scale, and drops it and closes the arms once the letter would be under 6 px', name => {
        // Held at 6 px, the letter read as a speck in a ring of line work rather than as the
        // task. It is never floored now: under 6 px it goes, and the arms close (user, 2026-10-24).
        const fontPx = 24;
        const labelPaints = (size: number) =>
            crossedMissionTaskLabelPaint(name)({geometry: {type: 'Point', coordinates: [0, 0]}, properties: {name}, graphicSize: size} as PaintFeature, context(100));

        // Half the drop size: the letter is at half its full size, which is still over 6 px.
        const legible = CROSSED_HALF_WIDTH_PX * 50;
        const desired = crossedMissionTaskLabelScale(CROSSED_HALF_WIDTH_PX / 2);
        expect(fontPx * desired).toBeGreaterThan(MIN_LEGIBLE_TEXT_PX);
        expect(labelScale(name, legible, 100)).toBeCloseTo(desired, 9);
        expect(gapPx(name, legible, 100)).toBeGreaterThan(0);

        // A quarter of it: the letter would be under 6 px, so there is none and the arms are whole.
        const small = CROSSED_HALF_WIDTH_PX * 25;
        expect(fontPx * crossedMissionTaskLabelScale(CROSSED_HALF_WIDTH_PX / 4)).toBeLessThan(MIN_LEGIBLE_TEXT_PX);
        expect(labelPaints(small)).toEqual([]);
        expect(gapPx(name, small, 100)).toBe(0);

        // A symbol a few pixels across: no letter, and the arms drawn whole.
        const tiny = CROSSED_HALF_WIDTH_PX * 4;
        expect(labelPaints(tiny)).toEqual([]);
        expect(gapPx(name, tiny, 100)).toBe(0);
    });

    it.each(CROSSED)('%s measures the arms\' gap from the same label it draws', name => {
        // Two calls to one rule, not the rule twice. If the gap used the uncapped
        // half-width while the label used the capped one, a large symbol would open a hole
        // several times the letter that sits in it — and it would look deliberate.
        const small = CROSSED_HALF_WIDTH_PX * 50; // still lettered, so its gap is the letter's
        const large = CROSSED_HALF_WIDTH_PX * 800;
        expect(gapPx(name, large, 100)).toBeCloseTo(gapPx(name, CROSSED_HALF_WIDTH_PX * 100, 100), 6);
        expect(gapPx(name, small, 100)).toBeLessThan(gapPx(name, large, 100));
        expect(gapPx(name, small, 100)).toBeGreaterThan(0);
    });

    it.each(CROSSED)('%s draws the arms where the generator put them, unrescaled', name => {
        // Nothing is divided out any more. Stated separately because a pin quietly
        // reintroduced leaves a symbol that still looks right at the zoom it was placed at.
        const size = CROSSED_HALF_WIDTH_PX * 400;
        const painted = crossedMissionTaskPaint(name)({
            geometry: {type: 'MultiLineString', coordinates: arms(size)},
            properties: {name},
            graphicSize: size,
            graphicCenter: [0, 0],
        } as PaintFeature, context(100));

        const xs = painted.flatMap(p => {
            const g = p.geometry as {type: string; coordinates: ProjectedPosition[]};
            return g.type === 'LineString' ? g.coordinates.map(c => c[0]) : [];
        });
        expect(Math.max(...xs)).toBeCloseTo(size, 6);
    });
});

describe('pursuit draws its letter at its own scale, and drops it and closes the run once the letter would be under 6 px', () => {
    /**
     * A pursuit `lengthPx` long at 1000 m/px: the run, then the hook, with both halves' extent.
     * Drawn at `drawingResolution`, which anchors the zoom-anchored letter.
     */
    const pursuit = (lengthPx: number, geometry: 'graphic' | 'label', drawingResolution: number): PaintFeature => {
        const L = lengthPx * 1000;
        return {
            geometry: geometry === 'graphic'
                ? {type: 'MultiLineString', coordinates: [[[0, 0], [L, 0]], [[L, 0], [L, L / 4]]]}
                : {type: 'Point', coordinates: [L / 2, 0]},
            properties: {name: TacticalGraphicName.Pursuit},
            drawingResolution,
            bounds: {minX: 0, minY: 0, maxX: L, maxY: L / 4},
        };
    };
    /** Drawn at the zoom it is viewed at, so the zoom-anchored letter is at full size. */
    const AT_VIEW = 1000;
    /** Drawn zoomed in, so the zoom-anchored letter is at its 0.3 floor here. */
    const ZOOMED_IN = 100;
    const runPieces = (lengthPx: number, drawingResolution = ZOOMED_IN): number =>
        pursuitPaint(TacticalGraphicName.Pursuit)(pursuit(lengthPx, 'graphic', drawingResolution), context(1000))
            .filter(p => p.geometry.type === 'LineString' && p.geometry.coordinates.every(c => c[1] === 0)).length;
    const letter = (lengthPx: number, drawingResolution = ZOOMED_IN) =>
        missionTaskLabelPaint(TacticalGraphicName.Pursuit)(pursuit(lengthPx, 'label', drawingResolution), context(1000))[0]?.text;
    /** The scale the family asks for before the gap rule: zoom-anchored, capped by the graphic. */
    const desired = (lengthPx: number, drawingResolution: number): number =>
        capLabelToGraphic(labelScale_(drawingResolution, 1000), pursuit(lengthPx, 'label', drawingResolution), context(1000));

    it('draws the letter at the scale it asks for and splits the run round it', () => {
        expect(16 * desired(100, AT_VIEW)).toBeGreaterThan(MIN_LEGIBLE_TEXT_PX);
        const legible = letter(100, AT_VIEW);
        expect(legible).toBeDefined();
        expect(legible!.scale!).toBeCloseTo(desired(100, AT_VIEW), 9);
        expect(runPieces(100, AT_VIEW)).toBe(2);
    });

    it('draws no letter and the run whole once the letter would be under 6 px', () => {
        expect(16 * desired(40, ZOOMED_IN)).toBeLessThan(MIN_LEGIBLE_TEXT_PX);
        expect(letter(40)).toBeUndefined();
        expect(runPieces(40)).toBe(1);
    });

    it('draws no letter and the run whole once the pursuit is under twice the letter', () => {
        expect(letter(10)).toBeUndefined();
        expect(runPieces(10)).toBe(1);
    });
});
