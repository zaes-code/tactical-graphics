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
 * **Don't remove either while trimming controls.** `BASEMAP_ENABLED` is the
 * escape hatch if traffic ever stops being modest, matching the OpenLayers side.
 *
 * @see ai/decisions.md — the keyless alternatives that were compared
 */

/** Matches `BASEMAP_ENABLED` in `openlayerStyles.ts`: `REACT_APP_BASEMAP=off` drops the tiles. */
const BASEMAP_ENABLED = process.env.REACT_APP_BASEMAP !== 'off';

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Background colour when the tiles are off or still loading.
 *
 * Not a theme: MapLibre paints nothing where there is no layer, which shows the
 * page through the map. A neutral mid-grey reads as "map" under both palettes.
 */
const EMPTY_BACKGROUND = '#2a2e35';

/**
 * The demo's dark basemap is the light one under a CSS filter, exactly as the
 * OpenLayers view does it (`map.css`, `.ol-layer:first-child canvas`).
 *
 * MapLibre draws every layer into **one** canvas, so a CSS filter on that canvas
 * would invert the tactical graphics along with the tiles — which is precisely
 * the bug the OpenLayers side shipped for months before `className: 'tg-graphics'`
 * split the canvases. The MapLibre renderer therefore keeps its graphics on a
 * separate overlay canvas and the filter is scoped to the map's own canvas by
 * `maplibre.css`. Don't widen that selector.
 */
export function createBasemapStyle(): StyleSpecification {
    if (!BASEMAP_ENABLED) {
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
            {id: 'osm', type: 'raster', source: 'osm'},
        ],
    };
}
