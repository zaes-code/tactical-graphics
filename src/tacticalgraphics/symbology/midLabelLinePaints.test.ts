/**
 * # The munition flight path's "MFP", in the gap cut for it
 *
 * The letters keep the scale the graphic gives them and are never floored: once that would
 * put them under 6 px they go, and the gap with them, so the path is drawn whole. A path
 * under twice their width is drawn whole too. (User, 2026-10-24.) @see letterInGapScale
 */
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {MIN_LEGIBLE_TEXT_PX, configureTacticalGraphics, resetTacticalGraphicsConfig} from '../core/config';
import {TacticalGraphicName} from '../core/type';
import {coordinatedFireLinePaint, engineerWorkLinePaint, munitionFlightPathPaint} from './midLabelLinePaints';
import {scaleOf} from './paintFunctions';

const context: PaintContext = {
    resolution: 10,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
};

function path(length: number): PaintFeature {
    return {
        geometry: {type: 'LineString', coordinates: [[0, 0], [length, 0]]},
        properties: {name: TacticalGraphicName.MunitionFlightPath},
        bounds: {minX: 0, minY: 0, maxX: length, maxY: 0},
    } as unknown as PaintFeature;
}

const mfpOf = (paints: Paint[]) => paints.find(p => p.text?.text === 'MFP');
const runsOf = (paints: Paint[]) =>
    (paints.find(p => p.geometry.type === 'MultiLineString')!.geometry as {coordinates: ProjectedPosition[][]}).coordinates;

describe('munitionFlightPathPaint', () => {
    it('draws MFP at its own scale, and drops it and closes the line once it would be under 6 px', () => {
        const drawnLength = (paints: Paint[]) => runsOf(paints).reduce((sum, run) => sum + Math.abs(run[run.length - 1][0] - run[0][0]), 0);

        // 100 px: the graphic cap puts the letters over 6 px, and they are drawn at exactly that.
        const desired = scaleOf(path(1000), context);
        expect(desired * 16).toBeGreaterThan(MIN_LEGIBLE_TEXT_PX);
        const legible = munitionFlightPathPaint()(path(1000), context);
        expect(mfpOf(legible)!.text!.scale!).toBeCloseTo(desired, 9);
        const [before, after] = runsOf(legible);
        expect(after[0][0] - before[before.length - 1][0]).toBeGreaterThan(0);

        // 40 px: the graphic cap would draw the letters at 5 px, so none, and the path is whole.
        expect(scaleOf(path(400), context) * 16).toBeLessThan(MIN_LEGIBLE_TEXT_PX);
        const small = munitionFlightPathPaint()(path(400), context);
        expect(mfpOf(small)).toBeUndefined();
        expect(drawnLength(small)).toBeCloseTo(400, 9);

        // 15 px: none, and the path is drawn whole.
        const tiny = munitionFlightPathPaint()(path(150), context);
        expect(mfpOf(tiny)).toBeUndefined();
        expect(drawnLength(tiny)).toBeCloseTo(150, 9);
    });
});

// APP-06 260600 note 3: the DTG "displayed one time mid-way between Point 1 and midpoint of the
// graphic", below the line.
describe('the munition flight path DTG', () => {
    const dated = (coords: ProjectedPosition[]): PaintFeature =>
        ({
            geometry: {type: 'LineString', coordinates: coords},
            properties: {name: TacticalGraphicName.MunitionFlightPath, startDate: 'W', endDate: 'W1'},
        }) as unknown as PaintFeature;
    const dtgOf = (paints: Paint[]) => paints.find(p => p.text?.text === 'W - W1')!;

    // APP-06 260600 note 3: once, mid-way between point 1 and the middle, below the line.
    it.each([
        ['east', [[0, 0], [10_000, 0]], 2500],
        ['west', [[10_000, 0], [0, 0]], 7500],
    ] as const)('sits a quarter along and below a path drawn %s', (_, coords, x) => {
        const dtg = dtgOf(munitionFlightPathPaint()(dated(coords.map(c => [...c]) as ProjectedPosition[]), context));
        const [dx, dy] = dtg.geometry.coordinates as number[];
        expect(dx).toBeCloseTo(x, 6);
        expect(dy).toBeLessThan(0);
        expect(dtg.text!.align).toBe('center');
    });
});

// APP-06 110300: each segment between anchor points repeats the information of segment 1-2.
describe('the engineer work line repeats T and T1 on every segment', () => {
    const ewl = (coords: ProjectedPosition[]): Paint[] =>
        engineerWorkLinePaint(TacticalGraphicName.EngineerWorkLine)(
            {
                geometry: {type: 'LineString', coordinates: coords},
                properties: {name: TacticalGraphicName.EngineerWorkLine, designation: '326 EN BN', secondDesignation: '52 EN BN'},
            } as unknown as PaintFeature,
            context,
        );

    it('sets one pair over each of three segments', () => {
        const paints = ewl([[0, 0], [10_000, 0], [20_000, 10_000], [30_000, 10_000]]);
        expect(paints.filter(p => p.text?.text === '326 EN BN')).toHaveLength(3);
        expect(paints.filter(p => p.text?.text === '52 EN BN')).toHaveLength(3);
    });

    it('keeps one pair on a smoothed line, which has no anchor points left in it', () => {
        configureTacticalGraphics({smoothLines: true});
        try {
            const paints = ewl([[0, 0], [10_000, 0], [20_000, 10_000], [30_000, 10_000]]);
            expect(paints.filter(p => p.text?.text === '326 EN BN')).toHaveLength(1);
        } finally {
            resetTacticalGraphicsConfig();
        }
    });
});

