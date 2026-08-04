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

    /**
     * Where the label sits, in metres from the centre.
     *
     * `centerPadding / 1.5` was the original rule, and it is kept as the fallback
     * so an options object without `labelPadding` produces the geometry it always
     * did. It ties the label-to-line gap to a third of the padding, which is why
     * the holder passes an explicit value instead.
     */
    private labelPadding = (opts: SecurityOperationOptions): number => opts.labelPadding ?? opts.centerPadding / 1.5;

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
        let {arrowLength, arrowDepth} = opts;
        let padding = this.labelPadding(opts);
        let centroid = turf.point([0, 0]);
        // Only element 0 — the inner end — is read, and it depends on the padding
        // alone; `arrowLength` and `arrowDepth` shape the rest of the line and are
        // passed only because the helper takes them.
        let rightArrowBaseCoords = geometryService.getSearchArrowLine(centroid, padding, arrowLength, arrowDepth);
        let leftArrowBaseCoords = geometryService.getSearchArrowLine(centroid, -padding, -arrowLength, -arrowDepth);
        return this.asMultiPointFeature([leftArrowBaseCoords[0], rightArrowBaseCoords[0]]);
    }
}
