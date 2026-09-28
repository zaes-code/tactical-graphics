/**
 * # Both engines put an arc mission task's start point under the second click
 *
 * APP-06 gives all ten arc mission tasks the same rule: point 1 is the centre and point 2
 * is the graphic's **start point** and radius. The library states which graphics that is
 * and what rotation it means (`rotationFromDrawnPoint`); this suite draws each one through
 * each engine's own draw path and checks the start-point handle lands on the click, so a
 * renderer that stops asking the library shows up here rather than on the map.
 *
 * OpenLayers is driven through its controller's Circle-draw callbacks and MapLibre through
 * its click-to-graphic builder, with a stub map. Both report handles in projected metres.
 */
import Feature from 'ol/Feature';
import {Circle as CircleGeom, MultiPoint} from 'ol/geom';
import {fromLonLat} from 'ol/proj';
import type {Position} from 'geojson';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {MissionTaskController} from './controllers/MissionTaskController';
import {MapLibreInteractions} from '../maplibre/interaction/MapLibreInteractions';
import {rotate} from '../maplibre/interaction/editGeometry';
import {buildTacticalGraphic, type MapLibreTacticalGraphic} from '../maplibre/maplibreAdapter';

const RES = 2445.98;

const START_POINT_TASKS = [
    TacticalGraphicName.AreaDefense,
    TacticalGraphicName.Retain,
    TacticalGraphicName.Isolate,
    TacticalGraphicName.Occupy,
    TacticalGraphicName.Secure,
    TacticalGraphicName.CordonAndKnock,
    TacticalGraphicName.CordonAndSearch,
    TacticalGraphicName.Control,
    TacticalGraphicName.Deny,
    TacticalGraphicName.Locate,
];

const DIRECTIONS = [0, 60, 135, 180, 250, 300];

const CENTER: [number, number] = [10, 45];
/** Projected metres from centre to click. */
const REACH = 40_000;
/** A share of the reach: the click is a Mercator walk and the handle a geodesic one. */
const TOLERANCE = REACH * 0.005;

function clickAt(angleDeg: number): [number, number] {
    const [x, y] = fromLonLat(CENTER);
    const a = (angleDeg * Math.PI) / 180;
    return [x + REACH * Math.cos(a), y + REACH * Math.sin(a)];
}

/** OpenLayers: the Circle draw, as the manager drives it. */
function drawnOnOpenLayers(name: TacticalGraphicName, angleDeg: number): MissionTaskController {
    const controller = getController(name, RES) as MissionTaskController;
    const circle = new CircleGeom(fromLonLat(CENTER), 1);
    const feature = new Feature(circle);
    controller.onPointerMove({coordinate: clickAt(angleDeg)});
    controller.onDrawStartFunc({feature} as never);
    circle.setRadius(REACH);
    controller.onDrawEndFunc({feature} as never);
    return controller;
}

/** The edge handle OpenLayers ends the draw with, in EPSG:3857. */
function drawOnOpenLayers(name: TacticalGraphicName, angleDeg: number): number[] {
    return olHandle(drawnOnOpenLayers(name, angleDeg));
}

const stubMap = () => ({
    on: () => {},
    off: () => {},
    getZoom: () => Math.log2(40075016.68557849 / (512 * RES)),
    getCanvasContainer: () => null,
    project: ([lng, lat]: [number, number]) => ({x: lng, y: -lat}),
    unproject: ([x, y]: [number, number]) => ({lng: x, lat: -y}),
    dragPan: {enable: () => {}, disable: () => {}},
});

const stubRenderer = () => ({replace: () => {}, setMeasure: () => {}, find: () => undefined, selection: undefined});

/** Back to lon/lat with the same spherical Mercator OpenLayers uses. */
const R = 6378137;
const toLonLat = ([x, y]: number[]): Position => [(x / R) * (180 / Math.PI), (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI)];

