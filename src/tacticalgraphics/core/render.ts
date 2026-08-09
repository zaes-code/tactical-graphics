/**
 * The public, map-agnostic entry point for the tactical graphics library.
 *
 * A tactical graphic is described entirely by a plain GeoJSON Feature whose
 * `properties.tacticalGraphic` object names the graphic and carries its
 * amplifiers:
 *
 * ```json
 * {
 *   "type": "Feature",
 *   "geometry": {"type": "LineString", "coordinates": [[-77.0, 38.9], [-76.9, 39.0]]},
 *   "properties": {
 *     "tacticalGraphic": {"name": "MainAxisOfAdvance", "label": "1-508 IN"}
 *   }
 * }
 * ```
 *
 * `renderTacticalGraphic()` turns that into the rendered geometry (GeoJSON in,
 * GeoJSON out). Nothing here knows about any specific map renderer — feed the
 * output to whichever renderer you use.
 */

import {Feature, FeatureCollection, GeoJsonProperties} from 'geojson';
import {TacticalGraphicsRegistry} from './TacticalGraphicsRegistry';
import {
    GraphicOptions,
    RangeFanConfig,
    RouteDirection,
    TacticalGraphicConfidence,
    TacticalGraphicEchelon,
    TacticalGraphicHostility,
    TacticalGraphicName,
    TacticalGraphicStatus,
} from './type';

/** The reserved key under `feature.properties` that holds a graphic's config. */
export const TACTICAL_GRAPHIC_KEY = 'tacticalGraphic' as const;

/**
 * Everything the library needs to draw one tactical graphic, stored under
 * `feature.properties.tacticalGraphic`. Only `name` is required; every graphic
 * ignores the fields that don't apply to it.
 */
export interface TacticalGraphicProperties {
    /** Which graphic to draw. The single required field. */
    name: TacticalGraphicName;

    // ── Amplifiers (text shown on the graphic) ──────────────────────────────
    /** Primary free-text designation, e.g. "1-508 IN". */
    label?: string;
    /** Secondary designation, rendered beneath the primary on some graphics. */
    secondId?: string;
    countryCode?: string;
    secondCountryCode?: string;
    /** Date-time group, formatted by the caller. */
    startDate?: string;
    endDate?: string;
    minAltitude?: string;
    maxAltitude?: string;

    eff?: string;
    grid?: string;
    /** Weapon designation. Today only FinalProtectiveFire renders this. */
    weapon?: string;

    // ── Symbology (affects colour and dash pattern) ─────────────────────────
    hostility?: TacticalGraphicHostility;
    status?: TacticalGraphicStatus;
    confidence?: TacticalGraphicConfidence;
    echelon?: TacticalGraphicEchelon;
    direction?: RouteDirection;

    // ── Geometry inputs ────────────────────────────────────────────────────
    /**
     * Radius in **metres**: how far the symbol reaches from its own centre. The circle
     * radius for the arc mission tasks and circular areas, and the half-length of a
     * point-anchored arrow. Defaults are applied per graphic when omitted.
     *
     * Only for graphics that *have* a centre. A line graphic's arrowhead or teeth are
     * sized by `decorationSize`, which is a different quantity that was briefly and
     * wrongly folded in here.
     */
    radius?: number;
    /**
     * How large to draw the decorations a line graphic carries — an arrowhead's barb
     * length, a passage lane's teeth, the offset of a bridge's labels.
     *
     * Separate from `radius` because it is not a reach from anywhere:
     * `DirectionOfSupportingAttack` is a MultiLineString of the drawn line plus an
     * arrowhead, and there is no centre to take a radius of. The two were briefly one
     * field, which made `radius` mean two unrelated things depending on the graphic.
     *
     * **Caveat, see `ai/decisions.md`:** the generators that read this still consume it as
     * metres per *screen pixel* and multiply by a pixel count of their own, so a value in
     * metres comes out ~20x too large. That is the open item this field's existence makes
     * findable rather than hidden inside `radius`.
     */
    decorationSize?: number;
    /**
     * **Full** width in metres, measured across a drawn line: rail to rail on an
     * axis of advance, edge to edge on a corridor. What a width-drag handle writes,
     * and what a properties dialog shows.
     *
     * Full, not half — the generators work in half-widths (the perpendicular offset
     * from the centreline), so `toGraphicOptions` halves it on the way in and the
     * holders double it on the way out. The doubling is kept inside the library
     * precisely so a consumer never has to know about it: you send the width you
     * would measure on the map.
     */
    width?: number;
    /**
     * Hangs an asymmetric graphic's hook on the other side of its drawn line.
     *
     * Portable user intent, not renderer state: a Cesium view needs it to draw the same
     * symbol. Expressed relative to the line's own bearing, so it survives rotation —
     * see `GeometryService.getCaneArrow` for the compass-pinned version this replaced.
     */
    mirrored?: boolean;
    /** Rotation in degrees, for point-based graphics. */
    rotation?: number;
    /**
     * Depth of a bowed graphic's curve, as a signed multiple of `size`. Only
     * Turn reads it: larger bends the turn more sharply, negative bends it the
     * other way. Unitless on purpose — it survives a resize.
     */
    bend?: number;
    /**
     * Half the gap left in the circle for the label, in **degrees of arc**. Only
     * the arc-and-arrowhead mission tasks read it — Secure, Isolate, Retain,
     * Occupy, Control, Contain, Cordon and Search, Area Defense. Omit it for the
     * doctrinal 15°; pass 0 if you intend to cut the gap yourself from the label
     * as you render it, which is what this library's OpenLayers layer does.
     */
    labelGapDegrees?: number;
    /**
     * Half the gap left in a bowed curve for its designation, in **metres**. Turn
     * and the tactical turn are the only readers.
     *
     * The metres twin of `labelGapDegrees`, and it exists for the same reason: pass
     * 0 when the renderer cuts the gap itself from the rendered glyph, which both of
     * this library's renderers do. Omitting it leaves the generator's fallback of
     * `0.16 * size` — right for a consumer taking the raw GeoJSON, wrong on top of a
     * glyph-measured cut, where the two gaps add up. That is what it did: a
     * `labelGap` the OpenLayers holder passed as a generator argument had no
     * portable form, so MapLibre got the fallback and cut a hole three times too
     * wide around the same "T".
     */
    labelGap?: number;
    /** Multi-band range fan config. Only the two range fan graphics read this. */
    rangeFan?: RangeFanConfig;
}

