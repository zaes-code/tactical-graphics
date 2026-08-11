/**
 * # `createTacticalGraphics` — the MapLibre half of the shared façade
 *
 * The same function, with the same signature and the same return type, as the one
 * `@zaes/tactical-graphics/openlayers` exports. A consumer changes the import line and
 * nothing else. @see TacticalGraphicsEngine
 *
 * This is the half the façade was most needed for. OpenLayers had a single object a
 * host could hold; MapLibre had two — a renderer and an interaction layer — that had to
 * be constructed in the right order and handed to each other. That assembly is not a
 * decision a consumer benefits from making, so it happens here.
 */

import type {Map as MapLibreMap} from 'maplibre-gl';
import type {FeatureCollection} from 'geojson';
import {
    TACTICAL_GRAPHIC_KEY,
    TacticalGraphicName,
    type EditMode,
    type EngineCallbacks,
    type EngineCapabilities,
    type TacticalGraphicProperties,
    type TacticalGraphicsEngine,
} from '@zaes/tactical-graphics';
import {NativeLayerRenderer} from './native/NativeLayerRenderer';
import {MapLibreInteractions, type EditMode as InteractionMode} from './interaction/MapLibreInteractions';
import {buildTacticalGraphic} from './maplibreAdapter';
import {resolutionOf} from './projection';

/** Options for {@link createTacticalGraphics}. */
export interface MapLibreEngineOptions extends EngineCallbacks {
    /** An existing renderer to wrap, instead of constructing one. */
    renderer?: NativeLayerRenderer;
}

/** Every gesture is implemented here. @see EngineCapabilities */
const CAPABILITIES: EngineCapabilities = {draw: true, edit: true, io: true};

/**
 * `drawing` has no counterpart in the interaction layer's own mode set — a draw there
 * is armed by `startDraw` and tracked separately — so it maps to `view`, which is what
 * a drag means while a draw is in progress.
 */
const toInteractionMode = (mode: EditMode): InteractionMode => (mode === 'drawing' ? 'view' : mode);

/**
 * Tactical graphics on a MapLibre map.
 *
 * Adds the sources and layers to `map` and binds the pointer handlers. Call `destroy()`
 * to take them off again.
 */
export function createTacticalGraphics(map: MapLibreMap, options: MapLibreEngineOptions = {}): TacticalGraphicsEngine {
    const renderer = options.renderer ?? new NativeLayerRenderer(map);
    let mode: EditMode = 'view';

    const interactions = new MapLibreInteractions(map, renderer, {
        onChange: () => options.onChange?.(),
        onSelect: graphic =>
            options.onSelect?.(graphic ? {id: graphic.id, name: graphic.name, base: graphic.base} : null),
        onDrawEnd: () => {
            // A finished draw leaves `drawing` behind, exactly as OpenLayers does.
            if (mode === 'drawing') setMode('view');
            options.onDrawEnd?.();
        },
    });

    function setMode(next: EditMode): void {
        mode = next;
        interactions.setMode(toInteractionMode(next));
        options.onModeChange?.(next);
    }

    return {
        capabilities: CAPABILITIES,

        startDrawing(name: TacticalGraphicName) {
            mode = 'drawing';
            interactions.startDraw(name);
            options.onModeChange?.('drawing');
        },

        cancelDrawing() {
            interactions.cancelDraw();
            setMode('view');
        },

        setInteractionMode: setMode,
        getInteractionMode: () => mode,

        clearAll() {
            renderer.clear();
            setMode('view');
            options.onChange?.();
        },

        snapshot: () => renderer.snapshot(),

        restore(snapshot: FeatureCollection) {
            renderer.clear();
            const resolution = resolutionOf(map);
            for (const feature of snapshot.features ?? []) {
                const properties = (feature.properties ?? {})[TACTICAL_GRAPHIC_KEY] as TacticalGraphicProperties | undefined;
                if (!properties?.name || !feature.geometry) continue;
                // Rebuilt through the generator from the saved description rather than
                // restored as drawn output, which is what makes a graphic saved in the
                // other engine arrive **editable** rather than as a picture of itself.
                const graphic = buildTacticalGraphic(properties.name, feature.geometry, properties, resolution);
                if (graphic) renderer.add(graphic);
            }
            options.onChange?.();
        },

        refreshStyles: () => renderer.realise(),

        destroy() {
            interactions.destroy();
            renderer.clear();
            renderer.destroy?.();
        },
    };
}
