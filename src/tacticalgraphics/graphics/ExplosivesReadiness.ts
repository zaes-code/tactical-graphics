import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {PointGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, MultiLineString, MultiPoint, Point, Position} from 'geojson';
import * as turf from '@turf/turf';

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

/** Distance between the two bars, as a fraction of their length. */
const SEPARATION_RATIO = 0.32;

export class ExplosivesReadiness extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string;
    type: string = 'Point';

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    /** The two bars, leading one first. Both are plain two-point segments. */
    private bars(base: Feature<Point>, opts: PointGraphicOptions): Position[][] {
        const centre = turf.point(base.geometry.coordinates);
        const length = Math.max(opts?.size ?? 1, 1);
        const rotation = opts?.rotation ?? 0;
        const half = length / 2;
        const gap = (length * SEPARATION_RATIO) / 2;

        // Each bar runs along the rotation axis, displaced perpendicular to it.
        const bar = (side: number): Position[] => {
            const anchor = turf.destination(centre, gap, rotation + 90 * side, {units: 'meters'});
            return [
                turf.destination(anchor, half, rotation, {units: 'meters'}).geometry.coordinates as Position,
                turf.destination(anchor, half, rotation + 180, {units: 'meters'}).geometry.coordinates as Position,
            ];
        };
        return [bar(1), bar(-1)];
    }

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiLineString> {
        return this.asMultiLineStringFeature(this.bars(base, opts));
    }

    /**
     * `[edge, centre]` - edge first, as every `missionTask`-routed graphic must: `handles[0]`
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

/** Which of the two bars are dashed, leading bar first. */
export const EXPLOSIVES_DASHED: Partial<Record<TacticalGraphicName, [boolean, boolean]>> = {
    [TacticalGraphicName.ExplosivesPlannedStateOfReadiness]: [true, true],
    [TacticalGraphicName.ExplosivesStateOfReadiness1Safe]: [false, true],
    [TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable]: [false, false],
};
