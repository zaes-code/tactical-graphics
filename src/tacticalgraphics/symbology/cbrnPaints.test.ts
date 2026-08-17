/**
 * # The CBRN contamination mark
 *
 * The mark is two crossed **arcs**, each rooted in a filled disc: the arm leaves a disc at an
 * upper corner, sweeps in and down through the crossing, and curves away to a blunt end low
 * on the opposite side — inboard of the discs, not splayed past them.
 *
 * It took six readings to get there, and every wrong one rendered plausibly:
 *
 * 1. A stem rising from one foot and forking into two — a `Y`, i.e. upside down.
 * 2. Two discs floating above a separate arch: the right parts, unconnected.
 * 3. Two teardrops above an arch — what looks like a comma's tail at 150 dpi is the stem
 *    *continuing through* the bowl toward the far corner.
 * 4. The right structure with the discs at a third of their size.
 * 5. Solid arms tapering to a point, which reads as two needles rather than two spoons.
 * 6. Straight stems splayed past the discs, which loses the curve entirely.
 *
 * The lesson is that a raster cannot settle this: every wrong reading above came from
 * measuring one. The conformance sheets crop at 150 dpi, which distinguishes a triangle from
 * a square and cannot distinguish a disc from a comma from the end of a tapering arm, and
 * even a clean thresholding of the plate leaves the curve a judgement call. `cbrnPaints.ts`
 * transcribes a **vector** reference instead, and records what it is.
 *
 * What is pinned below is what separates the right figure from the six wrong ones: each arm
 * **crosses the axis**, the pair **closes downward**, each disc **swallows its own arm's
 * start**, and each disc is **round**. A `Y`, an arch, a wishbone, a pair of needles and a
 * circle with a stick out of it each fail at least one.
 *
 * Three other things about this symbol were also wrong and are pinned here too: the triangle
 * was an **outline**, so the yellow hatch ran through it; the designation was anchored on the
 * same point as the triangle, so the two were drawn over each other; and the lift that fixed
 * that was unbounded, so on a squat area it put the designation outside the shape and
 * `fitLabelScale` correctly shrank it to nothing.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {LINE_WIDTH, getLabelHaloColor} from '../core/symbology';
import {resetTacticalGraphicsConfig} from '../core/config';
import {cbrnContaminatedAreaPaint, cbrnMarkPaint} from './cbrnPaints';
import {areaDefaultLabelPaint} from './areaLabelPaints';

const context = (resolution = 400): PaintContext => ({
    resolution,
    measureText: (text, font) => {
        const px = parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16');
        return text.length * px * 0.6;
    },
});

const ring = (halfWidth: number, halfHeight: number): ProjectedPosition[] => [
    [-halfWidth, -halfHeight], [halfWidth, -halfHeight],
    [halfWidth, halfHeight], [-halfWidth, halfHeight], [-halfWidth, -halfHeight],
];

const RING = ring(500_000, 400_000);

const labelFeature = (label?: string, outline = RING): PaintFeature => {
    const xs = outline.map(p => p[0]);
    const ys = outline.map(p => p[1]);
    return {
        geometry: {type: 'Point', coordinates: [0, 0]},
        properties: {name: TacticalGraphicName.BiologicalContaminatedArea, label},
        ring: outline,
        bounds: {minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys)},
    };
};

const marks = (label?: string, outline = RING, resolution = 400): Paint[] =>
    cbrnMarkPaint('B', areaDefaultLabelPaint(TacticalGraphicName.BiologicalContaminatedArea))(
        labelFeature(label, outline), context(resolution));

/** The two crossing arms. */
const arms = (painted: Paint[]) =>
    painted.filter(p => p.geometry.type === 'LineString' && p.stroke)
        .map(p => (p.geometry as {coordinates: ProjectedPosition[]}).coordinates);

/** The two blobs — polygons with a fill and no stroke, unlike the triangle. */
const blobs = (painted: Paint[]) =>
    painted.filter(p => p.geometry.type === 'Polygon' && p.fill && !p.stroke)
        .map(p => (p.geometry as {coordinates: ProjectedPosition[][]}).coordinates[0]);

const triangleOf = (painted: Paint[]) =>
    painted.find(p => p.geometry.type === 'Polygon' && p.fill && p.stroke)!;

const ys = (paint: Paint): number[] => {
    const g = paint.geometry as {type: string; coordinates: unknown};
    if (g.type === 'Point') return [(g.coordinates as ProjectedPosition)[1]];
    const flat = JSON.parse(JSON.stringify(g.coordinates)).flat(3) as number[];
    return flat.filter((_v, i) => i % 2 === 1);
};

beforeEach(() => resetTacticalGraphicsConfig());

