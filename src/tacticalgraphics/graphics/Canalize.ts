import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";

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
        let topArrow = geometryService.getBreachArrow(base.geometry.coordinates, -opts.size, 135, -45);
        let bottomArrow = geometryService.getBreachArrow(base.geometry.coordinates, opts.size, 45, -135);
        return this.asMultiLineStringFeature([
            ...bottomArrow.geometry.coordinates,
            ...topArrow.geometry.coordinates,
            [topArrow.geometry.coordinates[0][0], bottomArrow.geometry.coordinates[0][0]]
        ]);
    }

    /**
     * `[offset, p0, p1]` — the order the rest of the block family uses, where
     * element 0 is the width handle the OpenLayers holder splits off and the
     * remaining two are the base segment's own endpoints.
     *
     * This used to emit `[offset, offsetRailEnd, p0]`: `getBreachArrow` returns
     * `[offsetBase, arrowhead…]`, so `coordinates[0][1]` is the far end of the
     * *parallel rail*, sitting a half-width off the segment rather than on it.
     * Once the p0 handle was dropped for one-segment graphics that stray point
     * was the only handle left, floating beside the graphic.
     */
    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        let topArrow = geometryService.getBreachArrow(base.geometry.coordinates, -opts.size, 135, -45);

        const coords = base.geometry.coordinates;

        return this.asMultiPointFeature([topArrow.geometry.coordinates[1][0], coords[0], coords[coords.length - 1]]);
    }

    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([base.geometry.coordinates[0]]);
    }

}