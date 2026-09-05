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
    allowedGestures,
    applyAmplifierAliases,
    type AllowedGestures,
    type EditMode,
    type GestureKind,
    type SelectedGraphic,
    type SelectionBox,
    type EngineCallbacks,
    type EngineCapabilities,
    type TacticalGraphicProperties,
    type TacticalGraphicsEngine,
} from '@zaes/tactical-graphics';
import {NativeLayerRenderer} from './native/NativeLayerRenderer';
import {MapLibreInteractions, type EditMode as InteractionMode} from './interaction/MapLibreInteractions';
import {amplifiersHidden} from '../amplifierVisibility';
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

    /** The selection as the portable façade describes it. */
    const asSelected = (): SelectedGraphic | null => {
        const id = renderer.selection;
        const graphic = id ? renderer.find(id) : undefined;
        return graphic ? {id: graphic.id, name: graphic.name, base: graphic.base} : null;
    };

    return {
        capabilities: CAPABILITIES,

        getSelection: asSelected,

        select(id: string | null) {
            renderer.select(id);
            options.onSelect?.(asSelected());
        },

        selectionGestures(): AllowedGestures | null {
            const selected = asSelected();
            return selected ? allowedGestures(selected.name) : null;
        },

        selectionBox: (): SelectionBox | undefined => interactions.selectionBox(),

        beginGesture: (kind: GestureKind, event: PointerEvent) => interactions.beginGesture(kind, event),

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
                const props = feature.properties ?? {};
                const stored = props[TACTICAL_GRAPHIC_KEY] as TacticalGraphicProperties | undefined;
                // @see applyAmplifierAliases — a snapshot may predate the 3.0.0 rename.
                const properties = stored && applyAmplifierAliases(stored);
                if (!properties?.name || !feature.geometry) continue;
                // Rebuilt through the generator from the saved description rather than
                // restored as drawn output, which is what makes a graphic saved in the
                // other engine arrive **editable** rather than as a picture of itself.
                const graphic = buildTacticalGraphic(properties.name, feature.geometry, properties, resolution);
                if (!graphic) continue;

                /*
                 * **The saved `symbolId` is the graphic's identity, and it was being thrown
                 * away here.** `buildTacticalGraphic` mints a fresh `mlb-N`, so a graphic
                 * handed over from OpenLayers arrived under a new name — while OpenLayers'
                 * own restore has always adopted the incoming id. The two directions
                 * disagreed, and anything the host keys by id lost track of the graphic on
                 * one leg of the round trip.
                 *
                 * Which is exactly what happened to the "name only" choice: it is remembered
                 * per graphic id, so it survived OpenLayers → MapLibre and not the way back.
                 */
                const id = typeof props.symbolId === 'string' && props.symbolId ? props.symbolId : graphic.id;
                renderer.add({...graphic, id, graphic: {...graphic.graphic, hideAmplifiers: amplifiersHidden(id) || undefined},
                    labels: graphic.labels ? {...graphic.labels, hideAmplifiers: amplifiersHidden(id) || undefined} : undefined});
            }
            options.onChange?.();
        },

        refreshStyles: () => renderer.realize(),

        destroy() {
            interactions.destroy();
            renderer.clear();
            renderer.destroy?.();
        },
    };
}
