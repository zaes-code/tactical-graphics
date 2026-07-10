import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";

export class Bypass extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.Bypass;
    type: string = 'Point';

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiLineString> {
        let topArrow = geometryService.getBypassArrow(base.geometry.coordinates, -opts.size);
        let bottomArrow = geometryService.getBypassArrow(base.geometry.coordinates, opts.size);
        return this.asMultiLineStringFeature([
            ...bottomArrow.geometry.coordinates,
            ...topArrow.geometry.coordinates,
            [topArrow.geometry.coordinates[0][0], bottomArrow.geometry.coordinates[0][0]]
        ]);
    }

    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        let topArrow = geometryService.getBypassArrow(base.geometry.coordinates, -opts.size);

        return this.asMultiPointFeature([topArrow.geometry.coordinates[1][2], topArrow.geometry.coordinates[0][1], base.geometry.coordinates[0],]);
    }

    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([base.geometry.coordinates[0]]);
    }

}