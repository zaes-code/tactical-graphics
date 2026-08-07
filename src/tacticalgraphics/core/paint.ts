/**
 * # The paint list — what a symbol looks like, with no renderer in it
 *
 * `renderTacticalGraphic` answers "where is this graphic". It does not answer
 * "what does it look like", and today nothing map-agnostic does: the teeth on an
 * obstacle line, the gap cut around a mission task's letter, the arrowhead held
 * at a constant screen size — all of that is synthesised inside an OpenLayers
 * `StyleFunction`, in 128 separate places. A consumer reading the raw GeoJSON
 * gets a skeleton.
 *
 * A **paint list** is that missing half, expressed as data. One `Paint` is one
 * mark: a geometry plus how to stroke, fill, letter or dot it. A paint function
 * takes a graphic's realised geometry and the current view scale and returns the
 * marks that draw it — no `ol`, no `maplibre-gl`, no canvas, no DOM.
 *
 * ## Why this is not "an OpenLayers Style with the imports removed"
 *
 * It nearly is, and that is deliberate — the shapes below cover what the 69
 * existing style functions actually use, so porting one is a transcription
 * rather than a redesign. What it adds is the thing that made those functions
 * unportable:
 *
 * - **Nothing here is measured against a live canvas.** Text width arrives
 *   through {@link PaintContext.measureText}, so the caller supplies the DOM and
 *   this layer stays loadable in Node, in a jest `node` suite, and in a server
 *   render. Fifteen sites cut a gap to the width of the glyph that actually
 *   renders; they keep doing that, they just ask someone else to hold the ruler.
 * - **Screen-space quantities are named as such.** Every `*Px` field is screen
 *   pixels and every coordinate is projected metres. That distinction is the one
 *   this repo keeps getting bitten by — a metric offset baked into geometry is
 *   not zoom-invariant, a pixel offset is — so it is in the type names rather
 *   than in a comment.
 *
 * ## Coordinates are projected metres, not degrees
 *
 * {@link ProjectedGeometry} is shape-compatible with GeoJSON and means something
 * different: its coordinates are **EPSG:3857 metres**, the frame the existing
 * style-function math already works in. That is why it is its own type rather
 * than a reused `geojson` one — a `LineString` holding metres is a lie the
 * compiler should not help tell.
 *
 * A renderer converts on the way out. OpenLayers wants exactly this frame;
 * MapLibre wants lon/lat and inverts the Mercator, which is exact and cheap.
 * Working here means the ported math is character-for-character the math that
 * ships today, which is the only way a port can be checked against the original.
 *
 * @see ai/maplibre-renderer.md — why the 128 in-style constructions, not the 69
 *      style functions, are what sets the price of a second renderer.
 */

import {TacticalGraphicProperties} from './render';

/** A single `[x, y]` in projected metres (EPSG:3857). */
export type ProjectedPosition = [number, number];

/**
 * A geometry in projected metres.
 *
 * Structurally identical to the matching GeoJSON geometry, so converting either
 * way is a coordinate walk and nothing else — but distinct in the type system,
 * because the units differ and mixing the two is the mistake this repo's
 * coordinate rules exist to prevent.
 */
export type ProjectedGeometry =
    | {type: 'Point'; coordinates: ProjectedPosition}
    | {type: 'MultiPoint'; coordinates: ProjectedPosition[]}
    | {type: 'LineString'; coordinates: ProjectedPosition[]}
    | {type: 'MultiLineString'; coordinates: ProjectedPosition[][]}
    | {type: 'Polygon'; coordinates: ProjectedPosition[][]}
    | {type: 'MultiPolygon'; coordinates: ProjectedPosition[][][]};

/** Any CSS colour string. Resolved from the config before it reaches a paint list. */
export type PaintColor = string;

/** How to stroke a geometry. Widths and dashes are **screen pixels**. */
export interface StrokeSpec {
    color: PaintColor;
    /** Screen pixels, from `LINE_WIDTH()` unless the mark has its own weight. */
    widthPx: number;
    /** Dash pattern in screen pixels, e.g. `[10, 8]`. Omit for solid. */
    dashPx?: number[];
    cap?: 'butt' | 'round' | 'square';
    join?: 'bevel' | 'round' | 'miter';
}

/** How to fill a closed geometry. */
export interface FillSpec {
    color: PaintColor;
}

/**
 * A text mark.
 *
 * `font` is a full CSS font shorthand and `scale` multiplies it, exactly as the
 * OpenLayers style functions use them. The pair matters: this repo has been bitten
 * by measuring a gap with one font string and rendering the glyph with another, so
 * anything that measures **must** pass this same `font`. @see PaintContext.measureText
 */
export interface TextSpec {
    text: string;
    /** CSS font shorthand, e.g. `'bold 24px sans-serif'`. */
    font: string;
    fill: PaintColor;
    /** The contrast outline behind the glyph. Width is screen pixels. */
    halo?: {color: PaintColor; widthPx: number};
    /** Multiplier on `font`'s declared size. 1 means "as declared". */
    scale?: number;
    /** Screen-space rotation in radians, clockwise positive. */
    rotation?: number;
    align?: 'left' | 'center' | 'right';
    baseline?: 'top' | 'middle' | 'bottom' | 'alphabetic' | 'hanging';
    /** Screen-pixel nudge applied after rotation, as OpenLayers' `offsetX/Y` are. */
    offsetXPx?: number;
    offsetYPx?: number;
    /**
     * Lay the text along its geometry rather than at a point, picking up the
     * line's own angle. The measure read-out is the only user today.
     */
    placement?: 'point' | 'line';
}

/** A dot mark — handles, the draw marker, the inert centre. Radius is screen pixels. */
export interface CircleSpec {
    radiusPx: number;
    fill?: FillSpec;
    stroke?: StrokeSpec;
}

