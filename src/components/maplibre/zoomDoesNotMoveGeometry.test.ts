/**
 * # A zoom never moves a graphic, or what it saves
 *
 * A snapshot holds no viewport, and geometry round-trips in meters, so nothing about a graphic
 * may depend on the zoom it is looked at. MapLibre used to rebuild every graphic with a baked
 * decoration (bridge, gap, the fords, wire, direction arrows) at the new resolution on each
 * zoom, a leftover from when OpenLayers did the same. The decoration grew and shrank with the
 * zoom, and from the second zoom on the re-derived size was filed as if stated: an imported
 * bridge saved a different `radius` than it was loaded with. OpenLayers builds the decoration
 * once, at the resolution the graphic was drawn at, and so does this now. (User, 2026-10-24.)
 */
import type {FeatureCollection} from 'geojson';
import {TacticalGraphicName, toSnapshot} from '@zaes/tactical-graphics';
import {createTacticalGraphics} from './createTacticalGraphics';
import {NativeLayerRenderer} from './native/NativeLayerRenderer';

/** Just enough of `maplibregl.Map` for the renderer and the interaction layer. */
class FakeMap {
    zoom = 5;
    private readonly layers = new Map<string, {id: string; paint?: Record<string, unknown>}>();
    private readonly sources = new Map<string, {data: unknown; setData(d: unknown): void}>();

    getZoom = () => this.zoom;
    getBearing = () => 0;
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
        this.sources.set(id, {
            data: spec.data,
            setData(d: unknown) {
                this.data = d;
            },
        });
    };
    getSource = (id: string) => this.sources.get(id);
    addLayer = (layer: {id: string}) => void this.layers.set(layer.id, layer);
    getBounds = () => ({getWest: () => -180, getEast: () => 180, getSouth: () => -85, getNorth: () => 85});
}

/** A bridge as OpenLayers saves one: three drawn points and the decoration size it states. */
const bridgeFile = (): FeatureCollection =>
    toSnapshot([
        {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [
                    [0, 0],
                    [1, 0],
                    [0.5, 0.2],
                ],
            },
            properties: {
                role: 'base',
                symbolId: 'b',
                graphicName: TacticalGraphicName.Bridge,
                tacticalGraphic: {name: TacticalGraphicName.Bridge, radius: 180000},
            },
        },
        {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [
                    [2, 0],
                    [3, 0.3],
                ],
            },
            properties: {
                role: 'base',
                symbolId: 'w',
                graphicName: TacticalGraphicName.WireDoubleFence,
                tacticalGraphic: {name: TacticalGraphicName.WireDoubleFence},
            },
        },
    ]);

describe('a zoom on MapLibre', () => {
    it('leaves every graphic and its saved description as they were', () => {
        const map = new FakeMap();
        const renderer = new NativeLayerRenderer(map as never);
        const engine = createTacticalGraphics(map as never, {renderer});
        engine.restore(bridgeFile());
        renderer.realize();
        const geometry = () => ['b', 'w'].map(id => JSON.stringify(renderer.find(id)?.graphic.geometry));
        const before = {geometry: geometry(), saved: JSON.stringify(engine.snapshot())};

        for (const zoom of [9, 12, 3]) {
            map.zoom = zoom;
            renderer.realize();
            expect(geometry()).toEqual(before.geometry);
            expect(JSON.stringify(engine.snapshot())).toBe(before.saved);
        }
        expect(JSON.parse(before.saved).features[0].properties.tacticalGraphic.radius).toBe(180000);
    });
});
