import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {Feature, LineString, MultiLineString, MultiPoint, Point} from "geojson";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import geometryService from "../core/GeometryService";

export class RetrogradeTask extends TacticalGraphicsBase<PointGraphicOptions> {
    name: TacticalGraphicName;
    type: string = "LineString";

    constructor(tacticalGraphicName: TacticalGraphicName) {
        super();
        this.name = tacticalGraphicName;
    }

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiLineString> {
        return geometryService.getCaneArrow(base, opts.size, opts.size);
    }

    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        let graphic = this.generateGraphics(base, opts);
        let cane = graphic.geometry.coordinates[graphic.geometry.coordinates.length - 1];
        let end = cane[cane.length - 1];
        return this.asMultiPointFeature([end, base.geometry.coordinates[1]]);
    }

    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<Point> {
        return this.asPointFeature(base.geometry.coordinates[0]);
    }

}

/**
 * Exfiltrate — the drawn route, kept whole, with an arrowhead on its far end.
 *
 * Deliberately NOT a `RetrogradeTask`. It used to borrow the cane arrow, which
 * gave it two things it should not have: the half-circle hook at the start (that
 * hook is what distinguishes withdraw / delay / retirement from an exfiltration),
 * and a two-point limit, because `getCaneArrow` puts the arrowhead at
 * `baseCoords[1]` rather than at the end of the path. An exfiltration route bends,
 * so every vertex the user drew is kept and the arrowhead follows the last
 * segment's bearing.
 *
 * Returned MultiLineString segments:
 *   0: the route  (every drawn vertex)
 *   1: arrowhead  (3 points, at the last vertex)
 */
export class Exfiltrate extends TacticalGraphicsBase<PointGraphicOptions> {
    name: TacticalGraphicName = TacticalGraphicName.Exfiltrate;
    type: string = "LineString";

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiLineString> {
        const coords = base.geometry.coordinates;
        const arrowhead = geometryService.computeArrowheadPoints(
            coords[coords.length - 2],
            coords[coords.length - 1],
            opts.size,
            45,
        );
        return this.asMultiLineStringFeature([coords, arrowhead]);
    }

    /** Every drawn vertex is grabbable — there is no width to adjust. */
    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates);
    }

    /**
     * A two-point span across the middle of the FIRST drawn segment, so a
     * renderer can take both the anchor and the rotation of the "EX" label from
     * it without re-deriving the segment.
     */
    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        const [p0, p1] = base.geometry.coordinates;
        return this.asMultiPointFeature([p0, p1]);
    }
}