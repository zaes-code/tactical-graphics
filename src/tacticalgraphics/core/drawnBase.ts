/**
 * # Tidying up what a user actually drew
 *
 * Between the last click and the stored base there is a step both renderers need and
 * neither owned: turning the raw click sequence into a base the generator and the
 * edit handles can both work with.
 *
 * It exists because a **double-click broke fields of fire in both engines, by two
 * different routes**, and the fix belongs in one place rather than two:
 *
 * - OpenLayers ended the draw at two vertices. The generator then synthesized the
 *   second leg at a fixed angle on every render, so the V was real but frozen —
 *   dragging a leg swung the other one with it and the angle never changed.
 * - MapLibre delivers a double-click's two clicks as ordinary `click`s first, so the
 *   apex went in twice. That reached the three-vertex count and finished the draw
 *   with a leg of zero length: no V to open, and the tip handle sitting exactly on
 *   the apex handle.
 *
 * Both produced the same complaint — the V angle cannot be modified — so both are
 * repaired the same way: drop the repeated vertex, then **materialise** the leg the
 * generator would have synthesized, so it is a real vertex with a real handle that a
 * user can drag. The default-angle V a double-click produces is then a starting
 * point rather than a cage.
 */

import type {Position} from 'geojson';
import {asVee} from '../graphics/FieldsOfFire';
import {TacticalGraphicName} from './type';
import {generatorOrder, storedOrder} from './drawOrder';
import {carriesSeparationInBase} from './handles';
import geometryService from './GeometryService';
import {
    anchorsForArcAndArrow,
    anchorsForBow,
    anchorsForRunAndArc,
    ARC_ARROW_DEFAULT_REACH,
    bowFromAnchors,
    hairpinAnchors,
    runAndArcFromAnchors,
} from './anchors';
import * as turf from './turf';

/**
 * Two positions that are the same position.
 *
 * Degrees rather than pixels, because this runs after the gesture is over and has no
 * view to ask. Small enough to catch only an exactly-repeated click — about a
 * centimeter at the equator — since a user placing two vertices deliberately close
 * together still means both of them.
 */
const DUPLICATE_EPSILON_DEG = 1e-7;

const samePosition = (a: Position, b: Position): boolean =>
    Math.abs(a[0] - b[0]) < DUPLICATE_EPSILON_DEG && Math.abs(a[1] - b[1]) < DUPLICATE_EPSILON_DEG;

/**
 * How far point 2 sits off the chord on an exfiltration or infiltration, in screen pixels.
 *
 * The S's depth. Below the floor the two 90-degree arcs are too tight to read as an S at
 * all — the symbol degenerates into the straight line the chord already is — and past the
 * ceiling the kink dominates a graphic whose subject is the route. **The side stays the
 * user's**: point 2 above the first segment or below it is a real choice, and only the
 * distance is clamped. (User's call, 2026-08-27.)
 */
export const S_CURVE_MIN_OFFSET_PX = 30;
export const S_CURVE_MAX_OFFSET_PX = 100;

/** The two graphics built from {@link GeometryService.createSCurve}. */
const S_CURVE_GRAPHICS = new Set<TacticalGraphicName>([
    TacticalGraphicName.Exfiltrate,
    TacticalGraphicName.Infiltration,
]);

/**
 * Point 2 held to a readable distance from the chord, keeping the side the user chose.
 *
 * The one place in this module that **moves** a vertex rather than adding or removing one,
 * which is why it only runs when a renderer supplied a resolution: a pixel range means
 * nothing without one, and a caller that cannot say what the zoom is gets the user's point
 * back untouched.
 */
function clampSCurveAnchor(coordinates: Position[], resolution: number): Position[] {
    if (coordinates.length < 3 || !(resolution > 0)) return coordinates;

    const [a, c, b] = [coordinates[0], coordinates[1], coordinates[2]];
    const A = geometryService.project(a);
    const B = geometryService.project(b);
    const C = geometryService.project(c);

    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const chord = Math.hypot(dx, dy);
    if (chord === 0) return coordinates;

    const ux = dx / chord;
    const uy = dy / chord;
    // Signed perpendicular offset, and how far along the chord point 2 sits.
    const offset = (C[0] - A[0]) * -uy + (C[1] - A[1]) * ux;
    const along = (C[0] - A[0]) * ux + (C[1] - A[1]) * uy;

    const side = offset < 0 ? -1 : 1;
    const min = S_CURVE_MIN_OFFSET_PX * resolution;
    const max = S_CURVE_MAX_OFFSET_PX * resolution;
    const held = Math.min(max, Math.max(min, Math.abs(offset))) * side;
    if (held === offset) return coordinates;

    const moved = geometryService.unproject([
        A[0] + ux * along + -uy * held,
        A[1] + uy * along + ux * held,
    ]);
    return [a, moved, b, ...coordinates.slice(3)];
}

