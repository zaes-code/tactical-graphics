import {IBaseGraphicOptions, IGraphicGenerator} from "../core/type";
import {
    Feature,
    GeometryCollection,
    MultiLineString,
    MultiPoint,
    Position,
    Geometry,
    Polygon,
    Point,
    GeoJsonProperties, LineString
} from "geojson";
import {ITacticalGraphic} from "../core/type";
import {featureInGeneratorOrder} from "../core/drawOrder";


export abstract class TacticalGraphicsBase<T extends IBaseGraphicOptions = IBaseGraphicOptions> implements IGraphicGenerator {
    abstract name: string;
    abstract type: string;

    abstract generateGraphics(base: Feature, opts?: T): Feature;

    abstract generateHandles(base: Feature, opts?: T): Feature;

    abstract generateLabels(base: Feature, opts?: T): Feature;

    asMultiLineStringFeature(coords: Position[][], props?: GeoJsonProperties): Feature<MultiLineString> {
        return {
            type: "Feature",
            geometry: {
                type: "MultiLineString",
                coordinates: coords
            },
            properties: props || {},
        };
    }

    asLineStringFeature(coords: Position[], props?: GeoJsonProperties): Feature<LineString> {
        return {
            type: "Feature",
            geometry: {
                type: "LineString",
                coordinates: coords
            },
            properties: props || {},
        };
    }

    asPointFeature(coords: Position, props?: GeoJsonProperties): Feature<Point> {
        return {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: coords
            },
            properties: props || {},
        };
    }

    asMultiPointFeature(coords: Position[], props?: GeoJsonProperties): Feature<MultiPoint> {
        return {
            type: "Feature",
            geometry: {
                type: "MultiPoint",
                coordinates: coords
            },
            properties: props || {},
        };
    }

    asPolygonFeature(coords: Position[][], props?: GeoJsonProperties): Feature<Polygon> {
        return {
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: coords
            },
            properties: props || {}
        };
    }

    asGeometryCollectionFeature(geometries: Geometry[], props?: GeoJsonProperties): Feature<GeometryCollection> {
        return {
            type: "Feature",
            geometry: {
                type: "GeometryCollection",
                geometries: geometries
            },
            properties: props || {},
        };
    }

    /**
     * The one place a generator is handed its base, and so the one place APP-06's point
     * numbering is applied.
     *
     * Thirty-two graphics store their points **tip first**, because that is how the standard
     * numbers them; every `generateGraphics` in this package was written to build its
     * head at the last vertex. `featureInGeneratorOrder` reconciles the two by reversing
     * the line on the way in, which leaves the shape, the decoration sizes and the handle
     * contracts exactly as they were and keeps the reversal out of thirty-two generators.
     *
     * `base` on the way out is the caller's own feature, not the reversed copy: the
     * caller drew it, saves it, and edits its vertices. @see drawOrder.ts
     */
    generate(base: Feature, opts?: T): ITacticalGraphic {
        const drawn = featureInGeneratorOrder(this.name, base);
        return <ITacticalGraphic>{
            name: this.name,
            type: this.type,
            base: base,
            graphic: this.generateGraphics(drawn, opts),
            handles: this.generateHandles(drawn, opts),
            labels: this.generateLabels(drawn, opts),
        }
    }

}