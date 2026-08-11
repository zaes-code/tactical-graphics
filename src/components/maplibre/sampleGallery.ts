import type {Feature, FeatureCollection, Geometry, Position} from 'geojson';
import {
    GRAPHIC_CATEGORIES,
    PAINTABLE_GRAPHICS,
    TACTICAL_GRAPHIC_KEY,
    TacticalGraphicCategory,
    TacticalGraphicHostility,
    TacticalGraphicName,
    getDisplayName,
    supportsHostility,
    AltitudeDatum,
    isRectangular,
    type TacticalGraphicProperties,
} from '@zaes/tactical-graphics';
import {buildTacticalGraphic, type MapLibreTacticalGraphic} from './maplibreAdapter';

/**
 * # The MapLibre sample sweep
 *
 * The OpenLayers gallery (`openlayers/sampleGallery.ts`) draws every *proven*
 * graphic — 197 of them — from a tracker-derived list. This draws every
 * **paintable** one instead, which is a deliberately different question:
 *
 * > What can the MapLibre renderer draw *today*?
 *
 * As the port proceeds this sweep grows on its own, because
 * {@link PAINTABLE_GRAPHICS} is the registry rather than a hand-kept list. The gap
 * between the two galleries is the remaining work, made visible instead of
 * tracked in a document.
 *
 * Demo-only, like its OpenLayers counterpart — excluded from the published build.
 */

/** Degrees between sample centres. Wide enough that nothing overlaps its neighbour. */
const COLUMN_STEP = 9;
const ROW_STEP = 7;
/** Half-extent of a sample, in degrees. */
const HALF = 2.6;
const COLUMNS = 14;

/** Where the grid starts, so it sits over open water rather than under basemap labels. */
const ORIGIN: [number, number] = [-64, 44];

/**
 * Base geometries to try, in order.
 *
 * A generator refuses a base of the wrong shape — `buildTacticalGraphic` returns
 * `undefined` rather than throwing — so rather than maintaining a name → shape
 * table that would drift from the generators, each candidate is tried and the
 * first that produces a graphic wins.
 *
 * That is not a guess: it is the same question the generator itself answers, asked
 * directly. It also means a newly-ported graphic joins the sweep with no edit here.
 */
function candidateGeometries(name: TacticalGraphicName, lon: number, lat: number): Geometry[] {
    const line: Geometry = {type: 'LineString', coordinates: [[lon - HALF, lat], [lon + HALF, lat]]};
    const point: Geometry = {type: 'Point', coordinates: [lon, lat]};
    // **A rectangle gets four corners and an irregular area gets five**, so the sweep
    // tells them apart on sight. Every polygon-based graphic used to get the same square,
    // which made the fourteen rectangular variants indistinguishable from the areas they
    // exist to be an alternative to — and a catalogue whose whole job is showing what a
    // symbol looks like should not hide the one difference between two of them.
    const ring: Geometry = isRectangular(name) ? box(lon, lat) : pentagon(lon, lat);
    return [line, ring, point];
}

/** Four corners, axis-aligned — what `createBox` and MapLibre's `buildBox` produce. */
function box(lon: number, lat: number): Geometry {
    return {
        type: 'Polygon',
        coordinates: [[
            [lon - HALF, lat - HALF],
            [lon + HALF, lat - HALF],
            [lon + HALF, lat + HALF],
            [lon - HALF, lat + HALF],
            [lon - HALF, lat - HALF],
        ]],
    };
}

/**
 * Five corners, regular, point-up and inscribed in the same cell a box would fill.
 *
 * Regular rather than scribbled: a sample is a reference drawing, and an irregular area
 * drawn irregularly reads as a mistake rather than as the shape's own freedom.
 */
function pentagon(lon: number, lat: number): Geometry {
    const corners: Position[] = [];
    for (let i = 0; i < 5; i++) {
        const angle = Math.PI / 2 + (i * 2 * Math.PI) / 5;
        corners.push([lon + HALF * Math.cos(angle), lat + HALF * Math.sin(angle)]);
    }
    corners.push(corners[0]);
    return {type: 'Polygon', coordinates: [corners]};
}

/**
 * Amplifiers handed to **every** sample, so the ones that render them show what they
 * actually look like in use.
 *
 * Set unconditionally rather than per graphic, because that is how the schema already
 * works: a graphic ignores the fields that do not apply to it. Only the twenty-odd that
 * draw an altitude block react, and picking them by name here would be a second list to
 * keep in step with the generators.
 *
 * They exist because the sweep is the engine-comparison tool and the published gallery,
 * and without them the whole multi-line `MIN ALT: / MAX ALT:` layout — eleven air zones,
 * three coordination areas, eight corridors — was invisible in both. A regression there
 * could not have shown up in either.
 *
 * Values are representative rather than doctrinal: a floor and a ceiling far enough apart
 * to read, against a datum, and three range bands sized to sit inside the cell a sample
 * is allotted.
 */
