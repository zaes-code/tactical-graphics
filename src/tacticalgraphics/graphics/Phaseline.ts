import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {IBaseGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiPoint} from "geojson";

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

    /** The drawn line, undecorated — the teeth are drawn in screen space. @see Obstacle */
    generateGraphics(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<LineString> {
        return this.asLineStringFeature(base.geometry.coordinates);
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


