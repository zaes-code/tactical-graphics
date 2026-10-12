/**
 * The multiple-strike zone through the OpenLayers façade: a file with both rings opens with zone 1
 * as the edited base, and saves with both rings again. The shared-adapter half is
 * `graphics/strikeZoneFiling.test.ts`; MapLibre, Cesium and ArcGIS restore through that adapter.
 */
import Map from 'ol/Map';
import View from 'ol/View';
import {toLonLat} from 'ol/proj';
import type {Feature as GeoFeature, LineString, Position} from 'geojson';
import {filedStrikeBase, TacticalGraphicName, toSnapshot} from '@zaes/tactical-graphics';
import {createTacticalGraphics} from './createTacticalGraphics';

beforeAll(() => {
    if (!('ResizeObserver' in window)) {
        (window as unknown as {ResizeObserver: unknown}).ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    }
});

const N = TacticalGraphicName.MinimumSafeDistanceMultipleStrike;
const zone1: Position[] = [[0, 0], [0.4, 0.1], [0.5, -0.3], [0.2, -0.45], [-0.1, -0.2]];
const width = 5000;
const feature = (coordinates: Position[]): GeoFeature<LineString> => ({
    type: 'Feature',
    geometry: {type: 'LineString', coordinates},
    properties: {role: 'base', symbolId: 'z', graphicName: N, tacticalGraphic: {name: N, width}},
});

const close = (a: Position[], b: Position[]) => a.length === b.length && a.every((p, i) => Math.abs(p[0] - b[i][0]) < 1e-7 && Math.abs(p[1] - b[i][1]) < 1e-7);

it('opens both rings as zone 1 and saves both rings again', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const map = new Map({target, view: new View({center: [0, 0], zoom: 6})});
    const engine = createTacticalGraphics(map);
    engine.restore(toSnapshot([feature(zone1)]));

    const held = map.getLayers().getArray().flatMap(layer =>
        (layer as unknown as {getSource?: () => {getFeatures?: () => {get(k: string): unknown; getGeometry(): unknown}[]} | null}).getSource?.()?.getFeatures?.() ?? [],
    ).find(f => f.get('role') === 'base' && f.get('symbolId') === 'z');
    const edited = ((held!.getGeometry() as {getCoordinates(): number[][]}).getCoordinates()).map(c => toLonLat(c));
    expect(close(edited, zone1)).toBe(true);

    const [saved] = engine.snapshot().features;
    expect(close((saved.geometry as LineString).coordinates, filedStrikeBase(zone1, width))).toBe(true);
    engine.destroy();
});
