/**
 * # The properties dialog's MapLibre half
 *
 * The first piece of interaction this renderer has. Everything the OpenLayers
 * source gets from its feature graph has to be built here instead:
 *
 * | | OpenLayers | MapLibre |
 * |---|---|---|
 * | selection | `forEachFeatureAtPixel` | `queryRenderedFeatures` over the renderer's own layers |
 * | identity | a `symbolId` on the feature | `GRAPHIC_ID_PROPERTY`, stamped on every emitted mark |
 * | applying | mutate the feature, re-style | rebuild the graphic from its base and swap it in |
 *
 * The third row is the real difference. OpenLayers keeps live feature objects a
 * style function reads on every frame, so writing an amplifier and calling
 * `changed()` is enough. Here the drawn output is derived — realized into GeoJSON
 * sources — so an edit means running the graphic through the generator again.
 * That is also why this needs no equivalent of the OpenLayers style-patching: the
 * new color comes out of the paint functions on the rebuild.
 */

import type {Map as MapLibreMap} from 'maplibre-gl';
import {TacticalGraphicName, type TacticalGraphicProperties} from '@zaes/tactical-graphics';
import type {GraphicLabels} from '../graphicAmplifiers';
import type {FeaturePropertiesSource} from '../featurePropertiesSource';
import {buildTacticalGraphic} from './maplibreAdapter';
import type {NativeLayerRenderer} from './native/NativeLayerRenderer';
import {resolutionOf} from './projection';

/** How far off a symbol a click may land and still select it, in screen pixels. */
const HIT_RADIUS_PX = 6;

export function createMapLibrePropertiesSource(
    map: MapLibreMap,
    renderer: NativeLayerRenderer,
): FeaturePropertiesSource {
    return {
        onSelect(callback) {
            const handleClick = (event: {point: {x: number; y: number}}) => {
                const graphic = renderer.hitTest(event.point, HIT_RADIUS_PX);
                if (!graphic) {
                    callback(null);
                    return;
                }

                const props = graphic.properties;
                callback({
                    id: graphic.id,
                    graphicName: graphic.name,
                    labels: props as GraphicLabels,
                    // The bag is the only place MapLibre keeps it — there is no feature
                    // to stamp it on the way the OpenLayers dialog does.
                    echelon: (props.echelon as string) ?? '',
                    measured: {
                        radius: props.radius,
                        decorationSize: props.decorationSize,
                        width: props.width,
                        rotation: props.rotation,
                        bend: props.bend,
                        mirrored: props.mirrored,
                    },
                    graphicSize: props.radius,
                });
            };

            map.on('click', handleClick);
            return () => map.off('click', handleClick);
        },

        anchorPixel(selection) {
            const graphic = renderer.find(selection.id);
            const geometry = graphic?.base.geometry;
            if (!geometry) return undefined;

            // The base is a point, a line or a ring in lon/lat. Any vertex would do as
            // an anchor; the last one is what the OpenLayers source uses, so the cone
            // lands in the same place in both engines.
            const lonLat = lastPosition(geometry);
            if (!lonLat) return undefined;

            const point = map.project(lonLat as [number, number]);
            const rect = map.getCanvas().getBoundingClientRect();
            return [rect.left + point.x, rect.top + point.y];
        },

        apply(selection, labels, echelon) {
            const graphic = renderer.find(selection.id);
            if (!graphic) return;

            // The whole edit, as one bag. `name` is re-asserted rather than spread from
            // `labels`, which is the amplifier half and does not carry it.
            const properties: TacticalGraphicProperties = {
                ...graphic.properties,
                ...(labels as Partial<TacticalGraphicProperties>),
                name: graphic.name as TacticalGraphicName,
                ...(echelon ? {echelon: echelon as TacticalGraphicProperties['echelon']} : {}),
            };

            const rebuilt = buildTacticalGraphic(
                graphic.name,
                graphic.base.geometry,
                properties,
                resolutionOf(map),
            );
            // A rebuild can fail the same way the first build could — a generator that
            // refuses the new amplifiers. Leaving the old graphic up is better than
            // removing it, since the user has just been told the edit applied.
            if (rebuilt) renderer.replace(selection.id, {...rebuilt, id: selection.id});
        },
    };
}

/** The last vertex of a GeoJSON geometry, whatever its depth. */
function lastPosition(geometry: {type: string; coordinates?: unknown}): number[] | undefined {
    let node: unknown = geometry.coordinates;
    if (!Array.isArray(node)) return undefined;

    while (Array.isArray(node) && Array.isArray(node[node.length - 1])) {
        node = node[node.length - 1];
    }
    return Array.isArray(node) && typeof node[0] === 'number' ? (node as number[]) : undefined;
}
