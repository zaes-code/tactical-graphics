import type {Feature as GeoJSONFeature, Position} from 'geojson';
import {
    getPaintFunction,
    boundsOf,
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
    normalizeDrawnBase,
    GLYPH_CUT_GAP_GRAPHICS,
    arrowheadMeters,
    groundLength,
    RANGE_FANS,
    outerRingOf,
    rectangleAmplifiers,
    ratioLockOf,
    resolveRangeFanBands,
    toGraphicOptions,
    decorationMeters,
    drawnSizeMeters,
    hasBakedDecoration,
    isMovementGraphic,
    TacticalGraphicName,
    type TacticalGraphicProperties,
} from '@zaes/tactical-graphics';
import {toLonLat, toMercator} from './projection';

/**
 * # Generator output → paint features
 *
 * The MapLibre twin of `openlayersAdapter.ts`, and markedly shorter, for a reason
 * worth recording: **the reprojection does not disappear, it moves.**
 *
 * `ai/maplibre-renderer.md` predicted the 4326 → 3857 hop would go away because
 * MapLibre consumes lon/lat directly. It does not. Every screen-pixel decoration
 * in this library is `pixels × resolution` in *projected meters*, and every
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
 * GeoJSON `Position` (lon/lat) → projected meters, recursively, keeping structure.
 *
 * Recurses on nesting depth rather than switching on the geometry type, so one
 * function covers Point through MultiPolygon. The base case is "an array whose
 * first element is a number", which is exactly a `Position`.
 */
function projectCoordinates(coordinates: unknown): unknown {
    // Guarded, not assumed: a generator handed a degenerate base (an empty
    // LineString, most often a draw that was canceled on its first click) can
    // return a geometry whose `coordinates` is absent, and indexing that threw a
    // TypeError straight out of the render loop. Returning an empty list lets the
    // caller draw nothing, which is what a half-finished graphic should do.
    if (!Array.isArray(coordinates)) return [];
    if (typeof coordinates[0] === 'number') return toMercator(coordinates as [number, number]);
    return coordinates.map(projectCoordinates);
}

/**
 * A GeoJSON geometry in lon/lat → the same shape in projected meters.
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
    /** Drag handles, in projected meters. */
    handles: ProjectedPosition[];
}

/**
 * The same graphic with its label scale re-anchored to `resolution`.
 *
 * `drawingResolution` is the zoom a graphic was *created* at, and it anchors the
 * zoom-relative label scale so a designation holds its size at the zoom it was drawn
 * and grows only within a clamp. Rebuilding a graphic to re-derive a screen-sized
 * decoration re-stamps it with the *current* resolution, which silently turns that
 * anchor into "now" — the scale then computes as 1.0 at every zoom and the label
 * never grows at all.
 *
 * Measured on a passage lane: OpenLayers' date-time group reached its 1.5x clamp two
 * zooms in and MapLibre's stayed at 1.0, which read as ink 0.58 against 1.00.
 *
 * @see NativeLayerRenderer.rebuildScreenSized, which is the only caller
 */