/**
 * The base geometry to store for a graphic the user has just drawn.
 *
 * Adds meaning that was already implied and removes what was never meant. It moves a
 * vertex the user placed in exactly one case — the S pair's point 2, held to a readable
 * offset — and only when the caller supplies the resolution that makes a pixel range
 * meaningful. A graphic with nothing to tidy comes back unchanged.
 *
 * Rings are left alone — a polygon's first and last vertex are equal on purpose, and
 * de-duplicating them would open the ring.
 *
 * **Levelling a rectangular zone is not done here**, although it is a draw-time tidy-up
 * and belongs to the same family. MapLibre runs this hook on every *build* — restore,
 * import, sweep, and after every gesture — so a rule that squares the axis onto a
 * parallel undid each rotate the moment it was applied. The draw paths level it
 * themselves. @see levelRectangleAxis
 */
export function normalizeDrawnBase(
    name: TacticalGraphicName,
    coordinates: Position[],
    resolution?: number,
): Position[] {
    if (coordinates.length < 2) return coordinates;

    const deduped = coordinates.filter((position, index) => index === 0 || !samePosition(position, coordinates[index - 1]));

    // The generator draws a V from two points by swinging the second leg. Storing that
    // leg makes it editable: `asVee` is the same function the renderer would have
    // called, so the symbol does not change shape — it just gains the handle it was
    // always missing.
    // **Through the generator's own order and back.** `asVee` reads `[end, apex]`, which
    // is the order the generator sees; what is stored is APP-06's `[apex, end]`. Handing
    // it the stored order swung the second leg about a leg *end*, so a two-click V came
    // out hinged on the wrong point. @see drawOrder.ts
    if (S_CURVE_GRAPHICS.has(name) && resolution !== undefined) {
        return clampSCurveAnchor(deduped, resolution);
    }

    if (name === TacticalGraphicName.FieldsOfFire) {
        return storedOrder(name, asVee(generatorOrder(name, deduped)));
    }

    const placed = anchorsFromClicks(name, deduped);
    if (placed) return placed;

    return deduped;
}

/**
 * The hook a half-drawn pursuit shows, as a share of the run it hangs off.
 *
 * A preview default and nothing more — 344000 states no size for the arc, and click 3 sets
 * it. A quarter keeps the semicircle clearly subordinate to the straight portion, which is
 * the proportion the plate's own template draws. @see pursuitAnchors
 */
const PURSUIT_PREVIEW_HOOK_SHARE = 0.25;

/**
 * The base a graphic whose points are a **front edge and a point across it** expects, for
 * anything that has to synthesise one — a sample sweep, a thumbnail, a round-trip fixture.
 *
 * Points 1 and 2 are the ends of a straight edge; the remaining point states a distance
 * across it, and a fourth (152100's) makes that two tips rather than one. `center` is the
 * middle of the drawn figure and `half` its half-length, both in the caller's own units, so
 * this works in lon/lat and in projected metres alike.
 *
 * **Stated here because it is a fact about the base, and it was being guessed three times.**
 * The in-app sweep laid three points along a shallow V, the catalog thumbnails laid them
 * along a gentle arc, and MapLibre's `candidateGeometries` handed out a plain two-point line
 * — each of which *builds* for these graphics, so each drew the legacy fallback rather than
 * the shape the plate describes. Thirteen graphics were squat in the sweep, squat in the
 * picker, and asserted against the wrong shape in five round-trip suites, all at once.
 * (User's report, 2026-09-06: "the sweep is still drawing an older format".)
 *
 * Ask `carriesSeparationInBase(name)` whether a graphic wants this. Fields of fire and the
 * search area are not in it and want a vee, which is a different shape and stays theirs.
 */
export function frontEdgeBase(center: Position, half: number, points = 3, acrossAt = 0.5): Position[] {
    const [cx, cy] = center;
    const across = half * 0.55;
    const edge: Position[] = [[cx - half, cy], [cx + half, cy]];
    if (points >= 4) {
        return [...edge, [cx - half * 0.75, cy - across], [cx + half * 0.75, cy - across]];
    }
    // `acrossAt` slides the third point along the edge, 0 at point 1 and 1 at point 2. It is
    // 0.5 for the graphics whose third point states a rear or a width — the distance is all
    // that is read, so the middle is the tidiest place to show it — and 1 for the ones whose
    // plate puts that point at an *end*: 270502's is "the tip of the longest arrow", which is
    // the arrow at point 2. Put in the middle, its grip drew half a symbol away from the tip
    // it holds. @see acrossPointAtEnd
    return [...edge, [cx - half + 2 * half * acrossAt, cy - across]];
}

/**
 * The base a **hairpin** graphic expects, for anything that has to synthesise one.
 *
 * 343300 demonstration and 341900 relief in place are two parallel legs closed by a half
 * turn. Their three clicks are the first leg's tip, the first leg's bend, and a point across
 * it that sizes the turn and picks its side — so a synthesised base states the legs along
 * the full run and offsets the third point across, and `hairpinAnchors` fills in the fourth.
 *
 * **Stated here for the reason `frontEdgeBase` is.** Handed the generic four-point
 * quadrilateral the sample sheet lays out, the normalisation squared it into a symbol half
 * the intended width — correct, and unreadable next to its neighbours. The turn is `across`
 * deep, so the legs are drawn a little short of the cell to leave it room.
 *
 * @param center the middle of the drawn figure, in the caller's own units
 * @param half   its half-length, likewise — so this works in lon/lat and in metres alike
 */
