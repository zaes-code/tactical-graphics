import type {FeatureCollection} from 'geojson';
import {TACTICAL_GRAPHIC_KEY, type TacticalGraphicName, type TacticalGraphicProperties} from '@zaes/tactical-graphics';
import {buildTacticalGraphic, type MapLibreTacticalGraphic} from './maplibreAdapter';

/**
 * Loads a plain GeoJSON FeatureCollection into the MapLibre renderer.
 *
 * The MapLibre counterpart of `restoreTacticalGraphics` on the OpenLayers side,
 * and deliberately reduced to its essentials: read `properties.tacticalGraphic`,
 * hand it to the generator, keep what comes back. The OpenLayers version is ~120
 * lines because it also has to rebuild an *editable* graphic — a holder, a
 * controller, and a base feature the Modify interaction can reach. This one only
 * has to draw, which is exactly the difference between the spike and a finished
 * renderer.
 *
 * Skips derived features (`role` present and not `base`), matching restore's rule
 * that only bases rebuild.
 */
export function drawSpikeSamples(
    snapshot: FeatureCollection,
    add: (graphic: MapLibreTacticalGraphic) => void,
    drawingResolution?: number,
): {drawn: number; skipped: string[]} {
    const skipped: string[] = [];
    let drawn = 0;

    for (const feature of snapshot.features) {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        if (props.role !== undefined && props.role !== 'base') continue;

        const bag = (props[TACTICAL_GRAPHIC_KEY] ?? {}) as TacticalGraphicProperties;
        const name = (bag.name ?? props.graphicName) as TacticalGraphicName | undefined;
        if (!name) {
            skipped.push('feature has no graphic name');
            continue;
        }

        const {name: _ignored, ...rest} = bag;
        const graphic = buildTacticalGraphic(name, feature.geometry, rest, drawingResolution);
        if (!graphic) {
            skipped.push(`${name}: no paint function, or the generator refused this base`);
            continue;
        }

        add(graphic);
        drawn++;
    }

    return {drawn, skipped};
}
