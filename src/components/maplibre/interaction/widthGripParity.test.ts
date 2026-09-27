/**
 * # A width grip behaves as OpenLayers' does
 *
 * Found by dragging every grip of every graphic on both engines (2026-09-26). The width moved
 * to the cursor rather than by the drag, so it jumped on the grab; a grip drawn on the negative
 * side flipped the graphic the moment it was held; and the rectangular-target family had no
 * width grip here at all. @see setOffset, setOffsetFromPoint, handleRole
 */
import {TacticalGraphicName, handleRole} from '@zaes/tactical-graphics';
import {setOffset} from './editGeometry';

const LINE = {type: 'LineString' as const, coordinates: [[0, 0], [1, 0]]};
const corridor = (width: number) => ({geometry: LINE, properties: {name: TacticalGraphicName.AirCorridor, width}}) as never;

describe('a width drag', () => {
    it('changes the width by how far the cursor moved across the line, not to where it is', () => {
        // Grabbed 0.2 degrees off the line, dragged to 0.25: the width grows by a 0.05-degree
        // step's worth, whatever the grab distance said about the width.
        const out = setOffset(corridor(50_000), [0.5, 0.25], {resolution: 1, offsetScale: 1, grab: [0.5, 0.2]}) as {properties: {width: number}};
        const step = 0.05 * 111_320 * 2;
        expect(out.properties.width).toBeGreaterThan(50_000 + step * 0.9);
        expect(out.properties.width).toBeLessThan(50_000 + step * 1.1);
    });

    it('does not flip a graphic grabbed on its negative side until the cursor crosses', () => {
        const held = setOffset(corridor(50_000), [0.5, -0.25], {resolution: 1, offsetScale: 1, grab: [0.5, -0.2]}) as {properties: {mirrored?: boolean}};
        expect(held.properties.mirrored).toBeUndefined();
        const crossed = setOffset(corridor(50_000), [0.5, 0.25], {resolution: 1, offsetScale: 1, grab: [0.5, -0.2]}) as {properties: {mirrored?: boolean}};
        expect(crossed.properties.mirrored).toBe(false);
    });
});

describe('the rectangular-target family', () => {
    const family = [
        TacticalGraphicName.TargetAreaRectangular,
        TacticalGraphicName.LaunchAreaEllipse,
        TacticalGraphicName.DefendedAreaEllipse,
        TacticalGraphicName.ShipAreaOfInterestEllipse,
        TacticalGraphicName.CuedAcquisitionDoctrine,
    ];

    it('publishes a length grip, then a width grip', () => {
        for (const name of family) {
            expect(handleRole(name, 0)).toBe('shape');
            expect(handleRole(name, 1)).toBe('offset');
        }
    });

    it('sets the width across the attitude from the anchor point', () => {
        // Rotation 0 is east, so "across" is north: 0.1 degrees north is about 11.1 km, a width of 22.2.
        const out = setOffset(
            {geometry: {type: 'Point', coordinates: [0, 0]}, properties: {name: TacticalGraphicName.CuedAcquisitionDoctrine, rotation: 0, radius: 50_000}} as never,
            [0.3, 0.1],
            {resolution: 1},
        ) as {properties: {width: number}};
        expect(out.properties.width).toBeCloseTo(22_264, -2);
    });
});
