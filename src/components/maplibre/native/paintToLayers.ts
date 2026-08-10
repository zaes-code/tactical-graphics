import {HALO_WIDTH} from '@zaes/tactical-graphics';
import type {Feature, FeatureCollection, Geometry} from 'geojson';
import type {LayerSpecification} from 'maplibre-gl';
import {mapPaintGeometry, type HatchSpec, type Paint, type ProjectedGeometry, type ProjectedPosition} from '@zaes/tactical-graphics';
import {toLonLat} from '../projection';

/**
 * # Path B — a paint list as native MapLibre sources and layers
 *
 * The declarative consumer. Where `../canvas/paintToCanvas.ts` draws each mark,
 * this turns each mark into a GeoJSON feature and lets MapLibre's own `line`,
 * `fill`, `circle` and `symbol` layers render it on the GPU.
 *
 * That buys what an overlay cannot: GPU labelling, label collision, and
 * everything MapLibre already does well. What it costs is recorded here, because
 * every item is a constraint the OpenLayers style layer does not have and a
 * finished renderer would have to live inside.
 *
 * ## Four things MapLibre cannot express per feature
 *
 * 1. **`line-dasharray` is not data-driven.** It is a paint property that takes a
 *    constant, so two graphics with different dash patterns cannot share a layer.
 *    Layers are therefore keyed by dash signature and created on demand — fine for
 *    the handful of patterns this library uses, and it means layer count grows
 *    with the *variety* of styling rather than with the number of graphics.
 * 2. **Dash units are line-widths, not pixels.** `[10, 8]` in MapLibre means ten
 *    line-widths on, eight off. Every dash in this repo is specified in screen
 *    pixels, so it is divided through by the stroke width on the way in — and any
 *    later change to `LINE_WIDTH` silently rescales every dash unless that
 *    division is redone.
 * 3. **`text-offset` is in ems, not pixels.** An 8 px gap has to be divided by the
 *    rendered font size, which means the offset has to be recomputed whenever the
 *    label scale changes. In the imperative renderer it is just 8.
 * 4. **`text-rotate` is degrees, clockwise, and does not participate in the
 *    upright flip.** The flip has to happen before the value is handed over, which
 *    is fine — but it means the paint function's radians are converted here rather
 *    than being a value MapLibre understands.
 *
 * ## And one it cannot do at all
 *
 * **Geometry is fixed once it is in the source.** MapLibre has no hook that
 * synthesises geometry per frame, so an obstacle line's teeth have to be *realised
 * into the GeoJSON* at the current resolution, and re-realised whenever the zoom
 * changes. That is not a styling difference, it is a different rendering model —
 * and it is the cost `NativeLayerRenderer` exists to measure.
 */

/**
 * The editor's own marks: drag handles and the vertices of a drawing in progress.
 *
 * Deliberately not part of a graphic's paint list. A handle is editor chrome — it
 * says "you can drag this" — so it is not symbology, it must not take the
 * affiliation colour, and it has to sit above every graphic rather than in draw
 * order among them. @see createHandleFeature, which makes the same argument on the
 * OpenLayers side.
 */
export interface EditorMarks {
    /** Draggable handles, in projected metres. */
    handles: ProjectedPosition[];
    /** Handles that show but refuse a drag — the inert centre dot. */
    inertHandles: ProjectedPosition[];
    /** The line being drawn, if a draw is in progress. */
    sketch?: ProjectedPosition[];
}

/** A paint's marks, split by which MapLibre layer type can draw them. */
export interface LayerBuckets {
    lines: Map<string, Feature[]>;
    fills: Feature[];
    circles: Feature[];
    symbols: Feature[];
    /** Hatch images this list needs registered, by id. @see renderHatchImage */
    hatches: Map<string, HatchSpec>;
}

