/**
 * Labels that follow the view: a label whose place on the symbol is off screen moves onto
 * the visible part of its line, and nothing changes when the context carries no view.
 * @see PaintContext.view
 */

import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {buildPaintedGraphic, paintGraphic} from '../core/paintedGraphic';
import type {Paint, PaintContext, PaintFeature, ProjectedBounds, ProjectedPosition} from '../core/paint';
import {phaseLinePaint} from './paintFunctions';
import {axisOfAdvanceLabelPaint} from './movementPaints';
import {boundaryPaint} from './boundaryPaints';
import {coordinatedFireLinePaint} from './midLabelLinePaints';
import {finalProtectiveFirePaint, linearTargetPaint} from './linearTargetPaints';
import {areaLabelInView, clipRing, inRing, inView, pathUpTo, visibleStretch} from './viewFollow';

const RESOLUTION = 100;

const context = (view?: ProjectedBounds): PaintContext => ({
    resolution: RESOLUTION,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
    ...(view ? {view} : {}),
});

const labels = (paints: Paint[]): ProjectedPosition[] =>
    paints.filter(p => p.text && p.geometry.type === 'Point').map(p => (p.geometry as {coordinates: ProjectedPosition}).coordinates);

const VIEW: ProjectedBounds = {minX: 0, minY: -50_000, maxX: 100_000, maxY: 50_000};

beforeEach(() => resetTacticalGraphicsConfig());

describe('visibleStretch', () => {
    it('cuts a line at the edges of the view', () => {
        expect(
            visibleStretch(
                [
                    [-50_000, 0],
                    [150_000, 0],
                ],
                VIEW,
            ),
        ).toEqual([
            [0, 0],
            [100_000, 0],
        ]);
    });

    it('keeps the vertices inside the view and cuts only where the line crosses out', () => {
        const stretch = visibleStretch(
            [
                [-50_000, 0],
                [50_000, 10_000],
                [150_000, 0],
            ],
            VIEW,
        )!;
        expect(stretch).toHaveLength(3);
        expect(stretch[1]).toEqual([50_000, 10_000]);
        expect(stretch[0][0]).toBeCloseTo(0);
        expect(stretch[2][0]).toBeCloseTo(100_000);
    });

    it('takes the longest run when the line leaves and comes back', () => {
        const zigzag: ProjectedPosition[] = [
            [10_000, 0],
            [20_000, 0],
            [20_000, 90_000],
            [30_000, 90_000],
            [30_000, 0],
            [90_000, 0],
        ];
        expect(visibleStretch(zigzag, VIEW)![0][0]).toBe(30_000);
    });

    it('is undefined for a line that never enters the view', () => {
        expect(
            visibleStretch(
                [
                    [200_000, 0],
                    [300_000, 0],
                ],
                VIEW,
            ),
        ).toBeUndefined();
    });
});

describe('pathUpTo', () => {
    it('ends the path at a point on it', () => {
        expect(
            pathUpTo(
                [
                    [0, 0],
                    [10, 0],
                    [20, 0],
                ],
                [15, 0],
            ),
        ).toEqual([
            [0, 0],
            [10, 0],
            [15, 0],
        ]);
    });
});

