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
import geometryService from './GeometryService';
import {
    anchorsForArcAndArrow,
    anchorsForBow,
    anchorsForRunAndArc,
    ARC_ARROW_DEFAULT_REACH,
    bowFromAnchors,
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
 * 344000's three points, with the third pulled onto the perpendicular at point 2.
 *
 * The click is read for two things and only two: how far it is across the run, which is
 * the arc's diameter, and which side of the run it fell on. Its component *along* the run
 * is discarded — that is the degree of freedom the standard does not give this symbol,
 * and honouring it bent the hook off square. @see hookFromAnchors
 */
function pursuitAnchors(clicks: Position[]): Position[] | undefined {
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