export function withDrawingResolution(
    graphic: MapLibreTacticalGraphic,
    resolution: number | undefined,
): MapLibreTacticalGraphic {
    return {
        ...graphic,
        graphic: {...graphic.graphic, drawingResolution: resolution},
        labels: graphic.labels ? {...graphic.labels, drawingResolution: resolution} : undefined,
    };
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
 * Every generator falls back to a flat `20` **meters** for a missing `radius` or
 * `size`. On a 700 km corridor that puts the rails 20 m apart — collapsed onto the
 * centerline — and it is why a corridor drawn in this renderer looked nothing like
 * the same corridor in OpenLayers.
 *
 * Fixing it in the generators is the tempting move and it is wrong: `LineGraphicBase`
 * passes **only `size`**, so 41 OpenLayers graphics deliberately rely on that 20 m
 * `radius`, and changing it reflowed 7% of the sample gallery. The default is load
 * bearing for the renderer that already ships.
 *
 * So the *renderer* supplies them, which is exactly what the OpenLayers holders do —
 * `MovementGraphicBase` passes `{radius: this.offset, size: decorationMeters(…)}`
 * derived from the map resolution. This is the same job done from the base's own
 * length, because that is what a MapLibre view has to hand.
 *
 * An explicit value always wins: these are spread *before* the caller's properties.
 *
 * **The underlying library gap is real and is not fixed here.** A consumer calling
 * `renderTacticalGraphic` with only a center still gets 20 m rails. Closing that
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
    const meters = drawingResolution
        ? drawingResolution * DEFAULT_OFFSET_PX
        : baseLengthMeters(geometry) * DEFAULT_SIZE_FRACTION;
    if (meters <= 0) return {};

    // A stamped `radius` on a line graphic **is** its half-width: that is what
    // `LineGraphicBase.setOffset` replays on restore, and what the OpenLayers holder
    // did with the same bag. Inventing a width beside it made the two engines draw
    // different corridors from one saved description — 6.3% of the frame, the largest
    // single disagreement left in the sweep. A supplied `width` still wins over both.
    // @see ai/context.md, "A saved graphic carries one object"
    const halfWidth = supplied.radius !== undefined && supplied.radius > 0 ? supplied.radius : meters;

    /*
     * **A graphic with a baked decoration gets its own size, not the generic 20 px.**
     *
     * `meters` is the default *offset* — the half-width of a corridor's rails — and
     * stamping it as `decorationSize` was harmless only until something rebuilt the
     * graphic: `bakedDecorationSize` prefers a stamped `decorationSize` over the
     * per-name table, so the second build silently replaced the symbol's own size with
     * 20 px worth. A bridge's ticks went 15 px -> 20, Fix's zigzag 14 -> 20, and Abatis's
     * chevron *shrank* 26 -> 20 — each of them drifting away from OpenLayers, which
     * derives `decorationMeters` on every render and never stores it.
     *
     * A rebuild is not rare: every zoom change re-derives the screen-sized graphics.
     * @see NativeLayerRenderer.rebuildScreenSized, decorationMeters
     */
    // The block family states a size of its own — a bar across the line, three times the
    // generic offset — and it is a library fact both engines read. @see drawnSizeMeters
    const decoration = hasBakedDecoration(name)
        ? decorationMeters(name, drawingResolution ?? 0)
        : drawnSizeMeters(name, drawingResolution ?? 0) ?? meters;

    return {
        // `width` is a full width; the generators halve it. @see toGraphicOptions
        ...(supplied.width === undefined ? {width: halfWidth * 2} : {}),
        ...(supplied.decorationSize === undefined && supplied.radius === undefined && drawingResolution
            ? {decorationSize: decoration}
            : {}),
    };
}

/**
 * Turn and Envelopment's arrowhead, when the caller did not stamp one.
 *
 * Their heads are a **screen** length baked into meters once at draw time — 26 px
 * and 22 px — not a fraction of the graphic. The OpenLayers holders do this in their
 * constructors; without the same default here the generator fell back to its
 * fraction-of-`size` ratio and drew a visibly smaller head.
 *
 * A stamped `decorationSize` wins, because that is a restore replaying the head the
 * graphic was actually drawn with. @see arrowheadMeters
 */
function arrowheadDefault(
    name: TacticalGraphicName,
    supplied: Omit<TacticalGraphicProperties, 'name'>,
    drawingResolution?: number,
): Partial<TacticalGraphicProperties> {
    if (!drawingResolution || supplied.decorationSize !== undefined) return {};
    const meters = arrowheadMeters(name, drawingResolution);
    return meters === undefined ? {} : {decorationSize: meters};
}