/** EPSG:3857 → lon/lat, for a geometry on its way into a MapLibre source. */
function toGeoJson(geometry: ProjectedGeometry): Geometry {
    return mapPaintGeometry(geometry, toLonLat) as unknown as Geometry;
}

/**
 * The dash signature a line mark's layer is keyed by.
 *
 * Includes the width, because the dash array is expressed in line-widths: the
 * same pixel dash at two stroke widths needs two different arrays, so it needs
 * two layers.
 */
function dashKey(dashPx: number[] | undefined, widthPx: number): string {
    if (!dashPx || !dashPx.length) return 'solid';
    return `${dashPx.map(d => (d / widthPx).toFixed(3)).join(',')}@${widthPx}`;
}

/** Anchor names MapLibre uses, from the paint list's align/baseline pair. */
function textAnchor(align: string | undefined, baseline: string | undefined): string {
    const vertical = baseline === 'top' || baseline === 'hanging' ? 'top'
        : baseline === 'bottom' || baseline === 'alphabetic' ? 'bottom'
            : 'center';
    const horizontal = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
    if (vertical === 'center' && horizontal === 'center') return 'center';
    if (vertical === 'center') return horizontal;
    if (horizontal === 'center') return vertical;
    return `${vertical}-${horizontal}`;
}

/** The rendered px size of a font shorthand, times the mark's scale. */
function renderedFontPx(font: string, scale: number): number {
    const match = font.match(/(\d*\.?\d+)px/);
    return (match ? parseFloat(match[1]) : 16) * scale;
}

/**
 * A stable id for a hatch, used both as the MapLibre image name and as the
 * property a `fill-pattern` expression reads.
 *
 * Derived from the spec's own values so two areas asking for the same hatch share
 * one registered image, and two asking for different ones do not collide.
 */
export function hatchImageId(spec: HatchSpec): string {
    return `tg-hatch-${spec.kind}-${spec.color}-${spec.sizePx}-${spec.lineWidthPx}`.replace(/[^a-z0-9-]/gi, '_');
}

/**
 * Rasterises a hatch to RGBA bytes for `map.addImage`.
 *
 * MapLibre has no pattern primitive — a `fill-pattern` names an image in the
 * style's sprite or one added at runtime — so the hatch this library describes as
 * four parameters has to become actual pixels here. That is the whole difference
 * between the two renderers on this feature: a canvas takes a `CanvasPattern`
 * directly, MapLibre needs the tile drawn and uploaded first.
 */
export function renderHatchImage(spec: HatchSpec): ImageData | null {
    const canvas = document.createElement('canvas');
    canvas.width = spec.sizePx;
    canvas.height = spec.sizePx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.strokeStyle = spec.color;
    ctx.lineWidth = spec.lineWidthPx;
    ctx.beginPath();
    ctx.moveTo(0, spec.sizePx);
    ctx.lineTo(spec.sizePx, 0);
    ctx.stroke();

    return ctx.getImageData(0, 0, spec.sizePx, spec.sizePx);
}

/**
 * The property every emitted feature carries, naming the graphic it belongs to.
 *
 * Hit-testing is the reason: `queryRenderedFeatures` hands back the *marks* under
 * the cursor — a tooth, an arrowhead, a letter — and nothing about a mark says
 * which graphic drew it. Stamped on every feature of every layer so a click
 * anywhere on a symbol finds it, rather than only on whichever piece happened to
 * be the outline.
 */
export const GRAPHIC_ID_PROPERTY = 'tgId';

/**
 * Splits a paint list into per-layer-type GeoJSON features.
 *
 * `graphicId`, when given, is stamped on every feature so a rendered mark can be
 * traced back to its graphic. @see GRAPHIC_ID_PROPERTY
 */
export function emptyBuckets(): LayerBuckets {
    return {lines: new Map(), fills: [], circles: [], symbols: [], hatches: new Map()};
}

export function bucketPaints(paints: Paint[], graphicId?: string): LayerBuckets {
    return bucketPaintsInto(emptyBuckets(), paints, graphicId);
}

