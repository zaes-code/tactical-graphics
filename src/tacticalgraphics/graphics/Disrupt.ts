import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";

export class Disrupt extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.TacticalDisrupt;
    type: string = 'Point';

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiLineString> {
        return geometryService.getDisruptGraphic(base.geometry.coordinates, opts.size);
    }

    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        let graphic = this.generateGraphics(base, opts);
        let topArrow = graphic.geometry.coordinates[1];
        let bottomArrow = graphic.geometry.coordinates[3];

        return this.asMultiPointFeature([topArrow[2], topArrow[1], bottomArrow[1], base.geometry.coordinates[0], base.geometry.coordinates[1]]);
    }

    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([base.geometry.coordinates[0]]);
    }

}