/** Which part of a rendered graphic a feature represents. */
export type TacticalGraphicRole = 'graphic' | 'label' | 'handle' | 'base';

/** The output of {@link renderTacticalGraphic}. Every member is plain GeoJSON. */
export interface TacticalGraphicRender {
    name: TacticalGraphicName;
    /** The feature you passed in, unchanged. */
    base: Feature;
    /** The drawn symbol — usually a MultiLineString. */
    graphic: Feature;
    /** Anchor points for label text. */
    labels: Feature;
    /** Vertices an editor can expose as drag handles. */
    handles: Feature;
}

/** Thrown when a feature can't be rendered. Carries the offending graphic name. */
export class TacticalGraphicError extends Error {
    constructor(message: string, readonly graphicName?: string) {
        super(message);
        this.name = 'TacticalGraphicError';
    }
}

/** Every graphic name this build can render. */
export function listTacticalGraphicNames(): string[] {
    return TacticalGraphicsRegistry.list();
}

/** Reads a feature's tactical graphic config, or `undefined` if it has none. */
export function readTacticalGraphicProperties(feature: Feature): TacticalGraphicProperties | undefined {
    const props = feature.properties as GeoJsonProperties;
    const config = props?.[TACTICAL_GRAPHIC_KEY];
    return config && typeof config === 'object' ? (config as TacticalGraphicProperties) : undefined;
}

/** True when the feature carries a `properties.tacticalGraphic` object. */
export function isTacticalGraphicFeature(feature: Feature): boolean {
    return readTacticalGraphicProperties(feature) !== undefined;
}

/**
 * The base geometry a graphic is drawn from — `Point`, `LineString` or `Polygon`.
 *
 * What a **draw tool** needs to know before it starts collecting clicks: whether
 * this graphic wants one point, an open path, or a closed ring. Exported for that
 * reason; without it a renderer implementing draw has to keep its own table of
 * 215 names beside this one and watch the two drift.
 *
 * `undefined` for an unknown name, and for the handful of generators whose kind is
 * not in the table below — those accept any base rather than being rejected, so a
 * caller should treat `undefined` as "no constraint", not as an error.
 */
export function baseGeometryFor(name: TacticalGraphicName): 'Point' | 'LineString' | 'Polygon' | undefined {
    const generator = TacticalGraphicsRegistry.get(name);
    return generator
        ? (EXPECTED_BASE_GEOMETRY[generator.type] as 'Point' | 'LineString' | 'Polygon' | undefined)
        : undefined;
}

/**
 * The base geometry each generator kind expects. Generators that emit a
 * MultiLineString still take a LineString base (Bridge, Ford).
 */
const EXPECTED_BASE_GEOMETRY: Record<string, string> = {
    Point: 'Point',
    LineString: 'LineString',
    MultiLineString: 'LineString',
    Polygon: 'Polygon',
};

