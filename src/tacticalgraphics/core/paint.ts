/**
 * # The paint list — what a symbol looks like, with no renderer in it
 *
 * `renderTacticalGraphic` answers "where is this graphic". **This module is the
 * other half**: what it looks like. The teeth on an obstacle line, the gap cut
 * around a mission task's letter, the arrowhead held at a constant screen size —
 * all of it used to be synthesized inside an OpenLayers `StyleFunction`, in 128
 * separate places, so a consumer reading the raw GeoJSON got a skeleton and a
 * second renderer had 128 things to reimplement. Both shipping renderers now draw
 * through the types declared here.
 *
 * A **paint list** is that missing half, expressed as data. One `Paint` is one
 * mark: a geometry plus how to stroke, fill, letter or dot it. A paint function
 * takes a graphic's realized geometry and the current view scale and returns the
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
 *   pixels and every coordinate is projected meters. That distinction is the one
 *   this repo keeps getting bitten by — a metric offset baked into geometry is
 *   not zoom-invariant, a pixel offset is — so it is in the type names rather
 *   than in a comment.
 *
 * ## Coordinates are projected meters, not degrees
 *
 * {@link ProjectedGeometry} is shape-compatible with GeoJSON and means something
 * different: its coordinates are **EPSG:3857 meters**, the frame the existing
 * style-function math already works in. That is why it is its own type rather
 * than a reused `geojson` one — a `LineString` holding meters is a lie the
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
import {TacticalGraphicEchelon} from './type';

/** A single `[x, y]` in projected meters (EPSG:3857). */
export type ProjectedPosition = [number, number];

/**
 * A geometry in projected meters.
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

/**
 * What a paint function is *given*: any {@link ProjectedGeometry}, or a
 * collection of them.
 *
 * Deliberately wider than {@link ProjectedGeometry}, which is what a paint
 * function *returns*. Several generators emit a `GeometryCollection` — the arc
 * mission tasks pack their arcs, arrowheads and (for AreaDefense) solid teeth into
 * one — but a **mark** is a single stroke, fill, letter or dot, so no mark ever
 * needs one. A paint function decomposes the collection on the way through, which
 * is also where it decides that the line work strokes and the rings fill.
 *
 * Keeping the two types apart means every renderer's mark converter handles six
 * cases rather than seven, and none of them has to answer "what does it mean to
 * stroke a collection?".
 */
export type ProjectedInputGeometry =
    | ProjectedGeometry
    | {type: 'GeometryCollection'; geometries: ProjectedGeometry[]};

/** Any CSS color string. Resolved from the config before it reaches a paint list. */
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

/**
 * A repeating fill pattern.
 *
 * The hatched areas — obstacle-restricted, limited-access, the no-fire zones —
 * are filled with diagonal hatching rather than a flat color, and that is a
 * **symbology** fact: FM 1-02.2 draws them that way, so it belongs here rather
 * than in a renderer. Described as parameters, not as an image, because the two
 * renderers realize it completely differently — a canvas builds a `CanvasPattern`,
 * MapLibre needs a registered `fill-pattern` image.
 *
 * Sizes are screen pixels, and `color` already carries its final alpha.
 */
/**
 * The strokes that make up one hatch tile, in tile pixels.
 *
 * **The tile's geometry is symbology, not rendering.** Three renderers rasterise a hatch
 * — the OpenLayers paint bridge, MapLibre's canvas path and MapLibre's native path — and
 * every one of them drew a single hard-coded diagonal. Adding `cross` to {@link HatchSpec}
 * therefore compiled, type-checked, and rendered *identically to diagonal* in all three:
 * a new symbol distinguished only by texture would have shipped looking like the old one.
 *
 * So the segments are described here and the renderers only stroke them. A fourth kind
 * is then one case in one place rather than three parallel edits nobody links together.
 */
export function hatchTileSegments(spec: HatchSpec): Array<[number, number, number, number]> {
    const n = spec.sizePx;
    // Bottom-left to top-right, which is the diagonal every existing hatch already drew.
    const rising: [number, number, number, number] = [0, n, n, 0];
    if (spec.kind === 'diagonal') return [rising];
    // Crossed: the same stroke mirrored, so the two kinds share a density and differ
    // only in whether the second set is present.
    return [rising, [0, 0, n, n]];
}

export interface HatchSpec {
    /**
     * `diagonal` is a single set of parallel strokes; `cross` is two sets at opposing
     * angles. APP-06 tells restricted terrain and *severely* restricted terrain apart by
     * exactly that difference, so it is a symbology fact both renderers must honor
     * rather than a texture one of them happens to draw.
     */
    kind: 'diagonal' | 'cross';
    color: PaintColor;
    /** Side of the repeating tile. */
    sizePx: number;
    /** Thickness of the hatch stroke. */
    lineWidthPx: number;
}

