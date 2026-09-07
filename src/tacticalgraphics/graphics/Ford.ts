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

/**
 * The centreline and half-separation of a ford's two bars, from wherever they are stated.
 *
 * 271500's Template letters `PT 1` and `PT 2` at the ends of one bar and `PT 3` on the other,
 * so the separation is a point the operator places. It was a `radius` amplifier — a number
 * with nowhere to put it — and a base written that way still resolves through it.
 * @see parallelRailFrame
 */
function railsOf(base: Feature<LineString>, opts?: MovementGraphicOptions): {centre: Position[]; half: number} {
    const coords = base.geometry.coordinates as Position[];
    /*
     * **Through the clicks reader, so the preview is the symbol being drawn.** Two points are
     * one bar with the other previewed beside it — not a centreline with both bars straddling
     * it, which is what the raw fallback below makes of them and what put the drawing cursor
     * down the middle of a line the symbol does not have. @see parallelRailAnchors
     */
    const drawn = parallelRailFrame(parallelRailAnchors(coords, 3, previewGap(opts)) ?? coords);
    if (drawn) return drawn;
    return {centre: coords, half: opts?.radius || 20};
}

export class Ford extends TacticalGraphicsBase {

    name: string = TacticalGraphicName.FordEasy;
    type: string = "MultiLineString";

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        const {centre, half: radius} = railsOf(base, opts);

        const leftArrowBase: Coordinate[] = geometryService.computeParallelLineString(centre, radius);
        const rightArrowBase: Coordinate[] = geometryService.computeParallelLineString(centre, -radius);
        return this.asMultiLineStringFeature([
            ...geometryService.lineStringToDashes(leftArrowBase, [radius / 3, radius / 3]).geometry.coordinates,
            ...geometryService.lineStringToDashes(rightArrowBase, [radius / 3, radius / 3]).geometry.coordinates]);
    }

    /** A grip on each of the three points 271500's Template letters. @see parallelRailAnchors */
    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates as Position[];
        if (coords.length >= 3) return this.asMultiPointFeature(coords.slice(0, 3));

        const {centre, half} = railsOf(base, opts);
        const leftArrowBase: Coordinate[] = geometryService.computeParallelLineString(centre, half);
        return this.asMultiPointFeature([coords[0], coords[coords.length - 1], leftArrowBase[leftArrowBase.length - 1]]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        let size: number = opts?.size || 20;
        return this.asMultiPointFeature([]);
    }
}

export class FordHard extends TacticalGraphicsBase {

    name: string = TacticalGraphicName.FordDifficult;
    type: string = "MultiLineString";

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        const {centre, half: radius} = railsOf(base, opts);

        const leftArrowBase: Coordinate[] = geometryService.computeParallelLineString(centre, radius);
        const rightArrowBase: Coordinate[] = geometryService.computeParallelLineString(centre, -radius);

        let upperDash = geometryService.lineStringToDashes(leftArrowBase, [radius / 3, radius / 3]);
        let lowerDash = geometryService.lineStringToDashes(rightArrowBase, [radius / 3, radius / 3]);
        let zigzag = geometryService.generateZigZag(centre, 10, radius / 2.5, 5);
        return this.asMultiLineStringFeature([
            ...upperDash.geometry.coordinates,
            ...lowerDash.geometry.coordinates,
            zigzag
        ]);
    }

    /** A grip on each of the three points 271500's Template letters. @see parallelRailAnchors */
    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates as Position[];
        if (coords.length >= 3) return this.asMultiPointFeature(coords.slice(0, 3));

        const {centre, half} = railsOf(base, opts);
        const leftArrowBase: Coordinate[] = geometryService.computeParallelLineString(centre, half);
        return this.asMultiPointFeature([coords[0], coords[coords.length - 1], leftArrowBase[leftArrowBase.length - 1]]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        let size: number = opts?.size || 20;
        return this.asMultiPointFeature([]);
    }
}