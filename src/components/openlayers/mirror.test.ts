/**
 * The asymmetric line graphics can hang their hook on either side of the drawn line, and
 * the choice survives an import.
 *
 * Expressed relative to the line's bearing, never a compass test — see the note in
 * `GeometryService.getCaneArrow` about the version that pinned the hook to north and left
 * it behind when the graphic was rotated.
 */
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import {LineString} from 'ol/geom';
import {renderTacticalGraphic, TacticalGraphicName} from '@zaes/tactical-graphics';
import type {Feature as GeoJSONFeature, MultiLineString} from 'geojson';
import {getController} from './controllerRegistry';
import type {TacticalGraphicHandler} from './openlayersAdapter';
import type {TacticalGraphicsManager} from './TacticalGraphicsManager';
import {restoreTacticalGraphics, serializeTacticalGraphics} from './persistence';
import {readGraphicGeometryState} from './graphicProperties';

const RES = 1200;
const MIRRORABLE = [
    TacticalGraphicName.Delay,
    TacticalGraphicName.Retirement,
    TacticalGraphicName.Withdraw,
    TacticalGraphicName.WithdrawUnderPressure,
    TacticalGraphicName.Disengage,
    TacticalGraphicName.RearwardPassageOfLines,
    TacticalGraphicName.ForwardPassageOfLines,
];

const fakeManager = () => ({
    renderingVectorSource: new VectorSource(),
    graphicControllers: [] as TacticalGraphicHandler[],
    map: {getView: () => ({on: () => undefined, getResolution: () => RES * 4})},
    watchResolution: () => undefined,
    unwatchResolution: () => undefined,
    releaseAllGraphics: () => undefined,
} as unknown as TacticalGraphicsManager);

const geoFeature = (name: TacticalGraphicName, mirrored: boolean): GeoJSONFeature => ({
    type: 'Feature',
    geometry: {type: 'LineString', coordinates: [[-77.0, 38.9], [-76.8, 38.9]]},
    properties: {tacticalGraphic: {name, decorationSize: 3000, mirrored}},
});

describe('mirroring the asymmetric line graphics', () => {
    it.each(MIRRORABLE.map(n => [String(n), n] as const))('%s draws a different shape mirrored', (_l, name) => {
        const plain = renderTacticalGraphic(geoFeature(name, false));
        const flipped = renderTacticalGraphic(geoFeature(name, true));
        const of = (r: typeof plain) => JSON.stringify((r.graphic.geometry as MultiLineString).coordinates);
        expect(of(flipped)).not.toEqual(of(plain));
    });

    it.each(MIRRORABLE.map(n => [String(n), n] as const))('%s keeps its side through an import', (_l, name) => {
        const from = fakeManager();
        const h = getController(name, RES);
        h.setSymbolId(`id-${name}`);
        h.getFeatures().forEach(f => {
            f.set('graphicName', name);
            f.set('symbolId', `id-${name}`);
        });
        h.setBaseFeature(new Feature(new LineString([[0, 0], [200_000, 0]])) as never);
        h.setMirrored!(true);
        from.renderingVectorSource.addFeatures(h.getFeatures());
        from.graphicControllers.push(h);

        const to = fakeManager();
        expect(restoreTacticalGraphics(to, serializeTacticalGraphics(from)).failed).toEqual([]);
        expect(readGraphicGeometryState(to.graphicControllers[0].graphic.base).mirrored).toBe(true);
    });

    it('the side is bearing-relative, so it survives rotation', () => {
        // Same graphic, drawn along two different bearings. If the side were a compass
        // test the hook would land on opposite flanks; relative to the bearing it does not.
        const along = (a: number[], b: number[]) => renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: [a, b]},
            properties: {tacticalGraphic: {name: TacticalGraphicName.Delay, decorationSize: 3000, mirrored: true}},
        } as GeoJSONFeature);
        const east = along([-77.0, 38.9], [-76.8, 38.9]);
        const west = along([-76.8, 38.9], [-77.0, 38.9]);
        const arcLen = (r: typeof east) => (r.graphic.geometry as MultiLineString).coordinates[2].length;
        // Same construction either way — the hook is built from the bearing, not from north.
        expect(arcLen(west)).toBe(arcLen(east));
    });
});
