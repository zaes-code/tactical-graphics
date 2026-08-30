import VectorSource from "ol/source/Vector";
import VectorLayer from "ol/layer/Vector";
import openlayersAdapter, {TacticalGraphicHandler} from "./openlayersAdapter";
import {Feature, MapBrowserEvent} from "ol";
import {Draw, Modify, Pointer} from "ol/interaction";
import DoubleClickZoom from "ol/interaction/DoubleClickZoom";
import {FeatureLike} from "ol/Feature";
import {Map} from "ol";
import {DrawEvent} from "ol/interaction/Draw";
import Collection from "ol/Collection";
import {Style} from "ol/style";
import {ModifyEvent} from "ol/interaction/Modify";
import {MultiPoint, Point, Polygon} from "ol/geom";
import LineString from "ol/geom/LineString";
import {TacticalGraphicName, allowedGestures, generatorOrder, groundLength, handleRole, latitudeFromMercatorY, normalizeDrawnBase} from '@zaes/tactical-graphics';
import {fromLonLat, toLonLat} from 'ol/proj';
import {defaultDrawStyleFunc} from "./openlayerStyles";
import {Coordinate} from "ol/coordinate";
import {EventsKey} from "ol/events";
import {Extent, extend as extendExtent} from "ol/extent";
import {unByKey} from "ol/Observable";

export enum InteractionType {
    'resize',
    'rotate',
    'translate',
    'modify',
    'drawing',
    'view',
    /**
     * Select a graphic, then reshape it by its handles or drive a gesture from an
     * affordance the host draws. @see EditMode in the map-agnostic half.
     *
     * Added last so the existing numbers are unchanged — this enum is published
     * surface, and a consumer who stored one of these values keeps meaning what they
     * stored.
     */
    'edit'
}

/*
* Class used for interacting with the openlayers map
* Interactions include
*  - Drawing a new tactical graphic into a vector layer/source,
*  - Calculating the offset value for rotating, resizing, and repositioning a tactical graphic
*  - Adding a modify interaction for polygon/linestring like graphics to add or reposition existing vertices
* */

/**
 * How far from a graphic's center a resize drag has to start, in screen pixels,
 * before its scale ratio means anything. @see TacticalGraphicsManager.handleResize
 */
const MIN_RESIZE_ORIGIN_PX = 8;

/**
 * How far off the line, in screen pixels, a drag has to be before it counts as choosing a
 * side. Below this the graphic keeps the side it had, so jitter across the axis cannot
 * flip it back and forth. @see TacticalGraphicHandler.setMirrored
 */
const MIRROR_FLIP_MIN_PX = 6;

/**
 * The smallest width a drag may leave a graphic with, in meters.
 *
 * A width is a magnitude, so a drag past zero has to stop somewhere; at exactly zero the
 * rails collapse onto the centre line and several generators divide by it.
 */
const MIN_OFFSET_METERS = 1;

/**
 * The smallest a resize may leave a graphic, in meters.
 *
 * Not a legibility floor — those are the holders' business and come off for a deliberate
 * resize. This is the degenerate guard: with the floor lifted, a drag onto the resize
 * anchor would otherwise collapse the geometry to a point, which several generators
 * divide by.
 */
const MIN_RESIZED_SIZE_METERS = 1;

/**
 * How far from a graphic a selection click may land, in screen pixels.
 *
 * Generous, and deliberately more generous than MapLibre's 5 px body test, because the
 * shapes that are hardest to hit are the ones where a click is the *only* way in: a bowed
 * turn's centreline is empty map, and a bridge and a corridor draw nothing at all on the
 * line the user drew. At 6 px those graphics still read as unselectable, which in edit
 * mode reads as "the handles stopped working" — there is nothing to drag until something
 * is selected. Only for *selection* — the handle hit test in `handleDownEvent` stays
 * exact, because handles are drawn dots and a tolerance there would let one steal a
 * drag meant for its neighbour.
 */
const SELECT_HIT_TOLERANCE_PX = 10;

/**
 * How far past its own axis, in screen pixels, a handle has to be dragged before a
 * point-anchored graphic flips. Much larger than `MIRROR_FLIP_MIN_PX`: on these graphics a
 * handle drag normally means rotate, so the flip has to be a deliberate excursion rather
 * than anything a rotation could brush past.
 */
const MIRROR_PAST_AXIS_MIN_PX = 40;


export class TacticalGraphicsManager {
    // Sample vector source/layer to add tactical graphics to, this can be changed based on implementation.
    renderingVectorSource = new VectorSource();
    /**
     * `updateWhileAnimating` / `updateWhileInteracting` default to `false`, which makes OL
     * scale the last rendered canvas as a bitmap for the whole zoom and only re-run the
     * style functions once it settles. Every label is sized by a style function against the
     * current resolution, so that default shows the label at the wrong size for the whole
     * gesture and snaps it at the end. Re-batching per frame is the cost of labels that
     * track the zoom continuously; turn these off again if a host with far more features
     * than a tactical picture holds needs the frame budget back.
     */
    renderingVectorLayer = new VectorLayer({
        /**
         * **Load-bearing — do not remove.** OL's `useContainer`
         * (`ol/renderer/canvas/Layer.js`) makes consecutive rendered layers that share a
         * className reuse the *same* canvas element. With the default `ol-layer`, this
         * layer composited straight into the basemap's canvas, so any CSS filter a host
         * put on the basemap silently repainted every tactical graphic too. The demo's
         * dark-mode `invert()` did exactly that: it was what turned black strokes white,
         * and what crushed pending yellow to a near-black olive. A distinct className is
         * what keeps the graphics on their own canvas and their own colors.
         */
        className: 'tg-graphics',
        source: this.renderingVectorSource,
        updateWhileAnimating: true,
        updateWhileInteracting: true,
    });

    // track the last pointer position for offset calculations
    lastPointerPosition: any;

    // track the currently clicked tactical graphic
    activeController: TacticalGraphicHandler | undefined;
    activeFeature: Feature | undefined;

    // store the created tactical graphics, each containing a symbolId for a unique reference
    graphicControllers: TacticalGraphicHandler[] = [];

    /**
     * One `change:resolution` subscription per live handler.
     *
     * A graphic whose geometry is a screen-pixel constant times the map
     * resolution — every security operation, and every graphic built the same
     * way — only holds its on-screen size if something re-derives it when the
     * zoom changes. That something is `onResolutionChangeFunc`, and it does
     * nothing at all unless it is subscribed. A path that adds features without
     * subscribing produces a graphic pinned in *map* units, which grows and
     * shrinks with the zoom; that is what `drawProvenSamples` used to do.
     *
     * Kept rather than fire-and-forget so the listeners can be dropped again.
     * They used not to be: draw and restore each attached one and never removed
     * it, so a canceled draw leaked one and a sample sweep — which clears and
     * redraws two hundred graphics — leaked a couple of hundred per press, every
     * one of them still re-deriving a graphic that had been removed from the map.
     *
     * A list of pairs and not a `Map`, because `Map` is OpenLayers' `Map` in this
     * module and the built-in has no name here. The scan is linear, over a list
     * the size of the graphics on the map, and only on subscribe/unsubscribe.
     */
    private resolutionKeys: {handler: TacticalGraphicHandler; key: EventsKey}[] = [];

    // current interaction mode, toggled by an external caller
    currentMode: InteractionType = InteractionType.view;

    /**
     * The graphic the operator is working on, or `undefined`.
     *
     * **New with `edit` mode, and the thing OpenLayers never had.** The four gesture
     * modes light up every graphic on the map at once, so "which one am I editing" was
     * answered afresh at each pointer-down and forgotten at pointer-up — there was no
     * state to ask. `edit` mode needs a persistent answer, because the chrome a host
     * draws around the selection has to survive a pan, a zoom and the gaps between
     * drags.
     *
     * Held as the controller rather than a feature or an id: it is what every gesture
     * is applied to, and the alternatives are both one lookup away from it.
     */
    private selectedController: TacticalGraphicHandler | undefined;

    /** Notified whenever the selection changes, including when a graphic is removed. */
    onSelectionChange?: (controller: TacticalGraphicHandler | undefined) => void;

    /**
     * The gesture a host's affordance started, held for the duration of that drag.
     *
     * `edit` is not itself a gesture — a drag inside it means "reshape", the same as
     * `modify`. When the host presses a rotate or resize affordance, the drag has to
     * mean *that* instead, without the mode changing under the operator and without
     * every other graphic's handles reacting. So the gesture is latched here, consulted
     * by `effectiveMode`, and dropped on pointer-up.
     */
    private activeGesture: InteractionType | undefined;

    /**
     * What a drag means right now: the latched gesture if one is running, else the mode.
     *
     * Every drag path switches on this rather than on `currentMode`, which is what lets
     * one `edit` mode host all four gestures. In the four legacy gesture modes it is
     * just `currentMode`, so their behaviour is untouched.
     */
    private effectiveMode = (): InteractionType => this.activeGesture ?? this.currentMode;

    /**
     * Whether the drag in progress came from a host's affordance rather than a handle.
     *
     * The distinction matters wherever a drag path asks *which handle* it started on:
     * an affordance started on none, and means the graphic as a whole.
     */
    private isAffordanceGesture = (): boolean => this.activeGesture !== undefined;

