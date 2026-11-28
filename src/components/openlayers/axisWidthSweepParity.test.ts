/**
 * # The sample sweep has to be one sheet, not two
 *
 * OpenLayers draws the sweep by **restoring** the collection MapLibre's gallery builds, so the
 * two engines are identical by construction rather than by imitation. Two things in that path
 * took the eleven axis arrows apart, and both are about a base that already states its width.
 *
 * 1. **The collection declared no version**, and a reader that cannot see a version reads the
 *    oldest shape. Its bases are current — every one goes through `normalizeDrawnBase` — so a
 *    version 1 reading spent `upgradeAxisBase` on a base that already carried its width point
 *    and appended a second one. Measured on the running app: **5 coordinates on this engine
 *    against 4 on MapLibre**, from one function.
 * 2. **The restore replayed a scalar through `setOffset`**, which for these eleven moves the
 *    stored point. The sheet's records carry a `decorationSize`, so the width point was
 *    republished from a decoration's size: 195,397 m spent as a half-width where the base said
 *    4,684, putting it about 300 km from where MapLibre — which rebuilds from the geometry and
 *    reads the width off it — put the same graphic's.
 *
 * Neither was visible to the round-trip suite, because a snapshot this engine writes for one
 * of these carries no width and no decoration size, so there was nothing to replay.
 * @see sampleFeatureCollection, applyRestoredGeometry, upgradeAxisBase
 */
import VectorSource from 'ol/source/Vector';
import {LineString} from 'ol/geom';
import {toLonLat} from 'ol/proj';
import type {Feature as GeoFeature, Position} from 'geojson';
import {
    SNAPSHOT_VERSION,
    TACTICAL_GRAPHIC_KEY,
    TacticalGraphicName,
    axisOf,
    carriesWidthPointInBase,
    halfWidthFromBase,
    listTacticalGraphicNames,
    snapshotVersionOf,
} from '@zaes/tactical-graphics';
import {sampleFeatureCollection} from '../maplibre/sampleGallery';
import type {TacticalGraphicHandler} from './openlayersAdapter';
import type {TacticalGraphicsManager} from './TacticalGraphicsManager';
import {restoreTacticalGraphics} from './persistence';

const FAMILY = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(carriesWidthPointInBase);
const RES = 1200;

/** A manager stand-in: a source, a controller list and a view to subscribe to. */
function fakeManager() {
    return {
        renderingVectorSource: new VectorSource(),
        graphicControllers: [] as TacticalGraphicHandler[],
        map: {getView: () => ({on: () => undefined, getResolution: () => RES})},
        watchResolution: () => undefined,
        unwatchResolution: () => undefined,
        releaseAllGraphics: () => undefined,
        setSelection: () => undefined,
    } as unknown as TacticalGraphicsManager;
}

/** The sheet's own record for one graphic. */
const sampleFeature = (name: TacticalGraphicName): GeoFeature => {
    const found = sampleFeatureCollection(undefined, [name]).features[0];
    expect(found).toBeDefined();
    return found as GeoFeature;
};

/** The base a restored holder is left holding, in degrees. */
function restoredBase(feature: GeoFeature): Position[] {
    const manager = fakeManager();
    const report = restoreTacticalGraphics(manager, {type: 'FeatureCollection', features: [feature], ...snapshotStamp()});
    expect(report.failed).toEqual([]);
    const geometry = manager.graphicControllers[0].graphic.base.getGeometry() as LineString;
    return geometry.getCoordinates().map(c => toLonLat(c)) as Position[];
}

/** The version the sheet declares, carried onto a one-feature collection built from it. */
const snapshotStamp = () => ({tacticalGraphicsVersion: snapshotVersionOf(sampleFeatureCollection(undefined, []))});

describe('the sample sheet reaches OpenLayers as the version it is', () => {
    it('declares the current snapshot version', () => {
        // Without this the whole sheet reads as version 1, which is a different shape.
        expect(snapshotVersionOf(sampleFeatureCollection(undefined, []))).toBe(SNAPSHOT_VERSION);
    });

    it.each(FAMILY.map(n => [String(n), n] as const))('%s is laid out with its width point already on it', (_label, name) => {
        const geometry = sampleFeature(name).geometry;
        expect(geometry.type).toBe('LineString');
        const coords = (geometry as {coordinates: Position[]}).coordinates;
        // Three or more: the axis the sheet lays out, plus the width. An upgrade run over
        // this would append a second one.
        expect(coords.length).toBeGreaterThanOrEqual(3);
        expect(halfWidthFromBase(name, coords)).toBeGreaterThan(0);
    });
});

describe('restoring an axis arrow leaves its width point alone', () => {
    it.each(FAMILY.map(n => [String(n), n] as const))('%s comes back on the same coordinates', (_label, name) => {
        const feature = sampleFeature(name);
        const saved = (feature.geometry as {coordinates: Position[]}).coordinates;

        const restored = restoredBase(feature);

        expect(restored).toHaveLength(saved.length);
        restored.forEach((point, i) => {
            expect(point[0]).toBeCloseTo(saved[i][0], 6);
            expect(point[1]).toBeCloseTo(saved[i][1], 6);
        });
    });

    /**
     * The sheet's records carry a size beside the geometry — a `decorationSize` when the app
     * builds them at a zoom, the sample `radius` otherwise — and that is the number the restore
     * used to spend as a half-width. Stated as its own case so a failure says which of the two
     * defects came back.
     */
    it.each(FAMILY.map(n => [String(n), n] as const))('%s keeps the width its base states, not the bag’s', (_label, name) => {
        const feature = sampleFeature(name);
        const saved = (feature.geometry as {coordinates: Position[]}).coordinates;
        const bag = (feature.properties?.[TACTICAL_GRAPHIC_KEY] ?? {}) as Record<string, unknown>;
        // The premise: there is a number in the bag big enough to notice if it is spent.
        const spendable = (bag.decorationSize ?? bag.radius) as number | undefined;
        expect(spendable).toBeGreaterThan(0);

        const stated = halfWidthFromBase(name, restoredBase(feature));
        expect(stated).toBeCloseTo(halfWidthFromBase(name, saved)!, 3);
        expect(stated).not.toBeCloseTo(spendable!, 0);
    });

    it.each(FAMILY.map(n => [String(n), n] as const))('%s keeps every axis point too', (_label, name) => {
        const feature = sampleFeature(name);
        const saved = axisOf(name, (feature.geometry as {coordinates: Position[]}).coordinates);
        const restored = axisOf(name, restoredBase(feature));
        expect(restored).toHaveLength(saved.length);
    });
});
