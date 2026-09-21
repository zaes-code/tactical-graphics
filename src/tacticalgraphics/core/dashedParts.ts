import {TacticalGraphicName} from './type';

/**
 * Which parts of a graphic's generated `MultiLineString` are drawn dashed, by index.
 *
 * These are the graphics whose dashes are **the symbol, not its status**: a counterattack
 * is dashed when it is present, a feint's chevron is always broken, a ford's two bars are
 * always hashed. They used to be cut into the geometry in meters by `lineStringToDashes`,
 * which made every dash a share of the graphic: zoom in and they grew into bars with no
 * ceiling, zoom out and they fell under a pixel and the line read as solid. On one symbol
 * they also came out a different size from the status dash beside them.
 *
 * So the generators now hand these parts over whole, and the dash is a stroke property
 * like every other dash in the library, sized on screen. `renderTacticalGraphic` stamps
 * the answer on the graphic feature as `dashedParts`, so a consumer drawing the GeoJSON
 * without either renderer can dash the same parts, exactly as it already has to for
 * `status: planned`. @see withFittedDashes
 */
export const DASHED_PARTS: Readonly<Partial<Record<TacticalGraphicName, readonly number[]>>> = {
    // [left rail, arrowhead, right rail, chevron]
    [TacticalGraphicName.MainAxisOfAdvanceFeint]: [3],
    // [base line, arrowhead, chevron]
    [TacticalGraphicName.DirectionOfMainAttackFeint]: [2],
    // [outline]
    [TacticalGraphicName.Counterattack]: [0],
    // [outline, by-fire bar, shaft, head]: the shaft and head are the only solid lines
    [TacticalGraphicName.CounterattackByFire]: [0, 1],
    // [shaft, head, tail stroke, tail stroke]
    [TacticalGraphicName.Exploitation]: [2, 3],
    // [upper bar, lower bar]
    [TacticalGraphicName.FordEasy]: [0, 1],
    // [upper bar, lower bar, zigzag]
    [TacticalGraphicName.FordDifficult]: [0, 1],
};

/** The dashed part indices of `name`'s graphic, or an empty list for a graphic with none. */
export function dashedPartsOf(name: TacticalGraphicName | string): readonly number[] {
    return DASHED_PARTS[name as TacticalGraphicName] ?? [];
}
