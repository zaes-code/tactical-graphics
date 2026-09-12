/**
 * # Once the pointer is down, the gesture owns it — not the map
 *
 * MapLibre stops dispatching its own `mousemove` and `mouseup` partway through a gesture that
 * travels far enough in one step: its handler manager claims the pointer and the map's event
 * stream goes quiet. Measured on the running app, a drag delivered as two pointer moves had
 * its second move **and its mouseup** swallowed, while a `window` listener on the same page
 * saw every one of them.
 *
 * Two things followed, and the second is the worse:
 *
 * - the gesture ended wherever the last delivered move left it, so a tip drag came out at
 *   exactly half the distance the cursor travelled; and
 * - `endDrag` never ran, so the drag state stayed latched, `onChange` never fired, and
 *   **`dragPan` was left disabled** — the map could not be panned again.
 *
 * So a drag is driven from `window` from the moment the pointer goes down, which is what
 * `beginGesture` already does for a host's affordance. This suite holds that: the map is
 * asked for the pointer-down and then told nothing further, and the gesture still has to
 * advance and end.
 *
 * jsdom dispatches real `window` events, so this exercises the actual listeners rather than
 * a stand-in for them.
 */

import type {Position} from 'geojson';
import {TacticalGraphicName, normalizeDrawnBase} from '@zaes/tactical-graphics';
import {MapLibreInteractions} from './MapLibreInteractions';
import {buildTacticalGraphic, type MapLibreTacticalGraphic} from '../maplibreAdapter';

/** Ground metres per pixel, and the zoom that produces it. */
const RES = 1200;
/** Screen pixels per degree, so a drag can be written in degrees. */
const PX_PER_DEGREE = 10;

/** Where the map container sits on the page, so client pixels and map pixels differ. */
const RECT = {left: 40, top: 50};

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
        hitTestHandle: () => undefined,
        centerHandleOf: () => -1,
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

function line(): MapLibreTacticalGraphic {
    const coords = normalizeDrawnBase(TacticalGraphicName.PhaseLine, [[0, 0], [2, 0.4], [4, 0]] as Position[], RES) as Position[];
    return buildTacticalGraphic(TacticalGraphicName.PhaseLine, {type: 'LineString', coordinates: coords}, {rotation: 0}, RES)!;
}

const pointer = (type: string, clientX: number, clientY: number) => {
    const event = new Event(type, {bubbles: true});
    Object.assign(event, {clientX, clientY});
    return event;
};

/**
 * Presses at `from`, then delivers `moves` through **window** only, and releases — the map
 * is told nothing after the pointer went down.
 */
function dragThroughWindow(moves: Array<[number, number]>, release = true) {
    const handlers: Record<string, (event: unknown) => void> = {};
    const graphic = line();
    const renderer = stubRenderer(graphic);
    const map = stubMap(handlers);
    const interactions = new MapLibreInteractions(map as never, renderer as never);
    interactions.setMode('translate');

    const [startX, startY] = [RECT.left + 200, RECT.top + 100];
    handlers.mousedown?.({
        point: {x: 200, y: 100},
        lngLat: {lng: 20, lat: -10},
    });

    for (const [x, y] of moves) window.dispatchEvent(pointer('pointermove', RECT.left + x, RECT.top + y));
    if (release) window.dispatchEvent(pointer('pointerup', RECT.left + moves[moves.length - 1][0], RECT.top + moves[moves.length - 1][1]));

    return {graphic: renderer.current, panEnabled: map.dragPan.isEnabled(), startX, startY};
}

/** The base's coordinates, for comparing two paths. */
const points = (graphic: MapLibreTacticalGraphic) =>
    (graphic.base.geometry as {coordinates: Position[]}).coordinates;

describe('a drag the map stops reporting', () => {
    it('advances on a window pointermove, with nothing from the map', () => {
        const before = points(line());
        const {graphic} = dragThroughWindow([[260, 60]]);
        const after = points(graphic);
        // Something moved, which is the whole point: the map stream was silent throughout.
        expect(Math.hypot(after[0][0] - before[0][0], after[0][1] - before[0][1])).toBeGreaterThan(1);
    });

    /**
     * **The one the defect was named after.** Two moves and ten moves along the same path have
     * to land in the same place; before this, the second move was never delivered and the
     * graphic stopped halfway.
     */
    it('lands in the same place whether the path arrives in two moves or ten', () => {
        const to: [number, number] = [260, 60];
        const twoMoves = dragThroughWindow([[230, 80], to]);
        const tenMoves = dragThroughWindow(
            Array.from({length: 10}, (_, i) => [200 + (60 * (i + 1)) / 10, 100 - (40 * (i + 1)) / 10] as [number, number]),
        );
        const [a, b] = [points(twoMoves.graphic), points(tenMoves.graphic)];
        // **Both paths have to have moved something first.** Two drags that each did nothing
        // agree perfectly, which is exactly what this asserted before the control run said so.
        const start = points(line());
        expect(Math.hypot(a[0][0] - start[0][0], a[0][1] - start[0][1])).toBeGreaterThan(1);
        expect(a).toHaveLength(b.length);
        a.forEach((p, i) => {
            expect(p[0]).toBeCloseTo(b[i][0], 6);
            expect(p[1]).toBeCloseTo(b[i][1], 6);
        });
    });

    /**
     * **And the worse half.** A `mouseup` the map never dispatched left `dragPan` disabled for
     * the rest of the session, so the operator could no longer pan the map at all.
     */
    it('gives panning back when the pointer is released through the window', () => {
        expect(dragThroughWindow([[230, 80], [260, 60]]).panEnabled).toBe(true);
    });

    it('keeps panning disabled while the drag is still held', () => {
        expect(dragThroughWindow([[230, 80]], false).panEnabled).toBe(false);
    });
});
