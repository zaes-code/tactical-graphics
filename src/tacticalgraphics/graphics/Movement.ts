import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {MovementGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint, Position} from "geojson";
import geometryService from "../core/GeometryService";
import * as turf from '../core/turf';

export abstract class MovementGraphicBase extends TacticalGraphicsBase<MovementGraphicOptions> {
    type = "LineString";

    /**
     * How far past the end of the arrow *body* the arrowhead's point sits, as a
     * multiple of `radius`. `getExtendedPoint` overshoots by 1.5 × radius, which
     * is what every solid-head arrow in this family draws.
     *
     * The body is built on the user's line minus this overhang (see
     * {@link arrowCenterline}) so the point lands exactly on the user's own last
     * vertex. That vertex is the only thing a renderer's vertex-editing tool can
     * grab, so a head drawn past it leaves the tip handle floating over nothing.
     *
     * Graphics whose head already lands on the last vertex, or that have no head
     * at all, override this to 0.
     */
    protected tipOverhang: number = 1.5;

    /**
     * The center line the arrow body is built from: the user's line with the
     * arrowhead's overhang taken off the far end.
     */
    protected arrowCenterline(base: Feature<LineString>, radius: number): Position[] {
        return geometryService.trimLineEnd(base.geometry.coordinates, radius * this.tipOverhang);
    }

    /**
     * `[p0, tip, width]` — and the width grip sits on **the corner of the arrowhead's back
     * that the plate letters `PT N`.**
     *
     * > 151403 main attack. Point 1 defines the tip of the arrowhead. Point N-1 defines the
     * > rear of the symbol. **Point N defines the back of the arrowhead.**
     *
     * The rule names the point but not its side; the Template does. It draws `PT N`'s leader
     * into the back corner lying to the **right of point 1 → point 2** — the direction from
     * the tip toward the rear, which is the order the points are stored in. 151402's Template
     * on the same page letters it identically, and every graphic in this family inherits this
     * method, so one statement settles all of them.
     *
     * **That is the far side from where this was drawn**, which put the grip on the corner
     * the plate leaves unlettered. Note the offset is negated *twice*: once for the parallel
     * line and once for the step across the head, matching how every `generateGraphics` below
     * builds its right-hand edge. And note the stored line is reversed on the way in for a
     * tip-first graphic, so "right of point 1 → point 2" is the **left** of the line this
     * method sees. @see drawOrder.ts, TIP_FIRST_GRAPHICS
     *
     * The tip handle is the user's own last vertex — the arrowhead points *at* it — so a
     * vertex-editing tool can pick it up and it tracks the cursor exactly.
     */
    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        let radius: number = opts?.radius || 20;
        let baseCoords = base.geometry.coordinates;
        const centerline = this.arrowCenterline(base, radius);
        const headSide: Position[] = geometryService.computeParallelLineString(centerline, -radius);
        const headBackCorner: Position = geometryService.getPerpendicularPoint(
            headSide[headSide.length - 1],
            headSide[headSide.length - 2],
            -radius,
        );
        return this.asMultiPointFeature([baseCoords[0], baseCoords[baseCoords.length - 1], headBackCorner]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        const centerline = this.arrowCenterline(base, radius);
        return this.asMultiPointFeature(geometryService.labelCoordsAtFraction(centerline[0], centerline[1], 0.5, radius));
    }
}

export class AttackHelicopterAxisOfAdvance extends MovementGraphicBase {
    name: string = TacticalGraphicName.AttackHelicopterAxisOfAdvance;

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        let radius: number = opts?.radius || 20;
        let baseCoords = this.arrowCenterline(base, radius);
        let lastLinePoint = baseCoords[baseCoords.length - 1];
        let secondToLastLinePoint = baseCoords[baseCoords.length - 2];

