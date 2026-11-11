/**
 * # Which side a battle position opens on, and what it draws with no echelon
 *
 * A host that knows where the threat is wants to open its battle positions toward it, and
 * the ring always opened south. `openingDirection` names the direction from the opening into
 * the shape, in degrees counter-clockwise from east; unset, the ring still opens south.
 *
 * With no echelon the glyph used to fall back to a squad's dot, so every position and
 * boundary nobody had given an echelon said squad. Now it draws nothing: a battle position
 * opens by its clearance alone and a boundary's line stays whole.
 */
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicEchelon, TacticalGraphicName} from '../core/type';
import type {TacticalGraphicProperties} from '../core/render';
import {resetTacticalGraphicsConfig} from '../core/config';
import {battlePositionPaint, strongPointPaint} from './echelonPaints';
import {boundaryPaint} from './boundaryPaints';

const context: PaintContext = {resolution: 1, measureText: (text: string) => text.length * 10};

const SIDE = 1000;
const CCW: ProjectedPosition[] = [[0, 0], [SIDE, 0], [SIDE, SIDE], [0, SIDE], [0, 0]];
const CW: ProjectedPosition[] = [...CCW].reverse();

const POSITIONS = [
    [TacticalGraphicName.BattlePosition, battlePositionPaint()],
    [TacticalGraphicName.BattlePositionPreparedButNotOccupied, battlePositionPaint({alwaysDashed: true})],
    [TacticalGraphicName.StrongPoint, strongPointPaint()],
] as const;

const area = (ring: ProjectedPosition[], properties: Omit<TacticalGraphicProperties, 'name'>, name: TacticalGraphicName): PaintFeature => ({
    geometry: {type: 'Polygon', coordinates: [ring]},
    properties: {name, ...properties},
});

/** Every position a paint's geometry holds. */
function positions(paints: Paint[]): ProjectedPosition[] {
    const out: ProjectedPosition[] = [];
    const collect = (node: unknown): void => {
        if (Array.isArray(node) && typeof node[0] === 'number') out.push(node as ProjectedPosition);
        else if (Array.isArray(node)) node.forEach(collect);
    };
    paints.forEach(p => collect((p.geometry as {coordinates: unknown}).coordinates));
    return out;
}

/** The outline's runs: the first paint, which is the ring broken open. */
const outlineRuns = (paints: Paint[]): ProjectedPosition[][] =>
    (paints[0].geometry as {coordinates: ProjectedPosition[][]}).coordinates;

/** The middle of each edge of the square, by the side it is on. */
const EDGE_MIDDLES: Record<string, ProjectedPosition> = {
    south: [SIDE / 2, 0],
    east: [SIDE, SIDE / 2],
    north: [SIDE / 2, SIDE],
    west: [0, SIDE / 2],
};

/** How close the outline runs come to a point. */
function distanceToRuns(runs: ProjectedPosition[][], [px, py]: ProjectedPosition): number {
    let best = Infinity;
    for (const run of runs) {
        for (let i = 0; i < run.length - 1; i++) {
            const [[ax, ay], [bx, by]] = [run[i], run[i + 1]];
            const [dx, dy] = [bx - ax, by - ay];
            const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
            best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
        }
    }
    return best;
}

/** The sides whose middle the outline does not reach: where the ring is open. */
const openSides = (paints: Paint[]): string[] =>
    Object.entries(EDGE_MIDDLES).filter(([, at]) => distanceToRuns(outlineRuns(paints), at) > 1).map(([side]) => side);

beforeEach(() => resetTacticalGraphicsConfig());

