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
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {defaultDrawStyleFunc} from "./openlayerStyles";
import {Coordinate} from "ol/coordinate";
import {EventsKey} from "ol/events";
import {unByKey} from "ol/Observable";

export enum InteractionType {
    'resize',
    'rotate',
    'translate',
    'modify',
    'drawing',
    'view'
}

/*
* Class used for interacting with the openlayers map
* Interactions include
*  - Drawing a new tactical graphic into a vector layer/source,
*  - Calculating the offset value for rotating, resizing, and repositioning a tactical graphic
*  - Adding a modify interaction for polygon/linestring like graphics to add or reposition existing vertices
* */

/**
 * How far from a graphic's centre a resize drag has to start, in screen pixels,
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
         * what keeps the graphics on their own canvas and their own colours.
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
     * it, so a cancelled draw leaked one and a sample sweep — which clears and
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
    lastDrawEndedAt: number = 0;
    private escKeyHandler: ((e: KeyboardEvent) => void) | undefined = undefined;
    /** The map's DoubleClickZoom while it is pulled off for a draw; undefined when installed. */
    private dblClickZoom: DoubleClickZoom | undefined = undefined;
    /** Tears down the listener armed to put DoubleClickZoom back. */
    private unlistenDblClickZoomRestore: (() => void) | undefined = undefined;

    // add layer and pointer interactions to an openlayers map reference.
    constructor(map: Map) {
        this.map = map;
        let pointerInteraction = this.getPointerInteraction();
        this.map.addInteraction(pointerInteraction);
        this.map.addLayer(this.renderingVectorLayer);
        this.map.on('pointermove', this.updateHoverCursor);
    }

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
        this.map.forEachFeatureAtPixel(evt.pixel, feature => {
            const asFeature = this.asFeature(feature);
            if (asFeature) hits.push(asFeature);
        });

        let interactive: boolean;
        if (this.enableHandleModes().includes(this.currentMode)) {
            const centreGrabbable = this.isTranslating();
            interactive = hits.some(f => f.get('handle') && (!f.get('inert') || centreGrabbable));
        } else {
            interactive = hits.length > 0;
        }

        target.style.cursor = interactive ? 'pointer' : '';
    };

    // the interaction modes that display markers on tactical graphics to let the user transform
    enableHandleModes = (): InteractionType[] => {
        return [InteractionType.rotate, InteractionType.resize, InteractionType.modify, InteractionType.translate];
    };

    /**
     * Notified whenever the mode changes, including the changes the manager
     * makes on its own — `stopDrawing` drops back to `view` when a draw finishes
     * or is cancelled. Without this the host's own copy of the mode silently
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
        this.toggleHandleFeatures();
        this.toggleModifyInteraction();
        this.onInteractionModeChange?.(newMode);
    };

    // display the markers for letting a user drag/resize/modify/rotate a tactical graphic.
    toggleHandleFeatures = (): void => {
        const visible = this.enableHandleModes().includes(this.currentMode);
        this.getRenderedFeaturesByProp('handle').forEach(feature => {
            feature.set('hidden', !visible);
            // The centre dot is grabbable for a move and nothing else — see
            // `handleDownEvent`. Publish that so its style can colour itself
            // accordingly rather than claiming "never draggable" in a mode where it is.
            if (feature.get('inert')) feature.set('grabbable', this.isTranslating());
        });
    };

    toggleModifyInteraction = (): void => {
        if (this.currentMode === InteractionType.modify) {
            this.addModifyInteraction();
        } else {
            this.removeModifyInteraction();
        }
    };

    // select features from the tactical graphics based on a property.
    getRenderedFeaturesByProp = (prop: string): Feature[] => {
        return this.renderingVectorSource.getFeatures().filter(feature => feature.get(prop));
    };

    isRotating = (): boolean => {
        return this.currentMode === InteractionType.rotate;
    };

    isResizing = (): boolean => {
        return this.currentMode === InteractionType.resize;
    };

    isTranslating = (): boolean => {
        return this.currentMode === InteractionType.translate;
    };

    isModifying = (): boolean => {
        return this.currentMode === InteractionType.modify;
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
                // The drag is over, so any live measurement read-out goes with it. Done
                // here rather than in the controller because this is the one place every
                // drag gesture ends, however it started.
                (this.activeController as {endGesture?: () => void} | undefined)?.endGesture?.();
                this.activeController = undefined;
                return false;
            },
        });
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

        // The centre dot is refused as a drag origin for resize — the scale ratio
        // divides by distance-to-centre, which is ~0 there — and for rotate, where a
        // point on the axis carries no angle. A move has neither problem: translate
        // applies a plain delta, and the centre is the most natural thing to grab to
        // reposition a circle. So it is a live handle in translate mode only.
        const centreGrabbable = this.isTranslating();
        const isLive = (f: Feature) => f.get('handle') && (!f.get('inert') || centreGrabbable);
        const liveHandle = hits.find(isLive);
        // Grey handles are visual anchors, not drag origins — but only once no
        // live handle is in play, so an inert dot overlapping a real one cannot
        // veto it. Bail before latching any state so a later drag cannot pick up
        // a stale controller.
        if (!liveHandle && hits.some(f => f.get('inert'))) return false;

        let feature = liveHandle ?? hits[0];

        this.activeFeature = feature;

        // check if any controller owns the feature;
        this.activeController = this.getFeatureController(feature);
        if (!this.activeController) return false;

        // Latch whether this gesture started too near the centre to carry a
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
        // Latched against the *base*, because handle indices and base vertices do not line
        // up once `visiblePathHandles` has dropped the redundant ones. Held for the whole
        // gesture so the vertex cannot change hands mid-drag.
        this.activeBaseVertex =
            feature.get('handle') && this.activeController.handleVertexDrag
                ? this.nearestBaseVertexIndex(this.activeController, evt.coordinate)
                : -1;

        this.lastPointerPosition = evt.coordinate;

        // A fixed-vertex graphic hands OpenLayers' Modify nothing (its base
        // feature has `base` cleared), so an edit-mode drag would fall through
        // to the map and pan it. Claim the drag and stretch the graphic instead.
        if (this.isModifying()) return !!this.activeController.editStretches;

        return this.isRotating() || this.isTranslating() || this.isResizing();
    };

    handleDragEvent = (evt: MapBrowserEvent): void => {
        if (!this.lastPointerPosition || !this.activeController) return;

        // Feed the drag position to any radius read-out, so its line follows the handle
        // under the cursor. The controller has no coordinate of its own during a resize —
        // only a scale delta — so it has to come from here. `handleUpEvent` disarms it.
        if (this.isResizing()) {
            (this.activeController as {graphic?: {showMeasure?: (a: boolean, c?: Coordinate) => void}})
                .graphic?.showMeasure?.(true, evt.coordinate);
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
        switch (this.currentMode) {
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
        switch (this.currentMode) {
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
            case InteractionType.modify:
            case InteractionType.resize:
                // A graphic whose handles each drive a different dimension (the
                // range fans, one rim per band) takes the grabbed handle's index
                // and the raw cursor; everything else scales uniformly.
                if (this.activeController.handleBandResize && this.activeHandleIndex >= 0) {
                    this.activeController.handleBandResize(this.activeHandleIndex, evt.coordinate);
                } else {
                    this.mirrorIfDraggedPastAxis(evt, center);
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
        switch (this.currentMode) {
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
            case InteractionType.modify:
            case InteractionType.resize:
                if (!this.activeFeature) return;

                // A graphic whose shape *is* its vertex positions reshapes in **modify**
                // mode only. Resize keeps its usual meaning — scale the whole graphic
                // about its centre — because a user who picked "resize" asked for that,
                // not for one corner to move.
                //
                // The anchor is skipped here: it moves the graphic, and moving is what
                // translate mode is for. That leaves it inert under a reshape, the same
                // contract the inert centre dot has on point-anchored graphics.
                const anchor = this.activeController.anchorVertex;
                const reshaping = this.isModifying() && !!this.activeController.handleVertexDrag;

                // Grabbing the anchor under a reshape does **nothing**. Falling through
                // would hand it to `handleResize`, so the one handle meant for moving the
                // graphic would silently scale it instead — worse than it being inert.
                if (reshaping && anchor !== undefined && this.activeBaseVertex === anchor) {
                    this.lastPointerPosition = evt.coordinate;
                    break;
                }

                if (reshaping && this.activeBaseVertex >= 0) {
                    this.activeController.handleVertexDrag!(this.activeBaseVertex, evt.coordinate);
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

    // update the length of a graphic
    handleResize(evt: MapBrowserEvent) {
        if (!this.activeController) return;
        let center = this.activeController.getCenter();
        const currentDistance = Math.sqrt(Math.pow(evt.coordinate[0] - center[0], 2) + Math.pow(evt.coordinate[1] - center[1], 2));
        const lastDistance = Math.sqrt(
            Math.pow(this.lastPointerPosition[0] - center[0], 2) + Math.pow(this.lastPointerPosition[1] - center[1], 2),
        );

        // A drag that starts at or near the centre carries no usable scale
        // ratio: `currentDistance / lastDistance` diverges as `lastDistance`
        // approaches zero. A `> 0` guard is not enough — measured, a nudge a few
        // pixels off a circle's centre grew `size` by twenty orders of
        // magnitude. The centre is not a resize origin; ignore the gesture.
        if (this.resizeOriginNearCenter || lastDistance <= 0) return;

        const scaleFactor = currentDistance / lastDistance;
        this.activeController.handleResize(scaleFactor);
    }

    /**
     * Index of the MultiPoint vertex nearest `coordinate`, or -1 when the
     * feature is not a MultiPoint. Coordinates are EPSG:3857 metres, so plain
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

    private nearestVertexIndex(feature: Feature, coordinate: Coordinate): number {
        const geometry = feature.getGeometry();
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
     * EPSG:3857 metres, so plain Euclidean math is correct here — no turf.
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
        let coords = <number[][]>this.activeController.getBaseGeometry();
        if (!coords || coords.length < 2) return;

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
        // from the centre-line (a radius) overrides it to track the cursor 1:1.
        const scaleFactor = this.activeController.offsetScale ?? .5;
        const baseWidth = Math.abs(perpendicularDistance) * scaleFactor;
        this.activeController.setOffset?.(baseWidth);

        // One handle, two jobs: the magnitude above set the width, the sign sets the side.
        // Read separately and never from the raw signed value — using the signed number for
        // both would make a flip jump the width at the same moment.
        //
        // The threshold is Envelopment's reasoning: a deliberate move to one side flips it,
        // a pixel of jitter across the line does not.
        if (this.activeController.setMirrored && Math.abs(perpendicularDistance) > MIRROR_FLIP_MIN_PX * this.map.getView().getResolution()!) {
            // Negative, not positive. `widthAxis` is the line's left normal, and an
            // unmirrored cane already hangs on that side — so a *positive* perpendicular
            // is the side it is on, and reading it as "mirrored" flipped the graphic the
            // moment the user dragged along the side it was already on. Measured: the
            // handle sat 41px above the line, dragging further up gave a growing positive
            // perpendicular, and the cane flipped underneath.
            this.activeController.setMirrored(perpendicularDistance < 0);
        }
    }

    handleDragForLineAndPolygon(evt: MapBrowserEvent, controller: TacticalGraphicHandler) {
        let turfCurrent = openlayersAdapter.coordinateToTurfPoint(evt.coordinate);
        let turfLast = openlayersAdapter.coordinateToTurfPoint(this.lastPointerPosition);
        let distance = openlayersAdapter.getTurfDistance(turfLast, turfCurrent);
        let bearing = openlayersAdapter.getTurfBearing(turfLast, turfCurrent);
        controller.handleTranslate(distance, bearing);
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
        switch (this.currentMode) {
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
        this.unlistenDblClickZoomRestore?.();
        this.unlistenDblClickZoomRestore = undefined;
        if (this.dblClickZoom) return;

        this.dblClickZoom = this.map.getInteractions().getArray()
            .find((i): i is DoubleClickZoom => i instanceof DoubleClickZoom);
        if (this.dblClickZoom) this.map.removeInteraction(this.dblClickZoom);
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
        const zoom = this.dblClickZoom;
        if (!zoom || this.unlistenDblClickZoomRestore) return;

        const viewport = this.map.getViewport();
        const onMouseDown = (e: MouseEvent) => {
            if (e.detail > 1 || Date.now() < this.lastDrawEndedAt) return;
            this.unlistenDblClickZoomRestore?.();
            this.unlistenDblClickZoomRestore = undefined;
            this.dblClickZoom = undefined;
            this.map.addInteraction(zoom);
        };
        viewport.addEventListener('mousedown', onMouseDown);
        this.unlistenDblClickZoomRestore = () => viewport.removeEventListener('mousedown', onMouseDown);
    };

    private stopDrawing = (tacticalGraphicHandler: TacticalGraphicHandler, cancelled: boolean) => {
        if (this.escKeyHandler) {
            document.removeEventListener('keydown', this.escKeyHandler);
            this.escKeyHandler = undefined;
        }
        this.resumeDoubleClickZoomOnNextClick();
        if (cancelled) {
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
        let tacticalGraphicHandler: TacticalGraphicHandler = openlayersAdapter.getTacticalGraphicController(name, resolution);

        this.renderingVectorSource.addFeatures(tacticalGraphicHandler.getFeatures());
        this.watchResolution(tacticalGraphicHandler);

        // Disable double-click zoom so finishing a draw with double-click doesn't zoom the map
        this.suspendDoubleClickZoom();

        this.draw = new Draw({
            source: drawingVectorSource,
            type: tacticalGraphicHandler.type,
            // Falls back to the shared draw style rather than to OpenLayers' built-in
            // editing style, so the configured draw-marker colours apply to every
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
            tacticalGraphicHandler.onDrawEndFunc(e);
            drawingVectorSource.clear();
            this.graphicControllers.push(tacticalGraphicHandler);
            this.stopDrawing(tacticalGraphicHandler, false);
        });
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
        // Only allow the base feature (linestring/polygon) for a tactical graphic to be modified
        // once the graphic is modified, the underlying graphic will re-render the tactical graphic from the geometry library.
        let baseFeatures = this.getRenderedFeaturesByProp('base');
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
    };
}