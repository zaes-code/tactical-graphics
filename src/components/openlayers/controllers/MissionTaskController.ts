import {Style} from 'ol/style';
import {Coordinate} from 'ol/coordinate';
import {Circle as CircleGeom, Geometry, LineString, Point} from 'ol/geom';
import type {TacticalGraphicName} from '@zaes/tactical-graphics';
import {groundLength, latitudeFromMercatorY, screenMeters} from '@zaes/tactical-graphics';
import Feature, {FeatureLike} from 'ol/Feature';
import {DrawEvent} from 'ol/interaction/Draw';
import {StyleFunction} from 'ol/style/Style';
import {TacticalGraphic, TacticalGraphicHandler, TacticalGraphicShape} from "../openlayersAdapter";
import {ObjectEvent} from 'ol/Object';
import {GraphicLinkRegistry} from "../../../utils/graphicLinkRegistry";
import {drawMarkerStyle} from "../openlayerStyles";

export interface MissionTaskGraphic extends TacticalGraphic {
    name: TacticalGraphicName;
    base: Feature<Point | LineString>;
    /** The center, which is holder state — the base may carry anchor points instead. */
    centerCoordinate(): Coordinate;
    size: number;
    rotation: number;
    /**
     * The point the graphic is built around. Declared alongside `size` and `rotation`
     * because the three together are the whole of a point-anchored graphic's editable
     * state — which is exactly what save/restore has to carry.
     */
    center: Coordinate;

    updateGeom({size, center, rotation}: { size?: number, center?: Coordinate, rotation?: number }): void;

    /**
     * Arms the radius read-out — the hashed center-to-edge line with the size in km —
     * for the duration of a draw or resize gesture. Optional so a host's own holder can
     * skip it; the controller no-ops when it is absent.
     */
    showMeasure?(active: boolean, anchor?: Coordinate): void;

    /**
     * Whether the draw interaction is the thing setting the size right now.
     *
     * The legibility floor reads it, and nothing else does: it is an affordance for the
     * gesture that creates the graphic, and applying it to a later one resized a symbol
     * the user had already drawn. Optional, so a host's own holder need not carry it.
     * @see minimumDrawnRadiusPx
     */
    sizingFromDraw?: boolean;

    /** @see TacticalGraphicHandler.setMirrored */
    setMirrored?(mirrored: boolean): void;

    /** Range fans only — drag one band's ring. @see RangeFanGraphicBase */
    setBandRange?(bandIndex: number, coordinate: Coordinate): void;
}

export class MissionTaskController implements TacticalGraphicHandler {
    type: TacticalGraphicShape = 'Circle';
    geomHandleType: TacticalGraphicShape = 'Circle';
    symbolId: string = '';
    graphic: MissionTaskGraphic;
    /**
     * Edit ("modify vertices") mode resizes this graphic, identical to resize
     * mode. A circle graphic keeps its base point out of the rendering source,
     * so OpenLayers' `Modify` never sees it and an edit drag would otherwise
     * pan the map. Set by the factories in `controllerRegistry.ts`; the range
     * fans deliberately leave it false — their radius comes from band
     * amplifiers, not from `size`, so resizing them is its own problem.
     */
    editStretches: boolean = false;
    private currentMouseCoord: Coordinate = [0, 0];
    private center: Coordinate = [0, 0];
    private rotationAngleDeg: number = 0;

    /**
     * @param graphic
     */
    constructor(graphic: MissionTaskGraphic) {
        this.graphic = graphic;
        if (graphic.setBandRange) {
            this.handleBandResize = (bandIndex, coordinate) => graphic.setBandRange!(bandIndex, coordinate);
        }
        const features = this.graphic?.getFeatures?.();
        if (!Array.isArray(features)) return;

        features.forEach((feature) => {
            GraphicLinkRegistry.register(feature, this.graphic, this.symbolId);
        })
    }

    getCenter() {
        // Not off the base: a graphic converted to APP-06's drawn anchor points keeps
        // a LineString there, whose coordinates are an array of them.
        return this.graphic.centerCoordinate();
    }

    /**
     * Assigned in the constructor **only** when the graphic implements
     * `setBandRange`. The manager reads "present" as "this graphic's handles are
     * not interchangeable" and skips the uniform resize entirely, so declaring
     * it unconditionally would route every circle graphic into a no-op.
     */
    handleBandResize?: (bandIndex: number, coordinate: Coordinate) => void;

    /**
     * Lifts the minimum-radius floor for the length of a deliberate resize.
     *
     * The floor keeps Turn, TacticalTurn and Envelopment from collapsing into an
     * unreadable kink, which is a real thing to protect — **while the graphic is being
     * drawn**. It should not also decide how small a finished one may be: it caps the
     * shrink at 50 px worth of metres at the drawing zoom, so asking a turn for a tenth
     * of its size got a third of it and no further.
     *
     * The user's rule is that everything except the security operations resizes. A floor
     * that silently refuses is the same "gesture that does nothing" this mode exists to
     * get rid of. @see TacticalGraphicHandler.suspendSizeFloor
     */
    suspendSizeFloor(active: boolean): void {
        const holder = this.graphic as unknown as {suspendMinimumSize?: boolean};
        if ('suspendMinimumSize' in holder) holder.suspendMinimumSize = active;
    }

