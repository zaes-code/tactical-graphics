/**
 * # Drawing and editing, for MapLibre
 *
 * The counterpart to `TacticalGraphicsManager` and the OpenLayers controllers,
 * built on a different footing.
 *
 * OpenLayers gives you `Draw` and `Modify` interactions and a graph of live
 * features to mutate; a controller there transforms rendered geometry and keeps
 * the numbers that produced it on a holder. MapLibre gives you pointer events and
 * a canvas, and its drawn output is derived — realized into GeoJSON sources and
 * discarded on the next rebuild. So there is nothing to mutate in place, and the
 * only thing worth editing is what survives: the base geometry and the property
 * bag. @see editGeometry.ts
 *
 * That turns out to be the better shape rather than a concession. A gesture edits
 * the *portable description*, the generator redraws from it, and what the user
 * manipulates is exactly what gets saved.
 *
 * ## Modes, and why the map has to be told to stop
 *
 * MapLibre pans on drag by default. Every gesture here therefore starts by
 * disabling `dragPan` on pointer-down and restoring it on pointer-up — without
 * that a resize drags the graphic *and* the map out from under it.
 */

import type {Map as MapLibreMap, MapMouseEvent} from 'maplibre-gl';
import type {Geometry, Position} from 'geojson';
import {
    TacticalGraphicName,
    allowedGestures,
    baseGeometryFor,
    clampEnvelopmentBend,
    envelopmentBendFrom,
    clampTurnBend,
    RANGE_FAN_BAND_OFFSET,
    handleContract,
    handleRole,
    type TacticalGraphicProperties,
} from '@zaes/tactical-graphics';
import {buildTacticalGraphic, type MapLibreTacticalGraphic} from '../maplibreAdapter';
import type {NativeLayerRenderer} from '../native/NativeLayerRenderer';
import {resolutionOf, toLonLat, toMercator} from '../projection';
import {anchorVertex, baseVertexCount, dropSizePx, editStretches, groundLength, hasBakedDecoration, isRectangular, normalizeDrawnBase, drawnAnchorFrame, drawnAnchors, minimumDrawnRadiusPx, rectangleAmplifiers, screenMeters, showsSizeReadout, usesDrawnAnchors, type GestureKind, type ProjectedPosition, type SelectionBox} from '@zaes/tactical-graphics';
import {
    centerOf,
    insertVertex,
    moveVertex,
    positionsOf,
    resize,
    rotate,
    setBandRange,
    setBend,
    setMirror,
    setOffset,
    setReach,
    translate,
    type GraphicDescription,
} from './editGeometry';

/**
 * What a drag currently means. Mirrors OpenLayers' `InteractionType`.
 *
 * `edit` is the unified mode: click to select, then reshape by the selected graphic's
 * own handles or drive a gesture from an affordance the host draws around it.
 */
export type EditMode = 'view' | 'edit' | 'translate' | 'rotate' | 'resize' | 'modify';

/** How close a click must land on a base vertex to grab it, in screen pixels. */
const VERTEX_GRAB_PX = 10;

/**
 * How close a drag must start to a segment to add a vertex there, in screen pixels.
 *
 * Tighter than `VERTEX_GRAB_PX`, and deliberately so: a grab near a corner is within
 * reach of both tests, and moving the vertex that is already there is almost always
 * what was meant. The vertex test runs first for the same reason.
 */
const SEGMENT_GRAB_PX = 8;

/**
 * The nearest point on a line segment to `p`, and how far away it is — all in screen
 * pixels.
 *
 * The point is what the hover hint is drawn at: OpenLayers shows the vertex you would
 * create sliding along the geometry under the cursor, so it has to be the projection
 * onto the segment rather than the cursor itself.
 */
function closestPointOnSegment(
    p: {x: number; y: number},
    a: {x: number; y: number},
    b: {x: number; y: number},
): {distance: number; x: number; y: number} {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    // A degenerate segment is a point, and the nearest point on it is that point.
    if (lengthSquared === 0) return {distance: Math.hypot(p.x - a.x, p.y - a.y), x: a.x, y: a.y};

    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
    const x = a.x + t * dx;
    const y = a.y + t * dy;
    return {distance: Math.hypot(p.x - x, p.y - y), x, y};
}

/**
 * How close two consecutive draw clicks have to be to count as one.
 *
 * Small, because it only has to catch a double-click — which lands on the same pixel
 * or within a hand-tremor of it — without refusing two deliberate vertices a user
 * placed close together. @see addSketchVertex
 */
const DUPLICATE_CLICK_PX = 4;

/**
 * How far the pointer must move before a press counts as a drag.
 *
 * Without it every click is a one-pixel drag, which rebuilds the graphic and — far
 * worse — makes a click that was meant to *select* also nudge the thing it
 * selected.
 */
const DRAG_THRESHOLD_PX = 3;

/** Default size for a point-anchored graphic, in meters, when one is drawn fresh. */
const DEFAULT_RADIUS_METERS = 40_000;

/**
 * The id the in-progress draw's preview is realised under.
 *
 * Reserved and constant: there is only ever one draw, and a fixed id means the preview
 * can be replaced in place on every pointer move rather than added and removed.
 */
const DRAW_PREVIEW_ID = '__tg-draw-preview';

/**
 * How long after a draw ends a press is still assumed to belong to it.
 *
 * The same window OpenLayers uses, and for the same reason.
 * @see MapLibreInteractions.resumeDoubleClickZoomOnNextPress
 */
const DRAW_END_DOUBLE_CLICK_GUARD_MS = 1000;

/** Below this the second draw click landed on the anchor and carries no size. */
const MIN_DRAWN_RADIUS_M = 1;

export interface InteractionCallbacks {
    /** A graphic was added, edited or removed — the host may want to save. */
    onChange?(): void;
    /** Selection moved. Null when the user clicked empty map. */
    onSelect?(graphic: MapLibreTacticalGraphic | null): void;
    /** A draw finished or was canceled, so a host can un-arm its button. */
    onDrawEnd?(): void;
}

/**
 * The modes that put handles on every graphic. Mirrors
 * `TacticalGraphicsManager.enableHandleModes` — the two must agree, because the same
 * button in the same panel drives both.
 */
const HANDLE_MODES: readonly EditMode[] = ['edit', 'translate', 'rotate', 'resize', 'modify'];

/** How near the pivot a grab counts as *on* it, in screen pixels. @see startedOnPivot */
const PIVOT_GRAB_PX = 6;

/**
 * What a handle of *this* graphic does.
 *
 * The vertex count comes from the drawn base, because one contract splits on it: a
 * corridor's generator emits `[...vertices, ...tangent points]` and the tail sets the
 * width. Calling `handleRole` without it left every corridor handle a `shape` handle,
 * so MapLibre drew the width handles and gave them nothing to do — a corridor could
 * not be widened in that engine at all. @see handleRole
 */
function roleOfHandle(graphic: MapLibreTacticalGraphic, index: number) {
    return handleRole(graphic.name, index, vertexCountOf(graphic));
}

/** How many points the user drew — the length of the base's own coordinate list. */
function vertexCountOf(graphic: MapLibreTacticalGraphic): number {
    const coordinates = (graphic.base.geometry as {coordinates?: unknown}).coordinates;
    if (!Array.isArray(coordinates)) return 0;
    return typeof coordinates[0] === 'number' ? 1 : coordinates.length;
}

/**
 * The rim handle: the one **farthest** from the centre, in projected metres.
 *
 * Two things this gets right that the first version did not.
 *
 * **Farthest, not "the first one that is not exactly at the centre".** The centre handle
 * is found by position rather than by index and lands a few thousand metres off zero at
 * these scales — measured, 8 460 m against a rim at 1 180 011 — so a `> 0` test happily
 * accepted it and drew a read-out that stopped a whisker from the middle.
 *
 * **Its own position, not a rescale to `properties.radius`.** That field is in *ground*
 * metres while the handles and the drawn circle are in projected metres, and the two
 * differ by 22% at this latitude: rescaling put the end of the line nowhere near the rim
 * the user was dragging. The handle *is* the rim, so use it.
 */
