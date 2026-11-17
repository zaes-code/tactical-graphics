import type {Map as OlMap} from 'ol';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Style from 'ol/style/Style';
import {TacticalGraphicHostility, TacticalGraphicName, getColorByIdentity, statesUnknownIdentity} from '@zaes/tactical-graphics';
import {GraphicLabels, GraphicLinkRegistry} from '../../utils/graphicLinkRegistry';
import {writeGraphicProperties} from './graphicProperties';

/**
 * Writes a graphic's amplifiers to every feature it drew and redraws it: what the properties
 * dialog does with an edit, and what a draw started with a preset does once it is placed.
 *
 * Every holder keeps its labels its own way, and some have no `setLabel` at all (Block, the
 * retrograde tasks), so the amplifiers go onto the features under the key the style functions
 * read, and to the holder as well where it has one.
 * @param id The graphic's `symbolId`.
 * @param echelon The echelon, also stamped on the features for the code that reads it there.
 */
export function applyGraphicLabels(map: OlMap, id: string, labels: GraphicLabels, echelon?: string): void {
    const color = getColorByIdentity(labels.hostility ?? TacticalGraphicHostility.unknown, statesUnknownIdentity(labels));
    const layers = map
        .getLayers()
        .getArray()
        .filter((l): l is VectorLayer<VectorSource> => l instanceof VectorLayer && !!l.getSource());

    for (const layer of layers) {
        const source = layer.getSource();
        if (!source) continue;

        const features = source.getFeatures().filter(f => f.get('symbolId') === id);
        if (!features.length) continue;

        features.forEach(feature => {
            feature.set('hostility', labels.hostility);
            feature.set('echelon', echelon);
            feature.set('hostilityColor', color);
            // Persist the amplifiers on the feature itself, under the same key the
            // style functions read. Graphics whose holder has no `setLabel` (Block,
            // the retrograde tasks) depend on this write alone.
            writeGraphicProperties([feature], feature.get('graphicName') as TacticalGraphicName, labels);

            const styleLike = feature.getStyle?.();
            const resolved = Array.isArray(styleLike)
                ? styleLike[0]
                : typeof styleLike === 'function'
                    ? undefined
                    : styleLike;
            if (resolved instanceof Style) {
                resolved.getStroke?.()?.setColor(color);
                resolved.getFill?.()?.setColor(`${color}44`);
            }

            GraphicLinkRegistry.getFromFeature(feature)?.setLabel?.(labels as GraphicLabels);
            feature.changed();
        });
    }
}
