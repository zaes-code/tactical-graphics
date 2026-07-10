import {Coordinate} from '../core/type';
import {MultiLineString, MultiPoint, Feature, Point} from 'geojson';
import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {SecurityOperationOptions, TacticalGraphicName} from "../core/type";
import geometryService from "../core/GeometryService";
import * as turf from "@turf/turf";

export class SecurityOperation extends TacticalGraphicsBase<SecurityOperationOptions> {
    name: string;
    type: string = "Point";

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    calculateLabelCoordinate = (coord: Coordinate): Coordinate => {
        return coord.map(coord => coord / 1.5);
    };

    generateGraphics(base: Feature<Point>, opts: SecurityOperationOptions): Feature<MultiLineString> {
        let {centerPadding, arrowLength, arrowDepth, arrowHeadLength, arrowHeadDegree} = opts;
        let searchArrowCoords = geometryService.getSearchAreaArrow(centerPadding, arrowLength, arrowDepth, arrowHeadLength, arrowHeadDegree);
        return this.asMultiLineStringFeature(searchArrowCoords);
    }

    generateHandles(base: Feature<Point>, opts: SecurityOperationOptions): Feature {
        let {centerPadding, arrowLength, arrowDepth, arrowHeadLength, arrowHeadDegree} = opts;
        let searchArrowCoords = geometryService.getSearchAreaArrow(centerPadding, arrowLength, arrowDepth, arrowHeadLength, arrowHeadDegree);

        return this.asMultiPointFeature([[0, 0], searchArrowCoords[1][1], searchArrowCoords[3][1]]);
    }

    generateLabels(base: Feature<Point>, opts: SecurityOperationOptions): Feature<MultiPoint> {
        let {centerPadding, arrowLength, arrowDepth} = opts;
        let centroid = turf.point([0, 0]);
        let rightArrowBaseCoords = geometryService.getSearchArrowLine(centroid, centerPadding, arrowLength, arrowDepth);
        let leftArrowBaseCoords = geometryService.getSearchArrowLine(centroid, -centerPadding, -arrowLength, -arrowDepth);
        return this.asMultiPointFeature([this.calculateLabelCoordinate(leftArrowBaseCoords[0]), this.calculateLabelCoordinate(rightArrowBaseCoords[0])]);
    }
}