export function hairpinBase(center: Position, half: number): Position[] {
    const [cx, cy] = center;
    const across = half * 0.5;
    // Tip at the left, bend at the right, and the turn hanging below it: the run reads left
    // to right like every other line sample, and the arrowheads land where the eye starts.
    // The legs take the cell's full width — the turn's bulge overshoots it by a quarter,
    // which is what an arrowhead does on every other line sample too.
    return [[cx - half, cy + across / 2], [cx + half, cy + across / 2], [cx + half, cy - across / 2]];
}

/**
 * The base a synthesiser owes this graphic — a sample sweep, a thumbnail, a fixture.
 *
 * **The single answer, because the question was being answered three times and drifted.**
 * The OpenLayers sweep, MapLibre's `candidateGeometries` and the catalog generator each
 * carried their own chain of `if`s over the same library predicates, and a clause added to
 * one was simply absent from the others. 344000 pursuit is what that cost: it is a cane
 * arrow like the seven retrograde graphics, MapLibre was given an inline
 * `name === Pursuit` to put it on the front edge with them, and the OpenLayers sweep never
 * got the clause at all — so it kept drawing pursuit as a shallow V, unlike every sibling
 * it shares a shape with, through three separate reports. (User, 2026-09-06: "Pursuit, use
 * the same cane base for this 3 point graphic. I've asked for that several times now.")
 *
 * A renderer must not decide this. `undefined` means "nothing here describes a layout for
 * it" and the caller keeps its own default, which is the ordinary case.
 *
 * @param center the middle of the drawn figure, in the caller's own units
 * @param half   its half-length, likewise — so this works in lon/lat and in metres alike
 * @param points how many the base stores, where the caller knows. @see baseVertexCount
 */
export function synthesizedBase(name: TacticalGraphicName, center: Position, half: number, points = 3): Position[] | undefined {
    if (drawsAsHairpin(name)) return hairpinBase(center, half);
    if (usesFrontEdgeBase(name)) return frontEdgeBase(center, half, points, acrossPointAtEnd(name) ? 1 : 0.5);
    return undefined;
}

/**
 * Whether this graphic's points are a **front edge and a distance across it**.
 *
 * `carriesSeparationInBase` is the library's own statement of that shape and is now the
 * whole answer. It briefly was not: 344000 pursuit had to be named here, because it drew
 * the cane arrows' picture while reading its own frame rather than a stored separation. It
 * joined that predicate on 2026-09-06 when its editing was made to match its siblings', and
 * the exception went with it. @see synthesizedBase, acrossPointAtEnd
 */
export function usesFrontEdgeBase(name: TacticalGraphicName): boolean {
    return carriesSeparationInBase(name);
}

/** Whether this graphic is drawn as a hairpin. @see hairpinBase, hairpinAnchors */
export function drawsAsHairpin(name: TacticalGraphicName): boolean {
    return HAIRPIN_GRAPHICS.includes(name);
}

/**
 * The two graphics whose three clicks describe a hairpin. @see hairpinAnchors
 *
 * Both plates number four anchor points, and both store four — but the fourth carries no
 * decision, since the legs must stay parallel and the same length. @see drawsAsHairpin
 */
const HAIRPIN_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.Demonstration,
    TacticalGraphicName.ReliefInPlace,
];

/**
 * Whether this graphic's across-the-edge point belongs at the **point-2 end** rather than
 * the middle, for anything synthesising a base. @see frontEdgeBase
 *
 * 270502 disrupt states it outright — point 3 is "the tip of the longest arrow", and the
 * longest arrow is the one at point 2. Handed a mid-edge third point the symbol still draws
 * correctly, because the generator reads only the distance across; but the *grip* is
 * published on the arrowhead the picture actually has, so base and handle sat half a symbol
 * apart in every sample. (User's report, 2026-09-06: "sweep shows handles out of place".)
 */
export function acrossPointAtEnd(name: TacticalGraphicName): boolean {
    return ACROSS_POINT_AT_END.includes(name);
}

/**
 * The graphics whose across-the-edge point sits at the **point-2 end**. @see acrossPointAtEnd
 *
 * Two shapes, one consequence. 270502 disrupt puts point 3 at "the tip of the longest arrow",
 * and that arrow is the one at point 2. The cane arrows, mobile defence and pursuit put it at
 * the far end of the arc's **diameter**, and the arc hooks off point 2 — so for all of them
 * the third point belongs beside point 2, not half way along the run.
 *
 * Put in the middle, the generator still draws the symbol correctly, because it reads only
 * the distance across. But the *grip* is published where the arc actually is, so one handle
 * per graphic sat about half a symbol away from any stored point — and a handle that is not
 * on a point cannot drag it. Measured on the cane arrows: one grip 0.482 off the nearest base
 * point with the mid-edge base, 0 with this one. That is why every sample-drawn cane could
 * not be dragged from point 3 while a hand-drawn one was fine — a hand-drawn base puts the
 * point where the arc is, because that is where the operator clicked. (User's report,
 * 2026-09-06.)
 */
