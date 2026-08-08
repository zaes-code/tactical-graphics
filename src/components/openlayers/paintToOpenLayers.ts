import Feature, {FeatureLike} from 'ol/Feature';
import {Fill, Stroke, Style, Text} from 'ol/style';
import CircleStyle from 'ol/style/Circle';
import {Geometry, GeometryCollection, LineString, MultiLineString, MultiPoint, MultiPolygon, Point, Polygon} from 'ol/geom';
import RenderFeature from 'ol/render/Feature';
import {TACTICAL_GRAPHIC_KEY, TacticalGraphicName} from '@zaes/tactical-graphics';
import type {
    Paint,
    PaintContext,
    PaintFeature,
    ProjectedGeometry,
    ProjectedInputGeometry,
    ProjectedPosition,
    StrokeSpec,
    TacticalGraphicProperties,
} from '@zaes/tactical-graphics';
import {readGraphicLabels} from './graphicProperties';
import {getTextWidth} from './textMeasure';

/**
 * # Paint lists → OpenLayers styles
 *
 * The bridge that lets **one** implementation serve both renderers.
 *
 * A ported style function lives in `tacticalgraphics/symbology/` and returns
 * `Paint[]`. This turns that list into the `Style[]` OpenLayers wants, so a
 * graphic can be ported once and rendered by both. The alternative — leaving
 * `openlayerStyles.ts` alone and writing a second copy of each function for
 * MapLibre — is 69 functions maintained twice, and the two would drift on the
 * first bug fix that only landed in one.
 *
 * It also makes the port **self-verifying**, which is the real reason to do it
 * this way. There are ~1,600 existing tests that assert on what the OpenLayers
 * style functions produce, plus a sample gallery of 216 graphics. Route OpenLayers
 * through the paint functions and every one of those becomes a parity test for
 * the ported code, for free. A port that keeps the two renderers separate has
 * nothing checking that the new function still draws what the old one did.
 *
 * ## Why the conversion is this cheap
 *
 * `ProjectedGeometry` holds EPSG:3857 metres, which is exactly the frame an
 * OpenLayers `StyleFunction` already works in — so the geometry is a constructor
 * call, not a reprojection. The MapLibre side has to invert the Mercator on the
 * way out; this side has nothing to do. That asymmetry is why the paint layer
 * standardised on projected metres rather than lon/lat.
 *
 * Every spec field maps 1:1 onto an OpenLayers style option, because the `Paint`
 * shapes were derived from what these 69 functions actually use.
 */

function toStroke(spec: StrokeSpec): Stroke {
    return new Stroke({
        color: spec.color,
        width: spec.widthPx,
        lineDash: spec.dashPx,
        lineCap: spec.cap,
        lineJoin: spec.join,
    });
}

/** A paint geometry as the matching OpenLayers geometry. Coordinates pass through unchanged. */
export function toOlGeometry(geometry: ProjectedGeometry): Geometry {
    switch (geometry.type) {
        case 'Point':
            return new Point(geometry.coordinates);
        case 'MultiPoint':
            return new MultiPoint(geometry.coordinates);
        case 'LineString':
            return new LineString(geometry.coordinates);
        case 'MultiLineString':
            return new MultiLineString(geometry.coordinates);
        case 'Polygon':
            return new Polygon(geometry.coordinates);
        case 'MultiPolygon':
            return new MultiPolygon(geometry.coordinates);
    }
}

/**
 * One mark as one `Style`.
 *
 * **`geometry` is always set explicitly**, even when it is the feature's own.
 * A paint function may return a mark whose geometry it synthesised — teeth, a cut
 * arc, a label anchor — and that is the whole point of the layer; letting a mark
 * fall back to the feature's geometry would silently draw the undecorated shape.
 */
export function paintToOlStyle(paint: Paint): Style {
    const {geometry, stroke, fill, text, circle, zIndex} = paint;

    return new Style({
        geometry: toOlGeometry(geometry),
        zIndex,
        stroke: stroke ? toStroke(stroke) : undefined,
        fill: fill ? new Fill({color: fill.color}) : undefined,
        image: circle
            ? new CircleStyle({
                radius: circle.radiusPx,
                fill: circle.fill ? new Fill({color: circle.fill.color}) : undefined,
                stroke: circle.stroke ? toStroke(circle.stroke) : undefined,
            })
            : undefined,
        text: text
            ? new Text({
                text: text.text,
                font: text.font,
                fill: new Fill({color: text.fill}),
                stroke: text.halo ? new Stroke({color: text.halo.color, width: text.halo.widthPx}) : undefined,
                scale: text.scale,
                rotation: text.rotation,
                textAlign: text.align,
                textBaseline: text.baseline,
                // Raw screen pixels, and OpenLayers does not multiply them by `scale` —
                // measured, not assumed. A paint function whose label scale varies has
                // to fold the scale into the offset itself, which is why these pass
                // through untouched. @see ai/conventions.md
                offsetX: text.offsetXPx,
                offsetY: text.offsetYPx,
                placement: text.placement,
            })
            : undefined,
    });
}

