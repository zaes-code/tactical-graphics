/**
 * # Labels on both MapLibre renderers follow the view and keep clear of each other
 *
 * The native layers and the canvas overlay each run the core's pass (`paintWithClearance`) over
 * the graphics they hold. These pin that each one hands it the view: a label whose place is off
 * screen lands on it, and two labels that would sit on each other do not.
 * @see paintWithClearance
 */

import {vi} from 'vitest';
import {TacticalGraphicName, configureTacticalGraphics, resetTacticalGraphicsConfig, type Paint} from '@zaes/tactical-graphics';
import {buildTacticalGraphic} from './maplibreAdapter';
import {NativeLayerRenderer} from './native/NativeLayerRenderer';
import {zoomForResolution} from './projection';

const frames: Paint[][] = [];
vi.mock('./canvas/paintToCanvas', () => ({
    paintToCanvas: (_ctx: unknown, paints: Paint[]) => void frames.push(paints),
}));
const {CanvasOverlayRenderer} = await import('./canvas/CanvasOverlayRenderer');

/** The visible area in degrees, and the zoom that shows it 800 px wide. */
const VIEW = {west: -0.4, south: -0.3, east: 0.4, north: 0.3};
const ZOOM = zoomForResolution((0.8 * 111_320) / 800);

/** Just enough of `maplibregl.Map` for either renderer, looking at {@link VIEW}. */
function fakeMap() {
    const sources = new Map<
        string,
        {data: {features: Array<{geometry: {coordinates: number[]}; properties: Record<string, unknown>}>}; setData(d: unknown): void}
    >();
    const listeners: Record<string, () => void> = {};
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', {value: 800});
    Object.defineProperty(canvas, 'clientHeight', {value: 600});
    return {
        sources,
        getZoom: () => ZOOM,
        getBearing: () => 0,
        getPitch: () => 0,
        getCenter: () => ({lng: 0, lat: 0}),
        getBounds: () => ({getWest: () => VIEW.west, getEast: () => VIEW.east, getSouth: () => VIEW.south, getNorth: () => VIEW.north}),
        on: (event: string, fn: () => void) => void (listeners[event] = fn),
        off: () => undefined,
        triggerRepaint: () => listeners.render?.(),
        setGlyphs: () => undefined,
        hasImage: () => true,
        addImage: () => undefined,
        project: () => ({x: 0, y: 0}),
        unproject: () => ({lng: 0, lat: 0}),
        queryRenderedFeatures: () => [],
        getCanvasContainer: () => container,
        getCanvas: () => canvas,
        dragPan: {enable: () => undefined, disable: () => undefined},
        getLayer: () => undefined,
        getStyle: () => ({layers: []}),
        removeLayer: () => undefined,
        removeSource: () => undefined,
        setLayoutProperty: () => undefined,
        setFilter: () => undefined,
        moveLayer: () => undefined,
        setPaintProperty: () => undefined,
        addLayer: () => undefined,
        addSource: (id: string, spec: {data: never}) =>
            void sources.set(id, {
                data: spec.data,
                setData(d: never) {
                    this.data = d;
                },
            }),
        getSource: (id: string) => sources.get(id),
    };
}

const longLine = () =>
    buildTacticalGraphic(
        TacticalGraphicName.PhaseLine,
        {
            type: 'LineString',
            coordinates: [
                [-3, 0],
                [3, 0],
            ],
        },
        {designation: 'BLUE'},
    )!;

const ring = [
    [-0.1, -0.1],
    [0.1, -0.1],
    [0.1, 0.1],
    [-0.1, 0.1],
    [-0.1, -0.1],
];
const objective = (id: string, designation: string) => ({
    ...buildTacticalGraphic(TacticalGraphicName.ObjectiveArea, {type: 'Polygon', coordinates: [ring]}, {designation})!,
    id,
});

const inView = ([lon, lat]: number[]) => lon >= VIEW.west && lon <= VIEW.east && lat >= VIEW.south && lat <= VIEW.north;

afterEach(() => resetTacticalGraphicsConfig());

