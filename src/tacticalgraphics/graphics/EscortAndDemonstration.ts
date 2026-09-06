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
import {anchorsForParallelLegs, hairpinAnchors, parallelLegsFromAnchors, turnBulgesLeft} from '../core/anchors';
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
     * The four points APP-06 343300 names — **three placed, the fourth constructed.**
     *
     * > Anchor Points. This symbol requires four anchor points. Point 1 defines the tip of
     * > the arrowhead. Point 2 defines the end of the straight line portion of the first
     * > arrow. Points 3 and 4 define the length of the second straight line.
     * >
     * > Size/Shape. Points 1 and 2 and points 3 and 4 determine the length of each side.
     * > Points 2 and 3 shall be connected by a smooth, curved line.
     *
     * The Template draws one figure: two straights of equal length, parallel, closed by a
     * half turn on the chord from point 2 to point 3. **Point 4 is where that figure puts
     * it** — point 3 displaced by point 2 → point 1 — so it carries no decision of its own
     * and is derived rather than clicked, the way 343500's fourth point is. Point 3 is read
     * for its distance across the first leg and the side it fell on, which is the reading
     * 152800 gets and for the same reason: the turn is tangent to both straights.
     *
     * The operator therefore places three points and drags three grips, and the legs cannot
     * splay or come out unequal at any point in between. (User's call, 2026-09-06: "the
     * lines across from each other must be parallel and same size at all times"; and "let's
     * draw these 2 like we do canes where we just let the user pick 3 points".)
     * @see hairpinAnchors, which states both readings once for this graphic and 341900
     *
     * ## What this replaced
     *
     * A one-click drop. The four points existed, but `anchorsForParallelLegs` laid all of
     * them out from a single centre at a fixed leg length and a fixed opening, so the
     * operator stated position and nothing else and none of the four could be placed.
     *
     * ## The fallback, which is what keeps old files readable
     *
     * A base of two points is one written before that change — a dropped demonstration saved
     * as its base. It resolves through the old layout, so nothing saved stops rendering and a
     * half-finished draw still shows a symbol. @see anchorsForParallelLegs
     */
    private points(base: Feature<LineString>, opts?: IBaseGraphicOptions): Position[] {
        const coordinates = base.geometry.coordinates;
        /*
         * **Re-derived on every render, never read past point 3.** A stored point 4 that
         * disagrees — a legacy file, a synthesised sample, hand-written GeoJSON — is ignored
         * rather than drawn, and so is any along-leg drift in point 3. Doing it here rather
         * than only at draw time is what makes the constraint hold under an edit: both
         * engines drag a base vertex straight, and neither of them knows this shape.
         */
        const anchors = hairpinAnchors(coordinates);
        if (anchors) return anchors;
        if (coordinates.length >= 4) return coordinates.slice(0, 4);

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

        // The bulge goes on the far side of the chord from the tips — the U rather than a
        // flattened Z — and **which side that is depends on where point 3 was dragged to**,
        // so it is read off the shape rather than hardcoded. @see turnBulgesLeft
        const turn = geometryService.createSemicircle(bend1, bend2, across, span / 2, TURN_STEPS, turnBulgesLeft(tip1, bend1, bend2));

        return this.asMultiLineStringFeature([[tip1, bend1], turn as Position[], [bend2, tip2]]);
    }

    /**
     * **A grip on each of the three points the operator places** — point 4 gets none.
     *
     * It published `[edge, centre]` — the point-anchored contract — while the symbol was
     * dropped whole, so the only draggable mark scaled a shape the operator could not
     * otherwise change. Points 1, 2 and 3 are placed now and each is grabbable; point 4 is
     * derived from them, and a grip on a derived point is a grip that cannot move it. That is
     * envelopment's contract too: three placed, the fourth computed and ungrabbed.
     * @see hairpinFourthPoint
     */
    generateHandles(base: Feature<LineString>, opts?: IBaseGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature(this.points(base, opts).slice(0, 3));
    }

    /** The first leg, which is where the paint cuts its break for `DEM`. */
    generateLabels(base: Feature<LineString>, opts?: IBaseGraphicOptions): Feature<MultiPoint> {
        const [tip1, bend1] = this.points(base, opts);
        return this.asMultiPointFeature([tip1, bend1]);
    }
}
