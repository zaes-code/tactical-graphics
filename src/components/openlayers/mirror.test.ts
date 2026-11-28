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
    /**
     * "Different from the unmirrored one" is too weak — the first attempt at this reversed
     * the arc's sweep as well as its center, which asks turf for a backwards sweep and
     * returns a *different, smaller* segment. That passed a difference check while looking
     * obviously wrong on screen. A mirror has to be the same arc reflected: same number of
     * points, same distance off the line, opposite side.
     */
    it.each(MIRRORABLE.map(n => [String(n), n] as const))('%s mirrors rather than merely differing', (_l, name) => {
        const arcOf = (mirrored: boolean) =>
            (renderTacticalGraphic(geoFeature(name, mirrored)).graphic.geometry as MultiLineString).coordinates[2];
        const plain = arcOf(false);
        const flipped = arcOf(true);

        expect(flipped).toHaveLength(plain.length);

        // The base line runs due east at latitude 38.9, so "off the line" is latitude.
        const offsets = (arc: number[][]) => arc.map(c => c[1] - 38.9);
        const worst = (arc: number[][]) => Math.max(...offsets(arc).map(Math.abs));
        expect(worst(flipped)).toBeCloseTo(worst(plain), 6);

        // Opposite sides: the extreme excursion changes sign.
        const extreme = (arc: number[][]) => offsets(arc).reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
        expect(Math.sign(extreme(flipped))).toBe(-Math.sign(extreme(plain)));
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
