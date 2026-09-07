import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import {
    MovementGraphicOptions,
    TacticalGraphicName
} from "../core/type";
import geometryService from "../core/GeometryService";
import {Coordinate} from "../core/type";
import {Position} from "geojson";
import {parallelRailAnchors, parallelRailFrame} from "../core/anchors";

/**
 * The preview gap in metres, from the half-width the holder sized against the screen.
 *
 * `radius` is that half-width — the renderers set it from the resolution — so twice it is
 * the gap, and the controllers size it so the gap comes out at `RAIL_PREVIEW_GAP_PX`. A
 * restored graphic carries its *saved* radius here instead, which is what keeps a file
 * written before the conversion drawing at the width it was saved at.
 */
const previewGap = (opts?: MovementGraphicOptions): number | undefined =>
    opts?.radius !== undefined && opts.radius > 0 ? opts.radius * 2 : undefined;

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
        const coords = base.geometry.coordinates as Position[];
        /*
         * **Through the clicks reader, so the preview is the symbol being drawn.** Two points
         * are one bar with the other previewed beside it — not a centreline with both bars
         * straddling it, which is what the raw fallback below makes of them and what put the
         * cursor down the middle of a line the symbol does not have.
         * @see parallelRailAnchors
         */
        const drawn = parallelRailFrame(parallelRailAnchors(coords, coords.length >= 4 ? 4 : 3, previewGap(opts)) ?? coords);
        if (drawn) return drawn;
        return {centre: coords, half: opts?.radius || 20};
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