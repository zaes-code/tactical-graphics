import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {TacticalGraphicName, TurnOptions} from "../core/type";
import {Feature, GeometryCollection, MultiPoint, Point, Position} from "geojson";
import geometryService from "../core/GeometryService";
import {BowFrame, anchorsForBow, bowFromAnchors} from "../core/anchors";
import {toDegrees, toRadians} from "../core/math";
import * as turf from '../core/turf';

/**
 * Depth of the bow as a multiple of `size`, when the caller supplies none.
 * The user drags it from there — see `TurnGraphicBase.setBandRange`.
 */
export const TURN_DEFAULT_BEND = 0.5;
/**
 * How sharp the turn may get. Past the ceiling the curve doubles back on itself and the
 * arrowhead points into the graphic.
 *
 * **The floor was 0.15 and is now 0.02.** It was there to keep a bow that still reads as
 * a turn rather than a straight line, which is a fair thing to want — but the bend handle
 * sits a fixed share of `|bend| x size` from the centre, so the floor is also a wall the
 * *handle* stops at: measured on a 300 px chord, it tracked the cursor exactly for 100 px and then froze
 * dead while the pointer kept going, and picked up again from where it had stopped on the
 * way back. A handle that stops following is the same silent refusal a floor on a resize
 * was, and it reads as the drag accelerating away from the graphic.
 *
 * 0.02 still guards the degenerate case — a bend of exactly zero has no curve for the
 * label's gap to sit in — while leaving the handle free for the whole range a user can
 * actually aim at. Flattening a turn until it is nearly a line is now their call.
 */
export const TURN_MIN_BEND = 0.02;
export const TURN_MAX_BEND = 1.6;

/** Arrowhead length as a fraction of `size`, when `headSize` is not supplied. */
const ARROWHEAD_RATIO = 0.3;
/** Bézier sampling density. Enough that the arc reads smooth at any zoom. */
const CURVE_STEPS = 32;
/**
 * Half the gap left in the curve for the "T", as a fraction of `size`, when the
 * caller supplies no `labelGap`. The renderer overrides it with a flat distance
 * — the label is drawn at a capped screen size, so a gap that tracked `size`
 * would swallow the letter on a large curve.
 */
const LABEL_GAP_RATIO = 0.16;

/** Keeps `bend` inside the range the shape stays readable over. */
export function clampTurnBend(bend: number): number {
    const magnitude = Math.min(TURN_MAX_BEND, Math.max(TURN_MIN_BEND, Math.abs(bend)));
    return bend < 0 ? -magnitude : magnitude;
}

/**
 * `bend` from how far the bend handle has been dragged off the chord.
 *
 * **The factor of two is the Bézier, not a fudge.** The handle is anchor point 3, which
 * sits at the curve's *apex*; the curve is a quadratic Bézier, so its apex is half way to
 * the control point that `bend` measures. A reader that took the offset at face value moved
 * the curve half as far as the cursor, which reads as the handle slipping.
 *
 * `clockwiseOffset` is the cursor's signed distance from the chord, measured toward the side
 * `bendLine` bows to — the same convention `bowFromAnchors` uses when it reads the stored
 * point back, which is why that function's formula and this one are the same arithmetic.
 * Stated here because both renderers do this drag and a rule stated twice drifts.
 * @see anchorsForBow, ai/conventions.md "A symbology fact never lives in a holder"
 */
export function turnBendFromOffset(clockwiseOffset: number, size: number): number {
    if (!(size > 0)) return TURN_DEFAULT_BEND;
    return clampTurnBend((2 * clockwiseOffset) / size);
}

/**
 * `bend` in the shape a renderer's bend drag hands it — the twin of `envelopmentBendFrom`.
 *
 * `perpendicular` is measured to the **left** of the chord, which is the convention the
 * renderers' local frame uses; `bendLine` bows the other way, so the sign flips on the way
 * in. That flip is the same one `bowFromAnchors` applies when it reads the stored point
 * back, and it lives here so neither engine has to remember which way round it goes.
 */
export function turnBendFrom(along: number, perpendicular: number, size: number, currentBend: number): number {
    void along;
    if (!(size > 0)) return clampTurnBend(currentBend);
    return turnBendFromOffset(-perpendicular, size);
}