function rimHandleOf(graphic: MapLibreTacticalGraphic, center: ProjectedPosition): ProjectedPosition | undefined {
    let best: ProjectedPosition | undefined;
    let bestDistance = 0;
    for (const position of graphic.handles ?? []) {
        const distance = Math.hypot(position[0] - center[0], position[1] - center[1]);
        if (distance > bestDistance) {
            bestDistance = distance;
            best = position;
        }
    }
    return best;
}

/**
 * Rewrites the amplifiers a graphic's own geometry defines, after a gesture has moved it.
 *
 * A rectangular zone's width is doctrinal *input* — APP-06 calls these "two anchor points
 * and a width, defined in metres" — so the shape and the number drive each other, and a
 * drag that changes one has to write the other. OpenLayers does this in
 * `AreaGraphicBase.publishRectangleWidth`; without it here, resizing a rectangular
 * airspace zone on MapLibre left `width` at whatever it was drawn with, and the snapshot
 * disagreed with its own geometry. @see rectangleAmplifiers
 */
function withDerivedAmplifiers(name: TacticalGraphicName, description: GraphicDescription): GraphicDescription {
    if (usesDrawnAnchors(name)) return withAnchorFrame(name, description);

    const ring = (description.geometry as {type: string; coordinates?: unknown}).type === 'Polygon'
        ? ((description.geometry as unknown as {coordinates: [number, number][][]}).coordinates?.[0])
        : undefined;
    const derived = rectangleAmplifiers(name, ring);
    if (derived.width === undefined) return description;
    if (description.properties.width === derived.width && description.properties.length === derived.length) return description;
    return {...description, properties: {...description.properties, ...derived}};
}

/**
 * The same idea for the six graphics drawn from anchor points: **the points are the
 * truth, so the numbers follow them.**
 *
 * Their `radius` and `rotation` are a description of where the anchors are, not a second
 * input beside them — which is why moving one has to rewrite them. Left alone, a Turn
 * dragged twice as long went on reporting the radius it was drawn with, the size read-out
 * quoted a distance nobody could measure on the map, and a snapshot rebuilt the *old*
 * symbol wherever the amplifier outranks the geometry. OpenLayers has always done this,
 * in each holder's `adoptAnchors`; the readers are shared, only the dispatch was not.
 *
 * @see drawnAnchorFrame, which is that dispatch
 */
function withAnchorFrame(name: TacticalGraphicName, description: GraphicDescription): GraphicDescription {
    const geometry = description.geometry as {type: string; coordinates?: Position[]};
    if (geometry.type !== 'LineString') return description;

    const frame = drawnAnchorFrame(name, geometry.coordinates);
    if (!frame) return description;

    const properties = {
        ...description.properties,
        radius: frame.size,
        rotation: frame.rotation ?? 0,
        ...(frame.bend === undefined ? {} : {bend: frame.bend}),
        ...(frame.mirrored === undefined ? {} : {mirrored: frame.mirrored}),
    };
    return {...description, properties};
}

/**
 * The other direction: a gesture that set a **number** rewrites the points from it.
 *
 * `setBend`, `setReach` and `setMirror` change a property, and for these six the picture
 * comes from the anchors — so without this the number moved and the symbol did not.
 * OpenLayers hit the same defect from the same cause and fixed it the same way, by
 * republishing the base from holder state. @see drawnAnchors
 *
 * The current frame is read back first so the drag changes only what it grabbed: a bend
 * drag must not reset Pursuit's line ratio to the family default on its way past.
 */
function withAnchorGeometry(description: GraphicDescription): GraphicDescription {
    const name = description.properties.name;
    if (!usesDrawnAnchors(name)) return description;
    const geometry = description.geometry as {type: string; coordinates?: Position[]};
    if (geometry.type !== 'LineString') return description;

    const current = drawnAnchorFrame(name, geometry.coordinates);
    const anchors = drawnAnchors(name, {
        ...current,
        center: current?.center ?? geometry.coordinates![0],
        size: description.properties.radius ?? current?.size ?? 0,
        rotation: description.properties.rotation ?? current?.rotation ?? 0,
        bend: description.properties.bend ?? current?.bend,
        mirrored: description.properties.mirrored ?? current?.mirrored,
    });
    if (!anchors) return description;
    return {...description, geometry: {type: 'LineString', coordinates: anchors}};
}

export class MapLibreInteractions {
    private mode: EditMode = 'view';
    /** The graphic being drawn, or null when not drawing. */
    private drawing: TacticalGraphicName | null = null;
    /** Vertices collected so far, in lon/lat. */
    private sketch: Position[] = [];

    /** State for the drag in progress. */
    private dragging: {
        graphic: MapLibreTacticalGraphic;
        /** Which base vertex is being dragged in `modify`, or -1. */
        vertex: number;
        /** Where to add a vertex when this drag starts, or -1. @see grabSegment */
        insertAt: number;
        /** Whether the drag began on the inert center dot. */
        onCenter: boolean;
        /** Whether the drag began on the rotate/resize pivot. @see startedOnPivot */
        onPivot: boolean;
        /** Which handle was grabbed, or -1 for a drag that started on the body. */
        handle: number;
        last: Position;
        /** Whether the pointer has moved far enough to count. @see DRAG_THRESHOLD_PX */
        started: boolean;
        startPixel: {x: number; y: number};
    } | null = null;

    /**
     * The gesture a host's affordance started, held for one drag.
     *
     * `edit` is not itself a gesture — a drag inside it reshapes, as `modify` does. When
     * the host presses a rotate or resize affordance the drag has to mean *that*, so it
     * is latched here and read by {@link effectiveMode}, then dropped on release.
     */
    private activeGesture: GestureKind | null = null;
    /** Whether a draw preview is currently on the map. @see previewDraw */
    private previewing = false;
    /** When the last draw ended, and how to stop waiting. @see resumeDoubleClickZoomOnNextPress */
    private drawEndedAt = 0;
    private unlistenDoubleClickRestore: (() => void) | undefined;

    /**
     * What a drag means right now: the latched gesture if one is running, else the mode.
     *
     * `applyGesture` switches on this rather than on `this.mode`, which is what lets the
     * one `edit` mode host all three gestures without any of them being reimplemented.
     */
    private effectiveMode(): EditMode {
        return this.activeGesture ?? this.mode;
    }

    constructor(
        private readonly map: MapLibreMap,
        private readonly renderer: NativeLayerRenderer,
        private readonly callbacks: InteractionCallbacks = {},
    ) {
        map.on('mousedown', this.onPointerDown);
        map.on('mousemove', this.onPointerMove);
        map.on('mouseup', this.onPointerUp);
        map.on('click', this.onClick);
        map.on('dblclick', this.onDoubleClick);
        // A hint left behind when the cursor leaves the map offers an edit at a place
        // the pointer is no longer near. @see updateVertexHint
        map.on('mouseout', this.onMouseOut);
        // `keydown` is not a map event — the canvas has to be focusable for it, and
        // it is simpler to listen on the document than to manage focus.
        document.addEventListener('keydown', this.onKeyDown);
    }

    destroy(): void {
        this.unlistenDoubleClickRestore?.();
        this.unlistenDoubleClickRestore = undefined;
        this.map.off('mousedown', this.onPointerDown);
        this.map.off('mousemove', this.onPointerMove);
        this.map.off('mouseup', this.onPointerUp);
        this.map.off('click', this.onClick);
        this.map.off('dblclick', this.onDoubleClick);
        this.map.off('mouseout', this.onMouseOut);
        document.removeEventListener('keydown', this.onKeyDown);
    }

    // ── modes ───────────────────────────────────────────────────────────────

