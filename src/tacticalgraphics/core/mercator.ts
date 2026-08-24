/**
 * # A projected metre is not a metre
 *
 * Both renderers work in EPSG:3857, where a "metre" is a metre only on the equator. Web
 * Mercator stretches everything north or south of it by `1 / cos(latitude)` — 1.22x at
 * 35 degrees, 1.56x at 50, 2.37x at 65 — so a distance read off projected coordinates is
 * not a distance on the ground.
 *
 * That matters here because **the portable description states real distances**. A radius,
 * a width, a length: they are figures an operator reads, types and reports, and the
 * generators build from them geodesically through turf. Handing a projected figure to
 * something that means a ground one is not a rounding error — it is a symbol of the wrong
 * size, and a read-out that states a distance nobody could measure.
 *
 * It had exactly that effect on a drawn circle. The OpenLayers `Draw` interaction reports
 * its circle's radius in projected metres and that number was stamped straight into
 * `radius`; MapLibre took the same measurement with `Math.hypot` over mercator
 * coordinates. So an airspace coordination area dragged out to 120 px at 50 degrees north
 * was rendered at 185 px — the rim ran away from the cursor that was sizing it, the hashed
 * read-out reached only 65% of the way to it, and the label claimed 587 km for a circle
 * 377 km across.
 *
 * `rectangleAmplifiers` already says this for the rectangular zones ("projected metres
 * carry a 1/cos(lat) inflation that would show a 10 km zone as 16 km at 51 degrees"). This
 * module is the same statement, factored out, so both engines convert with one rule
 * instead of two. @see ai/conventions.md, "A symbology fact never lives in a holder"
 *
 * ## What this is not
 *
 * It is not a projection library. Converting a *coordinate* is each renderer's own job and
 * each already has it (`ol/proj`, `maplibre-gl`'s `MercatorCoordinate`). What is shared is
 * the scalar: how long a thing measured on the screen actually is.
 */

/** The equatorial radius the Web Mercator sphere is defined on. */
const EARTH_RADIUS_METERS = 6378137;

/**
 * Projected metres per ground metre at a latitude — the Web Mercator scale factor.
 *
 * Clamped away from the poles: `cos(90)` is zero and the scale there is infinite, which
 * would turn a legitimate high-latitude drag into `Infinity` or `NaN` and take the
 * geometry with it. 89.9 degrees is already a scale of 573, well past any usable symbol.
 */
export function mercatorScale(latitude: number): number {
    const clamped = Math.max(-89.9, Math.min(89.9, latitude));
    return 1 / Math.cos((clamped * Math.PI) / 180);
}

/** What a length measured in projected metres at this latitude is on the ground. */
export function groundLength(projected: number, latitude: number): number {
    return projected / mercatorScale(latitude);
}

/** The projected length that renders a ground length at this latitude — the inverse. */
export function projectedLength(ground: number, latitude: number): number {
    return ground * mercatorScale(latitude);
}

/**
 * What a screen size is worth on the ground, where it is being drawn.
 *
 * The other half of the same defect. A decoration, a one-click badge and a corridor's
 * default width are all specified in **screen pixels** — "the tooth does not change size
 * as the line lengthens" — and every one of them was turned into metres by multiplying by
 * the map resolution alone. That is a projected length, so the symbol came out
 * `1 / cos(latitude)` too big: a Destroy dropped at 60 degrees north measured 204 px
 * across where the same drop on the equator measured 100, and an air corridor drawn with
 * the identical drag was 79 px wide instead of 40.
 *
 * A pixel size only means anything at a place, which is why this takes one.
 */
export function screenMeters(px: number, resolution: number, latitude: number): number {
    return groundLength(px * resolution, latitude);
}

/**
 * The latitude an EPSG:3857 northing sits at, in degrees.
 *
 * Both engines hold their working coordinates projected — an OpenLayers geometry, a
 * MapLibre mercator position — so the latitude the scale factor needs usually has to come
 * back out of one. Doing it here rather than reprojecting a point through a map library
 * keeps the rule in the map-agnostic half.
 */
export function latitudeFromMercatorY(y: number): number {
    return (2 * Math.atan(Math.exp(y / EARTH_RADIUS_METERS)) - Math.PI / 2) * (180 / Math.PI);
}

/**
 * Web Mercator's latitude limit, ±85.051129 degrees — where the projection reaches the
 * square world's edge and beyond which it runs to infinity at the pole.
 *
 * **Both renderers need to agree on it, and they did not.** MapLibre's `toMercator`
 * clamped to this and OpenLayers' transform did not, so a graphic that reaches past the
 * limit came out as two different pictures: the sample sweep's range fan at 89 degrees
 * south measured 39,204 x 9,203 km on OpenLayers and 39,204 x **0** on MapLibre, where the
 * clamp folds every point beyond the limit onto one line.
 *
 * Neither picture is *right* — a circle drawn around a pole spans every longitude, and
 * Mercator has no way to say that — but a renderer must not invent its own answer to a
 * question the projection has a standard answer to. Clamping is that answer: it is the
 * edge of the tiled world, and what MapLibre, OpenLayers' own view constraints and every
 * tile scheme use.
 */
export const MERCATOR_MAX_LATITUDE = 85.0511287798066;

/** A latitude held inside the projectable world. @see MERCATOR_MAX_LATITUDE */
export function clampToMercator(latitude: number): number {
    return Math.max(-MERCATOR_MAX_LATITUDE, Math.min(MERCATOR_MAX_LATITUDE, latitude));
}

/**
 * The same geometry with every latitude inside the projectable world.
 *
 * Applied by each renderer at the door where the library's lon/lat becomes projected
 * metres, so both draw the same bounded picture of a shape that reaches past the limit
 * rather than one smearing it and the other flattening it.
 *
 * Structure-preserving and allocation-free when nothing needs clamping — which is every
 * graphic outside the polar caps, i.e. all of them in practice.
 */
export function clampGeometryToMercator<T>(geometry: T): T {
    const walk = (node: unknown): unknown => {
        if (!Array.isArray(node) || !node.length) return node;
        if (typeof node[0] === 'number') {
            const [lon, lat] = node as number[];
            const held = clampToMercator(lat);
            return held === lat ? node : [lon, held, ...(node as number[]).slice(2)];
        }
        let changed = false;
        const mapped = node.map(child => {
            const next = walk(child);
            if (next !== child) changed = true;
            return next;
        });
        return changed ? mapped : node;
    };

    const shape = geometry as unknown as {type?: string; geometries?: unknown[]; coordinates?: unknown};
    if (shape?.type === 'GeometryCollection' && Array.isArray(shape.geometries)) {
        return {...shape, geometries: shape.geometries.map(g => clampGeometryToMercator(g))} as unknown as T;
    }
    if (shape?.coordinates === undefined) return geometry;
    const coordinates = walk(shape.coordinates);
    return coordinates === shape.coordinates ? geometry : ({...shape, coordinates} as unknown as T);
}
