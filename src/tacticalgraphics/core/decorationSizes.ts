import {TacticalGraphicName} from './type';

/**
 * How large, in screen pixels at the drawing zoom, each graphic's baked-in decoration is
 * meant to be.
 *
 * **Symbology, so it lives in the map-agnostic half.** It says how big a decoration
 * should look, which is the same answer for any renderer; only the multiplication by
 * a live resolution belongs to one. It was in `openlayers/graphics/decorationPx.ts`
 * until MapLibre needed it, and that file re-exports it so nothing else moved.
 * A second renderer guessing one number for all of them drew bridge and gap at
 * nearly twice the size OpenLayers does.
 *
 * These constants used to live *inside* the generators as `size * 20` / `size * 15`,
 * which only worked because the holders passed the map resolution into the generator's
 * `size` slot. That made the map-agnostic half consume metres-per-pixel while its schema
 * promised metres, so anyone calling `renderTacticalGraphic` with a real distance got a
 * graphic 15-20x too large — silently.
 *
 * Moving them here changes nothing on screen: `20 * resolution` is the same number
 * whichever side of the boundary multiplies. What changes is that the generator now
 * consumes the metres it documents, and the viewport quantity stays in the renderer
 * where it belongs.
 *
 * @see ai/decisions.md, "size is metres-per-pixel in six generators"
 */
const DECORATION_PX: Partial<Record<TacticalGraphicName, number>> = {
    [TacticalGraphicName.DirectionOfMainAttack]: 20,
    [TacticalGraphicName.DirectionOfSupportingAttack]: 20,
    [TacticalGraphicName.DirectionOfMainAttackFeint]: 20,
    [TacticalGraphicName.AviationDirectionOfAttack]: 20,
    [TacticalGraphicName.FieldsOfFire]: 20,
    [TacticalGraphicName.PassageLane]: 20,
    [TacticalGraphicName.FerryCrossing]: 15,
    [TacticalGraphicName.Bridge]: 15,
    [TacticalGraphicName.Gap]: 15,
    [TacticalGraphicName.AssaultCrossing]: 15,
    [TacticalGraphicName.Encirclement]: 20,

    // The wire obstacles. Their mark width is the unit the whole density ladder is built
    // from — gaps are counted in mark widths — so this one number sets both the size of
    // the X and the spacing between groups. Omitting them was not a missing tuning value
    // but a bug: the fallback below is 1 px, so every wire graphic drew a one-pixel X and
    // looked like a bare line until you zoomed several levels in.
    [TacticalGraphicName.WireUnspecified]: 14,
    [TacticalGraphicName.WireSingleFence]: 14,
    [TacticalGraphicName.WireDoubleFence]: 14,
    [TacticalGraphicName.WireDoubleApronFence]: 14,
    [TacticalGraphicName.WireLowWireFence]: 14,
    [TacticalGraphicName.WireHighWireFence]: 14,
    [TacticalGraphicName.WireSingleConcertina]: 14,
    [TacticalGraphicName.WireDoubleStrandConcertina]: 14,
    [TacticalGraphicName.WireTripleStrandConcertina]: 14,
};

/**
 * The default decoration size in metres for `name` at `resolution`.
 *
 * Falls back to 1 px worth for graphics that carry no baked decoration — they ignore the
 * value, and passing the bare resolution is what they got before.
 */
export const decorationMetres = (name: TacticalGraphicName, resolution: number): number =>
    (DECORATION_PX[name] ?? 1) * resolution;

/**
 * Whether this graphic's `size` option *is* a decoration size.
 *
 * For the graphics in the table above, `size` means "how big is the chevron / the X
 * / the tick", not "how far does this reach" — so it belongs to the renderer, which
 * knows the zoom, rather than to a caller passing a ground distance. Handing one of
 * them a `radius` meant for reach draws a bridge tick kilometres tall.
 *
 * Exported so a renderer can tell the two meanings apart without keeping its own
 * copy of the list.
 */
export function hasBakedDecoration(name: TacticalGraphicName): boolean {
    return DECORATION_PX[name] !== undefined;
}