describe('the native layers', () => {
    /** Each label drawn, as its lon/lat and text. */
    const labels = (map: ReturnType<typeof fakeMap>) =>
        (map.sources.get('tg-symbols')?.data.features ?? [])
            .filter(f => f.properties.label)
            .map(f => ({at: f.geometry.coordinates, text: String(f.properties.label)}));

    it('put an off-screen label on the view', () => {
        const map = fakeMap();
        const renderer = new NativeLayerRenderer(map as never);
        renderer.add(longLine());
        renderer.flush();
        expect(labels(map).some(({at}) => inView(at))).toBe(true);
        renderer.destroy();
    });

    it('keep two labels that would land on each other apart', () => {
        const map = fakeMap();
        const renderer = new NativeLayerRenderer(map as never);
        renderer.add(objective('a', 'ALPHA'));
        renderer.add(objective('b', 'BRAVO'));
        renderer.flush();
        const alpha = labels(map).find(l => l.text.includes('ALPHA'))!;
        const bravo = labels(map).find(l => l.text.includes('BRAVO'))!;
        expect(Math.hypot(alpha.at[0] - bravo.at[0], alpha.at[1] - bravo.at[1])).toBeGreaterThan(0.001);
        renderer.destroy();
    });

    it('leave every label at its usual place when auto placement is off', () => {
        configureTacticalGraphics({autoPlaceLabels: false});
        const map = fakeMap();
        const renderer = new NativeLayerRenderer(map as never);
        renderer.add(longLine());
        renderer.add(objective('a', 'ALPHA'));
        renderer.add(objective('b', 'BRAVO'));
        renderer.flush();
        expect(
            labels(map)
                .filter(({text}) => text.includes('BLUE'))
                .some(({at}) => inView(at)),
        ).toBe(false);
        const alpha = labels(map).find(l => l.text.includes('ALPHA'))!;
        const bravo = labels(map).find(l => l.text.includes('BRAVO'))!;
        expect(Math.hypot(alpha.at[0] - bravo.at[0], alpha.at[1] - bravo.at[1])).toBeLessThan(1e-9);
        renderer.destroy();
    });
});

describe('the canvas overlay', () => {
    beforeEach(() => void (frames.length = 0));

    /** Each label on the last frame, as its projected point and text. */
    const labels = () =>
        (frames[frames.length - 1] ?? [])
            .filter(p => p.text?.text && p.geometry.type === 'Point')
            .map(p => ({at: p.geometry.coordinates as number[], text: p.text!.text}));

    it('puts an off-screen label on the view', () => {
        const renderer = new CanvasOverlayRenderer(fakeMap() as never);
        renderer.add(longLine());
        // The overlay's view is its own transform: 800 px either side of the center at this zoom.
        const halfWidthM = 0.4 * 111_320;
        expect(labels().some(({at: [x]}) => Math.abs(x) <= halfWidthM)).toBe(true);
        renderer.destroy();
    });

    it('keeps two labels that would land on each other apart', () => {
        const renderer = new CanvasOverlayRenderer(fakeMap() as never);
        renderer.add(objective('a', 'ALPHA'));
        renderer.add(objective('b', 'BRAVO'));
        const alpha = labels().find(l => l.text.includes('ALPHA'))!;
        const bravo = labels().find(l => l.text.includes('BRAVO'))!;
        expect(Math.hypot(alpha.at[0] - bravo.at[0], alpha.at[1] - bravo.at[1])).toBeGreaterThan(100);
        renderer.destroy();
    });

    it('leaves every label at its usual place when auto placement is off', () => {
        configureTacticalGraphics({autoPlaceLabels: false});
        const renderer = new CanvasOverlayRenderer(fakeMap() as never);
        renderer.add(longLine());
        renderer.add(objective('a', 'ALPHA'));
        renderer.add(objective('b', 'BRAVO'));
        const halfWidthM = 0.4 * 111_320;
        expect(
            labels()
                .filter(({text}) => text.includes('BLUE'))
                .some(({at: [x]}) => Math.abs(x) <= halfWidthM),
        ).toBe(false);
        const alpha = labels().find(l => l.text.includes('ALPHA'))!;
        const bravo = labels().find(l => l.text.includes('BRAVO'))!;
        expect(Math.hypot(alpha.at[0] - bravo.at[0], alpha.at[1] - bravo.at[1])).toBeLessThan(1e-6);
        renderer.destroy();
    });
});