describe('APP-06 Table 8-19 — the contamination mark', () => {
    it('fills the triangle so the hatch stops at its edge', () => {
        const triangle = triangleOf(marks());
        expect(triangle).toBeDefined();
        // The halo colour, not a literal white: it is the one that means "the ground behind
        // a symbol" here, and a host on a dark basemap overrides it.
        expect(triangle.fill?.color).toBe(getLabelHaloColor());
    });

    it('draws two arms that cross the axis, not two that meet on it', () => {
        const [a, b] = arms(marks());
        expect(a).toBeDefined();
        expect(b).toBeDefined();

        // Each runs from an upper blob to the *opposite* lower end, so the sign of x flips
        // between its ends. Two strokes meeting at a point — the `Y` and the arch this went
        // through — never do that, which is what makes this the load-bearing assertion.
        for (const path of [a, b]) {
            expect(Math.sign(path[0][0])).toBe(-Math.sign(path[path.length - 1][0]));
            expect(path[0][1]).toBeGreaterThan(path[path.length - 1][1]);
        }
        // Mirror images of each other, so the pair is symmetric about the axis.
        expect(a[0][0]).toBeCloseTo(-b[0][0], 6);
        expect(a[0][1]).toBeCloseTo(b[0][1], 6);
    });

    it('stops the arms inboard of the discs, not splayed past them', () => {
        // The `X` closes rather than opens: each arm ends nearer the axis than the disc it
        // came from. Straight stems splayed to the outer corners — one of the readings this
        // went through — invert exactly this.
        const painted = marks();
        const discCentres = blobs(painted).map(disc =>
            (Math.max(...disc.map(p => p[0])) + Math.min(...disc.map(p => p[0]))) / 2);

        for (const path of arms(painted)) {
            const end = Math.abs(path[path.length - 1][0]);
            expect(end).toBeLessThan(Math.max(...discCentres.map(Math.abs)));
        }
    });

    it('swallows each arm start inside its disc, so the join reads as one shape', () => {
        const painted = marks();
        const discs = blobs(painted);
        expect(discs).toHaveLength(2);
        expect(painted.some(p => p.circle)).toBe(false);

        // The arm begins at the disc's centre line rather than on its rim. Drawn the other
        // way the two are a stroke and a dot that happen to touch, and any rounding error
        // between them shows as a notch.
        for (const path of arms(painted)) {
            const [x, y] = path[0];
            const covered = discs.some(disc => {
                const dx = disc.map(p => p[0]);
                const dy = disc.map(p => p[1]);
                return x >= Math.min(...dx) && x <= Math.max(...dx) && y > Math.min(...dy) && y < Math.max(...dy);
            });
            expect(covered).toBe(true);
        }
    });

    it('makes each disc round, not an oval or a teardrop', () => {
        // Two wrong readings turned on this: lobes drawn as ovals, and as commas with a tail
        // pointing at the crossing. The reference draws a plain circle, and the difference is
        // invisible at the size these render.
        for (const disc of blobs(marks())) {
            const w = Math.max(...disc.map(p => p[0])) - Math.min(...disc.map(p => p[0]));
            const h = Math.max(...disc.map(p => p[1])) - Math.min(...disc.map(p => p[1]));
            expect(h / w).toBeCloseTo(1, 2);
        }
    });

    it('scales the arms with the symbol rather than holding a constant screen weight', () => {
        // The mark is fitted to whatever area it landed in, so `LINE_WIDTH()` — right for
        // line work, which has no size of its own — would read as spindly on a large area
        // and as a blot on a small one.
        const wide = marks(undefined, ring(500_000, 400_000));
        const small = marks(undefined, ring(50_000, 40_000));
        const widthOf = (painted: Paint[]) =>
            painted.find(p => p.geometry.type === 'LineString' && p.stroke)!.stroke!.widthPx;

        expect(widthOf(wide)).toBeGreaterThan(widthOf(small) * 5);
        expect(widthOf(wide)).toBeGreaterThan(LINE_WIDTH());
    });

    it('lifts the designation clear of the triangle instead of through it', () => {
        const painted = marks('ALPHA');
        // The hazard letter is **not** part of this: `B` belongs inside the triangle, and a
        // filter of "every text mark" sweeps it up and fails on the one mark that is right.
        const designation = painted.filter(p => p.text?.text === 'ALPHA');
        expect(designation).toHaveLength(1);

        expect(ys(designation[0])[0]).toBeGreaterThan(Math.max(...ys(triangleOf(painted))));
    });

    it('keeps the designation inside a squat area rather than lifting it out of one', () => {
        // The lift is a glyph height plus a screen-pixel clearance, and a screen constant is
        // metres at the current resolution — 30 px is 60 km at this one. Unclamped it put the
        // anchor above the shape, `fitLabelScale` found no scale that fit, and the label
        // disappeared: worse than the overlap the lift exists to fix.
        const outline = ring(300_000, 90_000);
        const [designation] = marks('ALPHA', outline, 2_000).filter(p => p.text?.text === 'ALPHA');
        expect(designation).toBeDefined();
        expect(designation.text!.scale).toBeGreaterThan(0);
        expect(ys(designation)[0]).toBeLessThan(90_000);
    });

    it('hatches the area in the hazard yellow, whatever the identity says', () => {
        const [area] = cbrnContaminatedAreaPaint()({
            geometry: {type: 'Polygon', coordinates: [RING]},
            properties: {name: TacticalGraphicName.BiologicalContaminatedArea},
        }, context());
        expect(area.fill?.pattern?.color).toBe('#FFEB00');
    });
});
