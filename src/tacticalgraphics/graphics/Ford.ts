import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import {
    MovementGraphicOptions,
    TacticalGraphicName
} from "../core/type";
import geometryService from "../core/GeometryService";
import {Coordinate} from "../core/type";

export class Ford extends TacticalGraphicsBase {

    name: string = TacticalGraphicName.FordEasy;
    type: string = "MultiLineString";

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        let radius: number = opts?.radius || 20;
        let baseCoords = base.geometry.coordinates;

        const leftArrowBase: Coordinate[] = geometryService.computeParallelLineString(baseCoords, radius);
        const rightArrowBase: Coordinate[] = geometryService.computeParallelLineString(baseCoords, -radius);
        return this.asMultiLineStringFeature([
            ...geometryService.lineStringToDashes(leftArrowBase, [radius / 3, radius / 3]).geometry.coordinates,
            ...geometryService.lineStringToDashes(rightArrowBase, [radius / 3, radius / 3]).geometry.coordinates]);
    }

    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        let radius: number = opts?.radius || 20;
        let baseCoords = base.geometry.coordinates;

        const leftArrowBase: Coordinate[] = geometryService.computeParallelLineString(baseCoords, radius);
        return this.asMultiPointFeature(
            [
                base.geometry.coordinates[0],
                base.geometry.coordinates[base.geometry.coordinates.length - 1],
                leftArrowBase[leftArrowBase.length - 1]
            ]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        let size: number = opts?.size || 20;
        return this.asMultiPointFeature([]);
    }
}

export class FordHard extends TacticalGraphicsBase {

    name: string = TacticalGraphicName.FordDifficult;
    type: string = "MultiLineString";

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        let radius: number = opts?.radius || 20;
        let baseCoords = base.geometry.coordinates;

        const leftArrowBase: Coordinate[] = geometryService.computeParallelLineString(baseCoords, radius);
        const rightArrowBase: Coordinate[] = geometryService.computeParallelLineString(baseCoords, -radius);

        let upperDash = geometryService.lineStringToDashes(leftArrowBase, [radius / 3, radius / 3]);
        let lowerDash = geometryService.lineStringToDashes(rightArrowBase, [radius / 3, radius / 3]);
        let zigzag = geometryService.generateZigZag(baseCoords, 10, radius / 2.5, 5);
        return this.asMultiLineStringFeature([
            ...upperDash.geometry.coordinates,
            ...lowerDash.geometry.coordinates,
            zigzag
        ]);
    }

    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        let radius: number = opts?.radius || 20;
        let baseCoords = base.geometry.coordinates;

        const leftArrowBase: Coordinate[] = geometryService.computeParallelLineString(baseCoords, radius);
        return this.asMultiPointFeature(
            [
                base.geometry.coordinates[0],
                base.geometry.coordinates[base.geometry.coordinates.length - 1],
                leftArrowBase[leftArrowBase.length - 1]
            ]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        let size: number = opts?.size || 20;
        return this.asMultiPointFeature([]);
    }
}