describe('a phase line', () => {
    const paint = phaseLinePaint(TacticalGraphicName.PhaseLine);
    const feature = (coords: ProjectedPosition[]): PaintFeature => ({
        geometry: {type: 'LineString', coordinates: coords},
        properties: {name: TacticalGraphicName.PhaseLine, designation: 'RUTH'},
    });

    it('paints exactly as before when the context carries no view', () => {
        const line = feature([
            [-50_000, 0],
            [150_000, 0],
        ]);
        expect(paint(line, context())).toEqual(paint(line, {...context(), view: undefined}));
        expect(labels(paint(line, context()))[0]).toEqual([-50_000, 0]);
    });

    it('paints exactly as before when both ends are in view', () => {
        const line = feature([
            [20_000, 0],
            [80_000, 0],
        ]);
        expect(paint(line, context(VIEW))).toEqual(paint(line, context()));
    });

    it('brings both labels onto the view when both ends are off it', () => {
        const at = labels(
            paint(
                feature([
                    [-50_000, 0],
                    [150_000, 0],
                ]),
                context(VIEW),
            ),
        );
        expect(at).toHaveLength(2);
        for (const p of at) expect(inView(p, VIEW)).toBe(true);
        // In the line, never over or under it, one just inside each edge.
        for (const p of at) expect(p[1]).toBe(0);
        expect(Math.min(...at.map(p => p[0]))).toBeLessThan(25_000);
        expect(Math.max(...at.map(p => p[0]))).toBeGreaterThan(75_000);
    });

    it('cuts the line around a label moved into it, and leaves the rest whole', () => {
        const paints = paint(
            feature([
                [-50_000, 0],
                [150_000, 0],
            ]),
            context(VIEW),
        );
        const line = paints.find(p => p.stroke)!;
        expect(line.geometry.type).toBe('MultiLineString');
        const runs = (line.geometry as {coordinates: ProjectedPosition[][]}).coordinates;
        expect(runs).toHaveLength(3);
        // Each label lies inside a gap: no run passes under its anchor.
        for (const at of labels(paints)) {
            for (const run of runs) expect(at[0] > run[0][0] && at[0] < run[run.length - 1][0]).toBe(false);
        }
        // A stub of line still runs from each edge into its gap, so the line reads as going on.
        expect(runs[0][0][0]).toBe(-50_000);
        expect(runs[2][runs[2].length - 1][0]).toBe(150_000);
    });

    it('moves the label of an end that is on screen when the label itself would run off it', () => {
        // The start sits just inside the view, but "PL RUTH" runs west past the edge.
        const line: ProjectedPosition[] = [
            [2_500, 0],
            [80_000, 0],
        ];
        const paints = paint(feature(line), context(VIEW));
        const [first, last] = paints.filter(p => p.text);
        // Turned into the line from its end, rather than out past it.
        const at = (first.geometry as {coordinates: ProjectedPosition}).coordinates;
        expect(at[1]).toBe(0);
        expect(at[0]).toBeGreaterThan(2_500);
        expect(first.text!.align).toBe('center');
        expect((last.geometry as {coordinates: ProjectedPosition}).coordinates).toEqual([80_000, 0]);
    });

    it('moves only the label whose end is off screen', () => {
        const at = labels(
            paint(
                feature([
                    [20_000, 0],
                    [150_000, 0],
                ]),
                context(VIEW),
            ),
        );
        expect(at[0]).toEqual([20_000, 0]);
        expect(inView(at[1], VIEW)).toBe(true);
    });

    it('keeps one label when the visible stretch is too short for two', () => {
        const at = labels(
            paint(
                feature([
                    [-50_000, 0],
                    [150_000, 0],
                ]),
                context({minX: 0, minY: -5_000, maxX: 9_000, maxY: 5_000}),
            ),
        );
        expect(at).toHaveLength(1);
    });

    it('leaves the labels at the ends of a line with nothing inside the view', () => {
        const line = feature([
            [200_000, 0],
            [300_000, 0],
        ]);
        expect(paint(line, context(VIEW))).toEqual(paint(line, context()));
    });

    it('keeps the labels of a line hugging the edge of the view', () => {
        const line = feature([
            [-50_000, 49_500],
            [150_000, 49_500],
        ]);
        expect(paint(line, context(VIEW))).toEqual(paint(line, context()));
    });
});

describe('an axis of advance', () => {
    const paint = axisOfAdvanceLabelPaint(TacticalGraphicName.MainAxisOfAdvance);
    // Head span [c0, c1] at the east end, then the centerline rear to head.
    const feature = (): PaintFeature => ({
        geometry: {
            type: 'MultiPoint',
            coordinates: [
                [180_000, 0],
                [200_000, 0],
                [-50_000, 0],
                [200_000, 0],
            ],
        },
        properties: {name: TacticalGraphicName.MainAxisOfAdvance, designation: 'IRON'},
    });

    it('sets the designation behind the arrowhead when the head is in view', () => {
        const wide = {minX: -100_000, minY: -50_000, maxX: 300_000, maxY: 50_000};
        expect(paint(feature(), context(wide))).toEqual(paint(feature(), context()));
    });

    it('moves the designation back along the arrow when the head is off screen', () => {
        const at = labels(paint(feature(), context(VIEW)));
        expect(at.length).toBeGreaterThan(0);
        for (const p of at) expect(inView(p, VIEW)).toBe(true);
    });

    it('keeps the size it had behind the arrowhead', () => {
        const scaleOf = (paints: Paint[]) => paints.find(p => p.text)?.text?.scale;
        const wide = {minX: -100_000, minY: -50_000, maxX: 300_000, maxY: 50_000};
        expect(scaleOf(paint(feature(), context(VIEW)))).toBe(scaleOf(paint(feature(), context(wide))));
    });
});

