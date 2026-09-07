import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";
import {frontEdgeFrame, legacyAxis} from "./frontEdgeFrame";

/**
 * Bypass — APP-06 340300.
 *
 * > **Anchor Points.** This symbol requires three anchor points. Points 1 and 2 define the
 * > tips of the arrowheads and point 3 defines the rear of the symbol.
 * > **Size/Shape.** Points 1 and 2 determine the symbol's height and point 3 determines its
 * > length. The vertical line at the rear of the symbol will be the same height as the
 * > opening and parallel to it.
 * > **Orientation.** The opening typically faces enemy forces.
 *
 * Breach 340200's rule word for word, except that its points 1 and 2 are the *endpoints of
 * the opening* and these are the *tips of the arrowheads* — which for this symbol is the
 * same pair of places, since the arrowheads sit at the arms' far ends. The two differ in
 * their end marks, not in their frame. @see frontEdgeFrame
 *
 * Two points and a locked 0.3 aspect ratio until 2026-09-06; the plate states the height and
 * the length independently, which a ratio lock cannot do.
 */
export class Bypass extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.Bypass;
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
        let topArrow = geometryService.getBypassArrow(axis, -half);
        let bottomArrow = geometryService.getBypassArrow(axis, half);
        return this.asMultiLineStringFeature([
            ...bottomArrow.geometry.coordinates,
            ...topArrow.geometry.coordinates,
            [topArrow.geometry.coordinates[0][0], bottomArrow.geometry.coordinates[0][0]]
        ]);
    }

    /** `[arrowhead 1, arrowhead 2, rear]`, or the legacy `[offset, p0, p1]`. @see Breach */
    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        if (coords.length >= 3) return this.asMultiPointFeature([coords[0], coords[1], coords[2]]);

        const legacy = legacyAxis(coords);
        let topArrow = geometryService.getBypassArrow(legacy, -opts.size);
        return this.asMultiPointFeature([topArrow.geometry.coordinates[1][2], legacy[0], legacy[1]]);
    }

    /** The letter belongs at the rear, which is the axis's start. @see Breach.generateLabels */
    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([frontEdgeFrame(base, opts.size).axis[0]]);
    }

}
