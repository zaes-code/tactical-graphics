import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {Feature, LineString, MultiLineString, MultiPoint, Point} from "geojson";
import {Coordinate, IBaseGraphicOptions, PointGraphicOptions, TacticalGraphicName} from "../core/type";
import geometryService from "../core/GeometryService";
import {toRadians} from "../core/math";

/**
 * Three-sided rectangle: left wall, top, right wall — open at the bottom.
 * The rectangle is 2:1 — the side walls are half the length of the top
 * line. At rotation = 0 the open side faces south. The user rotates the
 * graphic to point the open side wherever needed (typically toward the
 * friendly rear).
 *
 * `size` is the half-width (so the top line is `2·size` and each side
 * wall is `size`). The edit handle sits on the bottom-right corner.
 */
export class FightingPosition extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.FightingPosition;
    type: string = "Point";

    private corners(center: Coordinate, rotation: number, size: number) {
        const r = toRadians(rotation);
        const halfWidth = size;
        const halfHeight = size / 2;

        // Walk the rectangle in two steps so we can reuse the geodesic
        // translation: first move along the side axis (rotation ± 90°) to
        // the mid-top / mid-bottom of the rectangle, then along the
        // forward axis (rotation, rotation + 180°) to each corner.
        const midTop    = geometryService.translateCoordinates(center, halfHeight, r + Math.PI / 2);
        const midBottom = geometryService.translateCoordinates(center, halfHeight, r - Math.PI / 2);

        const TL = geometryService.translateCoordinates(midTop,    halfWidth, r + Math.PI);
        const TR = geometryService.translateCoordinates(midTop,    halfWidth, r);
        const BL = geometryService.translateCoordinates(midBottom, halfWidth, r + Math.PI);
        const BR = geometryService.translateCoordinates(midBottom, halfWidth, r);

        return {TL, TR, BR, BL};
    }

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<LineString> {
        const {TL, TR, BR, BL} = this.corners(base.geometry.coordinates, opts.rotation, opts.size);
        // Open at the bottom — render BL → TL → TR → BR as one polyline.
        return this.asLineStringFeature([BL, TL, TR, BR]);
    }

    generateHandles(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiPoint> {
        const center = base.geometry.coordinates;
        const {BR} = this.corners(center, opts.rotation, opts.size);
        // [edge, center] per the MissionTask convention. Edge = bottom-right
        // corner so dragging the corner rotates / resizes the rectangle.
        return this.asMultiPointFeature([BR, center]);
    }

    generateLabels(base: Feature<Point>): Feature<Point> {
        return this.asPointFeature(base.geometry.coordinates);
    }
}

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

    generateGraphics(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiLineString> {
        const size = opts?.size ?? 1;
        // size = drawing resolution in m/px → these factors set tooth size in
        // screen pixels at draw time: 15 px wide / 15 px gap / 11 px tall.
        const merlonWidth = 15 * size;
        const crenelWidth = 15 * size;
        const toothHeight = 11 * size;
        const subLines = geometryService.generateCrenellatedLineGraphic(
            base.geometry.coordinates,
            merlonWidth,
            crenelWidth,
            toothHeight,
        );
        return this.asMultiLineStringFeature(subLines);
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