/**
 * How to fill a closed geometry.
 *
 * `color` is always meaningful. `pattern`, when present, is what the fill *should*
 * be — but a renderer that cannot build one may fall back to `color` and still
 * produce something sensible rather than nothing. That degradation path is why
 * this is not a discriminated union: a hatched area drawn as a flat translucent
 * wash is wrong-looking, and drawn as nothing is invisible.
 */
export interface FillSpec {
    color: PaintColor;
    pattern?: HatchSpec;
}

/**
 * A text mark.
 *
 * `font` is a full CSS font shorthand and `scale` multiplies it, exactly as the
 * OpenLayers style functions use them. The pair matters: this repo has been bitten
 * by measuring a gap with one font string and rendering the glyph with another, so
 * anything that measures **must** pass this same `font`. @see PaintContext.measureText
 */
/**
 * What a piece of text *is*, which decides whether a host may hide it.
 *
 * - `doctrinal` — part of the symbol. The `C` on a cover, a mission task's letter, the
 *   `PL` prefix, `ACP 3`. Hide these and the graphic stops being the graphic it is, so
 *   nothing hides them. **This is the default**, because a mark nobody classified is more
 *   safely drawn than dropped: a stray date is noise, a missing letter is a wrong symbol.
 * - `designation` — the name the operator gave this graphic, alone or joined to a
 *   doctrinal prefix (`PL BLUE`, `CATK 3`). Kept when amplifiers are hidden; it is what
 *   the toggle exists to leave behind.
 * - `amplifier` — everything else the operator typed or set: dates, altitudes, widths,
 *   field H, status, a corridor's information block.
 *
 * @see PaintFeature.hideAmplifiers
 */
export type TextKind = 'doctrinal' | 'designation' | 'amplifier';

export interface TextSpec {
    text: string;
    /** What this text is, for the hide-amplifiers toggle. Defaults to `doctrinal`. */
    kind?: TextKind;
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
    /**
     * How the lines of a **multi-line** label line up with each other, when that
     * differs from where the block sits relative to its anchor.
     *
     * Separate from `align` because the two renderers separate them: OpenLayers
     * derives justification from `textAlign` unless told otherwise, while MapLibre
     * takes `text-anchor` and `text-justify` independently and center-justifies by
     * default. A left-aligned block of `MIN ALT: …` / `MAX ALT: …` lines therefore
     * came out center-justified in one engine and left-justified in the other, with
     * the values in a ragged column. Defaults to `align`.
     */
    justify?: 'left' | 'center' | 'right';
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

/** A dot mark — handles, the draw marker, the inert center. Radius is screen pixels. */
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
 * Deliberately tiny. Everything else a style function needs — colors, line
 * width, label size — comes from the library config, which lives in this same
 * map-agnostic half precisely so a second renderer inherits it.
 */
export interface PaintContext {
    /**
     * Projected meters per screen pixel — OpenLayers' `resolution`, and the
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
 * The input half of a paint function: a graphic's realized geometry plus
 * everything stamped on it.
 *
 * This is the renderer-agnostic stand-in for "an OpenLayers feature". The style
 * functions read exactly these things off a feature today — the amplifier bag,
 * and a handful of values the graphic holders stamp so a style function can
 * reproduce a size it did not compute.
 */
export interface PaintFeature {
    /** The realized geometry, in projected meters. May be a collection. */
    geometry: ProjectedInputGeometry;

    /**
     * The amplifier bag — `properties.tacticalGraphic`. The portable schema, the
     * same object `renderTacticalGraphic` consumes and persistence saves.
     */
    properties: TacticalGraphicProperties;

    /**
     * Draw the symbol and its designation only — no dates, altitudes, widths, field H or
     * a corridor's information block.
     *
     * **A view state the host owns, not a property of the graphic.** It says nothing about
     * what the symbol *is*: two identical corridors side by side may reasonably differ, the
     * same corridor may be annotated on one map and bare on another, and nothing about it
     * should survive into a file that another operator opens. So it is a renderer input
     * like `graphicSize` and `bounds` rather than a field on the portable description, and
     * a host keeps it wherever its other view state lives — a store, a URL, local storage.
     * It was on the bag until 2026-08-30, which meant saving a graphic saved a preference
     * with it. (User's call.)
     *
     * The symbol never goes. @see TextKind, `withHiddenAmplifiers`
     */
    hideAmplifiers?: boolean;