const ACROSS_POINT_AT_END: readonly TacticalGraphicName[] = [
    TacticalGraphicName.Disrupt,
    TacticalGraphicName.TacticalDisrupt,
    // The eight cane arrows: a straight run with a half circle hooked off point 2.
    TacticalGraphicName.Delay,
    TacticalGraphicName.Retirement,
    TacticalGraphicName.Withdraw,
    TacticalGraphicName.WithdrawUnderPressure,
    TacticalGraphicName.ForwardPassageOfLines,
    TacticalGraphicName.RearwardPassageOfLines,
    TacticalGraphicName.Disengage,
    TacticalGraphicName.MobileDefense,
    // Pursuit's own grips are re-derived so it reads correctly either way, but it is the same
    // symbol as the seven above and a user reading the sheet should not be able to tell which
    // of them was laid out differently. @see Pursuit
    TacticalGraphicName.Pursuit,
];

/** Degrees CCW from east, which is the unit `anchorsFor*` take. */
const degrees = (radians: number): number => (radians * 180) / Math.PI;

/**
 * The anchor points a click sequence describes, for the four graphics an operator places
 * **point by point** rather than by dragging out from a centre.
 *
 * ## Why these four stopped being centre-to-edge (2026-09-05)
 *
 * All four are `DRAWN_ANCHOR_GRAPHICS`: the standard describes them by numbered points,
 * and the base has always stored those points. What it did *not* do was let the operator
 * place them — the draw was two clicks, a centre and a rim, and every anchor was derived
 * from that frame. Contain left that model on 2026-09-04 because a user following the
 * Draw Rules clicked the two ends of the opening and got a symbol twice the size they
 * asked for; `symbology.ts` recorded that the other five each needed their own plate read
 * before they followed. This is that read, for four of them. (User's call.)
 *
 * ## What is placed and what is derived
 *
 * A point the standard names but leaves no freedom in is **derived, not clicked** — there
 * is nothing for an operator to decide and a handle on it would only be a way to draw the
 * symbol wrong:
 *
 * | Code | Clicks | Stored | The derivation |
 * |---|---|---|---|
 * | 141700 ambush | 2 | 3 | point 3 keeps the arc's own 120 degrees, so the symbol resizes rather than deforms |
 * | 270504 turn | 3 | 3 | point 3 is pulled onto the chord's perpendicular bisector |
 * | 343500 envelopment | 3 | 4 | point 4 is the arc's apex, which is what states the side |
 * | 344000 pursuit | 3 | 3 | point 3 is pulled onto the perpendicular at point 2 |
 *
 * **Every one of these is a projection or a construction the readers already performed.**
 * `bowFromAnchors` has always taken only the across-chord component of turn's point 3;
 * `runAndArcFromAnchors` has always projected envelopment's point 3 onto the run. Doing it
 * here as well is not a second rule — it is storing the point where the reader was already
 * going to read it, so the handle sits on the symbol instead of wherever the click landed.
 * The same fix the radar search doctrine's grips needed. @see anchors.ts
 *
 * Returns `undefined` for every other graphic, and for a sketch too short to describe one.
 */
