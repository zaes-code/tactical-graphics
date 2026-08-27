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

import {Feature, LineString, MultiLineString, MultiPoint, Point, Position} from 'geojson';
import * as turf from '../core/turf';
import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {IBaseGraphicOptions, PointGraphicOptions, TacticalGraphicName} from '../core/type';
import {toRadians} from '../core/math';
import geometryService from '../core/GeometryService';

/** How many points the demonstration's turn is drawn with. */
const TURN_STEPS = 32;

/**
 * Half the demonstration's opening, as a share of one leg. @see Demonstration.points
 *
 * The ratio the operator does not get to edit: 343300's Template draws legs of about 265
 * units against an opening of about 185.
 */
const DEMONSTRATION_HALF_OPENING = 0.35;

/** Leg length in metres for a base carrying no size at all — a raw-GeoJSON reader. */
const DEMONSTRATION_DEFAULT_SIZE = 1000;

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
 * APP-06 343300 demonstration — **dropped, not drawn.**
 *
 * > Point 1 defines the tip of the arrowhead. Point 2 defines the end of the straight line
 * > portion of the first arrow. Points 3 and 4 define the length of the second straight
 * > line. [...] Points 2 and 3 shall be connected by a smooth, curved line.
 *
 * The four points describe **one shape at one set of proportions**: two straights of equal
 * length, parallel, joined by a half turn whose diameter is the gap between them. Nothing in
 * the rule invites an operator to vary those ratios, and left free they drifted — the legs
 * splayed, the turn went oval, and the symbol stopped reading as a demonstration.
 *
 * So the first click drops it and the other three points follow: point 1 is the arrowhead's
 * tip and the anchor, `size` is the leg length, `rotation` aims it, and the U's opening is a
 * fixed share of the leg. Resize and rotate change the whole graphic together; there is no
 * ratio to edit. (User's call, 2026-08-27.)
 *
 * **The tip is the anchor, not the centre**, which is unlike every other dropped graphic
 * here. That is the standard's numbering — point 1 is the tip — and it means the symbol
 * grows away from where it was clicked rather than around it.
 */
export class Demonstration extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.Demonstration;
    type: string = 'Point';

    /**
     * The four points, from the anchor outward.
     *
     * Measured off the Template: the legs run about 265 units and the U's opening about 185,
     * so the opening is a little over two thirds of a leg and each half of it is
     * {@link DEMONSTRATION_HALF_OPENING}.
     */
    private points(base: Feature<Point>, opts?: PointGraphicOptions): Position[] {
        const tip1 = base.geometry.coordinates;
        const size = opts?.size && opts.size > 0 ? opts.size : DEMONSTRATION_DEFAULT_SIZE;
        const half = size * DEMONSTRATION_HALF_OPENING;
        const aim = toRadians(opts?.rotation ?? 0);

        const bend1 = geometryService.translateCoordinates(tip1, size, aim);
        const bend2 = geometryService.translateCoordinates(bend1, 2 * half, aim + Math.PI / 2);
        const tip2 = geometryService.translateCoordinates(bend2, size, aim + Math.PI);
        return [tip1, bend1, bend2, tip2];
    }

    generateGraphics(base: Feature<Point>, opts?: PointGraphicOptions): Feature<MultiLineString> {
        const [tip1, bend1, bend2, tip2] = this.points(base, opts);
        const across = turf.bearing(turf.point(bend1), turf.point(bend2));
        const span = turf.distance(turf.point(bend1), turf.point(bend2), {units: 'meters'});

        // The turn bulges away from the tips, which is what makes the symbol a U rather than
        // an S. With the points derived rather than drawn the side is fixed by construction,
        // so there is nothing left to infer.
        // `true` puts the bulge on the far side of the chord from the tips. It is the
        // right-hand normal of point 2 -> point 3, and with the points derived rather than
        // drawn the handedness is fixed — a bulge on the other side folds the turn back
        // between the legs and the symbol reads as a flattened Z.
        const turn = geometryService.createSemicircle(bend1, bend2, across, span / 2, TURN_STEPS, true);

        return this.asMultiLineStringFeature([[tip1, bend1], turn as Position[], [bend2, tip2]]);
    }

    /** `[edge, centre]` — the point-anchored contract. The edge is the first leg's far end. */
    generateHandles(base: Feature<Point>, opts?: PointGraphicOptions): Feature<MultiPoint> {
        const [tip1, bend1] = this.points(base, opts);
        return this.asMultiPointFeature([bend1, tip1]);
    }

    /** The first leg, which is where the paint cuts its break for `DEM`. */
    generateLabels(base: Feature<Point>, opts?: PointGraphicOptions): Feature<MultiPoint> {
        const [tip1, bend1] = this.points(base, opts);
        return this.asMultiPointFeature([tip1, bend1]);
    }
}
