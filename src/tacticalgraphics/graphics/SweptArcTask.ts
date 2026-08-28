/**
 * # The three tasks drawn as a unit and a swept arrow
 *
 * Capture (APP-06 343000), evacuate (344500) and recover (344600). One construction,
 * three letters — the standard prints the same four-point draw rule under each, so it is
 * stated once here and the registry names three graphics against it.
 *
 * > Point 1 defines the centre of the circle. Point 2 defines the radius of the circle.
 * > Point 3 defines the middle of the arc. Point 4 defines the end of the arrow.
 *
 * **The circle is not a decoration — it holds a unit symbol.** *"The size of the circle
 * should be adjusted as needed to contain the unit assigned the task"*, which is why point
 * 2 exists at all: the radius is the user's, not a constant. The symbol itself is field A,
 * the same host-injected entity symbol the security operations carry, so nothing here
 * draws one. @see securityPaints, "the centre symbol is injected, never imported"
 *
 * The arrowhead and the letter are screen-sized and live in the paint layer.
 * @see sweptArcTaskPaints.ts
 */

import {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';
import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {IBaseGraphicOptions, TacticalGraphicName} from '../core/type';

/** How many points the circle and the arc are drawn with. */
const CIRCLE_STEPS = 64;
const ARC_STEPS = 40;

/**
 * The four drawn points, or nothing if the user has not placed them all yet.
 *
 * A *finished* graphic needs all four: the arc cannot be solved without its through-point.
 * What a half-drawn one shows is a different question — @see generateGraphics.
 */
function anchors(base: Feature<LineString>): [Position, Position, Position, Position] | null {
    const c = base.geometry.coordinates;
    return c.length >= 4 ? [c[0], c[1], c[2], c[3]] : null;
}

/** The circle points 1 and 2 describe. */
function circleOf(center: Position, edge: Position): Position[] {
    const radius = turf.distance(turf.point(center), turf.point(edge), {units: 'meters'});
    return turf.circle(center, radius / 1000, {steps: CIRCLE_STEPS, units: 'kilometers'})
        .geometry.coordinates[0] as Position[];
}

/**
 * Where the sweep leaves the circle: on the rim, on the side it is heading for, so the
 * arrow meets the unit's symbol rather than starting inside it.
 */
function rimToward(center: Position, edge: Position, toward: Position): Position {
    const radius = turf.distance(turf.point(center), turf.point(edge), {units: 'meters'});
    return turf.destination(
        turf.point(center),
        radius / 1000,
        turf.bearing(turf.point(center), turf.point(toward)),
        {units: 'kilometers'},
    ).geometry.coordinates;
}

/**
 * A quadratic Bézier from `start` to `end` that **passes through** `through` at its
 * middle.
 *
 * The draw rule says point 3 is the middle of the arc, not a control point — and a Bézier
 * does not pass through its control point, it passes through `(start + 2·control + end)/4`.
 * Solving that for the control point is the one line below, and skipping it puts the arc
 * roughly half as far from the chord as the user asked for.
 */
function arcThrough(start: Position, through: Position, end: Position): Position[] {
    const cx = 2 * through[0] - (start[0] + end[0]) / 2;
    const cy = 2 * through[1] - (start[1] + end[1]) / 2;

    const points: Position[] = [];
    for (let i = 0; i <= ARC_STEPS; i++) {
        const t = i / ARC_STEPS;
        const u = 1 - t;
        points.push([
            u * u * start[0] + 2 * u * t * cx + t * t * end[0],
            u * u * start[1] + 2 * u * t * cy + t * t * end[1],
        ]);
    }
    return points;
}

/**
 * The shared construction. `name` picks which of the three this instance is; nothing else
 * differs, and the letter is the paint layer's business.
 */
export class SweptArcTask extends TacticalGraphicsBase {
    name: string;
    type: string = 'LineString';

    constructor(tacticalGraphicName: TacticalGraphicName) {
        super();
        this.name = tacticalGraphicName;
    }

    /**
     * The finished symbol, or **as much of it as the placed points determine**.
     *
     * Four clicks is a long way to go on faith. This used to return the bare vertices for
     * all three intermediate states, so the operator watched a two-segment scribble until
     * the fourth click turned it into a circle and an arrow — and had no way to judge the
     * radius, which is the one measurement the rule asks them to get right (*"the size of
     * the circle should be adjusted as needed to contain the unit assigned the task"*).
     *
     * So each state draws what it knows and nothing it does not:
     *
     * | points | drawn |
     * |---|---|
     * | 1 | the point |
     * | 2 | the circle — centre and radius are both settled |
     * | 3 | the circle, and a straight run from its rim to point 3 |
     * | 4 | the circle and the arc, curved through point 3 |
     *
     * The three-point run is deliberately **straight**. Point 3 is the arc's middle, so a
     * curve through it needs point 4 to exist; drawing a guessed curve would swing when the
     * last click lands, where a straight run simply bends. (User's call, 2026-08-27.)
     */
    generateGraphics(base: Feature<LineString>, opts?: IBaseGraphicOptions): Feature<MultiLineString> {
        const c = base.geometry.coordinates;
        const points = anchors(base);

        if (!points) {
            if (c.length < 2) return this.asMultiLineStringFeature([c]);
            const ring = circleOf(c[0], c[1]);
            if (c.length < 3) return this.asMultiLineStringFeature([ring]);
            return this.asMultiLineStringFeature([ring, [rimToward(c[0], c[1], c[2]), c[2]]]);
        }

        const [center, edge, middle, tip] = points;
        return this.asMultiLineStringFeature([
            circleOf(center, edge),
            arcThrough(rimToward(center, edge, middle), middle, tip),
        ]);
    }

    /**
     * All four drawn points, in the order the standard numbers them.
     *
     * That order is the contract the controller reads — handle 0 is the circle's centre,
     * so dragging it moves the whole graphic, and the rest reshape it.
     */
    generateHandles(base: Feature<LineString>): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 4));
    }

    generateLabels(base: Feature<LineString>): Feature<MultiPoint> {
        const points = anchors(base);
        return this.asMultiPointFeature(points ? [points[0], points[2]] : base.geometry.coordinates);
    }
}
