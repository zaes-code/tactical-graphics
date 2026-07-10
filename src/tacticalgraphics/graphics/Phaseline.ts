import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {IBaseGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";

export class Phaseline extends TacticalGraphicsBase {
    name: string;
    type: string = "LineString";

    constructor(tacticalGraphicName: TacticalGraphicName) {
        super();
        this.name = tacticalGraphicName;
    }

    generateGraphics(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<LineString> {
        return base;
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


export class ObstacleLine extends TacticalGraphicsBase {
    name: string = TacticalGraphicName.ObstacleLine;
    type: string = "LineString";

    generateGraphics(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<LineString> {
        let size = opts?.size ?? 1;
        let graphic = geometryService.generateToothedLineStringFromTriangles(base.geometry.coordinates, size * 15, size * 15, size * 20);
        return this.asLineStringFeature(graphic);
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