        const leftArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, radius);
        const rightArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, -radius);
        const leftArrowHeadBase: Position = geometryService.getPerpendicularPoint(
            leftArrowBase[leftArrowBase.length - 1],
            leftArrowBase[leftArrowBase.length - 2],
            radius);
        const rightArrowHeadBase: Position = geometryService.getPerpendicularPoint(
            rightArrowBase[rightArrowBase.length - 1],
            rightArrowBase[rightArrowBase.length - 2],
            -radius,
        );
        // add a twist in the middle of the arrow segment (same as AviationAxisOfAdvance)
        const [lastLeft] = leftArrowBase.splice(leftArrowBase.length - 1, 1);
        const [lastRight] = rightArrowBase.splice(rightArrowBase.length - 1, 1);

        // Save twist edge start points before the push overwrites them
        const secondToLastLeft = leftArrowBase[leftArrowBase.length - 1];
        const secondToLastRight = rightArrowBase[rightArrowBase.length - 1];

        leftArrowBase.push(lastRight);
        rightArrowBase.push(lastLeft);
        const arrowTipCoord: Position = geometryService.getExtendedPoint(lastLinePoint, secondToLastLinePoint, radius);

        let arrowCoords: Position[] = [lastLeft, leftArrowHeadBase, arrowTipCoord, rightArrowHeadBase, lastRight];

        // Two bars parallel to the arrowhead base, snapped to the twist edges.
        // Bar direction is parallel to lastLeft→lastRight (the arrowhead base).
        // Endpoints are found by intersecting that bar line with the two twist edges:
        //   Edge A: secondToLastLeft → lastRight
        //   Edge B: secondToLastRight → lastLeft
        const barDir: Position = [lastRight[0] - lastLeft[0], lastRight[1] - lastLeft[1]];
        const edgeADir: Position = [lastRight[0] - secondToLastLeft[0], lastRight[1] - secondToLastLeft[1]];
        const edgeBDir: Position = [lastLeft[0] - secondToLastRight[0], lastLeft[1] - secondToLastRight[1]];

        // 2D cross product: a × b = a[0]*b[1] - a[1]*b[0]
        const cross = (a: Position, b: Position) => a[0] * b[1] - a[1] * b[0];

        const lerp = (a: Position, b: Position, t: number): Position =>
            [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];

        const bars: Position[][] = [];
        for (const t of [0.3, 0.7]) {
            const center = lerp(secondToLastLinePoint, lastLinePoint, t);
            // Intersect line (center + s*barDir) with Edge A (secondToLastLeft + u*edgeADir)
            const dA: Position = [center[0] - secondToLastLeft[0], center[1] - secondToLastLeft[1]];
            const denomA = cross(barDir, edgeADir);
            const uA = denomA !== 0 ? cross(barDir, dA) / denomA : 0;
            const ptA: Position = [secondToLastLeft[0] + uA * edgeADir[0], secondToLastLeft[1] + uA * edgeADir[1]];

            // Intersect line (center + s*barDir) with Edge B (secondToLastRight + v*edgeBDir)
            const dB: Position = [center[0] - secondToLastRight[0], center[1] - secondToLastRight[1]];
            const denomB = cross(barDir, edgeBDir);
            const vB = denomB !== 0 ? cross(barDir, dB) / denomB : 0;
            const ptB: Position = [secondToLastRight[0] + vB * edgeBDir[0], secondToLastRight[1] + vB * edgeBDir[1]];

            bars.push([ptA, ptB]);
        }
        const [bar1, bar2] = bars;

        return this.asMultiLineStringFeature([
            leftArrowBase, arrowCoords.reverse(), rightArrowBase.reverse(),
            bar1, bar2,
        ]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        const baseCoords = this.arrowCenterline(base, radius);
        // coords[0..1]: text label position (near tail, same as AviationAxisOfAdvance)
        const textCoords = geometryService.labelCoordsAtFraction(baseCoords[0], baseCoords[1], 0.1, radius);
        // coords[2]: actual twist intercept (midpoint of the last centerline segment)
        const last = baseCoords[baseCoords.length - 1];
        const secondToLast = baseCoords[baseCoords.length - 2];
        const twistCenter: Position = [(secondToLast[0] + last[0]) / 2, (secondToLast[1] + last[1]) / 2];
        // coords[3]: direction point (for computing arrow heading)
        return this.asMultiPointFeature([...textCoords, twistCenter, secondToLast]);
    }
}

