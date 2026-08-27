import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {Feature, LineString, MultiLineString, MultiPoint, Point} from "geojson";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import geometryService from "../core/GeometryService";
import * as turf from "../core/turf";

export class RetrogradeTask extends TacticalGraphicsBase<PointGraphicOptions> {
    name: TacticalGraphicName;
    type: string = "LineString";

    constructor(tacticalGraphicName: TacticalGraphicName) {
        super();
        this.name = tacticalGraphicName;
    }

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiLineString> {
        return geometryService.getCaneArrow(base, opts.size, opts.size, opts.mirrored ?? false);
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

    /**
     * The S, per 343700's three anchor points.
     *
     * > Point 1 defines the end of the straight line portion of the graphic. Point 2
     * > defines the centre of the two 90 degree circular arcs. Point 3 defines the tip of
     * > the arrowhead.
     *
     * This used to draw the operator's raw polyline with a head on the end — a route, not
     * the symbol. The plate is a specific shape: a straight run carrying `EX`, an S made of
     * two quarter turns, and a straight run to the arrowhead.
     * @see GeometryService.createSCurve for why point 2 reads as depth and side
     */
    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiLineString> {
        const coords = base.geometry.coordinates;
        if (coords.length < 3) return this.asMultiLineStringFeature([coords]);

        const path = geometryService.createSCurve(coords[0], coords[2], coords[1]);
        // **Capped against the run.** `opts.size` is the holder's decoration size in metres
        // and is far larger than this symbol's head: unclamped it drew a V spanning most of
        // the graphic, which reads as the path folding back on itself rather than as an
        // arrowhead. A sixth of the run is what the plate draws.
        // A sixth of the run, and **never larger** — `opts.size` is the holder's decoration
        // size in metres and dwarfs this symbol's head. A caller with no size at all is the
        // ordinary case for a consumer reading raw GeoJSON, and `Math.min(undefined, x)` is
        // NaN, which loses the arrowhead entirely.
        const run = turf.distance(turf.point(coords[0]), turf.point(coords[2]), {units: 'meters'});
        const head = Math.min(opts?.size ?? Number.POSITIVE_INFINITY, run / 6);
        const arrowhead = geometryService.computeArrowheadPoints(
            path[path.length - 2],
            path[path.length - 1],
            head,
            45,
        );
        return this.asMultiLineStringFeature([path, arrowhead]);
    }

    /** The three anchor points, in the order the standard numbers them. */
    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 3));
    }

    /**
     * A two-point span along the **first straight**, so a renderer takes both the anchor
     * and the rotation of the `EX` label from it.
     *
     * Point 1 is the free end of that straight and the S begins part way along it, so the
     * span runs from point 1 toward point 2 rather than to the next drawn vertex — which
     * on a three-point base is the middle of the curve.
     */
    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        const c = base.geometry.coordinates;
        if (c.length < 3) return this.asMultiPointFeature(c.slice(0, 2));
        const path = geometryService.createSCurve(c[0], c[2], c[1]);
        return this.asMultiPointFeature([path[0], path[1]]);
    }
}

/**
 * Infiltrate (APP-06 343800) — **the exfiltration, with a different letter.**
 *
 * The two Draw Rules are the same text: three anchor points meaning the same three things,
 * one construction, one arrowhead. They differ by a typo — *"the length of the of the
 * symbol"* — and by one word of Orientation, *friendly* forces against *enemy* forces, which
 * tells the operator which way to aim it and changes no geometry.
 *
 * So this is a subclass carrying only the name, and it stays that way. Sharing the geometry
 * alone was tried and was not enough: the two still had different holders, different
 * controllers, different label paints and differently-sized arrowheads, and every one of
 * those was visible. A symbol whose only difference from another is its letter should be
 * one class.
 */
export class Infiltration extends Exfiltrate {
    name: TacticalGraphicName = TacticalGraphicName.Infiltration;
}
