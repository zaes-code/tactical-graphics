import type {Feature as GeoJSONFeature, Position} from 'geojson';
import {
    getPaintFunction,
    paintGeometryMembers,
    paintGeometryPositions,
    renderTacticalGraphic,
    TACTICAL_GRAPHIC_KEY,
    type Paint,
    type PaintContext,
    type PaintFeature,
    type ProjectedGeometry,
    type ProjectedInputGeometry,
    type ProjectedPosition,
    SECURITY_OPERATION_PX,
    GLYPH_CUT_GAP_GRAPHICS,
    arrowheadMetres,
    decorationMetres,
    hasBakedDecoration,
    isMovementGraphic,
    TacticalGraphicName,
    type TacticalGraphicProperties,
} from '@zaes/tactical-graphics';
import {toMercator} from './projection';

/**
 * # Generator output → paint features
 *
 * The MapLibre twin of `openlayersAdapter.ts`, and markedly shorter, for a reason
 * worth recording: **the reprojection does not disappear, it moves.**
 *
 * `ai/maplibre-renderer.md` predicted the 4326 → 3857 hop would go away because
 * MapLibre consumes lon/lat directly. It does not. Every screen-pixel decoration
 * in this library is `pixels × resolution` in *projected metres*, and every
 * distance and angle in the ported paint functions is planar — so the paint layer
 * still has to work in EPSG:3857, and it is the **renderer** that converts back
 * to lon/lat on the way out. What actually changed is that the conversion is now
 * two lines of arithmetic here instead of an OpenLayers `GeoJSON` format
 * round-trip per feature.
 *
 * This adapter also goes through the **public** `renderTacticalGraphic` rather
 * than reaching into the registry, which the OpenLayers adapter predates. That is
 * the entry point a real consumer has, so anything missing from it is a gap in
 * the published library rather than in this file.
 */

/**
 * GeoJSON `Position` (lon/lat) → projected metres, recursively, keeping structure.
 *
 * Recurses on nesting depth rather than switching on the geometry type, so one
 * function covers Point through MultiPolygon. The base case is "an array whose
 * first element is a number", which is exactly a `Position`.
 */
function projectCoordinates(coordinates: unknown): unknown {
    // Guarded, not assumed: a generator handed a degenerate base (an empty
    // LineString, most often a draw that was cancelled on its first click) can
    // return a geometry whose `coordinates` is absent, and indexing that threw a
    // TypeError straight out of the render loop. Returning an empty list lets the
    // caller draw nothing, which is what a half-finished graphic should do.
    if (!Array.isArray(coordinates)) return [];
    if (typeof coordinates[0] === 'number') return toMercator(coordinates as [number, number]);
    return coordinates.map(projectCoordinates);
}

/**
 * A GeoJSON geometry in lon/lat → the same shape in projected metres.
 *
 * **`GeometryCollection` has to be handled, not skipped.** Several mission-task
 * generators pack their arcs, arrowheads and solid teeth into one — `AreaDefense`,
 * `CordonAndSearch`, `Isolate` and `Retain` all do — and returning `undefined`
 * meant `buildTacticalGraphic` refused them outright, so they were registered as
 * paintable and never drew a thing.
 *
 * This is the exact mirror of the bug `fromOlGeometry` had on the OpenLayers side.
 * There, the existing test suite caught it within the hour; here there was no
 * coverage, and it took the sample sweep listing four graphics it could not build.
 * Two renderers, one class of bug, found two very different ways — which is the
 * argument for the sweep existing at all.
 */
export function projectGeometry(geometry: GeoJSONFeature['geometry']): ProjectedInputGeometry | undefined {
    if (!geometry) return undefined;

    if (geometry.type === 'GeometryCollection') {
        return {
            type: 'GeometryCollection',
            geometries: geometry.geometries
                .map(projectGeometry)
                // Nested collections are dropped: no generator emits one, and a mark
                // cannot hold a collection anyway.
                .filter((g): g is ProjectedGeometry => !!g && g.type !== 'GeometryCollection'),
        };
    }

    return {
        type: geometry.type,
        coordinates: projectCoordinates(geometry.coordinates),
    } as ProjectedGeometry;
}

