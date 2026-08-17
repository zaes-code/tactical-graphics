/**
 * # The CBRN contamination mark
 *
 * The mark is an **X**: two long strokes crossing under the letter, each running from a
 * filled blob at one upper corner through the crossing to the *opposite* lower foot.
 *
 * It took four readings of the plate to get there, and every wrong one rendered plausibly:
 *
 * 1. A stem rising from one foot and forking into two — a `Y`, i.e. upside down.
 * 2. Two discs floating above a separate arch: the right parts, unconnected.
 * 3. Two teardrops above an arch — what looks like a comma's tail at 150 dpi is the stroke
 *    *continuing through* the blob toward the far foot.
 * 4. The right structure at the wrong proportions.
 *
 * The lesson is the resolution. The contact sheets crop at 150 dpi, which distinguishes a
 * triangle from a square and cannot distinguish a disc from a comma from the end of a
 * stroke. The geometry in `cbrnPaints.ts` is measured off a 600 dpi render by thresholding
 * and isolating the mark as a connected component — a pixel profile, not a squint.
 *
 * Two other things about this symbol were also wrong and are pinned below: the triangle was
 * an **outline**, so the yellow hatch ran through it, and the area's designation was
 * anchored on the same point as the triangle, so the two were drawn over each other.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {getLabelHaloColor} from '../core/symbology';
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

const RING: ProjectedPosition[] = [
    [-500_000, -400_000], [500_000, -400_000], [500_000, 400_000], [-500_000, 400_000], [-500_000, -400_000],
];

const labelFeature = (label?: string): PaintFeature => ({
    geometry: {type: 'Point', coordinates: [0, 0]},
    properties: {name: TacticalGraphicName.BiologicalContaminatedArea, label},
    ring: RING,
    bounds: {minX: -500_000, minY: -400_000, maxX: 500_000, maxY: 400_000},
});

const marks = (label?: string): Paint[] =>
    cbrnMarkPaint('B', areaDefaultLabelPaint(TacticalGraphicName.BiologicalContaminatedArea))(
        labelFeature(label), context());

/** The two crossing strokes. */
const strokes = (painted: Paint[]) =>
    painted.filter(p => p.geometry.type === 'LineString' && p.stroke)
        .map(p => (p.geometry as {coordinates: ProjectedPosition[]}).coordinates);

/** The two filled blobs — polygons with a fill and no stroke, unlike the triangle. */
const blobs = (painted: Paint[]) =>
    painted.filter(p => p.geometry.type === 'Polygon' && p.fill && !p.stroke)
        .map(p => (p.geometry as {coordinates: ProjectedPosition[][]}).coordinates[0]);

const ys = (paint: Paint): number[] => {
    const g = paint.geometry as {type: string; coordinates: unknown};
    if (g.type === 'Point') return [(g.coordinates as ProjectedPosition)[1]];
    const flat = JSON.parse(JSON.stringify(g.coordinates)).flat(3) as number[];
    return flat.filter((_v, i) => i % 2 === 1);
};

beforeEach(() => resetTacticalGraphicsConfig());

describe('APP-06 Table 8-19 — the contamination mark', () => {
    it('fills the triangle so the hatch stops at its edge', () => {
        const triangle = marks().find(p => p.geometry.type === 'Polygon' && p.fill && p.stroke);
        expect(triangle).toBeDefined();
        // The halo colour, not a literal white: it is the one that means "the ground behind
        // a symbol" here, and a host on a dark basemap overrides it.
        expect(triangle!.fill?.color).toBe(getLabelHaloColor());
    });

    it('draws two strokes that cross, not two that meet', () => {
        const [a, b] = strokes(marks());
        expect(a).toBeDefined();
        expect(b).toBeDefined();

        // Each runs from an upper blob to the *opposite* lower foot, so the sign of x flips
        // between its ends. Two strokes meeting at a point — the `Y` and the arch this went
        // through — never do that, which is what makes this the load-bearing assertion.
        for (const path of [a, b]) {
            expect(Math.sign(path[0][0])).toBe(-Math.sign(path[path.length - 1][0]));
            expect(path[0][1]).toBeGreaterThan(path[path.length - 1][1]);
        }
        expect(a[0][0]).toBeCloseTo(-b[0][0], 6);
    });

    it('caps the upper end of each stroke with a blob', () => {
        const painted = marks();
        const rings = blobs(painted);
        expect(rings).toHaveLength(2);
        expect(painted.some(p => p.circle)).toBe(false);

        for (const path of strokes(painted)) {
            const [x, y] = path[0];
            const covered = rings.some(ring => {
                const rx = ring.map(p => p[0]);
                const ry = ring.map(p => p[1]);
                return x >= Math.min(...rx) && x <= Math.max(...rx)
                    && y >= Math.min(...ry) && y <= Math.max(...ry);
            });
            expect(covered).toBe(true);
        }
    });

    it('makes the blobs taller than they are wide, as the plate draws them', () => {
        for (const ring of blobs(marks())) {
            const w = Math.max(...ring.map(p => p[0])) - Math.min(...ring.map(p => p[0]));
            const h = Math.max(...ring.map(p => p[1])) - Math.min(...ring.map(p => p[1]));
            expect(h).toBeGreaterThan(w);
        }
    });

    it('lifts the designation clear of the triangle instead of through it', () => {
        const painted = marks('ALPHA');
        // The hazard letter is **not** part of this: `B` belongs inside the triangle, and a
        // filter of "every text mark" sweeps it up and fails on the one mark that is right.
        const designation = painted.filter(p => p.text?.text === 'ALPHA');
        expect(designation).toHaveLength(1);

        const triangle = painted.find(p => p.geometry.type === 'Polygon' && p.fill && p.stroke)!;
        expect(ys(designation[0])[0]).toBeGreaterThan(Math.max(...ys(triangle)));
    });

    it('hatches the area in the hazard yellow, whatever the identity says', () => {
        const [area] = cbrnContaminatedAreaPaint()({
            geometry: {type: 'Polygon', coordinates: [RING]},
            properties: {name: TacticalGraphicName.BiologicalContaminatedArea},
        }, context());
        expect(area.fill?.pattern?.color).toBe('#FFEB00');
    });
});
