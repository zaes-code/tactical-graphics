import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint, Position} from "geojson";
import geometryService from "../core/GeometryService";
import * as turf from "../core/turf";

/*
 * # 270502's arrow lengths, measured off its own Template at 600 dpi
 *
 * The rule says only that "the length of the short arrows will remain in proportion to the
 * length of the longest arrow" and leaves the proportions to the picture. Fitted from the
 * plate: the vertical bar sits at x = 470 spanning 395 px, and the three arrowheads tip at
 * x = 860, 764 and 674 — so against the longest arrow's 390 px reach the middle prong runs
 * 0.754 and the short one 0.523, and the middle prong's tail crosses 0.621 back behind the
 * bar. The arrowhead itself measures 65 px along the shaft, 0.167 of that reach.
 */
/** The middle prong's reach ahead of the bar, as a share of the longest arrow's. */
const DISRUPT_MIDDLE_REACH = 0.754;
/** How far the middle prong alone runs back behind the bar, same units. */
const DISRUPT_MIDDLE_TAIL = 0.621;
/** The short prong's reach, at the point 1 end of the bar. */
const DISRUPT_SHORT_REACH = 0.523;
/** Arrowhead length along the shaft, as a share of the longest arrow's reach. */
const DISRUPT_ARROWHEAD_REACH = 0.167;

export class Disrupt extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string;
    /**
     * **LineString, not Point.** This generator is driven by a drawn line — its
     * `generateGraphics` takes `Feature<LineString>` — and declaring `Point` made
     * `renderTacticalGraphic` reject every base a consumer could give it. The
     * OpenLayers holders never noticed because they call the registry directly and
     * bypass that guard; the public entry point is the only reader of this field.
     */
    type: string = 'LineString';

    /** Mission task or table 5-19 obstacle effect — same trident, "D" aside. @see Block */
    constructor(name: TacticalGraphicName = TacticalGraphicName.TacticalDisrupt) {
        super();
        this.name = name;
    }

    /**
     * The three arrows and the bar they spring from, out of APP-06 270502 / 341000's three
     * points.
     *
     * > Points 1 and 2 define the end points of the symbol's vertical line. Point 3 defines
     * > the tip of the longest arrow.
     * >
     * > Points 1 and 2 determine the height of the symbol and point 3 determines its length.
     * > The spacing between the symbol's arrows will stay proportional to the symbol's
     * > vertical line. The length of the short arrows will remain in proportion to the length
     * > of the longest arrow.
     *
     * The spacing clause needs no constant of its own: the three arrows leave the bar at its
     * two ends and its middle, which is proportional by construction. The length clause does,
     * and the two ratios below are **measured off the Template at 600 dpi** rather than
     * chosen — see {@link DISRUPT_MIDDLE_REACH} and {@link DISRUPT_SHORT_REACH}.
     *
     * **It was a two-point graphic until 2026-09-06**, and the two were along the arrows: the
     * bar was `size` — a screen constant — laid across the midpoint, so the operator could
     * state neither the symbol's height nor where its arrows started. 341000 states the same
     * rule as 270502, which is why the mission task and the table 8-17 obstacle effect share
     * this generator.
     */
    private prongs(base: Feature<LineString>, opts: PointGraphicOptions): Position[][] | undefined {
        const coords = base.geometry.coordinates;
        if (coords.length < 3) return undefined;

        const [first, second, tip] = coords;
        const bar = turf.bearing(turf.point(first), turf.point(second));
        const middle = turf.midpoint(turf.point(first), turf.point(second)).geometry.coordinates as Position;

        /*
         * **Squared here as well as in the reader.** `disruptAnchors` already puts point 3 on
         * the perpendicular at point 2, so for anything the operator drew this is the identity
         * — but a base can also arrive from a hand-written file or a vertex drag that has not
         * been read back yet, and taking the bearing to point 3 raw would splay all three
         * arrows off square. Re-projecting every render is what `MobileDefense.frame` does and
         * for the same reason: it makes the drawn symbol independent of how exact the stored
         * point happens to be, and `generateHandles` publishes the projected point so the grip
         * never drifts off the arrowhead it is supposed to be holding.
         */
        const toTip = turf.bearing(turf.point(second), turf.point(tip));
        const span = turf.distance(turf.point(second), turf.point(tip), {units: 'meters'});
        const across = span * Math.sin(((toTip - bar) * Math.PI) / 180);
        const reach = Math.abs(across);
        if (!isFinite(reach) || reach <= 0) return undefined;
        const out = bar + Math.sign(across) * 90;

        const along = (from: Position, metres: number): Position =>
            metres === 0
                ? from
                : (turf.destination(turf.point(from), Math.abs(metres), metres > 0 ? out : out + 180, {
                      units: 'meters',
                  }).geometry.coordinates as Position);

        const head = reach * DISRUPT_ARROWHEAD_REACH;
        const arrow = (from: Position, to: Position): Position[][] => [
            [from, to],
            geometryService.computeArrowheadPoints(from, to, head, 45),
        ];

        // To the *squared* tip, not to the raw point 3 — computing the direction and then
        // drawing to the stored point would leave the longest arrow alone off square.
        const longest = arrow(second, along(second, reach));
        const shortest = arrow(first, along(first, reach * DISRUPT_SHORT_REACH));
        // The middle prong alone runs back **behind** the bar, which is the one asymmetry the
        // Template draws and the "D" is cut into. @see DISRUPT_MIDDLE_TAIL
        const centre = arrow(along(middle, -reach * DISRUPT_MIDDLE_TAIL), along(middle, reach * DISRUPT_MIDDLE_REACH));

        /*
         * **Index 4 is the middle prong's shaft and that is load-bearing.** `clearPaint` cuts
         * the letter gap into `lines[4]`, so the order here is the order the paint reads.
         */
        return [longest[0], longest[1], shortest[0], shortest[1], centre[0], centre[1], [first, second]];
    }

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiLineString> {
        const drawn = this.prongs(base, opts);
        // A base saved before the third point existed describes the arrows and nothing else;
        // the projected helper rebuilds the bar from `size` exactly where it always was.
        if (!drawn) return geometryService.getDisruptGraphic(base.geometry.coordinates, opts.size);
        return this.asMultiLineStringFeature(drawn);
    }

    /** `[point 1, point 2, point 3]` — the bar's two ends and the longest arrow's tip. */
    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        if (coords.length < 3) {
            const graphic = geometryService.getDisruptGraphic(coords, opts.size);
            const topArrow = graphic.geometry.coordinates[1];
            const bottomArrow = graphic.geometry.coordinates[3];
            return this.asMultiPointFeature([topArrow[1], bottomArrow[1], coords[0], coords[1]]);
        }
        // Point 3 as the symbol actually draws it — the squared tip of the longest arrow,
        // which is `prongs`' own first shaft end. A grip anywhere else would be holding a
        // point the picture does not have.
        const drawn = this.prongs(base, opts);
        const longest = drawn?.[0];
        return this.asMultiPointFeature([coords[0], coords[1], longest ? longest[1] : coords[2]]);
    }

    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([base.geometry.coordinates[0]]);
    }

}