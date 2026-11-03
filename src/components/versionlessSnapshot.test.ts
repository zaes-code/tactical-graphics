/**
 * # A file with no version, and a file from before version 3
 *
 * A collection that states no `tacticalGraphicsVersion` is read as version 1. Until
 * 2026-10-31 that was applied blindly, so an axis arrow that already carried its width point
 * was given a second one: the QA pass that day found all eleven axis arrows drawn broken on
 * every engine from such a file, and moving 40 to 80 m on each import and export after it.
 * Each base's geometry now says which shape it is. @see upgradeSavedLine
 *
 * And version 3 put the four direction-of-attack arrows' arrowhead at point 1, as APP-06
 * 140601, 140602, 140603 and 140605 letter it, so a version 2 file is reversed on read.
 */
import VectorSource from 'ol/source/Vector';
import {LineString} from 'ol/geom';
import {toLonLat} from 'ol/proj';
import type {Feature as GeoJSONFeature, FeatureCollection, Position} from 'geojson';
import {
    axisBaseFromDraw,
    carriesWidthPointInBase,
    endsInWidthPoint,
    listTacticalGraphicNames,
    restoreSnapshotGraphics,
    SNAPSHOT_VERSION,
    TacticalGraphicName,
    TIP_FIRST_SINCE_SNAPSHOT_3,
    toSnapshot,
} from '@zaes/tactical-graphics';
import type {TacticalGraphicHandler} from './openlayers/openlayersAdapter';
import type {TacticalGraphicsManager} from './openlayers/TacticalGraphicsManager';
import {restoreTacticalGraphics, serializeTacticalGraphics} from './openlayers/persistence';

// The sample sheet's scale, which is where the QA pass saw it: at a small resolution the
// invented second width point happened to settle onto the first and hid the defect.
const RES = 2000;
const AXES = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(n => carriesWidthPointInBase(n));
/** Tip first, as every axis arrow stores it: a bent route of three clicks. */
const CLICKS: Position[] = [[-7.4, -21.0], [-10.0, -20.35], [-12.6, -21.0]];
const HALF_WIDTH = 50_000;

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

const collection = (name: string, coordinates: Position[], version?: number, bag: object = {}): FeatureCollection => ({
    type: 'FeatureCollection',
    ...(version === undefined ? {} : {tacticalGraphicsVersion: version}),
    features: [{type: 'Feature', geometry: {type: 'LineString', coordinates}, properties: {tacticalGraphic: {name, ...bag}}} as GeoJSONFeature],
});

const coreBase = (fc: FeatureCollection): Position[] =>
    (restoreSnapshotGraphics(fc, RES)[0].graphic.base.geometry as {coordinates: Position[]}).coordinates;

const olBase = (fc: FeatureCollection): Position[] => {
    const manager = fakeManager();
    const report = restoreTacticalGraphics(manager, fc);
    expect(report.failed).toEqual([]);
    return (manager.graphicControllers[0].graphic.base.getGeometry() as LineString).getCoordinates().map(c => toLonLat(c));
};

const near = (a: Position[], b: Position[], tol = 1e-7) => {
    expect(a.length).toBe(b.length);
    a.forEach((p, i) => {
        expect(Math.abs(p[0] - b[i][0])).toBeLessThan(tol);
        expect(Math.abs(p[1] - b[i][1])).toBeLessThan(tol);
    });
};

describe('a versionless file', () => {
    it('has the eleven axis arrows to check', () => {
        expect(AXES).toHaveLength(11);
    });

    it.each(AXES.map(n => [n]))('keeps %s as it is when the base already ends in its width point', name => {
        const current = axisBaseFromDraw(name, CLICKS, HALF_WIDTH);
        expect(current).toHaveLength(CLICKS.length + 1);
        expect(endsInWidthPoint(name, current)).toBe(true);
        near(coreBase(collection(name, current)), current);
        near(olBase(collection(name, current)), current);
    });

    it.each(AXES.map(n => [n]))('still upgrades a genuine version 1 %s, which has no width point', name => {
        expect(endsInWidthPoint(name, CLICKS)).toBe(false);
        const expected = axisBaseFromDraw(name, CLICKS, HALF_WIDTH);
        // Unversioned and declared version 1 read the same way.
        near(coreBase(collection(name, CLICKS, undefined, {width: HALF_WIDTH * 2})), expected, 1e-6);
        near(coreBase(collection(name, CLICKS, 1, {width: HALF_WIDTH * 2})), expected, 1e-6);
        near(olBase(collection(name, CLICKS, undefined, {width: HALF_WIDTH * 2})), expected, 1e-6);
    });

    it('comes back unchanged however many times it is read and written', () => {
        for (const name of AXES) {
            let fc: FeatureCollection = collection(name, axisBaseFromDraw(name, CLICKS, HALF_WIDTH));
            const first = coreBase(fc);
            for (let hop = 0; hop < 5; hop++) {
                // Through OpenLayers, with the stamp dropped each time, which is the worst case.
                const manager = fakeManager();
                restoreTacticalGraphics(manager, fc);
                const saved = serializeTacticalGraphics(manager);
                expect(saved.tacticalGraphicsVersion).toBe(SNAPSHOT_VERSION);
                fc = {type: 'FeatureCollection', features: saved.features};
            }
            near(coreBase(fc), first, 1e-7);
        }
    });
});

describe('the direction-of-attack arrows across version 3', () => {
    const REAR_FIRST: Position[] = [[-12.6, -21.0], [-7.4, -21.0]];
    const TIP_FIRST = [...REAR_FIRST].reverse();

    it.each(TIP_FIRST_SINCE_SNAPSHOT_3.map(n => [n]))('reverses %s from a version 2 file', name => {
        near(coreBase(collection(name, REAR_FIRST, 2)), TIP_FIRST);
        near(olBase(collection(name, REAR_FIRST, 2)), TIP_FIRST);
    });

    it.each(TIP_FIRST_SINCE_SNAPSHOT_3.map(n => [n]))('keeps %s from a version 3 file', name => {
        near(coreBase(collection(name, TIP_FIRST, 3)), TIP_FIRST);
        near(olBase(collection(name, TIP_FIRST, 3)), TIP_FIRST);
    });

    it.each(TIP_FIRST_SINCE_SNAPSHOT_3.map(n => [n]))('round-trips %s at the current version', name => {
        const once = toSnapshot([{type: 'Feature', geometry: {type: 'LineString', coordinates: coreBase(collection(name, TIP_FIRST, 3))}, properties: {tacticalGraphic: {name}}}]);
        near(coreBase(once), TIP_FIRST);
    });
});