    // openlayer references.
    map: Map;
    draw: Draw | undefined = undefined;
    modify: Modify | undefined = undefined;
    /** @see handleResize — latched at pointer-down, for the whole gesture. */
    private resizeOriginNearCenter: boolean = false;
    /**
     * Which vertex of a MultiPoint handle feature the gesture started on, or -1.
     * Latched at pointer-down: a graphic whose handles each mean something
     * different (the range fans, one rim per band) needs to know *which* dot was
     * grabbed, and the feature alone cannot say.
     */
    private activeHandleIndex: number = -1;
    /** @see handleVertexDrag — index into the base geometry, latched at pointer-down. */
    private activeBaseVertex: number = -1;
    /**
     * The cursor's perpendicular offset when a width drag began, and the width the
     * graphic had then. Both latched on the first move of the gesture and cleared on
     * release, so the drag applies a *change*. @see handleOffset
     */
    private offsetGrabPerpendicular: number | undefined;
    private offsetGrabWidth: number | undefined;
    /**
     * How far the cursor was from the resize origin when the drag began, and what size
     * the graphic had then. Latched on the first move and cleared on release, so the
     * size tracks the cursor absolutely rather than accumulating. @see handleResize
     */
    private resizeStartDistance: number | undefined;
    private resizeStartSize: number | undefined;
    /**
     * Handle position minus cursor position at pointer-down, so a drag carries the
     * handle from where it was grabbed rather than snapping it to the pointer.
     * @see handleDownEvent
     */
    private handleGrabOffset: Coordinate | undefined;
    /**
     * The controller whose draw-time floor is currently lifted, so it can be put back
     * even if the selection or the active controller has moved on. @see handleResize
     */
    private floorSuspendedOn: TacticalGraphicHandler | undefined;
    lastDrawEndedAt: number = 0;
    private escKeyHandler: ((e: KeyboardEvent) => void) | undefined = undefined;
    /**
     * The DoubleClickZoom suspension is **per map, not per manager.**
     *
     * A host may build more than one manager on the same map — a fresh engine for each
     * draw, another for an edit session — and the interaction they are contending over
     * belongs to the map. Held per instance, the second manager looked for a
     * `DoubleClickZoom` the first had already removed, found none, and recorded that it had
     * nothing to restore; meanwhile the first manager's armed restore was still on the
     * viewport and put the zoom back on the next press — which, for a host that destroys
     * its engine after every draw, is the first click of the *next* draw. The draw then
     * ended on a double-click with the zoom installed, and the map jumped.
     */
    private static readonly zoomSuspensions = new WeakMap<Map, {zoom: DoubleClickZoom; unlisten?: () => void}>();

    // add layer and pointer interactions to an openlayers map reference.
    constructor(map: Map) {
        this.map = map;
        let pointerInteraction = this.getPointerInteraction();
        this.map.addInteraction(pointerInteraction);
        this.map.addLayer(this.renderingVectorLayer);
        this.map.on('pointermove', this.updateHoverCursor);
        this.map.on('singleclick', this.handleSelectClick);
    }

    /**
     * Click-to-select, in `edit` mode only.
     *
     * Bound unconditionally and gated inside, rather than added and removed with the
     * mode: a listener that goes on and off has to come off again on every path out,
     * and `destroy` is not the only one.
     *
     * A click that lands on nothing clears the selection — the operator pointing at
     * empty map is how they say "none of them", and leaving the last one selected keeps
     * chrome on screen for a graphic they have stopped working on.
     */
    private handleSelectClick = (evt: MapBrowserEvent): void => {
        if (!this.isEditing()) return;
        // The click that finished a draw is not a selection. Same guard, and the same
        // reason, as the properties dialog's. @see lastDrawEndedAt
        if (Date.now() < this.lastDrawEndedAt) return;
        this.setSelection(this.selectAtPixel(evt.pixel));
    };

    /**
     * Swap in a pointer cursor while hovering something a click or drag would
     * actually act on, so the affordance is visible before the user commits to
     * a gesture. Mirrors the same hit-testing a real interaction would do:
     * any feature in view mode (matching the dialog's click-to-open check),
     * only a live handle in the modes that drag one.
     */
    private updateHoverCursor = (evt: MapBrowserEvent): void => {
        if (evt.dragging || this.isDrawing()) return;
        const target = this.map.getTargetElement();
        if (!target) return;

        const hits: Feature[] = [];
        // The same tolerance the click uses, or the cursor promises a selection the
        // click then misses (and vice versa). @see SELECT_HIT_TOLERANCE_PX
        this.map.forEachFeatureAtPixel(
            evt.pixel,
            feature => {
                const asFeature = this.asFeature(feature);
                if (asFeature) hits.push(asFeature);
            },
            {hitTolerance: SELECT_HIT_TOLERANCE_PX},
        );

        let interactive: boolean;
        if (this.isEditing()) {
            /*
             * **Edit mode has two things worth pointing at, not one.**
             *
             * A live handle, as the four gesture modes do — and *any* graphic, because a
             * click here selects one. Reporting only the handle left the cursor an arrow
             * over every graphic on the map, so nothing said the click would do anything,
             * even though selecting is the primary gesture of the mode.
             */
            const centerGrabbable = this.isTranslating();
            interactive =
                hits.some(f => f.get('handle') && (!f.get('inert') || centerGrabbable)) ||
                hits.some(f => !!this.getFeatureController(f));
        } else if (this.enableHandleModes().includes(this.currentMode)) {
            const centerGrabbable = this.isTranslating();
            interactive = hits.some(f => f.get('handle') && (!f.get('inert') || centerGrabbable));
        } else {
            interactive = hits.length > 0;
        }

        target.style.cursor = interactive ? 'pointer' : '';
    };

    // the interaction modes that display markers on tactical graphics to let the user transform
    enableHandleModes = (): InteractionType[] => {
        return [
            InteractionType.rotate,
            InteractionType.resize,
            InteractionType.modify,
            InteractionType.translate,
            InteractionType.edit,
        ];
    };

    /**
     * Notified whenever the mode changes, including the changes the manager
     * makes on its own — `stopDrawing` drops back to `view` when a draw finishes
     * or is canceled. Without this the host's own copy of the mode silently
     * diverges: the demo's draw button stayed on "Drawing…" forever, because it
     * renders from React state that nothing was telling.
     *
     * Safe to point straight at a React setter: the host sets the mode on the
     * manager, the manager echoes the same value back, and React bails on an
     * unchanged value rather than looping.
     */
    onInteractionModeChange?: (mode: InteractionType) => void;

    setInteractionMode = (newMode: InteractionType) => {
        this.currentMode = newMode;
        // Leaving edit mode drops the selection: the chrome a host draws is keyed to it,
        // and a selection nothing is showing is a gesture waiting to surprise someone.
        if (newMode !== InteractionType.edit) this.setSelection(undefined);
        this.toggleHandleFeatures();
        this.toggleModifyInteraction();
        this.onInteractionModeChange?.(newMode);
    };

    /**
     * Selects a graphic, or clears the selection with `undefined`.
     *
     * Re-runs the handle visibility rule, because in `edit` mode the selection *is* that
     * rule. Fires `onSelectionChange` only on a real change, so a host may point it
     * straight at a React setter.
     */
    setSelection = (controller: TacticalGraphicHandler | undefined): void => {
        if (this.selectedController === controller) return;
        this.selectedController = controller;
        this.toggleHandleFeatures();
        // **Rebuild `Modify` as well.** In edit mode its feature collection is the
        // selection, so a selection change that did not rebuild it left the previous
        // graphic reshapeable and the new one inert.
        this.toggleModifyInteraction();
        this.onSelectionChange?.(controller);
    };

    /** The graphic being worked on, or `undefined`. @see setSelection */
    getSelection = (): TacticalGraphicHandler | undefined => this.selectedController;

    /**
     * Which graphic a controller is drawing, by scanning its features for the stamp.
     *
     * **Not `controller.graphic.base.get('graphicName')`, which is not reliable.** Some
     * holders replace their base feature with the one OpenLayers' `Draw` produced —
     * `SecurityOperationsController.setBaseFeature` does, on both draw start and draw
     * end — and that feature never carried the stamp `startDrawing` put on the holder's
     * own features. Reading the base alone therefore returned `undefined` for the
     * security operations, and `allowedGestures(undefined)` falls through to its
     * permissive default: a Screen offered a resize it refuses.
     *
     * `collectProperties` in `persistence.ts` sweeps every feature for the same reason.
     */
    graphicNameOf = (controller: TacticalGraphicHandler): TacticalGraphicName | undefined => {
        for (const feature of controller.getFeatures()) {
            const name = feature.get('graphicName') as TacticalGraphicName | undefined;
            if (name) return name;
        }
        return undefined;
    };

    /**
     * Which graphic a feature belongs to, for the click that selects.
     *
     * Handles and labels are as good an answer as line work here — a user clicking a
     * graphic's own label means that graphic — so this is just the controller lookup.
     */
    selectAtPixel = (pixel: number[]): TacticalGraphicHandler | undefined => {
        let found: TacticalGraphicHandler | undefined;
        this.map?.forEachFeatureAtPixel(
            pixel,
            feature => {
                if (found) return;
                const asFeature = this.asFeature(feature);
                if (asFeature) found = this.getFeatureController(asFeature);
            },
            // **A selection click needs a tolerance; OpenLayers defaults to zero.**
            // Line work is 2 px wide, so a pixel-exact hit test made a phase line
            // something you had to aim at rather than click. Worse, several families draw
            // *nothing* on the line the user drew — a bridge and an air corridor are two
            // rails offset either side of it — so the miss was the common case, not the
            // edge one. MapLibre's `hitTest` has always used a radius; this is the same
            // forgiveness, and it is what makes the two engines answer a click alike.
            {hitTolerance: SELECT_HIT_TOLERANCE_PX},
        );
        return found;
    };

    /**
     * Display the markers that let a user drag / resize / modify / rotate a graphic.
     *
     * **Two visibility rules, because the modes mean two different things.** The four
     * legacy gesture modes are global — the host has said "everything is rotatable now"
     * — so every graphic wears handles, which is what both engines have always done.
     * `edit` mode is per-graphic: the operator picked one, and only that one wears them.
     * Lighting up every graphic there would put a hundred red dots under the box the
     * host is drawing around a single symbol.
     */
    toggleHandleFeatures = (): void => {
        const anyVisible = this.enableHandleModes().includes(this.currentMode);
        // In edit mode an empty selection means *no* handles, not all of them — hence
        // the explicit `[]` rather than letting an undefined selection fall through to
        // the global rule.
        const selectedFeatures = this.isEditing() ? (this.selectedController?.getFeatures() ?? []) : undefined;
        this.getRenderedFeaturesByProp('handle').forEach(feature => {
            let visible = anyVisible && (!selectedFeatures || selectedFeatures.includes(feature));

            /*
             * **A rectangular zone's handles mean something again.**
             *
             * They were hidden in edit mode because a corner is a consequence of a box
             * rather than a point with a meaning of its own, and both engines refused to
             * drag one. The base is APP-06's two anchor points now — the centres of the
             * two opposing sides — and the third handle is the width, so all three are
             * live and hiding them would take away the only way to set a width.
             * @see RectangularAreaGraphicBase
             */
            feature.set('hidden', !visible);
            // The center dot is grabbable for a move and nothing else — see
            // `handleDownEvent`. Publish that so its style can color itself
            // accordingly rather than claiming "never draggable" in a mode where it is.
            if (feature.get('inert')) feature.set('grabbable', this.isTranslating());
        });
    };