    setMode(mode: EditMode): void {
        this.cancelDraw();
        this.mode = mode;
        // The old mode's answer does not survive the change: a pointer left over a handle
        // that view mode does not drag would promise a gesture that no longer exists.
        this.setCursor('default');
        // The hint belongs to modify alone, and a stale one left behind would offer an
        // edit the new mode does not perform. @see updateVertexHint
        this.renderer.setVertexHint(null);
        /*
         * **Entering edit starts with nothing selected**, on both engines.
         *
         * MapLibre keeps a selection from whatever was last clicked or drawn —
         * `finishDraw` selects what it just made, and the properties dialog reads it —
         * while OpenLayers had no selection concept at all until edit mode gave it one.
         * Left alone, the same button produced a graphic already wearing handles and a
         * box on one engine and a bare map on the other, which is the class of
         * divergence this repository keeps finding. The panel says "click a graphic";
         * both engines now mean it.
         */
        if (mode === 'edit') this.renderer.select(null);

        // Every graphic wears its handles in a handle-bearing mode and none in view,
        // which is what the OpenLayers manager does on the same button — except in
        // `edit`, where the handles belong to the selection alone.
        // @see NativeLayerRenderer.setHandleMode
        this.renderer.setHandleMode(HANDLE_MODES.includes(mode), mode === 'edit');
    }

    getMode(): EditMode {
        return this.mode;
    }