function anchorsFromClicks(name: TacticalGraphicName, clicks: Position[]): Position[] | undefined {
    switch (name) {
        case TacticalGraphicName.Ambush:
            return ambushAnchors(clicks);

        /*
         * **270504 / 344700 — three clicks: tip, rear, bend.**
         *
         * The plate letters PT 1, PT 2 and PT 3, whatever the "requires two anchor points"
         * sentence above them says. Point 3 *"indicates on which side of the line the arc is
         * placed"*, and how deep — so its along-chord component means nothing, and storing
         * it is what put the third handle out beside the symbol rather than on it.
         */
        case TacticalGraphicName.Turn:
        case TacticalGraphicName.TacticalTurn: {
            if (clicks.length < 3) return undefined;
            const frame = bowFromAnchors(clicks);
            if (!frame) return undefined;
            return anchorsForBow(frame.center, frame.size, degrees(frame.angle), frame.bend ?? 0);
        }

        /*
         * **343500 — three clicks: start, end of the run, then the diameter.**
         *
         * Point 4 *"defines which side of the line the arc is on"*, and point 3 already
         * says that: the reader takes the side from its across-axis sign when no fourth
         * point exists. So the fourth is emitted at the arc's apex — on the drawn shape,
         * on the bulge side — and carries no decision of its own.
         */
        case TacticalGraphicName.Envelopment: {
            if (clicks.length < 3) return undefined;
            const frame = runAndArcFromAnchors(clicks);
            if (!frame?.radius) return undefined;
            return anchorsForRunAndArc(frame.center, frame.size, frame.radius, degrees(frame.angle), frame.side);
        }

        /*
         * **344000 — three clicks: start, end of the run, then the hook.**
         *
         * *"The 180 degree circular arc is always perpendicular to the line"*, so point 3 is
         * one end of a diameter that leaves point 2 at a right angle. The click is taken for
         * its distance and its side and put on that perpendicular; a point off it would
         * describe a hook the standard does not draw. @see hookFromAnchors
         */
        case TacticalGraphicName.Pursuit:
            return pursuitAnchors(clicks);

        /*
         * **343300 and 341900 — three clicks: the arrowhead tip, the turn, the far leg.**
         *
         * Point 4 is derived so the two straights are parallel and equal by construction, and
         * point 3 is squared onto the perpendicular at point 2 for the same reason 152800's
         * is: the half circle is tangent to both legs, so its diameter has to leave point 2 at
         * a right angle. @see hairpinAnchors
         */
        case TacticalGraphicName.Demonstration:
        case TacticalGraphicName.ReliefInPlace:
            return hairpinAnchors(clicks);

        /*
         * **152800 — three clicks: the arrowhead, the end of the straight line, then the arc.**
         *
         * The same constraint pursuit's third click carries, for the same geometric reason:
         * 152800's arc is tangent to *both* of its parallel straights, so its diameter has to
         * leave point 2 at a right angle. The click is read for how far across the line it is
         * and which side it fell on, and placed on that perpendicular — a point off it
         * describes a hairpin that does not close.
         *
         * The one difference from 344000 is which end is numbered first: mobile defence's
         * point 1 is the arrowhead tip, pursuit's is the line's beginning. That is a matter
         * for `TIP_FIRST_GRAPHICS`, which already lists 152800, and not for the arithmetic
         * here — the clicks arrive in the standard's own order either way, and the
         * perpendicular is measured at point 2 in both. @see MobileDefense.frame
         */
        /*
         * **152800 — three clicks: the arrowhead, the end of the straight line, then the arc.**
         *
         * The same constraint pursuit's third click carries, for the same geometric reason:
         * 152800's arc is tangent to *both* of its parallel straights, so its diameter has to
         * leave point 2 at a right angle. @see mobileDefenceAnchors
         */
        /*
         * **The seven cane arrows read their clicks the same way**, because APP-06 states
         * their Anchor Points and Size/Shape in the same words as 152800's, minus the barbs
         * clause: point 1 the arrowhead tip, point 2 the end of the straight line, point 3
         * the diameter and side of the 180 degree arc. 342500 has no cell of its own and
         * inherits 342400's. @see RetrogradeTask, which quotes the paragraph in full
         *
         * The arc is perpendicular to the line for these too, so the third click keeps only
         * its across-axis component — the same projection, at the same point 2.
         */
        /*
         * **270501 / 340100 block — three clicks: the vertical line's two ends, then the
         * horizontal line's free end.**
         *
         * *"Points 1 and 2 define the endpoints of the symbol's vertical line. Point 3
         * defines the endpoint of the symbol's horizontal line."* The projection is stated
         * outright, and 340100 states it twice over: the horizontal line's length is found
         * *"by plotting point 3 on a plane extending perpendicularly from the midpoint of the
         * vertical line"*, and *"will project perpendicularly from the midpoint"*.
         *
         * So the click's component **along** the bar is discarded and only its distance
         * across it survives — the same reading pursuit's third click gets, and for the same
         * reason: the symbol is a T, and a stem that met the bar at any other angle would not
         * be one. @see Block
         */
        case TacticalGraphicName.Block:
        case TacticalGraphicName.TacticalBlock:
            return blockAnchors(clicks);

        /*
         * **270502 / 341000 disrupt — three clicks: the vertical line's two ends, then the
         * tip of the longest arrow.**
         *
         * *"Points 1 and 2 define the end points of the symbol's vertical line. Point 3
         * defines the tip of the longest arrow."*
         *
         * **The projection is an interpretation here, where block states it.** Disrupt's own
         * cell says only that point 3 *"determines its length"*; it is the Template that
         * draws all three arrows square to the bar, and its sibling 270501 — one row above,
         * same table, same vertical-line-plus-stem construction — that says in words to plot
         * point 3 on the perpendicular. Read any other way the three arrows would splay, and
         * the plate draws them parallel. @see Disrupt
         *
         * Measured at point 2 rather than at the midpoint, because the longest arrow is the
         * one point 3 tips and the Template springs it from the point 2 end of the bar.
         */
        case TacticalGraphicName.Disrupt:
        case TacticalGraphicName.TacticalDisrupt:
            return disruptAnchors(clicks);

        case TacticalGraphicName.Delay:
        case TacticalGraphicName.Retirement:
        case TacticalGraphicName.Withdraw:
        case TacticalGraphicName.WithdrawUnderPressure:
        case TacticalGraphicName.Disengage:
        case TacticalGraphicName.ForwardPassageOfLines:
        case TacticalGraphicName.RearwardPassageOfLines:
        case TacticalGraphicName.MobileDefense:
            return mobileDefenceAnchors(clicks);

        /*
         * **The demolition block — three clicks: the two ends, then the separation.**
         *
         * 271201, and 271204 by inheritance: *"Points 1 and 2 define the endpoints of the
         * symbol and point 3 defines the location of one side of the symbol"*, with points
         * 1 and 2 the centreline and point 3 its width. Only how far point 3 lies *across*
         * the centreline means anything — its component along it would slide the handle up
         * and down a rail without changing the symbol — so it is put on the perpendicular
         * at the centreline's midpoint, which is the middle of the side it names.
         */
        case TacticalGraphicName.ExplosivesPlannedStateOfReadiness:
        case TacticalGraphicName.ExplosivesStateOfReadiness1Safe:
        case TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable:
        // Excluded — see ai/excluded-graphics.md
        // case TacticalGraphicName.RoadblockCompleteExecuted:
        // 140800 states the same rule in the same words — *"points 1 and 2 define the
        // endpoints of the infiltration lane and point 3 defines one side of the lane"* —
        // so it reads its clicks the same way. (User's call, 2026-09-05.)
        case TacticalGraphicName.InfiltrationLane:
        /*
         * **The four bracket mission tasks read their clicks the same way.** 340200 breach,
         * 340300 bypass and 340500 clear each give points 1 and 2 to a front edge — the
         * opening, the arrowhead tips, the vertical line — and point 3 to the rear; 340400
         * canalize has an empty Draw Rules cell and inherits 340300's. Only how far point 3
         * lies *across* that edge means anything, because all three state that the rear line
         * is "the same height as the opening and parallel to it", so nothing in the symbol
         * can express an along-edge offset. That is the projection `sideAnchors` performs.
         * @see frontEdgeFrame, Canalize for the inheritance reading
         */
        case TacticalGraphicName.Breach:
        case TacticalGraphicName.Bypass:
        case TacticalGraphicName.Canalize:
        case TacticalGraphicName.Clear:
            return sideAnchors(clicks);

        default:
            return undefined;
    }
}

