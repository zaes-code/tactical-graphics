import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {ARC_TIC_FRACTION, arcTicCount} from '../core/symbology';
import {Feature, MultiLineString, MultiPoint, Point, GeometryCollection, Position} from "geojson";
import {Coordinate, PointGraphicOptions, TacticalGraphicName} from "../core/type";
import geometryService from "../core/GeometryService";
import {toRadians} from "../core/math";

/**
 * Half the gap the arc-and-arrowhead circles leave for their one-letter label,
 * in degrees, when the caller supplies no `labelGapDegrees`. 15° each side of
 * the label axis — a 30° hole, which is what these graphics have always drawn.
 *
 * It is a *fraction of the circle*, so it grows with the graphic while the label
 * inside it does not. That is fine for a static GeoJSON consumer, which has no
 * glyph to measure, and wrong for a live renderer, which does: the OpenLayers
 * layer passes 0 here and cuts the gap from the rendered text instead.
 */
export const DEFAULT_LABEL_GAP_DEGREES = 15;
/** Nothing sensible is left of the circle past this. */
const MAX_LABEL_GAP_DEGREES = 60;

/** Resolved half-gap for the label, in degrees. @see DEFAULT_LABEL_GAP_DEGREES */
function labelGapDegrees(opts: PointGraphicOptions): number {
    const requested = opts.labelGapDegrees ?? DEFAULT_LABEL_GAP_DEGREES;
    return Math.max(0, Math.min(MAX_LABEL_GAP_DEGREES, requested));
}

export abstract class MissionTask extends TacticalGraphicsBase<PointGraphicOptions> {
    type: string = "Point";

    /**
     * The two arcs the arc-and-arrowhead circles are built from: an upper one
     * running from the label gap round to 175°, and a lower one from 205° back
     * to the label gap. The two holes are what the family reads as — the label
     * sits in one, the arrowhead ends in the other.
     *
     * One helper rather than seven copies of the same two calls, because the
     * label-side ends are the thing `labelGapDegrees` moves and they have to
     * move together. **Sub-lines `[0]` and `[1]` of the emitted geometry are
     * these two arcs, in this order** — `arcMissionTaskStyleFunc` cuts the gap
     * by trimming exactly those two, and reordering them breaks it.
     */
    protected labelGapArcs(center: Position, opts: PointGraphicOptions): {upperArch: Position[]; lowerArch: Position[]} {
        const gap = labelGapDegrees(opts);
        return {
            upperArch: geometryService.createCircularArc(center, opts.rotation, opts.size, gap, 175, 100),
            lowerArch: geometryService.createCircularArc(center, opts.rotation, opts.size, 205, 360 - gap, 100),
        };
    }

