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
        let startArrow: Position[] = geometryService.computeArrowheadPoints(base.geometry.coordinates[1], base.geometry.coordinates[0], -size, 135);

        let endArrow: Position[];
        if (base.geometry.coordinates.length == 2) {
            endArrow = geometryService.computeArrowheadPoints(base.geometry.coordinates[0], base.geometry.coordinates[1], -size, 135);
        } else {
            endArrow = geometryService.computeArrowheadPoints(base.geometry.coordinates[1], base.geometry.coordinates[2], -size, 135);
        }

        return this.asMultiLineStringFeature([
            base.geometry.coordinates,
            startArrow,
            endArrow
        ]);
    }

    /**
     * The two leg ends, plus the apex between them.
     *
     * Order is the contract the OpenLayers controller reads: ends first, apex last, so
     * `anchorVertex` can name it without depending on how many vertices were drawn. The
     * ends reshape the V — angle and leg length together — while the apex moves the whole
     * graphic, which is why it is a handle at all rather than just a corner.
     */
    generateHandles(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiPoint> {
        const baseCoords = base.geometry.coordinates;
        const ends = [baseCoords[0], baseCoords[baseCoords.length - 1]];
        if (baseCoords.length < 3) return this.asMultiPointFeature(ends);
        return this.asMultiPointFeature([...ends, baseCoords[Math.floor(baseCoords.length / 2)]]);
    }

    generateLabels(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiPoint> {
        let baseCoords = base.geometry.coordinates;
        return this.asMultiPointFeature([baseCoords[0], baseCoords[baseCoords.length - 1]]);
    };
}
