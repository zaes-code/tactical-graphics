/**
 * # A corridor's leg designation keeps its prefix when it is too small to read
 *
 * `AC ALPHA` along a leg becomes `AC` at 6 px once the whole would be under it, on every leg
 * whose clear run between its ACP circles is at least twice `AC`. (User, 2026-10-24.)
 * @see legibleDesignation
 */
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import type {GeometryCollection, MultiLineString} from 'geojson';
import {airCorridorLabelPaint} from './corridorPaints';
import {renderTacticalGraphic} from '../core/render';

const AIR_CORRIDORS = [
    TacticalGraphicName.AirCorridor,
    TacticalGraphicName.LowLevelTransitRoute,
    TacticalGraphicName.MinimumRiskRoute,
    TacticalGraphicName.SafeLane,
    TacticalGraphicName.SpecialCorridor,
    TacticalGraphicName.StandardUseArmyAircraftFlightRoute,
    TacticalGraphicName.TransitCorridor,
    TacticalGraphicName.UnmannedAircraftCorridor,
];

const context: PaintContext = {
    resolution: 1,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
};

/** One leg `length` px long (two, turning, when `turn`), 20 px half-width, labels capped by a `boundsPx` extent. */
const corridor = (length: number, boundsPx: number, turn = false): Paint[] =>
    airCorridorLabelPaint(TacticalGraphicName.AirCorridor)(
        {
            geometry: {type: 'MultiPoint', coordinates: (turn ? [[0, 0], [length, 0], [length, length]] : [[0, 0], [length, 0]]) as ProjectedPosition[]},
            properties: {name: TacticalGraphicName.AirCorridor, designation: 'ALPHA'},
            graphicSize: 20,
            bounds: {minX: 0, minY: 0, maxX: boundsPx, maxY: 0},
        } as unknown as PaintFeature,
        context,
    );

/** The designation on the legs: not an ACP label, not the amplifier block. */
const legs = (paints: Paint[]) =>
    paints.filter(p => p.text?.text && !p.text.text.startsWith('ACP') && p.text.kind !== 'amplifier').map(p => p.text!);

beforeEach(() => resetTacticalGraphicsConfig());

describe('airCorridorLabelPaint', () => {
    it('draws AC ALPHA while it is legible', () => {
        expect(legs(corridor(400, 400)).map(t => t.text)).toEqual(['AC ALPHA']);
    });

    it('drops the name and holds AC at 6 px once the whole would be under it', () => {
        const [leg, ...rest] = legs(corridor(300, 6));
        expect(rest).toEqual([]);
        expect(leg.text).toBe('AC');
        expect(16 * leg.scale!).toBeCloseTo(6, 9);
    });

    it('draws no designation on a leg whose clear run is under twice AC', () => {
        // 50 px legs meeting at a turn, 40 px of each inside the half-widths: 10 px clear.
        expect(legs(corridor(50, 6, true))).toEqual([]);
    });
});

describe('an air corridor is its rails and nothing else', () => {
    // MIL-STD-2525E 170100 Corridor1: two parallel rails with square open ends. The ACP and
    // CCP circles in its examples are gray, which the table's note says is not part of the
    // measure (FM 1-02.2 Table 5-23 grays them too).
    it.each(AIR_CORRIDORS.map(name => [String(name), name] as const))('%s', (_label, name) => {
        const out = renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: [[0, 0], [0.1, 0], [0.1, 0.1]]},
            properties: {tacticalGraphic: {name, radius: 1000}},
        } as never);
        const members = (out.graphic.geometry as GeometryCollection).geometries;
        expect(members.map(m => m.type)).toEqual(['MultiLineString']);
        // Two rails per leg, two legs.
        expect((members[0] as MultiLineString).coordinates).toHaveLength(4);
    });
});
