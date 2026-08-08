import type {Feature, FeatureCollection, Geometry} from 'geojson';
import {
    GRAPHIC_CATEGORIES,
    PAINTABLE_GRAPHICS,
    TACTICAL_GRAPHIC_KEY,
    TacticalGraphicCategory,
    TacticalGraphicHostility,
    TacticalGraphicName,
    getDisplayName,
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
function candidateGeometries(lon: number, lat: number): Geometry[] {
    const line: Geometry = {type: 'LineString', coordinates: [[lon - HALF, lat], [lon + HALF, lat]]};
    const ring: Geometry = {
        type: 'Polygon',
        coordinates: [[
            [lon - HALF, lat - HALF],
            [lon + HALF, lat - HALF],
            [lon + HALF, lat + HALF],
            [lon - HALF, lat + HALF],
            [lon - HALF, lat - HALF],
        ]],
    };
    const point: Geometry = {type: 'Point', coordinates: [lon, lat]};
    return [line, ring, point];
}

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
 * Builds one sample per paintable graphic, laid out on a grid grouped by category.
 *
 * Grouped so the sweep reads the way the OpenLayers gallery does — related symbols
 * adjacent — but without that gallery's measured packing, which is tied to
 * OpenLayers extents. A plain grid is enough for "what can this renderer draw".
 */
export function buildSampleGraphics(hostility?: TacticalGraphicHostility): {
    graphics: MapLibreTacticalGraphic[];
    report: MapLibreSampleReport;
} {
    const byCategory = [...PAINTABLE_GRAPHICS].sort((a, b) => {
        const ca = GRAPHIC_CATEGORIES[a] ?? TacticalGraphicCategory.Areas;
        const cb = GRAPHIC_CATEGORIES[b] ?? TacticalGraphicCategory.Areas;
        return ca === cb ? getDisplayName(a).localeCompare(getDisplayName(b)) : String(ca).localeCompare(String(cb));
    });

    const graphics: MapLibreTacticalGraphic[] = [];
    const failed: string[] = [];

    byCategory.forEach((name, i) => {
        const lon = ORIGIN[0] + (i % COLUMNS) * COLUMN_STEP;
        const lat = ORIGIN[1] - Math.floor(i / COLUMNS) * ROW_STEP;

        const built = candidateGeometries(lon, lat)
            .map(geometry => buildTacticalGraphic(name, geometry, {
                radius: SAMPLE_RADIUS_M,
                // **`rotation` is not optional in practice.** The point-anchored
                // generators feed it straight into `Math.cos`/`Math.sin`, so leaving it
                // undefined produces NaN coordinates and turf then refuses the feature —
                // which surfaces as the graphic simply not drawing. All nine arc and
                // circular-area samples were missing until this was passed.
                rotation: 0,
                ...(hostility ? {hostility} : {}),
            }))
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

    [...PAINTABLE_GRAPHICS].forEach((name, i) => {
        const lon = ORIGIN[0] + (i % COLUMNS) * COLUMN_STEP;
        const lat = ORIGIN[1] - Math.floor(i / COLUMNS) * ROW_STEP;

        const geometry = candidateGeometries(lon, lat).find(g =>
            buildTacticalGraphic(name, g, {radius: SAMPLE_RADIUS_M, rotation: 0}),
        );
        if (!geometry) return;

        features.push({
            type: 'Feature',
            geometry,
            properties: {
                role: 'base',
                symbolId: `sample-${name}`,
                graphicName: name,
                [TACTICAL_GRAPHIC_KEY]: {
                    name,
                    radius: SAMPLE_RADIUS_M,
                    rotation: 0,
                    ...(hostility ? {hostility} : {}),
                },
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
