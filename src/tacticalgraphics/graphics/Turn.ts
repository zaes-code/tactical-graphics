import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {TacticalGraphicName, TurnOptions} from "../core/type";
import {Feature, GeometryCollection, MultiPoint, Point, Position} from "geojson";
import geometryService from "../core/GeometryService";
import {toRadians} from "../core/math";
import * as turf from "@turf/turf";

/**
 * Depth of the bow as a multiple of `size`, when the caller supplies none.
 * The user drags it from there — see `TurnGraphicBase.setBandRange`.
 */
export const TURN_DEFAULT_BEND = 0.5;
/**
 * How sharp the turn may get. Past this the curve doubles back on itself and
 * the arrowhead points into the graphic; the floor keeps a bow that is still
 * recognisably a turn rather than a straight line.
 */
export const TURN_MIN_BEND = 0.15;
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
 * Turn — a tactical mission task drawn as a bowed arrow with a "T" on the
 * curve.
 *
 * Point-anchored: the base point is the midpoint of the curve's chord, so the
 * centre handle sits inside the bow rather than under the label, and `size` is
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
    type: string = 'Point';

    /** Mission task or table 5-19 obstacle effect — same bowed arrow, "T" aside. @see Block */
    constructor(name: TacticalGraphicName = TacticalGraphicName.TacticalTurn) {
        super();
        this.name = name;
    }

    /** The bowed curve, start → arrow end, in EPSG:4326. */
    private curve(base: Feature<Point>, opts?: TurnOptions): Position[] {
        const center = base.geometry.coordinates;
        const size = opts?.size ?? 1;
        const angle = toRadians(opts?.rotation ?? 0);
        const bend = clampTurnBend(opts?.bend ?? TURN_DEFAULT_BEND);
        const chordStart = geometryService.translateCoordinates(center, size, angle + Math.PI);
        const chordEnd = geometryService.translateCoordinates(center, size, angle);
        return geometryService.bendLine([chordStart, chordEnd], size, bend, CURVE_STEPS);
    }

    /** Cumulative along-curve distance to each vertex, in metres. */
    private arcLengths(curve: Position[]): number[] {
        const lengths = [0];
        for (let i = 1; i < curve.length; i++) {
            lengths.push(lengths[i - 1] + turf.distance(turf.point(curve[i - 1]), turf.point(curve[i]), {units: 'meters'}));
        }
        return lengths;
    }

    /** The point `target` metres along the curve, interpolated between vertices. */
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
     * Half the gap left for the label, in metres.
     *
     * The table 5-19 obstacle effect has no "T", so it gets no hole to put one
     * in. The OpenLayers path passes `labelGap: 0` for both names and so never
     * reaches the default, but a consumer taking the raw GeoJSON would
     * otherwise get a break in an unbroken curve.
     */
    private halfGap(opts?: TurnOptions): number {
        if (opts?.labelGap !== undefined) return opts.labelGap;
        if (this.name === TacticalGraphicName.Turn) return 0;
        return (opts?.size ?? 1) * LABEL_GAP_RATIO;
    }

    generateGraphics(base: Feature<Point>, opts?: TurnOptions): Feature<GeometryCollection> {
        const size = opts?.size ?? 1;
        const curve = this.curve(base, opts);
        const dir = geometryService.getCurveTangentAtEnd(curve, 3);
        const headSize = opts?.headSize ?? size * ARROWHEAD_RATIO;
        const arrowHead = geometryService.createArrowHeadPolygon(curve[curve.length - 1], dir, headSize);

        // Split the curve around the label rather than drawing through it.
        // Measured in metres along the curve, not in vertex counts: the caller
        // sizes the gap to the glyph, and vertices are not evenly spaced along
        // a Bézier.
        const lengths = this.arcLengths(curve);
        const mid = lengths[lengths.length - 1] / 2;
        const halfGap = Math.min(this.halfGap(opts), mid * 0.9);
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
     * `[bendHandle, arrowTip, centre]` — centre last, per the point-graphic
     * convention. The index order is a contract: `TurnGraphicBase.setBandRange`
     * switches on it.
     *
     * - **`[0]` bend** is the Bézier's control point: on the perpendicular
     *   through the chord's midpoint, at `bend × size`. That is twice as far
     *   out as the curve's apex, which is the point — it keeps the handle off
     *   the curve and clear of the "T" sitting on it. Dragging it away from the
     *   chord sharpens the turn; dragging it across flips the direction.
     * - **`[1]` arrow tip** is the far end of the chord, which is exactly where
     *   `createArrowHeadPolygon` puts the point of the head. Dragging it sets
     *   both `size` and `rotation` — it is where the turn ends, so it is the
     *   one handle that means something at the arrowhead.
     */
    generateHandles(base: Feature<Point>, opts?: TurnOptions): Feature<MultiPoint> {
        const center = base.geometry.coordinates;
        const size = opts?.size ?? 1;
        const angle = toRadians(opts?.rotation ?? 0);
        const bend = clampTurnBend(opts?.bend ?? TURN_DEFAULT_BEND);
        // `bendLine` bows toward `bearing + 90`, i.e. clockwise of the chord's
        // direction, which is a planar angle of `rotation − 90`.
        const control = geometryService.translateCoordinates(center, Math.abs(bend) * size, angle - Math.sign(bend) * Math.PI / 2);
        const tip = geometryService.translateCoordinates(center, size, angle);
        return this.asMultiPointFeature([control, tip, center]);
    }

    generateLabels(base: Feature<Point>, opts?: TurnOptions): Feature<Point> {
        const curve = this.curve(base, opts);
        const lengths = this.arcLengths(curve);
        // The arc-length midpoint — the centre of the gap the graphic leaves.
        return this.asPointFeature(this.pointAt(curve, lengths, lengths[lengths.length - 1] / 2));
    }
}