const SAMPLE_AMPLIFIERS = {
    minAltitude: 1500,
    maxAltitude: 20000,
    altitudeDatum: AltitudeDatum.aboveGroundLevel,
    rangeFan: {
        // **One band**, and no bearings on it — the sector fan then falls back to its
        // own span, which is the plain case worth showing first. The multi-band variants
        // are separate samples rather than a replacement for this one, so the catalogue
        // shows both what a fan looks like with a single ring and what stacking does to
        // it. @see EXTRA_SAMPLES
        //
        // Kilometres, unlike every other distance here. @see RangeFanBand.range
        bands: [{range: 180, label: 'ARTY', altitude: 1500}],
    },
};

/**
 * A radius for the point-anchored graphics, in metres.
 *
 * Only read by graphics that take one; the rest ignore it. Sized so a circle lands
 * near the cell it is allotted rather than sprawling over its neighbours.
 */
const SAMPLE_RADIUS_M = 180_000;

export interface MapLibreSampleReport {
    drawn: number;
    /** Graphics the registry claims to paint but which produced nothing. */
    failed: string[];
}

/**
 * The hostility to stamp on a sample, or nothing.
 *
 * **A graphic that does not take a standard identity is left untouched**, exactly
 * as the OpenLayers sweep leaves it: FM 1-02.2 gives no amplifier fields to the
 * Chapter 6 tactical mission tasks, so a swept mission task has to render as it
 * does with no hostility selected. Stamping one anyway made every mission task in
 * this sweep red, which is a picture a user could not produce.
 *
 * The paint layer refuses the value too — @see lineColorOf — so this is belt and
 * braces. It is worth both: this keeps the saved bag honest, so a sweep exported
 * to GeoJSON does not carry an identity the symbol never had.
 */
function hostilityFor(
    name: TacticalGraphicName,
    hostility?: TacticalGraphicHostility,
): {hostility?: TacticalGraphicHostility} {
    return hostility && supportsHostility(name) ? {hostility} : {};
}

/**
 * Builds one sample per paintable graphic, laid out on a grid grouped by category.
 *
 * Grouped so the sweep reads the way the OpenLayers gallery does — related symbols
 * adjacent — but without that gallery's measured packing, which is tied to
 * OpenLayers extents. A plain grid is enough for "what can this renderer draw".
 *
 * **`drawingResolution` is not optional in practice**, for the same reason it is not
 * on the draw path: a graphic whose every dimension is a screen constant has no size
 * without it. Omitting it built Cover, Guard and Screen from `SAMPLE_RADIUS_M` — a
 * ground distance — so each came out 34px across instead of 410, and then snapped to
 * the right size on the first zoom, when `rebuildScreenSized` re-derived it from the
 * live map. @see securityOperationSize
 */
/**
 * One sample: which graphic, where in the grid, and the properties it is drawn with.
 *
 * **Both sweeps walk this same list**, which they did not used to. `buildSampleGraphics`
 * sorted by category while `sampleFeatureCollection` took the registry's own order, so
 * the engine that builds its own graphics and the engine that restores the collection
 * laid the catalogue out differently — the same fan sat at [26, -47] in one and
 * [-10, -54] in the other. Comparing the two by looking at them was comparing two
 * different pictures.
 */
interface SampleSpec {
    name: TacticalGraphicName;
    index: number;
    properties: Omit<TacticalGraphicProperties, 'name'>;
}

/**
 * A second sample for the graphics whose interesting variation is in their *properties*
 * rather than their shape.
 *
 * The range fans carry a list of bands, and one band draws nothing like four — the rings
 * nest, the labels stack, and the sector's bearings spread across the arc. A catalogue
 * showing only the single-band case shows the shape and hides the graphic.
 */
const EXTRA_SAMPLES: {name: TacticalGraphicName; properties: Omit<TacticalGraphicProperties, 'name'>}[] = [
    {
        name: TacticalGraphicName.WeaponSensorRangeFanCircular,
        properties: {
            rangeFan: {
                bands: [
                    {range: 60, label: 'MG'},
                    {range: 120, label: 'ATGM'},
                    {range: 180, label: 'ARTY'},
                ],
            },
        },
    },
    {
        name: TacticalGraphicName.WeaponSensorRangeFanSector,
        properties: {
            // Three, for the same reason — and each with its own pair of bearings, which
            // is the thing a sector fan can do that a circular one cannot.
            rangeFan: {
                bands: [
                    {range: 60, label: 'MG', leftAzimuthDeg: 20, rightAzimuthDeg: 70},
                    {range: 120, label: 'ATGM', leftAzimuthDeg: 35, rightAzimuthDeg: 85},
                    {range: 180, label: 'ARTY', leftAzimuthDeg: 45, rightAzimuthDeg: 100},
                ],
            },
        },
    },
];

