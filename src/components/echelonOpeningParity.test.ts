/**
 * # A battle position's opening and its echelon, the same on every renderer
 *
 * The twin of `symbology/echelonOpening.test.ts`, run through each renderer this package
 * ships: OpenLayers from a restored file, MapLibre's native layers from the same file, and
 * the MapLibre canvas overlay. Each is asked the same three things:
 *
 * - `openingDirection` opens the ring on the side it names, and unset still opens south;
 * - a graphic with no echelon draws no mark at all, where it used to draw a squad's dot;
 * - the new echelons arrive as strokes, a theater's six X's as twelve of them.
 *
 * Read off what each renderer actually produced: OpenLayers' resolved styles, the sources
 * MapLibre was handed, and the paint list the canvas was asked to draw.
 */
import {vi} from 'vitest';
import VectorSource from 'ol/source/Vector';
import CircleStyle from 'ol/style/Circle';
import type Style from 'ol/style/Style';
import type {StyleFunction} from 'ol/style/Style';
import {fromLonLat} from 'ol/proj';
import type {Feature as GeoFeature, Geometry} from 'geojson';
import {
    TACTICAL_GRAPHIC_KEY,
    TacticalGraphicEchelon,
    TacticalGraphicName,
    toSnapshot,
    type Paint,
    type TacticalGraphicProperties,
} from '@zaes/tactical-graphics';
import type {TacticalGraphicHandler} from './openlayers/openlayersAdapter';
import type {TacticalGraphicsManager} from './openlayers/TacticalGraphicsManager';
import {restoreTacticalGraphics, serializeTacticalGraphics} from './openlayers/persistence';
import {createTacticalGraphics} from './maplibre/createTacticalGraphics';
import {NativeLayerRenderer} from './maplibre/native/NativeLayerRenderer';
import {GRAPHIC_ID_PROPERTY} from './maplibre/native/paintToLayers';
import {buildTacticalGraphic} from './maplibre/maplibreAdapter';

const frames: Paint[][] = [];
vi.mock('./maplibre/canvas/paintToCanvas', () => ({
    paintToCanvas: (_ctx: unknown, paints: Paint[]) => void frames.push(paints),
}));
const {CanvasOverlayRenderer} = await import('./maplibre/canvas/CanvasOverlayRenderer');

type XY = [number, number];

/** A rectangle about 15 km across, with the four middles of its edges in Web Mercator. */
const [WEST, SOUTH, EAST, NORTH] = [8.0, 46.0, 8.2, 46.14];
const RING: XY[] = [[WEST, SOUTH], [EAST, SOUTH], [EAST, NORTH], [WEST, NORTH], [WEST, SOUTH]];
const MIDDLES: Record<string, XY> = {
    south: fromLonLat([(WEST + EAST) / 2, SOUTH]) as XY,
    east: fromLonLat([EAST, (SOUTH + NORTH) / 2]) as XY,
    north: fromLonLat([(WEST + EAST) / 2, NORTH]) as XY,
    west: fromLonLat([WEST, (SOUTH + NORTH) / 2]) as XY,
};
const ZOOM = 10;
/** Web Mercator meters a pixel at `ZOOM`, which OpenLayers is asked to style at. */
const RES = 156_543.033_928 / 2 ** ZOOM;

const filed = (properties: Omit<TacticalGraphicProperties, 'name'>, name = TacticalGraphicName.BattlePosition): GeoFeature<Geometry> => ({
    type: 'Feature',
    geometry: {type: 'Polygon', coordinates: [RING]},
    properties: {symbolId: 'bp', graphicName: name, [TACTICAL_GRAPHIC_KEY]: {name, ...properties}},
});

/** What one renderer drew: every stroked line in Web Mercator, and how many dots. */
interface Drawn {
    lines: XY[][];
    dots: number;
}

// ── OpenLayers ──────────────────────────────────────────────────────────────

const fakeManager = () => ({
    renderingVectorSource: new VectorSource(),
    graphicControllers: [] as TacticalGraphicHandler[],
    map: {getView: () => ({on: () => undefined, getResolution: () => RES})},
    watchResolution: () => undefined,
    unwatchResolution: () => undefined,
    releaseAllGraphics: () => undefined,
    setSelection: () => undefined,
} as unknown as TacticalGraphicsManager);