describe('an area label', () => {
    // A square 200 km across, centred on (50 km, 0): its label anchor sits at the middle.
    const ring: ProjectedPosition[] = [
        [-50_000, -100_000],
        [150_000, -100_000],
        [150_000, 100_000],
        [-50_000, 100_000],
        [-50_000, -100_000],
    ];
    const label = (at: ProjectedPosition): PaintFeature => ({
        geometry: {type: 'Point', coordinates: at},
        properties: {name: TacticalGraphicName.ObjectiveArea, designation: 'IRON'},
        ring,
    });
    const anchor = (f: PaintFeature) => (f.geometry as {coordinates: ProjectedPosition}).coordinates;

    it('stays where it is when the context carries no view', () => {
        const f = label([50_000, 0]);
        expect(areaLabelInView(f, context())).toBe(f);
    });

    it('stays where it is when its anchor is on screen', () => {
        const f = label([50_000, 0]);
        expect(areaLabelInView(f, context(VIEW))).toBe(f);
    });

    it('moves into the visible part of the area when its anchor is off screen', () => {
        const view = {minX: 100_000, minY: 50_000, maxX: 300_000, maxY: 250_000};
        const at = anchor(areaLabelInView(label([50_000, 0]), context(view)));
        expect(inView(at, view)).toBe(true);
        expect(inRing(at, ring)).toBe(true);
    });

    it('sits in the middle of the view when the area fills it', () => {
        const view = {minX: 0, minY: 10_000, maxX: 20_000, maxY: 30_000};
        const at = anchor(areaLabelInView(label([50_000, 0]), context(view)));
        expect(at[0]).toBeCloseTo(10_000);
        expect(at[1]).toBeCloseTo(20_000);
    });

    it('stays put when none of the area is on screen', () => {
        const f = label([50_000, 0]);
        expect(areaLabelInView(f, context({minX: 400_000, minY: 0, maxX: 500_000, maxY: 100_000}))).toBe(f);
    });

    it('leaves a label hung outside its outline where it was placed', () => {
        const f = label([50_000, 120_000]);
        expect(areaLabelInView(f, context({minX: 100_000, minY: 50_000, maxX: 300_000, maxY: 250_000}))).toBe(f);
    });

    it('keeps the label inside a concave area', () => {
        // A U open to the north: its centroid falls in the empty middle.
        const u: ProjectedPosition[] = [
            [0, 0],
            [90_000, 0],
            [90_000, 90_000],
            [60_000, 90_000],
            [60_000, 30_000],
            [30_000, 30_000],
            [30_000, 90_000],
            [0, 90_000],
        ];
        const f: PaintFeature = {...label([45_000, 15_000]), ring: u};
        const view = {minX: 10_000, minY: 20_000, maxX: 80_000, maxY: 200_000};
        const at = anchor(areaLabelInView(f, context(view)));
        expect(inRing(at, u)).toBe(true);
    });
});

describe('clipRing', () => {
    it('cuts a ring at the edges of the view', () => {
        const clipped = clipRing(
            [
                [-50_000, -10_000],
                [50_000, -10_000],
                [50_000, 10_000],
                [-50_000, 10_000],
            ],
            VIEW,
        );
        expect(Math.min(...clipped.map(p => p[0]))).toBe(0);
        expect(Math.max(...clipped.map(p => p[0]))).toBe(50_000);
    });
});

