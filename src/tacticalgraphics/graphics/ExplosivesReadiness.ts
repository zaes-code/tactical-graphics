import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {PointGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, MultiLineString, MultiPoint, Point, Position} from 'geojson';
import * as turf from '../core/turf';

/**
 * The three demolition-obstacle readiness states of FM 1-02.2 table 5-19.
 *
 * All three are the *same shape* - a pair of parallel bars laid across the route being
 * demolished - and differ only in which bars are dashed. The plates read:
 *
 * ```
 * planned state of readiness      both bars dashed
 * state of readiness 1 (safe)     one solid, one dashed
 * state of readiness 2 (armed)    both bars solid
 * ```
 *
 * So the geometry lives here and the dashing lives in `explosivesReadinessStyleFunc` -
 * a dash is a stroke property, and a MultiLineString cannot say "this part dashed, that
 * one not". The generator emits the two bars in a fixed order, leading bar first, and the
 * style function decides how each is stroked.
 */

/** Horizontal distance between the two bars, as a fraction of their span. */
const SEPARATION_RATIO = 0.42;

/**
 * The bars' fixed heading. They are drawn as a leaning pair on the plate, and the symbol
 * does not rotate - see the class comment.
 */
const BAR_BEARING = 45;

export class ExplosivesReadiness extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string;
    type: string = 'Point';

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    /**
     * The two bars, **left one first** - `EXPLOSIVES_DASHED` is indexed the same way, and
     * state of readiness 1 is the one that cares: its left bar is hashed and its right solid.
     *
     * The pair is displaced east and west, not perpendicular to the bars. Offsetting
     * perpendicular staggers them along the bearing, so one bar ends higher than the other;
     * the plate has both spanning the same vertical extent, which only a horizontal
     * displacement gives.
     *
     * `opts.rotation` is deliberately ignored. The symbol has a fixed heading, and the
     * controller's resize drag derives an angle from the pointer - so honoring rotation
     * here would let a resize quietly turn the graphic.
     */
    private bars(base: Feature<Point>, opts: PointGraphicOptions): Position[][] {
        const center = turf.point(base.geometry.coordinates);
        const span = Math.max(opts?.size ?? 1, 1);
        const half = span / 2;
        const gap = (span * SEPARATION_RATIO) / 2;

        const bar = (bearingToAnchor: number): Position[] => {
            const anchor = turf.destination(center, gap, bearingToAnchor, {units: 'meters'});
            return [
                turf.destination(anchor, half, BAR_BEARING + 180, {units: 'meters'}).geometry.coordinates as Position,
                turf.destination(anchor, half, BAR_BEARING, {units: 'meters'}).geometry.coordinates as Position,
            ];
        };
        // 270 = due west, 90 = due east: same latitude, so both bars share their Y range.
        return [bar(270), bar(90)];
    }

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiLineString> {
        return this.asMultiLineStringFeature(this.bars(base, opts));
    }

    /**
     * `[edge, center]` - edge first, as every `missionTask`-routed graphic must: `handles[0]`
     * drives rotate and resize, `handles[1]` drives translate.
     *
     * The edge handle sits at the end of the leading bar rather than out on the axis, so the
     * thing the user grabs to resize is on the symbol itself.
     */
    generateHandles(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([this.bars(base, opts)[0][0], base.geometry.coordinates]);
    }

    /** No amplifiers: these carry affiliation and nothing else. */
    generateLabels(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([]);
    }
}

/**
 * Which bars a bar symbol hashes, indexed in the order the generator emits them - **left
 * first** within each lean. A name absent from the table draws every bar solid, which is
 * what roadblock complete relies on.
 */
export const BAR_SYMBOL_DASHES: Partial<Record<TacticalGraphicName, boolean[]>> = {
    [TacticalGraphicName.ExplosivesPlannedStateOfReadiness]: [true, true],
    [TacticalGraphicName.ExplosivesStateOfReadiness1Safe]: [true, false],
    [TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable]: [false, false],
};
