import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import {
    MovementGraphicOptions,
    TacticalGraphicName
} from "../core/type";
import geometryService from "../core/GeometryService";
import {Coordinate} from "../core/type";
import {Position} from "geojson";
import {parallelRailFrame} from "../core/anchors";

export class Bridge extends TacticalGraphicsBase {

    name: string;
    type: string = "MultiLineString";

    constructor(tacticalGraphicName: TacticalGraphicName) {
        super();
        this.name = tacticalGraphicName;
    }

    /**
     * The centreline and half-separation, read from the anchor points where they are.
     *
     * The rails were a drawn centreline offset by a `radius` amplifier — the separation
     * stated as a number nobody could see and nowhere the operator could place. Their plates
     * give it an anchor point, so it comes off the points now, and a base written before that
     * still resolves through the amplifier. @see parallelRailFrame
     */
    private rails(base: Feature<LineString>, opts?: MovementGraphicOptions): {centre: Position[]; half: number} {
        const drawn = parallelRailFrame(base.geometry.coordinates as Position[]);
        if (drawn) return drawn;
        return {centre: base.geometry.coordinates as Position[], half: opts?.radius || 20};
    }

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        const {centre, half} = this.rails(base, opts);

        const leftArrowBase: Coordinate[] = geometryService.computeParallelLineString(centre, half);
        const rightArrowBase: Coordinate[] = geometryService.computeParallelLineString(centre, -half);
        let leftbar = geometryService.simpleLineToCrowbar(leftArrowBase, half, 'right');
        let rightbar = geometryService.simpleLineToCrowbar(rightArrowBase, half, 'left');
        return this.asMultiLineStringFeature([leftbar.geometry.coordinates, rightbar.geometry.coordinates]);
    }

    /**
     * **A grip on each anchor point the plate numbers.** 271100 and 271300 name four, two per
     * side of the gap; the fourth is derived, so it gets one too only because it is stored —
     * a base written before the conversion publishes the three the old contract had.
     */
    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates as Position[];
        if (coords.length >= 3) return this.asMultiPointFeature(coords.slice(0, 4));

        const {centre, half} = this.rails(base, opts);
        const leftArrowBase: Coordinate[] = geometryService.computeParallelLineString(centre, half);
        let leftbar = geometryService.simpleLineToCrowbar(leftArrowBase, half, 'right');
        return this.asMultiPointFeature([
            coords[0],
            coords[coords.length - 1],
            leftbar.geometry.coordinates[leftbar.geometry.coordinates.length - 1],
        ]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        let size: number = opts?.size || 20;
        return this.asMultiPointFeature(geometryService.getBridgeLabelPoints(this.rails(base, opts).centre, size));
    }

}