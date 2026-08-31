import type {StyleSpecification} from 'maplibre-gl';

/**
 * The basemap the MapLibre view draws under the graphics.
 *
 * **Raster OSM tiles, hand-written, no API key.** MapLibre's usual selling point
 * is vector tiles, and every vector style worth using needs an account — which
 * would be a published secret here, since both the GitHub mirror and the Pages
 * demo are public. Raster also makes the two engines directly comparable: the
 * OpenLayers view is `new OSM()`, so a side-by-side capture differs only in who
 * drew the symbols.
 *
 * Same tiles means the same obligation. The OSM Foundation's Tile Usage Policy
 * permits *modest* use and requires the attribution to stay visible — hence the
 * `attribution` field below, and `AttributionControl` in the map constructor.
 * **Don't remove either while trimming controls.** `basemapEnabled` is the
 * escape hatch if traffic ever stops being modest, matching the OpenLayers side.
 *
 * @see ai/decisions.md — the keyless alternatives that were compared
 */

/** Matches `basemapEnabled` in `openlayerStyles.ts`: `REACT_APP_BASEMAP=off` drops the tiles. */
const basemapEnabled = () => {
    // Read here rather than at module load, for the reason given in openlayerStyles.ts:
    // `createBasemapStyle` is exported from this entry point, and a top-level `process`
    // read made the whole module unimportable in a browser bundle.
    try {
        return process.env.REACT_APP_BASEMAP !== 'off';
    } catch {
        return true;
    }
};

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Background color when the tiles are off or still loading.
 *
 * Not a theme: MapLibre paints nothing where there is no layer, which shows the
 * page through the map. A neutral mid-gray reads as "map" under both palettes.
 */
const EMPTY_BACKGROUND = '#2a2e35';

/**
 * Dark-mode paint for the raster layer.
 *
 * **A CSS filter cannot be used here, and this is the fix for that.** The
 * OpenLayers view darkens its basemap with `filter: invert(95%) hue-rotate(180deg)`
 * on the tile canvas, which works because OpenLayers gives the graphics their own
 * canvas (`className: 'tg-graphics'`). MapLibre composites **every layer into one
 * canvas**, so the same filter repaints the tactical graphics along with the tiles
 * — washed-out, inverted line work — and there is no MapLibre equivalent of that
 * className escape.
 *
 * `raster-*` paint properties apply to *this layer only*, so they darken the tiles
 * and leave every graphics layer above untouched. Setting `brightness-min` above
 * `brightness-max` inverts the ramp, which is what stands in for CSS `invert()`.
 *
 * Values chosen to sit close to the OpenLayers filter so the two engines' dark
 * basemaps read the same and a side-by-side capture compares symbols rather than
 * tints.
 */
const DARK_RASTER_PAINT = {
    'raster-brightness-min': 1,
    'raster-brightness-max': 0,
    'raster-hue-rotate': 180,
    'raster-saturation': -0.2,
    'raster-contrast': -0.1,
} as const;

/**
 * The raster layer's paint for a mode. Light is MapLibre's default, stated
 * explicitly rather than omitted — switching back from dark has to *reset* each
 * property, and a partial object would leave the previous mode's values in place.
 */
export type BasemapPaint = typeof DARK_RASTER_PAINT | typeof LIGHT_RASTER_PAINT;

const LIGHT_RASTER_PAINT = {
    'raster-brightness-min': 0,
    'raster-brightness-max': 1,
    'raster-hue-rotate': 0,
    'raster-saturation': 0,
    'raster-contrast': 0,
} as const;

export function basemapPaint(dark: boolean): BasemapPaint {
    return dark ? DARK_RASTER_PAINT : LIGHT_RASTER_PAINT;
}

/** The id of the raster layer, so a caller can re-paint it when the mode changes. */
export const BASEMAP_LAYER_ID = 'osm';

export function createBasemapStyle(dark = true): StyleSpecification {
    if (!basemapEnabled()) {
        return {
            version: 8,
            sources: {},
            layers: [{id: 'background', type: 'background', paint: {'background-color': EMPTY_BACKGROUND}}],
        };
    }

    return {
        version: 8,
        // No glyphs or sprite: every piece of text this renderer draws is painted
        // by the tactical-graphics layer with a real font, not by MapLibre's
        // `symbol` layer — so there is no PBF font stack to host. That is a
        // deliberate consequence of how the labels work here, not an omission.
        sources: {
            osm: {
                type: 'raster',
                tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
                maxzoom: 19,
                attribution: OSM_ATTRIBUTION,
            },
        },
        layers: [
            {id: 'background', type: 'background', paint: {'background-color': EMPTY_BACKGROUND}},
            {id: BASEMAP_LAYER_ID, type: 'raster', source: 'osm', paint: basemapPaint(dark)},
        ],
    };
}
