/**
 * The paints that cut a gap or size a glyph against "its segment", drawn smooth.
 *
 * Each of these measured against one segment, which on a smoothed line is a short chord of the
 * curve: the echelon glyph capped against it shrank to a dot, and a gap judged against it was
 * skipped, taking its label with it. These pin the smoothed drawing to the hard one, and the
 * helpers to the one-segment answers they replaced wherever a hard line is concerned.
 */
import type {Geometry} from 'geojson';
import {buildPaintedGraphic, configureTacticalGraphics, paintGraphic, resetTacticalGraphicsConfig} from '../index';
import {TacticalGraphicEchelon, TacticalGraphicHostility, TacticalGraphicName as N} from '../core/type';
import {chaikinRing} from '../core/smoothing';
import {cutGapAlongPath, gapFits, pathLength, straightStretch} from './decorations';

afterEach(() => resetTacticalGraphicsConfig());

/**
 * Meters per pixel. Coarse enough for the glyphs that a smoothed chord, about an eighth of a
 * drawn segment, is a few pixels long, which is where capping a glyph against it showed.
 */
const resolution = 1000;
const context = (res: number) => ({resolution: res, measureText: (text: string) => text.length * 9}) as never;

function paints(name: N, geometry: Geometry, properties: Record<string, unknown>, res = resolution) {
    const graphic = buildPaintedGraphic(name, geometry, properties, res)!;
    return paintGraphic(graphic as never, context(res)) as {geometry: Geometry; text?: {text: string}; stroke?: unknown}[];
}

function hardAndSmooth(name: N, geometry: Geometry, properties: Record<string, unknown>, res = resolution) {
    const hard = paints(name, geometry, properties, res);
    configureTacticalGraphics({smoothLines: true});
    const smooth = paints(name, geometry, properties, res);
    resetTacticalGraphicsConfig();
    return {hard, smooth};
}

/** How many places `text` is drawn: a mark may carry several on one MultiPoint. */
const texts = (marks: {geometry: Geometry; text?: {text: string}}[], text: string) =>
    marks.filter(m => m.text?.text === text).reduce((n, m) => n + (m.geometry.type === 'MultiPoint' ? m.geometry.coordinates.length : 1), 0);

// About 100 km a side at the equator, so every gap here is a small share of an edge.
const line: Geometry = {type: 'LineString', coordinates: [[0, 0], [1, 0.6], [2, -0.2], [3, 0.5]]};
const ring: Geometry = {type: 'Polygon', coordinates: [[[0, 0], [1.2, 0.9], [2.6, 0.7], [3, -0.6], [1.6, -1.3], [0.2, -1], [0, 0]]]};

describe('the helpers agree with the one-segment answers on a hard line', () => {
    const path: [number, number][] = [[0, 0], [100, 0], [100, 100]];

    it('cuts a gap that fits its segment exactly where the segment cut put it', () => {
        const {gapA, gapB, center, outline} = cutGapAlongPath(path, 0, 0.5, 10);
        expect([gapA, gapB, center]).toEqual([[40, 0], [60, 0], [50, 0]]);
        expect(outline).toEqual([[[0, 0], [40, 0]], [[60, 0], [100, 0], [100, 100]]].slice(0, 1).concat([[[60, 0], [100, 0]], [[100, 0], [100, 100]]]));
    });

    it('measures a hard edge as the segment itself', () => {
        expect(straightStretch(path, 0, 0.25)).toEqual({before: 25, after: 75});
        expect(gapFits(path, 0, 0.5, 49)).toBe(true);
        expect(gapFits(path, 0, 0.5, 51)).toBe(false);
    });

    it('measures a smoothed edge as the stretch of curve around the chord', () => {
        const square: [number, number][] = [[0, 0], [0, 100], [100, 100], [100, 0], [0, 0]];
        const smooth = chaikinRing(square) as [number, number][];
        const chord = Math.hypot(smooth[1][0] - smooth[0][0], smooth[1][1] - smooth[0][1]);
        const {before, after} = straightStretch(smooth, 0, 0.5, true, 45);
        expect(before + after).toBeGreaterThan(chord * 4);
        expect(before + after).toBeLessThan(pathLength(smooth) / 2);
    });
});

describe('smoothed, the marks a hard line carries are still there', () => {
    it("keeps the boundary's echelon gap the width of its glyph", () => {
        const {hard, smooth} = hardAndSmooth(N.Boundary, line, {echelon: TacticalGraphicEchelon.brigade, designation: 'A'});
        const gap = (marks: {geometry: Geometry; stroke?: unknown}[]) => {
            const outline = marks.find(m => m.geometry.type === 'MultiLineString' && m.stroke)!.geometry as unknown as {coordinates: [number, number][][]};
            const projected = buildPaintedGraphic(N.Boundary, line, {}, resolution)!.graphic.geometry as unknown as {coordinates: [number, number][]};
            return pathLength(projected.coordinates) - outline.coordinates.reduce((sum, run) => sum + pathLength(run), 0);
        };
        // The smoothed line is shorter, so compare the hole, not the ink.
        const hardGap = gap(hard);
        expect(hardGap).toBeGreaterThan(0);
        configureTacticalGraphics({smoothLines: true});
        const smoothPath = buildPaintedGraphic(N.Boundary, line, {}, resolution)!.graphic.geometry as unknown as {coordinates: [number, number][]};
        const outline = smooth.find(m => m.geometry.type === 'MultiLineString' && m.stroke)!.geometry as unknown as {coordinates: [number, number][][]};
        const smoothGap = pathLength(smoothPath.coordinates) - outline.coordinates.reduce((sum, run) => sum + pathLength(run), 0);
        expect(smoothGap / hardGap).toBeGreaterThan(0.8);
        expect(smoothGap / hardGap).toBeLessThan(1.25);
    });

    it('keeps both of the UXO area’s labels', () => {
        const {hard, smooth} = hardAndSmooth(N.UnexplodedExplosiveOrdnanceArea, ring, {}, 200);
        expect(texts(hard, 'UXO')).toBe(2);
        expect(texts(smooth, 'UXO')).toBe(2);
    });

    it("keeps a hostile encirclement's ENY gaps", () => {
        const hostile = {hostility: TacticalGraphicHostility.hostileFaker, decorationSize: 4000};
        const {hard, smooth} = hardAndSmooth(N.Encirclement, ring, hostile, 200);
        expect(texts(hard, 'ENY')).toBe(2);
        expect(texts(smooth, 'ENY')).toBe(2);
    });

    it("keeps the battle position's echelon glyph", () => {
        const {hard, smooth} = hardAndSmooth(N.BattlePosition, ring, {echelon: TacticalGraphicEchelon.brigade});
        // The glyph's strokes, the only single lines the paint carries: as many, and as long.
        const strokes = (marks: {geometry: Geometry; stroke?: unknown}[]) =>
            marks.filter(m => m.stroke && m.geometry.type === 'LineString').map(m => pathLength((m.geometry as unknown as {coordinates: [number, number][]}).coordinates));
        const [h, sm] = [strokes(hard), strokes(smooth)];
        expect(sm.length).toBe(h.length);
        expect(h.length).toBeGreaterThan(0);
        const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
        expect(total(sm) / total(h)).toBeGreaterThan(0.8);
    });
});