/**
 * The decoration size for a graphic whose `size` option *is* a decoration.
 *
 * For these, `size` means "how big is the chevron" rather than "how far does this
 * reach", so it belongs to the renderer, which knows the zoom. The OpenLayers
 * holder does exactly this — `LineGraphicBase` passes
 * `decorationMeters(name, resolution)` and lets a stamped value override it.
 *
 * Applied **after** the caller's properties, like the security operations and for
 * the same reason: a `radius` arriving from a sweep or a snapshot is a reach in
 * meters, and `toGraphicOptions` prefers it over `decorationSize` — so leaving it
 * in place drew a bridge tick at 200 km. A caller who genuinely means to set the
 * decoration passes `decorationSize`, which is honored here.
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
    // decoration from the resolution every time. Honoring it there drew a bridge
    // tick 200 km tall; ignoring it here shrank a restored fields-of-fire arrowhead
    // to a quarter of its size. The two families genuinely differ.
    const stamped = isMovementGraphic(name) ? undefined : supplied.radius;
    return {radius: supplied.decorationSize ?? stamped ?? decorationMeters(name, drawingResolution)};
}

/**
 * Moves an origin-centered graphic onto its base point.
 *
 * Three graphics need it — Cover, Guard and Screen. Their generator emits arms and
 * label anchors as offsets from `[0, 0]` and never looks at the base, so whatever
 * consumes it has to do the placing. `SecurityOperationGraphicBase.placeCoordinates`
 * is the OpenLayers half; this is the same arithmetic, kept deliberately identical
 * rather than re-derived.
 *
 * The offsets are added in **lon/lat**, because that is the space the generator
 * built them in — `getSearchAreaArrow` converts its meter inputs to degrees on the
 * way out. OpenLayers adds them in projected meters instead, and is self-consistent
 * because its holder passes the five dimensions already in projected meters; the two
 * renderers therefore feed the same generator different units. That is the open item
 * in `ai/decisions.md` about `size` meaning meters-per-pixel, and it is not resolved
 * here — this only puts the arms where the graphic is.
 *
 * A rotation turns the arms about the center, as the holder's does. Everything else
 * passes through untouched.
 */