    generateHandles(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiPoint> {
        let center = base.geometry.coordinates;
        const lowerArch = geometryService.createCircularArc(center, opts.rotation, opts.size, 205, 345, 100);
        return this.asMultiPointFeature([lowerArch[0], center])
    };

    generateLabels(base: Feature<Point>, opts: PointGraphicOptions): Feature<Point> {
        let center = base.geometry.coordinates;
        let labelPoint = geometryService.translateCoordinates(center, opts.size, toRadians(opts.rotation));
        return this.asPointFeature(labelPoint);
    };
}

export class Control extends MissionTask {
    name: string = TacticalGraphicName.Control;

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiLineString> {
        let center = base.geometry.coordinates;
        let {size} = opts;
        const {upperArch, lowerArch} = this.labelGapArcs(center, opts);
        let lowerArrowHeadCoords: Coordinate[] = geometryService.computeArrowheadPoints(lowerArch[1], lowerArch[0], size / 4, 45);
        let upperArrowHeadCoords: Coordinate[] = geometryService.computeArrowheadPoints(upperArch[upperArch.length - 2], upperArch[upperArch.length - 1], size / 4, 45);
        return this.asMultiLineStringFeature([upperArch, lowerArch, lowerArrowHeadCoords, upperArrowHeadCoords]);
    }

}

export class CordonAndSearch extends MissionTask {
    name: string = TacticalGraphicName.CordonAndSearch;

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<GeometryCollection> {
        let center = base.geometry.coordinates;
        let {rotation, size} = opts;
        const {upperArch, lowerArch} = this.labelGapArcs(center, opts);
        let arrowHeadCoords: Position[] = geometryService.computeArrowheadPoints(lowerArch[1], lowerArch[0], size / 4, 45);

        let upperTriangles = geometryService.generateArcTrianglesWithGap(center, size, rotation, 30, 160, size / 2.5, 4);
        let lowerTriangles = geometryService.generateArcTrianglesWithGap(center, size, rotation, 240, 340, size / 2.5, 3);
        return this.asGeometryCollectionFeature([
            this.asMultiLineStringFeature([upperArch, lowerArch, arrowHeadCoords]).geometry,
            this.asMultiLineStringFeature(upperTriangles).geometry,
            this.asMultiLineStringFeature(lowerTriangles).geometry,
        ]);
    }
}

export class Isolate extends MissionTask {
    name: string = TacticalGraphicName.Isolate;

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<GeometryCollection> {
        let center = base.geometry.coordinates;
        let {rotation, size} = opts;
        const {upperArch, lowerArch} = this.labelGapArcs(center, opts);
        let arrowHeadCoords: Coordinate[] = geometryService.computeArrowheadPoints(lowerArch[1], lowerArch[0], size / 4, 45);

        let upperTriangles = geometryService.generateArcTrianglesWithGap(center, size, rotation, 30, 160, size / 2.5, 4);
        let lowerTriangles = geometryService.generateArcTrianglesWithGap(center, size, rotation, 240, 340, size / 2.5, 3);
        return this.asGeometryCollectionFeature([
            this.asMultiLineStringFeature([upperArch, lowerArch, arrowHeadCoords]).geometry,
            this.asMultiLineStringFeature(upperTriangles).geometry,
            this.asMultiLineStringFeature(lowerTriangles).geometry,
        ]);
    }
}

export class Retain extends MissionTask {
    name: string = TacticalGraphicName.Retain;

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<GeometryCollection> {
        let center = base.geometry.coordinates;
        let {rotation, size} = opts;
        const {upperArch, lowerArch} = this.labelGapArcs(center, opts);
        let arrowHeadCoords: Coordinate[] = geometryService.computeArrowheadPoints(lowerArch[1], lowerArch[0], size / 4, 45);
        let upperRadialLineStrings = geometryService.generateRadialLineStrings(center, rotation, size, 30, 160, size * ARC_TIC_FRACTION, arcTicCount(130));
        let lowerRadialLineStrings = geometryService.generateRadialLineStrings(center, rotation, size, 240, 340, size * ARC_TIC_FRACTION, arcTicCount(100));
        return this.asGeometryCollectionFeature([
            this.asMultiLineStringFeature([upperArch, lowerArch, arrowHeadCoords]).geometry,
            this.asMultiLineStringFeature(upperRadialLineStrings).geometry,
            this.asMultiLineStringFeature(lowerRadialLineStrings).geometry,
        ]);
    }
}

export class Secure extends MissionTask {
    name: string = TacticalGraphicName.Secure;

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiLineString> {
        let center = base.geometry.coordinates;
        let {size} = opts;
        const {upperArch, lowerArch} = this.labelGapArcs(center, opts);
        let arrowHeadCoords: Coordinate[] = geometryService.computeArrowheadPoints(lowerArch[1], lowerArch[0], size / 4, 45);
        return this.asMultiLineStringFeature([upperArch, lowerArch, arrowHeadCoords]);
    }
}

export class Contain extends MissionTask {
    name: string = TacticalGraphicName.Contain;

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiLineString> {
        let center = base.geometry.coordinates;
        let {rotation, size} = opts;
        // Contain is a half-circle, and its label sits due west at 180° rather
        // than at the rotation axis — so the gap opens either side of 180, not
        // either side of 0. Same knob, different center.
        const gap = labelGapDegrees(opts);
        const upperArch = geometryService.createCircularArc(center, rotation, size, 90, 180 - gap, 100);
        const lowerArch = geometryService.createCircularArc(center, rotation, size, 180 + gap, 270, 100);
        let radialLineStrings = geometryService.generateRadialLineStrings(center, rotation, size, 75, 285, -size * ARC_TIC_FRACTION, arcTicCount(210));

        // The center radial sits at ~180° (due-west of center) — exactly where
        // the C label is anchored. Pull its outer endpoint inward so the line
        // is half its original length and no longer touches the label.
        const middleIdx = Math.floor(radialLineStrings.length / 2);
        const middle = radialLineStrings[middleIdx];
        if (middle && middle.length === 2) {
            const [tip, mid] = middle;
            radialLineStrings[middleIdx] = [
                tip,
                [tip[0] + (mid[0] - tip[0]) * 0.5, tip[1] + (mid[1] - tip[1]) * 0.5],
            ];
        }

        return this.asMultiLineStringFeature([upperArch, lowerArch, ...radialLineStrings]);
    }