    /**
     * Runs one gesture from a host's affordance, outside the map's own pointer handlers.
     *
     * The affordance is a DOM element over the map, so its `pointerdown` never reaches
     * MapLibre — and even if it did, the pointer is nowhere near the graphic, so the hit
     * test would find nothing. The drag is therefore driven from `window`, and the state
     * `onPointerDown` would have latched is set here from the *selection* instead of
     * from a hit test.
     *
     * Everything after that is the existing machinery: `activeGesture` makes
     * {@link effectiveMode} answer for the gesture, and each move goes through the same
     * `applyGesture` a handle drag uses. @see TacticalGraphicsManager.beginGesture, the
     * OpenLayers twin — the two must stay the same gesture.
     */
    beginGesture(kind: GestureKind, event: PointerEvent): boolean {
        if (this.activeGesture || this.dragging || this.drawing) return false;
        const id = this.renderer.selection;
        const graphic = id ? this.renderer.find(id) : undefined;
        if (!graphic) return false;
        if (!allowedGestures(graphic.name)[kind]) return false;

        const origin = this.positionFromPointer(event);
        if (!origin) return false;

        this.activeGesture = kind;
        this.dragging = {
            graphic,
            vertex: -1,
            insertAt: -1,
            onCenter: false,
            // An affordance is never on the anchor, so a resize from one always carries
            // a ratio. The pivot guard is for a handle dragged from on top of it.
            onPivot: false,
            handle: -1,
            last: origin,
            // Already past the threshold: the host decided a drag began by pressing the
            // affordance, and re-measuring it against a pixel distance would swallow the
            // first few degrees of every rotate.
            started: true,
            startPixel: {x: event.clientX, y: event.clientY},
        };

        const move = (moveEvent: PointerEvent) => {
            const to = this.positionFromPointer(moveEvent);
            if (to) this.dragTo(to);
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            this.activeGesture = null;
            this.endDrag();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        return true;
    }

    /** A DOM pointer event's position in lon/lat, or undefined if the map is not ready. */
    private positionFromPointer(event: {clientX: number; clientY: number}): Position | undefined {
        const canvas = this.map.getCanvasContainer();
        if (!canvas) return undefined;
        const rect = canvas.getBoundingClientRect();
        const lngLat = this.map.unproject([event.clientX - rect.left, event.clientY - rect.top]);
        return [lngLat.lng, lngLat.lat];
    }

    /**
     * The selected graphic's on-screen extent, in map-container pixels.
     *
     * From the **rendered** geometry's projected bounds, which is the same box the
     * OpenLayers side measures from its rendered features — the two engines have to draw
     * the host's chrome in the same place. @see boundsOf
     */
    selectionBox(): SelectionBox | undefined {
        const id = this.renderer.selection;
        const graphic = id ? this.renderer.find(id) : undefined;
        const bounds = graphic?.graphic.bounds;
        if (!bounds) return undefined;

        // Two opposite corners: the projection counts y upward and the screen counts it
        // downward, so min and max are re-derived after converting rather than assumed.
        const topLeft = this.map.project(toLonLat([bounds.minX, bounds.maxY]));
        const bottomRight = this.map.project(toLonLat([bounds.maxX, bounds.minY]));
        const x = Math.min(topLeft.x, bottomRight.x);
        const y = Math.min(topLeft.y, bottomRight.y);
        return {x, y, width: Math.abs(bottomRight.x - topLeft.x), height: Math.abs(bottomRight.y - topLeft.y)};
    }

    /**
     * Arms the draw tool.
     *
     * A point graphic finishes on the first click and never enters the sketch, so
     * `baseGeometryFor` is consulted up front rather than at the end — a draw tool
     * that asked afterwards would need a click to discover it did not need one.
     */
    startDraw(name: TacticalGraphicName): void {
        this.cancelDraw();
        this.drawing = name;
        this.mode = 'view';
        this.map.doubleClickZoom.disable();
        // **And drop any restore the last draw armed.** It fires on the next press on the
        // canvas, which — once a second has passed — is the first click of *this* draw:
        // the zoom came back mid-draw and the double-click that ended the graphic zoomed
        // the map after all. Only the very first draw of a session was unaffected, which
        // is what made it look like a per-graphic defect.
        // @see resumeDoubleClickZoomOnNextPress
        this.unlistenDoubleClickRestore?.();
        this.unlistenDoubleClickRestore = undefined;
    }

    cancelDraw(): void {
        if (!this.drawing) return;
        this.drawing = null;
        this.sketch = [];
        this.renderer.setSketch(null);
        // An abandoned sizing click would otherwise leave its read-out — or its preview,
        // which is a real graphic and would otherwise become a permanent one — on the map.
        this.clearPreview();
        this.renderer.setMeasure(null);
        this.resumeDoubleClickZoomOnNextPress();
        this.callbacks.onDrawEnd?.();
    }

    /**
     * Puts double-click zoom back — but not until the browser has finished delivering
     * the double-click that ended the draw.
     *
     * **A fixed-vertex graphic finishes on the second *click* of that double-click**, so
     * by the time the trailing `dblclick` arrives the draw is over and nothing absorbs
     * it: finishing a bridge zoomed the map a level, while a free-form line — which ends
     * on the `dblclick` itself — did not. It made the symbol look twice the size it is,
     * which is what sent this investigation off after a size defect that was not there.
     *
     * Waiting for the next press sidesteps the timing entirely. `detail` is the
     * consecutive-click count, so `> 1` means this press is the second half of the
     * double-click still being waited out. The one-second guard covers the other end: a
     * one-click drop is over before the double-click even starts, so its second press is
     * a genuine `detail === 1` that would re-arm the zoom in time for its own `dblclick`.
     *
     * OpenLayers reached the same two rules from the same symptom, and the comment on
     * `resumeDoubleClickZoomOnNextClick` there is the longer version of this one.
     */
    private resumeDoubleClickZoomOnNextPress(): void {
        this.drawEndedAt = Date.now();
        if (this.unlistenDoubleClickRestore) return;

        const container = this.map.getCanvasContainer();
        const onMouseDown = (event: MouseEvent): void => {
            if (event.detail > 1 || Date.now() - this.drawEndedAt < DRAW_END_DOUBLE_CLICK_GUARD_MS) return;
            this.unlistenDoubleClickRestore?.();
            this.unlistenDoubleClickRestore = undefined;
            this.map.doubleClickZoom.enable();
        };
        container.addEventListener('mousedown', onMouseDown);
        this.unlistenDoubleClickRestore = () => container.removeEventListener('mousedown', onMouseDown);
    }

    get isDrawing(): boolean {
        return this.drawing !== null;
    }

    // ── drawing ─────────────────────────────────────────────────────────────

    private readonly onClick = (event: MapMouseEvent): void => {
        if (this.drawing) {
            this.addSketchVertex([event.lngLat.lng, event.lngLat.lat]);
            return;
        }
        // A click that ended a drag is not a selection: the pointer went down on the
        // graphic that is already selected and the user was moving it, not picking it.
        if (this.dragging?.started) return;

        const graphic = this.renderer.hitTest(event.point);
        this.renderer.select(graphic?.id ?? null);
        this.callbacks.onSelect?.(graphic ?? null);
    };

    private addSketchVertex(position: Position): void {
        const name = this.drawing;
        if (!name) return;

        const wants = baseGeometryFor(name);
        if (wants === 'Point') {
            // **A one-click graphic is done on the first click**, whether or not it can
            // afterwards be resized. It is dropped at `dropSizePx` worth of metres and the
            // operator drags its edge handle if they want it bigger — which is what
            // OpenLayers' `PointDropController` does, and the two engines have to agree
            // about it or the same button behaves differently depending on the renderer.
            //
            // This used to key off `allowedGestures(name).resize`, on the reasoning that a
            // resizable point graphic is *sized by the draw* in two clicks. True of the
            // point-anchored graphics OpenLayers draws through a Circle interaction, and
            // false of every one-click drop — so the airfield took two clicks here and one
            // there the moment it stopped being a fixed-size badge, and the completed
            // roadblock had been doing it all along. @see dropSizePx
            if (dropSizePx(name) !== undefined) {
                this.finishDraw([position]);
                return;
            }

            // **A graphic that can be resized is otherwise sized by the draw**, in two
            // clicks: the first plants the anchor, the second sets how far out it reaches
            // and which way it faces. Finishing on the first click instead dropped these at
            // a fixed metre default, which at a typical zoom is a symbol a few pixels
            // across with its handles piled on top of each other and nothing grabbable.
            if (!allowedGestures(name).resize) {
                this.finishDraw([position]);
                return;
            }
            if (!this.sketch.length) {
                this.sketch.push(position);
                return;
            }
            this.finishDraw([this.sketch[0], position]);
            return;
        }

        // **The second click of a double-click is not a new vertex.** MapLibre delivers
        // both of them as ordinary `click`s before it delivers the `dblclick`, and they
        // land on the same pixel — so double-clicking the apex of a fields-of-fire
        // pushed that apex twice, hit the three-vertex count, and finished the draw with
        // a leg of zero length. The V had nothing to open, and the tip handle sat
        // exactly on the apex handle, so the user grabbed the apex whichever they aimed
        // for. That is the "V angle cannot be modified" this fixes.
        //
        // Measured in screen pixels rather than degrees: whether two clicks are the same
        // click is a question about the cursor, not about the ground.
        const previous = this.sketch[this.sketch.length - 1];
        if (previous && this.pixelsApart(previous, position) < DUPLICATE_CLICK_PX) return;

        this.sketch.push(position);

        // A rectangle is two opposite corners and nothing else — the other two follow.
        // @see buildBox, isRectangular
        if (isRectangular(name) && this.sketch.length >= 2) {
            this.finishDraw(this.sketch.slice(0, 2));
            return;
        }

        // A graphic with a fixed base finishes on its own last click. It never sends
        // the double-click a free-form line ends on, so waiting for one meant a
        // fields-of-fire could not be drawn here at all: five clicks, no graphic.
        // @see baseVertexCount
        const wanted = baseVertexCount(name);
        if (wanted !== undefined && this.sketch.length >= wanted) {
            this.finishDraw(this.sketch.slice(0, wanted));
            return;
        }

        this.renderer.setSketch(this.sketch.map(p => toMercator([p[0], p[1]])));
    }

    private readonly onMouseOut = (): void => {
        this.renderer.setVertexHint(null);
        this.setCursor('');
    };

    /**
     * A pointer over something a click or drag would act on, and an ordinary arrow
     * everywhere else — the same rule and the same hit-testing as
     * `TacticalGraphicsManager.updateHoverCursor`.
     *
     * **MapLibre's default is an open hand**, set by its own CSS on the interactive
     * canvas, and it says "you can pan" over every pixel of the map — including over a
     * graphic, where it is wrong, and over the vertex hint, where it hides the dot it
     * sits on. So the arrow here is not a preference: it is the absence of a claim,
     * which is what lets the pointer mean something when it appears.
     */
    private updateHoverCursor(point: {x: number; y: number}): void {
        if (this.drawing) return;

        let interactive: boolean;
        if (HANDLE_MODES.includes(this.mode)) {
            // Only a handle that would move. The center dot is inert except in translate,
            // where it is the one place a user naturally reaches to drag a symbol bodily.
            const grabbed = this.renderer.hitTestHandle(point);
            interactive = !!grabbed
                && (grabbed.index !== this.renderer.centerHandleOf(grabbed.graphic) || this.mode === 'translate');
        } else {
            interactive = !!this.renderer.hitTest(point);
        }

        this.setCursor(interactive ? 'pointer' : 'default');
    }

    /** The canvas cursor. Inline, because it has to beat MapLibre's own class. */
    private setCursor(cursor: string): void {
        const canvas = this.map.getCanvas();
        if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
    }

    /**
     * The size and bearing a point-anchored draw supplies, from its two clicks.
     *
     * The second click is a point on the rim: how far it is from the anchor is the
     * radius, and the direction it lies in is the graphic's bearing — both read exactly
     * as OpenLayers reads them off a Circle sketch. Planar, in projected meters, which is
     * also the frame `rotation` is expressed in: degrees counter-clockwise from east, not
     * a compass bearing.
     *
     * Falls back to the default for a one-click draw, so a fixed-size symbol is
     * unaffected and a canceled sizing click cannot leave a graphic with no size at all.
     */
    private sizeFromDraw(
        name: TacticalGraphicName,
        wants: string | undefined,
        vertices: Position[],
    ): {radius?: number; rotation: number} {
        // **A graphic whose size *is* its decoration gets no radius at all.** For the
        // direction-of-attack family and the crossings, `size` means "how big is the
        // chevron", which the renderer derives from the zoom — so a placeholder radius
        // here is not a default, it is a wrong answer that outranks the right one:
        // `bakedDecorationSize` cannot tell a placeholder from a genuinely saved size, so
        // it honored 40 km where OpenLayers derived 196 km, and the handles that hang off
        // the arrow landed nowhere near it. @see hasBakedDecoration
        if (hasBakedDecoration(name)) return {rotation: 0};
        // A one-click drop has no second vertex to measure, and its size is a screen size
        // converted here — the same number OpenLayers hands its holder. Falling through to
        // `DEFAULT_RADIUS_METERS` is what made these land at a fixed metre size regardless
        // of zoom. @see dropSizePx
        const drop = dropSizePx(name);
        // Converted where it lands: a pixel count times the bare resolution is a projected
        // length, so the same badge dropped at 60 degrees north came out twice the size it
        // does on the equator. @see screenMeters
        if (drop !== undefined) {
            return {radius: screenMeters(drop, resolutionOf(this.map), vertices[0]?.[1] ?? 0), rotation: 0};
        }
        /*
         * **A drawn graphic gets no placeholder radius.** On a LineString, `radius` is
         * the graphic's half-width — what `LineGraphicBase.setOffset` replays — and
         * `sizeDefaults` already derives it as `drawingResolution × 20`, which is the
         * rule the OpenLayers holders use. Stamping `DEFAULT_RADIUS_METERS` here handed
         * that derivation a value it could not tell from a genuinely saved one, so it
         * won: an air corridor drawn on MapLibre came out 80 km wide where the same
         * corridor drawn on OpenLayers came out 391 km.
         *
         * This is the same mistake the `hasBakedDecoration` guard above already
         * describes — a placeholder is not a default, it is a wrong answer that outranks
         * the right one — and it applies to every drawn width graphic, not just the
         * corridors.
         */
        if (wants !== 'Point') return {rotation: 0};
        // A point-anchored graphic with no second vertex has no size to measure, and a
        // radius of nothing is worse than a fixed one.
        if (vertices.length < 2) return {radius: DEFAULT_RADIUS_METERS, rotation: 0};

        const center = toMercator([vertices[0][0], vertices[0][1]]);
        const rim = toMercator([vertices[1][0], vertices[1][1]]);
        const dx = rim[0] - center[0];
        const dy = rim[1] - center[1];
        const radius = Math.hypot(dx, dy);

        // A click on the anchor carries no size and no direction; the default is better
        // than a graphic with a radius of nothing.
        if (radius < MIN_DRAWN_RADIUS_M) return {radius: DEFAULT_RADIUS_METERS, rotation: 0};
        // **On the ground, not on the screen.** `radius` is a real distance the generator
        // builds from geodesically; these are mercator metres, 1.56x too long at 50
        // degrees north. Stamping them made the rim outrun the cursor that sized it — the
        // same defect OpenLayers had, from the same measurement. @see mercator.ts
        return {
            radius: this.legibleRadius(name, groundLength(radius, vertices[0][1]), vertices[0][1]),
            rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
        };
    }

    private readonly onDoubleClick = (event: MapMouseEvent): void => {
        if (!this.drawing) return;
        event.preventDefault();
        // The double-click also fired two `click`s, so the last vertex is already in.
        //
        // **And it only ends a draw that has enough points**, which is what
        // `sketchIsComplete` has always documented and never got asked. Ending early
        // built a half symbol: a two-point ferry crossing is not a ferry crossing.
        if (!this.sketchIsComplete()) return;
        this.finishDraw(this.sketch);
    };

    /** Screen distance between two lon/lat positions, for the questions that are about the cursor. */
    private pixelsApart(a: Position, b: Position): number {
        const p = this.map.project([a[0], a[1]]);
        const q = this.map.project([b[0], b[1]]);
        return Math.hypot(p.x - q.x, p.y - q.y);
    }

    /**
     * Whether the sketch has enough points to become a graphic.
     *
     * A fixed-vertex graphic needs **exactly** its count, so an Enter or a
     * double-click part-way through is refused rather than producing a half symbol —
     * a one-segment fields-of-fire is a line with an arrowhead at each end, which is
     * a different graphic. @see baseVertexCount
     */
    private sketchIsComplete(): boolean {
        const name = this.drawing;
        if (!name) return false;
        // Two corners is a whole rectangle. @see buildBox
        if (isRectangular(name)) return this.sketch.length >= 2;
        const wanted = baseVertexCount(name);
        // Asked of the **normalized** sketch, not the raw one, so a graphic that defines
        // part of its own base counts as finished once the rest is implied: two points
        // of a fields-of-fire are a whole V, because the second leg follows from them.
        // Deriving it here rather than listing the exceptions keeps one source for what
        // a complete base is. @see normalizeDrawnBase
        return wanted === undefined ? this.sketch.length >= 2 : normalizeDrawnBase(name, this.sketch).length === wanted;
    }

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') this.cancelDraw();
        else if (event.key === 'Enter' && this.sketchIsComplete()) this.finishDraw(this.sketch);
    };

