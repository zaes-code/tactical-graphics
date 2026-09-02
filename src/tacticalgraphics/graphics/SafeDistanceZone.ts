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
import geometryService from '../core/GeometryService';
import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {IBaseGraphicOptions, TacticalGraphicName} from '../core/type';

/**
 * The standoff a freshly drawn multiple-strike zone starts with, in screen pixels.
 *
 * Half a CSS inch at 96 dpi. It is a **seed, not a screen-relative size**: a holder
 * multiplies it by the draw-time ground resolution once, stamps the resulting metres, and
 * from then on the zone stands off a real distance that does not move when the operator
 * zooms. A safety standoff that shrank in metres as you zoomed out would be a lie.
 *
 * Layer 1 owns it so both renderers seed the same gap. @see MinimumSafeDistanceMultipleStrike
 */
export const MINIMUM_SAFE_DISTANCE_DEFAULT_STANDOFF_PX = 48;

/**
 * The standoff a graphic should start with, in metres, or `undefined` if it files none.
 *
 * Both renderers call this rather than each seeding its own number. OpenLayers reached for
 * half a screen inch while MapLibre would have defaulted to its generic 20 px offset, and
 * the same symbol drawn on the two engines would have opened with different gaps — the
 * asymmetry the shared-symbology rule exists to prevent.
 *
 * @param groundResolution metres per pixel **on the ground**, not the bare projected
 * resolution, which is 1/cos(latitude) too large.
 */
export function defaultStandoffMetres(name: string, groundResolution: number): number | undefined {
    if (name !== TacticalGraphicName.MinimumSafeDistanceMultipleStrike) return undefined;
    return MINIMUM_SAFE_DISTANCE_DEFAULT_STANDOFF_PX * groundResolution;
}

/** How many points each circle is drawn with. */
const CIRCLE_STEPS = 72;

/** A closed ring through the given points, or nothing if there are too few. */
function closed(points: Position[]): Position[] | null {
    if (points.length < 3) return null;
    const first = points[0];
    const last = points[points.length - 1];
    return first[0] === last[0] && first[1] === last[1] ? points : [...points, first];
}

/**
 * The standoff between zone 1 and zone 2, in metres, or `undefined` for the legacy form.
 *
 * **`opts.radius` is half the public `width`.** `toGraphicOptions` halves it on the way in,
 * because for the corridors — which the convention was written for — a public width spans
 * the whole strip while a generator wants the half. A standoff is a full distance, so it is
 * doubled straight back. The operator types the gap they mean and gets it.
 */
function standoffMetres(opts?: IBaseGraphicOptions): number | undefined {
    const half = opts?.radius;
    if (half === undefined || !(half > 0)) return undefined;
    return half * 2;
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

/**
 * APP-06 272101 — zone 1 traced, zone 2 held off it by a standoff.
 *
 * **The operator draws one polygon, not two.** The plate has them place every point of
 * both: *"Points 1 through N/2 define the inner safe zone (zone 1). Points N/2 +1 though
 * point N defines the outer zone (zone 2)"*, with "an equal number of points for both
 * polygons". Tracing two matching rings by hand is miserable and the second one is almost
 * always the first held off by a fixed distance, so this asks for zone 1 and derives zone 2
 * from a standoff. Reshaping zone 1 reshapes zone 2 with it, which is the property the
 * hand-traced form could never guarantee.
 *
 * The emitted symbol still satisfies the rule: `offsetRingOutward` is a miter offset, one
 * output vertex per input vertex, so the two rings carry an equal number of points.
 *
 * **What it gives up.** A zone 2 that is *not* a uniform offset — wider on the downwind
 * side, say — is no longer expressible. The plate allows it. If that turns out to matter,
 * the old form is still here and still reachable: @see the standoff check below.
 *
 * **Two formats, told apart by the standoff.** A graphic saved before this change carries
 * no width, and its base holds both rings end to end; it still renders exactly as it did.
 * A graphic drawn after it carries a width and a base holding zone 1 alone. Nothing has to
 * guess, and nothing saved stops working.
 */
export class MinimumSafeDistanceMultipleStrike extends TacticalGraphicsBase {
    name: string = TacticalGraphicName.MinimumSafeDistanceMultipleStrike;
    type: string = 'LineString';

    generateGraphics(base: Feature<LineString>, opts?: IBaseGraphicOptions): Feature<MultiLineString> {
        const c = base.geometry.coordinates;
        const standoff = standoffMetres(opts);

        if (standoff !== undefined) {
            // Zone 1 as traced; zone 2 derived. Fewer than three points is a graphic still
            // being drawn — show the run rather than an empty symbol.
            const inner = closed(c);
            if (!inner) return this.asMultiLineStringFeature([c]);
            return this.asMultiLineStringFeature([inner, geometryService.offsetRingOutward(inner, standoff)]);
        }

        // **The legacy pair.** An odd count is a graphic still being drawn, not an error to
        // correct: the even-number rule is true of a finished symbol and false of every
        // other click while making one.
        const half = Math.floor(c.length / 2);
        if (half < 3) return this.asMultiLineStringFeature([c]);

        const inner = closed(c.slice(0, half));
        const outer = closed(c.slice(half, half * 2));
        return this.asMultiLineStringFeature([inner, outer].filter((r): r is Position[] => r !== null));
    }

    /**
     * Zone 1's vertices, and only those.
     *
     * Zone 2 has no handles of its own on purpose — it is derived, so a handle there would
     * offer an edit the shape cannot hold. The standoff is changed in the properties
     * dialog instead, which is also the only way to state it as a real distance.
     */
    generateHandles(base: Feature<LineString>): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates);
    }

    generateLabels(base: Feature<LineString>): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 1));
    }
}
