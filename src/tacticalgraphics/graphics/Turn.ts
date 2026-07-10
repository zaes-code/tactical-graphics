import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, GeometryCollection, LineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";

export class Turn extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.TacticalTurn;
    type: string = 'Point';

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<GeometryCollection> {
        let size = opts.size ?? 1;
        let arrowSize = 15 * size;
        let newBase = this.asLineStringFeature(geometryService.bendLine(base.geometry.coordinates, size));
        let newBaseCoords = newBase.geometry.coordinates
        const dir01 = geometryService.getCurveTangentAtEnd(newBaseCoords, 3);
        let rightArrowHead = geometryService.createArrowHeadPolygon(newBaseCoords[newBaseCoords.length - 1], dir01, arrowSize);

        return this.asGeometryCollectionFeature([
            newBase.geometry,
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