export class AviationAxisOfAdvance extends MovementGraphicBase {
    name: string = 'AviationAxisOfAdvance';

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        let radius: number = opts?.radius || 20;
        let baseCoords = this.arrowCenterline(base, radius);
        let lastLinePoint = baseCoords[baseCoords.length - 1];
        let secondToLastLinePoint = baseCoords[baseCoords.length - 2];

        const leftArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, radius);
        const rightArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, -radius);
        const leftArrowHeadBase: Position = geometryService.getPerpendicularPoint(
            leftArrowBase[leftArrowBase.length - 1],
            leftArrowBase[leftArrowBase.length - 2],
            radius);
        const rightArrowHeadBase: Position = geometryService.getPerpendicularPoint(
            rightArrowBase[rightArrowBase.length - 1],
            rightArrowBase[rightArrowBase.length - 2],
            -radius,
        );
        // add a twist in the middle of the arrow segment
        const [lastLeft] = leftArrowBase.splice(leftArrowBase.length - 1, 1);
        const [lastRight] = rightArrowBase.splice(rightArrowBase.length - 1, 1);

        leftArrowBase.push(lastRight);
        rightArrowBase.push(lastLeft);
        const arrowTipCoord: Position = geometryService.getExtendedPoint(lastLinePoint, secondToLastLinePoint, radius);

        let arrowCoords: Position[] = [lastLeft, leftArrowHeadBase, arrowTipCoord, rightArrowHeadBase, lastRight];
        return this.asMultiLineStringFeature([leftArrowBase, arrowCoords.reverse(), rightArrowBase.reverse()]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        const baseCoords = this.arrowCenterline(base, radius);
        return this.asMultiPointFeature(geometryService.labelCoordsAtFraction(baseCoords[0], baseCoords[1], 0.1, radius));
    }
}

/**
 * Emits a 2-point label span lying along the last segment of the arrow's center
 * line, ending where the body does. The style function uses this span for
 * rotation + scale and places the right-aligned "name DTG" label just behind the
 * arrowhead.
 *
 * Takes the center line rather than the base feature: the body stops short of
 * the user's last vertex by the arrowhead's overhang, and a label anchored on
 * the raw vertex would sit inside the head.
 */
export function labelSpanNearArrowhead(centerline: Position[], radius: number): Position[] {
    const baseCoords = centerline;
    const last = baseCoords[baseCoords.length - 1];
    const secondToLast = baseCoords[baseCoords.length - 2];
    const segLen = turf.distance(secondToLast, last, {units: 'meters'});
    if (segLen === 0) return [secondToLast, last];
    const t0 = Math.max(0, 1 - radius / segLen);
    const c0: Position = [
        secondToLast[0] + t0 * (last[0] - secondToLast[0]),
        secondToLast[1] + t0 * (last[1] - secondToLast[1]),
    ];
    return [c0, last];
}

export class MainAttack extends MovementGraphicBase {
    name: string = TacticalGraphicName.MainAxisOfAdvance;

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        let radius: number = opts?.radius || 20;
        let baseCoords = this.arrowCenterline(base, radius);

        const leftArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, radius);
        const rightArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, -radius);
        let arrowCoords: Position[] = geometryService.createMainAttackArrow(baseCoords, leftArrowBase, rightArrowBase, radius);
        return this.asMultiLineStringFeature([leftArrowBase, arrowCoords, rightArrowBase.reverse()]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        return this.asMultiPointFeature(labelSpanNearArrowhead(this.arrowCenterline(base, radius), radius));
    }
}

/**
 * Avenue of approach (APP-06 152300) — the axis of advance's solid hollow arrow, carrying
 * `AA` instead of a bare designation.
 *
 * > Points 1 through N-1 and 2 determine the symbol's centreline and Point N determines
 * > the width.
 *
 * Which is `MainAttack`'s construction exactly, so it is that class under another name
 * rather than a second copy of the same arrow. What the plate adds and this does not is a
 * free-text amplifier at **each** intermediate anchor point — the Example reads "ENY"
 * twice down the tail — and the schema carries one label per graphic, not one per vertex.
 */
