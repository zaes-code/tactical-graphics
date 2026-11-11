/**
 * # Removing and dimming one graphic on the canvas overlay
 *
 * The third renderer's twin of `maplibre/hostDisplay.test.ts` and
 * `openlayers/hostDisplay.test.ts`: the same contract, read off the paint list each frame
 * hands to the canvas. @see CanvasOverlayRenderer.remove
 * @see CanvasOverlayRenderer.setOpacity
 */

import {vi} from 'vitest';
import {TacticalGraphicName, type Paint} from '@zaes/tactical-graphics';
import {buildTacticalGraphic} from '../maplibreAdapter';

const frames: Paint[][] = [];
vi.mock('./paintToCanvas', () => ({
    paintToCanvas: (_ctx: unknown, paints: Paint[]) => void frames.push(paints),
}));

// After the mock, so the renderer picks it up.
const {CanvasOverlayRenderer} = await import('./CanvasOverlayRenderer');

/** Just enough of `maplibregl.Map` for the overlay. `triggerRepaint` draws at once. */
function fakeMap() {
    const listeners: Record<string, () => void> = {};
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', {value: 800});
    Object.defineProperty(canvas, 'clientHeight', {value: 600});
    return {
        getCanvasContainer: () => container,
        getCanvas: () => canvas,
        getCenter: () => ({lng: 0, lat: 0}),
        getZoom: () => 5,
        getBearing: () => 0,
        getPitch: () => 0,
        project: ([lng, lat]: [number, number]) => ({x: lng * 10, y: -lat * 10}),
        unproject: ([x, y]: [number, number]) => ({lng: x / 10, lat: -y / 10}),
        on: (event: string, fn: () => void) => void (listeners[event] = fn),
        off: () => undefined,
        triggerRepaint: () => listeners.render?.(),
    };
}

const phaseLine = (id: string) => ({
    ...buildTacticalGraphic(
        TacticalGraphicName.PhaseLine,
        {
            type: 'LineString',
            coordinates: [
                [-1, 0],
                [0, 0.5],
                [1, 0],
            ],
        },
        {designation: 'BLUE'},
    )!,
    id,
});

/** Every stroke and text color on the last frame. */
const lastColors = () => (frames[frames.length - 1] ?? []).flatMap(p => [p.stroke?.color, p.text?.fill].filter((c): c is string => !!c));

describe('the canvas overlay', () => {
    beforeEach(() => void (frames.length = 0));

    it('removes one graphic and leaves the rest', () => {
        const renderer = new CanvasOverlayRenderer(fakeMap() as never);
        renderer.add(phaseLine('a'));
        renderer.add(phaseLine('b'));
        const both = frames[frames.length - 1].length;

        expect(renderer.remove('nobody')).toBe(false);
        expect(renderer.remove('a')).toBe(true);
        expect(renderer.find('a')).toBeUndefined();
        expect(renderer.count).toBe(1);
        expect(frames[frames.length - 1].length).toBe(both / 2);
        expect(renderer.snapshot().features.map(f => f.properties?.symbolId)).toEqual(['b']);
        renderer.destroy();
    });

    it('fades one graphic on the next frame, and puts it back at 1', () => {
        const renderer = new CanvasOverlayRenderer(fakeMap() as never);
        renderer.add(phaseLine('a'));
        const before = lastColors();
        expect(before.length).toBeGreaterThan(0);

        expect(renderer.setOpacity('a', 0.4)).toBe(true);
        expect(renderer.opacityOf('a')).toBe(0.4);
        expect(lastColors().every(c => /rgba\(.*,\s*0\.4\)$/.test(c))).toBe(true);

        renderer.setOpacity('a', 1);
        expect(lastColors()).toEqual(before);
        renderer.destroy();
    });

    it('keeps opacity as view state: not in the snapshot, gone with remove and clear', () => {
        const renderer = new CanvasOverlayRenderer(fakeMap() as never);
        renderer.add(phaseLine('a'));
        renderer.setOpacity('a', 0.5);
        expect(JSON.stringify(renderer.snapshot())).not.toContain('opacity');

        renderer.clear();
        expect(renderer.opacityOf('a')).toBe(1);

        renderer.add(phaseLine('a'));
        renderer.setOpacity('a', 0.5);
        renderer.remove('a');
        expect(renderer.setOpacity('a', 0.5)).toBe(false);
        expect(renderer.opacityOf('a')).toBe(1);
        renderer.destroy();
    });
});
