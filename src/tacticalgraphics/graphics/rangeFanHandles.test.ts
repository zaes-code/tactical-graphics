/**
 * # The sector fan's handles, and what each one means
 *
 * The renderer strips the centre from a generator's handle set and hands the rest to the
 * holder as **a bare index**. There is no marker on a handle saying what it does — the
 * order is the entire interface — so these pin the order rather than the coordinates.
 *
 * That matters more here than anywhere else in the repo: a sector fan publishes three
 * handles per band, and getting the arithmetic wrong does not throw. It drags the wrong
 * band's bearing, or reads a bearing as a range, and the symbol simply becomes something
 * else under the cursor.
 */

import {renderTacticalGraphic} from '../core/render';
import {TacticalGraphicName} from '../core/type';
import {resolveBandAzimuths, resolveBands, resolveCenterAzimuth} from './RangeFan';

const CENTER: [number, number] = [10, 45];

/** Three bands with bearings of their own, as the screenshot that prompted this had. */
const BANDS = [
    {range: 60_000, label: 'MG', leftAzimuthDeg: 20, rightAzimuthDeg: 70},
    {range: 120_000, label: 'ATGM', leftAzimuthDeg: 35, rightAzimuthDeg: 85},
    {range: 180_000, label: 'ARTY', leftAzimuthDeg: 45, rightAzimuthDeg: 100},
];

/**
 * The handle coordinates, through the public entry point rather than the generator.
 *
 * `renderTacticalGraphic` is the path both renderers take, so anything asserted here is
 * asserted about what they are actually handed — including the property-bag mapping, which
 * is where a `bands` array stops being a dialog value and becomes a generator option.
 */
const handlesOf = (name: TacticalGraphicName, opts: {bands?: unknown; centerAzimuthDeg?: number; size?: number}) => {
    const {handles} = renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'Point', coordinates: CENTER},
        properties: {
            tacticalGraphic: {
                name,
                radius: opts.size,
                rangeFan: {bands: opts.bands, centerAzimuthDeg: opts.centerAzimuthDeg},
            },
        },
    } as never);
    return (handles!.geometry as {coordinates: number[][]}).coordinates;
};

/** The compass bearing from the centre to a point, in degrees, wrapped to [0, 360). */
const bearingTo = ([lon, lat]: number[]): number => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLon = toRad(lon - CENTER[0]);
    const y = Math.sin(dLon) * Math.cos(toRad(lat));
    const x = Math.cos(toRad(CENTER[1])) * Math.sin(toRad(lat)) - Math.sin(toRad(CENTER[1])) * Math.cos(toRad(lat)) * Math.cos(dLon);
    return (((Math.atan2(y, x) * 180) / Math.PI) % 360 + 360) % 360;
};

describe('the sector range fan publishes a handle for every number it prints', () => {
    const NAME = TacticalGraphicName.WeaponSensorRangeFanSector;
    const opts = {bands: BANDS, centerAzimuthDeg: 60, size: 180_000};

    it('emits the centre, then a rim per band, then two arc ends per band', () => {
        // 1 + 3 + 6. The count is the contract the holder's index arithmetic rests on.
        expect(handlesOf(NAME, opts)).toHaveLength(1 + BANDS.length + BANDS.length * 2);
    });

    it('puts each band rim on the centre bearing, in sorted band order', () => {
        const [, ...rest] = handlesOf(NAME, opts);
        const rims = rest.slice(0, BANDS.length);
        const centerAz = resolveCenterAzimuth(opts as never);
        for (const rim of rims) expect(bearingTo(rim)).toBeCloseTo(centerAz, 1);
    });

    it('puts each arc end on that band own bearings, left before right', () => {
        const [, ...rest] = handlesOf(NAME, opts);
        const arcEnds = rest.slice(BANDS.length);
        const sorted = resolveBands(opts as never);

        for (let i = 0; i < sorted.length; i++) {
            const {leftAz, rightAz} = resolveBandAzimuths(sorted[i], opts as never);
            // The index the holder computes: `bandCount + 2i` and `+ 1`.
            expect(bearingTo(arcEnds[2 * i])).toBeCloseTo(leftAz, 1);
            expect(bearingTo(arcEnds[2 * i + 1])).toBeCloseTo(rightAz, 1);
        }
    });

    it('gives a band with no stated bearings the ones it is actually drawn with', () => {
        // A fan drawn and never edited still has to be draggable: the wedge is at
        // centre +/- 45, so that is where its arc-end handles belong. Emitting nothing for
        // an unstated band would leave the default wedge with no way to change it.
        const plain = {bands: [{range: 50_000}], centerAzimuthDeg: 90, size: 50_000};
        const [, , left, right] = handlesOf(NAME, plain);
        expect(bearingTo(left)).toBeCloseTo(45, 1);
        expect(bearingTo(right)).toBeCloseTo(135, 1);
    });

    it('keeps the circular fan to one handle per band', () => {
        // It has no wedge and therefore no bearings to drag; the holder tells the two
        // cases apart by counting, so a stray pair here would be read as an azimuth drag.
        const circular = handlesOf(TacticalGraphicName.WeaponSensorRangeFanCircular, opts);
        expect(circular).toHaveLength(1 + BANDS.length);
    });
});
