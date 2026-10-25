/**
 * # A graphic placed across the antimeridian draws where it was placed
 *
 * A file folds longitudes into [-180, 180), so a graphic a few kilometers wide straddling
 * the antimeridian arrives with points at 179.99 and -179.99. Nine generators did their
 * arithmetic on those raw numbers and drew part of the symbol thousands of kilometers
 * away: Capture's arc swung to longitude 225, a difficult ford's bank marks landed near
 * longitude 0. The base is now unwrapped once, where every generator is handed it.
 * @see antimeridian.ts
 */

import type {Feature, Geometry, Position} from 'geojson';
import {baseGeometryFor, renderTacticalGraphic} from './core/render';
import {synthesizedBase} from './core/drawnBase';
import {storedOrder} from './core/drawOrder';
import {baseVertexCount} from './core/handles';
import {TacticalGraphicName} from './core/type';
import {unwrappedLongitudes} from './core/antimeridian';

/** The nine that drew a stray part, measured from the Exchange add-on's fixture corpus. */
const STRAYED = [
    TacticalGraphicName.Capture,
    TacticalGraphicName.Seize,
    TacticalGraphicName.Evacuate,
    TacticalGraphicName.Recover,
    TacticalGraphicName.FordDifficult,
    TacticalGraphicName.TurningMovement,
    TacticalGraphicName.AttackHelicopterAxisOfAdvance,
    TacticalGraphicName.MobileDefense,
    TacticalGraphicName.AviationDirectionOfAttack,
];

/** About 2 km either side of the center, the size the add-on's fixtures use. */
const HALF = 0.02;

/** A gentle arc in the graphic's stored order, where the core states no layout of its own. */
function arc(name: TacticalGraphicName, [cx, cy]: Position, n: number): Position[] {
    const points = Array.from({length: n}, (_, i) => {
        const t = i / (n - 1);
        return [cx - HALF + 2 * HALF * t, cy - HALF * 0.4 + Math.sin(t * Math.PI) * HALF * 0.5];
    });
    return storedOrder(name, points);
}

/** Longitude folded into [-180, 180), as a file holds it. */
const fold = ([lon, lat]: Position): Position => [((((lon + 180) % 360) + 360) % 360) - 180, lat];

function baseAt(name: TacticalGraphicName, center: Position): Geometry {
    const n = Math.max(2, baseVertexCount(name) || 2);
    const line = synthesizedBase(name, center, HALF, n) ?? arc(name, center, n);
    return {type: 'LineString', coordinates: line.map(fold)};
}

const positionsOf = (geometry: Geometry): Position[] => {
    const out: Position[] = [];
    const walk = (c: unknown): void => {
        if (typeof (c as number[])[0] === 'number') out.push(c as Position);
        else (c as unknown[]).forEach(walk);
    };
    if (geometry.type === 'GeometryCollection') geometry.geometries.forEach(g => walk((g as any).coordinates));
    else walk((geometry as any).coordinates);
    return out;
};

/** Great-circle distance in kilometers. */
function km(a: Position, b: Position): number {
    const r = Math.PI / 180;
    const h = Math.sin(((b[1] - a[1]) * r) / 2) ** 2
        + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

describe('a graphic across the antimeridian', () => {
    it.each(STRAYED)('%s draws every position near its control points', (name) => {
        expect(baseGeometryFor(name) ?? 'LineString').toBe('LineString');
        const geometry = baseAt(name, [179.99, 10]);
        const controls = positionsOf(geometry);
        // The fixture really does cross: one side folded negative, the other positive.
        expect(controls.some(p => p[0] < 0) && controls.some(p => p[0] > 0)).toBe(true);

        const feature: Feature = {type: 'Feature', geometry, properties: {tacticalGraphic: {name}}};
        const drawn = positionsOf(renderTacticalGraphic(feature).graphic.geometry);

        // The same shapes away from the antimeridian reach at most about 3 km from a control
        // point; the strays were 540 to 17,800 km out.
        const worst = Math.max(...drawn.map(p => Math.min(...controls.map(c => km(p, c)))));
        expect(worst).toBeLessThan(5);
    });

    it('leaves a base that does not cross untouched', () => {
        const feature: Feature = {type: 'Feature', properties: {}, geometry: {type: 'LineString', coordinates: [[179.9, 10], [-179.9 + 359.6, 10.1]]}};
        expect(unwrappedLongitudes(feature)).toBe(feature);
    });

    it('runs a crossing line on past 180 rather than jumping back', () => {
        const feature: Feature = {
            type: 'Feature',
            properties: {},
            geometry: {type: 'Polygon', coordinates: [[[179.99, 10], [-179.99, 10], [-179.99, 10.01], [179.99, 10]]]},
        };
        const unwrapped = unwrappedLongitudes(feature).geometry as {coordinates: Position[][]};
        expect(unwrapped.coordinates[0].map(p => +p[0].toFixed(2))).toEqual([179.99, 180.01, 180.01, 179.99]);
        expect(feature.geometry).toEqual({type: 'Polygon', coordinates: [[[179.99, 10], [-179.99, 10], [-179.99, 10.01], [179.99, 10]]]});
    });
});