function placeOriginCentered(
    name: TacticalGraphicName,
    rendered: {graphic: GeoJSONFeature; labels: GeoJSONFeature; handles: GeoJSONFeature},
    baseGeometry: GeoJSONFeature['geometry'],
    rotationDegrees?: number,
): {graphic: GeoJSONFeature['geometry']; labels: GeoJSONFeature['geometry']; handles: GeoJSONFeature['geometry']} {
    const asIs = {graphic: rendered.graphic.geometry, labels: rendered.labels.geometry, handles: rendered.handles.geometry};
    if (!ORIGIN_CENTERED.has(name) || baseGeometry.type !== 'Point') return asIs;

    const center = toMercator(baseGeometry.coordinates as [number, number]);
    const rotation = ((rotationDegrees ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    /*
     * **Placed in projected metres, not in degrees.**
     *
     * The generator builds these three around `[0, 0]`, so their offsets are degrees at
     * the equator — where a degree of longitude and a degree of latitude are the same
     * distance and a projected metre is a real one. Adding those degrees to the target
     * point pasted an equator-shaped symbol onto a stretched parallel: at 60 degrees
     * north the arms held their width and the symbol grew to **1.93x** its height, so a
     * screen it drew as a 410 x 29 px bracket on the equator came out 410 x 56. Converting
     * the offset to metres and adding it in the projected frame is what OpenLayers'
     * holder does, and it is what keeps the symbol the same shape and size anywhere.
     */
    const place = (offset: Position): Position => {
        const [xDegrees, yDegrees] = offset;
        const x = xDegrees * EQUATOR_METERS_PER_DEGREE;
        const y = yDegrees * EQUATOR_METERS_PER_DEGREE;
        return toLonLat([center[0] + x * cos - y * sin, center[1] + x * sin + y * cos]);
    };

    return {
        graphic: mapGeometryPositions(asIs.graphic, place),
        labels: mapGeometryPositions(asIs.labels, place),
        handles: mapGeometryPositions(asIs.handles, place),
    };
}

/**
 * Metres per degree on the equator, where these symbols are generated and where a
 * projected metre is a ground metre. @see placeOriginCentered
 */
const EQUATOR_METERS_PER_DEGREE = (6378137 * Math.PI) / 180;

/** @see placeOriginCentered */
const ORIGIN_CENTERED = new Set<TacticalGraphicName>([
    TacticalGraphicName.Cover,
    TacticalGraphicName.Guard,
    TacticalGraphicName.Screen,
]);

/** Applies `move` to every position of a GeoJSON geometry, keeping its shape. */
function mapGeometryPositions(
    geometry: GeoJSONFeature['geometry'],
    move: (position: Position) => Position,
): GeoJSONFeature['geometry'] {
    const walk = (node: unknown): unknown => {
        if (!Array.isArray(node) || !node.length) return node;
        if (typeof node[0] === 'number') return move(node as Position);
        return node.map(walk);
    };
    if (geometry.type === 'GeometryCollection') {
        return {...geometry, geometries: geometry.geometries.map(g => mapGeometryPositions(g, move))};
    }
    return {...geometry, coordinates: walk(geometry.coordinates)} as GeoJSONFeature['geometry'];
}

/** The band data `rangeFanLabelPaint` walks. @see resolveRangeFanBands */
function rangeFanFields(name: TacticalGraphicName, props: TacticalGraphicProperties) {
    const {shape, bands} = resolveRangeFanBands(name, toGraphicOptions(props));
    return {rangeFanShape: shape, rangeFanBands: bands};
}

/**
 * The perpendicular size of a ratio-locked graphic: a fixed fraction of its own
 * base length, measured end to end.
 *
 * **After the caller's properties, like the security operations and for the same
 * reason.** Being ratio-locked *is* the rule that a caller does not choose the
 * aspect ratio — the OpenLayers holder recomputes this on every geometry change and
 * refuses the width drag outright — so a `radius` arriving from a snapshot or a
 * sweep does not get to override it.
 *
 * Measured in projected meters end to end, which is what the OpenLayers holder
 * measures. Both `radius` and `decorationSize` are set: the first is what
 * `toGraphicOptions` turns into the generator's `size`, the second is what the
 * holder stamps, so a graphic handed between the engines carries the same number.
 */
function ratioLockedSize(
    name: TacticalGraphicName,
    baseGeometry: GeoJSONFeature['geometry'],
): Partial<TacticalGraphicProperties> {
    const ratio = ratioLockOf(name);
    if (ratio === undefined) return {};

    const projected = projectGeometry(baseGeometry);
    const positions: ProjectedPosition[] = [];
    if (projected) {
        for (const member of paintGeometryMembers(projected)) positions.push(...paintGeometryPositions(member));
    }
    if (positions.length < 2) return {};

    const first = positions[0];
    const last = positions[positions.length - 1];
    const length = Math.hypot(last[0] - first[0], last[1] - first[1]);
    if (!(length > 0)) return {};

    const size = length * ratio;
    return {radius: size, decorationSize: size};
}

/**
 * The size a security operation is drawn at, in meters.
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

/**
 * **Gone, and deliberately not replaced.** This used to overwrite the caller's `radius`
 * for all four crossed mission tasks, correctly, while all four were fixed-size badges
 * pinned to a screen constant.
 *
 * They all carry a real size as of 2026-08-17, and the override is why unpinning them did
 * not work the first time: the paint, the controller, the handles and the gesture table
 * were all changed and the symbols still came out the same width, because the number was
 * replaced on the way in. **The size was stored, the handle moved, and nothing looked
 * wrong at the zoom the graphic was placed at.** When a graphic's category changes, hunt
 * for the code that *overwrites* a property, not the code that reads it — a reader that
 * ignores a value at least leaves it visible in the data.
 *
 * `CROSSED_MISSION_TASK_PX` and `crossedMissionTaskMeters` stay exported: they shipped in
 * 2.0.0 and removing them is a consumer's breaking change, not a tidy-up.
 * @see dropSizePx, which is what a renderer should ask now.
 */

/** @see securityOperationSize */
const SECURITY_OPERATIONS = new Set<TacticalGraphicName>([
    TacticalGraphicName.Cover,
    TacticalGraphicName.Guard,
    TacticalGraphicName.Screen,
]);

/**
 * A base's drawn length in meters.
 *
 * A local equirectangular approximation rather than turf: this runs on every build
 * and the answer only has to be the right order of magnitude. The cosine keeps a
 * north-south and an east-west drag of the same *distance* measuring the same.
 */
function baseLengthMeters(geometry: GeoJSONFeature['geometry']): number {
    const positions: number[][] = [];
    const walk = (node: unknown): void => {
        if (!Array.isArray(node) || !node.length) return;
        if (typeof node[0] === 'number') positions.push(node as number[]);
        else node.forEach(walk);
    };
    walk((geometry as {coordinates?: unknown}).coordinates);
    if (positions.length < 2) return 0;

    const METERS_PER_DEGREE = 111_319;
    let length = 0;
    for (let i = 0; i < positions.length - 1; i++) {
        const [x1, y1] = positions[i];
        const [x2, y2] = positions[i + 1];
        const dx = (x2 - x1) * Math.cos((((y1 + y2) / 2) * Math.PI) / 180);
        length += Math.hypot(dx, y2 - y1) * METERS_PER_DEGREE;
    }
    return length;
}

/**
 * `normalizeDrawnBase` applied to a geometry, leaving anything that is not a
 * LineString exactly as it arrived.
 *
 * The guard is the point: a polygon's ring closes by repeating its first vertex, and a
 * Point has a bare coordinate pair rather than a list, so neither is something to tidy.
 */
function withNormalizedBase(name: TacticalGraphicName, geometry: GeoJSONFeature['geometry']): GeoJSONFeature['geometry'] {
    if (geometry.type !== 'LineString') return geometry;
    const coordinates = normalizeDrawnBase(name, geometry.coordinates);
    return coordinates === geometry.coordinates ? geometry : {...geometry, coordinates};
}

/**
 * The latitude a base sits at, for sizing anything specified in screen pixels.
 *
 * The first coordinate rather than a centroid: it is defined for every geometry this
 * takes — point, line, ring — and a graphic is never long enough for the difference to
 * show against a factor that changes by 1% per degree.
 */
/** A polygon base's outer ring in lon/lat, or undefined for anything else. */
function ringOf(geometry: GeoJSONFeature['geometry']): [number, number][] | undefined {
    return geometry.type === 'Polygon' ? (geometry.coordinates[0] as [number, number][]) : undefined;
}

function latitudeOf(geometry: GeoJSONFeature['geometry']): number {
    let found: number | undefined;
    const walk = (node: unknown): void => {
        if (found !== undefined || !Array.isArray(node) || !node.length) return;
        if (typeof node[0] === 'number') found = (node as number[])[1];
        else node.forEach(walk);
    };
    walk((geometry as {coordinates?: unknown}).coordinates);
    return found ?? 0;
}

export function buildTacticalGraphic(
    name: TacticalGraphicName,
    baseGeometry: GeoJSONFeature['geometry'],
    properties: Omit<TacticalGraphicProperties, 'name'> = {},
    drawingResolution?: number,
): MapLibreTacticalGraphic | undefined {
    // **Every graphic this engine builds comes through here** — drawn, restored,
    // imported, or built by the sample sweep — so the base is tidied once, at the door,
    // rather than in each of those paths.
    //
    // The sweep is why this is not in the draw handler. A drawn fields-of-fire was
    // normalized there and came out editable; the sweep builds its base directly from a
    // candidate geometry, got the two-point version, and produced a graphic whose second
    // leg was synthesized on every render and whose V therefore could not be opened. Same
    // symbol, same engine, editable or not depending on which door it came through.
    //
    // Restore and import get the repair too, which upgrades a fields-of-fire saved before
    // this: the shape does not move — `normalizeDrawnBase` calls the very function the
    // renderer would have called — it just gains the handle it was missing.
    baseGeometry = withNormalizedBase(name, baseGeometry);

    // **The resolution these screen sizes are spent at, corrected for where the graphic
    // is.** A pixel constant times the raw resolution is a *projected* length, and every
    // decoration, badge and default width derived that way came out 1/cos(latitude) too
    // big — twice the size at 60 degrees north. The raw value still travels as
    // `drawingResolution`, because the label scale is anchored to the zoom itself and is
    // not a distance at all. @see screenMeters
    const sizingResolution = drawingResolution === undefined
        ? undefined
        : groundLength(drawingResolution, latitudeOf(baseGeometry));

    const props: TacticalGraphicProperties = {
        name,
        // The arc mission tasks are asked for **no** gap: their two arcs run right up
        // to the label axis and `arcMissionTaskPaint` takes back exactly what the
        // rendered glyph needs. A fixed angular gap cannot track a capped label scale.
        ...(getPaintFunction(name)?.label ? {labelGapDegrees: 0} : {}),
        ...sizeDefaults(name, baseGeometry, properties, sizingResolution),
        ...arrowheadDefault(name, properties, sizingResolution),
        // The paint layer measures the letter and cuts its own hole, so the geometry
        // must arrive unbroken. @see GLYPH_CUT_GAP_GRAPHICS
        ...(GLYPH_CUT_GAP_GRAPHICS.includes(name) && properties.labelGap === undefined ? {labelGap: 0} : {}),
        ...properties,
        // **After** the caller's properties, unlike every other default here. A
        // security operation's size is not a ground distance a caller may set — it is
        // a screen constant, and these graphics refuse a resize for exactly that
        // reason. A `radius` arriving from a saved snapshot or a sweep is a number in
        // meters from some other zoom, and honoring it draws the symbol at the wrong
        // size. @see allowedGestures
        // **The raw resolution, unlike everything else here.** These three are placed in
        // projected metres rather than walked out geodesically — @see placeOriginCentered
        // — so their pixel size is already latitude-invariant and correcting it would
        // shrink them by cos(latitude) instead.
        ...securityOperationSize(name, drawingResolution),
        ...bakedDecorationSize(name, properties, sizingResolution),
        // Also after the caller's properties: a ratio-locked graphic's size is not a
        // size the caller may set. @see ratioLockedSize
        ...ratioLockedSize(name, baseGeometry),
        /*
         * **A rectangle's width is what its own ring measures.**
         *
         * APP-06 defines these as "two anchor points and a width, defined in metres", and
         * the user draws the box — so the shape is the input and the amplifier describes
         * it. It was derived only *during a drag*, so a freshly drawn zone carried the
         * generic 20 px default instead: a box drawn 160 px tall at zoom 6 reported 98 km
         * where OpenLayers reported 391. Doing it here rather than in the draw handler
         * covers every door — drawn, restored, imported, swept — the same argument
         * `withNormalizedBase` makes at the top of this function.
         */
        ...rectangleAmplifiers(name, ringOf(baseGeometry)),
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

    // The security operations come back **centered on the origin**: their generator
    // builds every arm from `[0, 0]` and never reads the base point, so all three
    // stacked at lon/lat 0 in this renderer while their center icons sat where the
    // user clicked. OpenLayers has always placed them itself, in its holder; this is
    // the same step, and the same arithmetic. @see placeOriginCentered
    const placed = placeOriginCentered(name, rendered, baseGeometry, props.rotation);

    const graphicGeometry = projectGeometry(placed.graphic);
    if (!graphicGeometry) return undefined;

    const labelGeometry = projectGeometry(placed.labels);
    const center = projectGeometry(baseGeometry);

    // The projected center cannot be recovered from the drawn geometry: the
    // generator walks out geodesically and Mercator does not preserve a midpoint.
    // Same reasoning as `MissionTaskGraphicBase.updateGeometry`, which stamps it.
    const graphicCenter = center?.type === 'Point' ? center.coordinates : undefined;
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
        // The base first — an area the operator traced *is* its own outline — then the
        // rendered shape, which is where a circular variant's outline comes from, since its
        // base is a single point. @see outerRingOf
        ring: outerRingOf(projectGeometry(baseGeometry)) ?? outerRingOf(graphicGeometry),
        // A range fan's bands reach the generator and come back as anonymous points,
        // so the label paint has to re-resolve them with the generator's own
        // defaults. `RangeFanGraphicBase` does the same call. @see resolveRangeFanBands
        ...(RANGE_FANS.includes(name) ? rangeFanFields(name, props) : {}),
    };

    return {
        id: `mlb-${nextId++}`,
        name,
        properties: props,
        base,
        graphic: {geometry: graphicGeometry, ...shared},
        labels: labelGeometry ? {geometry: labelGeometry, ...shared} : undefined,
        // **`placed`, not `rendered`.** The security operations are generated centered
        // on the origin and moved onto their base here; taking the handles from the
        // raw output left all three graphics' handles at null island, so the symbol
        // drew in the right place and could not be grabbed at all.
        handles: handlePositions(placed.handles),
    };
}

/** The outer ring of a polygon base, for the irregular zones' vertex anchor. */
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
 * Returns an empty list for a graphic with no paint function rather than throwing or
 * drawing a placeholder. That is now the rare case — 215 of the 216 registered names
 * are paintable — but it is still the honest response, and `isPaintable` is how a
 * caller finds out in advance.
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