    /**
     * **`edit` installs `Modify` too, and that is not optional.**
     *
     * Reshaping a line or a polygon is OpenLayers' `Modify` interaction, not this class:
     * `handleDownEvent` deliberately declines a reshape drag unless the controller opted
     * into `editStretches` or a mirror handle was grabbed, and lets `Modify` have
     * everything else. So a mode that shows handles but installs no `Modify` shows
     * handles that do nothing — and loses the blue "a drag here adds a vertex" marker,
     * which is `Modify`'s own default style rather than anything this repo draws.
     *
     * That is exactly what `edit` did when it was added, and both halves went together:
     * the handles stopped dragging and the vertex hint disappeared.
     */
    toggleModifyInteraction = (): void => {
        if (this.currentMode === InteractionType.modify || this.isEditing()) {
            this.addModifyInteraction();
        } else {
            this.removeModifyInteraction();
        }
    };

    // select features from the tactical graphics based on a property.
    getRenderedFeaturesByProp = (prop: string): Feature[] => {
        return this.renderingVectorSource.getFeatures().filter(feature => feature.get(prop));
    };

    /**
     * The three gesture predicates read {@link effectiveMode}, not `currentMode`.
     *
     * That single indirection is what makes `edit` mode work. A rotate affordance
     * latches `InteractionType.rotate` for the length of one drag, and every path that
     * already asked "am I rotating?" — `handlePointDrag`, `handleCircleDrag`,
     * `handleLineStringDrag`, `handlePolygonDrag`, the resize measure read-out — says
     * yes without knowing an affordance exists. No drag path was rewritten for this.
     */
    isRotating = (): boolean => {
        return this.effectiveMode() === InteractionType.rotate;
    };

    isResizing = (): boolean => {
        return this.effectiveMode() === InteractionType.resize;
    };

    isTranslating = (): boolean => {
        return this.effectiveMode() === InteractionType.translate;
    };

    /**
     * Reshaping. True in `edit` as well as `modify`, because a drag on a graphic's own
     * handle means "reshape it" in both — `edit` is `modify` plus a selection, a box and
     * the affordances. It is false while an affordance's gesture is latched.
     */
    isModifying = (): boolean => {
        const mode = this.effectiveMode();
        return mode === InteractionType.modify || mode === InteractionType.edit;
    };

    /** The unified mode: select a graphic, then use its handles or its affordances. */
    isEditing = (): boolean => {
        return this.currentMode === InteractionType.edit;
    };

    isDrawing = (): boolean => {
        return this.currentMode === InteractionType.drawing;
    };

    isViewing = (): boolean => {
        return this.currentMode === InteractionType.view;
    };

    getFeatureController = (feature: Feature): TacticalGraphicHandler | undefined => {
        return this.graphicControllers.find(controller => controller.getFeatures().includes(feature));
    };
    getFeatureControllerBySymbolId = (symbolId: string): TacticalGraphicHandler | undefined => {
        return this.graphicControllers.find(controller => controller.getSymbolId() === symbolId);
    };

    /**
     * Subscribes a handler to zoom changes, so its graphic re-derives and holds
     * its on-screen size. @see resolutionKeys for why this is not optional.
     *
     * Call it from ANY path that puts a handler's features on the map — draw,
     * restore, or a programmatic sweep. Idempotent: subscribing an already
     * watched handler is a no-op rather than a second listener.
     */
    watchResolution = (handler: TacticalGraphicHandler): void => {
        if (this.resolutionKeys.some(entry => entry.handler === handler)) return;
        const key = this.map.getView().on('change:resolution', handler.onResolutionChangeFunc) as EventsKey;
        this.resolutionKeys.push({handler, key});
    };

    /** Drops one handler's zoom subscription. Safe on a handler that has none. */
    unwatchResolution = (handler: TacticalGraphicHandler): void => {
        const index = this.resolutionKeys.findIndex(entry => entry.handler === handler);
        if (index < 0) return;
        unByKey(this.resolutionKeys[index].key);
        this.resolutionKeys.splice(index, 1);
    };

    /**
     * Drops every zoom subscription this manager holds.
     *
     * For a caller that empties the map wholesale — `clearAllGraphics` — where
     * unwatching handler by handler would mean walking a list it is about to
     * discard anyway.
     */
    releaseAllGraphics = (): void => {
        this.resolutionKeys.forEach(entry => unByKey(entry.key));
        this.resolutionKeys.length = 0;
    };

    // define what happens on mouse down, drag and mouse up events.
    getPointerInteraction = () => {
        return new Pointer({
            handleDownEvent: this.handleDownEvent,
            handleDragEvent: this.handleDragEvent,
            handleUpEvent: (): boolean => {
                this.lastPointerPosition = null;
                // The width latch belongs to one gesture. @see handleOffset
                this.offsetGrabPerpendicular = undefined;
                this.offsetGrabWidth = undefined;
                this.resizeStartDistance = undefined;
                this.resizeStartSize = undefined;
                this.handleGrabOffset = undefined;
                this.restoreSizeFloor();
                // The drag is over, so any live measurement read-out goes with it. Done
                // here rather than in the controller because this is the one place every
                // drag gesture ends, however it started.
                (this.activeController as {endGesture?: () => void} | undefined)?.endGesture?.();
                this.activeController = undefined;
                return false;
            },
        });
    };