export class AvenueOfApproach extends MainAttack {
    name: string = TacticalGraphicName.AvenueOfApproach;

    /**
     * Four anchors, not two: the head span the family publishes, then the **rear end of
     * each rail**.
     *
     * 152300's Template boxes an `N` on both rails at the back of the symbol, and an `H`
     * outside it. Neither can be placed from the head span alone, and a paint cannot go
     * looking for the rails -- it is handed one feature. The generator already computes
     * both parallels to draw the arrow, so publishing where they start costs nothing and
     * keeps the placement a fact of the geometry rather than a guess in a renderer.
     *
     * `anchors()` in the paint layer reads the first two for rotation and scale exactly as
     * before, so the axis-of-advance placement is unchanged.
     */
    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        const centerline = this.arrowCenterline(base, radius);
        const left = geometryService.computeParallelLineString(centerline, radius);
        const right = geometryService.computeParallelLineString(centerline, -radius);
        return this.asMultiPointFeature([...labelSpanNearArrowhead(centerline, radius), left[0], right[0]]);
    }
}

export class MainAttackFeint extends MovementGraphicBase {
    name: string = TacticalGraphicName.MainAxisOfAdvanceFeint;

    /**
     * The dashed chevron's apex, not the solid arrowhead, is the furthest-forward
     * element — `computeFeintOutline` puts it at 2.25 × radius. Trimming by that
     * much lands the apex on the user's last vertex, which is where the tip
     * handle sits.
     */
    protected tipOverhang: number = 2.25;

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        let radius: number = opts?.radius || 20;
        let baseCoords = this.arrowCenterline(base, radius);

        const leftArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, radius);
        const rightArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, -radius);
        let arrowCoords: Position[] = geometryService.createMainAttackArrow(baseCoords, leftArrowBase, rightArrowBase, radius);

        const feintDashes = this.computeFeintOutline(baseCoords, radius);

        return this.asMultiLineStringFeature([
            leftArrowBase,
            arrowCoords,
            rightArrowBase.reverse(),
            ...feintDashes.dashes,
        ]);
    }

    /**
     * Dashed 3-point chevron (leftWing → apex → rightWing) in front of the
     * solid arrow casing, matching the solid arrowhead's angle.
     *
     * Solid arrowhead: wings at (0, ±2r) relative to `last`, tip at 1.5r
     * forward → half-angle atan2(2r, 1.5r) ≈ 53°.
     *
     * Feint uses the same perp / forward ratio so the angle matches:
     *   wings at (wingForward, ±2r), apex at (wingForward + 1.5r, 0).
     * `wingForward` = 1.75r sits 0.25r (= 5 px at draw time) past the solid
     * tip, keeping the chevron close. All distances scale with `radius`.
     */
    private computeFeintOutline(baseCoords: Position[], radius: number): {
        dashes: Position[][];
        tip: Position;
    } {
        const last = baseCoords[baseCoords.length - 1];
        const secondToLast = baseCoords[baseCoords.length - 2];
        const lineBearing = turf.bearing(secondToLast, last);

        //const wingForward = radius * .60; //.60

        const apexForward = radius * 2.25;      // fixed — this is the tip
        const armLength = radius * 3.7;         // ← lengthen by increasing this
        const wingForward = apexForward - armLength * 0.6;   // pulls wing back
        const wingPerp    = armLength * 0.8;                 // spreads wing out

        const wingCenter = turf.destination(last, wingForward, lineBearing, {units: 'meters'})
            .geometry.coordinates as Position;
        const feintLeftWing = turf.destination(wingCenter, wingPerp, lineBearing - 90, {units: 'meters'})
            .geometry.coordinates as Position;
        const feintRightWing = turf.destination(wingCenter, wingPerp, lineBearing + 90, {units: 'meters'})
            .geometry.coordinates as Position;
        const feintTip = turf.destination(last, apexForward, lineBearing, {units: 'meters'})
            .geometry.coordinates as Position;

        const dashed = geometryService.lineStringToDashes(
            [feintLeftWing, feintTip, feintRightWing],
            [radius / 3, radius / 3],
        );
        return {dashes: dashed.geometry.coordinates, tip: feintTip};
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        return this.asMultiPointFeature(labelSpanNearArrowhead(this.arrowCenterline(base, radius), radius));
    }
}

