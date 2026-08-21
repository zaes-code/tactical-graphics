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
 * `size` slot. That made the map-agnostic half consume meters-per-pixel while its schema
 * promised meters, so anyone calling `renderTacticalGraphic` with a real distance got a
 * graphic 15-20x too large — silently.
 *
 * Moving them here changes nothing on screen: `20 * resolution` is the same number
 * whichever side of the boundary multiplies. What changes is that the generator now
 * consumes the meters it documents, and the viewport quantity stays in the renderer
 * where it belongs.
 *
 * @see ai/decisions.md, "size is meters-per-pixel in six generators"
 */
const DECORATION_PX: Partial<Record<TacticalGraphicName, number>> = {
    [TacticalGraphicName.DirectionOfMainAttack]: 20,
    [TacticalGraphicName.DirectionOfSupportingAttack]: 20,
    [TacticalGraphicName.DirectionOfMainAttackFeint]: 20,
    [TacticalGraphicName.AviationDirectionOfAttack]: 20,
    [TacticalGraphicName.FieldsOfFire]: 20,
    // The zigzag's half-wavelength: the distance from one apex to the next. Driving the
    // symbol off a screen size rather than off the drawn length is what lets a long
    // obstacle carry *more* teeth instead of bigger ones. @see Fix
    [TacticalGraphicName.Fix]: 14,
    [TacticalGraphicName.TacticalFix]: 14,
    [TacticalGraphicName.PassageLane]: 20,
    [TacticalGraphicName.FerryCrossing]: 15,
    [TacticalGraphicName.Bridge]: 15,
    [TacticalGraphicName.Gap]: 15,
    [TacticalGraphicName.AssaultCrossing]: 15,
    [TacticalGraphicName.Encirclement]: 20,

    // Abatis. APP-06 280100 is explicit that "the size of the tooth does not change"
    // as the drawn line lengthens, which is precisely what this table is for. Sized
    // between the wire marks (14) and the anti-tank teeth (30): it is one tooth
    // rather than a run of them, so it has to read on its own.
    [TacticalGraphicName.Abatis]: 26,

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
 * The default decoration size in meters for `name` at `resolution`.
 *
 * Falls back to 1 px worth for graphics that carry no baked decoration — they ignore the
 * value, and passing the bare resolution is what they got before.
 */
export const decorationMeters = (name: TacticalGraphicName, resolution: number): number =>
    (DECORATION_PX[name] ?? 1) * resolution;

/**
 * Whether this graphic's `size` option *is* a decoration size.
 *
 * For the graphics in the table above, `size` means "how big is the chevron / the X
 * / the tick", not "how far does this reach" — so it belongs to the renderer, which
 * knows the zoom, rather than to a caller passing a ground distance. Handing one of
 * them a `radius` meant for reach draws a bridge tick kilometers tall.
 *
 * Exported so a renderer can tell the two meanings apart without keeping its own
 * copy of the list.
 */
export function hasBakedDecoration(name: TacticalGraphicName): boolean {
    return DECORATION_PX[name] !== undefined;
}

/**
 * Arrowhead length in screen pixels at the drawing zoom, for the two point-anchored
 * curves that take it as a **flat distance** rather than a fraction of their size.
 *
 * Deliberately not in `DECORATION_PX`: for the graphics in that table `size` *is* the
 * decoration, so a renderer overrides `radius` with it. These two have a real reach
 * as well — the run and the circle — so the arrowhead travels as `decorationSize`
 * instead, and `radius` keeps meaning what it means everywhere else. Feeding them
 * through the other table would set the arrowhead's length as the graphic's size.
 *
 * `headSize` is a flat distance so the arrowhead survives a resize at the size it
 * was drawn — a fraction of `size` grows with the graphic, which is what the
 * generators fall back to and what made a second renderer draw a visibly smaller
 * head than OpenLayers.
 */
const ARROWHEAD_PX: Partial<Record<TacticalGraphicName, number>> = {
    [TacticalGraphicName.Turn]: 26,
    [TacticalGraphicName.TacticalTurn]: 26,
    [TacticalGraphicName.Envelopment]: 22,
};

/** The arrowhead length this graphic is drawn with, in meters, or undefined. @see ARROWHEAD_PX */
export function arrowheadMeters(name: TacticalGraphicName, resolution: number): number | undefined {
    const px = ARROWHEAD_PX[name];
    return px === undefined ? undefined : px * resolution;
}

/**
 * Half-extent of a crossed mission task, in screen pixels.
 *
 * Destroy, Interdict, Neutralize and Suppress are **fixed-size symbols**: they refuse
 * resize, so their size is never a number the user chose — it is a screen constant
 * times the resolution they were drawn at, exactly like a security operation's.
 *
 * It lived as `res * 50` inside a factory in the OpenLayers controller registry, so
 * MapLibre had no way to know it and fell back to the generic 40 km default. Measured
 * side by side, the same Destroy drew at 489,197 m in one engine and 40,000 m in the
 * other — a symbol an order of magnitude smaller, from a number written in a file the
 * other renderer cannot see.
 */
export const CROSSED_MISSION_TASK_PX = 50;

/**
 * That half-extent in meters at a given resolution, or `undefined` when there is no
 * resolution to spend — a caller with no viewport cannot size a screen-constant symbol.
 */
export function crossedMissionTaskMeters(drawingResolution?: number): number | undefined {
    return drawingResolution ? CROSSED_MISSION_TASK_PX * drawingResolution : undefined;
}
