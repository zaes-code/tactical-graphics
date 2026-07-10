import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {IBaseGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint, Position} from "geojson";
import geometryService from "../core/GeometryService";

export class FieldsOfFire extends TacticalGraphicsBase {
    name: string = TacticalGraphicName.FieldsOfFire;
    type: string = "LineString";

    generateGraphics(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiLineString> {
        if (base.geometry.coordinates.length < 2) return this.asMultiLineStringFeature([base.geometry.coordinates]);

        let size = opts?.size || 1;
        let startArrow: Position[] = geometryService.computeArrowheadPoints(base.geometry.coordinates[1], base.geometry.coordinates[0], -size * 20, 135);

        let endArrow: Position[];
        if (base.geometry.coordinates.length == 2) {
            endArrow = geometryService.computeArrowheadPoints(base.geometry.coordinates[0], base.geometry.coordinates[1], -size * 20, 135);
        } else {
            endArrow = geometryService.computeArrowheadPoints(base.geometry.coordinates[1], base.geometry.coordinates[2], -size * 20, 135);
        }

        return this.asMultiLineStringFeature([
            base.geometry.coordinates,
            startArrow,
            endArrow
        ]);
    }

    generateHandles(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiPoint> {
        let baseCoords = base.geometry.coordinates;
        return this.asMultiPointFeature([baseCoords[0], baseCoords[baseCoords.length - 1]]);
    }

    generateLabels(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiPoint> {
        let baseCoords = base.geometry.coordinates;
        return this.asMultiPointFeature([baseCoords[0], baseCoords[baseCoords.length - 1]]);
    };
}