/** One rendered graphic, ready to paint. */
export interface MapLibreTacticalGraphic {
    id: string;
    name: TacticalGraphicName;
    properties: TacticalGraphicProperties;
    /** The base the user drew, in lon/lat — the only thing worth persisting. */
    base: GeoJSONFeature;
    /** The line work. */
    graphic: PaintFeature;
    /** The text anchors, when the graphic keeps its label on a separate feature. */
    labels?: PaintFeature;
    /** Drag handles, in projected metres. */
    handles: ProjectedPosition[];
}

let nextId = 0;

/**
 * Builds a paint-ready graphic from a base feature the user drew.
 *
 * `size` and `rotation` reach the generator through `properties.tacticalGraphic`
 * (`radius`, `rotation`) rather than as separate arguments, because that bag is
 * the portable description — the same object persistence saves and any renderer
 * consumes. Nothing renderer-specific travels with it.
 *
 * ## `drawingResolution` is the caller's job, and forgetting it is silent
 *
 * The zoom-anchored label scale reads it: at the resolution a graphic was created
 * at, its label renders at exactly the configured size, and it shrinks from there
 * as you zoom out. It is **live view state, not part of the symbol**, so the
 * saved bag deliberately does not carry it (`ai/context.md`, "No viewport state
 * travels with it") — which means every renderer has to supply it independently.
 *
 * Omit it and `labelScale` falls back to a `sqrt` curve. Nothing throws; the
 * labels just come out a different size from the other renderer's. This spike
 * shipped that bug for one run: the phase line's "PL BLUE" rendered at 0.55×
 * against OpenLayers' 1.0×, while the obstacle line's and Secure's labels matched
 * — because those two are size-proportional and read `graphicSize` instead. Two
 * of three labels agreeing is exactly how a scale bug hides.
 */

/**
 * Share of a drawn base's length used for a size the caller did not give.
 *
 * Matches what the OpenLayers holders produce: they seed an offset of 20 screen
 * pixels at the drawing zoom against a base dragged a few hundred pixels long, so
 * roughly a twentieth either way.
 */
const DEFAULT_SIZE_FRACTION = 1 / 20;

/** Screen pixels at the drawing zoom, matching what the OpenLayers holders seed. */
const DEFAULT_OFFSET_PX = 20;

/**
 * Sizes for a graphic drawn with none, measured against what was drawn.
 *
 * ## Why the renderer, and not the generators
 *
 * Every generator falls back to a flat `20` **metres** for a missing `radius` or
 * `size`. On a 700 km corridor that puts the rails 20 m apart — collapsed onto the
 * centreline — and it is why a corridor drawn in this renderer looked nothing like
 * the same corridor in OpenLayers.
 *
 * Fixing it in the generators is the tempting move and it is wrong: `LineGraphicBase`
 * passes **only `size`**, so 41 OpenLayers graphics deliberately rely on that 20 m
 * `radius`, and changing it reflowed 7% of the sample gallery. The default is load
 * bearing for the renderer that already ships.
 *
 * So the *renderer* supplies them, which is exactly what the OpenLayers holders do —
 * `MovementGraphicBase` passes `{radius: this.offset, size: decorationMetres(…)}`
 * derived from the map resolution. This is the same job done from the base's own
 * length, because that is what a MapLibre view has to hand.
 *
 * An explicit value always wins: these are spread *before* the caller's properties.
 *
 * **The underlying library gap is real and is not fixed here.** A consumer calling
 * `renderTacticalGraphic` with only a centre still gets 20 m rails. Closing that
 * means changing what those 41 graphics draw in OpenLayers, which is a decision
 * about the shipped renderer rather than a bug fix. @see ai/current-task.md
 */
