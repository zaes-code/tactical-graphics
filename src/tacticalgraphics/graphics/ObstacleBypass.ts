/**
 * # The three obstacle bypasses
 *
 * APP-06 270601 easy, 270602 difficult, 270603 impossible. Two parallel arrows with a
 * rear bar closing them, and **the rear bar is the only thing that differs**: straight,
 * zigzagged, or broken with a tick at each stub's inner end. So the construction is
 * stated once here and `OBSTACLE_BYPASS_STYLES` says which bar each one draws.
 *
 * The draw rule fixes the whole shape from three points:
 *
 * > Points 1 and 2 define the tips of the arrowheads and point 3 defines the rear of the
 * > symbol. […] The vertical line at the rear of the symbol shall be the same length as
 * > the opening and shall be perpendicular to the parallel lines formed with the rear of
 * > symbol vertical line and the lines ending with points 1 and 2.
 *
 * **"The opening typically faces the applicable obstacle."** Which is orientation advice
 * for the user rather than something to enforce: the arrows point wherever points 1 and 2
 * were placed.
 *
 * The style table lives here, in the map-agnostic half, because it says what a symbol
 * *is*. @see obstacleBypassPaints.ts for the half that paints it.
 */

import {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';
import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {IBaseGraphicOptions, TacticalGraphicName} from '../core/type';

/** How the rear bar of a bypass is drawn. */
export type ObstacleBypassRear = 'straight' | 'zigzag' | 'broken';

/** Which bar each of the three draws. The rest of the symbol is identical. */
export const OBSTACLE_BYPASS_STYLES: Partial<Record<TacticalGraphicName, ObstacleBypassRear>> = {
    [TacticalGraphicName.ObstacleBypassEasy]: 'straight',
    [TacticalGraphicName.ObstacleBypassDifficult]: 'zigzag',
    [TacticalGraphicName.ObstacleBypassImpossible]: 'broken',
};

/** Sub-line indices of what `generateGraphics` returns, so the paint layer can name them. */
export const BYPASS_UPPER_LINE = 0;
export const BYPASS_LOWER_LINE = 1;
export const BYPASS_REAR_BAR = 2;

export class ObstacleBypass extends TacticalGraphicsBase {
    name: string;
    type: string = 'LineString';

    constructor(tacticalGraphicName: TacticalGraphicName) {
        super();
        this.name = tacticalGraphicName;
    }

    generateGraphics(base: Feature<LineString>, opts?: IBaseGraphicOptions): Feature<MultiLineString> {
        const c = base.geometry.coordinates;
        if (c.length < 3) return this.asMultiLineStringFeature([c]);

        const [tip1, tip2, rear] = c;
        const opening = turf.midpoint(turf.point(tip1), turf.point(tip2)).geometry.coordinates;

        // The parallel lines are perpendicular to the opening, running *away* from the
        // rear — so of the two perpendiculars, take the one the rear is not on.
        const acrossOpening = turf.bearing(turf.point(tip2), turf.point(tip1));
        const candidates = [acrossOpening - 90, acrossOpening + 90];
        const towardOpening = turf.bearing(turf.point(rear), turf.point(opening));
        const forward = candidates.reduce((best, b) =>
            Math.abs(angleBetween(b, towardOpening)) < Math.abs(angleBetween(best, towardOpening)) ? b : best);

        // Point 3 determines the length: how far back the rear sits *along the axis*, so
        // an off-axis point 3 still produces a rectangle rather than a parallelogram.
        const toRear = turf.distance(turf.point(rear), turf.point(opening), {units: 'meters'});
        const skew = angleBetween(towardOpening, forward);
        const length = Math.abs(toRear * Math.cos((skew * Math.PI) / 180));

        const back = (from: Position): Position => turf.destination(
            turf.point(from), length / 1000, forward + 180, {units: 'kilometers'},
        ).geometry.coordinates;

        const rear1 = back(tip1);
        const rear2 = back(tip2);

        return this.asMultiLineStringFeature([[rear1, tip1], [rear2, tip2], [rear1, rear2]]);
    }

    /** The three drawn points. Handle 2 is the rear, which is what moves the whole shape. */
    generateHandles(base: Feature<LineString>): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 3));
    }

    generateLabels(base: Feature<LineString>): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 3));
    }
}

/** The signed difference between two bearings, in (-180, 180]. */
function angleBetween(a: number, b: number): number {
    return (((a - b) % 360) + 540) % 360 - 180;
}
