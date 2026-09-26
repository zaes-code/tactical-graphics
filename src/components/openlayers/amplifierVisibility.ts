/**
 * # "Name only", as the OpenLayers features carry it
 *
 * Whether a graphic shows its name only is view state the host owns, not part of the
 * portable description, so it never reaches `properties.tacticalGraphic`. This renderer
 * holds it where the paint layer reads it: a `hideAmplifiers` flag on each OL feature of
 * the graphic. @see PaintFeature.hideAmplifiers
 *
 * The flag on the features **is** the state. There is no second copy to fall out of step,
 * and nothing here reads or writes browser storage: remembering the choice beyond the
 * features' lifetime is the host's business. @see TacticalGraphicsEngine.setAmplifiersHidden
 */

import type {Map as OlMap} from 'ol';
import VectorLayer from 'ol/layer/Vector';
import type Feature from 'ol/Feature';

/** Every feature on the map's vector layers that belongs to the graphic `symbolId`. */
function featuresOf(map: OlMap, symbolId: string): Feature[] {
    const found: Feature[] = [];
    for (const layer of map.getLayers().getArray()) {
        if (!(layer instanceof VectorLayer)) continue;
        const source = layer.getSource();
        if (!source) continue;
        for (const feature of source.getFeatures() as Feature[]) {
            if (feature.get('symbolId') === symbolId) found.push(feature);
        }
    }
    return found;
}

/**
 * Puts the choice onto the features the renderer reads.
 *
 * `feature.set` alone dispatches `propertychange` without moving the revision counter, so
 * `changed()` is what actually redraws, the same reason `writeGraphicProperties` calls it.
 * Returns whether any feature carried that id.
 */
export function stampAmplifierVisibility(map: OlMap, symbolId: string, hidden: boolean): boolean {
    const features = featuresOf(map, symbolId);
    for (const feature of features) {
        feature.set('hideAmplifiers', hidden || undefined);
        feature.changed();
    }
    return features.length > 0;
}

/** Whether the graphic `symbolId` is currently drawn name-only. */
export function amplifiersHiddenOn(map: OlMap, symbolId: string): boolean {
    return featuresOf(map, symbolId).some(feature => feature.get('hideAmplifiers') === true);
}