function openLayers(feature: GeoFeature<Geometry>): Drawn & {refiled: Record<string, unknown>} {
    const manager = fakeManager();
    const report = restoreTacticalGraphics(manager, toSnapshot([feature]));
    expect(report.failed).toEqual([]);
    const drawn: Drawn = {lines: [], dots: 0};
    for (const f of manager.renderingVectorSource.getFeatures()) {
        const fn = f.getStyleFunction() as StyleFunction | undefined;
        const resolved = fn ? fn(f, RES) : f.getStyle();
        const styles = (Array.isArray(resolved) ? resolved : resolved ? [resolved] : []) as Style[];
        for (const style of styles) {
            if (style.getImage() instanceof CircleStyle) drawn.dots++;
            if (!style.getStroke()) continue;
            const geometry = style.getGeometry();
            const g = (typeof geometry === 'function' ? geometry(f) : geometry ?? f.getGeometry()) as {getType(): string; getCoordinates(): unknown} | undefined;
            if (g?.getType() === 'LineString') drawn.lines.push(g.getCoordinates() as XY[]);
            if (g?.getType() === 'MultiLineString') drawn.lines.push(...(g.getCoordinates() as XY[][]));
        }
    }
    const snapshot = serializeTacticalGraphics(manager);
    return {...drawn, refiled: (snapshot.features[0].properties?.[TACTICAL_GRAPHIC_KEY] ?? {}) as Record<string, unknown>};
}

// ── MapLibre, native layers ─────────────────────────────────────────────────

/** Just enough of `maplibregl.Map` for the native renderer and the engine. */
class FakeMap {
    zoom = ZOOM;
    private readonly layers = new Map<string, {id: string}>();
    readonly sources = new Map<string, {data: unknown; setData(d: unknown): void}>();
    getZoom = () => this.zoom;
    getBearing = () => 0;
    getPitch = () => 0;
    getCenter = () => ({lng: (WEST + EAST) / 2, lat: (SOUTH + NORTH) / 2});
    on = () => undefined;
    off = () => undefined;
    setGlyphs = () => undefined;
    hasImage = () => true;
    addImage = () => undefined;
    project = () => ({x: 0, y: 0});
    unproject = () => ({lng: 0, lat: 0});
    queryRenderedFeatures = () => [];
    getCanvasContainer = () => null;
    private readonly canvas = document.createElement('canvas');
    getCanvas = () => this.canvas;
    dragPan = {enable: () => undefined, disable: () => undefined};
    getLayer = (id: string) => this.layers.get(id);
    getStyle = () => ({layers: Array.from(this.layers.values())});
    removeLayer = (id: string) => this.layers.delete(id);
    removeSource = (id: string) => this.sources.delete(id);
    setLayoutProperty = () => undefined;
    setFilter = () => undefined;
    moveLayer = () => undefined;
    setPaintProperty = () => undefined;
    addSource = (id: string, spec: {data: unknown}) => {
        this.sources.set(id, {data: spec.data, setData(d: unknown) { this.data = d; }});
    };
    getSource = (id: string) => this.sources.get(id);
    addLayer = (layer: {id: string}) => void this.layers.set(layer.id, layer);
    getBounds = () => ({getWest: () => -180, getEast: () => 180, getSouth: () => -85, getNorth: () => 85});
}

function mapLibreNative(feature: GeoFeature<Geometry>): Drawn & {refiled: Record<string, unknown>} {
    const map = new FakeMap();
    const renderer = new NativeLayerRenderer(map as never);
    const engine = createTacticalGraphics(map as never, {renderer});
    engine.restore(toSnapshot([feature]));
    renderer.flush();
    const drawn: Drawn = {lines: [], dots: 0};
    for (const {data} of Array.from(map.sources.values())) {
        type F = {geometry: {type: string; coordinates: unknown}; properties?: Record<string, unknown>};
        for (const f of (data as {features?: F[]}).features ?? []) {
            if (!f.properties?.[GRAPHIC_ID_PROPERTY]) continue;
            const {type, coordinates} = f.geometry;
            if (type === 'Point' && f.properties.radius !== undefined) drawn.dots++;
            if (f.properties.width === undefined) continue;
            const toXY = (run: XY[]) => run.map(p => fromLonLat(p) as XY);
            if (type === 'LineString') drawn.lines.push(toXY(coordinates as XY[]));
            if (type === 'MultiLineString') drawn.lines.push(...(coordinates as XY[][]).map(toXY));
        }
    }
    const refiled = (engine.snapshot().features[0].properties?.[TACTICAL_GRAPHIC_KEY] ?? {}) as Record<string, unknown>;
    engine.destroy();
    return {...drawn, refiled};
}

// ── MapLibre, canvas overlay ────────────────────────────────────────────────

function canvasMap() {
    const listeners: Record<string, () => void> = {};
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', {value: 1600});
    Object.defineProperty(canvas, 'clientHeight', {value: 1200});
    return {
        getCanvasContainer: () => container,
        getCanvas: () => canvas,
        getCenter: () => ({lng: (WEST + EAST) / 2, lat: (SOUTH + NORTH) / 2}),
        getZoom: () => ZOOM,
        getBearing: () => 0,
        getPitch: () => 0,
        project: ([lng, lat]: [number, number]) => ({x: lng * 10, y: -lat * 10}),
        unproject: ([x, y]: [number, number]) => ({lng: x / 10, lat: -y / 10}),
        on: (event: string, fn: () => void) => void (listeners[event] = fn),
        off: () => undefined,
        triggerRepaint: () => listeners.render?.(),
    };
}

