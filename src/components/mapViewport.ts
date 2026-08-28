/**
 * # Where the map is looking, shared between the two engines
 *
 * Switching renderers rebuilds the map from nothing, so without this the new engine
 * opens at the library's default center and zoom and the user has to find their way
 * back to what they were looking at. The graphics already cross the switch; the view
 * onto them should too.
 *
 * ## Center and resolution, not center and zoom
 *
 * A zoom *number* is not portable: MapLibre's tiles are 512 px and OpenLayers' are
 * 256, so the same view is `z` in one engine and `z - 1` in the other, and storing
 * the raw number would halve or double the scale on every switch. Meters per CSS
 * pixel is the same quantity in both — it is what the whole paint layer is already
 * expressed in — so it converts cleanly at each end. Together with the container
 * size, which both engines share, it also fixes the bounds.
 *
 * ## Why `localStorage` here and not for the graphics
 *
 * The graphics hand over through an in-memory ref precisely so a refresh starts
 * clean. A viewport is not content: coming back to where you were looking is what a
 * map is expected to do, and it costs three numbers. It is written on every
 * `moveend` rather than only on a switch, so a refresh has something to read.
 */

/** Where the map is looking, in terms both renderers understand. */
export interface MapViewport {
    lon: number;
    lat: number;
    /** Meters per CSS pixel. @see resolutionOf */
    resolution: number;
}

const LS_VIEWPORT = 'tg_viewport';

/**
 * The stored viewport, or `undefined` if there is none or it is unusable.
 *
 * Validated rather than trusted: this is user-writable storage, and a `NaN` center
 * or a zero resolution does not fail loudly — it produces a blank map with no error,
 * which is a bad afternoon. Latitude is bounded by Mercator's own limit.
 */
export function readViewport(): MapViewport | undefined {
    try {
        const raw = localStorage.getItem(LS_VIEWPORT);
        if (!raw) return undefined;
        const {lon, lat, resolution} = JSON.parse(raw) as Partial<MapViewport>;
        if (![lon, lat, resolution].every(n => typeof n === 'number' && Number.isFinite(n))) return undefined;
        if (Math.abs(lon!) > 180 || Math.abs(lat!) > 85.06 || resolution! <= 0) return undefined;
        return {lon: lon!, lat: lat!, resolution: resolution!};
    } catch {
        // Unparseable or storage refused: fall back to the default view rather than
        // failing to open the map.
        return undefined;
    }
}

/** Records where the map is looking. Failures are ignored — a viewport is not worth an exception. */
export function writeViewport(viewport: MapViewport): void {
    if (!Number.isFinite(viewport.resolution) || viewport.resolution <= 0) return;
    if (!Number.isFinite(viewport.lon) || !Number.isFinite(viewport.lat)) return;
    try {
        localStorage.setItem(LS_VIEWPORT, JSON.stringify(viewport));
    } catch {
        /* private mode, quota, or no storage at all */
    }
}
