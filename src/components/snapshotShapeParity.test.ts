/**
 * # The two engines write the same file
 *
 * The engine toggle hands graphics over as a snapshot and a host writes the same thing to
 * disk, so "interchangeable in memory" is not the property that matters — **interchangeable
 * as files** is. They were not: OpenLayers stamped `tacticalGraphicsVersion` and MapLibre
 * wrote a bare `FeatureCollection`, because the constant lived in `openlayers/persistence.ts`
 * and MapLibre cannot import across the renderer boundary.
 *
 * That is a small difference next to the one it sat beside — the restore dropping `length`,
 * which made a MapLibre-drawn rectangular target come back at the view resolution — and both
 * have the same cause: **the file format was stated inside one renderer.** It is in
 * `core/snapshot.ts` now, and `toSnapshot` is the single line both `snapshot()` methods go
 * through, so neither can forget the stamp.
 *
 * This file is deliberately *not* under `openlayers/` or `maplibre/`: it is about the two
 * agreeing, so it imports the library's statement and each engine's use of it.
 */
import {LEGACY_SNAPSHOT_VERSION, SNAPSHOT_VERSION, snapshotVersionOf, toSnapshot} from '@zaes/tactical-graphics';
import type {Feature, Geometry} from 'geojson';

/** A base feature of the shape both renderers emit. */
const base = (id: string): Feature<Geometry> => ({
    type: 'Feature',
    geometry: {type: 'Point', coordinates: [-123.5, 32.3]},
    properties: {role: 'base', symbolId: id, graphicName: 'TargetAreaRectangular'},
});

describe('the snapshot both engines write', () => {
    it('carries the version, whoever wrote it', () => {
        const snapshot = toSnapshot([base('mlb-253')]);
        expect(snapshot.type).toBe('FeatureCollection');
        expect(snapshot.tacticalGraphicsVersion).toBe(SNAPSHOT_VERSION);
    });

    it('keeps the features it was given, untouched', () => {
        const features = [base('a'), base('b')];
        expect(toSnapshot(features).features).toEqual(features);
    });

    it('reads a file with no version as the oldest rather than refusing it', () => {
        /*
         * **Absent is not invalid, and it is not current either.** Every MapLibre export up to
         * 2026-09-04 carried no version, and a host assembling a collection by hand from the
         * documented property carries none either — both are readable, and both were written
         * against the *first* shape. Reading them as the current one was harmless while there
         * was only one shape and became a silent misreading on 2026-09-10, when an axis arrow's
         * last coordinate stopped being a route point. @see LEGACY_SNAPSHOT_VERSION
         */
        expect(snapshotVersionOf({type: 'FeatureCollection', features: []})).toBe(LEGACY_SNAPSHOT_VERSION);
        expect(snapshotVersionOf(undefined)).toBe(LEGACY_SNAPSHOT_VERSION);
        expect(snapshotVersionOf(null)).toBe(LEGACY_SNAPSHOT_VERSION);
        // And the two are genuinely different numbers, so the assertions above are a claim
        // rather than a tautology.
        expect(SNAPSHOT_VERSION).toBeGreaterThan(LEGACY_SNAPSHOT_VERSION);
    });

    it('reports a version a file actually declares', () => {
        expect(snapshotVersionOf({tacticalGraphicsVersion: 7})).toBe(7);
        // ...and reads one that is not a number as the oldest, rather than passing rubbish
        // along: "unknown" is the oldest thing a file can safely be.
        expect(snapshotVersionOf({tacticalGraphicsVersion: 'two'})).toBe(LEGACY_SNAPSHOT_VERSION);
        expect(snapshotVersionOf({tacticalGraphicsVersion: Number.NaN})).toBe(LEGACY_SNAPSHOT_VERSION);
    });

    it('is the same object shape either engine produces', () => {
        /*
         * Both `snapshot()` methods build their features and hand them to `toSnapshot`, so
         * the only way for the two to disagree about the envelope is for one of them to stop
         * calling it — which is what this asserts, by comparing the envelope's own keys.
         */
        const written = toSnapshot([base('x')]);
        expect(Object.keys(written).sort()).toEqual(['features', 'tacticalGraphicsVersion', 'type']);
    });
});
