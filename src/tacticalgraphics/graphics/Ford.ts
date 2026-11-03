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
import * as turf from "../core/turf";

/** Each gap between a bar's three dashes, as a share of one dash. */
const FORD_GAP_TO_DASH = 0.25;

/**
 * A ford bar as the three long dashes 271500's Template draws, whatever its length.
 *
 * **A count, not a pattern**, which is why this is geometry rather than a stroke dash:
 * APP-06, FM 1-02.2 Table 5-16 and MIL-STD-2525E Table L-XVI all draw three dashes per bar,
 * and a pattern sized on screen draws however many fit (it was about twelve). Three
 * dashes are a share of the bar, so they scale with it as the bar itself does.
 */
function threeDashes(bar: Position[]): Position[][] {
    const line = turf.lineString(bar);
    const total = turf.length(line, {units: 'meters'});
    if (!(total > 0)) return [bar];
    const dash = total / (3 + 2 * FORD_GAP_TO_DASH);
    const gap = dash * FORD_GAP_TO_DASH;
    return [0, 1, 2].map(i => {
        const start = i * (dash + gap);
        return turf.lineSliceAlong(line, start, Math.min(total, start + dash), {units: 'meters'}).geometry.coordinates;
    });
}

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
        // [upper bar's three dashes, lower bar's three dashes]. @see threeDashes
        return this.asMultiLineStringFeature([...threeDashes(leftArrowBase), ...threeDashes(rightArrowBase)]);
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

        let zigzag = geometryService.generateZigZag(centre, 10, radius / 2.5, 5);
        // [upper bar's three dashes, lower bar's three dashes, zigzag]. @see threeDashes
        return this.asMultiLineStringFeature([...threeDashes(leftArrowBase), ...threeDashes(rightArrowBase), zigzag]);
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