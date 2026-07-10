import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, GeometryCollection, LineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";

export class FerryCrossing extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.FerryCrossing;
    type: string = 'LineString';

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<GeometryCollection> {
        let size: number = opts?.size || 20;
        let arrowSize = 15 * size;
        let [p0, p1] = base.geometry.coordinates;
        const dir01 = geometryService.unitVector(p0, p1);
        const dir10 = geometryService.unitVector(p1, p0);
        let leftArrowHead = geometryService.createArrowHeadPolygon(p0, dir10, arrowSize);
        let rightArrowHead = geometryService.createArrowHeadPolygon(p1, dir01, arrowSize);
        return this.asGeometryCollectionFeature([
            base.geometry,
            leftArrowHead.geometry,
            rightArrowHead.geometry
        ]);
    }

    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates);
    }

    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([base.geometry.coordinates[0]]);
    }

}