import {Feature, LineString, Position} from 'geojson';
import {TacticalGraphicName} from './type';

/**
 * # Which end of a drawn line is the arrowhead
 *
 * APP-06 Edition E describes every arrow symbol by numbered anchor points, and it numbers
 * the **arrowhead first**. Avenue of Approach (152300) is the type specimen, and the
 * sentence is repeated word for word across the whole offensive-manoeuvre family:
 *
 * > Anchor Points. The symbol requires N anchor points, where N is between 3 and 50.
 * > **Point 1 defines the tip of the arrowhead.** Point N-1 defines the rear of the
 * > symbol. Point N defines the back of the arrowhead.
 *
 * The library drew them the other way round: the generators build their heads at
 * `coordinates[coordinates.length - 1]`, so the arrow landed on the user's *last* click
 * and the stored base ran rear to tip. Nothing rendered wrong -- an arrow points where it
 * was aimed either way -- but the saved point list was the reverse of the one the standard
 * describes, and the app contradicted itself: the six graphics converted to drawn anchors
 * in 2026-08 (Turn, Ambush, Pursuit, Envelopment, Contain, Tactical Turn) *do* follow
 * APP-06's numbering, so a Turn took its arrowhead from the first click while an Avenue of
 * Approach drawn with the identical drag took it from the last.
 *
 * **FM 1-02.2 does not enter into it.** The field manual prints the drawn symbol and the
 * orientation it carries ("the arrow points in the direction the convoy is moving"); it
 * publishes no anchor-point numbering at all, for any graphic. APP-06 is the only
 * authority on point order, which is why this table is stated in APP-06's terms.
 *
 * ## What this module does, and does not, change
 *
 * The **stored** base -- what the user drew, what persistence saves, what an exchange
 * format would carry -- is APP-06's order for the graphics listed here. That is the tip
 * for almost all of them; for the two blocks it is the vertical bar and for fields of fire
 * the vertex, because those are the ends *their* rules number first. The list is "the
 * standard numbers this graphic from the other end", not "this graphic has an arrow". The **generators** are untouched: `TacticalGraphicsBase.generate` hands them a
 * reversed copy, so every shape, decoration size and handle contract is exactly what it
 * was. One statement, read by both renderers, rather than thirty-odd edits across fifteen
 * generators and the holders that measure them.
 *
 * Two things it deliberately leaves alone. APP-06 spends its **last** point on the
 * arrow's width ("Point N determines the width"); this library carries width as a
 * `width` / `radius` amplifier in metres instead, which is a different divergence and not
 * one a reversal can fix. And graphics whose rule already numbers the tip last --
 * Exfiltrate and Infiltrate (343700 / 343800) put it at point 3, the swept-arc tasks at
 * point 4 -- are conformant as they stand and are **not** listed here.
 *
 * @see ai/app-6.md, "the eight point-anchored conversions"
 * @see drawnAnchors.ts, which is the same rule for the six graphics that store anchors
 */

/**
 * The graphics whose drawn point 1 is the end APP-06 numbers first: the arrowhead, except
 * for the two blocks, whose bar it is, and fields of fire, whose vertex.
 *
 * The trailing comment is the APP-06 entity code and the clause that puts that end first.
 * `drawOrder.test.ts` reads these codes back out of `GRAPHIC_ENTITY_CODES`, so a graphic
 * cannot be listed here under a code it does not carry.
 */
