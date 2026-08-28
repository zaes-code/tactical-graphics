import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {Feature, GeometryCollection, LineString, MultiLineString, MultiPoint, Point, Polygon, Position} from "geojson";
import {
    EncirclementAreaOptions,
    IBaseGraphicOptions,
    TacticalGraphicHostility,
    TacticalGraphicName
} from "../core/type";
import geometryService from "../core/GeometryService";
import * as turf from "../core/turf";
import {rectangleFromAxis} from "../core/anchors";

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

    /**
     * The drawn outline, undecorated — the teeth are drawn in screen space.
     * @see FortifiedArea, and `encirclementPaint` for why.
     *
     * A hostile encirclement's outline arrives cut into segments, with the gaps and
     * the anchors the "ENY" amplifiers sit in. That stays here: the gap is a geodesic
     * cut through the drawn ring, not a screen-space decoration.
     */
    generateGraphics(base: Feature<Polygon>, opts?: EncirclementAreaOptions): Feature<MultiLineString | GeometryCollection> {
        const size = opts?.size ?? 1;
        const rotation = opts?.rotation ?? 0;

        if (opts?.hostility === TacticalGraphicHostility.hostileFaker) {
            const {outlineSegments, labelPoints} = geometryService.generateLabelGaps(base.geometry, {
                rotationRad: rotation,
                gapSize: (2 * size) / 111320
            });
            return this.asGeometryCollectionFeature([
                this.asMultiLineStringFeature(outlineSegments).geometry,
                this.asMultiPointFeature(labelPoints).geometry
            ]);
        }

        return this.asMultiLineStringFeature(base.geometry.coordinates);
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

    /** The drawn area, undecorated — the merlons are drawn in screen space. @see Obstacle */
    generateGraphics(base: Feature<Polygon>, opts?: EncirclementAreaOptions): Feature<Polygon> {
        return this.asPolygonFeature(base.geometry.coordinates);
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

    /**
     * The drawn area, undecorated.
     *
     * The teeth used to be baked in here, sized off the drawing resolution — so they were
     * 15 px at whatever zoom the user happened to be at and then fixed in meters forever,
     * growing on screen as the map zoomed in. They are crenellation: a feature of the
     * *symbol*, carrying no measurement, which is precisely what belongs in a style
     * function at a constant number of screen pixels. `StrongPoint` has always worked this
     * way. See `obstacleAreaStyles` in `openlayerStyles.ts`.
     */
    generateGraphics(base: Feature<Polygon>, opts?: EncirclementAreaOptions): Feature<Polygon> {
        return this.asPolygonFeature(base.geometry.coordinates);
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

    /** The drawn area, undecorated — the inward teeth are drawn in screen space. @see Obstacle */
    generateGraphics(base: Feature<Polygon>, opts?: EncirclementAreaOptions): Feature<Polygon> {
        return this.asPolygonFeature(base.geometry.coordinates);
    }

    generateHandles(base: Feature<Polygon>, opts: EncirclementAreaOptions | undefined): Feature<MultiPoint> {
        return this.asMultiPointFeature([base.geometry.coordinates[0][0]]);
    }

    generateLabels(base: Feature<Polygon>, opts: EncirclementAreaOptions | undefined): Feature<Point> {
        let center = geometryService.getPolygonCenter(base);
        return center;
    };
}

/**
 * Half-width in metres for a rectangle whose caller supplied none — a raw-GeoJSON reader,
 * or a base that arrived with only its two points.
 */
const RECTANGLE_DEFAULT_HALF_WIDTH = 500;

/**
 * The eighteen rectangular zones: **two anchor points and a width**, exactly as APP-06
 * states it. @see rectangleFromAxis for the construction and for what this replaced
 *
 * The base is the axis — point 1 and point 2, at the centres of the two shorter sides —
 * and `radius` is the half-width across it. Everything else follows: the length and the
 * orientation are the two points', the corners are nobody's.
 *
 * Handles are `[point 1, point 2, width]`. The first two are the base's own vertices, so a
 * reshape drag moves them and the rectangle turns and lengthens with them; the third sits
 * one half-width off the axis and is the `offset` role every widthed graphic in this
 * library already uses. @see handleContract
 */
export class RectangularArea extends TacticalGraphicsBase {
    name: string;
    type: string = 'LineString';

    constructor(tacticalGraphicName: TacticalGraphicName) {
        super();
        this.name = tacticalGraphicName;
    }

    /** The axis and the half-width, defaulted for a base that carries neither. */
    private frame(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined) {
        const coords = base.geometry.coordinates;
        const p1 = coords[0] ?? [0, 0];
        const p2 = coords[coords.length - 1] ?? p1;
        const halfWidth = opts?.radius && opts.radius > 0 ? opts.radius : RECTANGLE_DEFAULT_HALF_WIDTH;
        return {p1, p2, halfWidth};
    }

    generateGraphics(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<Polygon> {
        const {p1, p2, halfWidth} = this.frame(base, opts);
        return this.asPolygonFeature([rectangleFromAxis(p1, p2, halfWidth)]);
    }

    generateHandles(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiPoint> {
        const {p1, p2, halfWidth} = this.frame(base, opts);
        const mid: Position = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
        const axis = turf.bearing(turf.point(p1), turf.point(p2));
        const width = halfWidth > 0
            ? (turf.destination(turf.point(mid), halfWidth, axis + 90, {units: 'meters'}).geometry.coordinates as Position)
            : mid;
        return this.asMultiPointFeature([p1, p2, width]);
    }

    generateLabels(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<Point> {
        const {p1, p2} = this.frame(base, opts);
        return this.asPointFeature([(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]);
    }
}
