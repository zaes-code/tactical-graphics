import {Style} from 'ol/style';
import {Coordinate} from 'ol/coordinate';
import {Circle as CircleGeom, Geometry, LineString, Point} from 'ol/geom';
import type {RadarSearchFrame, TacticalGraphicName} from '@zaes/tactical-graphics';
import {allowedGestures, frameFromDrag, groundLength, latitudeFromMercatorY, normalizeDrawnBase, projectedLength, radarSearchFromClicks, rotationPivot, screenMeters} from '@zaes/tactical-graphics';
import Feature, {FeatureLike} from 'ol/Feature';
import {DrawEvent} from 'ol/interaction/Draw';
import {fromLonLat, toLonLat} from 'ol/proj';
import type {Position} from 'geojson';
import {StyleFunction} from 'ol/style/Style';
import {TacticalGraphic, TacticalGraphicHandler, TacticalGraphicShape} from "../openlayersAdapter";
import {ObjectEvent} from 'ol/Object';
import {GraphicLinkRegistry} from "../../../utils/graphicLinkRegistry";
import {defaultDrawStyleFunc, drawMarkerStyle} from "../openlayerStyles";

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
     * pan the map. Set by the factories in `controllerRegistry.ts`.
     *
     * **The range fans set it too**, though `handleResize` now refuses them: this is what
     * claims the drag, and a fan that did not claim it would pan the map out from under
     * the graphic the user was trying to edit. Their sizes come from the band amplifiers
     * and their own rim handles instead. @see allowedGestures, NO_DRAG_RESIZE_SYMBOLS
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

    /**
     * Forwarded so the manager will treat a grab on the width grip as an offset grab at
     * all: `handleDownEvent` tests `!!activeController.setOffset` before it looks at the
     * feature's own `offsetHandler` flag. Only the rectangular target implements it here.
     */
    setOffset = (offset: number): void => {
        (this.graphic as {setOffset?: (n: number) => void}).setOffset?.(offset);
    };

    /**
     * A width drag, for the holders whose frame is not in their base.
     *
     * The manager's own `handleOffset` measures a perpendicular against two anchor points;
     * a point-anchored graphic has one, so the holder is given the cursor and works the
     * width out from its own centre and attitude. Only the rectangular target implements
     * it. @see RectangularTargetGraphicBase.setOffsetFromPoint
     */
    setOffsetFromPoint = (coordinate: Coordinate): void => {
        (this.graphic as {setOffsetFromPoint?: (c: Coordinate) => void}).setOffsetFromPoint?.(coordinate);
    };

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
            this.graphic.updateGeom(this.drawnFrame(radius, this.rotationAngleDeg));

        });
    };

    /**
     * What the drag describes, which is not always a centre and a radius.
     *
     * Nearly every graphic on this controller is drawn centre-to-edge, and for those this
     * is the identity. Contain is not: its plate marks the two clicks as the ends of the
     * semicircle's opening, so the frame's centre is half way along the drag and its size
     * is half the reach. **The rule is the library's**, so MapLibre draws the same symbol
     * from the same two clicks. @see frameFromDrag
     *
     * The centre is walked in projected metres, which is the space this controller already
     * works in. It differs from the geodesic midpoint the anchor reader recovers by a few
     * metres at any drawable scale, and the reader is what the rebuild uses — so the
     * committed shape is the reader's either way, and this only has to put the preview in
     * the right place.
     */
    private drawnFrame(radius: number, rotationDeg: number): {size: number; center: Coordinate; rotation: number} {
        const frame = frameFromDrag(this.graphic.name, radius, rotationDeg);
        if (!frame.reach) return {size: frame.size, center: this.center, rotation: frame.rotation};
        const bearing = (frame.bearingDeg * Math.PI) / 180;
        // Back to projected metres from the ground distance `drawnRadius` reported.
        const projected = projectedLength(frame.reach, latitudeFromMercatorY(this.center[1]));
        return {
            size: frame.size,
            center: [this.center[0] + projected * Math.cos(bearing), this.center[1] + projected * Math.sin(bearing)],
            rotation: frame.rotation,
        };
    }

    onDrawEndFunc = (e: DrawEvent) => {
        const circleGeom = e.feature.getGeometry() as CircleGeom;
        const radius = this.drawnRadius(circleGeom);

        // Still the draw: the floor has to reach the size that is *committed*, or a short
        // drag would be held legible right up until the click that ends it.
        this.graphic.updateGeom(this.drawnFrame(radius, this.rotationAngleDeg));
        this.graphic.sizingFromDraw = false;
        this.graphic.showMeasure?.(false);
    };

    onPointerMove = (evt: any) => {
        this.currentMouseCoord = evt.coordinate;
    };

    /**
     * The gate. **The refusal reads the library's table rather than restating it.**
     *
     * `allowedGestures(name)` is what MapLibre reads and what decides whether the host
     * draws a resize affordance at all. A controller that separately decided the same
     * thing would be a second statement of one fact — the shape of defect
     * `gestureParity.test.ts` exists to catch, and it caught exactly this the first time
     * the range fans were told to stop scaling: the affordance vanished while a drag
     * through any other route still scaled them.
     *
     * Split from the work below so a subclass can still refuse by overriding, and so the
     * parity test can tell a refusal from a resize by watching where the call lands.
     */
    handleResize(deltaSize: number): void {
        if (!allowedGestures(this.graphic.name).resize) return;
        this.applyResize(deltaSize);
    }

    /** The resize itself, reached only once the gesture is allowed. */
    protected applyResize(deltaSize: number): void {
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

        /*
         * **A filed width scales with the graphic too**, for the same reason `headSize`
         * does and in the same place.
         *
         * The rectangular target is the only holder here with a second dimension of its
         * own. Until a width is set it follows the length and needs nothing; once it is
         * set it stops following, and a resize that moved only `size` stretched the box
         * rather than scaling it — measured, a 1.16 width-to-length ratio came out at 0.68
         * after one drag on the Resize affordance.
         *
         * In the gesture rather than inside `updateGeom`, because restore calls that too
         * — with the *final* size against an already-correct width — and a ratio taken
         * there would rescale it a second time.
         */
        const widthed = this.graphic as unknown as {scaleWidth?: (factor: number) => void};
        widthed.scaleWidth?.(deltaSize);

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
        // A holder may own more than `rotation` when it turns — 200700 also has a typed axis
        // to stand down. @see RangeFanGraphicBase.handleRotate
        const turns = this.graphic as {handleRotate?: (delta: number) => void};
        if (turns.handleRotate) {
            turns.handleRotate(deltaAngle);
            return;
        }
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
/**
 * The anchor graphics an operator places **point by point**.
 *
 * APP-06 describes these by numbered points and the base has always stored those points;
 * what it did not do was let anyone place them. The draw was a `Circle` — a centre and a
 * rim — and every anchor was derived from that frame, which is why a user following the
 * Draw Rules got a symbol other than the one they aimed at. Contain moved off that model
 * on 2026-09-04 and the other four followed on 2026-09-05. (User's call.)
 *
 * **Only the draw changes.** Everything after it — translate, rotate, resize, the
 * per-handle drags, the gesture refusals — is `MissionTaskController`'s and is inherited
 * untouched, because none of it was ever about how the symbol was first placed.
 *
 * The two ends of the pipe already existed and this joins them: OpenLayers builds its
 * `Draw` from `type` and `maxPoints` on the handler, and `MissionTaskGraphicBase`'s
 * `setBaseFeature` already routes a `LineString` base through `adoptAnchors` — which is
 * how a restore has always reached these holders. In between,
 * `TacticalGraphicsManager.normalizeDrawnGeometry` runs `anchorsFromClicks`, so the clicks
 * become the plate's anchors, with the points that carry no decision constructed rather
 * than demanded. @see anchorsFromClicks, drawsByAnchorClicks
 *
 * `clicks` is what the operator places, which is not always what is stored: ambush spends
 * two clicks on a three-point symbol and envelopment three on a four-point one.
 */
export class AnchorClickController extends MissionTaskController {
    type: TacticalGraphicShape = 'LineString';
    /**
     * **Only the draw is a line.** `type` builds the `Draw` interaction; `geomHandleType`
     * routes the *edit* drags, and these are still point-anchored symbols — handles of
     * `[edge, centre]`, a rotate and a resize measured about a centre.
     *
     * Setting this to `LineString` sent them down `handleLineStringDrag`, which hands
     * `handleRotate` an angle in **radians** because a line controller rotates geometry;
     * a mission-task holder keeps `rotation` in **degrees**, so a half-radian drag turned
     * the symbol half a degree and the gesture looked dead. (User's report, 2026-09-05.)
     */
    geomHandleType: TacticalGraphicShape = 'Circle';
    maxPoints: number;

    constructor(graphic: MissionTaskGraphic, clicks: number) {
        super(graphic);
        this.maxPoints = clicks;
    }

    /**
     * **The shared draw style, not the circle's.** `MissionTaskController` suppresses
     * OpenLayers' own circle and paints a marker instead; a line draw wants what every
     * other line being drawn gets, or the sketch is invisible until the last click.
     */
    drawStyleFunc: StyleFunction = defaultDrawStyleFunc();

    /**
     * Starts the draw, and **shows the symbol while it is being drawn**.
     *
     * The circle draw updated the holder on every geometry change, so the graphic grew
     * under the cursor; a line draw that only spoke at the end left the operator placing
     * points against an empty map and finding out what they had made afterwards.
     * (User's report, 2026-09-05.)
     *
     * The sketch carries a floating vertex at the cursor, so what arrives here after the
     * first click is already the two points ambush needs and, after the second, the three
     * a turn needs — the preview is the real symbol rather than an approximation of it,
     * because it comes through `normalizeDrawnBase` and the holder exactly as the finished
     * one will. A sketch too short to describe anything is skipped rather than guessed at.
     */
    onDrawStartFunc = (e: DrawEvent) => {
        // The legibility floor belongs to this gesture and no other, exactly as it does
        // on the circle draw. @see minimumDrawnRadiusPx
        this.graphic.sizingFromDraw = true;
        this.sketch = e.feature as Feature<LineString> | undefined;
    };

    /**
     * The sketch being drawn, held so the preview can read it as the cursor moves.
     *
     * **Read on `pointermove`, not from a `change` listener on the geometry.** The
     * obvious hook is the one `LineGraphicController` uses — subscribe to the sketch
     * geometry and redraw whenever it changes — and it never fired once here. The manager
     * already forwards every pointer move to the controller, which is the event the sketch
     * is updated from in the first place, so this reads it at the source. Measured: with
     * the `change` listener the holder was still holding its initial `Point` base after a
     * click and a 170-pixel drag. (2026-09-05.)
     */
    protected sketch?: Feature<LineString>;

    onPointerMove = (_evt: unknown) => {
        /*
         * **Only while a draw is running.** `sketch` is cleared on `drawend`, and this is
         * what that clearing is for: the manager forwards *every* pointer move to the active
         * controller, including the ones in edit mode long after the draw finished. A
         * controller still holding its finished sketch replays it on each move and stamps the
         * drawn values back over whatever the user has just edited — which is exactly what a
         * dragged 200700 grip did, snapping back on the next mouse move. (User's report,
         * 2026-09-05.) @see RangeClickController.onDrawEndFunc
         */
        const geometry = this.sketch?.getGeometry();
        if (!(geometry instanceof LineString)) return;
        const coords = geometry.getCoordinates();
        this.preview(coords);
        // The read-out is drawn from the centre towards wherever the gesture is, and on a
        // click-placed draw that is the floating vertex under the cursor. Set after the
        // preview, so the line measures the symbol the last move just produced.
        if (coords.length) this.graphic.showMeasure?.(true, coords[coords.length - 1]);
    };

    /**
     * Draws what the clicks so far describe, without touching the sketch.
     *
     * **Normalised into a feature of its own.** The holder wants the plate's anchors, not
     * the raw clicks — a two-point ambush sketch means nothing to `arcAndArrowFromAnchors`
     * until point 3 is constructed — so the clicks go through the same
     * `normalizeDrawnBase` the finished draw uses. Writing the result back onto the sketch
     * instead would fight the `Draw` interaction for the geometry it is still editing,
     * which is why the manager only does that on `drawend`.
     * @see TacticalGraphicsManager.normalizeDrawnGeometry
     */
    private preview(projected: Coordinate[]): void {
        if (projected.length < 2) return;
        const name = this.graphic.name;
        if (!name) return;
        // A cursor still sitting on the click describes nothing yet, and the normalizer
        // says so by handing back fewer points than the symbol needs.
        const anchors = normalizeDrawnBase(name, projected.map(c => toLonLat(c)) as Position[]);
        if (anchors.length < 2) return;
        this.graphic.setBaseFeature?.(
            new Feature(new LineString(anchors.map(c => fromLonLat(c as Coordinate)))) as Feature<LineString>,
        );
    }

    /**
     * Turns the symbol about the point the **library** says it turns about.
     *
     * `MissionTaskController` adds the delta to `rotation` and lets the holder regenerate
     * about its own centre, which is right for a symbol whose centre is what it is pinned
     * by. Ambush is not one: 141700's back "encompasses the ambush position" and its arrow
     * "typically points at the target", so what turns is the aim and what stays put is the
     * position — point 2. Turning about the frame's centre swung the ambush off the ground
     * it was placed on. (User's call, 2026-09-05.)
     *
     * Done by compensating rather than by re-deriving: rotate, see how far the pivot moved,
     * and translate it back. `rotationAnchor` picks which point that is, so MapLibre — whose
     * rotate transforms the geometry about that same point directly — cannot disagree.
     */
    handleRotate(deltaAngle: number): void {
        const before = this.pivot();
        super.handleRotate(deltaAngle);
        const after = this.pivot();
        if (!before || !after) return;
        const dx = before[0] - after[0];
        const dy = before[1] - after[1];
        if (dx === 0 && dy === 0) return;
        this.handleTranslate(dx, dy);
    }

    /** Where the library says this symbol turns, in projected metres. @see rotationAnchor */
    private pivot(): Coordinate | undefined {
        const geometry = this.graphic.base?.getGeometry?.();
        if (!(geometry instanceof LineString)) return undefined;
        const anchors = geometry.getCoordinates().map(c => toLonLat(c)) as Position[];
        if (anchors.length < 2) return undefined;
        return fromLonLat(
            rotationAnchor({type: 'LineString', coordinates: anchors}, this.graphic.name) as Coordinate,
        );
    }

    /**
     * Hands the drawn anchors straight to the holder.
     *
     * The manager has already normalised them, so what arrives is the plate's full point
     * list — three for a turn, four for an envelopment — and `setBaseFeature` reads the
     * frame back out of it rather than being told a centre and a size.
     */
    onDrawEndFunc = (e: DrawEvent) => {
        this.graphic.showMeasure?.(false);
        this.sketch = undefined;
        const feature = e.feature as Feature<LineString> | undefined;
        if (!(feature?.getGeometry() instanceof LineString)) return;

        /*
         * **And it is not armed here either, which leaves the committed geometry exactly as
         * it was.** The flag used to be cleared on the line above this one, so on this path
         * the floor already reached nothing that gets stored — it distorted every pointer
         * move of the draw and then stood down for the one call that decides the symbol.
         * Arming it now would *change* the finished shape of a barely-dragged curve, and the
         * user's report is explicit that "the end drawing is perfect".
         *
         * So `minimumDrawnRadiusPx` is currently unreachable for this family on **both**
         * engines — MapLibre's `legibleRadius` sits on the centre-to-edge frame, which these
         * graphics left when they became click-placed. That is a deliberate hold, not an
         * oversight: re-arming it belongs on both engines at once and is a change to what the
         * gesture produces, so it is someone's call rather than a side effect of this fix.
         */
        this.graphic.sizingFromDraw = false;
        this.graphic.setBaseFeature?.(feature);
    };
}

/**
 * **200700's three clicks**, which state numbers rather than anchor points.
 *
 * The radar search doctrine stores one anchor point and four values — that is what its
 * plate asks for and it is not in question here. What its plate does *not* say is how those
 * values are first given, and the answer the user asked for is three clicks: the radar, then
 * each arc, with a bare arc on the map between the second click and the third and the sector
 * closing on the third. It had exactly that until the storage moved to a single point on
 * 2026-09-05 and took the gesture with it. (User's report, 2026-09-05.)
 *
 * So it inherits `AnchorClickController`'s draw — a `LineString` sketch, a click cap, a live
 * preview off `pointermove` — and replaces only what is done with the clicks: they go
 * through `radarSearchFromClicks` into an azimuth and one or two ranges, and land on the
 * holder, whose base stays a `Point`. Handing the sketch to `setBaseFeature` instead, as the
 * parent does, would put a three-vertex line on a holder that reads its centre off a point.
 *
 * Everything after the draw is the parent's and untouched: the rim handles, the band editor,
 * translate, rotate and resize about the centre. @see radarSearchFromClicks, drawsByRangeClicks
 */
export class RangeClickController extends AnchorClickController {
    /**
     * The clicks so far, as ranges and a bearing — never as a base geometry.
     *
     * Overridden rather than extended: the parent's body is the one thing that does not
     * apply, and calling it first would set a `LineString` base the holder then has to
     * unpick.
     */
    protected preview(projected: Coordinate[]): void {
        this.applyClicks(projected);
    }

    onDrawEndFunc = (e: DrawEvent) => {
        this.graphic.sizingFromDraw = false;
        this.graphic.showMeasure?.(false);
        /*
         * **Clearing the sketch is not bookkeeping, it is the off switch.** This overrides
         * the parent's `onDrawEndFunc` as a class field, so the parent's body — including its
         * `this.sketch = undefined` — never runs, and the controller went on previewing the
         * finished draw on every pointer move for the life of the graphic. Each edit was
         * applied and then overwritten by the original three clicks a few milliseconds later.
         */
        this.sketch = undefined;
        const geometry = e.feature?.getGeometry();
        if (geometry instanceof LineString) this.applyClicks(geometry.getCoordinates());
    };

    /**
     * Reads the clicks and hands the result to the holder.
     *
     * The reading is the library's — both engines call the same function, so the third
     * click means the same thing on each. A sketch that states nothing yet (a cursor still
     * on the first click) comes back `undefined` and nothing is drawn.
     */
    private applyClicks(projected: Coordinate[]): void {
        const frame = radarSearchFromClicks(projected.map(c => toLonLat(c)) as Position[]);
        if (!frame) return;
        (this.graphic as {applyRadarSearchFrame?: (f: RadarSearchFrame) => void}).applyRadarSearchFrame?.(frame);
    }
}

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
     * `resizable` opts back into the inherited resize. Both the crossed tasks and the
     * explosives readiness states are dropped whole on one click and scaled afterwards;
     * what the crossed tasks refuse is the rotate, which is a different switch.
     * @see allowedGestures, the portable table both engines read.
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
