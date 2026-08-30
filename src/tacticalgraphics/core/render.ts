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
 *     "tacticalGraphic": {"name": "MainAxisOfAdvance", "designation": "1-508 IN"}
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
    TacticalGraphicMineType,
    TacticalGraphicMobility,
    TacticalGraphicTerrain,
    TacticalGraphicHostility,
    TacticalGraphicName,
    AltitudeDatum,
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
    /**
     * **Field T — unique designation.** The primary free-text designation, e.g.
     * "1-508 IN". FM 1-02.2: *"T — Identifies a unique designation"*.
     *
     * Named for the field rather than for what it renders as. It was `label`, which
     * collided with the three other senses of that word in this library — the anchor
     * features `renderTacticalGraphic` returns, the `role: 'label'` tag, and
     * {@link GraphicLabels}, the bag this is one member of. `readGraphicLabels(f).label`
     * read as the label of the labels and was none of them.
     */
    designation?: string;
    /**
     * **Field T1 — the second unique designation**, rendered beneath the primary on the
     * graphics that carry two. A boundary shows both.
     *
     * Doctrine numbers these T and T1, which is why they are not `identifier1` and
     * `identifier2`: a reader holding the plate would take `identifier1` for T1.
     */
    secondDesignation?: string;
    /**
     * **Field H — additional information.** Free text a symbol carries *beside* its
     * designation, not instead of it.
     *
     * Both standards name it that way, and several plates set the two at once: the area
     * generic (APP-06 120700) reads `H  T` on one line, the PsyOps zone stacks H over T
     * beside its loudspeaker, and human terrain sets H alone under its `HT`. The airfield
     * zone (120400) carries only this one — "The Field 'H' for this symbol includes type
     * of airfield, length of runway and other pertinent information" — which is why a
     * graphic needing H cannot simply borrow `label`.
     *
     * Where it is drawn is each symbol's own business; several rows add that H "should be
     * movable to avoid obscuring key geographic information", so a host is free to move it.
     */
    additionalInfo?: string;
    countryCode?: string;
    secondCountryCode?: string;
    /** Date-time group, formatted by the caller. */
    startDate?: string;
    endDate?: string;
    /**
     * Altitude or depth, as a **number** in the host's configured {@link AltitudeUnit}.
     *
     * FM 1-02.2 makes fields X and X1 free text — "measurement units shall be displayed
     * in the string", and feet, meters, a flight level and a submerged depth are all
     * legal — so this was a string. In practice the properties dialog has only ever
     * accepted digits, which made the freedom theoretical while costing every consumer a
     * value it could not sort, compare or arithmetic on. The unit comes from the config
     * instead and the renderer appends it, which is the same information in a shape a
     * program can use.
     *
     * **A string still renders, and deliberately so.** `formatAltitude` passes anything
     * non-numeric through untouched, so a `"FL150"` or a `"1500MSL"` restored from an
     * older snapshot — or imported from a system that speaks doctrine's own notation —
     * draws exactly as written rather than being mangled or dropped. It simply is not
     * what the type invites you to send.
     */
    minAltitude?: number;
    maxAltitude?: number;
    /**
     * What those altitudes are measured from. Applies to both, because a graphic quoting
     * a floor and a ceiling against two different datums would be describing two
     * different volumes. @see AltitudeDatum
     */
    altitudeDatum?: AltitudeDatum;

    eff?: string;
    grid?: string;
    /** Weapon designation. Today only FinalProtectiveFire renders this. */
    weapon?: string;

    // ── Symbology (affects color and dash pattern) ─────────────────────────
    hostility?: TacticalGraphicHostility;
    status?: TacticalGraphicStatus;
    confidence?: TacticalGraphicConfidence;
    echelon?: TacticalGraphicEchelon;
    direction?: RouteDirection;
    /**
     * Which mine the two mine areas draw inside themselves — APP-06 Table 8-24's
     * Sector 1 Modifier, restricted to its seven primitive types.
     * @see TacticalGraphicMineType
     */
    mineType?: TacticalGraphicMineType;
    /**
     * Which mobility icon the three terrain areas draw as their **Sector 1** modifier --
     * APP-06 Table 8-24's `MOBILITY` category. Limited access area, restricted terrain and
     * severely restricted terrain, and nothing else: the table's Remarks column says so.
     * @see TacticalGraphicMobility
     */
    mobility?: TacticalGraphicMobility;
    /**
     * The **Sector 2** modifier of restricted and severely restricted terrain -- APP-06
     * Table 8-25. It sets a word under the mobility icon and, optionally, the color the
     * area is hatched in. @see TacticalGraphicTerrain
     */
    terrain?: TacticalGraphicTerrain;

    // ── Geometry inputs ────────────────────────────────────────────────────
    /**
     * Radius in **meters**: how far the symbol reaches from its own center. The circle
     * radius for the arc mission tasks and circular areas, and the half-length of a
     * point-anchored arrow. Defaults are applied per graphic when omitted.
     *
     * Only for graphics that *have* a center. A line graphic's arrowhead or teeth are
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
     * arrowhead, and there is no center to take a radius of. The two were briefly one
     * field, which made `radius` mean two unrelated things depending on the graphic.
     *
     * **Caveat, see `ai/decisions.md`:** the generators that read this still consume it as
     * meters per *screen pixel* and multiply by a pixel count of their own, so a value in
     * meters comes out ~20x too large. That is the open item this field's existence makes
     * findable rather than hidden inside `radius`.
     */
    decorationSize?: number;
    /**
     * **Full** width in meters, measured across a drawn line: rail to rail on an
     * axis of advance, edge to edge on a corridor. What a width-drag handle writes,
     * and what a properties dialog shows.
     *
     * Full, not half — the generators work in half-widths (the perpendicular offset
     * from the centerline), so `toGraphicOptions` halves it on the way in and the
     * holders double it on the way out. The doubling is kept inside the library
     * precisely so a consumer never has to know about it: you send the width you
     * would measure on the map.
     */
    width?: number;
    /**
     * Full length in meters, the dimension **along** the graphic rather than across it.
     *
     * Only the rectangular target carries both. FM 1-02.2 table 5-25 draws it with
     * `AM1` across the top and `AM` down the side; APP-06 240802 names them
     * outright — "the target length (AM1) in metres and target width (AM) in metres".
     * Every other rectangle takes its length from the anchor points instead, which is
     * why this is not beside `width` on all of them.
     */
    length?: number;
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
     * Half the gap left in a bowed curve for its designation, in **meters**. Turn
     * and the tactical turn are the only readers.
     *
     * The meters twin of `labelGapDegrees`, and it exists for the same reason: pass
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

