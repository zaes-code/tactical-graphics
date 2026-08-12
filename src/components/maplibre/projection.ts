import type {Map as MapLibreMap} from 'maplibre-gl';
import type {ProjectedPosition} from '@zaes/tactical-graphics';

/**
 * # EPSG:3857 ↔ lon/lat, and MapLibre's camera expressed as a `resolution`
 *
 * The paint layer works in **projected meters** — the same EPSG:3857 frame the
 * OpenLayers style functions have always used — because that is what makes a
 * ported decoration character-for-character the same math as the original. This
 * module is the only place that converts.
 *
 * MapLibre wants lon/lat, so the reprojection the OpenLayers adapter does on the
 * way *in* happens here on the way *out*. It is exact and cheap: the inverse
 * Mercator is two lines of arithmetic with no datum shift, since both frames are
 * on the same sphere.
 */

/** Earth's radius as EPSG:3857 defines it — a sphere, not the WGS-84 ellipsoid. */
const R = 6378137;

/** Half the projected world, in meters. `π · R`, i.e. ±20037508.34. */
export const MERCATOR_HALF_WORLD = Math.PI * R;

/** Full width of the projected world, in meters. */
export const MERCATOR_WORLD_SIZE = 2 * MERCATOR_HALF_WORLD;

/**
 * Web Mercator's latitude limit, ±85.051129°, where the projection reaches the
 * square world's edge. MapLibre clamps to this itself; stated here so anything
 * building an extent uses the same number.
 */
export const MERCATOR_MAX_LATITUDE = 85.0511287798066;

/** lon/lat degrees → EPSG:3857 meters. */
export function toMercator(lonLat: [number, number]): ProjectedPosition {
    const [lon, lat] = lonLat;
    const clamped = Math.max(-MERCATOR_MAX_LATITUDE, Math.min(MERCATOR_MAX_LATITUDE, lat));
    return [
        (lon * Math.PI / 180) * R,
        Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI / 180) / 2)) * R,
    ];
}

/** EPSG:3857 meters → lon/lat degrees. */
export function toLonLat(position: ProjectedPosition): [number, number] {
    const [x, y] = position;
    return [
        (x / R) * 180 / Math.PI,
        (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI,
    ];
}

/**
 * MapLibre's zoom as an OpenLayers **resolution**: projected meters per screen
 * pixel.
 *
 * This is the number every zoom-invariant size in this library is expressed
 * against — `n * resolution` is a constant number of screen pixels at any zoom —
 * so getting it wrong silently mis-sizes all 128 synthesized decorations rather
 * than throwing.
 *
 * ## Two traps, both of which produce a plausible-looking wrong map
 *
 * **1. MapLibre's zoom is not OpenLayers' zoom.** MapLibre defines the world as
 * `512 · 2^zoom` pixels across; OpenLayers' EPSG:3857 view uses 256, so the same
 * zoom number is one power of two apart. A raster source declaring
 * `tileSize: 256` changes which tiles are fetched, not this definition.
 *
 * **2. There is no `cos(latitude)` term.** `ai/maplibre-renderer.md` wrote this
 * conversion as `156543.03392 × cos(latitude) / 2^zoom`, which is the formula for
 * *ground* meters per pixel. EPSG:3857 meters already carry the Mercator stretch,
 * so applying the cosine again double-counts it: at 45° every decoration would
 * come out 30% too small, and correctly sized only on the equator. The doc has
 * been corrected.
 */
export function resolutionOf(map: MapLibreMap): number {
    return MERCATOR_WORLD_SIZE / (512 * Math.pow(2, map.getZoom()));
}

/** The inverse of {@link resolutionOf} — what to hand `map.setZoom` for a given resolution. */
export function zoomForResolution(resolution: number): number {
    return Math.log2(MERCATOR_WORLD_SIZE / (512 * resolution));
}

/**
 * The projected-meters → canvas-pixels transform for one frame.
 *
 * A flat affine, computed once and applied to every coordinate, rather than
 * calling `map.project()` per point: the sample sweep draws over a thousand
 * features and the call overhead dominates at that scale.
 *
 * **Valid for a north-up, unpitched view only.** That is what the demo uses —
 * matching OpenLayers, whose 2D renderer has no other mode — and the MapLibre
 * view disables rotation and pitch to keep it true. A pitched camera has no
 * single meters-per-pixel, so a decoration sized in screen pixels stops being
 * well-defined; supporting it means projecting per point and accepting that a
 * "10 px tooth" is 10 px only at the point it is anchored.
 */
export interface ViewTransform {
    /** Projected meters per screen pixel. */
    resolution: number;
    /** Canvas size in CSS pixels. */
    width: number;
    height: number;
    /** Viewport center, in projected meters. */
    center: ProjectedPosition;
}

export function viewTransformOf(map: MapLibreMap): ViewTransform {
    const canvas = map.getCanvas();
    const {lng, lat} = map.getCenter();
    return {
        resolution: resolutionOf(map),
        // `clientWidth`, not `width`: the backing store is multiplied by the
        // device pixel ratio, and every size in this library is CSS pixels. The
        // canvas context is scaled by the same ratio, so the two agree.
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        center: toMercator([lng, lat]),
    };
}

/** Projected meters → canvas pixels, north-up. */
export function toScreen(position: ProjectedPosition, view: ViewTransform): ProjectedPosition {
    return [
        (position[0] - view.center[0]) / view.resolution + view.width / 2,
        view.height / 2 - (position[1] - view.center[1]) / view.resolution,
    ];
}