    /**
     * The graphic a set of clicked vertices describes.
     *
     * Shared by the commit and the live preview, which is the point: a preview built by
     * a second, similar-looking rule would be a picture of a different symbol, and it
     * would diverge the moment either rule changed. Everything specific to a family —
     * the box a rectangle is drawn as, the vertex a fields-of-fire has implied, the size
     * read off a centre-to-edge drag — is decided once, here.
     *
     * Returns undefined while the vertices do not yet describe anything: two points of a
     * polygon, one point of a line. The caller shows nothing rather than a half symbol.
     */
    private graphicFrom(name: TacticalGraphicName, vertices: Position[]): MapLibreTacticalGraphic | undefined {
        const drawn = this.anchorDraw(name, vertices);
        if (drawn) return buildTacticalGraphic(name, drawn.geometry, drawn.properties, resolutionOf(this.map));

        const wants = baseGeometryFor(name);
        // What the user clicked becomes what is stored — repeated clicks dropped, and an
        // implied vertex made real so it gets a handle. @see normalizeDrawnBase
        const geometry =
            isRectangular(name) && vertices.length >= 2
                ? buildBox(vertices)
                : buildBase(wants, wants === 'LineString' ? normalizeDrawnBase(name, vertices) : vertices);
        if (!geometry) return undefined;

        const properties: TacticalGraphicProperties = {
            name,
            // The generators need both, and neither has a safe absent value: `rotation`
            // reaches `Math.cos` and comes back NaN, and a point-anchored graphic with
            // no radius has no size at all. @see maplibreAdapter
            ...this.sizeFromDraw(name, wants, vertices),
        };

        return buildTacticalGraphic(name, geometry, properties, resolutionOf(this.map));
    }

    /**
     * The six graphics APP-06 describes by **anchor points**, drawn centre to edge.
     *
     * Their base is a `LineString`, so the generic path stored the two raw clicks and let
     * each generator's own reader make of them what it would — for Turn, the ends of the
     * chord. OpenLayers reads the same two clicks as a centre and an edge, writes the
     * symbol's own point layout, and files `radius` and `rotation`. The panel promises
     * "2 points (center → edge)" on both engines, so this one was breaking its own hint:
     * measured, the identical gesture gave 240 x 31 px there and 120 x 24 px here.
     *
     * The layout comes from `drawnAnchors`, which is the library's statement of it and
     * which the OpenLayers holders now use too — so the two engines cannot describe the
     * same symbol differently. Returns undefined for everything else, and for a first
     * click with nothing to measure yet.
     */
    private anchorDraw(
        name: TacticalGraphicName,
        vertices: Position[],
    ): {geometry: Geometry; properties: TacticalGraphicProperties} | undefined {
        if (!usesDrawnAnchors(name) || vertices.length < 2) return undefined;

        const center = toMercator([vertices[0][0], vertices[0][1]]);
        const edge = toMercator([vertices[1][0], vertices[1][1]]);
        const dx = edge[0] - center[0];
        const dy = edge[1] - center[1];
        // A real distance, like every other drawn size. @see mercator.ts
        const radius = groundLength(Math.hypot(dx, dy), vertices[0][1]);
        if (!(radius > 0)) return undefined;

        const rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
        const size = this.legibleRadius(name, radius, vertices[0][1]);
        const anchors = drawnAnchors(name, {center: vertices[0], size, rotation});
        if (!anchors) return undefined;

        return {
            geometry: {type: 'LineString', coordinates: anchors},
            properties: {name, radius: size, rotation},
        };
    }

    /**
     * Turns the collected vertices into a graphic.
     *
     * A ring is closed here rather than by the user: a polygon whose last vertex is
     * not its first is not a polygon, and asking a user to click the start point
     * again — accurately — is a worse interaction than assuming it.
     */
    private finishDraw(vertices: Position[]): void {
        const name = this.drawing;
        if (!name) return;
        this.renderer.setMeasure(null);

        const graphic = this.graphicFrom(name, vertices);
        this.cancelDraw();
        if (!graphic) return;

        this.renderer.add(graphic);
        this.renderer.select(graphic.id);
        this.callbacks.onSelect?.(graphic);
        this.callbacks.onChange?.();
    }

    // ── dragging ────────────────────────────────────────────────────────────