function mapLibreCanvas(feature: GeoFeature<Geometry>): Drawn {
    frames.length = 0;
    const renderer = new CanvasOverlayRenderer(canvasMap() as never);
    const bag = {...(feature.properties?.[TACTICAL_GRAPHIC_KEY] as TacticalGraphicProperties)};
    const {name, ...properties} = bag;
    renderer.add(buildTacticalGraphic(name, feature.geometry as never, properties, RES)!);
    const paints = frames[frames.length - 1] ?? [];
    renderer.destroy();
    const drawn: Drawn = {lines: [], dots: paints.filter(p => p.circle).length};
    for (const p of paints) {
        if (!p.stroke) continue;
        if (p.geometry.type === 'LineString') drawn.lines.push(p.geometry.coordinates as XY[]);
        if (p.geometry.type === 'MultiLineString') drawn.lines.push(...(p.geometry.coordinates as XY[][]));
    }
    return drawn;
}

// ── The questions ───────────────────────────────────────────────────────────

const RENDERERS: Array<[string, (f: GeoFeature<Geometry>) => Drawn]> = [
    ['OpenLayers', openLayers],
    ['MapLibre native', mapLibreNative],
    ['MapLibre canvas', mapLibreCanvas],
];

function distanceToLines(lines: XY[][], [px, py]: XY): number {
    let best = Infinity;
    for (const run of lines) {
        for (let i = 0; i < run.length - 1; i++) {
            const [[ax, ay], [bx, by]] = [run[i], run[i + 1]];
            const [dx, dy] = [bx - ax, by - ay];
            const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
            best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
        }
    }
    return best;
}

/** The sides whose middle no ink reaches. A battalion's two bars stand either side of it. */
const openSides = (drawn: Drawn): string[] =>
    Object.entries(MIDDLES).filter(([, at]) => distanceToLines(drawn.lines, at) > 3 * RES).map(([side]) => side);

beforeEach(() => void (frames.length = 0));

describe.each(RENDERERS)('%s', (_label, draw) => {
    it.each([
        {openingDirection: undefined, side: 'south'},
        {openingDirection: 0, side: 'west'},
        {openingDirection: 180, side: 'east'},
        {openingDirection: 270, side: 'north'},
    ])('opens a battle position on its $side edge for openingDirection $openingDirection', ({openingDirection, side}) => {
        for (const name of [TacticalGraphicName.BattlePosition, TacticalGraphicName.BattlePositionPreparedButNotOccupied, TacticalGraphicName.StrongPoint]) {
            const drawn = draw(filed({echelon: TacticalGraphicEchelon.battalionSquadron, openingDirection}, name));
            expect(drawn.lines.length).toBeGreaterThan(0);
            expect(openSides(drawn)).toEqual([side]);
        }
    });

    it('draws no dot for a battle position or boundary with no echelon, and one for a squad', () => {
        expect(draw(filed({})).dots).toBe(0);
        expect(draw(filed({echelon: TacticalGraphicEchelon.unknown})).dots).toBe(0);
        expect(openSides(draw(filed({})))).toEqual(['south']);
        expect(draw(filed({echelon: TacticalGraphicEchelon.squad})).dots).toBe(1);

        const boundary = (echelon?: TacticalGraphicEchelon): GeoFeature<Geometry> => ({
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: [[WEST, SOUTH], [EAST, SOUTH]]},
            properties: {symbolId: 'b', graphicName: TacticalGraphicName.Boundary, [TACTICAL_GRAPHIC_KEY]: {name: TacticalGraphicName.Boundary, echelon}},
        });
        const none = draw(boundary());
        expect(none.dots).toBe(0);
        // The line is whole: its middle has ink.
        expect(distanceToLines(none.lines, MIDDLES.south)).toBeLessThan(RES);
        expect(draw(boundary(TacticalGraphicEchelon.squad)).dots).toBe(1);
    });

    it.each([
        {echelon: TacticalGraphicEchelon.teamCrew, strokes: 2},
        {echelon: TacticalGraphicEchelon.command, strokes: 4},
        {echelon: TacticalGraphicEchelon.army, strokes: 8},
        {echelon: TacticalGraphicEchelon.regionTheater, strokes: 12},
    ])('draws $echelon as $strokes strokes in the break', ({echelon, strokes}) => {
        const bare = draw(filed({}));
        const marked = draw(filed({echelon}));
        expect(marked.lines.length - bare.lines.length).toBe(strokes);
        expect(marked.dots).toBe(0);
    });
});

describe('the field survives a save', () => {
    it.each([
        ['OpenLayers', openLayers],
        ['MapLibre native', mapLibreNative],
    ] as const)('on %s', (_label, draw) => {
        const {refiled} = draw(filed({echelon: TacticalGraphicEchelon.command, openingDirection: 180}));
        expect(refiled.openingDirection).toBe(180);
    });
});
