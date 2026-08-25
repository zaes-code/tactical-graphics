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
 * A partly drawn graphic returns its bare vertices rather than half a symbol: the arc
 * cannot be solved without its through-point, and guessing one produces a shape that
 * lurches when the fourth click lands.
 */
function anchors(base: Feature<LineString>): [Position, Position, Position, Position] | null {
    const c = base.geometry.coordinates;
    return c.length >= 4 ? [c[0], c[1], c[2], c[3]] : null;
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

    generateGraphics(base: Feature<LineString>, opts?: IBaseGraphicOptions): Feature<MultiLineString> {
        const points = anchors(base);
        if (!points) return this.asMultiLineStringFeature([base.geometry.coordinates]);

        const [center, edge, middle, tip] = points;
        const radius = turf.distance(turf.point(center), turf.point(edge), {units: 'meters'});
        const ring = turf.circle(center, radius / 1000, {steps: CIRCLE_STEPS, units: 'kilometers'});

        // The arc leaves the circle on the side it is heading for, so the two meet rather
        // than the arrow starting inside the unit's own symbol.
        const start = turf.destination(
            turf.point(center),
            radius / 1000,
            turf.bearing(turf.point(center), turf.point(middle)),
            {units: 'kilometers'},
        ).geometry.coordinates;

        return this.asMultiLineStringFeature([
            ring.geometry.coordinates[0],
            arcThrough(start, middle, tip),
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
