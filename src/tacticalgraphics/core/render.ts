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
    /** Corridor half-width, in metres, as a string. */
    width?: string;
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
     * Size scalar in **metres**, meaning varies by graphic (arrowhead spread,
     * perpendicular offset, ...). Defaults are applied per graphic when omitted.
     */
    size?: number;
    /** Radius in **metres** for circular and point-based graphics. */
    radius?: number;
    /** Rotation in degrees, for point-based graphics. */
    rotation?: number;
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
    const width = props.width !== undefined && props.width !== '' ? Number(props.width) : undefined;
    const options = {
        hostility: props.hostility,
        status: props.status,
        echelon: props.echelon,
        direction: props.direction,
        size: props.size,
        radius: props.radius,
        rotation: props.rotation,
        width: Number.isFinite(width) ? width : undefined,
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