    /**
     * The radius the graphic is drawn at. @see TacticalGraphicHandler.currentSize
     */
    currentSize(): number | undefined {
        const size = (this.graphic as unknown as {size?: number}).size;
        return typeof size === 'number' && isFinite(size) && size > 0 ? size : undefined;
    }

    getFeatures(): Feature<Geometry>[] {
        return this.graphic.getFeatures();
    }

    getBaseGeometry() {
        return this.graphic.centerCoordinate();
    }

    onResolutionChangeFunc(e: ObjectEvent): void {
    }

    /**
     * Only the cursor marker: a point-anchored graphic renders itself live from
     * `onDrawStartFunc`, so OpenLayers' own circle would draw a second, wrong shape on
     * top of it. The marker itself comes from `drawMarkerStyle` — shared with the draw
     * style every other graphic gets, so the two cannot drift.
     */
    drawStyleFunc: StyleFunction = (feature: FeatureLike, resolution: number): Style | undefined => {
        const geomType = feature.getGeometry()?.getType();
        if (geomType === 'Circle') {
            return new Style({}); // suppress actual circle rendering
        }
        if (geomType === 'Point') {
            return drawMarkerStyle();
        }
        return undefined;
    };

    /**
     * The radius the drag actually described, on the ground.
     *
     * **`Circle.getRadius()` is in projected metres** and `size` is a real distance — the
     * generators build from it geodesically and the properties dialog states it in
     * kilometres. Stamping the projected figure inflated every point-anchored graphic by
     * `1 / cos(latitude)`: at 50 degrees north a circle dragged out to 120 px rendered at
     * 185, so the rim outran the cursor sizing it and the read-out claimed 587 km for a
     * circle 377 km across. @see mercator.ts
     */
    private drawnRadius(circle: CircleGeom): number {
        return groundLength(circle.getRadius(), latitudeFromMercatorY(circle.getCenter()[1]));
    }

    onDrawStartFunc = (e: DrawEvent) => {
        const feature = e.feature;
        this.center = (feature.getGeometry() as CircleGeom).getCenter();
        this.graphic.showMeasure?.(true);
        // The legibility floor is for *this* gesture and no other. @see minimumDrawnRadiusPx
        this.graphic.sizingFromDraw = true;

        feature.getGeometry()?.on('change', () => {
            const circleGeom = feature.getGeometry() as CircleGeom;
            const radius = this.drawnRadius(circleGeom);

            const dx = this.currentMouseCoord[0] - this.center[0];
            const dy = this.currentMouseCoord[1] - this.center[1];
            const rotationAngleRad = Math.atan2(dy, dx);
            this.rotationAngleDeg = (rotationAngleRad * 180) / Math.PI;

            // Armed here, immediately before the size lands: arming at drawstart alone
            // is not enough, because the holder has no size yet at that point.
            this.graphic.showMeasure?.(true, this.currentMouseCoord);
            this.graphic.updateGeom({size: radius, center: this.center, rotation: this.rotationAngleDeg});

        });
    };

    onDrawEndFunc = (e: DrawEvent) => {
        const circleGeom = e.feature.getGeometry() as CircleGeom;
        const radius = this.drawnRadius(circleGeom);

        // Still the draw: the floor has to reach the size that is *committed*, or a short
        // drag would be held legible right up until the click that ends it.
        this.graphic.updateGeom({size: radius, center: this.center, rotation: this.rotationAngleDeg});
        this.graphic.sizingFromDraw = false;
        this.graphic.showMeasure?.(false);
    };

    onPointerMove = (evt: any) => {
        this.currentMouseCoord = evt.coordinate;
    };

    handleResize(deltaSize: number): void {
        // Armed here rather than on pointer-down: a resize gesture only becomes one once
        // it actually changes the size. The manager disarms it on pointer-up.
        this.graphic.showMeasure?.(true);

        /*
         * **The arrowhead scales with the graphic it belongs to.**
         *
         * `headSize` is filed in metres at construction — `arrowheadMeters(name, res)` —
         * and nothing moved it afterwards, so shrinking an envelopment to 45% left a
         * full-size head on a graphic less than half as long. It reads as a different
         * symbol rather than a smaller one.
         *
         * Scaled here, in the gesture, rather than inside `updateGeom`: restore also
         * calls `updateGeom`, with the *final* size against a freshly constructed head,
         * and a ratio taken there would rescale a head that was already correct.
         */
        const holder = this.graphic as unknown as {headSize?: number};
        if (typeof holder.headSize === 'number' && holder.headSize > 0) {
            holder.headSize *= deltaSize;
        }

        const size = this.graphic.size * deltaSize;
        this.graphic.updateGeom({size});
    }