/**
 * One mark. A paint function returns a list of these, in paint order.
 *
 * All four decorations are optional and independent, mirroring an OpenLayers
 * `Style`: a mark may stroke *and* letter the same geometry, which is how the
 * label-on-a-line graphics work.
 */
export interface Paint {
    geometry: ProjectedGeometry;
    stroke?: StrokeSpec;
    fill?: FillSpec;
    text?: TextSpec;
    circle?: CircleSpec;
    /** Higher paints later. Handles use `HANDLE_Z_INDEX`; most marks leave it unset. */
    zIndex?: number;
}

/**
 * What a paint function knows about the current view.
 *
 * Deliberately tiny. Everything else a style function needs — colours, line
 * width, label size — comes from the library config, which lives in this same
 * map-agnostic half precisely so a second renderer inherits it.
 */
export interface PaintContext {
    /**
     * Projected metres per screen pixel — OpenLayers' `resolution`, and the
     * quantity every zoom-invariant size in this library is expressed against.
     *
     * MapLibre reports zoom instead; the two are related by
     * `resolution = 156543.03392 × cos(latitude) / 2^zoom`.
     */
    resolution: number;

    /**
     * Width in screen pixels of `text` rendered at `font`, at scale 1.
     *
     * Injected rather than measured here so this layer never touches a DOM. A
     * renderer supplies a canvas 2D context; a headless caller may supply an
     * approximation, and the marks still come out — the gaps are just less exact.
     *
     * **Pass the same `font` you will render with.** A gap measured at
     * `'bold 16px sans-serif'` and drawn at `'bold 24px sans-serif'` is 50% too
     * small, which is a bug this repo has shipped twice.
     */
    measureText(text: string, font: string): number;
}

/**
 * The input half of a paint function: a graphic's realised geometry plus
 * everything stamped on it.
 *
 * This is the renderer-agnostic stand-in for "an OpenLayers feature". The style
 * functions read exactly these things off a feature today — the amplifier bag,
 * and a handful of values the graphic holders stamp so a style function can
 * reproduce a size it did not compute.
 */
export interface PaintFeature {
    /** The realised geometry, in projected metres. */
    geometry: ProjectedGeometry;

    /**
     * The amplifier bag — `properties.tacticalGraphic`. The portable schema, the
     * same object `renderTacticalGraphic` consumes and persistence saves.
     */
    properties: TacticalGraphicProperties;

    /**
     * The graphic's own size in **metres**, when it has one: a circle's radius, a
     * block arrow's perpendicular extent. Size-proportional label scales need it,
     * and so does anything cutting a gap sized to such a label.
     *
     * Stamped by the holder rather than derived here because only the holder
     * knows which of a graphic's dimensions is "the" size.
     */
    graphicSize?: number;

    /**
     * The view resolution the graphic was drawn at, in metres per pixel. Anchors
     * the zoom-relative label scale so a label holds its size at the zoom it was
     * created at. Not persisted — it is live view state, not part of the symbol.
     */
    drawingResolution?: number;

    /** Centre of a point-anchored graphic, in projected metres. */
    graphicCenter?: ProjectedPosition;

    /** Where a point-anchored graphic's label sits, in projected metres. */
    graphicLabelPoint?: ProjectedPosition;
}

/**
 * Turns one graphic into marks.
 *
 * The signature every ported style function takes. It is a pure function of its
 * arguments: same feature, same context, same list — which is what makes a paint
 * list testable in a plain `node` suite, and comparable between two renderers.
 */
export type PaintFunction = (feature: PaintFeature, context: PaintContext) => Paint[];

/**
 * Draw order for editor chrome. Handles paint last, because a handle you cannot
 * see is a handle you cannot use — and hit-testing follows paint order too.
 *
 * Mirrors `HANDLE_Z_INDEX` in the OpenLayers layer, which predates this file.
 */
export const HANDLE_Z_INDEX = 1000;

/** Every position in a geometry, in order. Used by bounds and conversion walks. */
export function paintGeometryPositions(geometry: ProjectedGeometry): ProjectedPosition[] {
    switch (geometry.type) {
        case 'Point':
            return [geometry.coordinates];
        case 'MultiPoint':
        case 'LineString':
            return geometry.coordinates;
        case 'MultiLineString':
        case 'Polygon':
            return geometry.coordinates.flat();
        case 'MultiPolygon':
            return geometry.coordinates.flat(2);
    }
}

/**
 * Rewrites every coordinate in a geometry, keeping its structure.
 *
 * The one operation a renderer always needs: MapLibre inverts the Mercator to
 * lon/lat, a canvas overlay divides through by the resolution to reach screen
 * pixels. Both are this walk with a different `fn`.
 */
export function mapPaintGeometry<T extends ProjectedGeometry>(geometry: T, fn: (position: ProjectedPosition) => ProjectedPosition): T {
    switch (geometry.type) {
        case 'Point':
            return {type: 'Point', coordinates: fn(geometry.coordinates)} as T;
        case 'MultiPoint':
            return {type: 'MultiPoint', coordinates: geometry.coordinates.map(fn)} as T;
        case 'LineString':
            return {type: 'LineString', coordinates: geometry.coordinates.map(fn)} as T;
        case 'MultiLineString':
            return {type: 'MultiLineString', coordinates: geometry.coordinates.map(line => line.map(fn))} as T;
        case 'Polygon':
            return {type: 'Polygon', coordinates: geometry.coordinates.map(ring => ring.map(fn))} as T;
        case 'MultiPolygon':
            return {type: 'MultiPolygon', coordinates: geometry.coordinates.map(poly => poly.map(ring => ring.map(fn)))} as T;
    }
}