/**
 * 141700's three points from two clicks: the tip, and one end of the curved back.
 *
 * *"Points 2 and 3 define the endpoints of the curved line on the back side of the
 * symbol. The rear of the arrowhead line shall connect to the midpoint of the line
 * between points 2 and 3. The arrowhead line shall be perpendicular to the line formed by
 * points 2 and 3."* Those constraints leave a family of symbols rather than one, so the
 * remaining freedom is closed the way the user asked for: **the shape is held and only its
 * size changes**, at the arc's own 120 degrees and the dropped form's arrow reach.
 *
 * The geometry, in the plane the symbol is small enough to live in: the tip sits
 * `reach * r` from the centre and each arc end sits `r` from it, 60 degrees off the axis.
 * So the triangle tip-centre-end has sides `reach * r`, `r` and the clicked distance, and
 * for the default reach of 2 that gives `|click| = r * sqrt(3)` with the centre lying 30
 * degrees off the line from the tip to the click.
 *
 * **Both rotations are tried and the nearer kept.** Which side the centre falls on decides
 * whether the clicked point becomes point 2 or point 3, and choosing by measurement rather
 * than by a sign convention means the arc always opens around the click the user made.
 */
function ambushAnchors(clicks: Position[]): Position[] | undefined {
    if (clicks.length < 2) return undefined;
    const [tip, click] = clicks;
    const reach = ARC_ARROW_DEFAULT_REACH;

    const span = turf.distance(turf.point(tip), turf.point(click), {units: 'meters'});
    if (!isFinite(span) || span <= 0) return undefined;

    // Law of cosines on tip-centre-end, with the arc's half-span fixed at 60 degrees.
    const radius = span / Math.sqrt(reach * reach + 1 - 2 * reach * Math.cos((60 * Math.PI) / 180));
    if (!(radius > 0)) return undefined;
    const offset = degrees(Math.asin(Math.min(1, (radius * Math.sin((60 * Math.PI) / 180)) / span)));

    const toClick = turf.bearing(turf.point(tip), turf.point(click));
    const candidate = (sign: number): Position[] => {
        const centre = turf.destination(turf.point(tip), reach * radius, toClick + sign * offset, {
            units: 'meters',
        }).geometry.coordinates as Position;
        const aim = turf.bearing(turf.point(centre), turf.point(tip));
        return anchorsForArcAndArrow(centre, radius, 90 - aim, reach);
    };

    /*
     * **The click is point 2, not "one of the two arc ends".**
     *
     * `anchorsForArcAndArrow` returns `[tip, +60 degrees, -60 degrees]`, so index 1 is
     * point 2 and index 2 is point 3. Choosing the centre's side by whichever end came out
     * nearer the cursor meant the click became point 3 half the time — the arc then opened
     * the other way round from the one the operator drew, which reads as the symbol
     * flipping for no reason. Measuring index 1 alone is what makes the second click mean
     * the same thing every time. (User's report, 2026-09-05.)
     */
    const toPointTwo = (points: Position[]): number =>
        turf.distance(turf.point(points[1]), turf.point(click), {units: 'meters'});
    const left = candidate(+1);
    const right = candidate(-1);
    return toPointTwo(left) <= toPointTwo(right) ? left : right;
}

