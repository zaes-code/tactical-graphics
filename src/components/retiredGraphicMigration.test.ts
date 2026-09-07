/**
 * # A file naming a retired graphic still opens
 *
 * `FightingPosition` was removed in this release. FM 1-02.2 table 5-22 and APP-06 291000 draw
 * the *same* open three-sided bracket — flat front edge, two legs, beside the same trench line
 * and with the same note about facing the enemy — so two identical pictures with two captions
 * were one control measure. `FortifiedPosition` survived because its draw model is the one
 * 291000's plate specifies, and it is displayed under both names.
 *
 * Nothing about that helps a **saved file**. The two drew from different point models: the
 * retired graphic was dropped on a point and locked at 2:1 — a centre, a `radius` and a
 * `rotation` — where the survivor's base is the two front corners. So a rename alone leaves a
 * Point base on a graphic that wants a LineString, and the record has to be rewritten.
 *
 * Both engines apply the same migration, from one statement in the library, because a file
 * that opens on one renderer and not the other is the shape of defect this repository keeps
 * finding. @see migrateRetiredGraphic
 */
import VectorSource from 'ol/source/Vector';
import type {Feature as GeoJSONFeature, FeatureCollection, Position} from 'geojson';
import {migrateRetiredGraphic, TacticalGraphicName, type TacticalGraphicProperties} from '@zaes/tactical-graphics';
import * as turf from '../tacticalgraphics/core/turf';
import type {TacticalGraphicHandler} from './openlayers/openlayersAdapter';
import type {TacticalGraphicsManager} from './openlayers/TacticalGraphicsManager';
import {restoreTacticalGraphics} from './openlayers/persistence';
import {buildTacticalGraphic} from './maplibre/maplibreAdapter';

const RES = 1200;
const CENTRE: Position = [12, 41];
const RADIUS = 40_000;

/** A 3.4.0 record for the retired graphic: a dropped point, a size and a facing. */
const savedFightingPosition = (rotation = 0): FeatureCollection => ({
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        geometry: {type: 'Point', coordinates: CENTRE},
        properties: {
            symbolId: 'legacy-fp',
            tacticalGraphic: {name: 'FightingPosition', radius: RADIUS, rotation, designation: 'ALPHA'},
        },
    } as GeoJSONFeature],
});

const bagOf = (rotation = 0) =>
    (savedFightingPosition(rotation).features[0].properties as {tacticalGraphic: TacticalGraphicProperties}).tacticalGraphic;

function fakeManager() {
    return {
        renderingVectorSource: new VectorSource(),
        graphicControllers: [] as TacticalGraphicHandler[],
        map: {getView: () => ({on: () => undefined, getResolution: () => RES})},
        watchResolution: () => undefined,
        unwatchResolution: () => undefined,
        releaseAllGraphics: () => undefined,
    } as unknown as TacticalGraphicsManager;
}

describe('a saved FightingPosition', () => {
    it('becomes a FortifiedPosition with a front edge for a base', () => {
        const out = migrateRetiredGraphic(bagOf(), {type: 'Point', coordinates: CENTRE})!;
        expect(out).toBeDefined();
        expect(out.properties.name).toBe(TacticalGraphicName.FortifiedPosition);
        expect(out.geometry.type).toBe('LineString');

        const [left, right] = (out.geometry as {coordinates: Position[]}).coordinates;
        // The front edge spans twice the radius — the retired symbol's own width, since it
        // locked half-width to `radius` and half-height to half of it.
        expect(turf.distance(turf.point(left), turf.point(right), {units: 'meters'})).toBeCloseTo(RADIUS * 2, -2);
        // …and sits half a radius forward of where the centre was.
        const middle = turf.midpoint(turf.point(left), turf.point(right)).geometry.coordinates as Position;
        expect(turf.distance(turf.point(CENTRE), turf.point(middle), {units: 'meters'})).toBeCloseTo(RADIUS / 2, -2);
    });

    it('turns the edge with the saved rotation', () => {
        // A facing of 90 puts the front to the east of the centre, not the north. Without
        // this the migration would open every saved graphic pointing the same way.
        const north = migrateRetiredGraphic(bagOf(0), {type: 'Point', coordinates: CENTRE})!;
        const east = migrateRetiredGraphic(bagOf(90), {type: 'Point', coordinates: CENTRE})!;
        const mid = (out: typeof north) =>
            turf.midpoint(
                turf.point((out.geometry as {coordinates: Position[]}).coordinates[0]),
                turf.point((out.geometry as {coordinates: Position[]}).coordinates[1]),
            ).geometry.coordinates as Position;
        expect(turf.bearing(turf.point(CENTRE), turf.point(mid(north)))).toBeCloseTo(0, 0);
        expect(turf.bearing(turf.point(CENTRE), turf.point(mid(east)))).toBeCloseTo(90, 0);
    });

    it('drops the amplifiers that described the retired box, and keeps the rest', () => {
        const out = migrateRetiredGraphic(bagOf(30), {type: 'Point', coordinates: CENTRE})!;
        // `radius` and `rotation` described a shape that no longer exists; the survivor's is
        // the two points alone, so leaving them would be a stale size in the file.
        expect(out.properties.radius).toBeUndefined();
        expect(out.properties.rotation).toBeUndefined();
        // What the operator typed is theirs and survives.
        expect(out.properties.designation).toBe('ALPHA');
    });

    it('leaves every other graphic alone', () => {
        // One direction, and only for the name that was retired.
        expect(migrateRetiredGraphic(
            {name: TacticalGraphicName.FortifiedPosition} as TacticalGraphicProperties,
            {type: 'LineString', coordinates: [[12, 41], [12.5, 41]]},
        )).toBeUndefined();
        expect(migrateRetiredGraphic(
            {name: TacticalGraphicName.PhaseLine} as TacticalGraphicProperties,
            {type: 'LineString', coordinates: [[12, 41], [12.5, 41]]},
        )).toBeUndefined();
    });

    it('restores on OpenLayers as the survivor', () => {
        const manager = fakeManager();
        const report = restoreTacticalGraphics(manager, savedFightingPosition(45));
        expect(report.failed).toEqual([]);
        expect(report.restored).toBe(1);
        // The identity the file carried is kept, so a host keying by id does not lose it.
        expect(manager.graphicControllers[0].getSymbolId()).toBe('legacy-fp');
    });

    it('opens on MapLibre as the survivor too', () => {
        const migrated = migrateRetiredGraphic(bagOf(45), {type: 'Point', coordinates: CENTRE})!;
        const built = buildTacticalGraphic(migrated.properties.name, migrated.geometry, migrated.properties, RES);
        expect(built).toBeDefined();
        expect(built!.name).toBe(TacticalGraphicName.FortifiedPosition);
        expect(built!.base.geometry.type).toBe('LineString');
    });
});
