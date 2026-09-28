/**
 * Where the native renderer's text comes from: the glyphs URL it puts on the style and the
 * font stack its symbol layers name.
 *
 * Both used to be constants, so every production deployment drew its labels from MapLibre's
 * public demo server whatever its own style said. The defaults must stay exactly that (no
 * existing consumer changes), a host's own values must reach every place text is drawn, and
 * `glyphs: false` must leave the style's own URL alone.
 */
import {createTacticalGraphics, DEFAULT_FONT_STACK, DEFAULT_GLYPHS_URL, NativeLayerRenderer} from '../index';

interface RecordedLayer {
    id: string;
    type: string;
    layout?: Record<string, unknown>;
}

/** Just enough of `maplibregl.Map` to construct the renderer and the façade. */
function fakeMap() {
    const layers: RecordedLayer[] = [];
    const setGlyphs = vi.fn();
    const map = {
        layers,
        setGlyphs,
        getZoom: () => 5,
        getBearing: () => 0,
        // `destroy` clears, and a clear schedules a rebuild, which culls to the view.
        getBounds: () => ({getWest: () => -10, getEast: () => 10, getSouth: () => -10, getNorth: () => 10}),
        getStyle: () => ({layers}),
        queryRenderedFeatures: () => [],
        setLayoutProperty: () => undefined,
        setPaintProperty: () => undefined,
        setFilter: () => undefined,
        moveLayer: () => undefined,
        hasImage: () => true,
        addImage: () => undefined,
        project: () => ({x: 0, y: 0}),
        on: () => undefined,
        off: () => undefined,
        addSource: () => undefined,
        getSource: () => undefined,
        getLayer: (id: string) => layers.find(l => l.id === id),
        removeLayer: () => undefined,
        removeSource: () => undefined,
        addLayer: (layer: RecordedLayer) => {
            layers.push(layer);
        },
    };
    return map;
}

/** Every `text-font` any text layer was built with, by layer id. The icon layer draws no text. */
function textFonts(map: ReturnType<typeof fakeMap>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const layer of map.layers) if (layer.layout && 'text-field' in layer.layout) out[layer.id] = layer.layout?.['text-font'];
    return out;
}

/** The three text layers the renderer owns; a new one should be added here. */
const TEXT_LAYERS = ['tg-symbol', 'tg-symbol-turned', 'tg-measure-label'];

describe('NativeLayerRenderer glyphs and font stack', () => {
    it('defaults to the demo glyph server and Noto Sans Bold, as before', () => {
        const map = fakeMap();
        new NativeLayerRenderer(map as never);

        expect(DEFAULT_GLYPHS_URL).toBe('https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf');
        expect(DEFAULT_FONT_STACK).toBe('Noto Sans Bold');
        expect(map.setGlyphs).toHaveBeenCalledTimes(1);
        expect(map.setGlyphs).toHaveBeenCalledWith(DEFAULT_GLYPHS_URL);

        const fonts = textFonts(map);
        expect(Object.keys(fonts).sort()).toEqual([...TEXT_LAYERS].sort());
        for (const id of TEXT_LAYERS) expect(fonts[id]).toEqual(['Noto Sans Bold']);
    });

    it('sets a host glyphs URL and names a host stack on every text layer', () => {
        const map = fakeMap();
        const glyphs = 'https://tiles.example.test/fonts/{fontstack}/{range}.pbf';
        new NativeLayerRenderer(map as never, {glyphs, fontStack: ['Open Sans Semibold', 'Arial Unicode MS Bold']});

        expect(map.setGlyphs).toHaveBeenCalledTimes(1);
        expect(map.setGlyphs).toHaveBeenCalledWith(glyphs);
        const fonts = textFonts(map);
        for (const id of TEXT_LAYERS) expect(fonts[id]).toEqual(['Open Sans Semibold', 'Arial Unicode MS Bold']);
    });

    it('takes a single font name as a one-entry stack', () => {
        const map = fakeMap();
        new NativeLayerRenderer(map as never, {fontStack: 'Roboto Bold'});
        for (const id of TEXT_LAYERS) expect(textFonts(map)[id]).toEqual(['Roboto Bold']);
    });

    it('never touches the style glyphs when told not to', () => {
        const map = fakeMap();
        new NativeLayerRenderer(map as never, {glyphs: false});
        expect(map.setGlyphs).not.toHaveBeenCalled();
        // The stack still defaults; the host's style has to serve it.
        for (const id of TEXT_LAYERS) expect(textFonts(map)[id]).toEqual([DEFAULT_FONT_STACK]);
    });
});

describe('createTacticalGraphics glyphs and font stack', () => {
    it('keeps the defaults when given neither', () => {
        const map = fakeMap();
        createTacticalGraphics(map as never).destroy();
        expect(map.setGlyphs).toHaveBeenCalledWith(DEFAULT_GLYPHS_URL);
        for (const id of TEXT_LAYERS) expect(textFonts(map)[id]).toEqual([DEFAULT_FONT_STACK]);
    });

    it('hands both options to the renderer it constructs', () => {
        const map = fakeMap();
        const glyphs = '/fonts/{fontstack}/{range}.pbf';
        createTacticalGraphics(map as never, {glyphs, fontStack: 'Open Sans Bold'}).destroy();
        expect(map.setGlyphs).toHaveBeenCalledWith(glyphs);
        for (const id of TEXT_LAYERS) expect(textFonts(map)[id]).toEqual(['Open Sans Bold']);
    });

    it('passes glyphs: false through', () => {
        const map = fakeMap();
        createTacticalGraphics(map as never, {glyphs: false}).destroy();
        expect(map.setGlyphs).not.toHaveBeenCalled();
    });

    it('refuses glyph options alongside a renderer it did not construct, rather than ignoring them', () => {
        const map = fakeMap();
        const renderer = new NativeLayerRenderer(map as never);
        expect(() => createTacticalGraphics(map as never, {renderer, fontStack: 'Open Sans Bold'})).toThrow(/NativeLayerRenderer/);
        expect(() => createTacticalGraphics(map as never, {renderer, glyphs: false})).toThrow(/NativeLayerRenderer/);
        // A renderer on its own is still fine.
        expect(() => createTacticalGraphics(map as never, {renderer}).destroy()).not.toThrow();
    });
});
