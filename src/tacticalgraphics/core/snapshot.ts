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
 * **2 since 2026-09-10**, when the eleven axis arrows stopped filing their width as an
 * amplifier and started storing it as their last coordinate. That is the structure moving:
 * a version 1 base holds a run of route points and a `width` beside it, a version 2 base holds
 * the same run with one more coordinate on the end and no width at all. Both are readable, and
 * `upgradeAxisBase` is where a version 1 one is converted. @see axisWidth.ts
 *
 * The 3.0.0 amplifier renames did not bump it: they are handled on read by
 * `applyAmplifierAliases`, which is the cheaper answer for a rename that leaves the
 * *structure* alone. Bump this when the structure itself moves — a second feature per
 * graphic, a different home for the description, a geometry in another projection.
 */
export const SNAPSHOT_VERSION = 2;

/**
 * The version a file that declares none is read as.
 *
 * **Not {@link SNAPSHOT_VERSION}**, which is what this used to be. Two things wrote unversioned
 * collections and both of them wrote the *oldest* shape: MapLibre, until the stamp moved here on
 * 2026-09-04, and any host that assembled a FeatureCollection by hand from the documented
 * property. Reading those as "current" was harmless while there was only one shape, and became a
 * silent misreading the moment there were two — an axis arrow's route point taken for a width.
 */
export const LEGACY_SNAPSHOT_VERSION = 1;

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
 * The version a snapshot declares, defaulting to the oldest.
 *
 * **Absent is not invalid.** Two things wrote unversioned collections: MapLibre, until the
 * stamp moved here, and any host that assembled a FeatureCollection by hand from the
 * documented property. Both are readable, and refusing them would break files that are
 * structurally identical to ones this library wrote itself. A value that is not a finite
 * number is treated the same way — "unknown" is the oldest thing it can safely be.
 * @see LEGACY_SNAPSHOT_VERSION
 */
export function snapshotVersionOf(snapshot: unknown): number {
    const declared = (snapshot as {tacticalGraphicsVersion?: unknown} | null | undefined)?.tacticalGraphicsVersion;
    return typeof declared === 'number' && Number.isFinite(declared) ? declared : LEGACY_SNAPSHOT_VERSION;
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

/**
 * The description a file carries, out of the bag a renderer rendered with.
 *
 * **A renderer completes the bag before it draws and the completed bag is not the
 * description.** MapLibre fills in a label gap of zero for the arc mission tasks, reads a
 * rectangle's width back off the ring it was handed, and recovers a drawn-anchor graphic's
 * `radius` and `rotation` from the points themselves — every one of which is either an
 * instruction to a renderer or a second copy of the geometry. Filing them made the *same
 * file* open as two different saves depending on which engine last wrote it: measured on the
 * import/export sweep, MapLibre wrote `labelGapDegrees` for 192 graphics and `radius` plus
 * `rotation` for 249 that OpenLayers wrote nothing for.
 *
 * A second copy is worse than redundant, because the two can disagree. 151204 contain
 * reported a 40 km radius beside a symbol drawn at 29.8, from exactly this: a figure filed
 * next to the points it was derived from, and then trusted over them.
 *
 * So what is filed is what the *caller* stated, plus whatever a renderer derived from
 * something the file does not carry — the drawing resolution, most often, which is the only
 * record of a screen-sized default and travels nowhere else. @see ai/context.md, "A saved
 * graphic carries one object"
 *
 * @param completed what the renderer drew with
 * @param supplied what it was handed, which is the caller's own statement
 * @param derived the keys this renderer worked out from the geometry, or added for itself
 */
export function describedProperties<T extends {name: unknown}>(
    completed: T,
    supplied: Partial<Record<keyof T, unknown>>,
    derived: Iterable<keyof T>,
): T {
    const filed = {...completed};
    for (const key of derived) {
        /*
         * A caller who stated it keeps it, **and keeps their own number** — whatever the
         * renderer then made of it. The value is theirs and the file is where they put it.
         *
         * Keeping `completed[key]` here was the same defect one level down: these keys are
         * spread *after* the caller's properties precisely so the renderer draws with its own
         * figure, so filing the completed bag filed the overwrite. A bag stating
         * `radius: 180000` for a bridge came back filed at 146,485 — the tick size this engine
         * had substituted to draw with — and the caller's own number was gone from their file
         * after a round trip they never asked for.
         */
        if (supplied[key] === undefined) delete filed[key];
        else filed[key] = supplied[key] as T[typeof key];
    }
    return filed;
}
