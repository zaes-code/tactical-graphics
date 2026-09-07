/**
 * # The width grip sits on the corner the plate letters
 *
 * Every arrow in the movement family publishes three handles — a rear, a tip, and one that
 * states the width. APP-06 numbers that third one, and puts it on a side:
 *
 * > **151403 main attack.** The symbol requires N anchor points, where N is between 3 and 50.
 * > Point 1 defines the tip of the arrowhead. Point N-1 defines the rear of the symbol.
 * > **Point N defines the back of the arrowhead.**
 *
 * The rule names the point but not which of the back's two corners it is; the **Template**
 * does, and 151402's on the same page letters it identically. `PT N`'s leader lands on the
 * corner lying to the **right of point 1 → point 2** — the direction from the tip toward the
 * rear, which is the order these graphics store their points in.
 *
 * The grip was drawn on the other corner: the one the plate leaves unlettered. Nothing caught
 * it, because a side is not a count and no assertion here had ever named one — the symbol was
 * right, its handle was on the wrong half of it. (User's report, 2026-09-06, with the wanted
 * position drawn on a screenshot; confirmed against the plate before changing anything.)
 *
 * Asserted as a **side**, not a position, because that is the whole claim. Where along the
 * back edge the grip sits is a drawing decision the plate does not make.
 */
import type {Feature, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';
import {renderTacticalGraphic} from '../core/render';
import {generatorOrder} from '../core/drawOrder';
import {TacticalGraphicName} from '../core/type';

/**
 * Every graphic whose generator extends `MovementGraphicBase` and so inherits the one
 * `generateHandles` under test. One method, one plate reading, one list.
 */
const FAMILY = [
    TacticalGraphicName.MainAxisOfAdvance,
    TacticalGraphicName.MainAxisOfAdvanceFeint,
    TacticalGraphicName.SupportingAxisOfAdvance,
    TacticalGraphicName.AviationAxisOfAdvance,
    TacticalGraphicName.AttackHelicopterAxisOfAdvance,
    TacticalGraphicName.Counterattack,
    TacticalGraphicName.CounterattackByFire,
    TacticalGraphicName.AvenueOfApproach,
];

/** A three-click arrow: the tip, a bend, and the rear — stored tip-first. */
const STORED: Position[] = [[-1, 20], [0, 20.8], [1.4, 20.3]];

const handlesOf = (name: TacticalGraphicName, coords: Position[]) =>
    (renderTacticalGraphic({
        type: 'Feature',
        properties: {tacticalGraphic: {name}},
        geometry: {type: 'LineString', coordinates: coords},
    } as Feature).handles.geometry as MultiPoint).coordinates;

/**
 * Which side of `a → b` the point `p` falls on: **+1 to the right, −1 to the left.**
 *
 * Bearings rather than a planar cross product, because a cross product of lon/lat pairs is a
 * cross product of two different units — the error grows with latitude and changes sign at
 * no particular place. The bearing difference, folded into ±180, is a side anywhere.
 */
function side(a: Position, b: Position, p: Position): number {
    const along = turf.bearing(turf.point(a), turf.point(b));
    const toPoint = turf.bearing(turf.point(a), turf.point(p));
    const turn = ((toPoint - along + 540) % 360) - 180;
    return Math.sign(turn);
}

describe("the movement family's width grip", () => {
    it.each(FAMILY.map(n => [String(n), n] as const))(
        '%s puts it right of point 1 → point 2, where the Template letters PT N',
        (_label, name) => {
            const [rear, tip, width] = handlesOf(name, STORED);
            expect(width).toBeDefined();

            // Point 1 is the tip and point 2 the next point along, in the order the base is
            // *stored* — which is tip-first for this family, so the stored line is already
            // the direction the plate numbers along. @see TIP_FIRST_GRAPHICS
            expect(side(STORED[0], STORED[1], width)).toBe(1);

            // And the other two grips are the ends they claim to be, so a reversal of the
            // base could not quietly satisfy the assertion above by relabelling them.
            const built = generatorOrder(name, STORED);
            const metres = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});
            expect(metres(rear, built[0])).toBeLessThan(1);
            expect(metres(tip, built[built.length - 1])).toBeLessThan(1);
        },
    );

    it.each(FAMILY.map(n => [String(n), n] as const))(
        '%s keeps it on that side when the arrow is drawn the other way about',
        (_label, name) => {
            // A side derived from the shape rather than hardcoded has to survive the mirror.
            // The reflected arrow is the same figure drawn anticlockwise, so its grip must
            // still be right of its own point 1 → point 2 — a fixed answer fails one of the
            // two. @see turnBulgesLeft for the same test on the cane arrows.
            const mirrored: Position[] = STORED.map(([lon, lat]) => [lon, 41 - lat] as Position);
            const [, , width] = handlesOf(name, mirrored);
            expect(side(mirrored[0], mirrored[1], width)).toBe(1);
        },
    );
});
