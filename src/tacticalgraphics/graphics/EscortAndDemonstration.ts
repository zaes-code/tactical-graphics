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
import {toDegrees} from '../core/math';
import {anchorsForParallelLegs, parallelLegsFromAnchors} from '../core/anchors';
import geometryService from '../core/GeometryService';

/** How many points the demonstration's turn is drawn with. */
const TURN_STEPS = 32;

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
 * APP-06 343300 demonstration — **dropped whole, described by four points.**
 *
 * > This symbol requires four anchor points. Point 1 defines the tip of the arrowhead.
 * > Point 2 defines the end of the straight line portion of the first arrow. Points 3 and
 * > 4 define the length of the second straight line. Points 2 and 3 shall be connected by
 * > a smooth, curved line.
 *
 * The four are the description, and the base carries all four — but they are **one shape
 * at one set of proportions**: two straights of equal length, parallel, joined by a half
 * turn whose diameter is the gap between them. Nothing in the rule invites an operator to
 * vary those ratios, and left free they drifted — the legs splayed, the turn went oval,
 * and the symbol stopped reading as a demonstration.
 *
 * So the first click drops it and points 2, 3 and 4 follow from point 1, the leg length
 * and the aim. Resize and rotate change the whole graphic together; there is no ratio to
 * edit and no vertex to drag. (User's call, 2026-08-27.)
 *
 * **Point 1 is the anchor, not a centre** — unlike every other layout in
 * `core/anchors.ts`. That is the standard's numbering, and it means the symbol grows away
 * from where it was clicked rather than around it.
 *
 * @see anchorsForParallelLegs — the layout, stated once for both renderers
 * @see hasDerivedAnchors — why the four points are not four handles
 */
export class Demonstration extends TacticalGraphicsBase<IBaseGraphicOptions> {
    name: string = TacticalGraphicName.Demonstration;
    type: string = 'LineString';

    /**
     * The four points, from the anchor outward.
     *
     * Read off the base when it carries them, which is every base a holder writes. The
     * `opts` fallback is for a two-point sketch and for a caller handing in a raw anchor
     * — points 3 and 4 are derived either way, so a base whose legs disagree with them
     * resolves to the canonical shape rather than to whatever it had drifted into.
     */
    private points(base: Feature<LineString>, opts?: IBaseGraphicOptions): Position[] {
        const coordinates = base.geometry.coordinates;
        const drawn = parallelLegsFromAnchors(coordinates);
        const tip = drawn?.tip ?? coordinates[0] ?? [0, 0];
        const size = drawn?.size ?? (opts?.size && opts.size > 0 ? opts.size : DEMONSTRATION_DEFAULT_SIZE);
        const rotation = drawn ? toDegrees(drawn.angle) : opts?.rotation ?? 0;
        return anchorsForParallelLegs(tip, size, rotation);
    }

    generateGraphics(base: Feature<LineString>, opts?: IBaseGraphicOptions): Feature<MultiLineString> {
        const [tip1, bend1, bend2, tip2] = this.points(base, opts);
        const across = turf.bearing(turf.point(bend1), turf.point(bend2));
        const span = turf.distance(turf.point(bend1), turf.point(bend2), {units: 'meters'});

        // `true` puts the bulge on the far side of the chord from the tips — the U rather
        // than a flattened Z. With the points derived the handedness is fixed by
        // construction, so there is nothing left to infer from the drawing order.
        const turn = geometryService.createSemicircle(bend1, bend2, across, span / 2, TURN_STEPS, true);

        return this.asMultiLineStringFeature([[tip1, bend1], turn as Position[], [bend2, tip2]]);
    }

    /** `[edge, centre]` — the point-anchored contract. The edge is the first leg's far end. */
    generateHandles(base: Feature<LineString>, opts?: IBaseGraphicOptions): Feature<MultiPoint> {
        const [tip1, bend1] = this.points(base, opts);
        return this.asMultiPointFeature([bend1, tip1]);
    }

    /** The first leg, which is where the paint cuts its break for `DEM`. */
    generateLabels(base: Feature<LineString>, opts?: IBaseGraphicOptions): Feature<MultiPoint> {
        const [tip1, bend1] = this.points(base, opts);
        return this.asMultiPointFeature([tip1, bend1]);
    }
}
