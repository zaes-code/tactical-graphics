import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {IBaseGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiPoint} from "geojson";

export class ForwardLineOfOwnTroops extends TacticalGraphicsBase {
    name: string = TacticalGraphicName.ForwardLineOfOwnTroops;
    type: string = "LineString";

    /** The drawn line, undecorated — the wave is drawn in screen space. @see LineOfContact */
    generateGraphics(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<LineString> {
        return this.asLineStringFeature(base.geometry.coordinates);
    }

    generateHandles(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiPoint> {
        let baseCoords = base.geometry.coordinates;
        return this.asMultiPointFeature([baseCoords[0], baseCoords[baseCoords.length - 1]]);
    }

    generateLabels(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiPoint> {
        // No labels for FLOT
        return this.asMultiPointFeature([]);
    };
}

export class LineOfContact extends TacticalGraphicsBase {
    name: string = TacticalGraphicName.LineOfContact;
    type: string = "LineString";

    /**
     * The drawn centerline, undecorated.
     *
     * Both waves and the gap between them are drawn in screen space by
     * `lineOfContactStyleFunc`. Baked in here they were sized from the drawing
     * resolution, so the distance between the enemy-side and friendly-side waves — the
     * one thing this symbol is *about* — grew and shrank with zoom.
     */
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
