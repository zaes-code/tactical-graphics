import {TacticalGraphicName} from '@zaes/tactical-graphics';

/**
 * How large, in screen pixels at the drawing zoom, each graphic's baked-in decoration is
 * meant to be.
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
};

/**
 * The default decoration size in metres for `name` at `resolution`.
 *
 * Falls back to 1 px worth for graphics that carry no baked decoration — they ignore the
 * value, and passing the bare resolution is what they got before.
 */
export const decorationMetres = (name: TacticalGraphicName, resolution: number): number =>
    (DECORATION_PX[name] ?? 1) * resolution;