describe('a line labelled at its middle', () => {
    const line = (name: TacticalGraphicName, coords: ProjectedPosition[]): PaintFeature => ({
        geometry: {type: 'LineString', coordinates: coords},
        properties: {name, designation: '1-12 IN', secondDesignation: '2-8 IN'},
    });
    const cases = [
        ['a boundary', TacticalGraphicName.Boundary, boundaryPaint()],
        ['a coordinated fire line', TacticalGraphicName.CoordinatedFireLine, coordinatedFireLinePaint(TacticalGraphicName.CoordinatedFireLine)],
        ['a linear target', TacticalGraphicName.LinearTarget, linearTargetPaint(TacticalGraphicName.LinearTarget)],
        ['a final protective fire', TacticalGraphicName.FinalProtectiveFire, finalProtectiveFirePaint()],
    ] as const;

    for (const [title, name, paint] of cases) {
        it(`paints ${title} as before when its middle is on screen`, () => {
            const f = line(name, [
                [-50_000, 0],
                [150_000, 0],
            ]);
            expect(paint(f, context(VIEW))).toEqual(paint(f, context()));
        });

        it(`brings ${title}'s labels onto the view when its middle is off it`, () => {
            const f = line(name, [
                [-300_000, 0],
                [80_000, 0],
            ]);
            const at = labels(paint(f, context(VIEW)));
            expect(at.length).toBeGreaterThan(0);
            for (const p of at) expect(inView(p, VIEW)).toBe(true);
        });
    }
});

describe('a label whose place another label holds', () => {
    const taken = (x: number, y: number, half = 6_000): ProjectedBounds => ({minX: x - half, minY: y - half, maxX: x + half, maxY: y + half});
    const withAvoid = (avoid: ProjectedBounds[]): PaintContext => ({...context(VIEW), avoid});
    const line = (name: TacticalGraphicName): PaintFeature => ({
        geometry: {
            type: 'LineString',
            coordinates: [
                [10_000, 0],
                [90_000, 0],
            ],
        },
        properties: {name, designation: '1AD', secondDesignation: '2AD'},
    });

    it('slides a coordinated fire line label along its line, clear of it', () => {
        const paint = coordinatedFireLinePaint(TacticalGraphicName.CoordinatedFireLine);
        const free = labels(paint(line(TacticalGraphicName.CoordinatedFireLine), context(VIEW)));
        const moved = labels(paint(line(TacticalGraphicName.CoordinatedFireLine), withAvoid([taken(50_000, 0)])));
        expect(free[0][0]).toBeCloseTo(50_000);
        expect(Math.abs(moved[0][0] - 50_000)).toBeGreaterThan(6_000);
        for (const p of moved) expect(inView(p, VIEW)).toBe(true);
    });

    it("moves a boundary's names and echelon together", () => {
        const paint = boundaryPaint();
        const moved = paint(line(TacticalGraphicName.Boundary), withAvoid([taken(50_000, 0)]));
        const xs = labels(moved).map(p => p[0]);
        expect(Math.abs(xs[0] - 50_000)).toBeGreaterThan(6_000);
        expect(xs[0]).toBeCloseTo(xs[1]);
    });

    it('stays where it was when nothing is in the way', () => {
        const paint = boundaryPaint();
        const f = line(TacticalGraphicName.Boundary);
        expect(paint(f, withAvoid([taken(0, 40_000, 1_000)]))).toEqual(paint(f, context(VIEW)));
    });

    it('stays put when every place along the line is held', () => {
        const paint = coordinatedFireLinePaint(TacticalGraphicName.CoordinatedFireLine);
        const f = line(TacticalGraphicName.CoordinatedFireLine);
        expect(paint(f, withAvoid([{minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6}]))).toEqual(paint(f, context(VIEW)));
    });

    it('moves an area label to a clear part of its area', () => {
        const ring: ProjectedPosition[] = [
            [10_000, -40_000],
            [90_000, -40_000],
            [90_000, 40_000],
            [10_000, 40_000],
            [10_000, -40_000],
        ];
        const f: PaintFeature = {geometry: {type: 'Point', coordinates: [50_000, 0]}, properties: {name: TacticalGraphicName.ObjectiveArea}, ring};
        const footprint = {alongPx: 30, acrossPx: 8};
        expect(areaLabelInView(f, withAvoid([]), footprint)).toBe(f);
        const at = (areaLabelInView(f, withAvoid([taken(50_000, 0)]), footprint).geometry as {coordinates: ProjectedPosition}).coordinates;
        expect(Math.abs(at[1])).toBeGreaterThan(6_000);
        expect(inRing(at, ring)).toBe(true);
    });
});

