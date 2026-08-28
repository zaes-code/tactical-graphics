/**
 * # The two minimum safe distance zones
 *
 * APP-06 272100 and its multiple-strike form 272101 — also FM 1-02.2 table 5-28, under
 * "CBRN Contour Lines". Both draw **two nested rings** numbered 1 and 2, and differ only in
 * where the rings come from:
 *
 * - 272100 takes three anchor points. *"The centre point defines the centre of the symbol.
 *   Points 1, and 2 define the radii of circles 1, and 2."* So the rings are circles.
 * - 272101 takes an even number, at least six. *"Points 1 through N/2 define the inner safe
 *   zone (zone 1). Points N/2 +1 though point N defines the outer zone (zone 2)."* So the
 *   rings are whatever the operator traced.
 *
 * Both hand the paint layer the same thing — inner ring first, outer second — which is why
 * they are built together and share `nestedZonePaint`.
 */

import {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';
import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {IBaseGraphicOptions, TacticalGraphicName} from '../core/type';

/** How many points each circle is drawn with. */
const CIRCLE_STEPS = 72;

/** A closed ring through the given points, or nothing if there are too few. */
function closed(points: Position[]): Position[] | null {
    if (points.length < 3) return null;
    const first = points[0];
    const last = points[points.length - 1];
    return first[0] === last[0] && first[1] === last[1] ? points : [...points, first];
}

/** APP-06 272100 — a centre and two radii. */
export class MinimumSafeDistanceZone extends TacticalGraphicsBase {
    name: string = TacticalGraphicName.MinimumSafeDistanceZone;
    type: string = 'LineString';

    generateGraphics(base: Feature<LineString>, opts?: IBaseGraphicOptions): Feature<MultiLineString> {
        const c = base.geometry.coordinates;
        if (c.length < 3) return this.asMultiLineStringFeature([c]);

        const [center, first, second] = c;
        const radii = [first, second]
            .map(p => turf.distance(turf.point(center), turf.point(p), {units: 'meters'}))
            // Inner ring first, whichever way round the operator placed the two points:
            // the paint layer numbers them by position and a swapped pair would label the
            // outer ring 1.
            .sort((a, b) => a - b);

        return this.asMultiLineStringFeature(radii.map(radius =>
            turf.circle(center, radius / 1000, {steps: CIRCLE_STEPS, units: 'kilometers'})
                .geometry.coordinates[0]));
    }

    generateHandles(base: Feature<LineString>): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 3));
    }

    generateLabels(base: Feature<LineString>): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 1));
    }
}

/** APP-06 272101 — two traced zones from one even-numbered point list. */
export class MinimumSafeDistanceMultipleStrike extends TacticalGraphicsBase {
    name: string = TacticalGraphicName.MinimumSafeDistanceMultipleStrike;
    type: string = 'LineString';

    generateGraphics(base: Feature<LineString>, opts?: IBaseGraphicOptions): Feature<MultiLineString> {
        const c = base.geometry.coordinates;
        // **An odd count is a graphic still being drawn, not an error to correct.** The
        // rule says the number "shall always be an even number, with an equal number of
        // points for both polygons" — which is true of a finished symbol and false of
        // every other click while making one.
        const half = Math.floor(c.length / 2);
        if (half < 3) return this.asMultiLineStringFeature([c]);

        const inner = closed(c.slice(0, half));
        const outer = closed(c.slice(half, half * 2));
        return this.asMultiLineStringFeature([inner, outer].filter((r): r is Position[] => r !== null));
    }

    generateHandles(base: Feature<LineString>): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates);
    }

    generateLabels(base: Feature<LineString>): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 1));
    }
}
