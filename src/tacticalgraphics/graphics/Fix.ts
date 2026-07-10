import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, GeometryCollection, LineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";
import * as turf from "@turf/turf";

// Layout proportions taken from the 145px floor (50px first segment, 45px
// triangle band, 50px trailing segment). Driving every dimension off the
// actual base length means rotate/resize scale the whole graphic uniformly —
// the user can't elongate one part of it.
const FIX_FIRST_SEGMENT_RATIO = 50 / 145;
const FIX_TRIANGLE_WIDTH_RATIO = 15 / 145;
const FIX_TRIANGLE_HEIGHT_RATIO = 20 / 145;

export class Fix extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.TacticalFix;
    type: string = 'Point';

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<GeometryCollection> {
        let [p0, p1] = base.geometry.coordinates;
        const dir01 = geometryService.unitVector(p0, p1);
        const baseLenMeters = turf.distance(turf.point(p0), turf.point(p1), {units: 'meters'});

        const firstSegmentLength = baseLenMeters * FIX_FIRST_SEGMENT_RATIO;
        const triangleWidth = baseLenMeters * FIX_TRIANGLE_WIDTH_RATIO;
        const triangleHeight = baseLenMeters * FIX_TRIANGLE_HEIGHT_RATIO;
        const arrowSize = triangleWidth;

        let newBase = this.asLineStringFeature(
            geometryService.generateFixGraphic(base.geometry.coordinates, triangleWidth, triangleHeight, 0, firstSegmentLength)
        );
        let rightArrowHead = geometryService.createArrowHeadPolygon(p1, dir01, arrowSize);
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