function sizeDefaults(
    name: TacticalGraphicName,
    geometry: GeoJSONFeature['geometry'],
    supplied: Omit<TacticalGraphicProperties, 'name'>,
    drawingResolution?: number,
): Partial<TacticalGraphicProperties> {
    // **The same rule the OpenLayers holders use**, so the two engines draw the same
    // graphic: 20 screen pixels at the zoom it was drawn at. Matching the rule rather
    // than approximating it is what makes a corridor drawn here the width of one
    // drawn there.
    //
    // The base's own length is the fallback, for a restore that carries no
    // resolution — a snapshot deliberately holds no viewport state, so there is
    // nothing else to measure against. @see ai/context.md, "No viewport state travels"
    const metres = drawingResolution
        ? drawingResolution * DEFAULT_OFFSET_PX
        : baseLengthMetres(geometry) * DEFAULT_SIZE_FRACTION;
    if (metres <= 0) return {};

    return {
        // `width` is a full width; the generators halve it. @see toGraphicOptions
        ...(supplied.width === undefined ? {width: metres * 2} : {}),
        ...(supplied.decorationSize === undefined && supplied.radius === undefined && drawingResolution
            ? {decorationSize: metres}
            : {}),
    };
}

/**
 * Turn and Envelopment's arrowhead, when the caller did not stamp one.
 *
 * Their heads are a **screen** length baked into metres once at draw time — 26 px
 * and 22 px — not a fraction of the graphic. The OpenLayers holders do this in their
 * constructors; without the same default here the generator fell back to its
 * fraction-of-`size` ratio and drew a visibly smaller head.
 *
 * A stamped `decorationSize` wins, because that is a restore replaying the head the
 * graphic was actually drawn with. @see arrowheadMetres
 */
function arrowheadDefault(
    name: TacticalGraphicName,
    supplied: Omit<TacticalGraphicProperties, 'name'>,
    drawingResolution?: number,
): Partial<TacticalGraphicProperties> {
    if (!drawingResolution || supplied.decorationSize !== undefined) return {};
    const metres = arrowheadMetres(name, drawingResolution);
    return metres === undefined ? {} : {decorationSize: metres};
}

/**
 * The decoration size for a graphic whose `size` option *is* a decoration.
 *
 * For these, `size` means "how big is the chevron" rather than "how far does this
 * reach", so it belongs to the renderer, which knows the zoom. The OpenLayers
 * holder does exactly this — `LineGraphicBase` passes
 * `decorationMetres(name, resolution)` and lets a stamped value override it.
 *
 * Applied **after** the caller's properties, like the security operations and for
 * the same reason: a `radius` arriving from a sweep or a snapshot is a reach in
 * metres, and `toGraphicOptions` prefers it over `decorationSize` — so leaving it
 * in place drew a bridge tick at 200 km. A caller who genuinely means to set the
 * decoration passes `decorationSize`, which is honoured here.
 */
function bakedDecorationSize(
    name: TacticalGraphicName,
    supplied: Omit<TacticalGraphicProperties, 'name'>,
    drawingResolution?: number,
): Partial<TacticalGraphicProperties> {
    if (!drawingResolution || !hasBakedDecoration(name)) return {};

    // A stamped `radius` is the decoration size for the line family — that is what
    // `LineGraphicBase.setOffset` replays on restore — but means nothing for the
    // movement family, whose holder stamps `width` for its rails and derives the
    // decoration from the resolution every time. Honouring it there drew a bridge
    // tick 200 km tall; ignoring it here shrank a restored fields-of-fire arrowhead
    // to a quarter of its size. The two families genuinely differ.
    const stamped = isMovementGraphic(name) ? undefined : supplied.radius;
    return {radius: supplied.decorationSize ?? stamped ?? decorationMetres(name, drawingResolution)};
}

