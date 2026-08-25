/**
 * # Escort and demonstration
 *
 * APP-06 343600 and 343300. Two tasks that have nothing in common doctrinally and share a
 * file because both are a drawn path plus a fixed mark, and neither is big enough to earn
 * one of its own.
 *
 * Both put their geometry here and their marks in the paint layer, on the usual split: the
 * shape of the path is the operator's, the size of a leg or an arrowhead is not.
 * @see escortAndDemonstrationPaints.ts
 */

import {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';
import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {IBaseGraphicOptions, TacticalGraphicName} from '../core/type';
import geometryService from '../core/GeometryService';

/** How many points the demonstration's turn is drawn with. */
const TURN_STEPS = 32;

/**
 * APP-06 343600 escort — a bracket over the unit being escorted, with `E A E` in a break at
 * its middle.
 *
 * > Point 1 defines the centre of the graphic. Point 2 and Point 3 defines the length of
 * > the escort. […] The escort symbol appears above the convoy or escorted unit symbol.
 *
 * The geometry is the bar alone. Its two legs are a fixed screen depth, exactly as the
 * fortified position's are and for the same reason, and the break for the amplifiers is
 * measured from the rendered text.
 */
export class Escort extends TacticalGraphicsBase {
    name: string = TacticalGraphicName.Escort;
    type: string = 'LineString';

    generateGraphics(base: Feature<LineString>, opts?: IBaseGraphicOptions): Feature<LineString> {
        const c = base.geometry.coordinates;
        // Points 2 and 3 are the span; point 1 is the centre, which the label rides.
        return this.asLineStringFeature(c.length >= 3 ? [c[1], c[2]] : c);
    }

    generateHandles(base: Feature<LineString>): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 3));
    }

    generateLabels(base: Feature<LineString>): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 1));
    }
}

/**
 * APP-06 343300 demonstration — two straight legs joined by a turn, arrowheaded at both
 * open ends.
 *
 * > Point 1 defines the tip of the arrowhead. Point 2 defines the end of the straight line
 * > portion of the first arrow. Points 3 and 4 define the length of the second straight
 * > line. […] Points 2 and 3 shall be connected by a smooth, curved line.
 *
 * **The turn bulges away from the legs**, which is what makes the symbol a U rather than an
 * S. Which side that is has to be derived — the operator can draw the pair in either
 * order, and a hard-coded left or right flips the graphic inside out for half of them.
 */
export class Demonstration extends TacticalGraphicsBase {
    name: string = TacticalGraphicName.Demonstration;
    type: string = 'LineString';

    generateGraphics(base: Feature<LineString>, opts?: IBaseGraphicOptions): Feature<MultiLineString> {
        const c = base.geometry.coordinates;
        if (c.length < 4) return this.asMultiLineStringFeature([c]);

        const [tip1, bend1, bend2, tip2] = c;
        const across = turf.bearing(turf.point(bend1), turf.point(bend2));
        const span = turf.distance(turf.point(bend1), turf.point(bend2), {units: 'meters'});

        // The tips sit on one side of the bend-to-bend chord; the turn goes on the other.
        const towardTips = turf.bearing(
            turf.midpoint(turf.point(bend1), turf.point(bend2)),
            turf.midpoint(turf.point(tip1), turf.point(tip2)),
        );
        const toTips = ((((towardTips - across) % 360) + 540) % 360) - 180;

        // `createSemicircle` bulges left of bend 1 -> bend 2 unless flipped, so flip when
        // the tips are on the left. Getting this backwards is not a subtle error — the
        // turn wraps toward the arrowheads and the U becomes an S — but it is invisible
        // until the symbol is drawn the other way round, which is why the test does both.
        const turn = geometryService.createSemicircle(bend1, bend2, across, span / 2, TURN_STEPS, toTips < 0);

        return this.asMultiLineStringFeature([[tip1, bend1], turn as Position[], [bend2, tip2]]);
    }

    generateHandles(base: Feature<LineString>): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 4));
    }

    generateLabels(base: Feature<LineString>): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 2));
    }
}