/**
 * Adds a paint list's marks to an existing bucket set.
 *
 * The accumulating form exists for the per-graphic pass: every feature has to be
 * stamped with the id of the graphic that produced it, which means calling this
 * once per graphic — and a version that allocated its own buckets each time made
 * 215 Maps and 645 arrays per frame, then merged them. At gallery scale that
 * *was* the frame: 24.8 ms of a 27.2 ms realisation.
 */
export function bucketPaintsInto(buckets: LayerBuckets, paints: Paint[], graphicId?: string): LayerBuckets {
    for (const paint of paints) {
        const {geometry, stroke, fill, text, circle} = paint;
        const owner = graphicId === undefined ? {} : {[GRAPHIC_ID_PROPERTY]: graphicId};

        if (stroke) {
            const key = dashKey(stroke.dashPx, stroke.widthPx);
            const list = buckets.lines.get(key) ?? [];
            list.push({
                type: 'Feature',
                geometry: toGeoJson(geometry),
                properties: {...owner, color: stroke.color, width: stroke.widthPx},
            });
            buckets.lines.set(key, list);
        }

        if (fill) {
            buckets.fills.push({
                type: 'Feature',
                geometry: toGeoJson(geometry),
                properties: {
                    ...owner,
                    color: fill.color,
                    // Empty string, not absent: `fill-pattern` needs a value for every
                    // feature in the layer, and MapLibre treats an unknown image name
                    // as "no pattern" — which is exactly the flat-colour fallback
                    // `FillSpec` documents.
                    pattern: fill.pattern ? hatchImageId(fill.pattern) : '',
                },
            });
            if (fill.pattern) buckets.hatches.set(hatchImageId(fill.pattern), fill.pattern);
        }

        if (circle) {
            buckets.circles.push({
                type: 'Feature',
                geometry: toGeoJson(geometry),
                properties: {
                    ...owner,
                    radius: circle.radiusPx,
                    color: circle.fill?.color ?? 'transparent',
                    strokeColor: circle.stroke?.color ?? 'transparent',
                    strokeWidth: circle.stroke?.widthPx ?? 0,
                },
            });
        }

        if (text && text.text) {
            const size = renderedFontPx(text.font, text.scale ?? 1);
            buckets.symbols.push({
                type: 'Feature',
                geometry: toGeoJson(geometry),
                properties: {
                    ...owner,
                    label: text.text,
                    size,
                    // Radians counter-clockwise → degrees clockwise. MapLibre's
                    // `text-rotate` turns the glyph about its anchor, which is what the
                    // paint list means, so only the units and sign differ.
                    rotate: ((text.rotation ?? 0) * 180) / Math.PI,
                    color: text.fill,
                    haloColor: text.halo?.color ?? 'transparent',
                    haloWidth: outwardHalo(text.halo?.widthPx),
                    anchor: textAnchor(text.align, text.baseline),
                    justify: text.justify ?? text.align ?? 'center',
                    // Pixels → ems, as one array property. Divided by the rendered size,
                    // so this has to be recomputed whenever the label scale moves — see
                    // the header note. It is a single property because `text-offset`
                    // wants one expression yielding a pair, not a pair of expressions.
                    offset: [(text.offsetXPx ?? 0) / size, (text.offsetYPx ?? 0) / size],
                },
            });
        }
    }

    return buckets;
}

export function featureCollection(features: Feature[]): FeatureCollection {
    return {type: 'FeatureCollection', features};
}

/**
 * The MapLibre layer definitions the buckets are rendered through.
 *
 * Every visual property is data-driven off the feature (`['get', …]`), which is
 * what keeps the layer count proportional to the *variety* of styling rather than
 * to the number of graphics — the one place MapLibre's model is clearly better
 * than an overlay's.
 *
 * `text-font` names a stack the style's `glyphs` URL must serve. That URL is the
 * hard dependency an overlay does not have: MapLibre renders text from
 * pre-generated SDF glyph PBFs, so a deployment either self-hosts them or points
 * at someone else's server. There is no "just use the system font" option.
 */
