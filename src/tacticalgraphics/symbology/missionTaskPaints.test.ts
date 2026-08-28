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
import {resetTacticalGraphicsConfig} from '../core/config';
import {CROSSED_HALF_WIDTH_PX, crossedMissionTaskLabelPaint, crossedMissionTaskPaint} from './missionTaskPaints';

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
        // of line work with a full-size letter sitting in it. A quarter of the size on
        // screen is a quarter of the label.
        const atCap = labelScale(name, CROSSED_HALF_WIDTH_PX * 100, 100);
        const quarter = labelScale(name, CROSSED_HALF_WIDTH_PX * 25, 100);
        expect(quarter / atCap).toBeCloseTo(0.25, 6);
    });

    it.each(CROSSED)('%s measures the arms\' gap from the same label it draws', name => {
        // Two calls to one rule, not the rule twice. If the gap used the uncapped
        // half-width while the label used the capped one, a large symbol would open a hole
        // several times the letter that sits in it — and it would look deliberate.
        const small = CROSSED_HALF_WIDTH_PX * 25;
        const large = CROSSED_HALF_WIDTH_PX * 800;
        expect(gapPx(name, large, 100)).toBeCloseTo(gapPx(name, CROSSED_HALF_WIDTH_PX * 100, 100), 6);
        expect(gapPx(name, small, 100)).toBeLessThan(gapPx(name, large, 100));
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
