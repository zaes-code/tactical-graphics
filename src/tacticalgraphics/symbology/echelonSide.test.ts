/**
 * # A battle position's echelon sits on its south edge, however the ring was drawn
 *
 * APP-06 151200, 151202 and 151203 put B in a break of the bottom edge, away from the enemy
 * the example draws at the top. The edge used to be chosen as if every ring were wound
 * counter-clockwise, so a clockwise ring opened on the north edge, and it read the bag's
 * `rotation` as a radian facing, so MapLibre, which passes a filed `rotation: 0`, opened the
 * west edge where OpenLayers, which passes none, opened the south one (2026-10-31).
 */
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicEchelon, TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {battlePositionPaint, strongPointPaint} from './echelonPaints';

const context: PaintContext = {resolution: 1, measureText: (text: string) => text.length * 10};

const SIDE = 1000;
const CCW: ProjectedPosition[] = [[0, 0], [SIDE, 0], [SIDE, SIDE], [0, SIDE], [0, 0]];
const CW: ProjectedPosition[] = [...CCW].reverse();

const feature = (ring: ProjectedPosition[], name: TacticalGraphicName, rotation?: number): PaintFeature => ({
    geometry: {type: 'Polygon', coordinates: [ring]},
    properties: {name, echelon: TacticalGraphicEchelon.companyBatteryTroop, ...(rotation === undefined ? {} : {rotation})},
});

/** Every coordinate of the paints after the outline, which are the echelon glyph's. */
function glyphCentre(paints: Paint[], count: number): ProjectedPosition {
    const points: ProjectedPosition[] = [];
    const collect = (node: unknown): void => {
        if (Array.isArray(node) && typeof node[0] === 'number') points.push(node as ProjectedPosition);
        else if (Array.isArray(node)) node.forEach(collect);
    };
    paints.slice(1, 1 + count).forEach(p => collect((p.geometry as {coordinates: unknown}).coordinates));
    return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
}

beforeEach(() => resetTacticalGraphicsConfig());

describe('the echelon break', () => {
    const glyphs = battlePositionPaint()(feature(CCW, TacticalGraphicName.BattlePosition), context).length - 1;

    for (const [label, ring] of [['counter-clockwise', CCW], ['clockwise', CW]] as const) {
        for (const rotation of [undefined, 0, 90]) {
            it(`is on the south edge of a ${label} ring with rotation ${rotation}`, () => {
                for (const [name, paint] of [
                    [TacticalGraphicName.BattlePosition, battlePositionPaint()],
                    [TacticalGraphicName.BattlePositionPreparedButNotOccupied, battlePositionPaint({alwaysDashed: true})],
                    [TacticalGraphicName.StrongPoint, strongPointPaint()],
                ] as const) {
                    const [x, y] = glyphCentre(paint(feature(ring, name, rotation), context), glyphs);
                    expect(y).toBeCloseTo(0, 0);
                    expect(x).toBeCloseTo(SIDE / 2, 0);
                }
            });
        }
    }
});