export const TIP_FIRST_GRAPHICS: readonly string[] = [
    // -- The N-point offensive arrows. One rule, quoted above, shared by all of them --
    TacticalGraphicName.AvenueOfApproach,                 // 152300
    TacticalGraphicName.MainAxisOfAdvance,                // 151403 Main Attack
    TacticalGraphicName.MainAxisOfAdvanceFeint,           // 151406 Feint
    TacticalGraphicName.SupportingAxisOfAdvance,          // 151404 Supporting Attack
    TacticalGraphicName.AviationAxisOfAdvance,            // 151401 Airborne/Aviation
    TacticalGraphicName.AttackHelicopterAxisOfAdvance,    // 151402 Attack Helicopter
    // Registered without an enum member -- the axis family's fifth variant, reachable
    // through the registry but not through the UI. @see ai/context.md, "Counts"
    'AxisOfAttack',
    TacticalGraphicName.FollowAndAssume,
    TacticalGraphicName.FollowAndSupport,
    TacticalGraphicName.Counterattack,                    // 340600 Counter-Attack
    TacticalGraphicName.CounterattackByFire,              // 340700 Counter-Attack by Fire
    TacticalGraphicName.AdvanceToContact,                 // 342900
    TacticalGraphicName.FrontalAttack,                    // 152700
    TacticalGraphicName.TurningMovement,                  // 152900
    TacticalGraphicName.MobileDefense,                    // 152800 "Point 1 defines the tip of the arrowhead"

    // -- The cane: a straight run into an arrowhead, with a 180-degree arc at the back --
    // "Point 1 defines the tip of the arrowhead. Point 2 defines the end of the straight
    // line portion. Point 3 defines the diameter and orientation of the arc."
    TacticalGraphicName.Delay,                            // 340800
    TacticalGraphicName.Withdraw,                         // 342400
    TacticalGraphicName.WithdrawUnderPressure,            // 342500
    TacticalGraphicName.Disengage,                        // 344400
    TacticalGraphicName.Retirement,                       // 342000 Retire
    TacticalGraphicName.ForwardPassageOfLines,            // 344100
    TacticalGraphicName.RearwardPassageOfLines,           // 344200
    TacticalGraphicName.Exploitation,                     // 343100 Exploit

    // -- Mission tasks drawn as a route into a front --
    TacticalGraphicName.Fix,                              // 270503 obstacle effect
    TacticalGraphicName.TacticalFix,                      // 341100 mission task
    // The block family's three-point rule names the front feature first and the rear
    // last: "Points 1 and 2 define the tips of the arrowheads and point 3 defines the
    // rear" (Bypass), and the same shape for the opening, the vertical line and the
    // arrows. We carry the front's width as an amplifier rather than as a second point,
    // so what reverses here is which end of the drawn line the front sits on.
    TacticalGraphicName.Bypass,                           // 340300
    TacticalGraphicName.Canalize,                         // 340400
    TacticalGraphicName.Clear,                            // 340500
    TacticalGraphicName.Breach,                           // 340200
    // **The two blocks have no arrowhead and belong here anyway.** 270501 and 340100 read
    // "Points 1 and 2 define the endpoints of the symbol's vertical line. Point 3 defines
    // the endpoint of the symbol's horizontal line" -- the bar the enemy runs into is
    // numbered first and the tail last, and we drew the bar on the last vertex. Found by
    // widening the sweep past the word "arrowhead", which is how their four siblings in
    // the same holder were found. Disrupt is *not* here: its vertical line is the rear of
    // its trident and 270502 numbers the longest arrow's tip third, which is where ours
    // already is.
    TacticalGraphicName.Block,                            // 270501 obstacle effect
    TacticalGraphicName.TacticalBlock,                    // 340100 mission task
    TacticalGraphicName.Penetration,                      // 341800 Penetrate
    TacticalGraphicName.ReliefInPlace,                    // 341900 "Point 1 defines the tip of the first arrowhead"

    // -- The V --
    // 140500 is the one that does not read "tip first": "Point 1 defines the **vertex**
    // of the symbol. Points 2 and 3 define the tips of the arrowheads." Its apex was
    // drawn second and sits *between* the two legs, so a reversal would only swap the
    // legs and leave the vertex in the middle. It gets a swap instead. @see SWAP_FIRST_TWO
    TacticalGraphicName.FieldsOfFire,                     // 140500
];

/**
 * The graphics whose points are reordered by something other than a reversal.
 *
 * Only fields of fire so far, and only because its apex is the **middle** vertex of a
 * three-point base: `[end, apex, end]` is what the generator reads, `[apex, end, end]` is
 * APP-06's numbering, and swapping the first two carries one into the other -- for the
 * two-point sketch a user has drawn halfway through, as well as for the finished V.
 *
 * Swapping two elements is its own inverse, exactly as reversal is, so the same function
 * serves both directions here too.
 */
const SWAP_FIRST_TWO = new Set<string>([TacticalGraphicName.FieldsOfFire]);

const TIP_FIRST = new Set<string>(TIP_FIRST_GRAPHICS);

/**
 * Whether this graphic files its points in APP-06's order rather than rear-to-tip -- so
 * point 1 is its arrowhead, or the bar on a block, or the vertex of a fields of fire.
 *
 * The question a draw tool, a properties panel, a sample sheet or a test needs answered.
 */
export function drawsTipFirst(name: TacticalGraphicName | string | undefined): boolean {
    return name !== undefined && TIP_FIRST.has(name);
}

/**
 * The coordinates a **generator** reads: rear first, tip last, which is the convention
 * every `generateGraphics` in this package was written against.
 *
 * Reversal is its own inverse, so this and {@link storedOrder} are the same operation
 * named twice. They are named twice on purpose: at a call site "which direction is this"
 * is the whole question, and `reverse()` does not answer it.
 */
export function generatorOrder(name: TacticalGraphicName | string | undefined, coords: Position[]): Position[] {
    if (!drawsTipFirst(name) || coords.length < 2) return coords;
    if (SWAP_FIRST_TWO.has(name as string)) {
        const swapped = [...coords];
        [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
        return swapped;
    }
    return [...coords].reverse();
}

/**
 * The coordinates a **base** carries: APP-06's order, tip first.
 *
 * For turning a rear-to-tip path into a base a user could have drawn -- the sample
 * galleries build their bases that way, and so does anything replaying legacy geometry.
 */
export function storedOrder(name: TacticalGraphicName | string | undefined, coords: Position[]): Position[] {
    return generatorOrder(name, coords);
}

/**
 * The feature a generator should be handed: the caller's own, unless this graphic stores
 * its points tip-first and has a line to reverse.
 *
 * Returns the *same object* when nothing needs doing, so the common path allocates
 * nothing and a generator that compares identities still sees what it was given.
 */
export function featureInGeneratorOrder(name: TacticalGraphicName | string | undefined, feature: Feature): Feature {
    if (!drawsTipFirst(name)) return feature;
    const geometry = feature.geometry as LineString | undefined;
    if (!geometry || geometry.type !== 'LineString' || geometry.coordinates.length < 2) return feature;

    return {
        ...feature,
        geometry: {...geometry, coordinates: generatorOrder(name, geometry.coordinates)},
    };
}