    /**
     * The graphic's own size in **meters**, when it has one: a circle's radius, a
     * block arrow's perpendicular extent. Size-proportional label scales need it,
     * and so does anything cutting a gap sized to such a label.
     *
     * Stamped by the holder rather than derived here because only the holder
     * knows which of a graphic's dimensions is "the" size.
     */
    graphicSize?: number;

    /**
     * The view resolution the graphic was drawn at, in meters per pixel. Anchors
     * the zoom-relative label scale so a label holds its size at the zoom it was
     * created at. Not persisted — it is live view state, not part of the symbol.
     */
    drawingResolution?: number;

    /** Center of a point-anchored graphic, in projected meters. */
    graphicCenter?: ProjectedPosition;

    /** Where a point-anchored graphic's label sits, in projected meters. */
    graphicLabelPoint?: ProjectedPosition;

    /**
     * The graphic's axis-aligned extent, in projected meters.
     *
     * Stamped by the holder because a **label** feature is a bare anchor point —
     * it does not know the shape it labels. Several area layouts hang their
     * date-time group off a corner of that extent (a rectangle's top-left is a real
     * vertex; a circle has none, so the square hugging it is the sensible stand-in),
     * and the position-area-artillery symbol puts a "PAA" at each edge midpoint.
     */
    bounds?: {minX: number; minY: number; maxX: number; maxY: number};

    /**
     * The drawn polygon's outer ring, in projected meters.
     *
     * Only the *irregular* zone variants need it, and they need it because the
     * bounding-box corner is misleading for a shape that is not a rectangle — that
     * corner can sit a long way outside the polygon. They anchor on the real
     * upper-left **vertex** instead.
     */
    ring?: ProjectedPosition[];

    /**
     * Two points defining the segment a label lies along, in projected meters.
     *
     * Group-or-series-of-targets writes its designation on the polygon's northern
     * edge, rotated to follow it. Which edge that is was decided when the geometry
     * was built, so the segment is published rather than re-derived here.
     */
    labelSegment?: [ProjectedPosition, ProjectedPosition];

    /**
     * An already-resolved line color, overriding the affiliation's.
     *
     * A *color*, not an affiliation — so it is a cache that can go stale, and a
     * host that changes its palette has to re-derive it rather than compare the
     * string. Present because several host paths (a properties dialog, a bulk
     * import, a theme switch) resolve a color once and stamp it, and dropping it
     * would silently re-color every such feature.
     *
     * Absent is the normal case: the paint function asks
     * `getColorByHostility(properties.hostility)` and gets the doctrinal answer,
     * or the host's override of it.
     */
    hostilityColor?: string;

    /**
     * The echelon glyph a position wears, when the host tracks it outside the
     * properties bag.
     *
     * A separate field rather than a bag entry because that is where it actually
     * lives: the demo's properties dialog stamps `echelon` straight onto the
     * OpenLayers feature and does **not** put it in `properties.tacticalGraphic`,
     * so a paint function that read only the bag would silently render every
     * position as a squad. Falls back to the bag, then to squad.
     *
     * Worth fixing at the source one day — the bag is meant to be the single
     * description a graphic carries, and an echelon that never gets saved is a
     * real gap. Until then this is the channel, and it is documented rather than
     * quietly worked around.
     */
    echelon?: TacticalGraphicEchelon;

    /**
     * A range fan's bands, with every deflection already resolved to an absolute
     * bearing.
     *
     * Stamped on the label feature by the holder, for the same reason as
     * {@link PaintFeature.echelon}: it is derived state, not part of the graphic's
     * saved description, and resolving it is the holder's job so a paint function
     * never has to re-run the resolver.
     *
     * Typed structurally rather than importing `RangeFanBand` — `core/` must not
     * depend on `symbology/`.
     */
    rangeFanBands?: Array<{
        range: number;
        label?: string;
        altitude?: number;
        resolvedLeftAz?: number;
        resolvedRightAz?: number;
    }>;