/**
 * The demolition block's three points, with the third pulled square off the centreline.
 *
 * The click is read for how far it lies across the line joining points 1 and 2, and for
 * which side it fell on; its component along that line is discarded. Placed at the
 * centreline's midpoint so the handle sits at the middle of the side it defines, rather
 * than wherever along the rail the operator happened to click.
 */
function sideAnchors(clicks: Position[]): Position[] | undefined {
    if (clicks.length < 3) return undefined;
    const [start, end, click] = clicks;

    const axis = turf.bearing(turf.point(start), turf.point(end));
    const span = turf.distance(turf.point(start), turf.point(end), {units: 'meters'});
    if (!isFinite(span) || span <= 0) return undefined;
    const middle = turf.destination(turf.point(start), span / 2, axis, {units: 'meters'});

    const reach = turf.distance(middle, turf.point(click), {units: 'meters'});
    const toClick = turf.bearing(middle, turf.point(click));
    const across = reach * Math.sin(((toClick - axis) * Math.PI) / 180);
    if (!isFinite(across) || across === 0) return undefined;

    const side = turf.destination(middle, Math.abs(across), axis + Math.sign(across) * 90, {
        units: 'meters',
    }).geometry.coordinates as Position;
    return [start, end, side];
}

/**
 * 152800's three points, with the third pulled onto the perpendicular at point 2.
 *
 * **Not `pursuitAnchors`, and the difference is not cosmetic.** The two symbols carry the
 * same constraint but number their points from opposite ends: pursuit's point 1 is the
 * line's *beginning*, mobile defence's is the arrowhead *tip*. So pursuit measures its run
 * as `bearing(point 1 → point 2)` and this one as `bearing(point 2 → point 1)` — and those
 * are not the same reference. On a sphere they differ by the convergence of the meridians,
 * four degrees over a 660 km run at 20°N, which put the click reader's perpendicular 24 km
 * away from the generator's. The symbol still drew, because the generator projects again on
 * every render; what it drew simply was not where the stored point said. Measured, not
 * reasoned about: the arc's far end landed 23,674 m from point 3.
 *
 * Written to match `MobileDefense.frame` bearing for bearing, so the point that is stored
 * and the point that is drawn are the same point.
 *
 * **Shared with the seven cane arrows** as of 2026-09-06 — delay, retirement, withdraw,
 * withdraw under pressure, disengage and the two passages of lines all state this rule in
 * the same words, and `RetrogradeTask.frame` reads its three the same way round. Nothing
 * here is 152800-specific; the name is kept because that is the plate the reading was
 * derived from. @see RetrogradeTask
 *
 * **Three clicks only.** A two-point base is left exactly as it is: the only ones in
 * existence are the ellipses saved before 2026-09-06, and the side their arc fell on is in
 * their `mirrored` amplifier, which `normalizeDrawnBase` cannot see. Constructing a third
 * point here put every mirrored one back on the wrong side, silently. Left short, the base
 * reaches the generator, whose own two-point fallback reads `mirrored` and draws the side it
 * was saved on; it grows its third point the first time someone edits it, which is the
 * moment they choose that side themselves.
 */
/**
 * The distance from `from` to `at`, measured **across** `axis` only.
 *
 * Signed: the magnitude is how far off the line the point fell and the sign is which side.
 * The component along the axis is dropped, which is what "plot point 3 on a plane extending
 * perpendicularly" asks for. Shared by the two graphics whose stem leaves a bar at a right
 * angle. @see blockAnchors, disruptAnchors
 */
function acrossAxis(from: Position, at: Position, axis: number): number {
    const reach = turf.distance(turf.point(from), turf.point(at), {units: 'meters'});
    if (!isFinite(reach) || reach <= 0) return 0;
    const toPoint = turf.bearing(turf.point(from), turf.point(at));
    const across = reach * Math.sin(((toPoint - axis) * Math.PI) / 180);
    return isFinite(across) ? across : 0;
}

/**
 * 270501 / 340100's three points, with the third pulled onto the perpendicular at the
 * vertical line's **midpoint**.
 *
 * The head of the T is points 1 and 2; the stem runs from the middle of that bar out to
 * point 3. Only the stem's *length* and *side* are the operator's to state, so the click is
 * read for those two things and placed square to the bar.
 */