/**
 * The prefix outlives the name: too small to read, `CFL ALPHA` becomes `CFL` at 6 px, and the
 * engineer work line's `EWL` ends, which are the prefix alone, are held there rather than
 * shrinking away. Both go once the line is under twice the prefix. @see legibleDesignation
 */
describe('the coordinated fire line and engineer work line keep their prefix', () => {
    const at1: PaintContext = {...context, resolution: 1};
    /** A straight line `length` px long whose stamped extent, `boundsPx`, caps its labels. */
    const line = (name: TacticalGraphicName, length: number, boundsPx: number): PaintFeature =>
        ({
            geometry: {type: 'LineString', coordinates: [[0, 0], [length, 0]]},
            properties: {name, designation: 'ALPHA'},
            bounds: {minX: 0, minY: 0, maxX: boundsPx, maxY: 0},
        }) as unknown as PaintFeature;
    const textsOf = (paints: Paint[], baseline: string) => paints.filter(p => p.text?.text && p.text.baseline === baseline).map(p => p.text!);

    it('draws CFL ALPHA whole while legible, CFL alone at 6 px below that, and nothing on a stub', () => {
        const cfl = coordinatedFireLinePaint(TacticalGraphicName.CoordinatedFireLine);
        expect(textsOf(cfl(line(TacticalGraphicName.CoordinatedFireLine, 400, 400), at1), 'bottom').map(t => t.text)).toEqual(['CFL ALPHA']);

        const [small] = textsOf(cfl(line(TacticalGraphicName.CoordinatedFireLine, 100, 10), at1), 'bottom');
        expect(small.text).toBe('CFL');
        expect(16 * small.scale!).toBeCloseTo(6, 9);

        expect(textsOf(cfl(line(TacticalGraphicName.CoordinatedFireLine, 20, 10), at1), 'bottom')).toEqual([]);
    });

    it('holds the EWL ends at 6 px, and drops them on a stub', () => {
        const ewl = engineerWorkLinePaint(TacticalGraphicName.EngineerWorkLine);
        const ends = (paints: Paint[]) => textsOf(paints, 'bottom').filter(t => t.text === 'EWL');
        expect(ends(ewl(line(TacticalGraphicName.EngineerWorkLine, 400, 400), at1)).map(t => t.scale)).toEqual([1, 1]);

        const small = ends(ewl(line(TacticalGraphicName.EngineerWorkLine, 100, 10), at1));
        expect(small).toHaveLength(2);
        for (const t of small) expect(16 * t.scale!).toBeCloseTo(6, 9);

        expect(ends(ewl(line(TacticalGraphicName.EngineerWorkLine, 20, 10), at1))).toEqual([]);
    });
});

/** APP-06 260200, FM 1-02.2 Table 5-8 and MIL-STD-2525E Table L-XIII: the CFL is dashed in every status. */
describe('the coordinated fire line is always dashed', () => {
    it('dashes a present line, not only a planned one', () => {
        const cfl = coordinatedFireLinePaint(TacticalGraphicName.CoordinatedFireLine);
        const feature = {
            geometry: {type: 'LineString', coordinates: [[0, 0], [4000, 0]]},
            properties: {name: TacticalGraphicName.CoordinatedFireLine, status: 'present'},
            bounds: {minX: 0, minY: 0, maxX: 4000, maxY: 0},
        } as unknown as PaintFeature;
        const line = cfl(feature, context).find(p => p.geometry.type === 'LineString')!;
        expect(line.stroke?.dashPx?.length).toBeGreaterThan(0);
    });
});

describe('the munition flight path DTG on a bent path', () => {
    // Dates centred on a bend follow the path below it rather than running straight off it
    // (user, 2026-11-02).
    it('keeps every glyph the same distance below the line', () => {
        // A quarter of the way along is the bend itself, so the centred dates straddle it.
        const path: ProjectedPosition[] = [[0, 0], [2000, 0], [2000, -6000]];
        const feature = {
            geometry: {type: 'LineString', coordinates: path},
            properties: {name: TacticalGraphicName.MunitionFlightPath, startDate: '011200ZOCT26', endDate: '021800ZOCT26'},
        } as unknown as PaintFeature;
        const glyphs = munitionFlightPathPaint()(feature, context).filter(p => p.text?.glyph && p.text.fill !== 'rgba(0,0,0,0)');
        expect(glyphs.length).toBeGreaterThan(10);
        const off = ([x, y]: number[]) => Math.min(...path.slice(1).map((b, i) => {
            const a = path[i];
            const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
            const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
            return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
        }));
        const distances = glyphs.map(g => off(g.geometry.coordinates as number[]));
        // Round the outside of a bend a mitered offset stands up to root 2 further out.
        expect(Math.max(...distances) - Math.min(...distances)).toBeLessThan(context.resolution * 8);
    });
});
