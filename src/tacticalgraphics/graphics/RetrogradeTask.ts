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