/**
 * # The gray center dot moves a graphic in translate, and does nothing anywhere else
 *
 * A user grabbed Isolate's center handle in `edit` and the circle grew. `onPointerDown`
 * latched the press as a drag on the center, but `applyGesture` honored that only in
 * translate, so an `edit` drag fell through to the stretch branch and resized about the
 * center with the press's own distance from it as the lever. Measured in the demo with a
 * press 2 px off the dot: radius 180 km to 4,399 km.
 *
 * OpenLayers is the reference, and on the same press it leaves the graphic alone and pans
 * the map: its center dot is `inert` and `handleDownEvent` declines it unless translating.
 * So the press is not claimed here either, and panning stays enabled.
 *
 * @see MapLibreInteractions.onPointerDown, MapLibreInteractions.applyGesture
 */

import type {Position} from 'geojson';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {MapLibreInteractions} from './MapLibreInteractions';
import {buildTacticalGraphic, type MapLibreTacticalGraphic} from '../maplibreAdapter';

const RES = 1200;
const PX_PER_DEGREE = 10;
const RECT = {left: 40, top: 50};
/** Where the graphic sits, in lon/lat, and so its center dot in map pixels. */
const CENTER: Position = [10, -5];
const CENTER_PX = {x: CENTER[0] * PX_PER_DEGREE, y: -CENTER[1] * PX_PER_DEGREE};
const RADIUS = 180000;
/** The handle index the renderer reports as the center. Its value is arbitrary here. */
const CENTER_HANDLE = 1;

function stubMap(handlers: Record<string, (event: unknown) => void>) {
    return {
        on: (name: string, fn: (event: unknown) => void) => {
            handlers[name] = fn;
        },
        off: () => {},
        getZoom: () => Math.log2(40075016.68557849 / (512 * RES)),
        project: ([lng, lat]: [number, number]) => ({x: lng * PX_PER_DEGREE, y: -lat * PX_PER_DEGREE}),
        unproject: ([x, y]: [number, number]) => ({lng: x / PX_PER_DEGREE, lat: -y / PX_PER_DEGREE}),
        getCanvasContainer: () => ({getBoundingClientRect: () => ({left: RECT.left, top: RECT.top})}),
        getCanvas: () => ({style: {}}),
        dragPan: {
            enabled: true,
            enable() { this.enabled = true; },
            disable() { this.enabled = false; },
            isEnabled() { return this.enabled; },
        },
    };
}

function stubRenderer(graphic: MapLibreTacticalGraphic) {
    return {
        selection: graphic.id,
        find: () => graphic,
        hitTest: () => ({id: graphic.id}),
        // The press lands on the center dot, whatever the renderer's own hit test would say.
        hitTestHandle: () => ({graphic, index: CENTER_HANDLE}),
        centerHandleOf: () => CENTER_HANDLE,
        replace: (_id: string, next: MapLibreTacticalGraphic) => {
            graphic = next;
        },
        setMeasure: () => {},
        select: () => {},
        setHandleMode: () => {},
        setVertexHint: () => {},
        setCursor: () => {},
        clearSelection: () => {},
        get current() { return graphic; },
    };
}

const isolate = () =>
    buildTacticalGraphic(TacticalGraphicName.Isolate, {type: 'Point', coordinates: CENTER}, {radius: RADIUS, rotation: 0}, RES)!;

const pointer = (type: string, x: number, y: number) => {
    const event = new Event(type, {bubbles: true});
    Object.assign(event, {clientX: RECT.left + x, clientY: RECT.top + y});
    return event;
};

/** Presses 2 px off the center dot in `mode`, drags 40,25 px through the window, releases. */
function dragCenter(mode: string) {
    const handlers: Record<string, (event: unknown) => void> = {};
    const renderer = stubRenderer(isolate());
    const map = stubMap(handlers);
    const interactions = new MapLibreInteractions(map as never, renderer as never);
    interactions.setMode(mode as never);

    const press = {x: CENTER_PX.x + 2, y: CENTER_PX.y};
    handlers.mousedown?.({point: press, lngLat: {lng: press.x / PX_PER_DEGREE, lat: -press.y / PX_PER_DEGREE}});
    const panAfterPress = map.dragPan.isEnabled();
    for (let i = 1; i <= 10; i++) window.dispatchEvent(pointer('pointermove', press.x + 4 * i, press.y + 2.5 * i));
    window.dispatchEvent(pointer('pointerup', press.x + 40, press.y + 25));

    const graphic = renderer.current;
    return {
        radius: graphic.properties.radius as number,
        center: (graphic.base.geometry as {coordinates: Position}).coordinates,
        panAfterPress,
    };
}

describe('a press on the gray center dot', () => {
    it.each(['edit', 'modify', 'resize', 'rotate'])('is not claimed in %s, so the graphic is unchanged and the map pans', mode => {
        const {radius, center, panAfterPress} = dragCenter(mode);
        expect(radius).toBe(RADIUS);
        expect(center[0]).toBeCloseTo(CENTER[0], 9);
        expect(center[1]).toBeCloseTo(CENTER[1], 9);
        expect(panAfterPress).toBe(true);
    });

    // The control: the same press does reach the graphic, and in translate it moves it by
    // the drag without touching its size.
    it('moves the graphic in translate', () => {
        const {radius, center, panAfterPress} = dragCenter('translate');
        expect(radius).toBe(RADIUS);
        expect(center[0]).toBeCloseTo(CENTER[0] + 4, 6);
        expect(center[1]).toBeCloseTo(CENTER[1] - 2.5, 6);
        expect(panAfterPress).toBe(false);
    });

    // `applyGesture` holds the rule on its own too, for a drag latched on the center that
    // reaches it outside translate.
    it('leaves the graphic alone if a center drag reaches applyGesture in edit', () => {
        const graphic = isolate();
        const interactions = new MapLibreInteractions(stubMap({}) as never, stubRenderer(graphic) as never);
        const reach = interactions as unknown as {mode: string; dragging: Record<string, unknown> | null; dragTo(to: Position): void};
        const origin: Position = [CENTER[0] + 0.2, CENTER[1]];
        reach.mode = 'edit';
        reach.dragging = {
            graphic, vertex: -1, insertAt: -1, onCenter: true, onPivot: false, handle: CENTER_HANDLE,
            origin, start: {geometry: graphic.base.geometry, properties: graphic.properties},
            started: true, startPixel: {x: origin[0] * PX_PER_DEGREE, y: -origin[1] * PX_PER_DEGREE},
        };
        reach.dragTo([origin[0] + 4, origin[1] - 2.5]);
        const next = (reach.dragging as unknown as {graphic: MapLibreTacticalGraphic}).graphic;
        expect(next.properties.radius).toBe(RADIUS);
    });
});
