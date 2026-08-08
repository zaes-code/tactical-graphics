import type {Feature, FeatureCollection, Geometry} from 'geojson';
import type {LayerSpecification} from 'maplibre-gl';
import {mapPaintGeometry, type Paint, type ProjectedGeometry} from '@zaes/tactical-graphics';
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

/** A paint's marks, split by which MapLibre layer type can draw them. */
export interface LayerBuckets {
    lines: Map<string, Feature[]>;
    fills: Feature[];
    circles: Feature[];
    symbols: Feature[];
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

/** Splits a paint list into per-layer-type GeoJSON features. */
export function bucketPaints(paints: Paint[]): LayerBuckets {
    const buckets: LayerBuckets = {lines: new Map(), fills: [], circles: [], symbols: []};

    for (const paint of paints) {
        const {geometry, stroke, fill, text, circle} = paint;

        if (stroke) {
            const key = dashKey(stroke.dashPx, stroke.widthPx);
            const list = buckets.lines.get(key) ?? [];
            list.push({
                type: 'Feature',
                geometry: toGeoJson(geometry),
                properties: {color: stroke.color, width: stroke.widthPx},
            });
            buckets.lines.set(key, list);
        }

        if (fill) {
            buckets.fills.push({
                type: 'Feature',
                geometry: toGeoJson(geometry),
                properties: {color: fill.color},
            });
        }

        if (circle) {
            buckets.circles.push({
                type: 'Feature',
                geometry: toGeoJson(geometry),
                properties: {
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
                    label: text.text,
                    size,
                    // Radians counter-clockwise → degrees clockwise. MapLibre's
                    // `text-rotate` turns the glyph about its anchor, which is what the
                    // paint list means, so only the units and sign differ.
                    rotate: ((text.rotation ?? 0) * 180) / Math.PI,
                    color: text.fill,
                    haloColor: text.halo?.color ?? 'transparent',
                    haloWidth: text.halo?.widthPx ?? 0,
                    anchor: textAnchor(text.align, text.baseline),
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
export function lineLayer(id: string, source: string, dashPx: number[] | undefined): LayerSpecification {
    return {
        id,
        type: 'line',
        source,
        layout: {'line-cap': 'round', 'line-join': 'round'},
        paint: {
            'line-color': ['get', 'color'],
            'line-width': ['get', 'width'],
            ...(dashPx && dashPx.length ? {'line-dasharray': dashPx} : {}),
        },
    } as LayerSpecification;
}

export function fillLayer(id: string, source: string): LayerSpecification {
    return {
        id,
        type: 'fill',
        source,
        paint: {'fill-color': ['get', 'color']},
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
        },
        paint: {
            'text-color': ['get', 'color'],
            'text-halo-color': ['get', 'haloColor'],
            'text-halo-width': ['get', 'haloWidth'],
        },
    } as LayerSpecification;
}
