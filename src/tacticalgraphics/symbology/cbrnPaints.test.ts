/**
 * # The CBRN contamination mark
 *
 * Three things about it were wrong until 2026-08-17, and all three are the kind that render
 * plausibly:
 *
 * - The triangle was an **outline**, so the yellow hatch ran straight through it. The plate
 *   shows the hatch stopping at its edge, which only happens if the shape is opaque.
 * - The mark inside it was drawn **upside down** — a stem rising from one foot and forking
 *   into two, which reads as a `Y`. The plate has one apex and *two* feet.
 * - The area's designation was anchored on the same point as the triangle, so the two were
 *   drawn through each other.
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

/** Every y-coordinate of a paint's geometry, however nested. */
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

    it('draws the mark with two feet, not one', () => {
        // The `Y` test. The arch is a single open path whose ends are its two feet, and
        // both sit below its apex; a `Y` has one end below and two above.
        const arch = marks().find(p =>
            p.geometry.type === 'LineString'
            && (p.geometry.coordinates as ProjectedPosition[]).length > 8);
        expect(arch).toBeDefined();

        const path = (arch!.geometry as {coordinates: ProjectedPosition[]}).coordinates;
        const apex = Math.max(...path.map(p => p[1]));
        const first = path[0][1];
        const last = path[path.length - 1][1];

        expect(first).toBeLessThan(apex);
        expect(last).toBeLessThan(apex);
        // Symmetric about the axis: the two feet are the same height and opposite sides.
        expect(first).toBeCloseTo(last, 6);
        expect(Math.sign(path[0][0])).toBe(-Math.sign(path[path.length - 1][0]));
    });

    it('keeps the two lobes above the arch, as the plate has them', () => {
        const lobes = marks().filter(p => p.circle);
        expect(lobes).toHaveLength(2);
        const arch = marks().find(p =>
            p.geometry.type === 'LineString'
            && (p.geometry.coordinates as ProjectedPosition[]).length > 8)!;
        const archApex = Math.max(...ys(arch));
        for (const lobe of lobes) expect(ys(lobe)[0]).toBeGreaterThan(archApex);
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