/**
 * The size a security operation is drawn at, in metres.
 *
 * These are badges: the OpenLayers holder builds every dimension as a pixel
 * constant times the live map resolution, so the symbol is the same size on screen
 * at every zoom. Passing a ground distance instead — which is what `radius` is
 * everywhere else — makes it a different symbol at every zoom, and a tiny one at
 * the sizes a sweep uses.
 *
 * `SECURITY_OPERATION_PX` is the generator's own table, so this reproduces the
 * OpenLayers rule rather than approximating it. The renderer re-runs this on every
 * zoom. @see NativeLayerRenderer.rebuildScreenSized
 */
function securityOperationSize(
    name: TacticalGraphicName,
    drawingResolution?: number,
): Partial<TacticalGraphicProperties> {
    if (!drawingResolution || !SECURITY_OPERATIONS.has(name)) return {};

    const halfExtentPx = SECURITY_OPERATION_PX.labelPadding
        + SECURITY_OPERATION_PX.labelGap
        + 2 * SECURITY_OPERATION_PX.arrowLength;
    return {radius: halfExtentPx * drawingResolution};
}

/** @see securityOperationSize */
const SECURITY_OPERATIONS = new Set<TacticalGraphicName>([
    TacticalGraphicName.Cover,
    TacticalGraphicName.Guard,
    TacticalGraphicName.Screen,
]);

/**
 * A base's drawn length in metres.
 *
 * A local equirectangular approximation rather than turf: this runs on every build
 * and the answer only has to be the right order of magnitude. The cosine keeps a
 * north-south and an east-west drag of the same *distance* measuring the same.
 */
function baseLengthMetres(geometry: GeoJSONFeature['geometry']): number {
    const positions: number[][] = [];
    const walk = (node: unknown): void => {
        if (!Array.isArray(node) || !node.length) return;
        if (typeof node[0] === 'number') positions.push(node as number[]);
        else node.forEach(walk);
    };
    walk((geometry as {coordinates?: unknown}).coordinates);
    if (positions.length < 2) return 0;

    const METRES_PER_DEGREE = 111_319;
    let length = 0;
    for (let i = 0; i < positions.length - 1; i++) {
        const [x1, y1] = positions[i];
        const [x2, y2] = positions[i + 1];
        const dx = (x2 - x1) * Math.cos((((y1 + y2) / 2) * Math.PI) / 180);
        length += Math.hypot(dx, y2 - y1) * METRES_PER_DEGREE;
    }
    return length;
}

