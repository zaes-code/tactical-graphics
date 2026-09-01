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
    storedOrder,
    anchorsFromFrame,
    usesDrawnAnchors,
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

/** Degrees between sample centers. Wide enough that nothing overlaps its neighbor. */
const COLUMN_STEP = 9;
const ROW_STEP = 7;
/** Half-extent of a sample, in degrees. */
const HALF = 2.6;
const COLUMNS = 14;

/** Where the grid starts horizontally, so it sits over open water rather than land labels. */
const ORIGIN_LON = -64;

/**
 * How far from the equator a sample may be placed.
 *
 * **The sheet used to run off the bottom of the world.** It started at 44 degrees north
 * and stepped south a row at a time, so with 285 samples in 14 columns the last row sat at
 * **-96** — past the pole. Long before that it passed Mercator's limit, where a symbol has
 * no honest projection: the sweep's range fan at 89 south measured 39,204 x 0 km instead of
 * 360 x 360, and the two engines disagreed about how to draw the nonsense until they were
 * taught to clamp the same way.
 *
 * Inside 80 degrees a sample is drawn as the symbol it is, which is the entire point of a
 * sheet whose job is comparing symbols. @see MERCATOR_MAX_LATITUDE
 */
const MAX_SHEET_LATITUDE = 80;

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
    // **West to east as the *graphic* files it.** Thirty-two graphics store the arrowhead as
    // point 1, so handing one a west-to-east path aims it west and the sheet fills with
    // arrows pointing back into the previous cell. @see storedOrder
    const line: Geometry = {
        type: 'LineString',
        coordinates: storedOrder(name, [[lon - HALF, lat], [lon + HALF, lat]]),
    };
    const point: Geometry = {type: 'Point', coordinates: [lon, lat]};
    // **A rectangle gets four corners and an irregular area gets five**, so the sweep
    // tells them apart on sight. Every polygon-based graphic used to get the same square,
    // which made the fourteen rectangular variants indistinguishable from the areas they
    // exist to be an alternative to — and a catalog whose whole job is showing what a
    // symbol looks like should not hide the one difference between two of them.
    const ring: Geometry = isRectangular(name) ? box(lon, lat) : pentagon(lon, lat);

    /*
     * **Six graphics store *anchor points*, not a drawn path, and a plain two-point line
     * is not one.** Ambush, Contain, Envelopment, Pursuit, Turn and TacticalTurn recover
     * their whole shape from three anchors — the run's two ends plus a perpendicular
     * reference that carries the width. Handed only the two ends they still *produce* a
     * graphic, so the "first candidate that builds wins" rule accepted it, and every one
     * of them was drawn flat: Ambush and Pursuit came out 13 px wide and 0 px high, Turn
     * 13x5, against 22x22 for a healthy circle beside them. They were in the sweep and
     * invisible, which is the worst of both.
     *
     * `anchorsFromFrame` is the same function the holders write their base with, so this
     * is the base a user's drawing would have produced rather than an imitation of one.
     * @see usesDrawnAnchors
     */
    if (usesDrawnAnchors(name)) return [anchorLine(lon, lat), line, ring, point];

    /*
     * **And another eight whose points are numbered roles rather than a path.** The rule
     * here is "the first candidate that builds wins", and a two-point line *builds* for all
     * of them — it simply builds the wrong thing, or the not-yet-finished thing:
     *
     *   - the three **obstacle bypasses** read points 1 and 2 as the two ends of the
     *     opening and 3 as the rear, and with two points their generator returns the raw
     *     line, so the sweep showed three plain lines;
     *   - **capture, evacuate and recover** need four — centre, radius, the arc's middle,
     *     the arrow's end — and with two they draw the circle and stop, letter and all;
     *   - the **escort** needs three for its bar.
     *
     * (The demonstration used to be here too. It is dropped from one click now, so the
     * plain `point` candidate builds it and no layout is needed. @see Demonstration)
     *
     * Each layout below is written in the order the standard numbers the points.
     */
    const roles = ROLE_SAMPLE_LAYOUTS[name];
    if (roles) return [roles(lon, lat), line, ring, point];

    return [line, ring, point];
}

/** @see candidateGeometries — the layouts for graphics whose points are numbered roles. */
const ROLE_SAMPLE_LAYOUTS: Partial<Record<TacticalGraphicName, (lon: number, lat: number) => Geometry>> = {
    ...Object.fromEntries([
        TacticalGraphicName.ObstacleBypassEasy,
        TacticalGraphicName.ObstacleBypassDifficult,
        TacticalGraphicName.ObstacleBypassImpossible,
    ].map(name => [name, (lon: number, lat: number): Geometry => ({
        type: 'LineString',
        coordinates: [
            [lon + HALF * 0.6, lat + HALF * 0.6],
            [lon + HALF * 0.6, lat - HALF * 0.6],
            [lon - HALF * 0.8, lat],
        ],
    })])),

    ...Object.fromEntries([
        TacticalGraphicName.Capture,
        TacticalGraphicName.Evacuate,
        TacticalGraphicName.Recover,
    ].map(name => [name, (lon: number, lat: number): Geometry => ({
        type: 'LineString',
        coordinates: [
            [lon - HALF * 0.5, lat + HALF * 0.3],
            [lon - HALF * 0.5, lat + HALF * 0.85],
            [lon + HALF * 0.2, lat + HALF * 0.55],
            [lon + HALF * 0.85, lat - HALF * 0.6],
        ],
    })])),

    [TacticalGraphicName.Escort]: (lon, lat) => ({
        type: 'LineString',
        coordinates: [[lon, lat], [lon - HALF, lat], [lon + HALF, lat]],
    }),
};

