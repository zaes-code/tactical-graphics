/**
 * # The demo's overlay: GeoJSON a tool wants on the map beside the graphics
 *
 * An add-on tool sometimes has things to show that are not tactical graphics: what a file held
 * that the library has no symbol for, say. `MapEngineHandle.showOverlay` puts a collection of them
 * on whichever engine is showing, each painted from its own properties.
 *
 * The properties are GeoJSON's **simplestyle** convention, so nothing here knows who produced
 * them, plus four the demo adds: `dashed`, `text`, and an `icon` image with its size and the pixel
 * that sits on the point. Demo-only: this folder is in neither published build.
 */
export interface OverlayProperties {
    stroke?: string;
    'stroke-width'?: number;
    'stroke-opacity'?: number;
    fill?: string;
    'fill-opacity'?: number;
    dashed?: boolean;
    text?: string;
    /** Anything an image can load, usually a `data:` URL. */
    icon?: string;
    'icon-width'?: number;
    'icon-height'?: number;
    'icon-anchor-x'?: number;
    'icon-anchor-y'?: number;
}

/** One dash for every dashed overlay line, in screen pixels: MapLibre cannot vary it by feature. */
export const OVERLAY_DASH_PX = [8, 6];

export const OVERLAY_FONT = 'bold 12px sans-serif';
