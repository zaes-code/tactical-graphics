import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {MovementGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import geometryService from '../core/GeometryService';
import * as turf from '../core/turf';
import {halfWidthFromSide, sidePoint} from './ExplosivesReadiness';

/**
 * The half-width point 3 may set, as a share of the centreline's length.
 *
 * **The ceiling keeps arms beyond the crossings.** The two pairs cross in a square `2w` on a
 * side, centred on the centreline's midpoint, and each bar runs half the centreline's length
 * either side of it. So the crossings reach the bar ends at `w = L / 2`, where the four bars
 * close into a bare square. The user's call was to stop well short of that: at most halfway
 * from the centre to the ends, `w <= L / 4`. (User's call, 2026-09-21.)
 *
 * **The floor keeps two crosses.** At no width each pair collapses onto one line and the
 * symbol is a single X.
 */
export const ROADBLOCK_MAX_HALF_WIDTH_RATIO = 0.25;
export const ROADBLOCK_MIN_HALF_WIDTH_RATIO = 0.025;

/**
 * The half-width a 3.4.0 roadblock was dropped with, as a share of its span: a separation of
 * a fifth of the span between the two crosses, measured level, which is `0.1 / sqrt(2)` across
 * the bars. Used only to open a file saved as a single dropped point.
 */
const LEGACY_HALF_WIDTH_RATIO = 0.1 / Math.SQRT2;

/** `half` held between the floor and the ceiling for a centreline `length` long. */
export function clampRoadblockHalfWidth(half: number, length: number): number {
    return Math.min(length * ROADBLOCK_MAX_HALF_WIDTH_RATIO, Math.max(length * ROADBLOCK_MIN_HALF_WIDTH_RATIO, half));
}

const lengthOf = (ends: Position[]): number => turf.distance(turf.point(ends[0]), turf.point(ends[1]), {units: 'meters'});

/**
 * The three points with point 3 put back inside the limits, on the side it was dragged to.
 *
 * The drawing clamps the width whatever the base says, so this is what keeps a saved file
 * agreeing with the picture: dragged far out, point 3 was stored 1.3 centrelines off while the
 * symbol stopped at a quarter. (Found driving it, 2026-09-21.) @see clampRoadblockHalfWidth
 */
export function clampRoadblockBase(points: Position[]): Position[] {
    if (points.length < 3) return points;
    const length = lengthOf(points);
    if (!(length > 0)) return points;
    const half = halfWidthFromSide(points);
    const clamped = clampRoadblockHalfWidth(half, length);
    return clamped === half ? points : [points[0], points[1], sidePoint(points, undefined, clamped)];
}

/**
 * The three points a roadblock saved by 3.4.0 as one dropped point stands for: a centreline
 * running 45 degrees through it, `span` long, and a side point at the width it was drawn with.
 */
function legacyBase(center: Position, span: number): Position[] {
    const at = (m: number, bearing: number) =>
        turf.destination(turf.point(center), m, bearing, {units: 'meters'}).geometry.coordinates as Position;
    return [at(span / 2, 225), at(span / 2, 45), at(span * LEGACY_HALF_WIDTH_RATIO, 315)];
}

/**
 * Roadblock complete (executed) — FM 1-02.2 table 5-19, APP-06 271204.
 *
 * **One of the demolition obstacles, built as they are.** FM 1-02.2 lists it fourth under
 * *"Demolition Obstacle Symbol — obstacles created using explosives"*, after the three states
 * of readiness; APP-06 puts it directly after 271201-271203 with an empty Draw Rules cell, so
 * it takes 271201's: *"Points 1 and 2 determine the centreline of the symbol and point 3
 * determines its width."* Its Template marks the points where theirs do. (User's call,
 * 2026-09-21: *"they don't look from the same family and they should be"*.)
 *
 * So the first pair of bars **is** the readiness states' pair, from the same centreline and
 * side point, drawn solid. The second pair is that pair turned a quarter-turn about the
 * centreline's midpoint, which is the doubled X the plate draws. Drawn with three clicks at
 * any angle and length, and every point is a grip: the ends move the centreline and point 3
 * sets the width, held between `ROADBLOCK_MIN_HALF_WIDTH_RATIO` and
 * `ROADBLOCK_MAX_HALF_WIDTH_RATIO` of the centreline.
 *
 * It used to be dropped at a fixed size and a 45 degree lean, with its bars slid along their
 * length so their ends sat level, which is what made it read as a different family.
 *
 * Bars come out `[left, right]` for the first pair, then the second, the order
 * `BAR_SYMBOL_DASHES` indexes. Nothing dashes here.
 */
export class RoadblockComplete extends TacticalGraphicsBase<MovementGraphicOptions> {
    name: string = TacticalGraphicName.RoadblockCompleteExecuted;
    type: string = 'LineString';

    /** The three points, whatever shape of base they arrived in. */
    private points(base: Feature<LineString>, opts?: MovementGraphicOptions): Position[] {
        const coords = base.geometry.coordinates as Position[];
        // A single point is a 3.4.0 drop: its centre, with the span in `size`.
        if (coords.length === 1) return legacyBase(coords[0], Math.max(opts?.size ?? opts?.radius ?? 1, 1));
        return coords;
    }

    /** The half-width, clamped. @see clampRoadblockHalfWidth */
    private halfWidth(points: Position[], opts?: MovementGraphicOptions): number {
        const length = lengthOf(points);
        const stated = points.length >= 3 ? halfWidthFromSide(points, opts) : opts?.radius ?? length * LEGACY_HALF_WIDTH_RATIO;
        return clampRoadblockHalfWidth(stated, length);
    }

    /** The four bars: the readiness states' pair, then the same pair turned a quarter. */
    private bars(points: Position[], opts?: MovementGraphicOptions): Position[][] {
        const ends = [points[0], points[1]];
        const length = lengthOf(ends);
        if (!(length > 0)) return [];
        const half = this.halfWidth(points, opts);

        const axis = turf.bearing(turf.point(ends[0]), turf.point(ends[1]));
        const middle = turf.destination(turf.point(ends[0]), length / 2, axis, {units: 'meters'});
        const across = [
            turf.destination(middle, length / 2, axis - 90, {units: 'meters'}).geometry.coordinates as Position,
            turf.destination(middle, length / 2, axis + 90, {units: 'meters'}).geometry.coordinates as Position,
        ];
        const pair = (line: Position[]) => [
            geometryService.computeParallelLineString(line, half) as Position[],
            geometryService.computeParallelLineString(line, -half) as Position[],
        ];
        return [...pair(ends), ...pair(across)];
    }

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        const points = this.points(base, opts);
        // Mid-draw the interaction hands over a one-point sketch on every pointer move.
        if (points.length < 2) return this.asMultiLineStringFeature([]);
        return this.asMultiLineStringFeature(this.bars(points, opts));
    }

    /**
     * `[start, end, side]`, all three grips, as the readiness states publish them. The side
     * grip sits square off the centreline's midpoint at the clamped width, on the first bar.
     * @see sidePoint
     */
    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const points = this.points(base, opts);
        if (points.length < 2) return this.asMultiPointFeature(points);
        const half = this.halfWidth(points, opts);
        return this.asMultiPointFeature([points[0], points[1], sidePoint(points, opts, half)]);
    }

    /** No amplifiers: affiliation and nothing else. */
    generateLabels(): Feature<MultiPoint> {
        return this.asMultiPointFeature([]);
    }
}
