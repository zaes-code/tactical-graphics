/**
 * # The selection box on a turned camera
 *
 * The box used to be two projected corners of the graphic's bounds. Flat and north-up that
 * is the whole box; once the demo's 3D view turns the camera, the bounds land on screen as
 * a rotated quadrilateral and two of its corners span only part of it. The dashed box and
 * its buttons then sat across the middle of the symbol instead of around it.
 */

import type {Position} from 'geojson';
import {TacticalGraphicName, normalizeDrawnBase} from '@zaes/tactical-graphics';
import {MapLibreInteractions} from './MapLibreInteractions';
import {buildTacticalGraphic, type MapLibreTacticalGraphic} from '../maplibreAdapter';

const RES = 1200;
const PX_PER_DEGREE = 10;

/** A camera turned by `bearingDeg`: lon/lat in degrees, rotated about the origin, y down. */
function turnedMap(bearingDeg: number) {
    const a = (bearingDeg * Math.PI) / 180;
    return {
        on: () => {},
        off: () => {},
        getZoom: () => Math.log2(40075016.68557849 / (512 * RES)),
        project: ([lng, lat]: [number, number]) => {
            const x = lng * PX_PER_DEGREE;
            const y = -lat * PX_PER_DEGREE;
            return {x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a)};
        },
        unproject: () => ({lng: 0, lat: 0}),
        getCanvasContainer: () => ({getBoundingClientRect: () => ({left: 0, top: 0})}),
        getCanvas: () => ({style: {}}),
        dragPan: {enable() {}, disable() {}, isEnabled: () => true},
    };
}

function phaseLine(): MapLibreTacticalGraphic {
    const coords = normalizeDrawnBase(TacticalGraphicName.PhaseLine, [[0, 0], [4, 2]] as Position[], RES) as Position[];
    return buildTacticalGraphic(TacticalGraphicName.PhaseLine, {type: 'LineString', coordinates: coords}, {rotation: 0}, RES)!;
}

function boxOn(bearingDeg: number) {
    const graphic = phaseLine();
    const renderer = {selection: graphic.id, find: () => graphic};
    const map = turnedMap(bearingDeg);
    const box = new MapLibreInteractions(map as never, renderer as never).selectionBox()!;
    const ends = (graphic.base.geometry as {coordinates: Position[]}).coordinates.map(p => map.project(p as [number, number]));
    return {box, ends};
}

describe('the selection box', () => {
    it('still encloses both ends of the line when the camera is turned', () => {
        const {box, ends} = boxOn(-45);
        for (const end of ends) {
            expect(end.x).toBeGreaterThanOrEqual(box.x - 1e-6);
            expect(end.x).toBeLessThanOrEqual(box.x + box.width + 1e-6);
            expect(end.y).toBeGreaterThanOrEqual(box.y - 1e-6);
            expect(end.y).toBeLessThanOrEqual(box.y + box.height + 1e-6);
        }
    });

    it('is unchanged on a flat, north-up camera', () => {
        const {box, ends} = boxOn(0);
        // The line runs corner to corner of its own bounds, so north-up the box is exactly it.
        expect(box.x).toBeCloseTo(Math.min(ends[0].x, ends[1].x), 0);
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
    });
});
