import {
    TacticalGraphicName,
    CENTER_SYMBOL_GRAPHICS,
    escortSymbolSizePx,
    followTaskSymbol,
    securityOperationSymbol,
} from '@zaes/tactical-graphics';
import type {PaintContext} from '@zaes/tactical-graphics';
import {toLonLat, toMercator} from './projection';
import type {MapLibreTacticalGraphic} from './maplibreAdapter';

/*
 * Where the six graphics that carry a host-supplied unit symbol put it. Lives beside the
 * adapter rather than in the MapLibre renderer because it needs only the built graphic,
 * so any renderer that builds from the adapter can place the symbol without the MapLibre one.
 */

/**
 * Where an escort's centre symbol goes, and how big.
 *
 * **Read off the base, not the rendered graphic.** Everything this pass emits goes into a
 * GeoJSON source, so it has to be lon/lat, and the base is the one geometry guaranteed to
 * be — which is why the security operations beside it use `graphic.base` too. Taking the
 * rendered bar instead put the symbol nowhere at all.
 *
 * 343600 numbers points 2 and 3 as the ends of the bar, so their midpoint is where the
 * paint layer cuts the break. The size comes from the bar's on-screen span through the
 * same function the paint sizes that break with. @see escortSymbolSizePx
 */
function escortCenter(
    graphic: MapLibreTacticalGraphic,
    resolution: number,
): {at: number[]; sizePx: number} | undefined {
    const base = graphic.base.geometry;
    if (base.type !== 'LineString' || base.coordinates.length < 3) return undefined;

    const start = base.coordinates[1] as number[];
    const end = base.coordinates[2] as number[];
    const a = toMercator([start[0], start[1]]);
    const b = toMercator([end[0], end[1]]);
    const spanPx = Math.hypot(b[0] - a[0], b[1] - a[1]) / resolution;
    if (!(spanPx > 0)) return undefined;

    return {
        at: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
        sizePx: escortSymbolSizePx(spanPx),
    };
}

/**
 * Where a graphic's host-supplied unit symbol goes, and how big it is — for whichever of the
 * six carries one.
 *
 * **A function of its own, because the dispatch is the part that broke.** The three arms
 * below each ask the library the question its own family answers; the bug was in which arm a
 * graphic reached. Cover, guard and screen fell to a fourth arm that required a `Point` base
 * — which they had until 2026-08-29, when APP-06's four anchor points made the base a
 * `LineString`. The arm has been unreachable ever since, so the security operations drew with
 * an empty centre on this engine while OpenLayers drew the symbol, and nothing could see it:
 * the selection was inline in a method that needs a live map.
 *
 * Returns nothing for a graphic with no centre symbol, and for one whose host has registered
 * no provider — an empty centre is a supported state. @see CENTER_SYMBOL_GRAPHICS
 */
export function centerSymbolPlacement(
    graphic: MapLibreTacticalGraphic,
    context: PaintContext,
): {at: number[]; sizePx: number} | undefined {
    if (!CENTER_SYMBOL_GRAPHICS.has(graphic.name)) return undefined;
    // The escort is the one placed from its **base**: its bar's two ends are numbered anchor
    // points and the paint cuts the break between them. The other five are read out of the
    // drawn line work, through the same function the paint leaves room with.
    if (graphic.name === TacticalGraphicName.Escort) return escortCenter(graphic, context.resolution);
    if (graphic.name === TacticalGraphicName.FollowAndAssume || graphic.name === TacticalGraphicName.FollowAndSupport) {
        return followTaskCenter(graphic, context);
    }
    return securityOperationCenter(graphic, context);
}

/**
 * The unit symbol's place inside a follow task's body.
 *
 * Asked of the library rather than worked out here: the paint cuts the body to the same
 * answer, and a symbol placed from a second calculation does not sit in its own hole.
 *
 * Exported for its test only; it is not on the `/maplibre` barrel. @see followTaskSymbol
 */
export function followTaskCenter(
    graphic: MapLibreTacticalGraphic,
    context: PaintContext,
): {at: number[]; sizePx: number} | undefined {
    /*
     * **The rendered geometry, used as it is.** It is already in projected metres —
     * `buildTacticalGraphic` projects it on the way out and every paint function is handed
     * it in that frame — so running it through `projectGeometry` a second time read those
     * metres as degrees. Measured: a body whose centre sits at x = 7,532,595 came back at
     * 828,283,312,397 with the latitude clamped to Mercator's limit, so the icon was
     * registered and placed a hundred thousand worlds off the map. The two follow tasks drew
     * with no unit symbol at all. (User's report, 2026-09-07.)
     */
    const placement = followTaskSymbol(
        {geometry: graphic.graphic.geometry, properties: {...graphic.properties, symbolId: graphic.id}} as never,
        context,
    );
    if (!placement) return undefined;
    return {at: toLonLat([placement.at[0], placement.at[1]]), sizePx: placement.sizePx};
}

/**
 * The unit symbol's place between a security operation's two arms.
 *
 * **Read from the drawn line work, not from the base's shape.** These were placed on a
 * single anchor point until 2026-08-29 and this branch still tested for one, so once APP-06's
 * four anchor points made the base a `LineString` the test stopped matching and cover, guard
 * and screen drew with an empty centre on this engine while OpenLayers drew the symbol.
 *
 * `securityOperationSymbol` is the library's own statement of where the centre is and how
 * big the gap between the arms leaves the symbol, and it is the function the OpenLayers
 * style already calls — so the two engines cannot put the symbol in two places.
 *
 * Exported for its test only; it is not on the `/maplibre` barrel.
 * @see securityOperationCentre
 */
export function securityOperationCenter(
    graphic: MapLibreTacticalGraphic,
    context: PaintContext,
): {at: number[]; sizePx: number} | undefined {
    const placement = securityOperationSymbol(
        {geometry: graphic.graphic.geometry, properties: {...graphic.properties, symbolId: graphic.id}} as never,
        context,
    );
    if (!placement) return undefined;
    return {at: toLonLat([placement.at[0], placement.at[1]]), sizePx: placement.sizePx};
}
