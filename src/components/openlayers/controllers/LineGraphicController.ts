import {Feature} from 'ol';

import {Coordinate} from 'ol/coordinate';
import LineString from 'ol/geom/LineString';
import {DrawEvent} from 'ol/interaction/Draw';
import openlayersAdapter, {TacticalGraphic, TacticalGraphicHandler, TacticalGraphicShape} from "../openlayersAdapter";
import {Geometry} from 'ol/geom';
import {ObjectEvent} from 'ol/Object';
import {StyleFunction} from 'ol/style/Style';
import {TacticalGraphicName, drawsTipFirst, editStretches} from '@zaes/tactical-graphics';
import {GraphicLinkRegistry} from '../../../utils/graphicLinkRegistry';

export interface LineGraphic extends TacticalGraphic {
    base: Feature<LineString>;

    setSymbolId(symbolId: string): void;

    setOffset?(offset: number): void;

    offsetScale?: number;

    /**
     * Drop the handle on p0. Set by `LineGraphicController` for graphics fixed at
     * two vertices; see `visiblePathHandles`.
     */
    hidesStartHandle?: boolean;
}

/**
 * Two handles within a millimeter of each other are the same point. Coordinates
 * here are EPSG:3857 meters, and the only error to absorb is the generator's
 * 3857 → 4326 → 3857 round trip, which lands far inside that.
 */
export const SAME_POINT_EPSILON_M = 1e-3;

/**
 * The path handles a one-segment graphic should actually show — every one except
 * the handle sitting on p0.
 *
 * A graphic fixed at two vertices *is* a single segment, so a handle on each end
 * is redundant: either one rotates and resizes the whole thing about the other.
 * p0 is additionally where most of these graphics stack their label or symbol,
 * so its dot lands underneath the text and reads as clutter rather than as
 * something grabbable.
 *
 * **Matches on position, not on index.** The obvious implementation — drop the
 * first path handle — is wrong, because generators do not agree on an order:
 * `Breach` and `Penetration` emit `[end, p0]`, and `Disrupt` emits three arrow
 * handles before its two endpoints. Only "is this handle at p0" is stable across
 * all of them, and it also leaves a generator's extra shape handles alone, which
 * dropping by index would eat.
 *
 * Safe because nothing indexes into a line graphic's handle set:
 * `toggleHandleFeatures` only flips `hidden` on the whole feature, and
 * `handleRotate` / `handleResize` / `handleTranslate` transform `graphic.base`
 * wholesale — `handleResize` anchored on `getCenter()`, which is the base's pivot end
 * and stays the anchor whether or not it is drawn. @see pivotCoordinate
 *
 * Never returns an empty set: a generator whose handles all sit on p0 keeps
 * them, so the graphic cannot end up with nothing to grab.
 */
/**
 * The end of a drawn line an edit turns, scales and stacks its label about.
 *
 * `coords[0]` for an ordinary line -- where the user started drawing -- and the **last**
 * coordinate for the thirty-two graphics that store their points tip-first, whose first
 * point is the arrowhead. It is the same physical end in both cases; only the index it
 * lives at moved when the bases were renumbered into APP-06's order.
 *
 * Both jobs `hidesStartHandle` does want this end rather than index zero: the redundant
 * handle is the one on the pivot, and the label sits there too. Anchoring a resize on the
 * tip instead would grow an axis of advance backwards out of its own arrowhead.
 *
 * The library's `rotationAnchor` states the same rule for MapLibre and for the adapter's
 * transforms; this is it in OpenLayers' projected coordinates, where re-projecting to ask
 * would be an absurd amount of work for "which end". @see drawOrder.ts
 */
export function pivotCoordinate(name: TacticalGraphicName | undefined, coords: Coordinate[] | undefined): Coordinate | undefined {
    if (!coords?.length) return undefined;
    return drawsTipFirst(name) ? coords[coords.length - 1] : coords[0];
}

export function visiblePathHandles(coords: Coordinate[], startCoord: Coordinate | undefined, hidesStartHandle?: boolean): Coordinate[] {
    if (!hidesStartHandle || !startCoord) return coords;

    const kept = coords.filter(c => Math.hypot(c[0] - startCoord[0], c[1] - startCoord[1]) > SAME_POINT_EPSILON_M);
    return kept.length > 0 ? kept : coords;
}