/**
 * The amplifiers a user can put on a graphic — what a properties dialog edits, and
 * what the style and paint functions read back.
 *
 * Kept separate from {@link TacticalGraphicProperties} rather than aliased to it:
 * that is the *saved* bag, which also carries the graphic's name and its geometry
 * inputs, and a dialog that edited those by accident would resize the shape.
 *
 * **It lives here, beside the saved bag, because it is symbology.** It was declared
 * in `utils/graphicLinkRegistry.ts` (which imports `ol`), then moved to
 * `components/graphicAmplifiers.ts` when the MapLibre entry point started compiling
 * the whole OpenLayers tree through it. That second move stopped short: a type
 * describing what amplifiers a graphic carries is exactly the kind of fact this half
 * of the library owns, and leaving it under `src/components/` meant the map-agnostic
 * registries could not name it. `securitySymbolRequest.labels` is where that bit —
 * a provider on one renderer was handed the graphic's amplifiers and on the other
 * was not. `components/graphicAmplifiers.ts` re-exports this, so nothing that
 * already imports it had to change.
 */
export interface GraphicLabels {
    /** Field T. @see TacticalGraphicProperties.designation */
    designation: string;
    countryCode?: string;
    /** Field T1. @see TacticalGraphicProperties.secondDesignation */
    secondDesignation?: string;
    /** Field H — additional information. @see TacticalGraphicProperties.additionalInfo */
    additionalInfo?: string;
    secondCountryCode?: string;
    startDate?: string;
    endDate?: string;
    /** @see TacticalGraphicProperties.minAltitude — a number in the configured unit. */
    minAltitude?: number;
    maxAltitude?: number;
    /** What both are measured from. @see AltitudeDatum */
    altitudeDatum?: AltitudeDatum;
    /**
     * Full width in meters, edge to edge. The same field the geometry schema uses —
     * `TacticalGraphicProperties.width` — so the dialog edits the graphic's actual
     * width rather than a string mirror of it that has to be kept in step.
     */
    width?: number;
    /** Full length in meters. @see TacticalGraphicProperties.length */
    length?: number;
    eff?: string;
    grid?: string;
    weapon?: string;
    hostility?: TacticalGraphicHostility;
    echelon?: TacticalGraphicEchelon;
    direction?: RouteDirection;
    /** @see TacticalGraphicProperties.mineType */
    mineType?: TacticalGraphicMineType;
    /** @see TacticalGraphicProperties.mobility */
    mobility?: TacticalGraphicMobility;
    /** @see TacticalGraphicProperties.terrain */
    terrain?: TacticalGraphicTerrain;
    status?: TacticalGraphicStatus;
    confidence?: TacticalGraphicConfidence;
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

/**
 * Amplifier keys 3.0.0 renamed, and what a file written before it calls them.
 *
 * `properties.tacticalGraphic` is what a host SAVES, so renaming a key in it silently
 * empties that amplifier on every graphic already on disk. The rename was worth making
 * — @see TacticalGraphicProperties.designation — and it is cheap to make it survivable,
 * which the point-order change in the same release is not.
 *
 * One direction only. Nothing writes the old names back, they are absent from the
 * types, and a bag carrying both keeps the current one: an old key is evidence about a
 * file's age, not an override.
 */
const RENAMED_AMPLIFIERS: ReadonlyArray<readonly [legacy: string, current: keyof TacticalGraphicProperties]> = [
    ['label', 'designation'],
    ['secondId', 'secondDesignation'],
];

/**
 * Fills in the current amplifier names from the ones a saved file may still use.
 *
 * Applied wherever a stored bag is read — here, and by both renderers — so the alias is
 * stated once rather than once per engine. Returns the bag untouched when there is
 * nothing to translate, which is every graphic written by this version.
 */
export function applyAmplifierAliases<T extends object>(bag: T): T {
    const source = bag as Record<string, unknown>;
    let out: Record<string, unknown> | undefined;
    for (const [legacy, current] of RENAMED_AMPLIFIERS) {
        if (source[legacy] === undefined || source[current] !== undefined) continue;
        out = out ?? {...source};
        out[current] = source[legacy];
    }
    for (const [field, table] of RECASED_AMPLIFIER_VALUES) {
        const stored = (out ?? source)[field];
        if (typeof stored !== 'string') continue;
        const current = table[stored];
        if (current === undefined) continue;
        out = out ?? {...source};
        out[field] = current;
    }
    return (out as T) ?? bag;
}

/**
 * Amplifier **values** 3.0.0 recased, and what a file written before it calls them.
 *
 * The sibling of {@link RENAMED_AMPLIFIERS}, one level down: those keys changed name,
 * these keys kept theirs and changed the words they hold. Four enums used to spell their
 * values in three different ways — `'present'`, `'GENERAL'`, `'Hostile/Faker'` — and a
 * host reading a saved bag saw all three side by side. @see TacticalGraphicStatus
 *
 * Only the four that moved are listed. An enum already spelled the way the operator
 * reads it never changed, so there is nothing here to translate it from.
 *
 * The same one-direction rule applies: an old value is evidence about a file's age, and
 * nothing writes one back.
 */
const RECASED_AMPLIFIER_VALUES: ReadonlyArray<readonly [field: keyof TacticalGraphicProperties, was: Readonly<Record<string, string>>]> = [
    ['status', {present: TacticalGraphicStatus.present, planned: TacticalGraphicStatus.planned}],
    ['confidence', {known: TacticalGraphicConfidence.known, suspected: TacticalGraphicConfidence.suspected}],
    [
        'direction',
        {
            GENERAL: RouteDirection.general,
            ONE_WAY: RouteDirection.oneWay,
            TWO_WAY: RouteDirection.twoWay,
            ALTERNATING: RouteDirection.alternating,
        },
    ],
];

/** Reads a feature's tactical graphic config, or `undefined` if it has none. */
export function readTacticalGraphicProperties(feature: Feature): TacticalGraphicProperties | undefined {
    const props = feature.properties as GeoJsonProperties;
    const config = props?.[TACTICAL_GRAPHIC_KEY];
    return config && typeof config === 'object' ? applyAmplifierAliases(config as TacticalGraphicProperties) : undefined;
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
 * 292 names beside this one and watch the two drift.
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

/**
 * Maps the public property bag onto the internal generator option bag.
 *
 * **Exported** because a renderer sometimes has to see what the generator saw. A
 * range fan's bands are consumed by the generator and survive only as anonymous
 * points, so a renderer labeling them must re-resolve them from the same options —
 * and reconstructing the mapping on its own is how the two ended up disagreeing.
 */
export function toGraphicOptions(props: TacticalGraphicProperties, overrides?: Partial<GraphicOptions>): GraphicOptions {
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
        // a visibly smaller arrowhead. It is the same meters the holder stamps.
        headSize: props.decorationSize,
        // Public `width` is a full width; the generators' `radius` is the half-width
        // offset from the centerline. This is the only place the factor of two lives.
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