/**
 * A three-anchor base spanning the same cell the two-point line does.
 *
 * The offset is a little over half the run, which is what gives these their height; a
 * frame with no offset is exactly the flat two-point case this exists to avoid.
 */
function anchorLine(lon: number, lat: number): Geometry {
    const half = metersBetween([lon - HALF, lat], [lon + HALF, lat]) / 2;
    return {type: 'LineString', coordinates: anchorsFromFrame([lon, lat], half, 0, half * 0.6, 1)};
}

/** Great-circle metres between two lon/lat positions — no turf in this file. */
function metersBetween(a: Position, b: Position): number {
    const R = 6378137;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const s = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
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
        // are separate samples rather than a replacement for this one, so the catalog
        // shows both what a fan looks like with a single ring and what stacking does to
        // it. @see EXTRA_SAMPLES
        //
        // Kilometers, unlike every other distance here. @see RangeFanBand.range
        bands: [{range: 180000, label: 'ARTY', altitude: 1500}],
    },
};

/**
 * A radius for the point-anchored graphics, in meters.
 *
 * Only read by graphics that take one; the rest ignore it. Sized so a circle lands
 * near the cell it is allotted rather than sprawling over its neighbors.
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
 * laid the catalog out differently — the same fan sat at [26, -47] in one and
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
 * nest, the labels stack, and the sector's bearings spread across the arc. A catalog
 * showing only the single-band case shows the shape and hides the graphic.
 */
const EXTRA_SAMPLES: {name: TacticalGraphicName; properties: Omit<TacticalGraphicProperties, 'name'>}[] = [
    {
        name: TacticalGraphicName.WeaponSensorRangeFanCircular,
        properties: {
            rangeFan: {
                bands: [
                    {range: 60000, label: 'MG'},
                    {range: 120000, label: 'ATGM'},
                    {range: 180000, label: 'ARTY'},
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
                    {range: 60000, label: 'MG', leftAzimuthDeg: 20, rightAzimuthDeg: 70},
                    {range: 120000, label: 'ATGM', leftAzimuthDeg: 35, rightAzimuthDeg: 85},
                    {range: 180000, label: 'ARTY', leftAzimuthDeg: 45, rightAzimuthDeg: 100},
                ],
            },
        },
    },
];

/**
 * Every sample, in one order, ready for either engine to realize.
 *
 * Sorted by category so related symbols sit together, which is what makes the sweep
 * readable as a catalog rather than a heap.
 */
function sampleSpecs(hostility?: TacticalGraphicHostility, only?: readonly TacticalGraphicName[]): SampleSpec[] {
    /*
     * **`only` narrows the sweep to what the host is showing.** The gallery is a way of
     * *looking* at the library, so drawing all 273 whatever the panel had been filtered
     * to made it useless for checking one category or one search. Cells are numbered
     * after the filter, so a narrowed sweep packs into a small grid instead of leaving
     * the holes its neighbours would have filled.
     *
     * An empty or absent list means everything, which is what a host with no filter of
     * its own wants.
     */
    const wanted = only?.length ? new Set(only) : undefined;
    const source = wanted ? PAINTABLE_GRAPHICS.filter(name => wanted.has(name)) : [...PAINTABLE_GRAPHICS];
    const byCategory = source.sort((a, b) => {
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

    // Appended, so they take the cells after the catalog proper and nothing shifts.
    // **The extras honour the filter too.** They are second samples of graphics already
    // in the sweep, not a fixture: appending them unconditionally put a range fan and a
    // range circle on the map for every search, however narrow, and they read as the
    // sweep ignoring the filter.
    EXTRA_SAMPLES.filter(extra => !wanted || wanted.has(extra.name)).forEach((extra, offset) => {
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

/**
 * Where a sample's cell sits, from its place in the list and how many there are.
 *
 * **Centred on the equator rather than started at a fixed latitude**, so the sheet grows
 * symmetrically into the band it is allowed instead of marching south out of the world.
 * The column count widens if a sweep is ever large enough that the rows would not fit,
 * which keeps the guarantee — every sample drawable — rather than the shape.
 * @see MAX_SHEET_LATITUDE
 */
function cellOrigin(index: number, total: number): {lon: number; lat: number} {
    const rowsThatFit = Math.floor((2 * MAX_SHEET_LATITUDE) / ROW_STEP) + 1;
    const columns = Math.max(COLUMNS, Math.ceil(total / rowsThatFit));
    const rows = Math.max(1, Math.ceil(total / columns));
    const top = Math.min(MAX_SHEET_LATITUDE, ((rows - 1) * ROW_STEP) / 2);

    return {
        lon: ORIGIN_LON + (index % columns) * COLUMN_STEP,
        lat: top - Math.floor(index / columns) * ROW_STEP,
    };
}

export function buildSampleGraphics(
    hostility?: TacticalGraphicHostility,
    drawingResolution?: number,
    only?: readonly TacticalGraphicName[],
): {
    graphics: MapLibreTacticalGraphic[];
    report: MapLibreSampleReport;
} {
    const graphics: MapLibreTacticalGraphic[] = [];
    const failed: string[] = [];

    const specs = sampleSpecs(hostility, only);
    specs.forEach(({name, index, properties}) => {
        const {lon, lat} = cellOrigin(index, specs.length);
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
export function sampleFeatureCollection(
    hostility?: TacticalGraphicHostility,
    only?: readonly TacticalGraphicName[],
): FeatureCollection {
    const features: Feature[] = [];

    const specs = sampleSpecs(hostility, only);
    specs.forEach(({name, index, properties}) => {
        const {lon, lat} = cellOrigin(index, specs.length);
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