/** MapLibre: the two clicks, through the same builder its draw and its preview use. */
function drawnOnMapLibre(name: TacticalGraphicName, angleDeg: number): MapLibreTacticalGraphic {
    const interactions = new MapLibreInteractions(stubMap() as never, stubRenderer() as never);
    const reach = interactions as unknown as {graphicFrom(n: TacticalGraphicName, v: Position[]): MapLibreTacticalGraphic | undefined};
    return reach.graphicFrom(name, [CENTER, toLonLat(clickAt(angleDeg))])!;
}

function drawOnMapLibre(name: TacticalGraphicName, angleDeg: number): number[] {
    return drawnOnMapLibre(name, angleDeg).handles[0] as number[];
}

/** The edge handle of an OpenLayers holder, in EPSG:3857. */
function olHandle(controller: MissionTaskController): number[] {
    const handles = controller.getFeatures().find(f => f.get('role') === 'handle');
    return (handles!.getGeometry() as MultiPoint).getCoordinates()[0];
}

describe.each(START_POINT_TASKS.map(n => [String(n), n] as const))('%s', (_label, name) => {
    it.each(DIRECTIONS)('OpenLayers puts the start point under a click at %s degrees', angle => {
        const [hx, hy] = drawOnOpenLayers(name, angle);
        const [cx, cy] = clickAt(angle);
        expect(Math.hypot(hx - cx, hy - cy)).toBeLessThan(TOLERANCE);
    });

    it.each(DIRECTIONS)('MapLibre puts the start point under a click at %s degrees', angle => {
        const [hx, hy] = drawOnMapLibre(name, angle);
        const [cx, cy] = clickAt(angle);
        expect(Math.hypot(hx - cx, hy - cy)).toBeLessThan(TOLERANCE);
    });
});

describe('a circular area is unchanged', () => {
    it.each(DIRECTIONS)('keeps its radius grip 45 degrees clockwise of a click at %s degrees, on both engines', angle => {
        const expected = clickAt(angle - 45);
        for (const [hx, hy] of [
            drawOnOpenLayers(TacticalGraphicName.FreeFireAreaCircular, angle),
            drawOnMapLibre(TacticalGraphicName.FreeFireAreaCircular, angle),
        ]) {
            expect(Math.hypot(hx - expected[0], hy - expected[1])).toBeLessThan(TOLERANCE);
        }
    });
});

/*
 * **A rotate drag on the start point keeps it under the cursor.** Neither engine turns a
 * point-anchored graphic to an absolute angle: each adds the angle the cursor swept about
 * the centre, so a grab that starts on the handle stays on it whatever offset the draw
 * filed. Pinned because the draw now files a rotation that is not the angle to the handle,
 * and a gesture that read that angle directly would put the handle 175 degrees off.
 */
describe('a rotate drag on the start point follows the cursor', () => {
    const TURNS = [40, -100, 170];

    it.each(TURNS)('OpenLayers, turned by %s degrees', turn => {
        const controller = drawnOnOpenLayers(TacticalGraphicName.Secure, 30);
        // The manager's own arithmetic: the angle swept about the turning point.
        const pivot = controller.getTurningPoint();
        const angleOf = (p: number[]) => Math.atan2(p[1] - pivot[1], p[0] - pivot[0]);
        const to = clickAt(30 + turn);
        controller.handleRotate(((angleOf(to) - angleOf(olHandle(controller))) * 180) / Math.PI);

        const [hx, hy] = olHandle(controller);
        expect(Math.hypot(hx - to[0], hy - to[1])).toBeLessThan(TOLERANCE);
    });

    it.each(TURNS)('MapLibre, turned by %s degrees', turn => {
        const name = TacticalGraphicName.Secure;
        const drawn = drawnOnMapLibre(name, 30);
        const to = clickAt(30 + turn);
        const turned = rotate({geometry: drawn.base.geometry, properties: drawn.properties}, toLonLat(drawn.handles[0] as number[]), toLonLat(to));
        const [hx, hy] = buildTacticalGraphic(name, turned.geometry, turned.properties, RES)!.handles[0] as number[];
        expect(Math.hypot(hx - to[0], hy - to[1])).toBeLessThan(TOLERANCE);
    });
});
