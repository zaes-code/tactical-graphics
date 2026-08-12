/**
 * `decorationSize` is documented as metres. These pin that it behaves like one.
 *
 * Six generators used to multiply it by a pixel count of their own, so a value in metres
 * came out 15-20x too large. It only looked right because the OpenLayers holders passed
 * the map resolution into the slot instead of a distance.
 *
 * Measured on graphic **and** labels: four of the eleven put their multiplier in
 * `generateLabels`, so a probe that only reads the graphic scores them as unaffected.
 */
import {renderTacticalGraphic, TacticalGraphicName} from './index';
import type {Feature, MultiPoint, Position} from 'geojson';
import * as turf from './core/turf';

const LINE: Position[] = [[-77.0, 38.9], [-76.8, 38.9]];

/**
 * Fields of fire is drawn as a V, and a two-point base now has its second leg
 * synthesised — a right angle off the drawn one. That leg is legitimately far from
 * the drawn line, so `reach` would measure it rather than the decoration. Giving it
 * a base that is already a V keeps the measurement on the thing being pinned.
 * @see asVee
 */
const VEE: Position[] = [[-77.0, 38.9], [-76.9, 38.9], [-76.9, 39.0]];

/** The base each graphic is measured from. */
const baseFor = (name: TacticalGraphicName): Position[] =>
    name === TacticalGraphicName.FieldsOfFire ? VEE : LINE;

const build = (name: TacticalGraphicName, decorationSize: number): Feature => ({
    type: 'Feature',
    geometry: {type: 'LineString', coordinates: baseFor(name)},
    properties: {tacticalGraphic: {name, decorationSize}},
});

const metres = (a: Position, b: Position) =>
    turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

/** How far the output strays from the drawn line — graphic and labels together. */
function reach(name: TacticalGraphicName, decorationSize: number): number {
    const out = renderTacticalGraphic(build(name, decorationSize));
    const line = turf.lineString(baseFor(name));
    let max = 0;
    const consider = (c: Position) => {
        const d = turf.pointToLineDistance(turf.point(c), line, {units: 'meters'});
        if (d > max) max = d;
    };
    // FerryCrossing returns a GeometryCollection, not a MultiLineString — a probe that
    // only walks the latter measures nothing and reports a flat scale ratio.
    const walk = (geom: {type: string; coordinates?: unknown; geometries?: unknown[]}): void => {
        if (geom.type === 'GeometryCollection') {
            (geom.geometries ?? []).forEach(sub => walk(sub as never));
            return;
        }
        const flat = (v: unknown): void => {
            if (Array.isArray(v) && typeof v[0] === 'number') consider(v as Position);
            else if (Array.isArray(v)) v.forEach(flat);
        };
        flat(geom.coordinates);
    };
    walk(out.graphic.geometry as never);
    const l = out.labels.geometry;
    if (l.type === 'MultiPoint') (l as MultiPoint).coordinates.forEach(consider);
    return max;
}

const AFFECTED: [string, TacticalGraphicName][] = [
    ['DirectionOfSupportingAttack', TacticalGraphicName.DirectionOfSupportingAttack],
    ['DirectionOfMainAttack', TacticalGraphicName.DirectionOfMainAttack],
    ['DirectionOfMainAttackFeint', TacticalGraphicName.DirectionOfMainAttackFeint],
    ['AviationDirectionOfAttack', TacticalGraphicName.AviationDirectionOfAttack],
    ['FieldsOfFire', TacticalGraphicName.FieldsOfFire],
    ['PassageLane', TacticalGraphicName.PassageLane],
    ['FerryCrossing', TacticalGraphicName.FerryCrossing],
    ['Bridge', TacticalGraphicName.Bridge],
    ['Gap', TacticalGraphicName.Gap],
    ['AssaultCrossing', TacticalGraphicName.AssaultCrossing],
];

describe('decorationSize is a distance in metres', () => {
    it.each(AFFECTED)('%s stays within a few multiples of the value it was given', (_l, name) => {
        // A 1 km decoration must not produce a 20 km one. Generous ceiling: some
        // generators legitimately reach a couple of multiples out.
        expect(reach(name, 1000)).toBeLessThan(4000);
    });

    it.each(AFFECTED)('%s scales linearly', (_l, name) => {
        const a = reach(name, 1000);
        const b = reach(name, 2000);
        expect(a).toBeGreaterThan(0);
        expect(b / a).toBeCloseTo(2, 1);
    });
});