export class SupportingAttack extends MovementGraphicBase {
    name: string = TacticalGraphicName.SupportingAxisOfAdvance;

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        let radius: number = opts?.radius || 20;
        let baseCoords = this.arrowCenterline(base, radius);

        let lastLinePoint = baseCoords[baseCoords.length - 1];
        let secondToLastLinePoint = baseCoords[baseCoords.length - 2];

        const leftArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, radius);
        const rightArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, -radius);
        const leftArrowHeadBase: Position = geometryService.getPerpendicularPoint(
            leftArrowBase[leftArrowBase.length - 1],
            leftArrowBase[leftArrowBase.length - 2],
            radius);
        const rightArrowHeadBase: Position = geometryService.getPerpendicularPoint(
            rightArrowBase[rightArrowBase.length - 1],
            rightArrowBase[rightArrowBase.length - 2],
            -radius,
        );

        const arrowTipCoord: Position = geometryService.getExtendedPoint(lastLinePoint, secondToLastLinePoint, radius);

        let arrowCoords: Position[] = [
            leftArrowBase[leftArrowBase.length - 1],
            leftArrowHeadBase,
            arrowTipCoord,
            rightArrowHeadBase,
            rightArrowBase[rightArrowBase.length - 1]
        ];
        return this.asMultiLineStringFeature([leftArrowBase, arrowCoords, rightArrowBase.reverse()]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        return this.asMultiPointFeature(labelSpanNearArrowhead(this.arrowCenterline(base, radius), radius));
    }
}

export class Counterattack extends MovementGraphicBase {
    name: string = TacticalGraphicName.Counterattack;

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        let radius: number = opts?.radius || 20;
        let baseCoords = this.arrowCenterline(base, radius);

        let lastLinePoint = baseCoords[baseCoords.length - 1];
        let secondToLastLinePoint = baseCoords[baseCoords.length - 2];

        const leftArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, radius);
        const rightArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, -radius);
        const leftArrowHeadBase: Position = geometryService.getPerpendicularPoint(
            leftArrowBase[leftArrowBase.length - 1],
            leftArrowBase[leftArrowBase.length - 2],
            radius);
        const rightArrowHeadBase: Position = geometryService.getPerpendicularPoint(
            rightArrowBase[rightArrowBase.length - 1],
            rightArrowBase[rightArrowBase.length - 2],
            -radius,
        );

        const arrowTipCoord: Position = geometryService.getExtendedPoint(lastLinePoint, secondToLastLinePoint, radius);

        let arrowCoords: Position[] = [
            leftArrowBase[leftArrowBase.length - 1],
            leftArrowHeadBase,
            arrowTipCoord,
            rightArrowHeadBase,
            rightArrowBase[rightArrowBase.length - 1]
        ];
        return geometryService.lineStringToDashes([leftArrowBase, arrowCoords, rightArrowBase.reverse()].flat(), [radius / 3, radius / 3]);
    }

    /**
     * The same span the axis-of-advance family publishes: `radius` long, ending where the
     * body does, so the label sits **just behind the arrowhead** rather than at the middle
     * of the last segment.
     *
     * It used to be `labelCoordsAtFraction(..., 0.5, radius)` — a pair straddling the
     * segment's midpoint — which put `CATK` halfway down the arrow. The span also sets the
     * label's size, and taking it from the arrow's *width* rather than its length is what
     * stops a long counterattack carrying an enormous designation.
     * @see labelSpanNearArrowhead (user's call, 2026-08-27)
     */
    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        return this.asMultiPointFeature(labelSpanNearArrowhead(this.arrowCenterline(base, radius), radius));
    }
}

/**
 * The by-fire bracket's dimensions, as multiples of the arrow's half-width, measured off
 * the plate: the bar stands twice the body's half-width either side of the axis, the shaft
 * runs about one, and the head is a third of that.
 */