/**
 * Turn — a tactical mission task drawn as a bowed arrow with a "T" on the
 * curve.
 *
 * Point-anchored: the base point is the midpoint of the curve's chord, so the
 * center handle sits inside the bow rather than under the label, and `size` is
 * the chord's half-length.
 *
 * **`bend` is the sharpness of the turn**, a signed multiple of `size` — it is
 * what the user drags, and being unitless it survives a resize unchanged.
 * `headSize` is a flat distance rather than a fraction of `size`, so the
 * arrowhead also holds its size while the curve is resized.
 *
 * Emitted as:
 *   `[0]` MultiLineString `[curveBeforeLabel, curveAfterLabel]`
 *   `[1]` Polygon arrowhead
 */
export class Turn extends TacticalGraphicsBase<TurnOptions> {
    name: string;
    /**
     * **Drawn, not dropped.** APP-06 270504: "Point 1 defines the tip of the arrowhead
     * and point 2 defines the rear of the symbol. Point 3 defines the 90 degree arc...
     * Point 3 indicates on which side of the line the arc is placed."
     *
     * Tip first, which is the standard's numbering and looks backwards next to the way
     * the symbol is drawn. The third point is kept as a full bow depth rather than only
     * a side, because the rule's own point count contradicts the points it then names,
     * and reading it as "side only" would delete a control the user has today.
     * @see core/anchors.ts, ai/app-6.md "F3"
     */
    type: string = 'LineString';

    /** Mission task or table 5-19 obstacle effect — same bowed arrow, "T" aside. @see Block */
    constructor(name: TacticalGraphicName = TacticalGraphicName.TacticalTurn) {
        super();
        this.name = name;
    }

    /**
     * The chord and its bow, read off the drawn points when there are any.
     *
     * A base that is a bare point — a save written before the conversion — or a sketch
     * that has only reached its second click still resolves, from whatever the options
     * carry. `bend` is always set on the way out, so nothing downstream has to decide
     * what an unbowed turn means.
     */
    private frame(base: Feature<any>, opts?: TurnOptions): Required<BowFrame> {
        const coords = base.geometry?.coordinates;
        const anchored = Array.isArray(coords?.[0]);
        const drawn = anchored ? bowFromAnchors(coords as Position[]) : undefined;
        const bend = clampTurnBend(drawn?.bend ?? opts?.bend ?? TURN_DEFAULT_BEND);
        if (drawn) return {...drawn, bend};
        return {
            center: (anchored ? coords[0] : coords) as Position,
            angle: toRadians(opts?.rotation ?? 0),
            size: opts?.size ?? 1,
            bend,
        };
    }

    /** The bowed curve, rear → arrow end, in EPSG:4326. */
    private curve(base: Feature<any>, opts?: TurnOptions): Position[] {
        const {center, angle, size, bend} = this.frame(base, opts);
        const chordStart = geometryService.translateCoordinates(center, size, angle + Math.PI);
        const chordEnd = geometryService.translateCoordinates(center, size, angle);
        return geometryService.bendLine([chordStart, chordEnd], size, bend, CURVE_STEPS);
    }

    /** Cumulative along-curve distance to each vertex, in meters. */
    private arcLengths(curve: Position[]): number[] {
        const lengths = [0];
        for (let i = 1; i < curve.length; i++) {
            lengths.push(lengths[i - 1] + turf.distance(turf.point(curve[i - 1]), turf.point(curve[i]), {units: 'meters'}));
        }
        return lengths;
    }

    /** The point `target` meters along the curve, interpolated between vertices. */
    private pointAt(curve: Position[], lengths: number[], target: number): Position {
        if (target <= 0) return curve[0];
        const last = lengths.length - 1;
        if (target >= lengths[last]) return curve[last];
        let i = 1;
        while (i < last && lengths[i] < target) i++;
        const span = lengths[i] - lengths[i - 1];
        const t = span > 0 ? (target - lengths[i - 1]) / span : 0;
        return [
            curve[i - 1][0] + t * (curve[i][0] - curve[i - 1][0]),
            curve[i - 1][1] + t * (curve[i][1] - curve[i - 1][1]),
        ];
    }