/*
* Controller class for managing linestring-like graphics.
* maxPoints is used to control how many vertices are allowed to be drawn in openlayers.
* */
export class LineGraphicController implements TacticalGraphicHandler {
    graphic: LineGraphic;
    type: TacticalGraphicShape = 'LineString';
    geomHandleType: TacticalGraphicShape = 'LineString';
    drawStyleFunc?: StyleFunction | undefined;
    onPointerMove?: Function | undefined;
    symbolId: string = '';
    maxPoints: number | undefined;
    /**
     * Edit ("modify vertices") mode drags this graphic exactly the way resize
     * does — stretch along the current bearing, anchored on p0.
     *
     * A fixed-vertex graphic has no vertices to modify: `base` is cleared below,
     * so OpenLayers' `Modify` is handed nothing and an edit-mode drag used to
     * fall through to the map and pan it. Stretching is the only meaningful
     * edit left, so edit mode borrows the resize path (see
     * `TacticalGraphicsManager.handleLineStringDrag`).
     */
    editStretches: boolean = false;

    /**
     * Whether an edit-mode drag moves the grabbed vertex rather than scaling the whole
     * graphic. Off by default: the line family is overwhelmingly "a drawn path plus
     * decorations", where a uniform resize is what a user expects. On for the graphics
     * whose shape *is* the arrangement of their vertices — a fields-of-fire V, where the
     * legs' angle and length are the content.
     *
     * `handleVertexDrag` is only declared when this is set, because the manager routes on
     * the method's presence.
     */
    dragsVertices: boolean = false;

    /**
     * Moves base vertex `index` to `coordinate`. @see TacticalGraphicHandler.handleVertexDrag
     *
     * Guarded by `minimumVertices`: a fields-of-fire V stops reading as one the moment it
     * straightens into a line, and the same is true of any graphic drawn from segments, so
     * a drag can move a vertex but never remove one.
     */
    handleVertexDrag?(index: number, coordinate: Coordinate): void;

    /** Fewest vertices this graphic still reads correctly at. @see handleVertexDrag */
    minimumVertices: number = 2;

    /**
     * Base vertex that **moves the whole graphic** instead of reshaping it — the apex of a
     * fields-of-fire V.
     *
     * Expressed as a translate so the grabbed point lands under the cursor, which is what
     * makes it feel like the center dot on a point-anchored graphic rather than a corner
     * that drags the shape inside out. `undefined` means every vertex reshapes.
     */
    anchorVertex: number | undefined;

    /**
     * Which graphic this is, kept because two of the rules the library states are
     * answered per graphic rather than per shape -- `editStretches`, and which end of a
     * drawn line is its pivot. @see pivotCoordinate
     */
    name: TacticalGraphicName | undefined;

    /**
     * The graphic's name, from the holder when the factory did not pass one.
     *
     * **Two factories do not pass it** -- `mobileDefense` and `corridor` in the registry
     * -- and an optional constructor argument gives no warning when it is left out. The
     * holder always knows, because it was built with the name to look its own style
     * function up, so asking it is the answer that cannot be forgotten.
     */
    private resolvedName(): TacticalGraphicName | undefined {
        const holder = this.graphic as unknown as {name?: TacticalGraphicName; graphicName?: TacticalGraphicName};
        return this.name ?? holder.graphicName ?? holder.name;
    }

    constructor(graphic: LineGraphic, maxPoints?: number, name?: TacticalGraphicName) {
        this.graphic = graphic;
        this.maxPoints = maxPoints;
        this.name = name;

        // turn off modification because there should only be a fixed number of vertices.
        if (this.maxPoints) {
            this.graphic.base.set('base', false);
        }

        // **The library's rule, not a second copy of it.** This used to be
        // `!NO_EDIT_STRETCH.has(name)` *and* only when a vertex limit was set, so a
        // free-form graphic whose factory forced the flag on afterwards disagreed with
        // the library the moment the factory stopped forcing it. Asking once, for every
        // controller, is the whole point. @see editStretches
        this.editStretches = !!name && editStretches(name);

        // Two vertices is one segment: show only the handle on the far end.
        if (this.maxPoints === 2) {
            this.graphic.hidesStartHandle = true;
        }

        const features = this.graphic?.getFeatures?.();
        if (!Array.isArray(features)) return;

        features.forEach((feature) => {
            GraphicLinkRegistry.register(feature, this.graphic, this.symbolId);
        })
    }

