import type {Feature, FeatureCollection} from 'geojson';
import {upgradeAxisBase} from './axisWidth';
import {completeDemolitionBase} from './drawnBase';
import {applyAmplifierAliases, migrateRetiredGraphic, TACTICAL_GRAPHIC_KEY, type TacticalGraphicProperties} from './render';
import {SNAPSHOT_VERSION, snapshotVersionOf} from './snapshot';
import {DEFAULT_OFFSET_PX, buildPaintedGraphic, type PaintedGraphic} from './paintedGraphic';

/** One graphic read back out of a file, and the identity the file gave it. */
export interface RestoredGraphic {
    graphic: PaintedGraphic;
    /** The saved `symbolId`, or `undefined` when the file carried none. */
    symbolId?: string;
}

/**
 * Every graphic in a saved collection, migrated to the current shape and rebuilt through
 * the generators.
 *
 * **One reading of a file for every renderer that builds from this adapter.** It lived
 * inline in the MapLibre façade's `restore`, where nothing else could reach it; any other
 * renderer building from the adapter needs the same four repairs, and a second copy is how
 * two engines come to disagree about an old file.
 *
 * `resolution` is projected meters per pixel, spent only where an old file forces a
 * screen size to be invented (a version 1 axis arrow's width point).
 */
export function restoreSnapshotGraphics(snapshot: FeatureCollection, resolution: number): RestoredGraphic[] {
    /*
     * **The file's own version, because a version 1 axis arrow is a different shape.**
     *
     * The eleven filed their width as an amplifier until 2026-09-10 and carry it as
     * their last coordinate now, so an older record is a run of route points and a
     * `width` where a current one is that run plus a coordinate. A collection that
     * declares no version is read as version 1, which is what every unversioned one
     * actually is — MapLibre wrote them itself until 2026-09-04.
     * @see upgradeAxisBase, snapshotVersionOf
     */
    const version = snapshotVersionOf(snapshot);
    const restored: RestoredGraphic[] = [];
    for (const feature of snapshot.features ?? []) {
        const built = restoreFeature(feature, version, resolution);
        if (built) restored.push(built);
    }
    return restored;
}

function restoreFeature(feature: Feature, version: number, resolution: number): RestoredGraphic | undefined {
    const props = feature.properties ?? {};
    const stored = props[TACTICAL_GRAPHIC_KEY] as TacticalGraphicProperties | undefined;
    // @see applyAmplifierAliases — a snapshot may predate the 3.0.0 rename.
    let properties = stored && applyAmplifierAliases(stored);
    let geometry = feature.geometry;
    /*
     * **And it may name a graphic that no longer exists.** `FightingPosition` was
     * retired into `FortifiedPosition`, and the two drew from different point
     * models, so the record needs its geometry rewritten and not just its name.
     * Stated in the library so this engine and OpenLayers migrate a file the same
     * way. @see migrateRetiredGraphic
     */
    const migrated = properties && geometry && migrateRetiredGraphic(properties, geometry);
    if (migrated) {
        properties = migrated.properties;
        geometry = migrated.geometry;
    }
    if (!properties?.name || !geometry) return undefined;
    // A demolition obstacle saved with two points (OpenLayers allowed it until
    // 2026-09-21) gets its third, whatever the version. @see completeDemolitionBase
    if (geometry.type === 'LineString') {
        const completed = completeDemolitionBase(properties.name, geometry.coordinates);
        if (completed !== geometry.coordinates) geometry = {...geometry, coordinates: completed};
    }
    if (version < SNAPSHOT_VERSION && geometry.type === 'LineString') {
        const upgraded = upgradeAxisBase(
            properties.name,
            geometry.coordinates,
            properties.width,
            resolution * DEFAULT_OFFSET_PX * 2,
        );
        if (upgraded !== geometry.coordinates) {
            geometry = {...geometry, coordinates: upgraded};
            // **And the amplifier goes with it**, because the point now says what it
            // said. Left in the bag it is the second copy the whole change exists to
            // remove, and it rides straight back out into the next save.
            const {width, ...rest} = properties;
            void width;
            properties = rest as typeof properties;
        }
    }
    // Rebuilt through the generator from the saved description rather than
    // restored as drawn output, which is what makes a graphic saved in the
    // other engine arrive **editable** rather than as a picture of itself.
    const graphic = buildPaintedGraphic(properties.name, geometry, properties, resolution);
    if (!graphic) return undefined;
    const symbolId = typeof props.symbolId === 'string' && props.symbolId ? props.symbolId : undefined;
    return {graphic, symbolId};
}