describe('phase line and axis labels with places held', () => {
    const held = (x: number, y: number, half = 4_000): ProjectedBounds => ({minX: x - half, minY: y - half, maxX: x + half, maxY: y + half});
    const pl = (coords: ProjectedPosition[]): PaintFeature => ({
        geometry: {type: 'LineString', coordinates: coords},
        properties: {name: TacticalGraphicName.PhaseLine, designation: 'RUTH'},
    });
    const paint = phaseLinePaint(TacticalGraphicName.PhaseLine);

    it('moves an end label into the line when the place past the end is held', () => {
        const line = pl([
            [20_000, 0],
            [80_000, 0],
        ]);
        const free = labels(paint(line, context(VIEW)));
        // Past the west end, where "PL RUTH" would run.
        const moved = labels(paint(line, {...context(VIEW), avoid: [held(15_000, 0)]}));
        expect(free[0][0]).toBe(20_000);
        expect(moved[0][0]).toBeGreaterThan(20_000);
        expect(moved[0][1]).toBe(0);
        expect(moved[1]).toEqual([80_000, 0]);
    });

    it('slides an in-line label further in past a held place', () => {
        const line = pl([
            [-50_000, 0],
            [150_000, 0],
        ]);
        const free = labels(paint(line, context(VIEW)));
        const moved = labels(paint(line, {...context(VIEW), avoid: [held(free[0][0], 0)]}));
        expect(moved[0][0]).toBeGreaterThan(free[0][0] + 4_000);
        expect(moved[0][1]).toBe(0);
    });

    it("keeps a label off another graphic's line", () => {
        const cfl = coordinatedFireLinePaint(TacticalGraphicName.CoordinatedFireLine);
        const f: PaintFeature = {
            geometry: {
                type: 'LineString',
                coordinates: [
                    [10_000, 0],
                    [90_000, 0],
                ],
            },
            properties: {name: TacticalGraphicName.CoordinatedFireLine, designation: '1AD'},
        };
        const crossing: ProjectedPosition[] = [
            [50_000, -40_000],
            [50_000, 40_000],
        ];
        const at = labels(cfl(f, {...context(VIEW), avoidLines: [crossing]}));
        expect(Math.abs(at[0][0] - 50_000)).toBeGreaterThan(2_000);
    });

    it('steps an axis label back along the arrow when its place is held', () => {
        const paintAxis = axisOfAdvanceLabelPaint(TacticalGraphicName.MainAxisOfAdvance);
        const axis: PaintFeature = {
            geometry: {
                type: 'MultiPoint',
                coordinates: [
                    [70_000, 0],
                    [90_000, 0],
                    [0, 0],
                    [90_000, 0],
                ],
            },
            properties: {name: TacticalGraphicName.MainAxisOfAdvance, designation: 'IRON'},
        };
        const free = labels(paintAxis(axis, context(VIEW)));
        const moved = labels(paintAxis(axis, {...context(VIEW), avoid: [held(80_000, 0)]}));
        expect(moved[0][0]).toBeLessThan(free[0][0] - 4_000);
    });
});

describe("an area label and another graphic's line", () => {
    it('moves off a line crossing its middle, with no other labels placed yet', () => {
        const ring = [
            [0, 0],
            [0.4, 0],
            [0.4, 0.4],
            [0, 0.4],
            [0, 0],
        ];
        const graphic = buildPaintedGraphic(TacticalGraphicName.ObjectiveArea, {type: 'Polygon', coordinates: [ring]}, {designation: 'SWORD'}, 20)!;
        const projected = (graphic.graphic.geometry as {coordinates: ProjectedPosition[][]}).coordinates[0];
        const xs = projected.map(([x]) => x);
        const ys = projected.map(([, y]) => y);
        const [cx, cy] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
        const view = {minX: Math.min(...xs) - 5_000, minY: Math.min(...ys) - 5_000, maxX: Math.max(...xs) + 5_000, maxY: Math.max(...ys) + 5_000};
        const base = {resolution: 20, measureText: (t: string) => t.length * 9, view};
        const across: ProjectedPosition[] = [
            [view.minX, cy],
            [view.maxX, cy],
        ];
        const free = labels(paintGraphic(graphic, base));
        const moved = labels(paintGraphic(graphic, {...base, avoidLines: [across]}));
        expect(free[0][1]).toBeCloseTo(cy, -2);
        expect(Math.abs(moved[0][1] - cy)).toBeGreaterThan(100);
        expect(Math.abs(free[0][0] - cx)).toBeLessThan(1_000);
    });
});
