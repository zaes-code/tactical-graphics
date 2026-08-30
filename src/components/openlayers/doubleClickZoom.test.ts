/**
 * # Double-click zoom belongs to the map, not to a manager
 *
 * A free-form line draw ends on a double-click, so the map's `DoubleClickZoom` is pulled
 * off for the duration and put back on the next press that is not the second half of that
 * double-click. That much has worked since the interaction was first suspended.
 *
 * What it did not survive was **more than one manager on one map**. A host may build a
 * fresh engine for every draw and destroy it afterwards — the Spearhead UI does exactly
 * that — and each manager held its own idea of whether the zoom was detached. The second
 * manager looked for a `DoubleClickZoom`, found none because the first had removed it, and
 * recorded that it had nothing to restore; meanwhile the first manager's armed listener was
 * still on the viewport and reinstalled the zoom on the next press. For a host that
 * destroys its engine at `drawend`, that press is the first click of the *next* draw — so
 * the draw ran with the zoom installed and the double-click that ended it zoomed the map.
 *
 * The suspension is keyed on the map now, and `destroy()` gives it back.
 */

import Map from 'ol/Map';
import View from 'ol/View';
import DoubleClickZoom from 'ol/interaction/DoubleClickZoom';
import {createTacticalGraphics} from './createTacticalGraphics';
import {TacticalGraphicName} from '@zaes/tactical-graphics';

const hasZoom = (map: Map): boolean =>
    map.getInteractions().getArray().some(i => i instanceof DoubleClickZoom);

/**
 * jsdom has no `ResizeObserver`, and an OpenLayers `Map` given a target constructs one.
 * Stubbed here rather than in `setupTests` because this is the only suite that builds a
 * real map — a global shim would quietly change the environment every other suite runs in.
 */
beforeAll(() => {
    if (!('ResizeObserver' in window)) {
        (window as unknown as {ResizeObserver: unknown}).ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    }
});

function makeMap(): Map {
    const target = document.createElement('div');
    Object.defineProperty(target, 'clientWidth', {value: 800});
    Object.defineProperty(target, 'clientHeight', {value: 600});
    document.body.appendChild(target);
    return new Map({target, view: new View({center: [0, 0], zoom: 4})});
}

describe('the map keeps its double-click zoom', () => {
    it('is there to begin with', () => {
        expect(hasZoom(makeMap())).toBe(true);
    });

    it('goes while a draw is running', () => {
        const map = makeMap();
        const engine = createTacticalGraphics(map);
        engine.startDrawing(TacticalGraphicName.PhaseLine);
        expect(hasZoom(map)).toBe(false);
        engine.destroy();
    });

    it('comes back when the engine is destroyed', () => {
        const map = makeMap();
        const engine = createTacticalGraphics(map);
        engine.startDrawing(TacticalGraphicName.PhaseLine);
        engine.cancelDrawing();
        engine.destroy();
        expect(hasZoom(map)).toBe(true);
    });

    it('is still suspended during a second draw by a second engine', () => {
        // The reported defect, in the order it happens: draw, destroy, draw again.
        const map = makeMap();

        const first = createTacticalGraphics(map);
        first.startDrawing(TacticalGraphicName.PhaseLine);
        first.cancelDrawing();
        first.destroy();
        expect(hasZoom(map)).toBe(true);

        const second = createTacticalGraphics(map);
        second.startDrawing(TacticalGraphicName.PhaseLine);
        expect(hasZoom(map)).toBe(false);

        // And a press on the viewport must not reinstall it mid-draw.
        map.getViewport().dispatchEvent(new MouseEvent('mousedown', {bubbles: true, detail: 1}));
        expect(hasZoom(map)).toBe(false);

        second.destroy();
        expect(hasZoom(map)).toBe(true);
    });

    it('never leaves two copies on the map', () => {
        const map = makeMap();
        const a = createTacticalGraphics(map);
        a.startDrawing(TacticalGraphicName.PhaseLine);
        a.destroy();
        const b = createTacticalGraphics(map);
        b.startDrawing(TacticalGraphicName.PhaseLine);
        b.destroy();
        expect(map.getInteractions().getArray().filter(i => i instanceof DoubleClickZoom)).toHaveLength(1);
    });
});