/** A whole paint list as OpenLayers styles, in paint order. */
export function paintToOlStyles(paints: Paint[]): Style[] {
    return paints.map(paintToOlStyle);
}

/**
 * An OpenLayers geometry as a paint geometry. Coordinates pass through unchanged —
 * both sides are EPSG:3857 metres.
 *
 * **`GeometryCollection` has to be handled, not skipped.** Several mission-task
 * generators pack their arcs, arrowheads and solid teeth into one, and returning
 * `undefined` for those made every arc graphic render nothing at all. The existing
 * hostility tests caught it the moment OpenLayers started rendering through this
 * bridge, which is the argument for routing it this way in one line.
 *
 * `Circle` is still `undefined`: it is a live editing geometry the holders resolve
 * to a Polygon before styling, so a paint function should return an empty list
 * rather than guess at a segment count.
 */
export function fromOlGeometry(geometry: Geometry | RenderFeature | undefined): ProjectedInputGeometry | undefined {
    if (!geometry || geometry instanceof RenderFeature) return undefined;
    const type = geometry.getType();
    switch (type) {
        case 'Point':
            return {type, coordinates: (geometry as Point).getCoordinates() as ProjectedPosition};
        case 'MultiPoint':
            return {type, coordinates: (geometry as MultiPoint).getCoordinates() as ProjectedPosition[]};
        case 'LineString':
            return {type, coordinates: (geometry as LineString).getCoordinates() as ProjectedPosition[]};
        case 'MultiLineString':
            return {type, coordinates: (geometry as MultiLineString).getCoordinates() as ProjectedPosition[][]};
        case 'Polygon':
            return {type, coordinates: (geometry as Polygon).getCoordinates() as ProjectedPosition[][]};
        case 'MultiPolygon':
            return {type, coordinates: (geometry as MultiPolygon).getCoordinates() as ProjectedPosition[][][]};
        case 'GeometryCollection':
            return {
                type,
                // Nested collections are flattened away by the recursion returning only
                // non-collection members — no generator emits one, and a mark cannot
                // hold a collection anyway.
                geometries: (geometry as GeometryCollection)
                    .getGeometries()
                    .map(fromOlGeometry)
                    .filter((g): g is ProjectedGeometry => !!g && g.type !== 'GeometryCollection'),
            };
        default:
            return undefined;
    }
}

/**
 * An OpenLayers feature as a `PaintFeature`.
 *
 * The stamped values (`graphicSize`, `drawingResolution`, `graphicCenter`,
 * `graphicLabelPoint`) are read off the feature exactly as the style functions
 * always read them; the holders that stamp them are unchanged.
 *
 * `name` comes from the amplifier bag first and the loose `graphicName` key
 * second, mirroring `readHostility`'s precedence: the bag is what
 * `writeGraphicProperties` sets and what survives a save, and the loose key is
 * what the demo's draw path stamps.
 */
export function toPaintFeature(feature: FeatureLike, name?: TacticalGraphicName): PaintFeature | undefined {
    const geometry = fromOlGeometry(feature.getGeometry());
    if (!geometry) return undefined;

    const bag = readGraphicLabels(feature) as Partial<TacticalGraphicProperties>;
    const resolvedName = (bag.name ?? name ?? feature.get('graphicName')) as TacticalGraphicName;

    return {
        geometry,
        properties: {...bag, name: resolvedName},
        graphicSize: feature.get('graphicSize') as number | undefined,
        drawingResolution: feature.get('drawingResolution') as number | undefined,
        graphicCenter: feature.get('graphicCenter') as ProjectedPosition | undefined,
        graphicLabelPoint: feature.get('graphicLabelPoint') as ProjectedPosition | undefined,
        // The demo's properties dialog, sample sweep and basemap re-colour all stamp a
        // *resolved* colour here. Carried so a feature coloured by that route keeps
        // its colour; paint functions fall back to the affiliation when it is absent.
        hostilityColor: feature.get('hostilityColor') as string | undefined,
    };
}

/**
 * The paint context for one OpenLayers style call.
 *
 * `measureText` is the module's existing canvas measurer, so a ported function
 * measures with exactly the ruler it did before the port — which is what makes a
 * before/after screenshot comparison meaningful.
 */
export function paintContext(resolution: number): PaintContext {
    return {resolution, measureText: (text, font) => getTextWidth(text, font, 1)};
}

/**
 * Wraps a paint function as an OpenLayers `StyleFunction`.
 *
 * The one call every ported style function is replaced by:
 *
 * ```ts
 * export const phaseLineStyleFunc = (name: TacticalGraphicName): StyleFunction =>
 *     asStyleFunction(phaseLinePaint(name), name);
 * ```
 */
export function asStyleFunction(
    paint: (feature: PaintFeature, context: PaintContext) => Paint[],
    name?: TacticalGraphicName,
) {
    return (feature: FeatureLike, resolution: number): Style[] => {
        const paintFeature = toPaintFeature(feature, name);
        if (!paintFeature) return [];
        return paintToOlStyles(paint(paintFeature, paintContext(resolution)));
    };
}

/** Re-exported for holders that build a `Feature` and want its paint form. */
export type {PaintFeature};
export {TACTICAL_GRAPHIC_KEY, Feature};