/** Maps the public property bag onto the internal generator option bag. */
function toGraphicOptions(props: TacticalGraphicProperties, overrides?: Partial<GraphicOptions>): GraphicOptions {
    // Public field -> internal generator option. The two disagree on names by design:
    // generators still speak `size` / `radius`, and renaming 200-odd call sites inside
    // them buys nothing a consumer can see. This is the one place the mapping lives.
    const options = {
        hostility: props.hostility,
        status: props.status,
        echelon: props.echelon,
        direction: props.direction,
        // Both land on the generators' `size`, which is the one slot they offer; a given
        // graphic reads it as one or the other and never sets both.
        size: props.radius ?? props.decorationSize,
        // Turn and Envelopment take their arrowhead length as a flat distance rather
        // than a fraction of `size`, so it survives a resize. It reached the generator
        // only through an OpenLayers holder override, so every other caller — a second
        // renderer, a consumer of the public API — silently got the fallback ratio and
        // a visibly smaller arrowhead. It is the same metres the holder stamps.
        headSize: props.decorationSize,
        // Public `width` is a full width; the generators' `radius` is the half-width
        // offset from the centreline. This is the only place the factor of two lives.
        radius: props.width !== undefined ? props.width / 2 : undefined,
        rotation: props.rotation,
        mirrored: props.mirrored,
        bend: props.bend,
        labelGapDegrees: props.labelGapDegrees,
        labelGap: props.labelGap,
        bands: props.rangeFan?.bands,
        centerAzimuthDeg: props.rangeFan?.centerAzimuthDeg,
    };

    // Drop undefined keys so each generator's own `opts?.x || default` still fires.
    const cleaned = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
    return {...cleaned, ...overrides} as GraphicOptions;
}

/** Stamps the graphic config and a role onto a generated feature. */
function tag(feature: Feature, props: TacticalGraphicProperties, role: TacticalGraphicRole): Feature {
    feature.properties = {
        ...(feature.properties ?? {}),
        [TACTICAL_GRAPHIC_KEY]: props,
        role,
    };
    return feature;
}

/**
 * Renders a tactical graphic from a GeoJSON feature. GeoJSON in, GeoJSON out.
 *
 * The feature's `properties.tacticalGraphic.name` selects the graphic; its
 * geometry supplies the control points the user drew. Coordinates are treated
 * as **EPSG:4326** (`[lon, lat]`), and the output is in the same projection.
 *
 * Every returned feature carries the original `properties.tacticalGraphic`
 * plus a `role` of `graphic` | `label` | `handle`, so downstream styling can
 * read a graphic's amplifiers straight off the feature.
 *
 * @param feature   A Feature with `properties.tacticalGraphic` set.
 * @param overrides Generator options that win over the feature's properties.
 * @throws {TacticalGraphicError} if the config is missing, names an unknown
 *         graphic, or the geometry type doesn't suit that graphic.
 */
export function renderTacticalGraphic(feature: Feature, overrides?: Partial<GraphicOptions>): TacticalGraphicRender {
    const props = readTacticalGraphicProperties(feature);
    if (!props) {
        throw new TacticalGraphicError(
            `Feature has no "properties.${TACTICAL_GRAPHIC_KEY}" object. ` +
                `Add one naming the graphic, e.g. {"${TACTICAL_GRAPHIC_KEY}": {"name": "PhaseLine"}}.`,
        );
    }
    if (!props.name) {
        throw new TacticalGraphicError(`"properties.${TACTICAL_GRAPHIC_KEY}.name" is required.`);
    }

    const generator = TacticalGraphicsRegistry.get(props.name);
    if (!generator) {
        throw new TacticalGraphicError(
            `Unknown tactical graphic "${props.name}". Call listTacticalGraphicNames() to see the ${listTacticalGraphicNames().length} supported names.`,
            props.name,
        );
    }

    if (!feature.geometry) {
        throw new TacticalGraphicError(`Graphic "${props.name}" needs a geometry, but the feature has none.`, props.name);
    }

    const expected = EXPECTED_BASE_GEOMETRY[generator.type];
    if (expected && feature.geometry.type !== expected) {
        throw new TacticalGraphicError(
            `Graphic "${props.name}" expects a ${expected} base geometry, got ${feature.geometry.type}.`,
            props.name,
        );
    }

    const rendered = generator.generate(feature, toGraphicOptions(props, overrides));

    return {
        name: props.name,
        base: feature,
        graphic: tag(rendered.graphic, props, 'graphic'),
        labels: tag(rendered.labels, props, 'label'),
        handles: tag(rendered.handles, props, 'handle'),
    };
}

/**
 * Flattens a render into a FeatureCollection, ready to hand to any GeoJSON
 * consumer (e.g. `ol/format/GeoJSON`).
 *
 * Filter on `properties.role` to style each part, and omit `handles` unless
 * you're building an editor.
 */
export function toFeatureCollection(
    render: TacticalGraphicRender,
    roles: TacticalGraphicRole[] = ['graphic', 'label'],
): FeatureCollection {
    const byRole: Record<TacticalGraphicRole, Feature> = {
        graphic: render.graphic,
        label: render.labels,
        handle: render.handles,
        base: render.base,
    };
    return {
        type: 'FeatureCollection',
        features: roles.map(role => byRole[role]).filter(Boolean),
    };
}
