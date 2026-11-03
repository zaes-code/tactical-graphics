/**
 * # Labels on more line families follow the view
 *
 * Zoomed in on the middle of a long graphic, so its ends and its own middle labels are off
 * screen, each family below still puts its text on the view: the line control measures' end
 * labels (FEBA stands for all of them), line of contact's `LC`, an air corridor's leg name and
 * amplifier block, a mobility corridor's field H, and a safe lane's column. Painted through
 * `paintGraphic`, the path every engine shares. @see endAnchorInView, midSegmentInView
 */

import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {buildPaintedGraphic, paintGraphic} from '../core/paintedGraphic';
import type {Paint, PaintContext, ProjectedBounds, ProjectedPosition} from '../core/paint';
import {pointAlong} from './viewFollow';

beforeEach(() => resetTacticalGraphicsConfig());

const measureText = (text: string, font: string) => text.length * parseFloat(/(\d+)px/.exec(font)?.[1] ?? '16') * 0.6;

/** About 670 km long, west to east along the equator. */
const LONG_LINE = {
    type: 'LineString' as const,
    coordinates: [
        [-3, 0],
        [3, 0],
    ],
};

/** A view 80 km wide on the middle of it. */
const VIEW: ProjectedBounds = {minX: -40_000, minY: -30_000, maxX: 40_000, maxY: 30_000};

const texts = (paints: Paint[]) =>
    paints.filter(p => p.text?.text && p.geometry.type === 'Point').map(p => ({text: p.text!.text, at: p.geometry.coordinates as ProjectedPosition}));
const inView = ([x, y]: ProjectedPosition) => x >= VIEW.minX && x <= VIEW.maxX && y >= VIEW.minY && y <= VIEW.maxY;

function painted(name: TacticalGraphicName, properties: Record<string, unknown>, geometry: object = LONG_LINE) {
    const graphic = buildPaintedGraphic(name, geometry as never, properties as never, 100)!;
    const context = (view?: ProjectedBounds): PaintContext => ({resolution: 100, measureText, ...(view ? {view} : {})});
    return {without: texts(paintGraphic(graphic, context())), within: texts(paintGraphic(graphic, context(VIEW)))};
}

describe('labels that follow the view, by family', () => {
    it('line control measures: both end labels come onto the view, reading inward', () => {
        const {without, within} = painted(TacticalGraphicName.ForwardEdgeOfBattleArea, {designation: 'ALPHA'});
        expect(without.filter(t => t.text.includes('FEBA')).every(t => !inView(t.at))).toBe(true);
        const shown = within.filter(t => t.text.includes('FEBA'));
        expect(shown.length).toBe(2);
        expect(shown.every(t => inView(t.at))).toBe(true);
    });

    it('line of contact: LC at each edge of the view', () => {
        const {without, within} = painted(TacticalGraphicName.LineOfContact, {});
        expect(without.every(t => !inView(t.at))).toBe(true);
        expect(within.filter(t => t.text === 'LC' && inView(t.at)).length).toBe(2);
    });

    it('air corridor: the leg name and the amplifier block', () => {
        const {without, within} = painted(TacticalGraphicName.AirCorridor, {designation: 'ALPHA', width: 2000});
        expect(without.some(t => t.text.includes('NAME') && !inView(t.at))).toBe(true);
        expect(within.some(t => t.text.includes('NAME') && inView(t.at))).toBe(true);
        expect(within.some(t => t.text.includes('AC') && !t.text.includes('NAME') && inView(t.at))).toBe(true);
    });

    it('mobility corridor: field H over what is in view', () => {
        const {without, within} = painted(TacticalGraphicName.MobilityCorridor, {additionalInfo: 'GOING'});
        expect(without.filter(t => t.text === 'GOING').every(t => !inView(t.at))).toBe(true);
        expect(within.some(t => t.text === 'GOING' && inView(t.at))).toBe(true);
    });

    it('moves nothing when the whole graphic is on screen', () => {
        const everything: ProjectedBounds = {minX: -2_000_000, minY: -1_000_000, maxX: 2_000_000, maxY: 1_000_000};
        for (const name of [
            TacticalGraphicName.ForwardEdgeOfBattleArea,
            TacticalGraphicName.LineOfContact,
            TacticalGraphicName.AirCorridor,
            TacticalGraphicName.MobilityCorridor,
        ]) {
            const graphic = buildPaintedGraphic(name, LONG_LINE, {designation: 'ALPHA', additionalInfo: 'GOING', width: 2000} as never, 100)!;
            const plain = texts(paintGraphic(graphic, {resolution: 100, measureText}));
            expect(texts(paintGraphic(graphic, {resolution: 100, measureText, view: everything}))).toEqual(plain);
        }
    });
});

