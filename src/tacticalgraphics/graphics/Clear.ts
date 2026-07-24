import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";

export class Clear extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.Clear;
    type: string = 'Point';

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiLineString> {
        return geometryService.getClearGraphic(base.geometry.coordinates, opts.size);
    }

    /**
     * `[offset, p0, p1]` — the order the rest of the block family uses, where
     * element 0 is the width handle the OpenLayers holder splits off and the
     * remaining two are the base segment's own endpoints.
     *
     * This used to emit `[offset, offsetRailEnd, p0]`: `getBypassArrow` returns
     * `[offsetBase, arrowhead…]`, so `coordinates[0][1]` is the far end of the
     * *parallel rail*, sitting a half-width off the segment rather than on it.
     * Once the p0 handle was dropped for one-segment graphics that stray point
     * was the only handle left, floating beside the graphic.
     */
    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        let topArrow = geometryService.getBypassArrow(base.geometry.coordinates, -opts.size);

        const coords = base.geometry.coordinates;

        return this.asMultiPointFeature([topArrow.geometry.coordinates[1][2], coords[0], coords[coords.length - 1]]);
    }

    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([base.geometry.coordinates[0]]);
    }

}