    generateLabels(base: Feature<Point>, opts: PointGraphicOptions): Feature<Point> {
        let center = base.geometry.coordinates;
        let labelPoint = geometryService.translateCoordinates(center, -opts.size, toRadians(opts.rotation));
        return this.asPointFeature(labelPoint);
    };
}

export class Occupy extends MissionTask {
    name: string = TacticalGraphicName.Occupy;

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiLineString> {
        let center = base.geometry.coordinates;
        let {size} = opts;
        const {upperArch, lowerArch} = this.labelGapArcs(center, opts);
        let arrowHeadCoords: Coordinate[] = geometryService.computeArrowheadPoints(lowerArch[1], lowerArch[0], size / 4, 45);
        let reverseArrowHeadCoords: Coordinate[] = geometryService.computeArrowheadPoints(lowerArch[1], lowerArch[0], -size / 4, 45);
        return this.asMultiLineStringFeature([upperArch, lowerArch, arrowHeadCoords, reverseArrowHeadCoords]);
    }
}

export class AreaDefense extends MissionTask {
    name: string = TacticalGraphicName.AreaDefense;

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<GeometryCollection> {
        let center = base.geometry.coordinates;
        let {rotation, size} = opts;
        const {upperArch, lowerArch} = this.labelGapArcs(center, opts);
        let arrowHeadCoords: Position[] = geometryService.computeArrowheadPoints(lowerArch[1], lowerArch[0], size / 4, 45);
        let upperArrowHeadCoords: Position[] = geometryService.computeArrowheadPoints(upperArch[upperArch.length - 2], upperArch[upperArch.length - 1], size / 4, 45);

        let upperTriangles = geometryService.generateArcTrianglesWithGap(center, size, rotation, 30, 160, -size / 2.5, 4, 15, true);
        let lowerTriangles = geometryService.generateArcTrianglesWithGap(center, size, rotation, 240, 340, -size / 2.5, 3, 15, true);
        return this.asGeometryCollectionFeature([
                this.asMultiLineStringFeature([upperArch, lowerArch, arrowHeadCoords, upperArrowHeadCoords]).geometry,
                ...upperTriangles.map(coord => this.asPolygonFeature([coord]).geometry),
                ...lowerTriangles.map(coord => this.asPolygonFeature([coord]).geometry),
            ]
        );
    }
}

export class CircularArea extends MissionTask {
    name: TacticalGraphicName;

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiLineString> {
        let center = base.geometry.coordinates;
        let {rotation, size} = opts;
        const upperArch = geometryService.createCircularArc(center, rotation, size, 0, 360, 100);
        return this.asMultiLineStringFeature([upperArch]);
    }

    generateLabels(base: Feature<Point>, opts: PointGraphicOptions): Feature<Point> {
        let center = base.geometry.coordinates;
        return this.asPointFeature(center);
    };

}