    /**
     * Half the gap left for the label, in meters.
     *
     * The table 5-19 obstacle effect has no "T", so it gets no hole to put one
     * in. The OpenLayers path passes `labelGap: 0` for both names and so never
     * reaches the default, but a consumer taking the raw GeoJSON would
     * otherwise get a break in an unbroken curve.
     */
    private halfGap(size: number, opts?: TurnOptions): number {
        if (opts?.labelGap !== undefined) return opts.labelGap;
        if (this.name === TacticalGraphicName.Turn) return 0;
        return size * LABEL_GAP_RATIO;
    }

    generateGraphics(base: Feature<any>, opts?: TurnOptions): Feature<GeometryCollection> {
        const size = this.frame(base, opts).size;
        const curve = this.curve(base, opts);
        const dir = geometryService.getCurveTangentAtEnd(curve, 3);
        const headSize = opts?.headSize ?? size * ARROWHEAD_RATIO;
        const arrowHead = geometryService.createArrowHeadPolygon(curve[curve.length - 1], dir, headSize);

        // Split the curve around the label rather than drawing through it.
        // Measured in meters along the curve, not in vertex counts: the caller
        // sizes the gap to the glyph, and vertices are not evenly spaced along
        // a Bézier.
        const lengths = this.arcLengths(curve);
        const mid = lengths[lengths.length - 1] / 2;
        const halfGap = Math.min(this.halfGap(size, opts), mid * 0.9);
        const cutBefore = mid - halfGap;
        const cutAfter = mid + halfGap;

        const before = curve.filter((_, i) => lengths[i] < cutBefore);
        before.push(this.pointAt(curve, lengths, cutBefore));
        const after = [this.pointAt(curve, lengths, cutAfter), ...curve.filter((_, i) => lengths[i] > cutAfter)];

        return this.asGeometryCollectionFeature([
            this.asMultiLineStringFeature([
                before.length >= 2 ? before : [curve[0], curve[0]],
                after.length >= 2 ? after : [curve[curve.length - 1], curve[curve.length - 1]],
            ]).geometry,
            arrowHead.geometry,
        ]);
    }

    /**
     * **The three handles are the three anchor points** — `[tip, rear, bend]`, APP-06
     * 270504's own numbering. The index order is a contract: `TurnGraphicBase.setBandRange`
     * and `handleContract` both switch on it.
     *
     * - **`[0]` point 1, the arrowhead's tip.** The far end of the chord, which is exactly
     *   where `createArrowHeadPolygon` puts the point of the head. Dragging it sets both
     *   `size` and `rotation`.
     * - **`[1]` point 2, the rear.** The other end of the chord. It had no handle at all
     *   until 2026-09-05, so the one end of the symbol an operator would naturally grab to
     *   make it longer was the one end that could not be grabbed. (User's report.)
     * - **`[2]` point 3, the bend.** On the curve's apex. Dragging it away from the chord
     *   sharpens the turn; dragging it across flips the direction.
     *
     * ## Why this is `anchorsForBow` rather than its own arithmetic
     *
     * It used to be `[control, tip, center]`: a bend handle at `|bend| × size` — the
     * Bézier's *control* point, deliberately twice as far out as the curve — plus the tip,
     * plus the centre, which `publishHandles` then demoted to an inert dot. So the symbol
     * published one grip that was **1384 km off its own curve** at a chord half-length of
     * 1.3 Mm, one that was on it, and one dot that did nothing; and the handles disagreed
     * with the anchor points the base stored, which is the disagreement the user saw as
     * "point 3 is on the line but not while editing".
     *
     * Emitting the stored anchors directly removes the second statement rather than
     * correcting it — the handles cannot drift from the geometry because they *are* the
     * geometry. It also drops the centre, which is what leaves exactly three marks.
     * @see anchorsForBow, bowFromAnchors
     */
    generateHandles(base: Feature<any>, opts?: TurnOptions): Feature<MultiPoint> {
        const {center, angle, size, bend} = this.frame(base, opts);
        return this.asMultiPointFeature(anchorsForBow(center, size, toDegrees(angle), bend));
    }

    generateLabels(base: Feature<any>, opts?: TurnOptions): Feature<Point> {
        const curve = this.curve(base, opts);
        const lengths = this.arcLengths(curve);
        // The arc-length midpoint — the center of the gap the graphic leaves.
        return this.asPointFeature(this.pointAt(curve, lengths, lengths[lengths.length - 1] / 2));
    }
}