/** Whether `p` lies inside `view`. */
const within =
    (view: ProjectedBounds) =>
    ([x, y]: ProjectedPosition) =>
        x >= view.minX && x <= view.maxX && y >= view.minY && y <= view.maxY;

/** The labels a graphic paints with and without `view`, and which of them land in it. */
function inViewCounts(name: TacticalGraphicName, geometry: object, properties: Record<string, unknown>, view: ProjectedBounds) {
    const graphic = buildPaintedGraphic(name, geometry as never, properties as never, 100)!;
    const resolution = (view.maxX - view.minX) / 400;
    const shown = within(view);
    const count = (ctx: PaintContext) => texts(paintGraphic(graphic, ctx)).filter(t => shown(t.at)).length;
    return {without: count({resolution, measureText}), within: count({resolution, measureText, view})};
}

describe('arrows and areas that follow the view', () => {
    it('direction of attack: the name comes along the shaft from behind an off-screen head', () => {
        // Drawn tip first, so the head is far off to the east of the view.
        const arrow = {
            type: 'LineString',
            coordinates: [
                [3, 0],
                [-3, 0],
            ],
        };
        const {without, within: shown} = inViewCounts(TacticalGraphicName.DirectionOfMainAttack, arrow, {designation: 'ALPHA'}, VIEW);
        expect(without).toBe(0);
        expect(shown).toBe(1);
    });

    it('UXO area: a side whose middle is off screen carries its UXO on the part in view', () => {
        const square = {
            type: 'Polygon',
            coordinates: [
                [
                    [-2, -2],
                    [2, -2],
                    [2, 2],
                    [-2, 2],
                    [-2, -2],
                ],
            ],
        };
        // Low on the west side of the square: its middle, at the equator, is well above the view.
        const view = {minX: -240_000, minY: -200_000, maxX: -200_000, maxY: -160_000};
        const {without, within: shown} = inViewCounts(TacticalGraphicName.UnexplodedExplosiveOrdnanceArea, square, {}, view);
        expect(without).toBe(0);
        expect(shown).toBeGreaterThan(0);
    });

    it('ship area of interest: the AOI under the shape slides along to the part in view', () => {
        const rect = {
            type: 'Polygon',
            coordinates: [
                [
                    [-2, -1],
                    [2, -1],
                    [2, 1],
                    [-2, 1],
                    [-2, -1],
                ],
            ],
        };
        const graphic = buildPaintedGraphic(TacticalGraphicName.ShipAreaOfInterestRectangle, rect as never, {} as never, 100)!;
        const box = graphic.graphic.bounds!;
        // The line under the shape, near its east end.
        const view = {minX: box.maxX - 60_000, minY: box.minY - 30_000, maxX: box.maxX - 10_000, maxY: box.minY + 20_000};
        const {without, within: shown} = inViewCounts(TacticalGraphicName.ShipAreaOfInterestRectangle, rect, {}, view);
        expect(without).toBe(0);
        expect(shown).toBe(1);
    });
});

