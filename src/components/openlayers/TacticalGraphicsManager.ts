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
import {Coordinate} from "ol/coordinate";

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
    }

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

    // define what happens on mouse down, drag and mouse up events.
    getPointerInteraction = () => {
        return new Pointer({
            handleDownEvent: this.handleDownEvent,
            handleDragEvent: this.handleDragEvent,
            handleUpEvent: (): boolean => {
                this.lastPointerPosition = null;
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

        this.lastPointerPosition = evt.coordinate;

        // A fixed-vertex graphic hands OpenLayers' Modify nothing (its base
        // feature has `base` cleared), so an edit-mode drag would fall through
        // to the map and pan it. Claim the drag and stretch the graphic instead.
        if (this.isModifying()) return !!this.activeController.editStretches;

        return this.isRotating() || this.isTranslating() || this.isResizing();
    };

    handleDragEvent = (evt: MapBrowserEvent): void => {
        if (!this.lastPointerPosition || !this.activeController) return;

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
        }
        if (this.draw) {
            this.map.removeInteraction(this.draw);
            this.draw = undefined;
        }
        this.setInteractionMode(InteractionType.view);
    };

    handleDrawTacticalGraphic = (name: TacticalGraphicName) => {
        if (this.draw) this.map.removeInteraction(this.draw);

        // create a new source for drawing, this can be modified per application
        let drawingVectorSource = new VectorSource();

        // Fetch a tactical graphic & handler based on the tactical graphic name, use the resolution to scale the graphic
        let resolution = this.map.getView().getResolution() || 1;
        let tacticalGraphicHandler: TacticalGraphicHandler = openlayersAdapter.getTacticalGraphicController(name, resolution);

        this.renderingVectorSource.addFeatures(tacticalGraphicHandler.getFeatures());
        this.map.getView().on('change:resolution', tacticalGraphicHandler.onResolutionChangeFunc);

        // Disable double-click zoom so finishing a draw with double-click doesn't zoom the map
        this.suspendDoubleClickZoom();

        this.draw = new Draw({
            source: drawingVectorSource,
            type: tacticalGraphicHandler.type,
            style: tacticalGraphicHandler.drawStyleFunc ?? undefined,
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