function blockAnchors(clicks: Position[]): Position[] | undefined {
    if (clicks.length < 3) return undefined;
    const [top, bottom, click] = clicks;

    const bar = turf.bearing(turf.point(top), turf.point(bottom));
    const middle = turf.midpoint(turf.point(top), turf.point(bottom)).geometry.coordinates as Position;
    const across = acrossAxis(middle, click, bar);
    if (across === 0) return undefined;

    const stem = turf.destination(turf.point(middle), Math.abs(across), bar + Math.sign(across) * 90, {
        units: 'meters',
    }).geometry.coordinates as Position;
    return [top, bottom, stem];
}

/**
 * 270502 / 341000's three points, with the third pulled onto the perpendicular at **point 2**.
 *
 * Point 3 tips the longest arrow, and the Template springs that arrow from the point 2 end of
 * the vertical line — so the perpendicular is taken there rather than at the middle, and the
 * stored point lands exactly where the arrowhead is drawn.
 */
function disruptAnchors(clicks: Position[]): Position[] | undefined {
    if (clicks.length < 3) return undefined;
    const [first, second, click] = clicks;

    const bar = turf.bearing(turf.point(first), turf.point(second));
    const across = acrossAxis(second, click, bar);
    if (across === 0) return undefined;

    const tip = turf.destination(turf.point(second), Math.abs(across), bar + Math.sign(across) * 90, {
        units: 'meters',
    }).geometry.coordinates as Position;
    return [first, second, tip];
}

function mobileDefenceAnchors(clicks: Position[]): Position[] | undefined {
    if (clicks.length < 3) return undefined;
    const [tip, join, click] = clicks;

    // The line's own direction, pointing at the arrowhead — the generator's `axis`.
    const axis = turf.bearing(turf.point(join), turf.point(tip));
    const reach = turf.distance(turf.point(join), turf.point(click), {units: 'meters'});
    if (!isFinite(reach) || reach <= 0) return undefined;

    // The component across the line, signed: its magnitude is the arc's diameter and its
    // sign is the side the arc falls on. The component *along* is the freedom 152800 does
    // not have — the arc is tangent to both straights, so the diameter is square to them.
    const toClick = turf.bearing(turf.point(join), turf.point(click));
    const across = reach * Math.sin(((toClick - axis) * Math.PI) / 180);
    if (!isFinite(across) || across === 0) return undefined;

    const far = turf.destination(turf.point(join), Math.abs(across), axis + Math.sign(across) * 90, {
        units: 'meters',
    }).geometry.coordinates as Position;
    return [tip, join, far];
}

/**
 * 344000's three points, with the third pulled onto the perpendicular at point 2.
 *
 * The click is read for two things and only two: how far it is across the run, which is
 * the arc's diameter, and which side of the run it fell on. Its component *along* the run
 * is discarded — that is the degree of freedom the standard does not give this symbol,
 * and honouring it bent the hook off square. @see hookFromAnchors
 */
function pursuitAnchors(clicks: Position[]): Position[] | undefined {
    /*
     * **Two clicks already describe a pursuit, so draw one.** (User's report, 2026-09-05.)
     *
     * The run is stated the moment the cursor leaves the first click, and the operator was
     * placing it against an empty map: nothing rendered until the third click, because
     * anything short of three points came back `undefined` here and the holder fell through
     * to the *dropped* form — a default-sized hook parked on point 1, which is not the symbol
     * being drawn.
     *
     * So the third point is constructed at a share of the run until the operator states it.
     * That is a **preview convention and not a reading of the plate** — 344000 gives the hook
     * no default size, and the moment click 3 lands the measured value replaces this one.
     * Building it as a point rather than as a separate preview path is what keeps one
     * description of the symbol: the half-drawn pursuit goes through exactly the arithmetic
     * below that the finished one does.
     */
    if (clicks.length === 2) {
        const [start, join] = clicks;
        const run = turf.distance(turf.point(start), turf.point(join), {units: 'meters'});
        if (!isFinite(run) || run <= 0) return undefined;
        const runBearing = turf.bearing(turf.point(start), turf.point(join));
        const tip = turf.destination(turf.point(join), run * PURSUIT_PREVIEW_HOOK_SHARE, runBearing + 90, {
            units: 'meters',
        }).geometry.coordinates as Position;
        return [start, join, tip];
    }
    if (clicks.length < 3) return undefined;
    const [start, join, click] = clicks;

    const runBearing = turf.bearing(turf.point(start), turf.point(join));
    const toClick = turf.bearing(turf.point(join), turf.point(click));
    const reach = turf.distance(turf.point(join), turf.point(click), {units: 'meters'});
    if (!isFinite(reach) || reach <= 0) return undefined;

    // The component across the run, signed: its magnitude is the diameter and its sign is
    // the flank the hook turns to.
    const across = reach * Math.sin(((toClick - runBearing) * Math.PI) / 180);
    if (!isFinite(across) || across === 0) return undefined;

    const tip = turf.destination(turf.point(join), Math.abs(across), runBearing + Math.sign(across) * 90, {
        units: 'meters',
    }).geometry.coordinates as Position;
    return [start, join, tip];
}