describe('movement arrows and ring labels that follow the view', () => {
    /** A sample-sheet base, spread out `k` times about its first point so it is far wider than the view. */
    async function spread(name: TacticalGraphicName, k: number) {
        const {sampleBase} = await import('../../components/maplibre/sampleGallery');
        const sample = sampleBase(name)!;
        const geometry = sample.geometry as {type: string; coordinates: unknown};
        const flat: number[][] = [];
        const walk = (c: unknown): void => void (typeof (c as number[])[0] === 'number' ? flat.push(c as number[]) : (c as unknown[]).forEach(walk));
        walk(geometry.coordinates);
        const [ox, oy] = flat[0];
        const up = (c: unknown): unknown =>
            typeof (c as number[])[0] === 'number'
                ? [ox + ((c as number[])[0] - ox) * k, oy + ((c as number[])[1] - oy) * k]
                : (c as unknown[]).map(up);
        return buildPaintedGraphic(
            name,
            {...geometry, coordinates: up(geometry.coordinates)} as never,
            {designation: 'ALPHA', ...sample.properties} as never,
            100,
        )!;
    }

    it('counterattack: the name comes along the arrow to the part in view', async () => {
        const graphic = await spread(TacticalGraphicName.Counterattack, 40);
        // The centre line the label is laid along is the label feature's points from the third on.
        const line = (graphic.labels!.geometry as {coordinates: ProjectedPosition[]}).coordinates.slice(2);
        const at = pointAlong(line, 0.3 * line.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1]) : 0), 0)).at;
        const view = {minX: at[0] - 40_000, minY: at[1] - 30_000, maxX: at[0] + 40_000, maxY: at[1] + 30_000};
        const shown = within(view);
        const resolution = 100;
        const labels = (ctx: PaintContext) => texts(paintGraphic(graphic, ctx)).filter(t => shown(t.at));
        expect(labels({resolution, measureText})).toEqual([]);
        expect(labels({resolution, measureText, view}).length).toBeGreaterThan(0);
    });

    it('range fan: a band block comes round its ring to the part in view', async () => {
        const graphic = await spread(TacticalGraphicName.WeaponSensorRangeFanCircular, 1);
        const center = (graphic.labels!.geometry as {coordinates: ProjectedPosition[]}).coordinates[0];
        const box = graphic.graphic.bounds!;
        const r = Math.max(box.maxX - box.minX, box.maxY - box.minY) / 2;
        // The west side of the ring: its bottom, where the block usually hangs, is off screen.
        const view = {minX: center[0] - r - r / 5, minY: center[1] - r / 5, maxX: center[0] - r + r / 5, maxY: center[1] + r / 5};
        const shown = within(view);
        const resolution = (2 * r) / 5 / 400;
        const blocks = (ctx: PaintContext) => texts(paintGraphic(graphic, ctx)).filter(t => shown(t.at));
        expect(blocks({resolution, measureText})).toEqual([]);
        expect(blocks({resolution, measureText, view}).length).toBe(1);
    });

    it('minimum safe distance: a zone number comes round its ring to the part in view', () => {
        const graphic = buildPaintedGraphic(
            TacticalGraphicName.MinimumSafeDistanceZone,
            {
                type: 'LineString',
                coordinates: [
                    [0, 0],
                    [2, 0],
                    [3, 0],
                ],
            } as never,
            {} as never,
            100,
        );
        expect(graphic).toBeTruthy();
        const box = graphic!.graphic.bounds!;
        // The west edge of the rings: the numbers sit east, so off screen without the view.
        const view = {
            minX: box.minX - 10_000,
            minY: (box.minY + box.maxY) / 2 - 30_000,
            maxX: box.minX + 70_000,
            maxY: (box.minY + box.maxY) / 2 + 30_000,
        };
        const shown = within(view);
        const resolution = (view.maxX - view.minX) / 400;
        const numbers = (ctx: PaintContext) => texts(paintGraphic(graphic!, ctx)).filter(t => shown(t.at));
        expect(numbers({resolution, measureText})).toEqual([]);
        expect(numbers({resolution, measureText, view}).length).toBeGreaterThan(0);
    });
});

describe('engineer work line', () => {
    it('brings its end prefixes and its middle designation onto the view', () => {
        const {without, within: shownMiddle} = painted(TacticalGraphicName.EngineerWorkLine, {designation: 'ALPHA'});
        expect(without.filter(t => t.text === 'EWL').every(t => !inView(t.at))).toBe(true);
        expect(shownMiddle.filter(t => t.text === 'EWL' && inView(t.at)).length).toBe(2);
        expect(shownMiddle.some(t => t.text === 'ALPHA' && inView(t.at))).toBe(true);
    });

    it('takes each segment middle to the part of it in view', () => {
        // East of the line's middle: the segment's own middle is off screen to the west.
        const view = {minX: 100_000, minY: -30_000, maxX: 180_000, maxY: 30_000};
        const {without, within: shown} = inViewCounts(TacticalGraphicName.EngineerWorkLine, LONG_LINE, {designation: 'ALPHA'}, view);
        expect(without).toBe(0);
        expect(shown).toBeGreaterThan(0);
    });
});

