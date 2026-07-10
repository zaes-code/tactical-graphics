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

    generate(base: Feature, opts?: T): ITacticalGraphic {
        return <ITacticalGraphic>{
            name: this.name,
            type: this.type,
            base: base,
            graphic: this.generateGraphics(base, opts),
            handles: this.generateHandles(base, opts),
            labels: this.generateLabels(base, opts),
        }
    }

}