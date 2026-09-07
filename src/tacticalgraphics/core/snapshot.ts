import type {Feature, FeatureCollection, Geometry} from 'geojson';

/**
 * # The saved-graphics file format, stated once for every renderer
 *
 * A snapshot is a `FeatureCollection` of **one base feature per graphic**, each carrying the
 * portable description under `properties.tacticalGraphic`. Everything else — the drawn
 * geometry, the decorations, the labels — regenerates from that, which is what makes a saved
 * graphic come back *editable* rather than as a picture of itself.
 *
 * **It lives here rather than in a renderer because it is not a renderer's fact.** The shape
 * of the file is what the two engines hand each other across the toggle and what a host
 * writes to disk; stating it inside `openlayers/persistence.ts` meant MapLibre could not
 * reach it without importing across the renderer boundary, which the build forbids and which
 * would drag `ol` into the MapLibre bundle. So MapLibre wrote a collection with no version
 * stamp at all, and the two engines produced files that were interchangeable in memory and
 * *not* interchangeable on disk. @see ai/conventions.md, "A symbology fact never lives in a
 * holder" — the same argument, one level up
 */

/**
 * Bumped when the snapshot shape changes in a way a reader must notice.
 *
 * Still 1. The 3.0.0 amplifier renames did not bump it: they are handled on read by
 * `applyAmplifierAliases`, which is the cheaper answer for a rename that leaves the
 * *structure* alone. Bump this when the structure itself moves — a second feature per
 * graphic, a different home for the description, a geometry in another projection.
 */
export const SNAPSHOT_VERSION = 1;

/** The property every saved feature carries the portable description under. */
export const SNAPSHOT_PROPERTY = 'tacticalGraphic';

/** A saved-graphics file: base features, plus the version a reader checks. */
export interface TacticalGraphicsSnapshot extends FeatureCollection {
    features: Feature<Geometry>[];
    /**
     * Absent on files written before this was shared between the engines — every MapLibre
     * export up to 2026-09-04. A reader treats a missing version as {@link SNAPSHOT_VERSION}
     * rather than refusing the file. @see snapshotVersionOf
     */
    tacticalGraphicsVersion?: number;
}

/**
 * The version a snapshot declares, defaulting to the current one.
 *
 * **Absent is not invalid.** Two things wrote unversioned collections: MapLibre, until the
 * stamp moved here, and any host that assembled a FeatureCollection by hand from the
 * documented property. Both are readable, and refusing them would break files that are
 * structurally identical to ones this library wrote itself.
 */
export function snapshotVersionOf(snapshot: unknown): number {
    const declared = (snapshot as {tacticalGraphicsVersion?: unknown} | null | undefined)?.tacticalGraphicsVersion;
    return typeof declared === 'number' && Number.isFinite(declared) ? declared : SNAPSHOT_VERSION;
}

/**
 * Wraps base features as a snapshot, with the version on it.
 *
 * The one line both renderers' `snapshot()` goes through, so neither can forget the stamp —
 * which is exactly how they came to disagree.
 */
export function toSnapshot(features: Feature<Geometry>[]): TacticalGraphicsSnapshot {
    return {type: 'FeatureCollection', features, tacticalGraphicsVersion: SNAPSHOT_VERSION};
}