/**
 * A dash pattern in **screen pixels** → the units MapLibre's `line-dasharray` wants.
 *
 * MapLibre scales a dash array by the line width; OpenLayers' `lineDash` is in raw
 * canvas pixels. So the same `[8, 6]` that draws an 8px dash on one engine draws a
 * 16px dash on the other at the default 2px stroke — the whole pattern comes out a
 * factor of `LINE_WIDTH()` too long, everywhere a dash appears.
 *
 * A graphic's dashes were already converted — `dashKey` divides on the way in and the
 * renderer parses the divided array back out of the layer key. **The editor's own
 * dashes were not**: `sketchLayer` takes a pixel array and a width and passed both
 * straight through, so the circle's radius read-out drew a 16px dash against
 * OpenLayers' 8px. Hence a named helper rather than a division at one call site — the
 * two paths reached the same property by different routes and only one had done the
 * arithmetic.
 */
export function dashInWidths(dashPx: readonly number[], widthPx: number): number[] {
    if (!(widthPx > 0)) return [...dashPx];
    return dashPx.map(segment => segment / widthPx);
}

export function lineLayer(id: string, source: string, dashPx: number[] | undefined): LayerSpecification {
    return {
        id,
        type: 'line',
        source,
        layout: {'line-cap': 'round', 'line-join': 'round'},
        paint: {
            'line-color': ['get', 'color'],
            'line-width': ['get', 'width'],
            // Already in line-widths: the layer key carries the divided array and the
            // renderer parses it back out of that key. @see dashKey, dashInWidths
            ...(dashPx && dashPx.length ? {'line-dasharray': dashPx} : {}),
        },
    } as LayerSpecification;
}

/**
 * Plain fills — everything with no hatch.
 *
 * **Two layers, not one, and this is not a tidiness choice.** A single layer
 * carrying both `fill-color` and a data-driven `fill-pattern` looked like it would
 * serve both cases, on the reasoning that an empty image name would fall back to
 * the colour. It does not: MapLibre draws **nothing** for a feature whose
 * `fill-pattern` resolves to an unknown image, and the `fill-color` beside it is
 * ignored entirely.
 *
 * So every solid fill in this renderer was invisible — the ferry crossing's
 * arrowheads, fix, turn, the aviation direction of attack, area defence's teeth,
 * exploitation. Each still drew its *outline*, from the stroke on the same mark,
 * which is what made it look like a thin-line rendering choice rather than a
 * missing fill.
 *
 * Filtering on the property instead gives each case its own layer and neither can
 * silently swallow the other.
 */
export function fillLayer(id: string, source: string): LayerSpecification {
    return {
        id,
        type: 'fill',
        source,
        filter: ['==', ['get', 'pattern'], ''],
        paint: {'fill-color': ['get', 'color']},
    } as LayerSpecification;
}

/** Hatched fills. @see fillLayer for why these are separate. */
export function patternFillLayer(id: string, source: string): LayerSpecification {
    return {
        id,
        type: 'fill',
        source,
        filter: ['!=', ['get', 'pattern'], ''],
        paint: {
            'fill-pattern': ['get', 'pattern'],
            // Kept as the documented degradation for a pattern that fails to
            // rasterise — a flat wash is wrong-looking, invisible is worse.
            'fill-color': ['get', 'color'],
        },
    } as LayerSpecification;
}

export function circleLayer(id: string, source: string): LayerSpecification {
    return {
        id,
        type: 'circle',
        source,
        paint: {
            'circle-radius': ['get', 'radius'],
            'circle-color': ['get', 'color'],
            'circle-stroke-color': ['get', 'strokeColor'],
            'circle-stroke-width': ['get', 'strokeWidth'],
        },
    } as LayerSpecification;
}

