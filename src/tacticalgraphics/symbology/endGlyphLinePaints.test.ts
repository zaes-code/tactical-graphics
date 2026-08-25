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

beforeEach(() => resetTacticalGraphicsConfig());

describe('APP-06 110500 — decision line', () => {
    const paint = decisionLinePaint();
    const props = {label: '1X', secondId: '007'};
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
        expect(texts(paint(feature(TacticalGraphicName.DecisionLine, {label: '1X'}), context()))[0]).toBe('1X');
        expect(texts(paint(feature(TacticalGraphicName.DecisionLine, {secondId: '007'}), context()))[0]).toBe('007');
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
        const short = paint(feature(TacticalGraphicName.DecisionLine, {label: 'A'}), context());
        const long = paint(feature(TacticalGraphicName.DecisionLine, {label: 'A VERY LONG NAME'}), context());
        expect(halfWidth(starOf(long), EAST[0])).toBeGreaterThan(halfWidth(starOf(short), EAST[0]));
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

    it('puts the free-text amplifier above the middle', () => {
        const paints = paint(feature(TacticalGraphicName.MobilityCorridor, {label: 'SMALL DITCHES'}), context());
        expect(texts(paints)).toEqual(['SMALL DITCHES']);
        const at = (paints.find(p => p.text)!.geometry as {coordinates: ProjectedPosition}).coordinates;
        expect(at[0]).toBeCloseTo(20_000, 0);
        expect(at[1]).toBeGreaterThan(0);
    });
});
