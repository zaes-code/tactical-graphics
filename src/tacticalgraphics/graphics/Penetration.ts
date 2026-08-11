import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";

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
        return geometryService.getPenetrationArrowGraphic(base.geometry.coordinates, opts.size);
    }

    /**
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