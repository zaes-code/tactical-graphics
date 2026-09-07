import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";
import {frontEdgeFrame} from "./frontEdgeFrame";

/**
 * How much wider than the arrowhead 341800's vertical line is drawn.
 *
 * `getPenetrationArrowGraphic` builds the line at `3 x size` either side of the axis, so a
 * *placed* half-height has to be divided by this to reach the number that helper wants. It
 * matches FrontalAttack's span so the two read at the same weight at the tip.
 */
const PENETRATION_FRONT_HALF_RATIO = 3;

export class Penetration extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.Penetration;
    /**
     * **LineString, not Point.** This generator is driven by a drawn line — its
     * `generateGraphics` takes `Feature<LineString>` — and declaring `Point` made
     * `renderTacticalGraphic` reject every base a consumer could give it. The
     * OpenLayers holders never noticed because they call the registry directly and
     * bypass that guard; the public entry point is the only reader of this field.
     */
    type: string = 'LineString';

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiLineString> {
        const {axis, half} = frontEdgeFrame(base, opts.size);
        // `getPenetrationArrowGraphic` takes the arrowhead's own size and draws the vertical
        // line at `FRONT_HALF_RATIO` times it, so the placed half-height is divided back out.
        // The drawing is unchanged; what changed is where the number comes from.
        return geometryService.getPenetrationArrowGraphic(axis, half / PENETRATION_FRONT_HALF_RATIO);
    }

    /**
     * **A grip on each of 341800's three anchor points**, and a derived pair for an old base.
     *
     * > Points 1 and 2 define the endpoints of the symbol's vertical line. Point 3 defines
     * > the rear of the symbol. […] Points 1 and 2 determine the height of the symbol and
     * > point 3 determines its length.
     *
     * That is 340500 clear's rule word for word, so this graphic takes clear's contract:
     * three placed points, every one grabbable, and no derived width handle — the height it
     * used to size from a `size` amplifier is two of its own anchor points. (User's call,
     * 2026-09-06: "penetration should be the same behaviour as clear with its 3 points".)
     *
     * ## What this replaced
     *
     * `[offset, p0, p1]` — the order the rest of the block family uses, where
     * element 0 is the width handle the OpenLayers holder splits off and the
     * remaining two are the base segment's own endpoints. p0 is dropped by the
     * one-segment rule, so what renders is the arrow tip plus the width handle.
     *
     * The width handle is the end of the front line, which `getPenetrationArrowGraphic`
     * draws at `3 × size` perpendicular to the base — so it lands *on* the
     * graphic and grabbing that line's end is what changes its length. It used
     * to be `getBypassArrow(...).coordinates[1][2]`, a point on an unrelated
     * borrowed arrowhead that floated near the front line without touching it.
     *
     * Being three `size`s out means the renderer has to scale the drag down by
     * the same factor — see `OFFSET_SCALE` in the OpenLayers `Block` holder.
     *
     * (An earlier revision emitted `[offset, offsetRailEnd, p0]`, which left p0
     * as the only surviving path handle once the one-segment rule landed.)
     */
    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        if (coords.length >= 3) return this.asMultiPointFeature(coords.slice(0, 3));

        const last = coords[coords.length - 1];
        const secondToLast = coords[coords.length - 2];
        // Negative to match the side the front line's first point is drawn on.
        const frontLineEnd = geometryService.getPerpendicularPoint(last, secondToLast, -3 * opts.size);

        return this.asMultiPointFeature([frontLineEnd, coords[0], last]);
    }

    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([base.geometry.coordinates[0]]);
    }

}