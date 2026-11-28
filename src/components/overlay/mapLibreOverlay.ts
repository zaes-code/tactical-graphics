import type {Feature, FeatureCollection} from 'geojson';
import type {GeoJSONSource, LayerSpecification, Map as MapLibreMap} from 'maplibre-gl';
import {OVERLAY_DASH_PX, type OverlayProperties} from './overlayStyle';

const SOURCE = 'demo-overlay';
const ICON_PREFIX = 'demo-overlay-icon-';
/** The native renderer's stack, which the style's glyphs URL serves. @see NativeLayerRenderer */
const FONT_STACK = 'Noto Sans Bold';

const isPoint: unknown[] = ['==', ['geometry-type'], 'Point'];
const LAYERS: LayerSpecification[] = [
    {
        id: `${SOURCE}-fill`,
        type: 'fill',
        source: SOURCE,
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['has', 'fill']] as never,
        paint: {'fill-color': ['get', 'fill'], 'fill-opacity': ['coalesce', ['get', 'fill-opacity'], 1]},
    },
    ...[false, true].map(
        dashed =>
            ({
                id: `${SOURCE}-line${dashed ? '-dashed' : ''}`,
                type: 'line',
                source: SOURCE,
                filter: ['all', ['!', isPoint], ['has', 'stroke'], ['==', ['coalesce', ['get', 'dashed'], false], dashed]],
                layout: {'line-join': 'round'},
                paint: {
                    'line-color': ['get', 'stroke'],
                    'line-width': ['coalesce', ['get', 'stroke-width'], 2],
                    'line-opacity': ['coalesce', ['get', 'stroke-opacity'], 1],
                    // In line widths, not pixels; close enough to the OpenLayers dash at the widths files use.
                    ...(dashed ? {'line-dasharray': OVERLAY_DASH_PX.map(px => px / 2)} : {}),
                },
            }) as unknown as LayerSpecification,
    ),
    {
        id: `${SOURCE}-dot`,
        type: 'circle',
        source: SOURCE,
        filter: ['all', isPoint, ['!', ['has', 'icon']]] as never,
        paint: {
            'circle-radius': 4,
            'circle-color': ['coalesce', ['get', 'stroke'], '#000000'],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
        },
    },
    {
        id: `${SOURCE}-icon`,
        type: 'symbol',
        source: SOURCE,
        filter: ['has', 'icon-id'] as never,
        layout: {
            'icon-image': ['get', 'icon-id'],
            'icon-anchor': 'top-left',
            'icon-offset': ['array', 'number', 2, ['get', 'icon-offset']],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
        },
    },
    // Two text layers, because `symbol-placement` cannot vary by feature: along a line, and at a point.
    ...[true, false].map(
        alongLine =>
            ({
                id: `${SOURCE}-text${alongLine ? '-line' : ''}`,
                type: 'symbol',
                source: SOURCE,
                filter: ['all', ['has', 'text'], alongLine ? ['==', ['geometry-type'], 'LineString'] : ['!=', ['geometry-type'], 'LineString']],
                layout: {
                    'text-field': ['get', 'text'],
                    'text-font': [FONT_STACK],
                    'text-size': 12,
                    'symbol-placement': alongLine ? 'line-center' : 'point',
                    'text-offset': ['case', isPoint, ['literal', [0, -1.2]], ['literal', [0, 0]]],
                    'text-allow-overlap': true,
                },
                paint: {'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1.5},
            }) as unknown as LayerSpecification,
    ),
];

/**
 * The overlay on the MapLibre demo map, the same paint as `createOpenLayersOverlay`. It sits under
 * the graphics' own layers, and puts itself back if a style change drops it. @see OverlayProperties
 */
export function createMapLibreOverlay(map: MapLibreMap): {show(collection: FeatureCollection | null): void} {
    let current: FeatureCollection | null = null;
    let shown = 0;

    const install = () => {
        if (map.getSource(SOURCE)) return;
        map.addSource(SOURCE, {type: 'geojson', data: {type: 'FeatureCollection', features: []}});
        // Under the library's layers, which all start `tg-`, so the graphics stay on top.
        const below = map.getStyle().layers.find(l => l.id.startsWith('tg-'))?.id;
        for (const layer of LAYERS) map.addLayer(layer, below);
    };

    const render = async () => {
        const run = ++shown;
        if (!map.isStyleLoaded()) await new Promise(resolve => map.once('idle', resolve));
        install();
        const features = await Promise.all((current?.features ?? []).map(withIcon));
        if (run !== shown) return;
        (map.getSource(SOURCE) as GeoJSONSource).setData({type: 'FeatureCollection', features});
    };

    const withIcon = async (feature: Feature): Promise<Feature> => {
        const p = (feature.properties ?? {}) as OverlayProperties;
        if (!p.icon) return feature;
        const id = ICON_PREFIX + hash(p.icon);
        if (!map.hasImage(id)) {
            const image = new Image(p['icon-width'], p['icon-height']);
            image.src = p.icon;
            try {
                await image.decode();
            } catch {
                return feature;
            }
            if (!map.hasImage(id)) map.addImage(id, image);
        }
        return {...feature, properties: {...p, 'icon-id': id, 'icon-offset': [-(p['icon-anchor-x'] ?? 0), -(p['icon-anchor-y'] ?? 0)]}};
    };

    map.on('styledata', () => {
        if (current && !map.getSource(SOURCE)) void render();
    });

    return {
        show(collection) {
            current = collection;
            void render();
        },
    };
}

function hash(text: string): string {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
}
