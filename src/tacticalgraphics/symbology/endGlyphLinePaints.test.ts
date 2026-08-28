/**
 * # The two lines that stand a glyph on each anchor point
 *
 * A star and a fork, neither of which exists anywhere else in the library. Both blocks
 * quote the rule they enforce. @see endGlyphLinePaints.ts
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicEchelon, TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {decisionLinePaint, mobilityCorridorPaint} from './endGlyphLinePaints';

const context = (resolution = 40): PaintContext => ({
    resolution,
    measureText: (text, font) => {
        const px = parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16');
        return text.length * px * 0.6;
    },
});

const EAST: ProjectedPosition[] = [[0, 0], [40_000, 0]];

const feature = (name: TacticalGraphicName, properties: Record<string, unknown> = {}): PaintFeature => ({
    geometry: {type: 'LineString', coordinates: EAST},
    properties: {name, ...properties},
});

const lines = (paints: Paint[]): ProjectedPosition[][] =>
    paints.flatMap(p => {
        if (p.geometry.type === 'LineString') return [p.geometry.coordinates];
        if (p.geometry.type === 'MultiLineString') return p.geometry.coordinates;
        return [];
    });

const texts = (paints: Paint[]) => paints.filter(p => p.text?.text).map(p => p.text!.text);

/** The widest horizontal half-extent of a ring about a center. */
const halfWidth = (ring: ProjectedPosition[], center: ProjectedPosition) =>
    Math.max(...ring.map(([x]) => Math.abs(x - center[0])));

/** Whether `point` is strictly inside `ring`, by the crossing rule. */
const insideRing = (point: ProjectedPosition, ring: ProjectedPosition[]): boolean => {
    let inside = false;
    for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > point[1]) !== (yj > point[1])
            && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
};

/** Distance from `point` to the nearest edge of `ring`, in projected metres. */
const distanceToRing = (point: ProjectedPosition, ring: ProjectedPosition[]): number => {
    let best = Infinity;
    for (let i = 0; i + 1 < ring.length; i++) {
        const [ax, ay] = ring[i];
        const [bx, by] = ring[i + 1];
        const dx = bx - ax;
        const dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - ax) * dx + (point[1] - ay) * dy) / lenSq));
        best = Math.min(best, Math.hypot(point[0] - (ax + dx * t), point[1] - (ay + dy * t)));
    }
    return best;
};

beforeEach(() => resetTacticalGraphicsConfig());

