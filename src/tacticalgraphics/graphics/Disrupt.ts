import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";

export class Disrupt extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string;
    /**
     * **LineString, not Point.** This generator is driven by a drawn line — its
     * `generateGraphics` takes `Feature<LineString>` — and declaring `Point` made
     * `renderTacticalGraphic` reject every base a consumer could give it. The
     * OpenLayers holders never noticed because they call the registry directly and
     * bypass that guard; the public entry point is the only reader of this field.
     */
    type: string = 'LineString';

    /** Mission task or table 5-19 obstacle effect — same trident, "D" aside. @see Block */
    constructor(name: TacticalGraphicName = TacticalGraphicName.TacticalDisrupt) {
        super();
        this.name = name;
    }

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiLineString> {
        return geometryService.getDisruptGraphic(base.geometry.coordinates, opts.size);
    }

    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        let graphic = this.generateGraphics(base, opts);
        let topArrow = graphic.geometry.coordinates[1];
        let bottomArrow = graphic.geometry.coordinates[3];

        return this.asMultiPointFeature([topArrow[2], topArrow[1], bottomArrow[1], base.geometry.coordinates[0], base.geometry.coordinates[1]]);
    }

    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([base.geometry.coordinates[0]]);
    }

}