/**
 * Every sample, in one order, ready for either engine to realise.
 *
 * Sorted by category so related symbols sit together, which is what makes the sweep
 * readable as a catalogue rather than a heap.
 */
function sampleSpecs(hostility?: TacticalGraphicHostility): SampleSpec[] {
    const byCategory = [...PAINTABLE_GRAPHICS].sort((a, b) => {
        const ca = GRAPHIC_CATEGORIES[a] ?? TacticalGraphicCategory.Areas;
        const cb = GRAPHIC_CATEGORIES[b] ?? TacticalGraphicCategory.Areas;
        return ca === cb ? getDisplayName(a).localeCompare(getDisplayName(b)) : String(ca).localeCompare(String(cb));
    });

    const specs: SampleSpec[] = byCategory.map((name, index) => ({
        name,
        index,
        properties: {
            ...SAMPLE_AMPLIFIERS,
            radius: SAMPLE_RADIUS_M,
            // **`rotation` is not optional in practice.** The point-anchored generators
            // feed it straight into `Math.cos`/`Math.sin`, so leaving it undefined
            // produces NaN coordinates and turf then refuses the feature — which surfaces
            // as the graphic simply not drawing. All nine arc and circular-area samples
            // were missing until this was passed.
            rotation: 0,
            ...hostilityFor(name, hostility),
        },
    }));

    // Appended, so they take the cells after the catalogue proper and nothing shifts.
    EXTRA_SAMPLES.forEach((extra, offset) => {
        specs.push({
            name: extra.name,
            index: byCategory.length + offset,
            properties: {
                ...SAMPLE_AMPLIFIERS,
                radius: SAMPLE_RADIUS_M,
                rotation: 0,
                ...hostilityFor(extra.name, hostility),
                ...extra.properties,
            },
        });
    });

    return specs;
}

/** Where a sample's cell sits, from its place in the list. */
function cellOrigin(index: number): {lon: number; lat: number} {
    return {
        lon: ORIGIN[0] + (index % COLUMNS) * COLUMN_STEP,
        lat: ORIGIN[1] - Math.floor(index / COLUMNS) * ROW_STEP,
    };
}

export function buildSampleGraphics(
    hostility?: TacticalGraphicHostility,
    drawingResolution?: number,
): {
    graphics: MapLibreTacticalGraphic[];
    report: MapLibreSampleReport;
} {
    const graphics: MapLibreTacticalGraphic[] = [];
    const failed: string[] = [];

    sampleSpecs(hostility).forEach(({name, index, properties}) => {
        const {lon, lat} = cellOrigin(index);
        const built = candidateGeometries(name, lon, lat)
            .map(geometry => buildTacticalGraphic(name, geometry, properties, drawingResolution))
            .find(Boolean);

        if (built) graphics.push(built);
        else failed.push(name);
    });

    return {graphics, report: {drawn: graphics.length, failed}};
}

/**
 * The sweep as a plain GeoJSON FeatureCollection — the same shape the OpenLayers
 * side saves and restores.
 *
 * Exported so the two engines can be handed *identical* input when comparing them,
 * which is the whole basis of the parity checks. @see components/spikeSamples.ts
 */
export function sampleFeatureCollection(hostility?: TacticalGraphicHostility): FeatureCollection {
    const features: Feature[] = [];

    sampleSpecs(hostility).forEach(({name, index, properties}) => {
        const {lon, lat} = cellOrigin(index);
        const geometry = candidateGeometries(name, lon, lat).find(g =>
            buildTacticalGraphic(name, g, {radius: SAMPLE_RADIUS_M, rotation: 0}),
        );
        if (!geometry) return;

        features.push({
            type: 'Feature',
            geometry,
            properties: {
                role: 'base',
                // Unique per cell, not per graphic: the fans appear twice.
                symbolId: `sample-${name}-${index}`,
                graphicName: name,
                [TACTICAL_GRAPHIC_KEY]: {name, ...properties},
            },
        });
    });

    return {type: 'FeatureCollection', features};
}


/** Every graphic the registry cannot paint yet — the remaining port, as a list. */
export function unpaintableGraphics(): TacticalGraphicName[] {
    const paintable = new Set<string>(PAINTABLE_GRAPHICS);
    return (Object.keys(GRAPHIC_CATEGORIES) as TacticalGraphicName[]).filter(n => !paintable.has(n));
}
