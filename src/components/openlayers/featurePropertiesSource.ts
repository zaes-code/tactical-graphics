/**
 * # The properties dialog's OpenLayers half
 *
 * Lifted out of `tactical-graphics-dialog.tsx` unchanged, so the dialog could stop
 * being an OpenLayers component. Every rule here was already in that file; what is
 * new is only that it now sits behind {@link FeaturePropertiesSource}.
 */

import {Feature, Map as OlMap} from 'ol';
import {Circle, Geometry, GeometryCollection, LineString, MultiLineString, MultiPoint, Point, Polygon} from 'ol/geom';
import {Coordinate} from 'ol/coordinate';
import {Draw} from 'ol/interaction';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Style from 'ol/style/Style';
import {TacticalGraphicHostility, TacticalGraphicName, getColorByHostility} from '@zaes/tactical-graphics';
import {GraphicLabels, GraphicLinkRegistry} from '../../utils/graphicLinkRegistry';
import type {FeaturePropertiesSource} from '../featurePropertiesSource';
import {readGraphicGeometryState, readGraphicLabels, writeGraphicProperties} from './graphicProperties';
import type {TacticalGraphicsManager} from './TacticalGraphicsManager';

/**
 * How long to wait after a click before hit-testing, in milliseconds.
 *
 * Enough for `drawend` to finish. Without it the click that completes a drawing
 * immediately re-selects the graphic it just made and opens the dialog on top of
 * the map the user is still working in.
 */
const HIT_TEST_DELAY_MS = 50;

/** The anchor the connector cone points at, per geometry type. */
function anchorCoordinate(geometry: Geometry): Coordinate | undefined {
    switch (geometry.getType()) {
        case 'Point':
            return (geometry as Point).getCoordinates();
        case 'LineString':
            return (geometry as LineString).getCoordinates().at(-1);
        case 'Polygon':
            return (geometry as Polygon).getCoordinates()[0]?.at(-1);
        case 'MultiPoint':
            return (geometry as MultiPoint).getCoordinates().at(-1);
        case 'MultiLineString': {
            const lines = (geometry as MultiLineString).getCoordinates();
            return lines.at(-1)?.at(-1);
        }
        case 'GeometryCollection': {
            const geoms = (geometry as GeometryCollection).getGeometries();
            for (const g of geoms) {
                const coord = anchorCoordinate(g);
                if (coord) return coord;
            }
            return undefined;
        }
        case 'Circle':
            return (geometry as Circle).getCenter();
        default:
            return undefined;
    }
}

export function createOpenLayersPropertiesSource(
    map: OlMap,
    manager: TacticalGraphicsManager,
): FeaturePropertiesSource {
    /**
     * The feature each selection came from.
     *
     * The dialog hands back only the opaque id, so the source keeps the feature it
     * matched — anchoring needs its geometry, and re-finding it by id would be a
     * second scan that could disagree with the first.
     *
     * OpenLayers' own `Map` is imported here, so the built-in one needs its global
     * name to stay reachable.
     */
    const selected = new globalThis.Map<string, Feature>();

    return {
        suppressed() {
            if (manager.isDrawing()) return true;
            /*
             * **Edit mode selects; it does not open a form.**
             *
             * A click there means "this is the graphic I am working on", and answering
             * it with a modal over the map is answering a different question — the
             * operator now has to dismiss a form before they can reach the affordances
             * that click just summoned. The amplifiers stay one mode away: leave edit,
             * click the graphic, and the dialog opens as it always has.
             */
            if (manager.isEditing()) return true;
            // A `Draw` interaction that is active but has not started still owns the
            // click; opening the dialog would fight it for the next one.
            if (map.getInteractions().getArray().some(i => i instanceof Draw)) return true;
            // The click that *ended* a drawing arrives here too.
            return Date.now() < manager.lastDrawEndedAt;
        },

        onSelect(callback) {
            const handleClick = (evt: {pixel: number[]}) => {
                setTimeout(() => {
                    const feature = map.forEachFeatureAtPixel(evt.pixel as Coordinate, f => f) as Feature | undefined;
                    if (!feature) {
                        callback(null);
                        return;
                    }

                    const id = String(feature.get('symbolId') ?? '');
                    selected.set(id, feature);
                    callback({
                        id,
                        graphicName: feature.get('graphicName') as TacticalGraphicName,
                        labels: readGraphicLabels(feature),
                        echelon: (feature.get('echelon') as string) || '',
                        measured: readGraphicGeometryState(feature),
                        graphicSize: feature.get('graphicSize') as number | undefined,
                    });
                }, HIT_TEST_DELAY_MS);
            };

            map.on('singleclick', handleClick);
            return () => map.un('singleclick', handleClick);
        },

        anchorPixel(selection) {
            const feature = selected.get(selection.id);
            const geometry = feature?.getGeometry();
            if (!geometry) return undefined;

            const coord = anchorCoordinate(geometry);
            if (!coord) return undefined;

            const pixel = map.getPixelFromCoordinate(coord);
            if (!pixel) return undefined;

            const rect = map.getTargetElement().getBoundingClientRect();
            return [rect.left + pixel[0], rect.top + pixel[1]];
        },

        apply(selection, labels, echelon) {
            if (!selection.id) return;

            const color = getColorByHostility(labels.hostility ?? TacticalGraphicHostility.unknown);
            const layers = map
                .getLayers()
                .getArray()
                .filter((l): l is VectorLayer<VectorSource> => l instanceof VectorLayer && !!l.getSource());

            for (const layer of layers) {
                const source = layer.getSource();
                if (!source) continue;

                const features = source.getFeatures().filter(f => f.get('symbolId') === selection.id);
                if (!features.length) continue;

                features.forEach(feature => {
                    feature.set('hostility', labels.hostility);
                    feature.set('echelon', echelon);
                    feature.set('hostilityColor', color);
                    // Persist the amplifiers on the feature itself, under the same key the
                    // style functions read. Graphics whose holder has no `setLabel` — Block,
                    // the retrograde tasks — depend on this write alone.
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
        },
    };
}
