/**
 * Labels that follow the view: a label whose place on the symbol is off screen moves onto
 * the visible part of its line, and nothing changes when the context carries no view.
 * @see PaintContext.view
 */

import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import type {Paint, PaintContext, PaintFeature, ProjectedBounds, ProjectedPosition} from '../core/paint';
import {phaseLinePaint} from './paintFunctions';
import {axisOfAdvanceLabelPaint} from './movementPaints';
import {VIEW_EDGE_INSET_PX, inView, pathUpTo, visibleStretch} from './viewFollow';

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
        // Inset from the edge, one at each side.
        expect(Math.min(...at.map(p => p[0]))).toBeCloseTo(VIEW_EDGE_INSET_PX * RESOLUTION);
        expect(Math.max(...at.map(p => p[0]))).toBeCloseTo(100_000 - VIEW_EDGE_INSET_PX * RESOLUTION);
    });

    it('moves the label of an end that is on screen when the label itself would run off it', () => {
        // The start sits just inside the view, but "PL RUTH" runs west past the edge.
        const line: ProjectedPosition[] = [
            [2_500, 0],
            [80_000, 0],
        ];
        const paints = paint(feature(line), context(VIEW));
        const [first, last] = paints.filter(p => p.text);
        // Turned to read inward from the end, just above the line, rather than out past it.
        const at = (first.geometry as {coordinates: ProjectedPosition}).coordinates;
        expect(at[0]).toBeCloseTo(2_500);
        expect(at[1]).toBeGreaterThan(0);
        expect(first.text!.offsetXPx).toBe(0);
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
