import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {MovementGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import geometryService from '../core/GeometryService';
import * as turf from '../core/turf';


/**
 * Half the separation between the rails, in metres, off the base's own third point.
 *
 * **From the coordinates, not from an amplifier.** 271201 gives point 3 the job — *"point
 * 3 determines its width"* — and it is a stored vertex as of 2026-09-05, so the distance
 * is measured rather than replayed. `radius` is still honoured for a graphic saved before
 * that, whose base holds two points and whose width sat beside it.
 */
export function halfWidthFromSide(coords: Position[], opts?: MovementGraphicOptions): number {
    const side = sideOffset(coords);
    if (side) return Math.abs(side.across);
    return Math.max(opts?.radius ?? 0, 1);
}

/**
 * Point 3 measured against the centreline: how far **across** it, and which flank.
 *
 * **The across component only.** The along component is not a dimension this symbol has —
 * two rails are as far apart at one end as the other — so a point 3 that has drifted off
 * square still describes exactly one width. Which it does as soon as an end is dragged:
 * moving point 1 or 2 moves the centreline's midpoint and turns its perpendicular, and a
 * stored coordinate cannot follow. Reading only the across component is what lets the
 * width survive that, and `sidePoint` is what puts the handle back on the rail.
 * (User's report, 2026-09-05: "when dragging point 1 & 2, the middle red handle falls off
 * the side line".)
 */
function sideOffset(coords: Position[]): {across: number; middle: Position; axis: number} | undefined {
    if (coords.length < 3) return undefined;
    const span = turf.distance(turf.point(coords[0]), turf.point(coords[1]), {units: 'meters'});
    if (!isFinite(span) || span <= 0) return undefined;
    const axis = turf.bearing(turf.point(coords[0]), turf.point(coords[1]));
    const middle = turf.destination(turf.point(coords[0]), span / 2, axis, {units: 'meters'});

    const reach = turf.distance(middle, turf.point(coords[2]), {units: 'meters'});
    const toSide = turf.bearing(middle, turf.point(coords[2]));
    const across = reach * Math.sin(((toSide - axis) * Math.PI) / 180);
    if (!isFinite(across) || across === 0) return undefined;
    return {across, middle: middle.geometry.coordinates as Position, axis};
}

/**
 * Where the side handle sits: **square off the centreline's midpoint**, always.
 *
 * Derived rather than published raw, so the grip stays on the rail it sets while the ends
 * are dragged around it. Handing back `coords[2]` untouched left it hanging in space the
 * moment either end moved. @see sideOffset
 */
export function sidePoint(coords: Position[], opts?: MovementGraphicOptions): Position {
    const side = sideOffset(coords);
    if (side) {
        return turf.destination(
            turf.point(side.middle),
            Math.abs(side.across),
            side.axis + Math.sign(side.across) * 90,
            {units: 'meters'},
        ).geometry.coordinates as Position;
    }
    const span = turf.distance(turf.point(coords[0]), turf.point(coords[1]), {units: 'meters'});
    const axis = turf.bearing(turf.point(coords[0]), turf.point(coords[1]));
    const middle = turf.destination(turf.point(coords[0]), span / 2, axis, {units: 'meters'});
    return turf.destination(middle, halfWidthFromSide(coords, opts), axis + 90, {units: 'meters'})
        .geometry.coordinates as Position;
}

/**
 * The three demolition readiness states of FM 1-02.2 table 5-19.
 *
 * **A drawn centerline with a width**, which is how both standards build them.
 * APP-06 Ed E (271201) states it for the whole family:
 *
 * > This symbol requires three anchor points. Points 1 and 2 define the endpoints of
 * > the symbol and point 3 defines the location of one side of the symbol.
 * >
 * > Points 1 and 2 determine the **centerline** of the symbol and point 3 determines
 * > its **width**.
 *
 * FM 1-02.2's plate agrees: its examples lay the pair across a road at whatever angle
 * and length the road needs. **This used to be point-anchored at a fixed 45° bearing**,
 * so it could not be laid across a road running any other way. @see ai/app-6.md, "F2"
 *
 * All three are the same construction and differ only in how the two rails are stroked:
 *
 * ```
 * planned state of readiness      two bars, both dashed
 * state of readiness 1 (safe)     two bars, one dashed one solid
 * state of readiness 2 (armed)    two bars, both solid
 * ```
 *
 * **Roadblock complete is not in this class** and is deliberately left point-anchored.
 * It shares the family's amplifiers and its `BAR_SYMBOL_DASHES` lookup, but APP-06 draws
 * it as *two overlapping X's* — four strokes, not two rails — and that shape is already
 * right. Its draw-rule cell is inherited rather than stated, so nothing in the standard
 * says how a centerline would lay those four strokes out. @see RoadblockComplete
 *
 * The dashing is a stroke property and a MultiLineString cannot say "this part dashed,
 * that one not", so the geometry is emitted here in a fixed order — **left rail first**
 * — and `BAR_SYMBOL_DASHES` tells the painter how to stroke each one.
 */
export class ExplosivesReadiness extends TacticalGraphicsBase<MovementGraphicOptions> {
    name: string;
    type: string = 'LineString';

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    /**
     * The two rails, left first, offset either side of the drawn centerline.
     *
     * `radius` is the half-width — the generators' name for it, filled from the public
     * `width` property — so the pair spans `2 × radius` across the route, exactly as
     * APP-06's point 3 sets.
     */
    private rails(base: Feature<LineString>, opts?: MovementGraphicOptions): Position[][] {
        const coords = base.geometry.coordinates;
        const ends = [coords[0], coords[1]];
        const half = halfWidthFromSide(coords, opts);
        const left = geometryService.computeParallelLineString(ends, half) as Position[];
        const right = geometryService.computeParallelLineString(ends, -half) as Position[];
        return [left, right];
    }

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        const coords = base.geometry.coordinates;
        // Mid-draw the interaction hands us a one-point sketch on every pointer move.
        if (coords.length < 2) return this.asMultiLineStringFeature([]);
        return this.asMultiLineStringFeature(this.rails(base, opts));
    }

    /**
     * `[start, end, width]` — the movement family's contract, because this is now a
     * movement-shaped graphic: two vertices the user drew plus one handle that sets how
     * far apart the rails sit. The width handle rides the end of the left rail, so the
     * thing being dragged is on the symbol rather than out in space.
     */
    /**
     * `[start, end, side]` — the three points the plate names, all of them placed.
     *
     * The third used to be a *derived* offset handle riding the end of the left rail, with
     * the separation it set carried beside the base as a `width` amplifier. It is a stored
     * vertex now, so the handle is the point rather than a picture of one, and there is no
     * second copy of the width to keep in step. @see sideAnchors
     */
    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        if (coords.length < 2) return this.asMultiPointFeature(coords);
        return this.asMultiPointFeature([coords[0], coords[1], sidePoint(coords, opts)]);
    }

    /** No amplifiers: these carry affiliation and nothing else. */
    generateLabels(): Feature<MultiPoint> {
        return this.asMultiPointFeature([]);
    }
}

/**
 * Which bars a bar symbol hashes, indexed in the order the generator emits them — **left
 * rail first**. A name absent from the table draws every bar solid, which is what
 * roadblock complete relies on.
 */
export const BAR_SYMBOL_DASHES: Partial<Record<TacticalGraphicName, boolean[]>> = {
    [TacticalGraphicName.ExplosivesPlannedStateOfReadiness]: [true, true],
    [TacticalGraphicName.ExplosivesStateOfReadiness1Safe]: [true, false],
    [TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable]: [false, false],
};
