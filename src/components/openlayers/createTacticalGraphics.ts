/**
 * # `createTacticalGraphics` — the OpenLayers half of the shared façade
 *
 * The same function, with the same signature and the same return type, as the one
 * `@zaes/tactical-graphics/maplibre` exports. A consumer changes the import line and
 * nothing else. @see TacticalGraphicsEngine
 *
 * It is a thin wrapper, and deliberately so: `TacticalGraphicsManager` already owns the
 * interactions and `persistence.ts` already owns save and restore. What was missing was
 * never behavior, it was a *shape* — the demo had assembled these calls into an
 * engine-agnostic object and kept it to itself.
 */

import type {Map} from 'ol';
import type {FeatureCollection} from 'geojson';
import {
    TacticalGraphicName,
    allowedGestures,
    type AllowedGestures,
    type EditMode,
    type GestureKind,
    type SelectedGraphic,
    type SelectionBox,
    type EngineCallbacks,
    type EngineCapabilities,
    type TacticalGraphicsEngine,
} from '@zaes/tactical-graphics';
import {InteractionType, TacticalGraphicsManager} from './TacticalGraphicsManager';
import {clearAllGraphics, restoreTacticalGraphics, serializeOneGraphic, serializeTacticalGraphics} from './persistence';
import type {TacticalGraphicHandler} from './openlayersAdapter';

/** Options for {@link createTacticalGraphics}. */
export interface OpenLayersEngineOptions extends EngineCallbacks {
    /**
     * An existing manager to wrap, instead of constructing one.
     *
     * For a host that already builds its own — the façade is additive, and adopting it
     * should not mean giving up a manager you are already holding.
     */
    manager?: TacticalGraphicsManager;
}

/**
 * The portable `EditMode` ↔ this engine's numeric `InteractionType`.
 *
 * The translation lives here rather than in either enum because neither should have to
 * know about the other: `InteractionType` predates the façade and is part of this
 * subpath's published surface, and `EditMode` has to be renderer-neutral to be worth
 * having.
 */
const TO_INTERACTION: Record<EditMode, InteractionType> = {
    view: InteractionType.view,
    edit: InteractionType.edit,
    translate: InteractionType.translate,
    rotate: InteractionType.rotate,
    resize: InteractionType.resize,
    modify: InteractionType.modify,
    drawing: InteractionType.drawing,
};

const FROM_INTERACTION = (mode: InteractionType): EditMode =>
    (Object.keys(TO_INTERACTION) as EditMode[]).find(key => TO_INTERACTION[key] === mode) ?? 'view';

/** Every gesture is implemented here. @see EngineCapabilities */
const CAPABILITIES: EngineCapabilities = {draw: true, edit: true, io: true};

/**
 * Tactical graphics on an OpenLayers map.
 *
 * Adds the rendering layer to `map` and wires the draw, modify and pointer
 * interactions. Call `destroy()` to take them off again.
 */
export function createTacticalGraphics(map: Map, options: OpenLayersEngineOptions = {}): TacticalGraphicsEngine {
    const manager = options.manager ?? new TacticalGraphicsManager(map);

    // The manager reports a mode it chose itself — finishing a draw returns to view —
    // and a host driving a toolbar has to hear about that or its buttons go stale.
    manager.onInteractionModeChange = (mode: InteractionType) => options.onModeChange?.(FROM_INTERACTION(mode));

    const setInteractionMode = (mode: EditMode) => manager.setInteractionMode(TO_INTERACTION[mode]);

    /**
     * The selection as the portable façade describes it.
     *
     * Built from the holder's own base feature rather than the source, so the geometry
     * and the `tacticalGraphic` bag are the ones the graphic is actually being drawn
     * from — the same object `snapshot()` would write.
     */
    const asSelected = (controller: TacticalGraphicHandler | undefined): SelectedGraphic | null => {
        if (!controller) return null;
        return {
            id: controller.getSymbolId(),
            name: manager.graphicNameOf(controller) as TacticalGraphicName,
            base: serializeOneGraphic(controller),
        };
    };

    manager.onSelectionChange = controller => options.onSelect?.(asSelected(controller));

    return {
        capabilities: CAPABILITIES,

        getSelection: () => asSelected(manager.getSelection()),

        select(id: string | null) {
            manager.setSelection(id === null ? undefined : manager.getFeatureControllerBySymbolId(id));
        },

        selectionGestures(): AllowedGestures | null {
            const controller = manager.getSelection();
            if (!controller) return null;
            const name = manager.graphicNameOf(controller);
            // No stamp at all means no graphic to answer for — offering the permissive
            // default here is how a Screen came to advertise a resize it refuses.
            return name ? allowedGestures(name) : null;
        },

        selectionBox: (): SelectionBox | undefined => manager.selectionBox(),

        beginGesture: (kind: GestureKind, event: PointerEvent) => manager.beginGesture(kind, event),

        startDrawing(name: TacticalGraphicName) {
            setInteractionMode('drawing');
            manager.startDrawing(name);
        },

        cancelDrawing() {
            // Through the mode, which is the door the manager itself uses: leaving
            // `drawing` tears the Draw interaction down and restores double-click zoom.
            setInteractionMode('view');
        },

        setInteractionMode,
        getInteractionMode: () => FROM_INTERACTION(manager.currentMode),

        clearAll() {
            // `clearAllGraphics`, not a bare `renderingVectorSource.clear()`. The source
            // holds the features; the manager also holds a controller per graphic and a
            // zoom subscription per controller, and clearing only the source empties the
            // screen while leaving all of that behind — every orphaned listener still
            // re-deriving geometry for a feature nobody can see.
            clearAllGraphics(manager);
            setInteractionMode('view');
            options.onChange?.();
        },

        snapshot: () => serializeTacticalGraphics(manager),

        restore(snapshot: FeatureCollection) {
            clearAllGraphics(manager);
            restoreTacticalGraphics(manager, snapshot);
            options.onChange?.();
        },

        refreshStyles() {
            // Explicit rather than waiting for the next frame: `ol/Object.set` and a
            // config write both leave a feature's cached style in place, and only
            // `changed()` dispatches the event that re-runs the style function.
            manager.renderingVectorSource.forEachFeature(feature => feature.changed());
        },

        destroy() {
            clearAllGraphics(manager);
            manager.releaseAllGraphics?.();
            manager.removeModifyInteraction();
            // Give the map its double-click zoom back. A host that destroys its engine after
            // every draw would otherwise leave the map's own interaction detached, and leave
            // a listener behind to re-attach it partway through the *next* draw — which is
            // what made a draw end on a double-click that also zoomed the map.
            manager.restoreDoubleClickZoomNow();
            map.removeLayer(manager.renderingVectorLayer);
        },
    };
}