describe('openingDirection', () => {
    const cases = [
        {openingDirection: undefined, side: 'south'},
        {openingDirection: 90, side: 'south'},
        {openingDirection: 0, side: 'west'},
        {openingDirection: 180, side: 'east'},
        {openingDirection: 270, side: 'north'},
        {openingDirection: -90, side: 'north'},
    ];
    for (const [label, ring] of [['counter-clockwise', CCW], ['clockwise', CW]] as const) {
        it.each(cases)(`opens a ${label} ring on its $side edge for $openingDirection`, ({openingDirection, side}) => {
            for (const [name, paint] of POSITIONS) {
                const paints = paint(area(ring, {echelon: TacticalGraphicEchelon.battalionSquadron, openingDirection}, name), context);
                expect(openSides(paints)).toEqual([side]);
                // The glyph sits in the break, on that edge.
                const glyph = positions(paints.slice(1, 3));
                const [gx, gy] = [glyph.reduce((s, p) => s + p[0], 0) / glyph.length, glyph.reduce((s, p) => s + p[1], 0) / glyph.length];
                expect(Math.hypot(gx - EDGE_MIDDLES[side][0], gy - EDGE_MIDDLES[side][1])).toBeLessThan(1);
            }
        });
    }

    it('is not the bag\'s rotation, which several paths file as 0 on an area', () => {
        const paints = battlePositionPaint()(area(CCW, {echelon: TacticalGraphicEchelon.battalionSquadron, rotation: 0}, TacticalGraphicName.BattlePosition), context);
        expect(openSides(paints)).toEqual(['south']);
    });

    it('ignores a value that is not a number', () => {
        const paints = battlePositionPaint()(
            area(CCW, {echelon: TacticalGraphicEchelon.battalionSquadron, openingDirection: Number.NaN}, TacticalGraphicName.BattlePosition),
            context,
        );
        expect(openSides(paints)).toEqual(['south']);
    });
});

describe('no echelon', () => {
    for (const echelon of [undefined, TacticalGraphicEchelon.unknown]) {
        it(`draws no glyph in a battle position or strong point (${echelon ?? 'unset'})`, () => {
            for (const [name, paint] of POSITIONS) {
                const paints = paint(area(CCW, {echelon}, name), context);
                expect(paints.filter(p => p.circle)).toEqual([]);
                // The outline, plus a strong point's cross ties, which start on the outline;
                // a glyph's strokes sit in the gap, clear of it.
                const runs = outlineRuns(paints);
                for (const tie of paints.slice(1)) {
                    expect(tie.geometry.type).toBe('LineString');
                    expect(distanceToRuns(runs, (tie.geometry as {coordinates: ProjectedPosition[]}).coordinates[0])).toBeLessThan(1e-6);
                }
                if (name !== TacticalGraphicName.StrongPoint) expect(paints).toHaveLength(1);
                expect(openSides(paints)).toEqual(['south']);
            }
        });

        it(`leaves a boundary's line whole (${echelon ?? 'unset'})`, () => {
            const line: PaintFeature = {
                geometry: {type: 'LineString', coordinates: [[0, 0], [SIDE, 0]]},
                properties: {name: TacticalGraphicName.Boundary, designation: '1-8', secondDesignation: '2-8', echelon},
            };
            const paints = boundaryPaint()(line, context);
            expect(paints.filter(p => p.circle)).toEqual([]);
            expect(paints.filter(p => p.geometry.type === 'LineString')).toEqual([]);
            const outline = paints.find(p => p.geometry.type === 'MultiLineString')!;
            expect((outline.geometry as {coordinates: ProjectedPosition[][]}).coordinates).toEqual([[[0, 0], [SIDE, 0]]]);
            expect(paints.filter(p => p.text).map(p => p.text!.text)).toEqual(['1-8', '2-8']);
        });
    }

    /** The minimal opening is the clearance alone, so it is narrower than any glyph's. */
    it('opens a battle position less than the smallest glyph does', () => {
        const gap = (echelon?: TacticalGraphicEchelon): number => {
            const runs = outlineRuns(battlePositionPaint()(area(CCW, {echelon}, TacticalGraphicName.BattlePosition), context));
            const south = runs.flat().filter(([, y]) => y === 0).map(([x]) => x).sort((a, b) => a - b);
            const left = Math.max(...south.filter(x => x < SIDE / 2));
            const right = Math.min(...south.filter(x => x > SIDE / 2));
            return right - left;
        };
        expect(gap()).toBeGreaterThan(0);
        expect(gap()).toBeLessThan(gap(TacticalGraphicEchelon.squad));
    });

    it('still draws a glyph on a boundary that has one', () => {
        const line: PaintFeature = {
            geometry: {type: 'LineString', coordinates: [[0, 0], [SIDE, 0]]},
            properties: {name: TacticalGraphicName.Boundary, echelon: TacticalGraphicEchelon.squad},
        };
        expect(boundaryPaint()(line, context).filter(p => p.circle)).toHaveLength(1);
    });
});
