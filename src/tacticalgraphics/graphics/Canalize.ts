import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";
import {frontEdgeFrame, legacyAxis} from "./frontEdgeFrame";

/**
 * Canalize — APP-06 340400.
 *
 * # Its Draw Rules cell is empty, and its own Template says what the points are
 *
 * 340400's row carries no Anchor Points or Size/Shape text at all. Rendered at 3.2x, its
 * Draw Rules cell holds only *"Orientation. The opening typically faces enemy forces."* and
 * *"Static/Dynamic: D"*; the "…will be the same height as the opening and parallel to it"
 * sentence that appears just above it sits on the other side of the row rule and belongs to
 * bypass 340300. An empty cell inherits the row above, which is bypass:
 *
 * > This symbol requires three anchor points. Points 1 and 2 define the tips of the
 * > arrowheads and point 3 defines the rear of the symbol. … Points 1 and 2 determine the
 * > symbol's height and point 3 determines its length. The vertical line at the rear of the
 * > symbol will be the same height as the opening and parallel to it.
 *
 * **That is confirmed by the plate rather than assumed from adjacency**, which is what makes
 * it a statement and not an interpretation: canalize's *own* Template labels all three
 * points — `PT. 1` at the upper arrowhead, `PT. 2` at the lower one, `PT. 3` called out to
 * the `C` on the rear upright. Those are the places bypass's sentence names, on canalize's
 * own picture. The text layer loses the labels entirely, so the row reads empty to any
 * reader that does not open the image.
 *
 * The figure is a rectangle open on the right — top line, left upright, bottom line — with
 * both arrowheads at the right-hand ends turned inward, and the `C` at the upright's
 * midpoint. Same construction as bypass, so it reads its clicks through the same reader and
 * draws through the same frame; only the end marks differ. @see frontEdgeFrame, Bypass
 */
export class Canalize extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.Canalize;
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
        let topArrow = geometryService.getBreachArrow(axis, -half, 135, -45);
        let bottomArrow = geometryService.getBreachArrow(axis, half, 45, -135);
        return this.asMultiLineStringFeature([
            ...bottomArrow.geometry.coordinates,
            ...topArrow.geometry.coordinates,
            [topArrow.geometry.coordinates[0][0], bottomArrow.geometry.coordinates[0][0]]
        ]);
    }

    /** `[arm tip 1, arm tip 2, rear]`, or the legacy `[offset, p0, p1]`. @see Breach */
    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        if (coords.length >= 3) return this.asMultiPointFeature([coords[0], coords[1], coords[2]]);

        const legacy = legacyAxis(coords);
        let topArrow = geometryService.getBreachArrow(legacy, -opts.size, 135, -45);
        return this.asMultiPointFeature([topArrow.geometry.coordinates[1][0], legacy[0], legacy[1]]);
    }

    /** The letter belongs at the rear, which is the axis's start. @see Breach.generateLabels */
    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([frontEdgeFrame(base, opts.size).axis[0]]);
    }

}
