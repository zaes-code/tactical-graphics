import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {Feature, GeometryCollection, MultiLineString, MultiPoint, Point, Polygon} from "geojson";
import {
    EncirclementAreaOptions,
    IBaseGraphicOptions,
    TacticalGraphicHostility,
    TacticalGraphicName
} from "../core/type";
import geometryService from "../core/GeometryService";

export class AreaGraphic extends TacticalGraphicsBase {

    name: string;
    type: string = "Polygon";

    constructor(tacticalGraphicName: TacticalGraphicName) {
        super();
        this.name = tacticalGraphicName;
    }

    generateGraphics(base: Feature<Polygon>, opts: IBaseGraphicOptions | undefined): Feature<Polygon> {
        return base;
    }

    generateHandles(base: Feature<Polygon>, opts: IBaseGraphicOptions | undefined): Feature<MultiPoint> {
        return this.asMultiPointFeature([base.geometry.coordinates[0][0]]);
    }

    generateLabels(base: Feature<Polygon>, opts: IBaseGraphicOptions | undefined): Feature<Point> {
        let center = geometryService.getPolygonCenter(base);
        return center;
    };

}

export class EncirclementArea extends TacticalGraphicsBase<EncirclementAreaOptions> {
    name: string = TacticalGraphicName.Encirclement;
    type: string = "Polygon";

    generateGraphics(base: Feature<Polygon>, opts?: EncirclementAreaOptions): Feature<MultiLineString | GeometryCollection> {
        let size = opts?.size ?? 1;
        let rotation = opts?.rotation ?? 0;

        // create label spacing
        if (opts?.hostility === TacticalGraphicHostility.hostileFaker) {
            let {outlineSegments, labelPoints} = geometryService.generateLabelGaps(base.geometry, {
                rotationRad: rotation,
                gapSize: (40 * size) / 111320
            });
            let triangles = geometryService.generateMultiLineStringTriangles(outlineSegments, size * 15, size * 20, size * 20);
            return this.asGeometryCollectionFeature(
                [
                    this.asMultiLineStringFeature([
                        ...triangles,
                        ...outlineSegments
                    ]).geometry,
                    this.asMultiPointFeature(labelPoints).geometry
                ]
            );
        }

        let triangles = geometryService.generatePolygonTriangles(base.geometry.coordinates, size * 15, size * 20, size * 20);
        return this.asMultiLineStringFeature([
            ...triangles,
            ...base.geometry.coordinates
        ]);
    }

    generateHandles(base: Feature<Polygon>, opts: EncirclementAreaOptions | undefined): Feature<MultiPoint> {
        return this.asMultiPointFeature([base.geometry.coordinates[0][0]]);
    }

    generateLabels(base: Feature<Polygon>, opts: EncirclementAreaOptions | undefined): Feature<Point> {
        let center = geometryService.getPolygonCenter(base);
        return center;
    };
}

export class FortifiedArea extends TacticalGraphicsBase {
    name = 'FortifiedArea';
    type: string = "Polygon";

    generateGraphics(base: Feature<Polygon>, opts?: EncirclementAreaOptions): Feature<Polygon> {
        let size = opts?.size ?? 1;
        return this.asPolygonFeature(geometryService.fortifiedAreaGraphic(base.geometry, 10 * size, 10 * size, 10 * size));
    }

    generateHandles(base: Feature<Polygon>, opts: EncirclementAreaOptions | undefined): Feature<MultiPoint> {
        return this.asMultiPointFeature([base.geometry.coordinates[0][0]]);
    }

    generateLabels(base: Feature<Polygon>, opts: EncirclementAreaOptions | undefined): Feature<Point> {
        let center = geometryService.getPolygonCenter(base);
        return center;
    };
}


export class Obstacle extends TacticalGraphicsBase<EncirclementAreaOptions> {
    name: string;
    type: string = "Polygon";

    constructor(tacticalGraphicName: TacticalGraphicName) {
        super();
        this.name = tacticalGraphicName;
    }

    generateGraphics(base: Feature<Polygon>, opts?: EncirclementAreaOptions): Feature<Polygon> {
        let size = opts?.size ?? 1;
        let triangles = geometryService.generateToothedPolygonFromTriangles(base.geometry.coordinates, size * 15, size * 20, size * 20);

        return this.asPolygonFeature(triangles);
    }

    generateHandles(base: Feature<Polygon>, opts: EncirclementAreaOptions | undefined): Feature<MultiPoint> {
        return this.asMultiPointFeature([base.geometry.coordinates[0][0]]);
    }

    generateLabels(base: Feature<Polygon>, opts: EncirclementAreaOptions | undefined): Feature<Point> {
        let center = geometryService.getPolygonCenter(base);
        return center;
    };
}

export class ObstacleFree extends TacticalGraphicsBase<EncirclementAreaOptions> {
    name: string;
    type: string = "Polygon";

    constructor(tacticalGraphicName: TacticalGraphicName) {
        super();
        this.name = tacticalGraphicName;
    }

    generateGraphics(base: Feature<Polygon>, opts?: EncirclementAreaOptions): Feature<Polygon> {
        let size = opts?.size ?? 1;
        let triangles = geometryService.generateToothedPolygonFromTriangles(base.geometry.coordinates, size * 15, size * 15, size * 20, false);

        return this.asPolygonFeature(triangles);
    }

    generateHandles(base: Feature<Polygon>, opts: EncirclementAreaOptions | undefined): Feature<MultiPoint> {
        return this.asMultiPointFeature([base.geometry.coordinates[0][0]]);
    }

    generateLabels(base: Feature<Polygon>, opts: EncirclementAreaOptions | undefined): Feature<Point> {
        let center = geometryService.getPolygonCenter(base);
        return center;
    };
}
