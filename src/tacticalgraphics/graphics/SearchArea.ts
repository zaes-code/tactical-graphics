import {Coordinate} from "../core/type";
import {MultiLineString, Point, Feature, MultiPoint} from "geojson";
import {svgToOpenLayersGeometry} from "../../utils/svgToGeoJson";
import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions} from "../core/type";

export class SearchArea extends TacticalGraphicsBase<PointGraphicOptions> {
    centroid: Coordinate = [0, 0];
    rotation: number = 0;
    size: number = 1;
    leftSvg = 'M 28445 -36318 L 241679 -156918 L 283627 -53797 M 285375 -53797 L 598236 -169153 M 446175 -258292 L 598233 -169225 L 530071 -27579';
    rightSvg = 'M 28445 36318 L 241679 156918 L 283627 53797 M 285375 53797 L 598236 169153 M 446175 258292 L 598233 169225 L 530071 27579';
    name: string = "SearchArea";
    type: string = "Point";

    _getGeometryFromSvg = (svg: string): Feature => {
        let {geoJSON} = svgToOpenLayersGeometry(svg, this.centroid);
        return geoJSON;
    };

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiLineString> {
        let leftArrowCoordinates: Feature<MultiLineString> = this._getGeometryFromSvg(this.leftSvg) as Feature<MultiLineString>;
        let rightArrowCoordinates: Feature<MultiLineString> = this._getGeometryFromSvg(this.rightSvg) as Feature<MultiLineString>;
        return this.asMultiLineStringFeature([...leftArrowCoordinates.geometry.coordinates, ...rightArrowCoordinates.geometry.coordinates]);
    }

    generateHandles(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiPoint> {
        let leftArrowCoordinates: Feature<MultiLineString> = (this._getGeometryFromSvg(this.leftSvg) as Feature<MultiLineString>);
        let rightArrowCoordinates: Feature<MultiLineString> = this._getGeometryFromSvg(this.rightSvg) as Feature<MultiLineString>;
        return this.asMultiPointFeature([this.centroid, leftArrowCoordinates.geometry.coordinates[2][1], rightArrowCoordinates.geometry.coordinates[2][1]]);
    }

    generateLabels(base: Feature<Point>, opts: PointGraphicOptions): Feature<Point> {
        return this.asPointFeature([]);
    }

}