    /**
     * Runs one gesture from a host's affordance, outside the map's own pointer stack.
     *
     * ## Why this cannot go through the `Pointer` interaction
     *
     * The affordance is a DOM element the host draws *over* the map. A `pointerdown` on
     * it never reaches OpenLayers — the element swallows it — and even if it did, the
     * pointer is nowhere near the graphic, so `handleDownEvent`'s hit test would find
     * nothing and refuse the drag. So the drag is driven from `window` instead, and the
     * two things `handleDownEvent` would have latched are set here directly: the
     * controller (from the selection, not from a hit test) and the origin.
     *
     * Everything after that is the existing machinery. `activeGesture` makes
     * `isRotating()` / `isResizing()` / `isTranslating()` answer for the gesture rather
     * than the mode, and each move is handed to the same `handleDragEvent` a real drag
     * uses — so an affordance rotate and a mode rotate are the same code, and cannot
     * drift apart.
     *
     * Returns false and changes nothing if there is no selection or the symbol refuses
     * the gesture. @see allowedGestures
     */
    beginGesture = (kind: 'translate' | 'rotate' | 'resize', event: PointerEvent): boolean => {
        const controller = this.selectedController;
        if (!controller || this.activeGesture !== undefined) return false;

        const name = this.graphicNameOf(controller);
        if (name && !allowedGestures(name)[kind]) return false;

        const coordinate = this.coordinateFromPointer(event);
        if (!coordinate) return false;

        this.activeGesture = {translate: InteractionType.translate, rotate: InteractionType.rotate, resize: InteractionType.resize}[kind];
        this.activeController = controller;
        this.activeFeature = undefined;
        // No handle was grabbed, so nothing indexed can be meant. -1 is what the drag
        // paths read as "the whole graphic", which is exactly what an affordance means.
        this.activeHandleIndex = -1;
        this.activeBaseVertex = -1;
        // An affordance is never at the centre, so a resize from one always carries a
        // ratio. The guard exists for a handle dragged from on top of the anchor.
        this.resizeOriginNearCenter = false;
        this.lastPointerPosition = coordinate;

        const move = (moveEvent: PointerEvent) => {
            const next = this.coordinateFromPointer(moveEvent);
            if (!next) return;
            // `pixel` is here only because `handleDragEvent`'s signature asks for a
            // MapBrowserEvent; none of the drag paths read it.
            this.handleDragEvent({coordinate: next, pixel: this.map.getPixelFromCoordinate(next)} as MapBrowserEvent);
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            this.endAffordanceGesture();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        return true;
    };

    /** Ends an affordance gesture, mirroring what `handleUpEvent` does for a real drag. */
    private endAffordanceGesture = (): void => {
        this.lastPointerPosition = null;
        this.offsetGrabPerpendicular = undefined;
        this.offsetGrabWidth = undefined;
        this.resizeStartDistance = undefined;
        this.resizeStartSize = undefined;
        this.handleGrabOffset = undefined;
        this.restoreSizeFloor();
        (this.activeController as {endGesture?: () => void} | undefined)?.endGesture?.();
        this.activeController = undefined;
        this.activeGesture = undefined;
        // The gesture moved the graphic, so the box a host drew around it is stale.
        this.onSelectionChange?.(this.selectedController);
    };

    /** Puts back the draw-time floor a resize lifted. @see handleResize */
    private restoreSizeFloor = (): void => {
        this.floorSuspendedOn?.suspendSizeFloor?.(false);
        this.floorSuspendedOn = undefined;
    };

    /** A DOM pointer event's position as a map coordinate, or undefined if off-map. */
    private coordinateFromPointer = (event: {clientX: number; clientY: number}): Coordinate | undefined => {
        const target = this.map.getTargetElement();
        if (!target) return undefined;
        const rect = target.getBoundingClientRect();
        return this.map.getCoordinateFromPixel([event.clientX - rect.left, event.clientY - rect.top]);
    };

    /**
     * The selected graphic's on-screen extent, in map-container pixels.
     *
     * Measured from the **rendered** features, not the base: the box has to contain what
     * the operator can see, and a mission task's base is a single centre point whose
     * extent is a box of zero size. Handles are excluded — they are chrome, they stick
     * out past the symbol, and a box drawn round them grows every time one is shown.
     */
    selectionBox = (): {x: number; y: number; width: number; height: number} | undefined => {
        const controller = this.selectedController;
        if (!controller) return undefined;

        let extent: Extent | undefined;
        for (const feature of controller.getFeatures()) {
            if (feature.get('handle') || feature.get('hidden')) continue;
            const geometry = feature.getGeometry();
            if (!geometry) continue;
            const featureExtent = geometry.getExtent();
            if (!featureExtent.every(isFinite)) continue;
            extent = extent ? extendExtent(extent.slice() as Extent, featureExtent) : (featureExtent.slice() as Extent);
        }
        if (!extent) return undefined;

        // Two opposite corners, because the projection flips y: a map extent counts
        // upward and a screen counts downward, so min/max have to be re-derived after
        // the conversion rather than assumed.
        const topLeft = this.map.getPixelFromCoordinate([extent[0], extent[3]]);
        const bottomRight = this.map.getPixelFromCoordinate([extent[2], extent[1]]);
        if (!topLeft || !bottomRight) return undefined;

        const x = Math.min(topLeft[0], bottomRight[0]);
        const y = Math.min(topLeft[1], bottomRight[1]);
        return {x, y, width: Math.abs(bottomRight[0] - topLeft[0]), height: Math.abs(bottomRight[1] - topLeft[1])};
    };

    // set the state of the manager based on what feature is clicked
    // return true if the rotate, translate or resize mode is enabled to proceed with the Drag event.
    handleDownEvent = (evt: MapBrowserEvent): boolean => {
        // Collect everything under the pointer rather than taking the topmost.
        // A label's text is hit-testable and covers a lot of ground — measured,
        // the range fans' per-band label feature wins at *every* one of their rim
        // handles — so "topmost" would hand the drag to a feature the user was
        // not aiming at. A handle is the interactive affordance; it wins.
        const hits: Feature[] = [];
        this.map?.forEachFeatureAtPixel(evt.pixel, feature => {
            const asFeature = this.asFeature(feature);
            if (asFeature) hits.push(asFeature);
        });
        if (hits.length === 0) return false;

        // The center dot is refused as a drag origin for resize — the scale ratio
        // divides by distance-to-center, which is ~0 there — and for rotate, where a
        // point on the axis carries no angle. A move has neither problem: translate
        // applies a plain delta, and the center is the most natural thing to grab to
        // reposition a circle. So it is a live handle in translate mode only.
        const centerGrabbable = this.isTranslating();
        const isLive = (f: Feature) => f.get('handle') && (!f.get('inert') || centerGrabbable);
        const liveHandle = hits.find(isLive);
        // Gray handles are visual anchors, not drag origins — but only once no
        // live handle is in play, so an inert dot overlapping a real one cannot
        // veto it. Bail before latching any state so a later drag cannot pick up
        // a stale controller.
        if (!liveHandle && hits.some(f => f.get('inert'))) return false;

        let feature = liveHandle ?? hits[0];

        this.activeFeature = feature;

        // check if any controller owns the feature;
        this.activeController = this.getFeatureController(feature);
        if (!this.activeController) return false;

        // Latch whether this gesture started too near the center to carry a
        // scale ratio. It has to be decided once, at pointer-down: the drag
        // handlers advance `lastPointerPosition` on every event, so a per-event
        // check would skip only the first move and then scale off a 10-pixel
        // baseline — measured, a 12× jump from a drag that should do nothing.
        const resizeOrigin = this.activeController.getCenter();
        const resolution = this.map.getView().getResolution() ?? 1;
        this.resizeOriginNearCenter =
            Math.hypot(evt.coordinate[0] - resizeOrigin[0], evt.coordinate[1] - resizeOrigin[1]) <= MIN_RESIZE_ORIGIN_PX * resolution;
        // Only a handle set carries per-vertex meaning; anything else is -1.
        this.activeHandleIndex = feature.get('handle') ? this.nearestVertexIndex(feature, evt.coordinate) : -1;

        /*
         * **Where the handle is, minus where the cursor grabbed it.**
         *
         * A handle drag positions something *at the cursor* — a band's range, a bend's
         * depth, a vertex. Read raw, the first move snaps that thing to the pointer, so
         * grabbing a 5-pixel dot anywhere but its exact centre jumps the graphic by the
         * miss before it has moved at all: measured on Turn's arrowhead, a press 4 px off
         * and a 2 px nudge moved the handle 4.5 px sideways and turned the graphic.
         *
         * Carrying the offset through the gesture is what a drag normally means — the
         * thing you grabbed follows your hand from where you grabbed it. Same reasoning
         * as the width handle's delta, one level up, and it covers every consumer of the
         * cursor at once rather than each of them latching its own.
         */
        this.handleGrabOffset = undefined;
        if (this.activeHandleIndex >= 0) {
            const grabbed = this.handleCoordinateAt(feature, this.activeHandleIndex);
            if (grabbed) this.handleGrabOffset = [grabbed[0] - evt.coordinate[0], grabbed[1] - evt.coordinate[1]];
        }
        // Latched against the *base*, because handle indices and base vertices do not line
        // up once `visiblePathHandles` has dropped the redundant ones. Held for the whole
        // gesture so the vertex cannot change hands mid-drag.
        // **Never for the width handle.** `createOffsetHandleFeature` builds on the
        // handle feature, so it carries `handle` too — and `nearestBaseVertexIndex`
        // answers with the nearest base vertex however far away it is, so a graphic that
        // has both vertex dragging and a width handle sent the width drag to the reshape.
        // Measured on a rectangular zone: a drag on the width handle took 2,300 km off
        // the length and changed the width by nothing. Same failure the mirror handles
        // guard against one branch below. @see handleOffset
        this.activeBaseVertex =
            feature.get('handle') && !feature.get('offsetHandler') && this.activeController.handleVertexDrag
                ? this.nearestBaseVertexIndex(this.activeController, evt.coordinate)
                : -1;

        this.lastPointerPosition = evt.coordinate;

        /*
         * **A handle drag is a deliberate gesture too, so it lifts the draw-time floor.**
         *
         * The affordance path already did this. A handle drag did not, and the floor is a
         * wall the *handle* runs into: dragging Turn's arrowhead inward, the handle
         * tracked the cursor exactly until `size` hit `RATIO_LOCKED_MIN_RADIUS_PX` and
         * then stopped dead while the pointer carried on. Restored in `handleUpEvent`,
         * the one place every drag ends. @see suspendSizeFloor
         */
        this.activeController.suspendSizeFloor?.(true);
        this.floorSuspendedOn = this.activeController;

        // A fixed-vertex graphic hands OpenLayers' Modify nothing (its base
        // feature has `base` cleared), so an edit-mode drag would fall through
        // to the map and pan it. Claim the drag and stretch the graphic instead.
        //
        // **A mirror handle is claimed whatever the mode**, which is the rule MapLibre
        // states in `applyHandleRole`: a handle with a role means that role, and reading
        // the mode first would make the same dot do different things depending on a
        // button. Mobile defense needed it — its controller never opts into
        // `editStretches`, so an edit-mode drag on its mirror handle was not claimed and
        // the flip was reachable only from resize. @see handleRole
        // **A width handle sets a width, whatever the mode** — the same rule already
        // stated for the mirror handle just below, and the one MapLibre states in
        // `applyHandleRole`: a handle with a role means that role, and reading the mode
        // first makes one dot do different things depending on a button.
        //
        // Without this, a corridor's width was unreachable in `edit`: its controller
        // never opts into `editStretches`, so the grab was not claimed, the drag fell
        // through to the map, and the only mode that could widen it was `resize` — which
        // the panel no longer offers.
        const offsetGrab = !!this.activeController.setOffset && !!feature.get('offsetHandler');
        if (offsetGrab) return true;

        /*
         * **A handle that has a job is claimed, whatever the mode says about the body.**
         *
         * `editStretches` answers a different question — what a drag on the *line* means
         * — and a graphic can sensibly say "dragging my body does nothing" while its
         * vertices still move. Fix says exactly that: it is in `NO_EDIT_STRETCH`, so its
         * arrow-tip handle was never claimed and did nothing at all, which is the silent
         * refusal this mode exists to remove.
         */
        if (this.activeController.handleVertexDrag && this.activeBaseVertex >= 0) return true;

        if (this.isModifying()) return this.isMirrorHandleGrab() || !!this.activeController.editStretches;

        return this.isRotating() || this.isTranslating() || this.isResizing();
    };

    handleDragEvent = (evt: MapBrowserEvent): void => {
        if (!this.lastPointerPosition || !this.activeController) return;

        // Feed the drag position to any radius read-out, so its line follows the handle
        // under the cursor. The controller has no coordinate of its own during a resize —
        // only a scale delta — so it has to come from here. `handleUpEvent` disarms it.
        // **A width drag is a sizing gesture too.** The read-out exists to show the
        // number while the hand is moving, and for a rectangular zone the width *is* the
        // number — it was armed for a resize only, so dragging the one handle that sets
        // the width showed nothing. @see RectangularAreaGraphicBase.showMeasure
        if (this.isResizing() || this.activeFeature?.get('offsetHandler')) {
            // **The anchor follows the cursor only for a handle drag.** It exists to keep
            // the hashed read-out under the hand that is moving the rim. An affordance
            // sits outside the graphic entirely, so following it swung the line off to a
            // box corner and the read-out looked nothing like the one a handle resize
            // draws — same number, different picture. Passing no anchor leaves the line
            // on the rim handle, so both routes read identically.
            (this.activeController as {graphic?: {showMeasure?: (a: boolean, c?: Coordinate) => void}})
                .graphic?.showMeasure?.(true, this.isAffordanceGesture() ? undefined : evt.coordinate);
        }

        // handle point vs linestring vs polygon vs circular graphics differently.
        let geomType = this.activeController.geomHandleType;
        switch (geomType) {
            case 'Point':
                this.handlePointDrag(evt);
                break;
            case 'LineString':
                this.handleLineStringDrag(evt);
                break;
            case 'Polygon':
                this.handlePolygonDrag(evt);
                break;
            case 'Circle':
                this.handleCircleDrag(evt);
                break;
        }
    };

    defaultTranslateFunction = (evt: MapBrowserEvent) => {
        const deltaX = evt.coordinate[0] - this.lastPointerPosition[0];
        const deltaY = evt.coordinate[1] - this.lastPointerPosition[1];
        this.activeController?.handleTranslate(deltaX, deltaY);
        this.lastPointerPosition = evt.coordinate;
    };

    handlePointDrag = (evt: MapBrowserEvent) => {
        if (!this.activeController) return;
        let center = this.activeController.getBaseGeometry() as number[];
        // **The effective mode, not `currentMode`.** An affordance gesture latches what a
        // drag means for its duration; reading `currentMode` here would run the drag as
        // whatever the host's toolbar last selected, which in `edit` is a reshape.
        switch (this.effectiveMode()) {
            case InteractionType.translate:
                this.defaultTranslateFunction(evt);
                break;
            case InteractionType.rotate:
                let deltaAngle = this.calculateDeltaAngle(evt, center);
                this.activeController.handleRotate(deltaAngle);
                this.lastPointerPosition = evt.coordinate;
                break;
            case InteractionType.resize:
                // Calculate distance to center for scaling
                this.handleResize(evt);
                this.lastPointerPosition = evt.coordinate;
                break;
        }
    };

    /**
     * Flips an asymmetric point-anchored graphic when a handle is dragged well past the
     * far side of its own long axis.
     *
     * Rotate is the primary meaning of a handle drag on these graphics, so the flip has to
     * be a gesture rotate cannot produce. It is measured **in resize/edit mode only**,
     * where the rotation is held still and the cursor is therefore free to sit off the
     * axis — during a rotate the axis follows the cursor, so the perpendicular is always
     * ~0 and no such test could work.
     *
     * The threshold is generous for the same reason `MIRROR_FLIP_MIN_PX` exists on the
     * line graphics: crossing the axis is easy to do by accident, going a long way past it
     * is not.
     */
    private mirrorIfDraggedPastAxis(evt: MapBrowserEvent, center: number[]) {
        const controller = this.activeController;
        if (!controller?.setMirrored) return;

        const rotationDeg = (controller.graphic as {rotation?: number}).rotation ?? 0;
        // Planar angle, 0 = east, matching how these generators build their local frames.
        const axis = (rotationDeg * Math.PI) / 180;
        const dx = evt.coordinate[0] - center[0];
        const dy = evt.coordinate[1] - center[1];
        // Perpendicular component of the cursor about the graphic's own axis.
        const perpendicular = -dx * Math.sin(axis) + dy * Math.cos(axis);

        const resolution = this.map.getView().getResolution() ?? 1;
        if (Math.abs(perpendicular) < MIRROR_PAST_AXIS_MIN_PX * resolution) return;
        // Negative, matching the line families. A graphic's unmirrored feature sits on the
        // positive side of its own axis — abatis's chevron above its route, Pursuit's hook
        // below its line — so dragging to the negative side is what moves it across.
        controller.setMirrored(perpendicular < 0);
    }

    handleCircleDrag = (evt: MapBrowserEvent) => {
        if (!this.activeController) return;
        let center = this.activeController.getBaseGeometry() as number[];
        // **The effective mode, not `currentMode`.** An affordance gesture latches what a
        // drag means for its duration; reading `currentMode` here would run the drag as
        // whatever the host's toolbar last selected, which in `edit` is a reshape.
        switch (this.effectiveMode()) {
            case InteractionType.translate:
                this.defaultTranslateFunction(evt);
                break;
            case InteractionType.rotate:
                let deltaAngle = this.calculateDeltaAngle(evt, center);
                // normalize to [-PI, PI]
                deltaAngle = ((deltaAngle + Math.PI) % (2 * Math.PI)) - Math.PI;
                // convert to degrees if your internal rotation is in deg
                const deltaDeg = (deltaAngle * 180) / Math.PI;
                this.activeController.handleRotate(deltaDeg);
                this.lastPointerPosition = evt.coordinate;
                break;
            // A circle graphic keeps its base point out of the rendering source,
            // so Modify never sees it and an edit-mode drag would pan the map.
            // Edit borrows resize wholesale — the only meaningful edit on a
            // circle is its radius. `handleDownEvent` only claims an edit drag
            // when the controller opted in, so nothing else reaches this case.
            // `edit` reshapes exactly as `modify` does — the difference between them is
            // the selection, the box and the affordances, none of which change what a
            // drag on a handle means. Sharing the case is what keeps them from drifting.
            case InteractionType.edit:
            case InteractionType.modify:
            case InteractionType.resize:
                // A graphic whose handles each drive a different dimension (the
                // range fans, one rim per band) takes the grabbed handle's index
                // and the raw cursor; everything else scales uniformly.
                if (this.activeController.handleBandResize && this.activeHandleIndex >= 0) {
                    this.activeController.handleBandResize(this.activeHandleIndex, this.grabAdjusted(evt.coordinate));
                } else if (this.isMirrorHandleGrab()) {
                    // **A mirror handle flips and does nothing else**, which is what the
                    // retrograde tasks' cane already does on the line path. Falling
                    // through to `handleResize` made pursuit's handle do two jobs at once:
                    // measured, a drag on it read `FLIP+resized` where the same gesture on
                    // a disengage read `FLIP`. @see handleRole
                    this.mirrorIfDraggedPastAxis(evt, center);
                } else {
                    // **A drag on a handle may flip the graphic; an affordance may not.**
                    // Dragging a shape handle across the axis is how the hook and the
                    // envelopment change flanks, and that stays. But the resize button
                    // says one thing — make it bigger — and a drag from the box corner
                    // passes the axis on the way out, so a pursuit resized through the
                    // affordance came back mirrored while the same gesture on MapLibre,
                    // which has no such rule, did not. @see isAffordanceGesture
                    if (!this.isAffordanceGesture()) this.mirrorIfDraggedPastAxis(evt, center);
                    // Calculate distance to center for scaling
                    this.handleResize(evt);
                }
                this.lastPointerPosition = evt.coordinate;
                break;
        }
    };

    // delta in radians
    calculateDeltaAngle(evt: MapBrowserEvent, center: Coordinate) {
        const lastAngle = Math.atan2(this.lastPointerPosition[1] - center[1], this.lastPointerPosition[0] - center[0]);
        const currentAngle = Math.atan2(evt.coordinate[1] - center[1], evt.coordinate[0] - center[0]);
        return currentAngle - lastAngle;
    }

    handleLineStringDrag = (evt: MapBrowserEvent) => {
        if (!this.activeController) return;
        // **The effective mode, not `currentMode`.** An affordance gesture latches what a
        // drag means for its duration; reading `currentMode` here would run the drag as
        // whatever the host's toolbar last selected, which in `edit` is a reshape.
        switch (this.effectiveMode()) {
            case InteractionType.translate:
                this.handleDragForLineAndPolygon(evt, this.activeController);
                break;
            case InteractionType.rotate:
                this.handleRotateForLineAndPolygon(evt, this.activeController);
                break;
            // Edit mode borrows the resize path wholesale for fixed-vertex
            // graphics — width handle included, so the two modes behave
            // identically. `handleDownEvent` only claims an edit-mode drag when
            // the controller opted in, so nothing else can reach this case.
            // `edit` reshapes exactly as `modify` does — the difference between them is
            // the selection, the box and the affordances, none of which change what a
            // drag on a handle means. Sharing the case is what keeps them from drifting.
            case InteractionType.edit:
            case InteractionType.modify:
            case InteractionType.resize:
                // **An affordance gesture grabbed no handle, so it means the whole
                // graphic.** Every rule below answers "which handle was this?", and that
                // question has no answer here — the pointer went down on a button
                // outside the map. Bailing on the missing feature instead, which is what
                // this did, made the resize icon dead on *every* LineString graphic:
                // fields of fire, the retrogrades, the bridges, disrupt, block.
                if (this.isAffordanceGesture()) {
                    this.handleResize(evt);
                    this.lastPointerPosition = evt.coordinate;
                    break;
                }
                if (!this.activeFeature) return;

                // A graphic whose shape *is* its vertex positions reshapes in **modify**
                // mode only. Resize keeps its usual meaning — scale the whole graphic
                // about its center — because a user who picked "resize" asked for that,
                // not for one corner to move.
                //
                // The anchor is skipped here: it moves the graphic, and moving is what
                // translate mode is for. That leaves it inert under a reshape, the same
                // contract the inert center dot has on point-anchored graphics.
                const anchor = this.activeController.anchorVertex;
                const reshaping = this.isModifying() && !!this.activeController.handleVertexDrag;

                // Grabbing the anchor under a reshape does **nothing**. Falling through
                // would hand it to `handleResize`, so the one handle meant for moving the
                // graphic would silently scale it instead — worse than it being inert.
                if (reshaping && anchor !== undefined && this.activeBaseVertex === anchor) {
                    this.lastPointerPosition = evt.coordinate;
                    break;
                }

                // **Before the reshape.** A mirror handle sits off the base entirely, but
                // `nearestBaseVertexIndex` answers with the nearest vertex however far it
                // is, so the reshape below would swallow the gesture. It flips and does
                // nothing else. @see handleRole
                if (this.mirrorIfMirrorHandle(evt)) {
                    this.lastPointerPosition = evt.coordinate;
                    break;
                }

                if (reshaping && this.activeBaseVertex >= 0) {
                    this.activeController.handleVertexDrag!(this.activeBaseVertex, this.grabAdjusted(evt.coordinate));
                    this.lastPointerPosition = evt.coordinate;
                    break;
                }

                if (this.activeFeature.get('offsetHandler')) {
                    this.handleOffset(evt);
                } else {
                    this.handleResize(evt);
                }
                this.lastPointerPosition = evt.coordinate;
                break;
        }
    };

    /**
     * Whether the handle just grabbed is the one that flips this graphic.
     *
     * Asked at pointer-**down**, so the gesture can be claimed before any mode rule
     * refuses it. Reads `activeHandleIndex`, which is latched immediately above the
     * call, so it is the index the drag will use.
     */
    private isMirrorHandleGrab(): boolean {
        const name = this.activeFeature?.get('graphicName') as TacticalGraphicName | undefined;
        if (!this.activeController?.setMirrored || !name || this.activeHandleIndex < 0) return false;

        // A point-anchored base is a bare `[x, y]`, so its vertex count is 1 — the line
        // test alone rejected every one of them and pursuit's mirror handle was never
        // recognized as one.
        const drawn = this.activeController.getBaseGeometry() as unknown;
        const vertices = Array.isArray(drawn) && Array.isArray(drawn[0]) ? (drawn as number[][]).length : 1;

        return handleRole(name, this.contractHandleIndex(), vertices) === 'mirror';
    }

    /**
     * The grabbed handle's index **in the generator's list**, which is the space
     * `handleRole` answers in.
     *
     * `activeHandleIndex` is an index into whichever rendered feature was grabbed, and
     * those two spaces are not the same for a holder that splits its handles across
     * features. @see TacticalGraphicHandler.handleIndexOffset
     */
    private contractHandleIndex(): number {
        if (this.activeHandleIndex < 0) return this.activeHandleIndex;
        // The offset feature carries the handles that were peeled off, so its own index
        // is already a contract index — the shift applies to what was left behind.
        if (this.activeFeature?.get('offsetHandler')) return this.activeHandleIndex;
        return this.activeHandleIndex + (this.activeController?.handleIndexOffset ?? 0);
    }

    /**
     * Flips a graphic whose grabbed handle is declared a `mirror`, and reports whether
     * it took the drag.
     *
     * The rule and the handle index both come from the library, so the two renderers
     * cannot disagree about which dot turns a symbol over. Measured against the drawn
     * line rather than `rotation`: a graphic whose orientation *is* its vertices reports
     * a rotation of 0 whatever direction it runs, so the perpendicular would be taken
     * about due east regardless.
     */
    private mirrorIfMirrorHandle(evt: MapBrowserEvent): boolean {
        const controller = this.activeController;
        const name = this.activeFeature?.get('graphicName') as TacticalGraphicName | undefined;
        if (!controller?.setMirrored || !name || this.activeHandleIndex < 0) return false;

        const drawn = controller.getBaseGeometry() as unknown;
        const raw = Array.isArray(drawn) && Array.isArray(drawn[0]) ? (drawn as number[][]) : undefined;
        if (!raw || raw.length < 2) return false;
        if (handleRole(name, this.contractHandleIndex(), raw.length) !== 'mirror') return false;

        // **The line the generator drew along, which for the retrogrades is the reverse
        // of the line as stored.** Their points are filed tip-first now, per APP-06, and
        // the sign below is absolute -- "negative is the mirrored side". Read off the
        // stored order it would name the opposite side, so every cane would hang the
        // wrong way the first time its handle was dragged. @see drawOrder.ts
        const line = generatorOrder(name, raw) as number[][];
        const from = line[0];
        const to = line[line.length - 1];
        const axis = Math.atan2(to[1] - from[1], to[0] - from[0]);
        // Projected meters, so the midpoint is the plain average — no turf in here.
        const originX = (from[0] + to[0]) / 2;
        const originY = (from[1] + to[1]) / 2;
        const dx = evt.coordinate[0] - originX;
        const dy = evt.coordinate[1] - originY;
        const perpendicular = -dx * Math.sin(axis) + dy * Math.cos(axis);

        const resolution = this.map.getView().getResolution() ?? 1;
        if (Math.abs(perpendicular) >= MIRROR_FLIP_MIN_PX * resolution) {
            // Negative is the mirrored side, matching every other flip in the library.
            controller.setMirrored(perpendicular < 0);
        }
        // Claimed either way: the handle means "flip", so a drag too small to decide
        // must not fall through and resize the graphic instead.
        return true;
    }

    // update the length of a graphic
    handleResize(evt: MapBrowserEvent) {
        if (!this.activeController) return;
        let center = this.activeController.getCenter();
        const currentDistance = Math.sqrt(Math.pow(evt.coordinate[0] - center[0], 2) + Math.pow(evt.coordinate[1] - center[1], 2));
        const lastDistance = Math.sqrt(
            Math.pow(this.lastPointerPosition[0] - center[0], 2) + Math.pow(this.lastPointerPosition[1] - center[1], 2),
        );

        // A drag that starts at or near the center carries no usable scale
        // ratio: `currentDistance / lastDistance` diverges as `lastDistance`
        // approaches zero. A `> 0` guard is not enough — measured, a nudge a few
        // pixels off a circle's center grew `size` by twenty orders of
        // magnitude. The center is not a resize origin; ignore the gesture.
        if (this.resizeOriginNearCenter || lastDistance <= 0) return;

        /*
         * **The size is an absolute ratio from where the drag began, not a product of
         * per-frame ratios.**
         *
         * The two are the same arithmetic right up until a holder *clamps* — and several
         * do: the crossed tasks and the curves take a `RATIO_LOCKED_MIN_RADIUS_PX` floor,
         * `Block` extends its base to `MIN_BASE_PX`, `LineGraphicBase` enforces a minimum
         * first segment. Once a frame's result is clamped, the holder's next frame
         * multiplies the *clamped* value, and the shrink the user asked for is gone for
         * good. Drag in and then back out and the graphic ends up larger than it started:
         * that is the "resize jumps up, and won't shrink again" defect, on every graphic
         * with a floor.
         *
         * Asking the holder what size it currently has and handing it the factor that
         * takes it to `startSize × ratio` makes each frame land on the target outright.
         * A clamp then costs nothing: the next frame recomputes from the real value, and
         * returning the cursor returns the size exactly.
         *
         * A controller that cannot report a size falls through to the old per-frame
         * ratio, which is correct whenever nothing clamps.
         */
        if (this.resizeStartDistance === undefined) {
            this.resizeStartDistance = lastDistance;
            this.resizeStartSize = this.activeController.currentSize?.();
            // A resize is a deliberate choice of size, so the *draw-time* floor comes off
            // for the length of it. Restored in `endGesture`. @see suspendSizeFloor
            this.activeController.suspendSizeFloor?.(true);
            this.floorSuspendedOn = this.activeController;
        }
        const startSize = this.resizeStartSize;
        const currentSize = this.activeController.currentSize?.();
        if (startSize !== undefined && startSize > 0 && currentSize !== undefined && currentSize > 0 && this.resizeStartDistance > 0) {
            // Lifting the floor means nothing stops a drag onto the anchor collapsing the
            // geometry to a point, which several generators divide by. This is not that
            // floor returning — it is the degenerate case, orders of magnitude below
            // anything a user is aiming at.
            const target = Math.max(MIN_RESIZED_SIZE_METERS, startSize * (currentDistance / this.resizeStartDistance));
            this.activeController.handleResize(target / currentSize);
            return;
        }

        const scaleFactor = currentDistance / lastDistance;
        this.activeController.handleResize(scaleFactor);
    }

    /**
     * Index of the MultiPoint vertex nearest `coordinate`, or -1 when the
     * feature is not a MultiPoint. Coordinates are EPSG:3857 meters, so plain
     * Euclidean math is correct here — no turf.
     */
    /** Nearest vertex of a controller's base line to `coordinate`, or -1. */
    private nearestBaseVertexIndex(controller: TacticalGraphicHandler, coordinate: Coordinate): number {
        const geometry = controller.graphic?.base?.getGeometry();
        if (!(geometry instanceof LineString)) return -1;
        let best = -1;
        let bestDistanceSq = Infinity;
        geometry.getCoordinates().forEach((vertex, index) => {
            const d = Math.pow(vertex[0] - coordinate[0], 2) + Math.pow(vertex[1] - coordinate[1], 2);
            if (d < bestDistanceSq) {
                bestDistanceSq = d;
                best = index;
            }
        });
        return best;
    }

    /** The grabbed handle's own coordinate, for the offset latch. @see handleGrabOffset */
    private handleCoordinateAt(feature: Feature, index: number): Coordinate | undefined {
        const geometry = feature.getGeometry();
        if (geometry instanceof MultiPoint) return geometry.getCoordinates()[index];
        if (geometry instanceof Point) return geometry.getCoordinates();
        return undefined;
    }

    /**
     * The cursor, corrected for where the handle was grabbed.
     *
     * Used by the paths that put something *at* the pointer. A gesture that grabbed no
     * handle has no offset and passes straight through.
     */
    private grabAdjusted(coordinate: Coordinate): Coordinate {
        const offset = this.handleGrabOffset;
        return offset ? [coordinate[0] + offset[0], coordinate[1] + offset[1]] : coordinate;
    }

    private nearestVertexIndex(feature: Feature, coordinate: Coordinate): number {
        const geometry = feature.getGeometry();
        // **A one-point handle feature is handle 0, not "no handle".** The offset and
        // mirror handles are drawn as their own `Point` feature, so this answered -1 for
        // every grab of one — which left `activeHandleIndex` negative and made
        // `mirrorIfMirrorHandle` bail out before it could claim the gesture. The
        // retrograde canes' handle is declared a `mirror` in the library and MapLibre
        // flips on it; here the drag fell through to `handleOffset` and *resized* the
        // symbol instead, tripling a withdraw's decoration in three drags. @see handleRole
        if (geometry instanceof Point) return 0;
        if (!(geometry instanceof MultiPoint)) return -1;

        let best = -1;
        let bestDistanceSq = Infinity;
        geometry.getCoordinates().forEach((vertex, index) => {
            const distanceSq = Math.pow(vertex[0] - coordinate[0], 2) + Math.pow(vertex[1] - coordinate[1], 2);
            if (distanceSq < bestDistanceSq) {
                bestDistanceSq = distanceSq;
                best = index;
            }
        });
        return best;
    }

    /**
     * Squared distance from `point` to the segment `a`→`b`. Coordinates are
     * EPSG:3857 meters, so plain Euclidean math is correct here — no turf.
     */
    private distanceToSegmentSq(point: Coordinate, a: Coordinate, b: Coordinate): number {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const lengthSq = dx * dx + dy * dy;
        // Degenerate segment (duplicate vertices) — fall back to the endpoint.
        const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq));
        const projX = a[0] + t * dx;
        const projY = a[1] + t * dy;
        return Math.pow(point[0] - projX, 2) + Math.pow(point[1] - projY, 2);
    }

    // update the width of a graphic
    handleOffset(evt: MapBrowserEvent): void {
        if (!this.activeController) return;
        const stored = <number[][]>this.activeController.getBaseGeometry();
        if (!stored || stored.length < 2) return;

        // **Oriented the generator's way, because the sign below leaves this function.**
        // The width is a magnitude and the flip is a *crossing*, so both survive a
        // reversal — but `setMirrored(nowNegative)` hands a side to the generator, and a
        // tip-first graphic's stored line runs opposite to the one its symbol was built
        // along. Left alone, a mobile defence's width drag flipped it to the side the
        // cursor had just left, and MapLibre's `setOffset` — which does orient — would
        // have disagreed with this engine on the same gesture. @see drawOrder.ts
        const name = this.activeFeature?.get('graphicName') as TacticalGraphicName | undefined;
        const coords = generatorOrder(name, stored) as number[][];

        // Measure against the segment the cursor is nearest to, not always the
        // last one. For a two-point base (block, relief in place, retrograde)
        // there is only one segment, so this picks the same one as before.
        let segment = [coords[0], coords[1]];
        let nearestDistanceSq = Infinity;
        for (let i = 0; i < coords.length - 1; i++) {
            const distanceSq = this.distanceToSegmentSq(evt.coordinate, coords[i], coords[i + 1]);
            if (distanceSq < nearestDistanceSq) {
                nearestDistanceSq = distanceSq;
                segment = [coords[i], coords[i + 1]];
            }
        }

        const dx = segment[1][0] - segment[0][0];
        const dy = segment[1][1] - segment[0][1];
        const lineAngle = Math.atan2(dy, dx);

        const widthAxis = [
            Math.cos(lineAngle + Math.PI / 2),
            Math.sin(lineAngle + Math.PI / 2)
        ];

        const toMouse = [
            evt.coordinate[0] - segment[0][0],
            evt.coordinate[1] - segment[0][1]
        ];

        const perpendicularDistance =
            toMouse[0] * widthAxis[0] +
            toMouse[1] * widthAxis[1];

        // Sensitivity. The default halves the drag distance, which suits graphics
        // whose offset spans the full width; a graphic whose offset is measured
        // from the center-line (a radius) overrides it to track the cursor 1:1.
        const scaleFactor = this.activeController.offsetScale ?? .5;

        /*
         * **A width drag is a delta from where it started, never an absolute reading.**
         *
         * This used to set `width = |perpendicular| × offsetScale` outright, which is
         * only correct if the handle happens to be drawn at exactly `width ÷ offsetScale`
         * from the nearest segment. For a straight two-point graphic it very nearly is;
         * for anything else it is not, and the width snapped the instant the handle was
         * grabbed — measured, one 6-pixel drag took an air corridor from 391 km to 257 km
         * (−34%) and the next took it to 98 km (−62%), because a corridor's handles sit
         * on mitred tangent points whose perpendicular distance to the nearest segment is
         * not the corridor's half-width at all. The retrogrades jumped 18% and relief in
         * place 33% on a 6-pixel nudge.
         *
         * Latching the perpendicular and the width at pointer-down and applying the
         * *change* makes a small drag a small change for every graphic, whatever its
         * handle geometry — and removes the standing requirement that `offsetScale` be
         * the exact reciprocal of how many widths out the handle is drawn. That number
         * now only sets sensitivity, which is all it ever claimed to be.
         */
        if (this.offsetGrabPerpendicular === undefined) {
            this.offsetGrabPerpendicular = perpendicularDistance;
            this.offsetGrabWidth = this.activeController.currentOffset?.() ?? Math.abs(perpendicularDistance) * scaleFactor;
        }
        // **Converted to a real distance before it is added to one.** The measurement above
        // is in projected metres and the width it changes is in ground metres; adding one
        // to the other made the edge outrun the cursor by 1/cos(latitude) — a handle
        // dragged to 120 px off the centre-line at 60 degrees north set a corridor 230 px
        // wide. @see mercator.ts
        const delta = groundLength(
            (Math.abs(perpendicularDistance) - Math.abs(this.offsetGrabPerpendicular)) * scaleFactor,
            latitudeFromMercatorY(segment[0][1]),
        );
        // A width is a magnitude; a drag that would take it through zero stops at a floor
        // rather than turning the graphic inside out.
        const baseWidth = Math.max(MIN_OFFSET_METERS, (this.offsetGrabWidth ?? 0) + delta);
        this.activeController.setOffset?.(baseWidth);

        // One handle, two jobs: the magnitude above set the width, the sign sets the side.
        // Read separately and never from the raw signed value — using the signed number for
        // both would make a flip jump the width at the same moment.
        //
        // **Only on a genuine crossing.** The test used to be "which side is the cursor
        // on", which flips the moment you grab a handle that is drawn on the negative
        // side — a bridge's width handle turned the graphic over as soon as it was
        // touched, before the pointer had moved at all. Comparing against the side the
        // drag *started* on means a flip takes a deliberate move across the line.
        const startedNegative = this.offsetGrabPerpendicular < 0;
        const nowNegative = perpendicularDistance < 0;
        if (
            this.activeController.setMirrored &&
            nowNegative !== startedNegative &&
            Math.abs(perpendicularDistance) > MIRROR_FLIP_MIN_PX * this.map.getView().getResolution()!
        ) {
            this.activeController.setMirrored(nowNegative);
        }
    }

    /**
     * Moves a line or an area with the pointer.
     *
     * **The projected delta, like every other translate in this file.** This one measured
     * the cursor's travel as a *ground distance and a bearing* and handed those to
     * `handleTranslate(deltaX, deltaY)`, whose every other implementation adds them to a
     * coordinate — so the line and area holders walked each vertex along a great circle
     * instead. A great circle bows poleward, so a purely horizontal drag at 63 degrees
     * north moved the graphic 5.306 degrees of longitude where the cursor asked for 4.851
     * and slid it 0.087 degrees north as well; at 70 south it fell short instead. The
     * shape came out from under the pointer, and differently at every latitude.
     *
     * A drag is a screen gesture: the graphic follows the cursor, and the projection is
     * the map's business. MapLibre has always done it this way — measured, 4.851 degrees
     * at every latitude — and so has this engine's own point-anchored path.
     */
    handleDragForLineAndPolygon(evt: MapBrowserEvent, controller: TacticalGraphicHandler) {
        const deltaX = evt.coordinate[0] - this.lastPointerPosition[0];
        const deltaY = evt.coordinate[1] - this.lastPointerPosition[1];
        controller.handleTranslate(deltaX, deltaY);
        this.lastPointerPosition = evt.coordinate;
    }

    handleRotateForLineAndPolygon(evt: MapBrowserEvent, controller: TacticalGraphicHandler) {
        if (!this.activeController) return;
        let center = controller.getCenter();
        // Rotate around center
        const lastAngle = Math.atan2(this.lastPointerPosition[1] - center[1], this.lastPointerPosition[0] - center[0]);
        const currentAngle = Math.atan2(evt.coordinate[1] - center[1], evt.coordinate[0] - center[0]);
        // Update rotation
        const deltaAngle = currentAngle - lastAngle;
        controller.handleRotate(deltaAngle);
        this.lastPointerPosition = evt.coordinate;
    }

    handlePolygonDrag = (evt: MapBrowserEvent) => {
        if (!this.activeController) return;
        // **The effective mode, not `currentMode`.** An affordance gesture latches what a
        // drag means for its duration; reading `currentMode` here would run the drag as
        // whatever the host's toolbar last selected, which in `edit` is a reshape.
        switch (this.effectiveMode()) {
            case InteractionType.translate:
                this.handleDragForLineAndPolygon(evt, this.activeController);
                break;
            case InteractionType.rotate:
                this.handleRotateForLineAndPolygon(evt, this.activeController);
                break;
            case InteractionType.resize:
                this.handleResize(evt);
                this.lastPointerPosition = evt.coordinate;
                break;
        }
    };
    asFeature = (feature: FeatureLike): Feature | undefined => {
        return feature instanceof Feature ? feature : undefined;
    };

    /**
     * Take double-click zoom off the map for the duration of a draw. Idempotent:
     * a second call while it is already suspended is a no-op, and it cancels any
     * restore armed by the previous draw so that one can't fire mid-draw.
     */
    private suspendDoubleClickZoom = () => {
        const existing = TacticalGraphicsManager.zoomSuspensions.get(this.map);
        if (existing) {
            // Already off for this map — cancel any restore armed by a previous draw so it
            // cannot fire mid-draw, whichever manager armed it.
            existing.unlisten?.();
            existing.unlisten = undefined;
            return;
        }

        const zoom = this.map.getInteractions().getArray()
            .find((i): i is DoubleClickZoom => i instanceof DoubleClickZoom);
        if (!zoom) return;
        this.map.removeInteraction(zoom);
        TacticalGraphicsManager.zoomSuspensions.set(this.map, {zoom});
    };

    /**
     * Put double-click zoom back now, cancelling any pending restore.
     *
     * For teardown, where there is no draw left to protect and no later press to wait for.
     * A manager that is going away must not leave the map's zoom detached, and must not
     * leave a listener behind that re-attaches it at some arbitrary later moment.
     */
    restoreDoubleClickZoomNow = () => {
        const suspension = TacticalGraphicsManager.zoomSuspensions.get(this.map);
        if (!suspension) return;
        suspension.unlisten?.();
        TacticalGraphicsManager.zoomSuspensions.delete(this.map);
        this.map.addInteraction(suspension.zoom);
    };

    /**
     * Put double-click zoom back — but not until the browser has finished
     * delivering the double-click that ended the draw.
     *
     * Only a free-form LineString finishes *on* its `dblclick`, with `Draw` still
     * installed to swallow it. A fixed-vertex draw (`maxPoints`, e.g. the
     * retrograde family) finishes on the *second click* of that double-click, and
     * a Point draw (mission tasks such as AreaDefense) on the *first* — so by the
     * time the trailing `dblclick` is dispatched, `Draw` has already been removed
     * and nothing absorbs it. Restoring on a 0 ms timer landed DoubleClickZoom
     * back inside that window, which is exactly why those graphics zoomed the map
     * on the click that drew them while plain lines did not.
     *
     * Waiting for the next press sidesteps the timing entirely. `detail` is the
     * consecutive-click count, so `> 1` means the press is the second half of the
     * double-click still being waited out; we keep waiting. A genuine later
     * double-click re-arms the zoom on its own first press, in time for its
     * `dblclick`. `mousedown` rather than OL's `pointerdown` because `detail` is
     * spec'd on MouseEvent and reliably populated there.
     *
     * `lastDrawEndedAt` covers the rest. A Point draw (screen / guard / cover)
     * ends on its *first* click, so a user who clicks to place the symbol and
     * then double-clicks out of habit is making a fresh press — which would
     * otherwise re-arm the zoom in time for its own `dblclick`. Holding off until
     * that guard expires reuses the same drawend + 1 s window the properties
     * dialog already ignores stray clicks in.
     */
    private resumeDoubleClickZoomOnNextClick = () => {
        const suspension = TacticalGraphicsManager.zoomSuspensions.get(this.map);
        if (!suspension || suspension.unlisten) return;

        const map = this.map;
        const viewport = map.getViewport();
        const onMouseDown = (e: MouseEvent) => {
            if (e.detail > 1 || Date.now() < this.lastDrawEndedAt) return;
            viewport.removeEventListener('mousedown', onMouseDown);
            TacticalGraphicsManager.zoomSuspensions.delete(map);
            map.addInteraction(suspension.zoom);
        };
        viewport.addEventListener('mousedown', onMouseDown);
        suspension.unlisten = () => viewport.removeEventListener('mousedown', onMouseDown);
    };

    private stopDrawing = (tacticalGraphicHandler: TacticalGraphicHandler, canceled: boolean) => {
        if (this.escKeyHandler) {
            document.removeEventListener('keydown', this.escKeyHandler);
            this.escKeyHandler = undefined;
        }
        this.resumeDoubleClickZoomOnNextClick();
        if (canceled) {
            tacticalGraphicHandler.getFeatures().forEach(f => this.renderingVectorSource.removeFeature(f));
            // The subscription went on at draw start, so an abandoned draw has one
            // to take off again — otherwise it outlives its own features.
            this.unwatchResolution(tacticalGraphicHandler);
        }
        if (this.draw) {
            this.map.removeInteraction(this.draw);
            this.draw = undefined;
        }
        this.setInteractionMode(InteractionType.view);
    };

    /**
     * Puts the map into draw mode for one graphic: the user clicks out the base
     * geometry, and this builds, styles and wires up everything that follows from
     * it. The primary verb of this package.
     *
     * @see handleDrawTacticalGraphic for the former name, kept as an alias.
     */
    startDrawing = (name: TacticalGraphicName) => {
        if (this.draw) this.map.removeInteraction(this.draw);

        // create a new source for drawing, this can be modified per application
        let drawingVectorSource = new VectorSource();

        // Fetch a tactical graphic & handler based on the tactical graphic name, use the resolution to scale the graphic
        let resolution = this.map.getView().getResolution() || 1;
        /*
         * **Sized for where the operator is looking**, because a screen size is only a
         * distance at a place: `20 px` of corridor width is 1.56x as many metres at 50
         * degrees north as on the equator, and deriving it without that drew the corridor
         * at 1.56x the width the drag described.
         *
         * The view center, not the first click, because this holder is built when the
         * tool is picked and the click has not happened yet. The two agree to within half
         * a viewport — a few percent at any working zoom, against the 56% the projection
         * was contributing. The exact rule is applied where the location *is* known: the
         * drawn radius, the width drag, and every line graphic's decoration.
         */
        const latitude = latitudeFromMercatorY(this.map.getView().getCenter()?.[1] ?? 0);
        let tacticalGraphicHandler: TacticalGraphicHandler = openlayersAdapter.getTacticalGraphicController(name, resolution, latitude);

        this.renderingVectorSource.addFeatures(tacticalGraphicHandler.getFeatures());
        this.watchResolution(tacticalGraphicHandler);

        // Disable double-click zoom so finishing a draw with double-click doesn't zoom the map
        this.suspendDoubleClickZoom();

        this.draw = new Draw({
            source: drawingVectorSource,
            type: tacticalGraphicHandler.type,
            // Falls back to the shared draw style rather than to OpenLayers' built-in
            // editing style, so the configured draw-marker colors apply to every
            // graphic — not just the point-anchored ones whose controller styles itself.
            style: tacticalGraphicHandler.drawStyleFunc ?? defaultDrawStyleFunc(),
            maxPoints: tacticalGraphicHandler.maxPoints ?? undefined,
            geometryFunction: tacticalGraphicHandler.geometryFn ?? undefined,
        });

        this.map.addInteraction(this.draw);

        // ESC cancels the active drawing
        this.escKeyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && this.draw) {
                this.draw.abortDrawing();
                this.stopDrawing(tacticalGraphicHandler, true);
            }
        };
        document.addEventListener('keydown', this.escKeyHandler);

        this.draw.on('drawstart', (e: DrawEvent) => {
            this.setInteractionMode(InteractionType.drawing);

            const originalFeature = e.feature;

            // add a unique id to the graphic
            let symbolId = crypto.randomUUID();
            originalFeature.set('symbolId', symbolId);
            originalFeature.setStyle(new Style({}));

            tacticalGraphicHandler.setSymbolId(symbolId);
            tacticalGraphicHandler.getFeatures().forEach(f => f.set('graphicName', name));

            this.map.on('pointermove', evt => {
                tacticalGraphicHandler.onPointerMove?.(evt);
            });
            tacticalGraphicHandler.onDrawStartFunc(e);
        });

        this.draw.on('drawend', (e: DrawEvent) => {
            this.lastDrawEndedAt = Date.now() + 1000;
            this.normalizeDrawnGeometry(name, e);
            tacticalGraphicHandler.onDrawEndFunc(e);
            drawingVectorSource.clear();
            this.graphicControllers.push(tacticalGraphicHandler);
            this.stopDrawing(tacticalGraphicHandler, false);
        });
    };

    /**
     * Applies the library's tidy-up to the geometry the user just drew.
     *
     * Runs **before** `onDrawEndFunc`, so the holder builds from the base that will be
     * stored rather than from the raw clicks — otherwise the graphic and its handles
     * disagree about how many vertices there are.
     *
     * The reason it is needed here at all is a double-click: OpenLayers ends a
     * fields-of-fire at two points, the generator synthesizes the second leg on every
     * render, and the V is frozen because the synthesized leg has no vertex to drag.
     * Materialising it is invisible — `normalizeDrawnBase` calls the very function the
     * renderer would have called — but it turns a fixed angle into an editable one.
     *
     * Coordinates are projected, so they travel to 4326 and back: the library speaks
     * geographic degrees and the swing that opens the V is a geodesic one.
     * @see normalizeDrawnBase
     */
    private normalizeDrawnGeometry = (name: TacticalGraphicName, e: DrawEvent) => {
        const geometry = e.feature?.getGeometry();
        if (!(geometry instanceof LineString)) return;

        const drawn = geometry.getCoordinates().map(c => toLonLat(c));
        // **The resolution matters now**: the S pair's point 2 is held to a pixel range, and
        // a normalizer with no view to ask leaves it where the user put it.
        const normalized = normalizeDrawnBase(name, drawn, this.map.getView().getResolution());
        // Compared by *content*, not by length. This used to bail whenever the vertex count
        // was unchanged, which is every case where a vertex moves rather than appears.
        if (normalized.length === drawn.length
            && normalized.every((p, i) => p[0] === drawn[i][0] && p[1] === drawn[i][1])) return;

        geometry.setCoordinates(normalized.map(c => fromLonLat(c as Coordinate)));
    };

    /**
     * The former name of {@link startDrawing}, kept so the rename is not a breaking
     * change for anyone already calling it.
     *
     * It delegates rather than aliasing the field (`= this.startDrawing`), so a host
     * that overrides `startDrawing` is still the one that runs through this door.
     *
     * @deprecated Call {@link startDrawing} instead. `handleDraw…` read like an
     * internal event handler, which is what a `handleX` name means everywhere else
     * in this codebase — but this is the public entry point a host calls to begin a
     * draw, and it pairs with the private `stopDrawing`.
     */
    handleDrawTacticalGraphic = (name: TacticalGraphicName) => this.startDrawing(name);

    addModifyInteraction = () => {
        // **Idempotent, because it is not always called once.** Each call used to build a
        // fresh `Modify` and add it while keeping no hold on the previous one, so a
        // second call left the first on the map — and `removeModifyInteraction` could
        // only ever take off the newest. Measured through the panel's edit button: two
        // interactions went on, one came off, and the leftover kept drawing its blue
        // vertex over every line and polygon in a mode that has no vertices to edit.
        this.removeModifyInteraction();

        // Only allow the base feature (linestring/polygon) for a tactical graphic to be modified
        // once the graphic is modified, the underlying graphic will re-render the tactical graphic from the geometry library.
        let baseFeatures = this.getRenderedFeaturesByProp('base');

        // **In edit mode, only the selected graphic's base.** Handles are already scoped
        // to the selection there, and a `Modify` over every base would let the user drag
        // a vertex of a graphic wearing no handles at all — an edit with no visible
        // affordance behind it. `modify` mode stays global, as it always was.
        if (this.isEditing()) {
            const selected = this.selectedController?.getFeatures();
            baseFeatures = selected ? baseFeatures.filter(feature => selected.includes(feature)) : [];
        }

        // Nothing to modify — an edit mode with no selection yet. Leave the interaction
        // off rather than installing one over an empty collection.
        if (!baseFeatures.length) return;

        baseFeatures.forEach(feature => feature.set('hidden', false));

        this.modify = new Modify({
            source: this.renderingVectorSource,
            features: new Collection(baseFeatures),
        });
        this.map.addInteraction(this.modify);
        this.modify.on('modifyend', (e: ModifyEvent) => {
            e.features.forEach(feature => {
                let symbolId = feature.get('symbolId');
                if (!symbolId) return;
                let geom = feature.getGeometry();
                if (geom instanceof Point || geom instanceof LineString || geom instanceof Polygon) {
                    let graphicController = this.getFeatureControllerBySymbolId(symbolId);
                    if (!graphicController) return;

                    // re-renders the tactical graphic based on the new geometry.
                    graphicController.setBaseFeature(feature);
                }

            });
        });
    };

    removeModifyInteraction = () => {
        let baseFeatures = this.getRenderedFeaturesByProp('base');
        baseFeatures.forEach(feature => feature.set('hidden', true));
        if (this.modify) this.map.removeInteraction(this.modify);
        // Dropped, not just detached: a handle kept here is one this class would try to
        // remove a second time and, worse, one it would not replace.
        this.modify = undefined;
    };
}