    /** Which layout {@link PaintFeature.rangeFanBands} is packed in. */
    rangeFanShape?: 'circular' | 'sector';
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

/** The member geometries of an input geometry — itself, if it is not a collection. */
export function paintGeometryMembers(geometry: ProjectedInputGeometry): ProjectedGeometry[] {
    return geometry.type === 'GeometryCollection' ? geometry.geometries : [geometry];
}

/**
 * Every line in an input geometry, flattened, in order.
 *
 * The shape almost every ported style function starts from: the generators emit
 * their line work as a `MultiLineString`, sometimes inside a collection, and a
 * style function then indexes into the sub-lines (`[0]` and `[1]` are the two arcs
 * of a mission-task circle, everything after is arrowheads and teeth).
 *
 * Returns **copies**, because callers mutate them — cutting an arc back to clear a
 * label is done in place.
 */
export function paintLineWork(geometry: ProjectedInputGeometry): ProjectedPosition[][] {
    const lines: ProjectedPosition[][] = [];
    for (const member of paintGeometryMembers(geometry)) {
        if (member.type === 'LineString') lines.push([...member.coordinates]);
        else if (member.type === 'MultiLineString') for (const line of member.coordinates) lines.push([...line]);
    }
    return lines;
}

/** Every filled ring in an input geometry — AreaDefense's solid teeth, and nothing else today. */
export function paintFilledRings(geometry: ProjectedInputGeometry): ProjectedPosition[][][] {
    const rings: ProjectedPosition[][][] = [];
    for (const member of paintGeometryMembers(geometry)) {
        if (member.type === 'Polygon') rings.push(member.coordinates);
        else if (member.type === 'MultiPolygon') for (const poly of member.coordinates) rings.push(poly);
    }
    return rings;
}

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

/**
 * The closed outline of a projected geometry, or nothing if it has none.
 *
 * Every area label and every glyph-inside-a-shape needs this, and both renderers were
 * working it out for themselves — which is how the *circular* variants ended up with no
 * outline at all. A circular area's **base** is a point, so a rule that reads only the base
 * finds nothing, and the label cap and the glyph fit both silently did nothing for them.
 *
 * A `MultiLineString` counts only when its first part is **closed**, which is what
 * separates a generated circle from a drawn route. Treating an open line as a ring would
 * hand `pointInRing` a shape with no inside.
 */
/**
 * A geometry's axis-aligned extent, in projected meters — or `undefined` when it has
 * no positions at all.
 *
 * `undefined` rather than a zero-size box at the origin, because every caller is
 * placing something *at* this box: the zone labels hang their date-time group off a
 * corner, and a box at [0,0] puts the dates in the Gulf of Guinea. An editor drawing a
 * selection box has the same problem one screen further on.
 *
 * **In Layer 1 because both renderers need the same box.** It lived in
 * `maplibreAdapter.ts`, so OpenLayers had no generic answer to "how big is this
 * graphic" and computed a `getExtent()` for area holders only — a *base polygon's*
 * extent, where MapLibre measured the *rendered* geometry. Those are different boxes,
 * and edit chrome drawn from them would sit in a different place on each engine.
 * @see ai/conventions.md — "A symbology fact never lives in a holder"
 */
export function boundsOf(geometry: ProjectedInputGeometry | undefined): PaintFeature['bounds'] {
    if (!geometry) return undefined;
    const positions = paintGeometryMembers(geometry).flatMap(paintGeometryPositions);
    if (!positions.length) return undefined;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of positions) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return {minX, minY, maxX, maxY};
}

/**
 * The union of several extents — how a renderer measures a graphic that is drawn as
 * more than one geometry.
 *
 * A tactical graphic is line work *plus* labels *plus* whatever a paint function
 * synthesises, and a box drawn around only the line work clips the amplifiers that
 * hang outside it. Undefined members are skipped, so a caller can pass the optional
 * ones straight in.
 */
export function unionBounds(...boxes: (PaintFeature['bounds'] | undefined)[]): PaintFeature['bounds'] {
    let out: PaintFeature['bounds'] | undefined;
    for (const box of boxes) {
        if (!box) continue;
        out = out
            ? {
                  minX: Math.min(out.minX, box.minX),
                  minY: Math.min(out.minY, box.minY),
                  maxX: Math.max(out.maxX, box.maxX),
                  maxY: Math.max(out.maxY, box.maxY),
              }
            : box;
    }
    return out;
}

export function outerRingOf(geometry: ProjectedInputGeometry | undefined): ProjectedPosition[] | undefined {
    if (!geometry) return undefined;
    if (geometry.type === 'Polygon') return geometry.coordinates[0];
    if (geometry.type === 'MultiPolygon') return geometry.coordinates[0]?.[0];

    const parts = geometry.type === 'MultiLineString' ? geometry.coordinates
        : geometry.type === 'LineString' ? [geometry.coordinates]
        : [];
    const first = parts[0];
    if (!first || first.length < 4) return undefined;
    const a = first[0];
    const b = first[first.length - 1];
    const closed = Math.abs(a[0] - b[0]) < 1 && Math.abs(a[1] - b[1]) < 1;
    return closed ? first : undefined;
}
