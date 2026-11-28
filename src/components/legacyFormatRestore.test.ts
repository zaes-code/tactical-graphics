/**
 * # A file written by 3.4.0 still opens
 *
 * Fifty-four graphics changed how many points their base stores when they were rebuilt onto
 * the anchor points their plates number. A bridge went from a drawn centreline plus a `width`
 * amplifier to four placed points; ambush from two to three; cover, guard and screen from two
 * to four. Every one of those is a **file format change**, and every consumer holding a saved
 * graphic has the old shape on disk.
 *
 * The back-compat exists — some bases are upgraded on the way in by `normalizeDrawnBase`, the
 * rest keep drawing through their generator's legacy branch — but until now **nothing pinned
 * it**. `fullRoundTrip` saves and restores in the *current* format, so it cannot see the old
 * one at all; a legacy branch could be deleted as dead code and every suite would stay green
 * while every saved graphic in the field stopped drawing.
 *
 * So this suite hand-builds a 3.4.0-shaped record — two points and the amplifiers that
 * version filed — and puts it through the real restore path on both engines.
 *
 * ## The measurement trap this suite exists to avoid repeating
 *
 * A first pass at this check reported 344400 turn and 344700 tactical turn drawing **nothing**
 * from a legacy base, which would have meant every saved turn vanishing on upgrade. That was
 * the probe: those two return a `GeometryCollection`, and the counter was reading
 * `.coordinates` — a field a collection does not have — off every graphic. `ink()` below walks
 * the geometry properly, which is why it is a function here rather than an inline expression.
 */
import VectorSource from 'ol/source/Vector';
import type {Feature as GeoJSONFeature, FeatureCollection, Position} from 'geojson';
import {
    baseGeometryFor,
    baseVertexCount,
    listTacticalGraphicNames,
    normalizeDrawnBase,
    renderTacticalGraphic,
    TacticalGraphicName,
} from '@zaes/tactical-graphics';
import type {TacticalGraphicHandler} from './openlayers/openlayersAdapter';
import type {TacticalGraphicsManager} from './openlayers/TacticalGraphicsManager';
import {restoreTacticalGraphics} from './openlayers/persistence';
import {buildTacticalGraphic} from './maplibre/maplibreAdapter';

const RES = 1200;
const VIEW_RES = RES * 4;

/** The two points a pre-conversion base carried, and the amplifiers filed beside them. */
const LEGACY_LINE: Position[] = [[12, 41], [12.8, 41]];
const LEGACY_POINT: Position = [12, 41];

/**
 * What 3.4.0 wrote into `properties.tacticalGraphic` for a graphic of this kind.
 *
 * Deliberately generous: a real file carries whichever of these its holder stamped, and a
 * reader that only works when the exact right subset is present is not back-compatible. The
 * numbers are the shapes those fields actually took — `width` a full width in metres, `radius`
 * a half-width, `size` a decoration size.
 */
const LEGACY_AMPLIFIERS = {radius: 40_000, width: 80_000, size: 40_000, rotation: 30, bend: 0.4};

/**
 * How many coordinates a rendered graphic actually contains.
 *
 * **Walks the geometry rather than reaching for `.coordinates`.** Turn and tactical turn
 * return a `GeometryCollection`; the rectangles return a `Polygon`; most return a
 * `MultiLineString`. Reading one field off all three reports a real symbol as empty.
 */
function ink(geometry: GeoJSONFeature['geometry'] | undefined): number {
    if (!geometry) return 0;
    if (geometry.type === 'GeometryCollection') {
        return (geometry.geometries ?? []).reduce((n, g) => n + ink(g), 0);
    }
    const coords = (geometry as {coordinates?: unknown}).coordinates;
    if (!coords) return 0;
    /*
     * **An empty array is not one coordinate.** Written as
     * `Array.isArray(a[0]) ? …recurse… : 1`, an empty `coordinates` array takes the `1` branch
     * — `a[0]` is `undefined`, which is not an array — so a graphic that drew *nothing* scored
     * one and every assertion in this file passed against a symbol that had vanished. Caught
     * by a control run that deliberately emptied one generator and could not make the suite
     * fail. The emptiness check has to come first.
     */
    const deep = (a: unknown): number => {
        if (!Array.isArray(a)) return 0;
        if (a.length === 0) return 0;
        return Array.isArray(a[0]) ? (a as unknown[]).reduce((n: number, x) => n + deep(x), 0) : 1;
    };
    return deep(coords);
}

/** A 3.4.0 snapshot holding one graphic, in the shape `restoreTacticalGraphics` reads. */
function legacySnapshot(name: TacticalGraphicName): FeatureCollection {
    const kind = baseGeometryFor(name);
    const geometry: GeoJSONFeature['geometry'] = kind === 'Point'
        ? {type: 'Point', coordinates: LEGACY_POINT}
        : kind === 'Polygon'
            ? {type: 'Polygon', coordinates: [[[12, 41], [12.8, 41], [12.8, 41.4], [12, 41.4], [12, 41]]]}
            : {type: 'LineString', coordinates: LEGACY_LINE};
    return {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            geometry,
            properties: {tacticalGraphic: {name, ...LEGACY_AMPLIFIERS}, symbolId: `legacy-${name}`},
        } as GeoJSONFeature],
    };
}

function fakeManager() {
    const watched: TacticalGraphicHandler[] = [];
    return {
        renderingVectorSource: new VectorSource(),
        graphicControllers: [] as TacticalGraphicHandler[],
        map: {getView: () => ({on: () => undefined, getResolution: () => VIEW_RES})},
        watchResolution: (h: TacticalGraphicHandler) => {
            if (!watched.includes(h)) watched.push(h);
        },
        unwatchResolution: () => undefined,
        releaseAllGraphics: () => undefined,
    } as unknown as TacticalGraphicsManager;
}

