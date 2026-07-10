import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {Feature, MultiLineString, MultiPoint, Point, GeometryCollection, Position} from "geojson";
import {Coordinate, PointGraphicOptions, TacticalGraphicName} from "../core/type";
import geometryService from "../core/GeometryService";
import {toRadians} from "../core/math";

export abstract class MissionTask extends TacticalGraphicsBase<PointGraphicOptions> {
    type: string = "Point";

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
        let {rotation, size} = opts;
        const upperArch = geometryService.createCircularArc(center, rotation, size, 15, 175, 100);
        const lowerArch = geometryService.createCircularArc(center, rotation, size, 205, 345, 100);
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
        const upperArch = geometryService.createCircularArc(center, rotation, size, 15, 175, 100);
        const lowerArch = geometryService.createCircularArc(center, rotation, size, 205, 345, 100);
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
        const upperArch = geometryService.createCircularArc(center, rotation, size, 15, 175, 100);
        const lowerArch = geometryService.createCircularArc(center, rotation, size, 205, 345, 100);
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
        const upperArch = geometryService.createCircularArc(center, rotation, size, 15, 175, 100);
        const lowerArch = geometryService.createCircularArc(center, rotation, size, 205, 345, 100);
        let arrowHeadCoords: Coordinate[] = geometryService.computeArrowheadPoints(lowerArch[1], lowerArch[0], size / 4, 45);
        let upperRadialLineStrings = geometryService.generateRadialLineStrings(center, rotation, size, 30, 160, size / 2.5, 6);
        let lowerRadialLineStrings = geometryService.generateRadialLineStrings(center, rotation, size, 240, 340, size / 2.5, 5);
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
        let {rotation, size} = opts;
        const upperArch = geometryService.createCircularArc(center, rotation, size, 15, 175, 100);
        const lowerArch = geometryService.createCircularArc(center, rotation, size, 205, 345, 100);
        let arrowHeadCoords: Coordinate[] = geometryService.computeArrowheadPoints(lowerArch[1], lowerArch[0], size / 4, 45);
        return this.asMultiLineStringFeature([upperArch, lowerArch, arrowHeadCoords]);
    }
}

export class Contain extends MissionTask {
    name: string = TacticalGraphicName.Contain;

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiLineString> {
        let center = base.geometry.coordinates;
        let {rotation, size} = opts;
        const upperArch = geometryService.createCircularArc(center, rotation, size, 90, 165, 100);
        const lowerArch = geometryService.createCircularArc(center, rotation, size, 195, 270, 100);
        let radialLineStrings = geometryService.generateRadialLineStrings(center, rotation, size, 75, 285, -size / 2.5, 7);

        // The center radial sits at ~180° (due-west of centre) — exactly where
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
        let {rotation, size} = opts;
        const upperArch = geometryService.createCircularArc(center, rotation, size, 15, 175, 100);
        const lowerArch = geometryService.createCircularArc(center, rotation, size, 205, 345, 100);
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
        const upperArch = geometryService.createCircularArc(center, rotation, size, 15, 175, 100);
        const lowerArch = geometryService.createCircularArc(center, rotation, size, 205, 345, 100);
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