/**
 * # Drawing and editing, for MapLibre
 *
 * The counterpart to `TacticalGraphicsManager` and the OpenLayers controllers,
 * built on a different footing.
 *
 * OpenLayers gives you `Draw` and `Modify` interactions and a graph of live
 * features to mutate; a controller there transforms rendered geometry and keeps
 * the numbers that produced it on a holder. MapLibre gives you pointer events and
 * a canvas, and its drawn output is derived — realised into GeoJSON sources and
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
    clampTurnBend,
    RANGE_FAN_BAND_OFFSET,
    handleContract,
    handleRole,
    type TacticalGraphicProperties,
} from '@zaes/tactical-graphics';
import {buildTacticalGraphic, type MapLibreTacticalGraphic} from '../maplibreAdapter';
import type {NativeLayerRenderer} from '../native/NativeLayerRenderer';
import {resolutionOf, toMercator} from '../projection';
import {
    centreOf,
    moveVertex,
    positionsOf,
    resize,
    rotate,
    setBandRange,
    setBend,
    setOffset,
    setReach,
    translate,
    type GraphicDescription,
} from './editGeometry';

/** What a drag currently means. Mirrors OpenLayers' `InteractionType`. */
export type EditMode = 'view' | 'translate' | 'rotate' | 'resize' | 'modify';

/** How close a click must land on a base vertex to grab it, in screen pixels. */
const VERTEX_GRAB_PX = 10;

/**
 * How far the pointer must move before a press counts as a drag.
 *
 * Without it every click is a one-pixel drag, which rebuilds the graphic and — far
 * worse — makes a click that was meant to *select* also nudge the thing it
 * selected.
 */
const DRAG_THRESHOLD_PX = 3;

/** Default size for a point-anchored graphic, in metres, when one is drawn fresh. */
const DEFAULT_RADIUS_METRES = 40_000;

export interface InteractionCallbacks {
    /** A graphic was added, edited or removed — the host may want to save. */
    onChange?(): void;
    /** Selection moved. Null when the user clicked empty map. */
    onSelect?(graphic: MapLibreTacticalGraphic | null): void;
    /** A draw finished or was cancelled, so a host can un-arm its button. */
    onDrawEnd?(): void;
}

/**
 * The modes that put handles on every graphic. Mirrors
 * `TacticalGraphicsManager.enableHandleModes` — the two must agree, because the same
 * button in the same panel drives both.
 */