    getCenter() {
        // The pivot end, which is p0 for a plain line and the last vertex for a graphic
        // whose points are stored tip-first. @see pivotCoordinate
        const coords = this.graphic.base.getGeometry()!.getCoordinates();
        return pivotCoordinate(this.resolvedName(), coords) ?? coords[0];
    }

    getBaseGeometry(): number[] | number[][] | number[][][] {
        return this.graphic.base.getGeometry()!.getCoordinates();
    }

    getFeatures(): Feature<Geometry>[] {
        return this.graphic.getFeatures();
    }

    onResolutionChangeFunc(_e: ObjectEvent): void {
    }

    handleRotate(deltaAngle: number): void {
        let rotated = openlayersAdapter.rotateFeature(this.graphic.base, deltaAngle) as Feature<LineString>;
        this.graphic.setBaseFeature(rotated);
    }

    handleTranslate(deltaX: number, deltaY: number): void {
        let translated = openlayersAdapter.translateFeature(this.graphic.base, deltaX, deltaY) as Feature<LineString>;
        this.graphic.setBaseFeature(translated);
    }

    handleResize(deltaSize: number): void {
        /*
         * **The decoration scales with the line it decorates.**
         *
         * A line graphic's chevron, tooth or arrowhead is filed as its own distance in
         * metres, independent of the drawn line, so scaling only the base made the
         * graphic longer while its symbol stayed the size it was — an abatis grew a long
         * tail behind an unchanged chevron, which reads as a different obstacle rather
         * than a bigger one. "Resize the whole graphic as is" is the user's rule.
         *
         * Only the *gesture* scales it. `setOffset` is also how a restore replays a
         * stamped size, and scaling there would compound on every load.
         */
        const holder = this.graphic as unknown as {sizeOverride?: number; setOffset?: (value: number) => void};
        const current = this.currentDecorationSize();
        if (holder.setOffset && current !== undefined && current > 0) holder.setOffset(current * deltaSize);

        let resized = openlayersAdapter.resizeFeature(this.graphic.base, deltaSize) as Feature<LineString>;
        this.graphic.setBaseFeature(resized);
    }

    /**
     * The decoration size the holder is currently drawing with, in metres — whatever
     * `setOffset` last set, or the per-name default it started from.
     */
    private currentDecorationSize(): number | undefined {
        const holder = this.graphic as unknown as {graphicSize?: () => number; size?: number; offset?: number};
        const value = holder.graphicSize ? holder.graphicSize() : (holder.offset ?? holder.size);
        return typeof value === 'number' && isFinite(value) && value > 0 ? value : undefined;
    }

    /**
     * Hangs the graphic's hook on the other side. Forwarded to the holder when it has one;
     * a symmetric graphic has nothing to mirror and simply ignores it.
     * @see TacticalGraphicHandler.setMirrored
     */
    setMirrored(mirrored: boolean): void {
        (this.graphic as {setMirrored?: (m: boolean) => void}).setMirrored?.(mirrored);
    }

    setOffset(offset: number): void {
        this.graphic.setOffset?.(offset);
    }

    /**
     * The width the holder is currently drawing with.
     *
     * Duck-typed on the holder rather than declared on a shared base, because the
     * holders that own a width call it different things — `offset` on the movement
     * family and the corridors, `size` on the block and retrograde families — and none
     * of them share an interface that names it. @see TacticalGraphicHandler.currentOffset
     */
    /**
     * Forwards to whichever floor the holder owns. Duck-typed because the flag lives on
     * the holder — `Block` and `LineGraphicBase` both call it `suspendMinimumLength`,
     * and a holder without one simply has no floor to lift.
     * @see TacticalGraphicHandler.suspendSizeFloor
     */
    suspendSizeFloor(active: boolean): void {
        const holder = this.graphic as unknown as {suspendMinimumLength?: boolean};
        if ('suspendMinimumLength' in holder) holder.suspendMinimumLength = active;
    }

    /**
     * The drawn base's total length, in projected meters.
     *
     * A resize scales the base about its first vertex, so its length is exactly the
     * measure that a `handleResize(k)` multiplies by k — which is what makes it the
     * right answer here even for the families whose *rendered* size is derived from it.
     * @see TacticalGraphicHandler.currentSize
     */
    currentSize(): number | undefined {
        const coords = this.graphic.base?.getGeometry()?.getCoordinates?.();
        if (!Array.isArray(coords) || coords.length < 2) return undefined;
        let total = 0;
        for (let i = 1; i < coords.length; i++) {
            total += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
        }
        return total > 0 ? total : undefined;
    }