    private readonly onPointerDown = (event: MapMouseEvent): void => {
        if (this.drawing) return;

        // **The handle decides which graphic is being edited**, not the selection.
        // In a handle mode every graphic wears its handles, exactly as OpenLayers does,
        // so the one under the pointer is the one the user means — requiring them to
        // select it first would make the same button behave differently in the two
        // engines. Falls back to the selection when nothing is grabbed, which is what
        // a body drag needs.
        const grabbed = this.renderer.hitTestHandle(event.point);
        const selectedId = this.renderer.selection;
        const graphic = grabbed?.graphic ?? (selectedId ? this.renderer.find(selectedId) : undefined);
        if (!graphic) return;

        // A handle carrying a role of its own works in **view** mode too: its meaning
        // comes from the handle, not from a mode button, so requiring the user to pick
        // one first would be asking them to answer a question the handle has already
        // answered.
        const roleDrag = grabbed !== undefined && roleOfHandle(graphic, grabbed.index) !== 'shape';
        if (this.mode === 'view' && !roleDrag) return;

        // The drag has to start *on* the graphic, or on one of its handles. Starting
        // it anywhere on the map would mean a user who wanted to pan instead resized
        // whatever happened to be selected.
        const handle = grabbed?.index ?? -1;
        const onHandle = handle >= 0;
        const onGraphic = this.renderer.hitTest(event.point)?.id === graphic.id;
        const reshaping = this.mode === 'modify' || this.mode === 'edit';
        const vertex = reshaping ? this.grabVertex(graphic, event.point) : -1;
        // Noted now, added on the first real move — a click that inserted a vertex would
        // mean every click on a line reshaped it. @see grabSegment
        const insertAt = reshaping && vertex < 0 ? this.grabSegment(graphic, event.point) : -1;
        if (!onHandle && !onGraphic && vertex < 0 && insertAt < 0) return;

        // Grabbing another graphic's handle makes it the selected one, so everything
        // downstream — the properties panel, a later body drag — agrees about what the
        // user is working on.
        if (graphic.id !== selectedId) {
            this.renderer.select(graphic.id);
            this.callbacks.onSelect?.(graphic);
        }

        this.dragging = {
            graphic,
            // Grabbing the center dot always means "move this", whatever mode is
            // selected. Rotate and resize are both degenerate there — the scale ratio
            // divides by distance-to-center and a point on the axis has no angle — and
            // the center is the one place a user naturally reaches to drag a symbol
            // bodily. The dot is drawn gray to say so.
            onCenter: onHandle && handle === this.renderer.centerHandleOf(graphic),
            onPivot: this.startedOnPivot(graphic, event.point),
            handle,
            vertex,
            insertAt,
            last: [event.lngLat.lng, event.lngLat.lat],
            started: false,
            startPixel: {x: event.point.x, y: event.point.y},
        };
        // Otherwise the map pans out from under the gesture.
        this.map.dragPan.disable();
    };

    /**
     * Whether the grab landed on the point a rotate or a resize turns about.
     *
     * Measured in **screen pixels**, because "did the user grab the pivot" is a
     * question about the cursor, not about the ground: the same few meters is a hit at
     * one zoom and a miss at another.
     */
    private startedOnPivot(graphic: MapLibreTacticalGraphic, point: {x: number; y: number}): boolean {
        const pivot = centerOf(graphic.base.geometry as Parameters<typeof centerOf>[0], graphic.name);
        const projected = this.map.project([pivot[0], pivot[1]] as [number, number]);
        return Math.hypot(projected.x - point.x, projected.y - point.y) <= PIVOT_GRAB_PX;
    }

    /**
     * The graphic being drawn, shown at its current size before the second click.
     *
     * **OpenLayers has always drawn this and MapLibre drew nothing.** Every OpenLayers
     * holder rebuilds itself from the sketch on each pointer move — a circle from its
     * radius, a corridor from its vertices — so an operator watches the symbol they are
     * making. Here they got a rubber-band line between the clicks and, for a circle, a
     * distance in metres; the symbol itself appeared only once the gesture was over. So
     * the questions the gesture asks — how big, which way round, how far does this bend
     * — could only be answered after committing to an answer.
     *
     * It is a real graphic through the real paint path, so the preview *is* the symbol
     * rather than an impression of it. The renderer holds it apart from the ones it owns;
     * `clearPreview` takes it off however the draw ends.
     *
     * Every family, not only the point-anchored ones: a line, a polygon and a rectangle
     * all describe a symbol before their last click, and the ones that do not yet — two
     * points of a polygon — simply preview nothing until they do.
     */
    private previewDraw(vertices: Position[]): void {
        const name = this.drawing;
        if (!name) return;

        // The same construction the next click will commit, not a second one that happens
        // to agree — a preview that disagreed with the commit would make the symbol jump
        // at the moment the user stopped being able to change it. @see graphicFrom
        const built = this.graphicFrom(name, vertices);
        // A generator that cannot draw this yet simply shows nothing, rather than leaving
        // the last shape it accepted standing under a cursor that has moved on.
        this.renderer.setPreview(built ? {...built, id: DRAW_PREVIEW_ID} : null);
        this.previewing = true;
    }

    /**
     * A drawn radius, held to the size below which this symbol stops being readable.
     *
     * **Only a draw.** The three curves that carry a floor collapse into a kink when they
     * are barely dragged, so the gesture that creates one holds it legible — and nothing
     * afterwards does, or a later pan would resize a symbol the user had already drawn.
     * OpenLayers has applied this from the start and MapLibre had no equivalent, so the
     * same short drag drew 100 px there and 60 px here. @see minimumDrawnRadiusPx
     */
    private legibleRadius(name: TacticalGraphicName, radius: number, latitude: number): number {
        const px = minimumDrawnRadiusPx(name);
        if (px === undefined) return radius;
        return Math.max(radius, screenMeters(px, resolutionOf(this.map), latitude));
    }

    /** Takes the preview off, whichever way the draw ended. @see previewDraw */
    private clearPreview(): void {
        if (!this.previewing) return;
        this.previewing = false;
        this.renderer.setPreview(null);
    }

    private readonly onPointerMove = (event: MapMouseEvent): void => {
        if (this.drawing) {
            // A rubber band to the cursor, so the user can see the segment they are
            // about to commit rather than only the ones they already have.
            if (this.sketch.length) {
                const center = toMercator([this.sketch[0][0], this.sketch[0][1]]);
                const cursor = toMercator([event.lngLat.lng, event.lngLat.lat]);
                this.renderer.setSketch(
                    [...this.sketch, [event.lngLat.lng, event.lngLat.lat]].map(p => toMercator([p[0], p[1]])),
                );
                // Sizing a point-anchored graphic reads out the radius as it goes, the
                // way a resize does — the second click is otherwise blind, and the number
                // it is about to commit is the whole point of the gesture.
                if (baseGeometryFor(this.drawing) === 'Point' && showsSizeReadout(this.drawing)) {
                    this.renderer.setMeasure([center, cursor]);
                }
                this.previewDraw([...this.sketch, [event.lngLat.lng, event.lngLat.lat]]);
            }
            return;
        }

        const drag = this.dragging;
        if (!drag) {
            // Nothing held: the pointer is only shopping, so show where a vertex would go
            // and say whether there is anything here to act on.
            this.updateVertexHint(event.point);
            this.updateHoverCursor(event.point);
            return;
        }

        if (!drag.started) {
            const moved = Math.hypot(event.point.x - drag.startPixel.x, event.point.y - drag.startPixel.y);
            if (moved < DRAG_THRESHOLD_PX) return;
            drag.started = true;
        }

        this.dragTo([event.lngLat.lng, event.lngLat.lat]);
    };

