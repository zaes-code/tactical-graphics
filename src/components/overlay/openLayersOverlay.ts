import type {FeatureCollection} from 'geojson';
import type OlMap from 'ol/Map';
import type BaseLayer from 'ol/layer/Base';
import type Feature from 'ol/Feature';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import {asArray} from 'ol/color';
import {Circle, Fill, Icon, Stroke, Style, Text} from 'ol/style';
import {OVERLAY_DASH_PX, OVERLAY_FONT, type OverlayProperties} from './overlayStyle';

/**
 * The overlay on the OpenLayers demo map: a tool's drawings, painted from their simplestyle
 * properties, under the graphics so they stay the thing a user edits. @see OverlayProperties
 */
export function createOpenLayersOverlay(map: OlMap, below?: () => BaseLayer | undefined): {show(collection: FeatureCollection | null): void} {
    const source = new VectorSource();
    // Its own className, so its own canvas: the default `ol-layer` shares the basemap's, whose dark-mode
    // CSS filter then recolors the overlay too. @see TacticalGraphicsManager's `tg-graphics`
    const layer = new VectorLayer({source, className: 'tg-overlay', style: feature => styleOf(feature as Feature)});
    const format = new GeoJSON();
    // Placed on first use, once the graphics' layer is on the map to go under.
    const place = () => {
        const layers = map.getLayers();
        if (layers.getArray().includes(layer)) return;
        const at = layers.getArray().indexOf(below?.() as BaseLayer);
        if (at >= 0) layers.insertAt(at, layer);
        else map.addLayer(layer);
    };
    return {
        show(collection) {
            place();
            source.clear();
            if (collection) source.addFeatures(format.readFeatures(collection, {featureProjection: map.getView().getProjection()}));
        },
    };
}

const styles = new WeakMap<Feature, Style>();

function styleOf(feature: Feature): Style {
    const cached = styles.get(feature);
    if (cached) return cached;
    const p = feature.getProperties() as OverlayProperties;
    const type = feature.getGeometry()?.getType();
    const point = type === 'Point' || type === 'MultiPoint';
    const text = p.text
        ? new Text({
              text: p.text,
              font: OVERLAY_FONT,
              fill: new Fill({color: '#ffffff'}),
              stroke: new Stroke({color: '#000000', width: 3}),
              overflow: true,
              placement: type === 'LineString' ? 'line' : 'point',
              offsetY: point ? -14 : 0,
          })
        : undefined;
    let style: Style;
    if (point && p.icon) {
        style = new Style({
            image: new Icon({
                src: p.icon,
                width: p['icon-width'],
                height: p['icon-height'],
                anchor: [p['icon-anchor-x'] ?? 0, p['icon-anchor-y'] ?? 0],
                anchorXUnits: 'pixels',
                anchorYUnits: 'pixels',
            }),
        });
    } else if (point) {
        style = new Style({
            image: new Circle({radius: 4, fill: new Fill({color: p.stroke ?? '#000000'}), stroke: new Stroke({color: '#ffffff', width: 1})}),
            text,
        });
    } else {
        style = new Style({
            stroke: p.stroke
                ? new Stroke({
                      color: withAlpha(p.stroke, p['stroke-opacity']),
                      width: p['stroke-width'] ?? 2,
                      lineDash: p.dashed ? OVERLAY_DASH_PX : undefined,
                  })
                : undefined,
            fill: p.fill ? new Fill({color: withAlpha(p.fill, p['fill-opacity'])}) : undefined,
            text,
        });
    }
    styles.set(feature, style);
    return style;
}

function withAlpha(color: string, opacity: number | undefined): string | number[] {
    if (opacity === undefined) return color;
    try {
        const [r, g, b, a] = asArray(color);
        return [r, g, b, a * opacity];
    } catch {
        return color;
    }
}