export function symbolLayer(id: string, source: string, fontStack: string): LayerSpecification {
    return {
        id,
        type: 'symbol',
        source,
        layout: {
            'text-field': ['get', 'label'],
            'text-font': [fontStack],
            'text-size': ['get', 'size'],
            'text-rotate': ['get', 'rotate'],
            'text-anchor': ['get', 'anchor'],
            // Independent of the anchor in MapLibre, and centre by default. @see TextSpec.justify
            'text-justify': ['get', 'justify'],
            // `['array', 'number', 2, …]` asserts the shape: `get` returns untyped
            // JSON, and `text-offset` will not accept it without the assertion.
            'text-offset': ['array', 'number', 2, ['get', 'offset']],
            // The paint functions place labels deliberately — in a gap cut for them,
            // or at a measured standoff from a line. Letting MapLibre drop one for
            // colliding would silently delete a doctrinal amplifier, so both the
            // collision box and the overlap rule are switched off. That discards the
            // main advantage of GPU labelling, which is worth saying out loud.
            'text-allow-overlap': true,
            'text-ignore-placement': true,
            'text-rotation-alignment': 'viewport',
            // **No automatic wrapping.** MapLibre breaks a label at 10 ems by default;
            // OpenLayers never breaks one. A designation joined to its date-time group
            // — "A1     011200ZJUL26 - 012359ZJUL26" — is comfortably past that, so
            // MapLibre stacked it over three lines while OpenLayers drew one, and the
            // whole axis-of-advance family measured two to three times the ink at a
            // close zoom. Labels that *are* multi-line say so with a newline, and an
            // explicit break is honoured whatever this is set to.
            'text-max-width': NO_WRAP_EMS,
        },
        paint: {
            'text-color': ['get', 'color'],
            'text-halo-color': ['get', 'haloColor'],
            'text-halo-width': ['get', 'haloWidth'],
        },
    } as LayerSpecification;
}

/**
 * Folds per-graphic buckets into one set, preserving dash-key grouping.
 *
 * Bucketing per graphic is what lets each feature carry its owner's id; merging
 * afterwards is what keeps the layer count fixed. Doing it the other way round —
 * one layer per graphic — would put 200-plus layers in the style, and MapLibre
 * pays per layer on every frame.
 */
export function mergeBuckets(all: LayerBuckets[]): LayerBuckets {
    const merged: LayerBuckets = {lines: new Map(), fills: [], circles: [], symbols: [], hatches: new Map()};

    for (const bucket of all) {
        for (const [key, list] of Array.from(bucket.lines)) {
            const existing = merged.lines.get(key);
            if (existing) existing.push(...list);
            else merged.lines.set(key, list.slice());
        }
        merged.fills.push(...bucket.fills);
        merged.circles.push(...bucket.circles);
        merged.symbols.push(...bucket.symbols);
        for (const [id, spec] of Array.from(bucket.hatches)) merged.hatches.set(id, spec);
    }

    return merged;
}

/**
 * The editor's handle layer — always the same colour, never the affiliation's.
 *
 * A handle is chrome: it says "you can drag this", and that meaning must not change
 * with a graphic's standard identity. Tinting them also made a hostile graphic's
 * handles the same red as its own strokes, so they stopped reading as handles.
 * @see createHandleFeature, which makes the same argument on the OpenLayers side.
 */
/**
 * The radius read-out's text, laid **along** the measure line.
 *
 * `symbol-placement: 'line'` is what OpenLayers' `placement: 'line'` does: the text
 * takes the line's own angle and stays upright relative to it as the user swings the
 * handle round, with no rotation to compute and none to keep in step.
 */
