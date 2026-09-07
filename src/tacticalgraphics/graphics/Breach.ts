import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";
import {frontEdgeFrame, legacyAxis} from "./frontEdgeFrame";

/**
 * Breach — APP-06 340200.
 *
 * > **Anchor Points.** This symbol requires three anchor points. Points 1 and 2 define the
 * > endpoints of the symbol's opening and point 3 defines the rear of the symbol.
 * > **Size/Shape.** Points 1 and 2 determine the symbol's height and point 3 determines its
 * > length. The vertical line at the rear of the symbol will be the same height as the
 * > opening and parallel to it.
 * > **Orientation.** The opening defines the span of the breach and typically faces enemy
 * > forces.
 *
 * **It was two points and a locked aspect ratio until 2026-09-06.** The base ran rear to
 * front and the height came from `RATIO_LOCK`, a fixed 0.3 of that length — so the two
 * dimensions the plate states *independently* were one number, and the third anchor point
 * had nowhere to live. Points 1 and 2 are the opening now, and how far back point 3 sits is
 * the length. @see frontEdgeFrame
 */
export class Breach extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.Breach;
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
        let topArrow = geometryService.getBreachArrow(axis, -half, 45, -135);
        let bottomArrow = geometryService.getBreachArrow(axis, half, 135, -45);
        return this.asMultiLineStringFeature([
            ...bottomArrow.geometry.coordinates,
            ...topArrow.geometry.coordinates,
            [topArrow.geometry.coordinates[0][0], bottomArrow.geometry.coordinates[0][0]]
        ]);
    }

    /**
     * The three placed points, in the order the plate numbers them: `[opening 1, opening 2,
     * rear]`. Every grip is a point the operator put down, so each moves one thing.
     *
     * A base saved before the conversion has two points and keeps its old contract,
     * `[offset, p0, p1]` — element 0 the width handle the OpenLayers holder splits off, the
     * other two the segment's own ends.
     */
    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        if (coords.length >= 3) return this.asMultiPointFeature([coords[0], coords[1], coords[2]]);

        const legacy = legacyAxis(coords);
        let topArrow = geometryService.getBreachArrow(legacy, -opts.size, 45, -135);
        return this.asMultiPointFeature([topArrow.geometry.coordinates[1][0], legacy[0], legacy[1]]);
    }

    /**
     * The letter sits at the **rear**, which is the axis's own start rather than the base's
     * first coordinate: with three anchor points that first coordinate is one end of the
     * opening, at the far end of the symbol from where the B belongs.
     */
    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([frontEdgeFrame(base, opts.size).axis[0]]);
    }

}