describe('APP-06 110500 — decision line', () => {
    const paint = decisionLinePaint();
    const props = {designation: '1X', secondDesignation: '007'};
    const starOf = (paints: Paint[]) => lines(paints).find(path => path.length === 11)!;

    // "The end-of line information will typically be posted at the ends of the line within
    //  the stars as it is displayed on the screen."
    it('sets the information inside a star at each end', () => {
        const paints = paint(feature(TacticalGraphicName.DecisionLine, props), context());
        expect(texts(paints)).toEqual(['1X/007', '1X/007']);

        const spots = paints.filter(p => p.text).map(p => (p.geometry as {coordinates: ProjectedPosition}).coordinates);
        expect(spots).toEqual(EAST);
    });

    it('joins the two fields with a slash, and shows a lone one alone', () => {
        expect(texts(paint(feature(TacticalGraphicName.DecisionLine, {designation: '1X'}), context()))[0]).toBe('1X');
        expect(texts(paint(feature(TacticalGraphicName.DecisionLine, {secondDesignation: '007'}), context()))[0]).toBe('007');
        // No dangling separator either way round.
        expect(texts(paint(feature(TacticalGraphicName.DecisionLine, props), context()))[0]).toBe('1X/007');
    });

    it('draws a pentagram rather than a ten-sided cog', () => {
        const star = starOf(paint(feature(TacticalGraphicName.DecisionLine, props), context()));
        expect(star).toBeDefined();
        // Alternating radii: five long points and five short valleys, the valley a little
        // over a third of the point. Equal radii would draw a decagon.
        const radii = star.slice(0, 10).map(([x, y]) => Math.hypot(x - EAST[0][0], y - EAST[0][1]));
        const points = radii.filter((_r, i) => i % 2 === 0);
        const valleys = radii.filter((_r, i) => i % 2 === 1);
        expect(Math.min(...points)).toBeCloseTo(Math.max(...points), 6);
        expect(Math.max(...valleys) / Math.min(...points)).toBeCloseTo(0.382, 2);
    });

    it('grows the star to hold the text rather than letting it hang out', () => {
        // The bug this replaces: a fixed radius left "1X/007" wider than the star at every
        // realistic font size, so the information sat outside the mark holding it.
        const short = paint(feature(TacticalGraphicName.DecisionLine, {designation: 'A'}), context());
        const long = paint(feature(TacticalGraphicName.DecisionLine, {designation: 'A VERY LONG NAME'}), context());
        expect(halfWidth(starOf(long), EAST[0])).toBeGreaterThan(halfWidth(starOf(short), EAST[0]));
    });

    // The Template draws the connecting line meeting each star's edge and stopping there.
    it('stops the line at the star outline rather than crossing into it', () => {
        const paints = paint(feature(TacticalGraphicName.DecisionLine, props), context());
        const stars = lines(paints).filter(path => path.length === 11);
        const run = lines(paints).find(path => path.length === 2)!;
        expect(stars).toHaveLength(2);
        expect(run).toBeDefined();

        // Both ends pulled back off the anchor points the stars stand on.
        expect(run[0][0]).toBeGreaterThan(EAST[0][0]);
        expect(run[1][0]).toBeLessThan(EAST[1][0]);

        // **On the outline: not inside it, and not short of it.** The line used to run all
        // the way to the anchor point, which put it through the middle of the star.
        stars.forEach((star, i) => {
            const anchor = EAST[i];
            const inward: ProjectedPosition = [run[i][0] + (anchor[0] - run[i][0]) * 0.02, run[i][1]];
            const outward: ProjectedPosition = [run[i][0] - (anchor[0] - run[i][0]) * 0.02, run[i][1]];

            expect(distanceToRing(run[i], star)).toBeLessThan(1);
            expect(insideRing(inward, star)).toBe(true);
            expect(insideRing(outward, star)).toBe(false);
        });
    });

    it('measures the pull-back along the line, so a valley cuts less than a point', () => {
        // The star is upright whichever way the line runs, so a line leaving through a
        // valley meets the outline nearer the centre than one leaving through a point. A
        // single constant pull-back would leave a gap on one bearing and cross on another.
        const at = (coords: ProjectedPosition[]) => {
            const paints = paint({
                geometry: {type: 'LineString', coordinates: coords},
                properties: {name: TacticalGraphicName.DecisionLine, ...props},
            }, context());
            const run = lines(paints).find(path => path.length === 2)!;
            return Math.hypot(run[0][0] - coords[0][0], run[0][1] - coords[0][1]);
        };
        // Straight up leaves through the leading point; east leaves through a flank.
        expect(at([[0, 0], [0, 40_000]])).toBeGreaterThan(at(EAST));
    });

    it('draws the whole line when the stars are too small to draw at all', () => {
        // `endMarkScale` gives up below the visibility floor, and a line with no star on
        // it has nothing to stop at — trimming it then would cut into nothing.
        // 5 px of line at this resolution: a star may span 30% of it, which is below the
        // 3 px floor `DECORATION_MIN_PX` sets.
        const tiny: PaintFeature = {
            geometry: {type: 'LineString', coordinates: [[0, 0], [200, 0]]},
            properties: {name: TacticalGraphicName.DecisionLine, ...props},
        };
        const paints = paint(tiny, context());
        expect(lines(paints).filter(path => path.length === 11)).toHaveLength(0);
        expect(lines(paints)).toEqual([[[0, 0], [200, 0]]]);
    });

    it('keeps the stars upright however the line runs', () => {
        const northward: PaintFeature = {
            geometry: {type: 'LineString', coordinates: [[0, 0], [0, 40_000]]},
            properties: {name: TacticalGraphicName.DecisionLine, ...props},
        };
        const star = starOf(paint(northward, context()));
        // The leading point is straight up, not along the line's bearing.
        expect(star[0][0]).toBeCloseTo(0, 6);
        expect(star[0][1]).toBeGreaterThan(0);
    });
});