    /**
     * Advances the drag in progress to `to`, in lon/lat.
     *
     * Split out of `onPointerMove` so an affordance gesture and a handle drag are the
     * same code — the map's own pointer stream is one source of positions, and a host's
     * `pointermove` on an element above the map is another. @see beginGesture
     */
    private dragTo(to: Position): void {
        const drag = this.dragging;
        if (!drag) return;

        let before: GraphicDescription = {geometry: drag.graphic.base.geometry, properties: drag.graphic.properties};

        // The drag began on a segment: add the vertex now that it is a drag, then carry
        // on as though the user had grabbed it. Done once — `insertAt` is cleared — so
        // the rest of the gesture moves the new vertex instead of sowing a trail of them.
        if (drag.insertAt >= 0) {
            before = insertVertex(before, drag.insertAt, drag.last);
            drag.vertex = drag.insertAt;
            drag.insertAt = -1;
        }

        const after = withDerivedAmplifiers(drag.graphic.name, this.applyGesture(before, drag, to));
        drag.last = to;
        if (after === before) return;

        const rebuilt = buildTacticalGraphic(
            drag.graphic.name,
            after.geometry,
            after.properties,
            resolutionOf(this.map),
        );
        // A generator that refuses the edited description — a line dragged onto itself,
        // a radius driven to nothing — leaves the graphic as it was. Dropping it
        // mid-drag would delete what the user is holding.
        if (!rebuilt) return;

        const next = {...rebuilt, id: drag.graphic.id};
        this.renderer.replace(drag.graphic.id, next);
        drag.graphic = next;
        // **Only once the gesture has actually changed the size**, which is the rule
        // OpenLayers states in `MissionTaskController.handleResize`: a resize becomes one
        // when the radius moves, not when a pointer goes down. Arming on pointer-down
        // instead put the read-out on screen for a plain move, where it measures a radius
        // nobody is changing. The read-out then follows the drag, reporting the radius
        // the user is dragging *to*, which is the whole point of showing it.
        if (after.properties.radius !== before.properties.radius) this.showMeasure(next);
    }

    /**
     * Ends the drag in progress, however it began.
     *
     * The body of what `onPointerUp` did, so an affordance gesture releases through the
     * same door: the read-out comes down, pan goes back on, and a change is announced
     * only if the drag moved something.
     */
    private endDrag(): void {
        this.renderer.setMeasure(null);
        if (!this.dragging) return;
        const changed = this.dragging.started;
        this.dragging = null;
        this.map.dragPan.enable();
        if (changed) this.callbacks.onChange?.();
    }

    /**
     * The gesture the current mode means, applied to the description.
     *
     * **A graphic that refuses a gesture is left alone**, rather than the mode being
     * blocked. Refusing at the point of application means the user can still select
     * it, still move it, and still see why nothing happened — a mode that switched
     * itself off would look like a broken button. @see allowedGestures
     */
    private applyGesture(before: GraphicDescription, drag: NonNullable<typeof this.dragging>, to: Position): GraphicDescription {
        // Read once, at the top: an affordance gesture outranks the mode for the whole
        // of this drag. @see effectiveMode
        const mode = this.effectiveMode();

        // The center dot is a **shortcut to move**, and only in translate mode. Under
        // any other mode the drag falls through to what that mode means, which is what
        // OpenLayers does: grabbing a security operation's center rotates it, and a
        // gesture the graphic refuses is refused below rather than quietly becoming a
        // move. Treating the center as "move" in every mode made a security operation —
        // which refuses resize — move when the user asked it to resize.
        if (drag.onCenter && mode === 'translate') return translate(before, drag.last, to);

        // A handle with a *role* means that role, whatever mode is selected — an
        // offset handle sets a width and nothing else, and a band handle sets its own
        // band. Reading the mode first would make the same handle do four different
        // things depending on a button, which is not what the handle is for.
        const byRole = this.applyHandleRole(before, drag, to);
        if (byRole) return byRole;

        const allowed = allowedGestures(drag.graphic.name);
        if (mode === 'rotate' && !allowed.rotate) return before;
        if (mode === 'resize' && !allowed.resize) return before;
        // **Resize only, and decided once at pointer-down.** A grab on the pivot carries
        // no scale — the ratio is a tiny number over a tiny number — and testing per
        // step let the refusal lapse the moment the cursor left, after which every step
        // scaled from the *first step* rather than from the start: one drag on its own
        // anchor grew a fields-of-fire sixteenfold.
        //
        // Rotate is **not** refused, because OpenLayers does not refuse it: its start
        // angle at the pivot is `atan2(0, 0)` = 0, so the graphic turns by the direction
        // of the drag, which is a defined and useful gesture. Measured on a fields of
        // fire, grabbing handle 0: OpenLayers rotates, MapLibre did nothing.
        if (drag.onPivot && mode === 'resize') return before;

        switch (mode) {
            case 'translate':
                return translate(before, drag.last, to);
            case 'rotate':
                return rotate(before, drag.last, to);
            case 'resize':
                return resize(before, drag.last, to);
            // `edit` reshapes, exactly as `modify` does — the difference between the two
            // is the selection, the box and the affordances, none of which change what a
            // drag on a handle means. Sharing the case rather than duplicating it is what
            // keeps them from drifting.
            case 'edit':
            case 'modify':
                // **A graphic that stretches on an edit drag resizes**, whether or not it
                // reshapes — that is what makes a fields-of-fire's two arms feel like an
                // editable line: dragging a leg opens or closes the V. Translating
                // instead slid the whole graphic, so the angle could not be changed that
                // way at all. @see editStretches
                if (drag.vertex < 0 && editStretches(drag.graphic.name)) return resize(before, drag.last, to);
                // **A rectangle's corners are a consequence of its box, not points with
                // meanings of their own**, so a reshape drag is refused outright and the
                // shape can only be moved, turned or scaled. OpenLayers withdraws these
                // from its Modify interaction to the same end. @see isRectangular
                if (isRectangular(drag.graphic.name)) return before;
                // A graphic that does not reshape and does not stretch is left alone.
                // Falling through to the move below would make "edit" a second "move" for
                // the point-anchored symbols, where OpenLayers does nothing at all.
                if (!allowed.modify) return before;
                // The anchor vertex is inert under a reshape — dragging it would bend the
                // graphic about the point the user thinks of as its origin. Moving is
                // what translate mode is for. @see anchorVertex
                if (drag.vertex >= 0 && drag.vertex === anchorVertex(drag.graphic.name)) return before;
                // A modify drag that did not grab a vertex moves the whole graphic, which
                // is what the OpenLayers Modify interaction does when you drag a line
                // rather than one of its points.
                return drag.vertex >= 0 ? moveVertex(before, drag.vertex, to) : translate(before, drag.last, to);

            default:
                return before;
        }
    }

    /**
     * The gesture a *specific handle* means, or null when it carries no role of its
     * own and the mode should decide.
     *
     * @see handleContract for why the index alone cannot answer this: the movement
     * family puts its offset handle last and the block family puts it first.
     */
    private applyHandleRole(
        before: GraphicDescription,
        drag: NonNullable<typeof this.dragging>,
        to: Position,
    ): GraphicDescription | null {
        if (drag.handle < 0) return null;

        const name = drag.graphic.name;
        // A handle role sets a **number** — a bend, a reach, a side — and for the six
        // graphics drawn from anchor points the picture comes from the points. So each
        // answer is turned back into points before it is applied, or the number would
        // move and the symbol would not. @see withAnchorGeometry
        const byRole = (next: GraphicDescription | null): GraphicDescription | null =>
            next && withAnchorGeometry(next);

        switch (roleOfHandle(drag.graphic, drag.handle)) {
            case 'offset':
                return setOffset(before, to, {
                    offsetScale: handleContract(name).offsetScale,
                    resolution: resolutionOf(this.map),
                });
            case 'bend':
                // Each curve family clamps its own bend, and the two ranges differ —
                // Envelopment's hook bows much harder than a turn. It also *reads* the
                // bend differently: its tip lies along the axis rather than off it, so it
                // brings its own rule. @see envelopmentBendFrom
                return byRole(name === TacticalGraphicName.Envelopment
                    ? setBend(before, to, clampEnvelopmentBend, envelopmentBendFrom)
                    : setBend(before, to, clampTurnBend));
            case 'mirror':
                // Side only — no width, no vertex. @see setMirror
                return byRole(setMirror(before, to, resolutionOf(this.map), handleContract(name).mirrorAxis));
            case 'reach':
                return byRole(setReach(before, to));
            case 'band':
                // The fans put their center first, so the handle index is one ahead of
                // the band it drives. @see RANGE_FAN_BAND_OFFSET
                return setBandRange(before, drag.handle - RANGE_FAN_BAND_OFFSET, to);
            default:
                return null;
        }
    }