describe('middle labels that follow the view', () => {
    // East of the line's middle: every label set at the middle is off screen to the west.
    const EAST: ProjectedBounds = {minX: 100_000, minY: -30_000, maxX: 180_000, maxY: 30_000};

    it.each([
        [TacticalGraphicName.Route, 'ROUTE'],
        [TacticalGraphicName.MainSupplyRoute, 'MSR'],
        [TacticalGraphicName.AlternateSupplyRoute, 'ASR'],
    ])('%s: the route name', (name, prefix) => {
        const graphic = buildPaintedGraphic(name, LONG_LINE as never, {designation: 'ALPHA'} as never, 100)!;
        const shown = within(EAST);
        const names = (ctx: PaintContext) => texts(paintGraphic(graphic, ctx)).filter(t => t.text.includes(prefix) && shown(t.at));
        expect(names({resolution: 100, measureText})).toEqual([]);
        expect(names({resolution: 100, measureText, view: EAST}).length).toBe(1);
    });

    it.each([
        [TacticalGraphicName.BearingLine, 'B'],
        [TacticalGraphicName.BearingLineElectromagneticWarfare, 'EW'],
        [TacticalGraphicName.BearingLineAcoustic, 'A'],
        [TacticalGraphicName.BearingLineElectroOpticalIntercept, 'O'],
        [TacticalGraphicName.BearingLineElectronic, 'E'],
    ])('%s: the letter and its gap', (name, letter) => {
        const graphic = buildPaintedGraphic(name, LONG_LINE as never, {} as never, 100)!;
        const shown = within(EAST);
        const paint = (ctx: PaintContext) => paintGraphic(graphic, ctx);
        const letters = (paints: Paint[]) => texts(paints).filter(t => t.text === letter && shown(t.at));
        expect(letters(paint({resolution: 100, measureText}))).toEqual([]);
        const moved = paint({resolution: 100, measureText, view: EAST});
        const [at] = letters(moved);
        expect(at).toBeTruthy();
        // The line is cut where the letter now stands: no stroke crosses its point.
        const strokes = moved.filter(p => p.stroke && p.geometry.type === 'LineString').map(p => p.geometry.coordinates as ProjectedPosition[]);
        expect(strokes.some(([a, b]) => Math.min(a[0], b[0]) < at.at[0] && Math.max(a[0], b[0]) > at.at[0])).toBe(false);
    });

    it.each([TacticalGraphicName.NavigationalRhumbLine, TacticalGraphicName.ObstacleLine, TacticalGraphicName.FortifiedLine])(
        '%s: its middle label',
        name => {
            const {without, within: shown} = inViewCounts(name, LONG_LINE, {designation: 'ALPHA'}, EAST);
            expect(without).toBe(0);
            expect(shown).toBeGreaterThan(0);
        },
    );
});

describe('infiltration lane', () => {
    it('centres its name on the part of its span in view', async () => {
        const {sampleBase} = await import('../../components/maplibre/sampleGallery');
        const sample = sampleBase(TacticalGraphicName.InfiltrationLane)!;
        const coords = (sample.geometry as {coordinates: number[][]}).coordinates;
        const [ox, oy] = coords[0];
        const k = 30 / Math.max(...coords.map(([x, y]) => Math.hypot(x - ox, y - oy)));
        const graphic = buildPaintedGraphic(
            TacticalGraphicName.InfiltrationLane,
            {type: 'LineString', coordinates: coords.map(([x, y]) => [ox + (x - ox) * k, oy + (y - oy) * k])} as never,
            {designation: 'ALPHA', ...sample.properties} as never,
            100,
        )!;
        // The span the name is centred on, and a view a fifth of the way along it.
        const [a, b] = (graphic.labels!.geometry as {coordinates: ProjectedPosition[]}).coordinates;
        const [cx, cy] = [a[0] + (b[0] - a[0]) * 0.2, a[1] + (b[1] - a[1]) * 0.2];
        const view = {minX: cx - 40_000, minY: cy - 30_000, maxX: cx + 40_000, maxY: cy + 30_000};
        const shown = within(view);
        const names = (ctx: PaintContext) => texts(paintGraphic(graphic, ctx)).filter(t => shown(t.at));
        expect(names({resolution: 100, measureText})).toEqual([]);
        expect(names({resolution: 100, measureText, view}).length).toBe(1);
    });
});
