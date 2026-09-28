/**
 * # A weapon fan's band grip moves its band, whatever else its bag holds
 *
 * The shared editor used to decide "this is a radar search" from whether the bag held a
 * `stopRange`, and the graphic builder had been filling that field in on the weapon fans. A band
 * grip on such a fan then wrote `startRange`/`stopRange`, which the fan never draws from, and the
 * ring stayed where it was. The user found the grips dead on MapLibre and ArcGIS and live on
 * OpenLayers, which decides by name. @see setBandRange
 */
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {setBandRange} from './editGeometry';

const center: [number, number] = [0, 40];
const bands = [{range: 20_000, leftAzimuthDeg: 0, rightAzimuthDeg: 90}, {range: 40_000, leftAzimuthDeg: 0, rightAzimuthDeg: 90}];
// 30 km east of the center, in degrees at 40°N: far enough to move the outer band.
const cursor: [number, number] = [0.6, 40];

function fan(name: TacticalGraphicName, extra: Record<string, unknown> = {}) {
    return {geometry: {type: 'Point' as const, coordinates: center}, properties: {name, radius: 40_000, rangeFan: {bands}, ...extra}} as never;
}

describe('a weapon fan band grip', () => {
    for (const name of [TacticalGraphicName.WeaponSensorRangeFanCircular, TacticalGraphicName.WeaponSensorRangeFanSector]) {
        it(`moves ${name}'s band even when its bag carries a stop range`, () => {
            const out = setBandRange(fan(name, {startRange: 16_000, stopRange: 40_000}), 1, cursor) as {properties: {rangeFan: {bands: {range: number}[]}; stopRange?: number}};
            const outer = out.properties.rangeFan.bands.map(b => b.range).sort((a, b) => a - b)[1];
            expect(outer).not.toBe(40_000);
            expect(out.properties.stopRange).toBe(40_000);
        });
    }

    it('swings a sector edge, and leaves a circular fan alone past its rims', () => {
        // Index 2 on a two-band sector is band 0's left edge: [rim, rim, left0, right0, ...].
        const sector = setBandRange(fan(TacticalGraphicName.WeaponSensorRangeFanSector), 2, [0.3, 40.3]) as {properties: {rangeFan: {bands: {leftAzimuthDeg?: number; range: number}[]}}};
        const inner = sector.properties.rangeFan.bands.find(b => b.range === 20_000)!;
        expect(inner.leftAzimuthDeg).not.toBe(0);
        expect(inner.leftAzimuthDeg).toBeGreaterThan(20);
        expect(inner.leftAzimuthDeg).toBeLessThan(40);

        const circular = fan(TacticalGraphicName.WeaponSensorRangeFanCircular);
        expect(setBandRange(circular, 2, [0.3, 40.3])).toEqual(circular);
    });

    it('measures a ring on the ground, so it lands under the cursor away from the equator', () => {
        // 30 km due north of a fan at 52°N; a projected measure would say about 49 km.
        const high = {geometry: {type: 'Point' as const, coordinates: [0, 52]}, properties: {name: TacticalGraphicName.WeaponSensorRangeFanCircular, radius: 40_000, rangeFan: {bands: [{range: 10_000}, {range: 40_000}]}}} as never;
        const out = setBandRange(high, 0, [0, 52 + 30_000 / 111_195]) as {properties: {rangeFan: {bands: {range: number}[]}}};
        expect(out.properties.rangeFan.bands[0].range).toBeCloseTo(30_000, -2);
    });

    it('still moves 200700 by its named ranges', () => {
        const out = setBandRange(fan(TacticalGraphicName.RadarSearchDoctrine, {startRange: 16_000, stopRange: 40_000, searchAxisAzimuthDeg: 90}), 1, cursor) as {properties: {stopRange: number}};
        expect(out.properties.stopRange).not.toBe(40_000);
    });
});
