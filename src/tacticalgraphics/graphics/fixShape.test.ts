/**
 * # Fix and the tactical fix, against their plates
 *
 * APP-06 270503 / 341100 and MIL-STD-2525E Tables L-XVI and L-XXI draw the zigzag dipping,
 * peaking and dipping again, so it starts and ends on the same side, and stroke the head
 * open. FM 1-02.2 alone fills it.
 */
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {renderTacticalGraphic} from '../core/render';
import {getPaintFunction} from '../symbology/registry';

const toMercator = ([lon, lat]: number[]): ProjectedPosition => [
    (lon * Math.PI * 6378137) / 180,
    Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 6378137,
];

/**
 * A fix pointing east at a decoration size of `step` meters. Both are tip-first, so the
 * stored line starts at the arrowhead. @see TIP_FIRST_GRAPHICS
 */
function rendered(name: TacticalGraphicName, lengthDeg: number, step: number) {
    return renderTacticalGraphic(
        {
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: [[lengthDeg, 0], [0, 0]]},
            properties: {tacticalGraphic: {name}},
        } as never,
        {size: step} as never,
    );
}

describe('the fix zigzag', () => {
    for (const name of [TacticalGraphicName.Fix, TacticalGraphicName.TacticalFix]) {
        it(`${name}: dips first, ends on a dip, with an odd number of apexes at every length`, () => {
            for (const lengthDeg of [0.05, 0.08, 0.1, 0.13, 0.2]) {
                const {graphic} = rendered(name, lengthDeg, 1000);
                const line = (graphic.geometry as {geometries: {type: string; coordinates: number[][]}[]}).geometries.find(g => g.type === 'LineString')!;
                const apexes = line.coordinates.filter(([, lat]) => Math.abs(lat) > 1e-6);
                expect(apexes.length % 2).toBe(1);
                expect(apexes.length).toBeGreaterThanOrEqual(3);
                // The run goes east, so the right of travel is south.
                expect(apexes[0][1]).toBeLessThan(0);
                expect(apexes[apexes.length - 1][1]).toBeLessThan(0);
            }
        });
    }
});

describe('the fix head', () => {
    const context: PaintContext = {resolution: 10, measureText: text => text.length * 10};
    const painted = (name: TacticalGraphicName): Paint[] => {
        const {graphic} = rendered(name, 0.1, 1000);
        const geometries = (graphic.geometry as {geometries: {type: string; coordinates: unknown}[]}).geometries;
        const project = (g: {type: string; coordinates: unknown}) =>
            g.type === 'Polygon'
                ? {type: 'Polygon', coordinates: (g.coordinates as number[][][]).map(r => r.map(toMercator))}
                : {type: 'LineString', coordinates: (g.coordinates as number[][]).map(toMercator)};
        const feature = {
            geometry: {type: 'GeometryCollection', geometries: geometries.map(project)},
            properties: {name},
        } as unknown as PaintFeature;
        return getPaintFunction(name)!.graphic(feature, context);
    };

    it.each([TacticalGraphicName.Fix, TacticalGraphicName.TacticalFix])('%s strokes the head open, filling nothing', name => {
        const paints = painted(name);
        expect(paints.filter(p => p.fill)).toEqual([]);
        // The zigzag and the two barbs.
        expect(paints.filter(p => p.stroke && p.geometry.type === 'LineString')).toHaveLength(2);
    });

    it('leaves the ferry crossing its solid head', () => {
        const feature = {
            geometry: {
                type: 'GeometryCollection',
                geometries: [
                    {type: 'LineString', coordinates: [[0, 0], [10000, 0]]},
                    {type: 'Polygon', coordinates: [[[10000, 0], [9000, 500], [9000, -500], [10000, 0]]]},
                ],
            },
            properties: {name: TacticalGraphicName.FerryCrossing},
        } as unknown as PaintFeature;
        expect(getPaintFunction(TacticalGraphicName.FerryCrossing)!.graphic(feature, context).filter(p => p.fill)).toHaveLength(1);
    });
});
