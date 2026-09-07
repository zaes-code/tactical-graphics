import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {Feature, LineString, MultiPoint} from "geojson";
import { IBaseGraphicOptions, TacticalGraphicName} from "../core/type";

/**
 * Linear field fortification — the line equivalent of FortifiedArea: a
 * continuous baseline with rectangular "teeth" (merlons) bumping outward
 * (up at rotation 0). Output is a MultiLineString — sub-line [0] is the
 * baseline, sub-lines [1..N] are each tooth as 4 points (leftBase,
 * leftTop, rightTop, rightBase).
 *
 * Tooth/gap sizing scales with `opts.size` so the pattern stays visually
 * consistent across draw resolutions.
 */
export class FortifiedLine extends TacticalGraphicsBase {
    name: string = TacticalGraphicName.FortifiedLine;
    type: string = "LineString";

    /**
     * The drawn line, undecorated — the merlons are drawn in screen space by
     * `fortifiedLineStyleFunc`. They used to be baked in here at the drawing resolution,
     * so they were 15 px at whatever zoom the line happened to be drawn at and then
     * fixed in meters. @see Obstacle in AreaGraphic.ts
     */
    generateGraphics(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<LineString> {
        return this.asLineStringFeature(base.geometry.coordinates);
    }

    generateHandles(base: Feature<LineString>): Feature<MultiPoint> {
        const c = base.geometry.coordinates;
        return this.asMultiPointFeature([c[0], c[c.length - 1]]);
    }

    generateLabels(base: Feature<LineString>): Feature<MultiPoint> {
        const c = base.geometry.coordinates;
        return this.asMultiPointFeature([c[0], c[c.length - 1]]);
    }
}