    /**
     * The radius read-out, for a graphic that reports one.
     *
     * Shown for the whole gesture, as OpenLayers' `showMeasure` is: from the pivot to
     * the rim, so the user can read the number they are dragging to.
     * `showsSizeReadout` — **not** the dialog's field list, which is a different
     * question: a read-out is feedback on a gesture, an amplifier is what the symbol
     * carries. Seven circle graphics have the first without the second. The OpenLayers
     * holder reads the same predicate, so a graphic
     * cannot report a radius in one place and not the other.
     */
    private showMeasure(graphic: MapLibreTacticalGraphic): void {
        if (!showsSizeReadout(graphic.name)) return;
        const radius = graphic.properties.radius;
        if (!radius || radius <= 0) return;

        const center = toMercator(centerOf(graphic.base.geometry as Parameters<typeof centerOf>[0], graphic.name) as [number, number]);

        /*
         * **To the rim handle, which is where OpenLayers points it too.**
         *
         * This used to run due east on the grounds that the direction carries no meaning.
         * It carries one thing that matters: it says *which* dimension the number belongs
         * to. Pointing it away from the handle the user has hold of leaves a line ending
         * in open water while the dot they are dragging sits somewhere else entirely —
         * which is what "the measurement line stops halfway" turned out to be.
         *
         * `MissionTaskGraphicBase.measureEdge` states the rule: project `radius` along
         * centre → anchor, so the line stays under the hand while staying exactly one
         * radius long. The handle is the anchor here, and its own bearing is whatever
         * `rotation` put it at — which is precisely what makes the two engines agree.
         */
        const edge = rimHandleOf(graphic, center) ?? ([center[0] + radius, center[1]] as ProjectedPosition);
        this.renderer.setMeasure([center, edge]);
    }

    private readonly onPointerUp = (): void => {
        this.endDrag();
    };

    /** The base vertex under a screen point, or -1. */
    /**
     * Where a vertex would go if the user dragged the segment under the pointer, or -1.
     *
     * **Only for a base the user may add vertices to.** A graphic with a fixed vertex
     * count is defined by exactly those points — a fields-of-fire is two legs and an
     * apex, and a fourth vertex makes it a different symbol — and one that stretches on
     * an edit drag has already given that gesture another meaning. Measured against
     * OpenLayers, which inserts on a phase line and an assembly area and refuses on a
     * fields-of-fire; this reproduces that split from the same two library facts rather
     * than from a list. @see baseVertexCount, editStretches
     */
    private grabSegment(graphic: MapLibreTacticalGraphic, point: {x: number; y: number}): number {
        if (baseVertexCount(graphic.name) !== undefined || editStretches(graphic.name)) return -1;
        // A rectangle with a fifth vertex is not a rectangle. @see isRectangular
        if (isRectangular(graphic.name)) return -1;

        const positions = positionsOf(graphic.base.geometry);
        if (positions.length < 2) return -1;

        return this.nearestSegment(graphic, point)?.index ?? -1;
    }

    /**
     * The insertable segment nearest the cursor, with the point a new vertex would
     * land on — or undefined when there is none within reach.
     *
     * Shared by the grab and the hover hint on purpose: the marker has to appear at
     * exactly the place the drag would act, or it promises something the gesture does
     * not deliver.
     */
    private nearestSegment(
        graphic: MapLibreTacticalGraphic,
        point: {x: number; y: number},
    ): {index: number; position: Position} | undefined {
        const positions = positionsOf(graphic.base.geometry);
        if (positions.length < 2) return undefined;

        let best: {index: number; position: Position} | undefined;
        let bestDistance = SEGMENT_GRAB_PX;
        for (let i = 1; i < positions.length; i++) {
            const a = this.map.project([positions[i - 1][0], positions[i - 1][1]]);
            const b = this.map.project([positions[i][0], positions[i][1]]);
            const near = closestPointOnSegment(point, a, b);
            if (near.distance <= bestDistance) {
                bestDistance = near.distance;
                const lngLat = this.map.unproject([near.x, near.y]);
                best = {index: i, position: [lngLat.lng, lngLat.lat]};
            }
        }
        return best;
    }

    /**
     * Shows or hides the marker for the vertex a drag here would create.
     *
     * OpenLayers' Modify draws one by default — a blue dot that slides along the
     * geometry under the cursor — and it is the only thing that says the gesture is
     * available at all. Without it a user has to discover that dragging a line adds a
     * point by trying it, which is how MapLibre felt: the capability existed and
     * nothing announced it.
     *
     * Only in `modify`, only when not already dragging, and only over a graphic that
     * accepts a new vertex — so it never promises an edit that would be refused.
     * @see grabSegment for which graphics those are
     */
    private updateVertexHint(point: {x: number; y: number}): void {
        if ((this.mode !== 'modify' && this.mode !== 'edit') || this.dragging || this.drawing) {
            this.renderer.setVertexHint(null);
            return;
        }

        const graphic = this.renderer.hitTest(point) ?? (this.renderer.selection ? this.renderer.find(this.renderer.selection) : undefined);
        // A cursor already on a vertex means moving that one, not making another —
        // the same order of precedence the grab uses.
        if (!graphic || this.grabSegment(graphic, point) < 0 || this.grabVertex(graphic, point) >= 0) {
            this.renderer.setVertexHint(null);
            return;
        }

        this.renderer.setVertexHint(toMercator(this.nearestSegment(graphic, point)!.position as [number, number]));
    }

    private grabVertex(graphic: MapLibreTacticalGraphic, point: {x: number; y: number}): number {
        const positions = positionsOf(graphic.base.geometry);
        let best = -1;
        let bestDistance = VERTEX_GRAB_PX;
        positions.forEach((position, index) => {
            const projected = this.map.project([position[0], position[1]]);
            const distance = Math.hypot(projected.x - point.x, projected.y - point.y);
            if (distance <= bestDistance) {
                best = index;
                bestDistance = distance;
            }
        });
        return best;
    }
}

/**
 * The base geometry a set of drawn vertices makes, for the shape this graphic
 * wants — or null when there are not enough of them yet.
 */
/**
 * The ring of an axis-aligned box through two opposite corners.
 *
 * What OpenLayers gets from `createBox()`, which is why its rectangles are rectangles:
 * the user gives two corners and the other two are derived, so there is never a moment
 * at which the shape could be anything else. MapLibre was collecting these as ordinary
 * polygons — click a ring out by hand — so a "rectangular" kill box was whatever
 * quadrilateral the user happened to click, and every later complaint about corners
 * moving and vertices appearing followed from that.
 */
function buildBox([a, b]: Position[]): Geometry {
    const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
    const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    return {type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]};
}

function buildBase(wants: 'Point' | 'LineString' | 'Polygon' | undefined, vertices: Position[]): Geometry | null {
    if (!vertices.length) return null;

    switch (wants) {
        case 'Point':
            return {type: 'Point', coordinates: vertices[0]};
        case 'Polygon': {
            if (vertices.length < 3) return null;
            const ring = [...vertices];
            const [first] = ring;
            const last = ring[ring.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
            return {type: 'Polygon', coordinates: [ring]};
        }
        default:
            if (vertices.length < 2) return null;
            return {type: 'LineString', coordinates: vertices};
    }
}
