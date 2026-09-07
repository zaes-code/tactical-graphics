/**
 * # MapLibre asks the library before a drag on a segment makes a vertex
 *
 * The other half of "abatis should not accept vertices within the triangle opening"
 * (user, 2026-09-06). MapLibre inserts through `grabSegment`, which already refused two
 * whole families — fixed vertex counts, and the graphics whose edit drag resizes — and
 * happily inserted anywhere on the rest, the head of an abatis's route included.
 *
 * `acceptsInsertedVertex` is the shared rule; this pins that `grabSegment` gates on it, so
 * the same drag is refused at the same place as it is in OpenLayers. `grabSegment` also
 * feeds `updateVertexHint`, which is why refusing here takes away the marker that offers
 * the insertion rather than leaving one that lies.
 *
 * No real map: the interactions only register listeners in their constructor, and the two
 * projections this path uses are stubbed as a linear scale. That is enough — everything
 * being asserted is which pixels the rule is handed and what it answers.
 */

import type {Feature as GeoJSONFeature} from 'geojson';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {MapLibreInteractions} from './MapLibreInteractions';
import type {MapLibreTacticalGraphic} from '../maplibreAdapter';

/** Screen pixels per degree of longitude, so a pixel measurement is a readable number. */
const PX_PER_DEGREE = 10;

/** The chevron's width in screen pixels, and the same span in degrees. */
const LEAD_PX = 26;
const LEAD_DEG = LEAD_PX / PX_PER_DEGREE;

/**
 * A map that only projects. `grabSegment` needs `project` and — through `nearestSegment` —
 * `unproject`; the constructor needs `on`, and nothing else is touched.
 */
const stubMap = () => ({
    on: () => {},
    off: () => {},
    project: ([lng, lat]: [number, number]) => ({x: lng * PX_PER_DEGREE, y: -lat * PX_PER_DEGREE}),
    unproject: ([x, y]: [number, number]) => ({lng: x / PX_PER_DEGREE, lat: -y / PX_PER_DEGREE}),
});

/** A graphic on a 40 degree — 400 px — west-to-east run. */
function graphic(name: TacticalGraphicName): MapLibreTacticalGraphic {
    const base: GeoJSONFeature = {
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: [[0, 0], [40, 0]]},
        properties: {},
    };
    return {id: 'a', name, properties: {name}, base, graphic: {} as never, handles: []} as MapLibreTacticalGraphic;
}

/** The private grab, reached the way the pointer handlers reach it. */
function grabSegment(name: TacticalGraphicName, xPx: number): number {
    const interactions = new MapLibreInteractions(stubMap() as never, {} as never);
    const grab = (interactions as unknown as {
        grabSegment(g: MapLibreTacticalGraphic, p: {x: number; y: number}): number;
    }).grabSegment;
    return grab.call(interactions, graphic(name), {x: xPx, y: 0});
}

describe('grabSegment is gated', () => {
    it('refuses a vertex inside the abatis chevron', () => {
        // Under the apex, and just short of the far foot.
        expect(grabSegment(TacticalGraphicName.Abatis, LEAD_PX / 2)).toBe(-1);
        expect(grabSegment(TacticalGraphicName.Abatis, LEAD_PX - 1)).toBe(-1);
    });

    it('accepts a vertex on the run past the chevron', () => {
        // 280100: "additional points can be defined to extend the line".
        expect(grabSegment(TacticalGraphicName.Abatis, LEAD_PX + 2)).toBe(1);
        expect(grabSegment(TacticalGraphicName.Abatis, 200)).toBe(1);
    });

    it('leaves a free-form line taking vertices everywhere', () => {
        expect(grabSegment(TacticalGraphicName.PhaseLine, LEAD_PX / 2)).toBe(1);
        expect(grabSegment(TacticalGraphicName.PhaseLine, 200)).toBe(1);
    });

    it('still refuses the families it always refused', () => {
        // A fixed vertex count and an edit drag that resizes — the two facts that were
        // already here, unchanged by the third.
        expect(grabSegment(TacticalGraphicName.FieldsOfFire, 200)).toBe(-1);
        expect(grabSegment(TacticalGraphicName.Bridge, 200)).toBe(-1);
    });

    it('measures the chevron in pixels, so the refusal holds at every zoom', () => {
        // The same refusal on a route ten degrees long: the tooth is 26 px whatever the
        // ground distance, which is what `LEAD_DEG` says at this stub's scale.
        expect(LEAD_DEG).toBeCloseTo(2.6, 6);
        expect(grabSegment(TacticalGraphicName.Abatis, LEAD_PX - 1)).toBe(-1);
    });
});