const HANDLE_MODES: readonly EditMode[] = ['translate', 'rotate', 'resize', 'modify'];

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
        /** Whether the drag began on the inert centre dot. */
        onCentre: boolean;
        /** Whether the drag began on the rotate/resize pivot. @see startedOnPivot */
        onPivot: boolean;
        /** Which handle was grabbed, or -1 for a drag that started on the body. */
        handle: number;
        last: Position;
        /** Whether the pointer has moved far enough to count. @see DRAG_THRESHOLD_PX */
        started: boolean;
        startPixel: {x: number; y: number};
    } | null = null;

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
        // `keydown` is not a map event — the canvas has to be focusable for it, and
        // it is simpler to listen on the document than to manage focus.
        document.addEventListener('keydown', this.onKeyDown);
    }

    destroy(): void {
        this.map.off('mousedown', this.onPointerDown);
        this.map.off('mousemove', this.onPointerMove);
        this.map.off('mouseup', this.onPointerUp);
        this.map.off('click', this.onClick);
        this.map.off('dblclick', this.onDoubleClick);
        document.removeEventListener('keydown', this.onKeyDown);
    }

    // ── modes ───────────────────────────────────────────────────────────────

    setMode(mode: EditMode): void {
        this.cancelDraw();
        this.mode = mode;
        // Every graphic wears its handles in a handle-bearing mode and none in view,
        // which is what the OpenLayers manager does on the same button.
        // @see NativeLayerRenderer.setHandleMode
        this.renderer.setHandleMode(HANDLE_MODES.includes(mode));
    }

    getMode(): EditMode {
        return this.mode;
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
    }

    cancelDraw(): void {
        if (!this.drawing) return;
        this.drawing = null;
        this.sketch = [];
        this.renderer.setSketch(null);
        this.map.doubleClickZoom.enable();
        this.callbacks.onDrawEnd?.();
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
            this.finishDraw([position]);
            return;
        }

        this.sketch.push(position);
        this.renderer.setSketch(this.sketch.map(p => toMercator([p[0], p[1]])));
    }

    private readonly onDoubleClick = (event: MapMouseEvent): void => {
        if (!this.drawing) return;
        event.preventDefault();
        // The double-click also fired two `click`s, so the last vertex is already in.
        this.finishDraw(this.sketch);
    };

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') this.cancelDraw();
        else if (event.key === 'Enter' && this.drawing) this.finishDraw(this.sketch);
    };

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

        const wants = baseGeometryFor(name);
        const geometry = buildBase(wants, vertices);
        if (!geometry) return;

        const properties: TacticalGraphicProperties = {
            name,
            // The generators need both, and neither has a safe absent value: `rotation`
            // reaches `Math.cos` and comes back NaN, and a point-anchored graphic with
            // no radius has no size at all. @see maplibreAdapter
            radius: DEFAULT_RADIUS_METRES,
            rotation: 0,
        };

        const graphic = buildTacticalGraphic(name, geometry, properties, resolutionOf(this.map));
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
        const vertex = this.mode === 'modify' ? this.grabVertex(graphic, event.point) : -1;
        if (!onHandle && !onGraphic && vertex < 0) return;

        // Grabbing another graphic's handle makes it the selected one, so everything
        // downstream — the properties panel, a later body drag — agrees about what the
        // user is working on.
        if (graphic.id !== selectedId) {
            this.renderer.select(graphic.id);
            this.callbacks.onSelect?.(graphic);
        }

        this.dragging = {
            graphic,
            // Grabbing the centre dot always means "move this", whatever mode is
            // selected. Rotate and resize are both degenerate there — the scale ratio
            // divides by distance-to-centre and a point on the axis has no angle — and
            // the centre is the one place a user naturally reaches to drag a symbol
            // bodily. The dot is drawn grey to say so.
            onCentre: onHandle && handle === this.renderer.centreHandleOf(graphic),
            onPivot: this.startedOnPivot(graphic, event.point),
            handle,
            vertex,
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
     * question about the cursor, not about the ground: the same few metres is a hit at
     * one zoom and a miss at another.
     */
    private startedOnPivot(graphic: MapLibreTacticalGraphic, point: {x: number; y: number}): boolean {
        const pivot = centreOf(graphic.base.geometry as Parameters<typeof centreOf>[0]);
        const projected = this.map.project([pivot[0], pivot[1]] as [number, number]);
        return Math.hypot(projected.x - point.x, projected.y - point.y) <= PIVOT_GRAB_PX;
    }

    private readonly onPointerMove = (event: MapMouseEvent): void => {
        if (this.drawing) {
            // A rubber band to the cursor, so the user can see the segment they are
            // about to commit rather than only the ones they already have.
            if (this.sketch.length) {
                this.renderer.setSketch(
                    [...this.sketch, [event.lngLat.lng, event.lngLat.lat]].map(p => toMercator([p[0], p[1]])),
                );
            }
            return;
        }

        const drag = this.dragging;
        if (!drag) return;

        if (!drag.started) {
            const moved = Math.hypot(event.point.x - drag.startPixel.x, event.point.y - drag.startPixel.y);
            if (moved < DRAG_THRESHOLD_PX) return;
            drag.started = true;
        }

        const to: Position = [event.lngLat.lng, event.lngLat.lat];
        const before: GraphicDescription = {geometry: drag.graphic.base.geometry, properties: drag.graphic.properties};
        const after = this.applyGesture(before, drag, to);
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
    };

    /**
     * The gesture the current mode means, applied to the description.
     *
     * **A graphic that refuses a gesture is left alone**, rather than the mode being
     * blocked. Refusing at the point of application means the user can still select
     * it, still move it, and still see why nothing happened — a mode that switched
     * itself off would look like a broken button. @see allowedGestures
     */
    private applyGesture(before: GraphicDescription, drag: NonNullable<typeof this.dragging>, to: Position): GraphicDescription {
        if (drag.onCentre) return translate(before, drag.last, to);

        // A handle with a *role* means that role, whatever mode is selected — an
        // offset handle sets a width and nothing else, and a band handle sets its own
        // band. Reading the mode first would make the same handle do four different
        // things depending on a button, which is not what the handle is for.
        const byRole = this.applyHandleRole(before, drag, to);
        if (byRole) return byRole;

        const allowed = allowedGestures(drag.graphic.name);
        if (this.mode === 'rotate' && !allowed.rotate) return before;
        if (this.mode === 'resize' && !allowed.resize) return before;
        // **Decided once, at pointer-down, and it has to be.** Both gestures measure
        // from the pivot, and a grab that starts on it carries neither an angle nor a
        // scale. Testing per step instead let the refusal lapse the moment the cursor
        // left the pivot, and because each step is relative to the previous one the
        // whole drag then scaled from the *first step* rather than from the start —
        // which grew a fields-of-fire sixteenfold from one drag on its own anchor.
        if (drag.onPivot && (this.mode === 'rotate' || this.mode === 'resize')) return before;

        switch (this.mode) {
            case 'translate':
                return translate(before, drag.last, to);
            case 'rotate':
                return rotate(before, drag.last, to);
            case 'resize':
                return resize(before, drag.last, to);
            case 'modify':
                // A modify drag that did not grab a vertex moves the whole graphic, which
                // is what the OpenLayers Modify interaction does when you drag a line
                // rather than one of its points.
                return drag.vertex >= 0 && allowed.modify
                    ? moveVertex(before, drag.vertex, to)
                    : translate(before, drag.last, to);
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
        switch (roleOfHandle(drag.graphic, drag.handle)) {
            case 'offset':
                return setOffset(before, to, {
                    offsetScale: handleContract(name).offsetScale,
                    resolution: resolutionOf(this.map),
                });
            case 'bend':
                // Each curve family clamps its own bend, and the two ranges differ —
                // Envelopment's hook bows much harder than a turn.
                return setBend(before, to, name === TacticalGraphicName.Envelopment ? clampEnvelopmentBend : clampTurnBend);
            case 'reach':
                return setReach(before, to);
            case 'band':
                // The fans put their centre first, so the handle index is one ahead of
                // the band it drives. @see RANGE_FAN_BAND_OFFSET
                return setBandRange(before, drag.handle - RANGE_FAN_BAND_OFFSET, to);
            default:
                return null;
        }
    }

    private readonly onPointerUp = (): void => {
        if (!this.dragging) return;
        const changed = this.dragging.started;
        this.dragging = null;
        this.map.dragPan.enable();
        if (changed) this.callbacks.onChange?.();
    };

    /** The base vertex under a screen point, or -1. */
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