    /** Ends the read-out. Called by the manager when a drag finishes. @see showMeasure */
    endGesture(): void {
        this.graphic.showMeasure?.(false);
    }

    /** Forwarded to the holder. @see TacticalGraphicHandler.setMirrored */
    setMirrored(mirrored: boolean): void {
        this.graphic.setMirrored?.(mirrored);
    }

    handleRotate(deltaAngle: number): void {
        let rotation = this.graphic.rotation + deltaAngle;
        this.graphic.updateGeom({rotation});
    }

    handleTranslate(deltaX: number, deltaY: number): void {
        const baseCoord = this.graphic.centerCoordinate();
        const center = [baseCoord[0] + deltaX, baseCoord[1] + deltaY];
        this.graphic.updateGeom({center});
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

    setBaseFeature(base: Feature<Point | LineString>): void {
        this.graphic.setBaseFeature(base);
    }
}

/**
 * A point-anchored graphic that is **placed, not drawn**: one click on the map
 * drops it at a fixed size and the draw is over.
 *
 * The crossed mission tasks (Destroy / Interdict / Neutralize / Suppress) are
 * badges — they render at a fixed 100 px, never rotate, and have no dimension
 * to drag. A `Circle` draw asked the user for a radius and a bearing that were
 * both then discarded, and left a click-move-click gesture where a click would
 * do.
 *
 * Everything else is inherited: it is still a `MissionTaskController`, so the
 * sample gallery, `applyRestoredGeometry` and the manager's `Circle` drag
 * dispatch all keep working unchanged. Only the draw geometry and the two
 * gestures that no longer mean anything are overridden.
 */
export class PointDropController extends MissionTaskController {
    /** What the Draw interaction builds — a single click, then `drawend`. */
    type: TacticalGraphicShape = 'Point';
    /**
     * …but drags still route through `handleCircleDrag`, which is where a
     * point-anchored graphic's translate lives. The two shapes are independent:
     * this one is "what the user draws", the other "how the user edits it".
     */
    geomHandleType: TacticalGraphicShape = 'Circle';

    /** The size every instance is dropped at, in map units. */
    private readonly fixedSize: number;

    /**
     * `resizable` opts back into the inherited resize. The crossed tasks are fixed-size
     * symbols and leave it off; the explosives readiness states are dropped the same way
     * but the user scales them afterwards, which is the only difference between them.
     */
    constructor(
        graphic: MissionTaskGraphic,
        fixedSize: number,
        private readonly resizable: boolean = false,
        /**
         * The size as it was actually specified — a pixel count and the zoom to spend it
         * at — so the drop can convert it where it lands. @see drop
         */
        private readonly screenSize?: {px: number; resolution: number},
        /**
         * …and `rotatable` opts back into the inherited rotate, on the same reasoning.
         *
         * It defaults off because every dropped graphic up to now had one doctrinal
         * orientation, and the refusal was written straight into `handleRotate` as a
         * result. The demonstration is the first that points somewhere the operator
         * chooses, and the refusal was invisible to it: `allowedGestures` said the
         * rotate was allowed, this class said nothing happens, and only OpenLayers was
         * wrong — MapLibre reads the table. Both now read the same table.
         * @see allowedGestures, RESIZE_ONLY_SYMBOLS
         */
        private readonly rotatable: boolean = false,
    ) {
        super(graphic);
        this.fixedSize = fixedSize;
    }

    private drop(e: DrawEvent): void {
        const point = e.feature.getGeometry() as Point | undefined;
        const coordinate = point?.getCoordinates();
        if (!coordinate || coordinate.length < 2) return;
        // **Sized where it lands, not where the map was centred.** These are screen
        // constants — 50 px across for the crossed tasks — and a pixel count times the
        // bare resolution is a projected length, so a Destroy dropped at 60 degrees north
        // came out 204 px wide against the same drop's 100 px on the equator. The click
        // is the first moment the place is known, and it is the only input this symbol
        // takes. @see screenMeters
        const size = this.screenSize
            ? screenMeters(this.screenSize.px, this.screenSize.resolution, latitudeFromMercatorY(coordinate[1]))
            : this.fixedSize;
        this.graphic.updateGeom({size, center: coordinate as Coordinate, rotation: 0});
    }

    // A Point draw fires both in the same click. Placing on `drawstart` means the
    // symbol is under the cursor the instant the button goes down rather than on
    // release; `drawend` repeats it so an abort mid-click cannot leave it half-set.
    onDrawStartFunc = (e: DrawEvent) => this.drop(e);
    onDrawEndFunc = (e: DrawEvent) => this.drop(e);

    /** Fixed size unless the graphic opted in: the style function caps the rest. */
    handleResize(deltaSize: number): void {
        if (this.resizable) super.handleResize(deltaSize);
    }

    /** Off unless the graphic opted in: most of these have one doctrinal orientation. */
    handleRotate(deltaAngle: number): void {
        if (this.rotatable) super.handleRotate(deltaAngle);
    }
}