export function measureLabelLayer(id: string, source: string, fontStack: string): LayerSpecification {
    return {
        id,
        type: 'symbol',
        source,
        layout: {
            'text-field': ['get', 'label'],
            'text-font': [fontStack],
            'text-size': MEASURE_LABEL_PX,
            'symbol-placement': 'line',
            'text-offset': [0, -0.6],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
        },
        paint: {
            'text-color': ['get', 'labelColor'],
            'text-halo-color': ['get', 'haloColor'],
            'text-halo-width': MEASURE_HALO_PX,
        },
    };
}

/**
 * `text-max-width` in ems, set high enough that MapLibre never inserts a break of
 * its own. Zero would be the obvious way to say "never wrap" and is not: MapLibre
 * treats it as "break at every opportunity". @see symbolLayer
 */
const NO_WRAP_EMS = 1e4;

/** Rendered size of the read-out, matching `fontStyle`'s 16px base. */
const MEASURE_LABEL_PX = 16;
const MEASURE_HALO_PX = outwardHalo(HALO_WIDTH);

/**
 * A halo width in **MapLibre's** units, from the shared one.
 *
 * The two renderers measure it differently and the shared number is written in
 * OpenLayers' terms. OpenLayers draws a halo with `strokeText`, and a canvas stroke
 * straddles the path it follows — half inside the glyph, half outside — so a width of
 * 4 shows as 2px of halo. MapLibre's `text-halo-width` is the distance the halo
 * extends *outward*, all of it.
 *
 * Passing the number through unchanged therefore drew every label with twice the
 * halo, which is a lot of ink: eight of the air zones measured 14-16% more ink than
 * OpenLayers at close zoom on text alone, and the labels read visibly heavier
 * side by side.
 */
function outwardHalo(sharedWidth: number | undefined): number {
    return (sharedWidth ?? 0) / 2;
}

export function handleLayer(id: string, source: string): LayerSpecification {
    return {
        id,
        type: 'circle',
        source,
        paint: {
            'circle-radius': ['get', 'radius'],
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.8,
        },
    } as LayerSpecification;
}

/**
 * The marker for a vertex a drag would create — OpenLayers' Modify draws one by
 * default and it is the only thing that announces the gesture exists.
 *
 * Styled to `createEditingStyle()` exactly, because the two engines should hint the
 * same edit the same way: a radius-6 dot in OpenLayers' editing blue with a 1.5px
 * white ring. Deliberately **not** the configured handle colour — this is not a handle
 * that exists, it is an offer to make one, and OpenLayers distinguishes them the same
 * way.
 */
export function vertexHintLayer(id: string, source: string): LayerSpecification {
    return {
        id,
        type: 'circle',
        source,
        paint: {
            'circle-radius': 6,
            'circle-color': 'rgba(0, 153, 255, 1)',
            'circle-stroke-color': 'rgba(255, 255, 255, 1)',
            'circle-stroke-width': 1.5,
        },
    } as LayerSpecification;
}

/** The line being drawn — dashed, because a sketch is not a graphic yet. */
export function sketchLayer(id: string, source: string, dashPx: number[], widthPx: number): LayerSpecification {
    return {
        id,
        type: 'line',
        source,
        layout: {'line-cap': 'round', 'line-join': 'round'},
        paint: {
            'line-color': ['get', 'color'],
            'line-width': widthPx,
            'line-dasharray': dashInWidths(dashPx, widthPx),
        },
    } as LayerSpecification;
}

/**
 * The centre-symbol layer.
 *
 * `icon-allow-overlap` is on because this symbol *is* the graphic's centre: MapLibre's
 * default collision behaviour would drop it whenever a label happened to sit nearby,
 * which reads as the symbol being missing rather than as decluttering.
 */
export function iconLayer(id: string, source: string): LayerSpecification {
    return {
        id,
        type: 'symbol',
        source,
        layout: {
            'icon-image': ['get', 'icon'],
            'icon-size': ['get', 'scale'],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
        },
    } as LayerSpecification;
}