export function buildTacticalGraphic(
    name: TacticalGraphicName,
    baseGeometry: GeoJSONFeature['geometry'],
    properties: Omit<TacticalGraphicProperties, 'name'> = {},
    drawingResolution?: number,
): MapLibreTacticalGraphic | undefined {
    const props: TacticalGraphicProperties = {
        name,
        // The arc mission tasks are asked for **no** gap: their two arcs run right up
        // to the label axis and `arcMissionTaskPaint` takes back exactly what the
        // rendered glyph needs. A fixed angular gap cannot track a capped label scale.
        ...(getPaintFunction(name)?.label ? {labelGapDegrees: 0} : {}),
        ...sizeDefaults(name, baseGeometry, properties, drawingResolution),
        ...arrowheadDefault(name, properties, drawingResolution),
        // The paint layer measures the letter and cuts its own hole, so the geometry
        // must arrive unbroken. @see GLYPH_CUT_GAP_GRAPHICS
        ...(GLYPH_CUT_GAP_GRAPHICS.includes(name) && properties.labelGap === undefined ? {labelGap: 0} : {}),
        ...properties,
        // **After** the caller's properties, unlike every other default here. A
        // security operation's size is not a ground distance a caller may set — it is
        // a screen constant, and these graphics refuse a resize for exactly that
        // reason. A `radius` arriving from a saved snapshot or a sweep is a number in
        // metres from some other zoom, and honouring it draws the symbol at the wrong
        // size. @see allowedGestures
        ...securityOperationSize(name, drawingResolution),
        ...bakedDecorationSize(name, properties, drawingResolution),
    };

    const base: GeoJSONFeature = {
        type: 'Feature',
        geometry: baseGeometry,
        properties: {[TACTICAL_GRAPHIC_KEY]: props},
    };

    let rendered;
    try {
        rendered = renderTacticalGraphic(base);
    } catch {
        // A generator that cannot draw this base — too few vertices mid-draw, most
        // often. The caller shows nothing rather than a half-graphic.
        return undefined;
    }

    const graphicGeometry = projectGeometry(rendered.graphic.geometry);
    if (!graphicGeometry) return undefined;

    const labelGeometry = projectGeometry(rendered.labels.geometry);
    const centre = projectGeometry(baseGeometry);

    // The projected centre cannot be recovered from the drawn geometry: the
    // generator walks out geodesically and Mercator does not preserve a midpoint.
    // Same reasoning as `MissionTaskGraphicBase.updateGeometry`, which stamps it.
    const graphicCenter = centre?.type === 'Point' ? centre.coordinates : undefined;
    // Where the label sits — which direction that is differs per graphic (Contain's
    // is due west, everyone else's follows the rotation axis), so it is published by
    // the generator rather than re-derived from `rotation` here.
    const graphicLabelPoint = labelGeometry?.type === 'Point'
        ? labelGeometry.coordinates
        : labelGeometry?.type === 'MultiPoint'
            ? labelGeometry.coordinates[0]
            : undefined;

    const shared = {
        properties: props,
        graphicSize: props.radius,
        drawingResolution,
        graphicCenter,
        graphicLabelPoint,
        // The geometry facts the area labels read. On the OpenLayers side these are
        // stamped onto the label feature by `AreaGraphicBase`; a label feature is a
        // bare anchor point and cannot work them out for itself, so whichever layer
        // owns the holder has to supply them. Here that is this adapter.
        bounds: boundsOf(graphicGeometry),
        ring: outerRingOf(projectGeometry(baseGeometry)),
    };

    return {
        id: `mlb-${nextId++}`,
        name,
        properties: props,
        base,
        graphic: {geometry: graphicGeometry, ...shared},
        labels: labelGeometry ? {geometry: labelGeometry, ...shared} : undefined,
        handles: handlePositions(rendered.handles.geometry),
    };
}

/**
 * A geometry's axis-aligned extent, in projected metres.
 *
 * `undefined` for an empty geometry rather than a zero-size box at the origin: the
 * zone labels hang their date-time group off a corner of this, and a box at [0,0]
 * would put the dates in the Gulf of Guinea.
 */
function boundsOf(geometry: ProjectedInputGeometry | undefined): PaintFeature['bounds'] {
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

/** The outer ring of a polygon base, for the irregular zones' vertex anchor. */
function outerRingOf(geometry: ProjectedInputGeometry | undefined): ProjectedPosition[] | undefined {
    if (geometry?.type === 'Polygon') return geometry.coordinates[0];
    if (geometry?.type === 'MultiPolygon') return geometry.coordinates[0]?.[0];
    return undefined;
}

function handlePositions(geometry: GeoJSONFeature['geometry']): ProjectedPosition[] {
    const projected = projectGeometry(geometry);
    if (!projected) return [];
    if (projected.type === 'Point') return [projected.coordinates];
    if (projected.type === 'MultiPoint') return projected.coordinates;
    return [];
}

/**
 * Every mark one graphic contributes at this view scale.
 *
 * Returns an empty list for a graphic with no paint function yet — the spike has
 * three of 69 — rather than throwing or drawing a placeholder. `isPaintable` is
 * how a caller finds out in advance.
 */
export function paintTacticalGraphic(graphic: MapLibreTacticalGraphic, context: PaintContext): Paint[] {
    const painters = getPaintFunction(graphic.name);
    if (!painters) return [];

    const paints = painters.graphic(graphic.graphic, context);
    if (painters.label && graphic.labels) paints.push(...painters.label(graphic.labels, context));
    return paints;
}

/** Re-exported so callers do not need a second import for the lon/lat form. */
export type {Position};
