import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import {
    MovementGraphicOptions,
    TacticalGraphicName
} from "../core/type";
import geometryService from "../core/GeometryService";
import {Coordinate} from "../core/type";

export class Bridge extends TacticalGraphicsBase {

    name: string;
    type: string = "MultiLineString";

    constructor(tacticalGraphicName: TacticalGraphicName) {
        super();
        this.name = tacticalGraphicName;
    }

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        let radius: number = opts?.radius || 20;
        let baseCoords = base.geometry.coordinates;

        const leftArrowBase: Coordinate[] = geometryService.computeParallelLineString(baseCoords, radius);
        const rightArrowBase: Coordinate[] = geometryService.computeParallelLineString(baseCoords, -radius);
        let leftbar = geometryService.simpleLineToCrowbar(leftArrowBase, radius, 'right');
        let rightbar = geometryService.simpleLineToCrowbar(rightArrowBase, radius, 'left');
        return this.asMultiLineStringFeature([leftbar.geometry.coordinates, rightbar.geometry.coordinates]);
    }

    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        let radius: number = opts?.radius || 20;
        let baseCoords = base.geometry.coordinates;

        const leftArrowBase: Coordinate[] = geometryService.computeParallelLineString(baseCoords, radius);
        let leftbar = geometryService.simpleLineToCrowbar(leftArrowBase, radius, 'right');

        return this.asMultiPointFeature(
            [
                base.geometry.coordinates[0],
                base.geometry.coordinates[base.geometry.coordinates.length - 1],
                leftbar.geometry.coordinates[leftbar.geometry.coordinates.length - 1]
            ]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        let size: number = opts?.size || 20;
        return this.asMultiPointFeature(geometryService.getBridgeLabelPoints(base.geometry.coordinates, size * 15));
    }

}