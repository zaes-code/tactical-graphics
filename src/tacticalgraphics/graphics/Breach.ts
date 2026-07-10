import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";

export class Breach extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.Breach;
    type: string = 'Point';

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiLineString> {
        let topArrow = geometryService.getBreachArrow(base.geometry.coordinates, -opts.size, 45, -135);
        let bottomArrow = geometryService.getBreachArrow(base.geometry.coordinates, opts.size, 135, -45);
        return this.asMultiLineStringFeature([
            ...bottomArrow.geometry.coordinates,
            ...topArrow.geometry.coordinates,
            [topArrow.geometry.coordinates[0][0], bottomArrow.geometry.coordinates[0][0]]
        ]);
    }

    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        let topArrow = geometryService.getBreachArrow(base.geometry.coordinates, -opts.size, 45, -135);

        return this.asMultiPointFeature([topArrow.geometry.coordinates[1][0], topArrow.geometry.coordinates[0][1], base.geometry.coordinates[0],]);
    }

    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([base.geometry.coordinates[0]]);
    }

}