/**
 * The graphics whose stored point count changed in this release, read off the library rather
 * than listed by hand — so a future conversion joins this suite by existing.
 *
 * A two-point line is what every one of them was saved as, whatever it stores now.
 */
const CONVERTED = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(
    n => baseGeometryFor(n) === 'LineString' && (baseVertexCount(n) ?? 2) > 2,
);

const NAMES = listTacticalGraphicNames() as TacticalGraphicName[];

describe(`a 3.4.0 file still opens (${CONVERTED.length} converted graphics)`, () => {
    it('has the converted graphics to check', () => {
        // If this falls to nothing, the filter has stopped matching and every assertion below
        // is passing on an empty list.
        expect(CONVERTED.length).toBeGreaterThan(30);
    });

    it.each(CONVERTED.map(n => [String(n), n] as const))('%s draws from its old two-point base', (_label, name) => {
        /*
         * **The raw saved base, not a settled one.** Handing `normalizeDrawnBase` the two
         * points first and rendering the result asserts the *upgrade* — which is the path the
         * app takes, and which is already covered — while never reaching the generator's own
         * short-base branch at all. `renderTacticalGraphic` is the public API: a consumer
         * feeding it the GeoJSON they saved gets no normalisation, so this is the shape their
         * call actually has.
         *
         * Caught by a control run. With the assertion written against the settled base,
         * deleting *both* of 152100's back-compat routes changed nothing here.
         */
        const built = renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name, ...LEGACY_AMPLIFIERS}},
            geometry: {type: 'LineString', coordinates: LEGACY_LINE},
        } as GeoJSONFeature);
        expect(ink(built.graphic.geometry)).toBeGreaterThan(0);
    });

    it.each(CONVERTED.map(n => [String(n), n] as const))('%s draws once the app has settled it too', (_label, name) => {
        // The other path: a restore normalises on the way in, so the generator sees whatever
        // the upgrade made of the old base. Both have to draw — they are different code.
        const settled = normalizeDrawnBase(name, LEGACY_LINE, RES) as Position[];
        const built = renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name, ...LEGACY_AMPLIFIERS}},
            geometry: {type: 'LineString', coordinates: settled},
        } as GeoJSONFeature);
        expect(ink(built.graphic.geometry)).toBeGreaterThan(0);
    });

    it.each(CONVERTED.map(n => [String(n), n] as const))('%s opens on MapLibre from its old base', (_label, name) => {
        const built = buildTacticalGraphic(name, {type: 'LineString', coordinates: LEGACY_LINE}, LEGACY_AMPLIFIERS, RES);
        expect(built).toBeDefined();
        expect(ink(built!.graphic.geometry as GeoJSONFeature['geometry'])).toBeGreaterThan(0);
    });

    it.each(NAMES.map(n => [String(n), n] as const))('%s restores on OpenLayers from a 3.4.0 snapshot', (_label, name) => {
        // **Every registered graphic, not only the converted ones.** A restore reads the whole
        // file, and a reader that throws on one record can cost the user the rest of it.
        const manager = fakeManager();
        const report = restoreTacticalGraphics(manager, legacySnapshot(name));

        expect(report.failed).toEqual([]);
        expect(report.restored).toBe(1);

        const restored = manager.graphicControllers[0];
        expect(restored).toBeDefined();
        expect(restored.getSymbolId()).toBe(`legacy-${name}`);
        // And it comes back *editable*, not merely visible — the whole point of restoring a
        // base rather than the drawn line work.
        expect(restored.graphic.base.getGeometry()).toBeDefined();
    });

    it('upgrades the bases that gained points, and leaves the rest alone', () => {
        /*
         * Two back-compat strategies are in play and both are legitimate; what would not be is
         * a graphic that gained points, has no upgrade, *and* has no legacy branch. Naming the
         * split here is what makes the next conversion ask which one it is using.
         */
        const upgraded = CONVERTED.filter(n => (normalizeDrawnBase(n, LEGACY_LINE, RES) as Position[]).length > 2);
        const legacyBranch = CONVERTED.filter(n => (normalizeDrawnBase(n, LEGACY_LINE, RES) as Position[]).length === 2);

        // Both groups are populated — otherwise this test is asserting one mechanism twice.
        expect(upgraded.length).toBeGreaterThan(0);
        expect(legacyBranch.length).toBeGreaterThan(0);
        expect(upgraded.length + legacyBranch.length).toBe(CONVERTED.length);

        // Whichever route it takes, it draws. Asserted again here against the *unsettled*
        // base, which is what a generator reached directly by a consumer actually receives.
        for (const name of legacyBranch) {
            const built = renderTacticalGraphic({
                type: 'Feature',
                properties: {tacticalGraphic: {name, ...LEGACY_AMPLIFIERS}},
                geometry: {type: 'LineString', coordinates: LEGACY_LINE},
            } as GeoJSONFeature);
            expect(ink(built.graphic.geometry)).toBeGreaterThan(0);
        }
    });

    it('counts a GeometryCollection as ink', () => {
        // The guard on this suite's own instrument. 344400 turn returns a collection, and a
        // counter that reads `.coordinates` reports it empty — which is exactly the false
        // alarm that prompted writing this file. @see ink
        const settled = normalizeDrawnBase(TacticalGraphicName.Turn, [[12, 41], [12.8, 41], [12.4, 41.3]], RES) as Position[];
        const built = renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name: TacticalGraphicName.Turn}},
            geometry: {type: 'LineString', coordinates: settled},
        } as GeoJSONFeature);
        expect(built.graphic.geometry.type).toBe('GeometryCollection');
        expect(ink(built.graphic.geometry)).toBeGreaterThan(0);
    });
});