const BY_FIRE_STANDOFF = 0.8;
const BY_FIRE_SHAFT = 1.05;
const BY_FIRE_BAR_HALF = 2.0;
const BY_FIRE_HEAD = 0.3;

/**
 * Counter-attack by fire (APP-06 340700) — the counterattack arrow with the *by fire*
 * bracket standing beyond its tip.
 *
 * The arrow is the counterattack's, unchanged and dashed for the same reason: FM 1-02.2
 * says outright that "there are certain control measures such as counterattack which are
 * drawn in the present status with dashed lines", and APP-06 repeats it as a note on this
 * row. The break is the symbol, not a status.
 *
 * The bracket is `getAttackByFireSymbol`'s — the same feathered bar and shaft that attack
 * by fire draws, because it is the same amplifier meaning the same thing. Its bar is
 * dashed with the arrow; **the little shaft and head are solid**, which is what the plate
 * draws and is the only place in this symbol where a line is not broken.
 */
export class CounterattackByFire extends Counterattack {
    name: string = TacticalGraphicName.CounterattackByFire;

    /**
     * **The bracket stands inside point 1, not beyond it.**
     *
     * 340700's Template letters `PT. 1` on the head of the little by-fire arrow — the
     * rightmost mark in the symbol — where 340600's, one row above, letters it on the
     * counterattack arrow's own `>`. The two rows share every word of their Draw Rules, so
     * the drawing is the only place that distinction is made, and it is made clearly: the
     * leader passes the bar and lands on the small solid head.
     *
     * Inheriting the counterattack's overhang put the operator's own click on the arrow's
     * point and hung the whole bracket 1.85 half-widths off the end of it &mdash; so point 1
     * was neither the tip of anything nor the end of the symbol, and a click placed against
     * an enemy position drew a mark past it. Trimming the body by the bracket's own reach as
     * well slides the figure back along its axis until the head lands on the click, which is
     * exactly what the inherited 1.5 does for the arrow alone. (User's report, 2026-09-06,
     * with the wanted position drawn on a screenshot; confirmed against the plate first.)
     *
     * **Stated as the sum, because it is the sum.** Both terms are the ones
     * `generateGraphics` steps along the axis with, so the head cannot drift off the click
     * if the bracket is ever redrawn. 340600 keeps the inherited value and is untouched.
     * @see MovementGraphicBase.tipOverhang
     */
    protected tipOverhang: number = 1.5 + BY_FIRE_STANDOFF + BY_FIRE_SHAFT;

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        const radius: number = opts?.radius || 20;
        const arrow = super.generateGraphics(base, opts);

        const centerline = this.arrowCenterline(base, radius);
        const last = centerline[centerline.length - 1];
        const secondToLast = centerline[centerline.length - 2];
        const tip = geometryService.getExtendedPoint(last, secondToLast, radius);
        const axis = turf.bearing(turf.point(secondToLast), turf.point(last));

        const along = (from: Position, meters: number): Position =>
            turf.destination(turf.point(from), meters / 1000, axis, {units: 'kilometers'}).geometry.coordinates;

        // The bracket stands clear of the tip rather than touching it: the arrow's own
        // point is a `>`, and a bar hard against it reads as one closed shape.
        const bracketAt = along(tip, radius * BY_FIRE_STANDOFF);
        const shaftEnd = along(bracketAt, radius * BY_FIRE_SHAFT);

        // Built here rather than through `getAttackByFireSymbol`, which derives its
        // arrowhead from the bar's height — right for attack by fire, where the head is
        // the symbol, and far too big here, where it is a mark beside a much larger arrow.
        const bracket = geometryService.getFirePositionBracket(bracketAt, axis, radius * BY_FIRE_BAR_HALF);
        const head = geometryService.computeArrowheadPoints(bracketAt, shaftEnd, radius * BY_FIRE_HEAD, 45);

        return this.asMultiLineStringFeature([
            ...arrow.geometry.coordinates,
            ...geometryService.lineStringToDashes(bracket, [radius / 3, radius / 3]).geometry.coordinates,
            [bracketAt, shaftEnd],
            head,
        ]);
    }
}