describe('APP-06 142100 — mobility corridor', () => {
    const paint = mobilityCorridorPaint();

    it('forks outward at both ends, two arms each', () => {
        const paints = paint(feature(TacticalGraphicName.MobilityCorridor), context());
        const arms = lines(paints).filter(path => path.length === 2 && (
            (path[0][0] === 0 && path[1][0] < 0) || (path[0][0] === 40_000 && path[1][0] > 40_000)
        ));
        // An arm reaching back over the line would make this an arrowhead, not a mouth.
        expect(arms).toHaveLength(4);
    });

    // "Note: Field B is mandatory to articulate the size of force that could exploit the
    //  Mobility Corridor."
    it('draws the echelon in a break at the middle, and draws one even when unset', () => {
        const platoon = paint(
            feature(TacticalGraphicName.MobilityCorridor, {echelon: TacticalGraphicEchelon.platoonDetachment}),
            context(),
        );
        expect(platoon.filter(p => p.circle)).toHaveLength(3);
        // Unset still draws a glyph: the field is mandatory, so blank is not something the
        // symbol is allowed to express.
        expect(paint(feature(TacticalGraphicName.MobilityCorridor), context()).filter(p => p.circle).length)
            .toBeGreaterThan(0);
    });

    it('cuts the line where the echelon sits', () => {
        const paints = paint(feature(TacticalGraphicName.MobilityCorridor), context());
        const runs = lines(paints).filter(path =>
            path.length === 2 && path[0][1] === 0 && path[1][1] === 0
            && path.every(([x]) => x >= 0 && x <= 40_000));
        // Two runs, not one: the gap is between them and the glyph is in the gap.
        expect(runs).toHaveLength(2);
        expect(runs[0][1][0]).toBeLessThan(20_000);
        expect(runs[1][0][0]).toBeGreaterThan(20_000);
    });

    // The Template stands field B in the break at the middle and sets field H above the
    // line *beside* it, and the row's note asks only that H "be movable to avoid obscuring
    // key geographic information".
    it('puts the free-text amplifier above the line and clear of the echelon', () => {
        const paints = paint(feature(TacticalGraphicName.MobilityCorridor, {designation: 'SMALL DITCHES'}), context());
        expect(texts(paints)).toEqual(['SMALL DITCHES']);
        const at = (paints.find(p => p.text)!.geometry as {coordinates: ProjectedPosition}).coordinates;

        // Above the line, and well away from the midpoint the glyph occupies — it used to
        // sit exactly on top of it.
        expect(at[1]).toBeGreaterThan(0);
        expect(Math.abs(at[0] - 20_000)).toBeGreaterThan(5_000);
    });

    it('takes the side that holds the text, and the leading one when both do', () => {
        // The echelon cuts the *middle segment*, so an uneven path leaves uneven runs: the
        // gap here lands 3 km along an 8 km line, and the run behind it is half the one
        // ahead of it.
        const uneven: ProjectedPosition[] = [[0, 0], [6_000, 0], [8_000, 0]];
        const paints = paint({
            geometry: {type: 'LineString', coordinates: uneven},
            properties: {name: TacticalGraphicName.MobilityCorridor, designation: 'A CORRIDOR NAME THAT IS LONG'},
        }, context());
        const at = (paints.find(p => p.text)!.geometry as {coordinates: ProjectedPosition}).coordinates;
        // Past the echelon, on the longer side — the leading run cannot hold that text.
        expect(at[0]).toBeGreaterThan(3_000);

        // With room on both sides it goes on the leading run, which is where the plate
        // draws it.
        const even = paint(feature(TacticalGraphicName.MobilityCorridor, {designation: 'MC1'}), context());
        const evenAt = (even.find(p => p.text)!.geometry as {coordinates: ProjectedPosition}).coordinates;
        expect(evenAt[0]).toBeLessThan(20_000);
    });
});
