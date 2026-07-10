import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {Feature, LineString, MultiPoint} from "geojson";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import geometryService from "../core/GeometryService";

export class Block extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.TacticalBlock;
    type: string = 'Point';

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<LineString> {
        return geometryService.getBlockArrow(base, opts.size);
    }

    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        let arrow = this.generateGraphics(base, opts).geometry.coordinates;
        return this.asMultiPointFeature([arrow[3], arrow[0], arrow[1],]);
    }

    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        let arrow = this.generateGraphics(base, opts).geometry.coordinates;
        return this.asMultiPointFeature([arrow[0]]);
    }

}