    /**
     * Declared by the holder, for the two families that publish `handleCoords[0]` as
     * their own offset feature and `slice(1)` as `handles`.
     * @see TacticalGraphicHandler.handleIndexOffset
     */
    get handleIndexOffset(): number | undefined {
        return (this.graphic as unknown as {handleIndexOffset?: number}).handleIndexOffset;
    }

    currentOffset(): number | undefined {
        const holder = this.graphic as unknown as {offset?: number; size?: number};
        const value = holder.offset ?? holder.size;
        return typeof value === 'number' && isFinite(value) && value > 0 ? value : undefined;
    }

    // Surfaced from the graphic so the manager can read it off the controller.
    get offsetScale(): number | undefined {
        return this.graphic.offsetScale;
    }

    areCoordsEqual(coord1: Coordinate, coord2: Coordinate): boolean {
        return coord1[0] === coord2[0] && coord1[1] === coord2[1];
    }

    onDrawStartFunc = (e: DrawEvent) => {
        let originalFeature = e.feature;

        let geometry = originalFeature.getGeometry();
        if (geometry === undefined || geometry.getType() !== 'LineString') return;

        // The minimum-length floors belong to the gesture that authors the shape.
        // @see LineGraphicBase.shapingFromGesture
        this.shapeFromGesture(true);

        geometry.on('change', () => {
            if (geometry === undefined || geometry.getType() !== 'LineString') return;
            let coords = (geometry as LineString).getCoordinates();
            if (coords.length < 2) return;

            // handle the case when a user just clicks without moving their mouse
            if (this.areCoordsEqual(coords[coords.length - 1], coords[coords.length - 2])) {
                coords.pop();
                (geometry as LineString).setCoordinates(coords);
            }
            this.graphic.setBaseFeature(originalFeature as Feature<LineString>);

        });
    };

    onDrawEndFunc = (_e: DrawEvent) => {
        // **After the last vertex has been through `setBaseFeature`**, so a barely-drawn
        // line is still held to a length the symbol fits in.
        this.shapeFromGesture(false);
    };

    /** Marks the holder as authoring geometry. @see LineGraphicBase.shapingFromGesture */
    private shapeFromGesture(active: boolean): void {
        (this.graphic as unknown as {shapingFromGesture?: boolean}).shapingFromGesture = active;
    }

    setBaseFeature(base: Feature<LineString>) {
        this.graphic.setBaseFeature(base);
    }

    /**
     * Turns on vertex dragging. Called from the registry for the graphics that want it;
     * assigning the method here rather than always declaring it is what lets the manager
     * route on presence and leave every other line graphic exactly as it was.
     */
    enableVertexDragging(minimumVertices = 2, anchorVertex?: number): this {
        this.dragsVertices = true;
        this.minimumVertices = minimumVertices;
        this.anchorVertex = anchorVertex;
        this.handleVertexDrag = (index: number, coordinate: Coordinate) => {
            const geom = this.graphic.base.getGeometry();
            if (!geom) return;
            const coords = geom.getCoordinates();
            if (index < 0 || index >= coords.length) return;
            if (coords.length < this.minimumVertices) return;

            // The anchor drags the graphic, not its own vertex: shift every coordinate by
            // however far the anchor had to move to reach the cursor.
            const isAnchor = this.anchorVertex !== undefined && index === this.anchorVertex;
            const dx = coordinate[0] - coords[index][0];
            const dy = coordinate[1] - coords[index][1];
            const moved = coords.map((c, i) =>
                isAnchor ? [c[0] + dx, c[1] + dy] : i === index ? [coordinate[0], coordinate[1]] : c,
            );
            const next = new Feature(new LineString(moved));
            // Dragging a vertex *is* authoring the shape, so the floors apply here.
            this.shapeFromGesture(true);
            try {
                this.graphic.setBaseFeature(next as Feature<LineString>);
            } finally {
                this.shapeFromGesture(false);
            }
        };
        return this;
    }

    getSymbolId(): string {
        return this.symbolId;
    }

    setSymbolId(symbolId: string): void {
        this.symbolId = symbolId;
        this.graphic.setSymbolId(symbolId);
        // Re-key the registry: the constructor registered under the empty string.
        GraphicLinkRegistry.registerAll(this.graphic.getFeatures(), this.graphic, symbolId);
    }
}
