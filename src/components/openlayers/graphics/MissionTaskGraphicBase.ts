import {Coordinate} from "ol/coordinate";
import {fromLonLat, toLonLat} from 'ol/proj';
import type {Position} from 'geojson';
import {anchorsForHook, anchorsForRunAndArc, anchorsFromFrame, frameFromAnchors, HOOK_DEFAULT_LINE_RATIO, hookFromAnchors, hookPose, runAndArcFromAnchors, usesDrawnAnchors} from '@zaes/tactical-graphics';
import type {DrawnFrame} from '@zaes/tactical-graphics';
import {MissionTaskGraphic} from "../controllers/MissionTaskController";
import {SAME_POINT_EPSILON_M} from "../controllers/LineGraphicController";
import {Feature} from "ol";
import {
    arcMissionTaskStyleFunc,
    baseDefenseZoneLabelStyleFn,
    createCenterBaseFeature,
    createFeature,
    createHandleFeature,
    createMeasureFeature,
    createInertHandleFeature,
    crossedMissionTaskLabelStyleFn,
    crossedMissionTaskStyleFunc,
    fightingPositionStyleFunc,
    freeFireAreaCircularStyleFunc,
    getAreaLabelStylesFn,
    getMissionTaskStyleFn,
    limitedAccessAreaStyleFunc,
    turnStyleFunc,
    envelopmentGraphicStyleFunc,
    barSymbolStyleFunc,
} from "../openlayerStyles";
import {LineString, MultiLineString, MultiPoint, Point} from "ol/geom";
import openlayersAdapter from "../openlayersAdapter";

import {
    envelopmentBendFrom,
    clampTurnBend,
    ENVELOPMENT_DEFAULT_BEND,
    clampEnvelopmentBend,
    TacticalGraphicName,
    TURN_DEFAULT_BEND,
    CROSSED_MISSION_TASKS,
    RATIO_LOCKED_MISSION_TASKS,
    arrowheadMeters,
} from '@zaes/tactical-graphics';

/**
 * Turn asks the generator for **no** gap, so its two curve halves meet exactly
 * at the arc-length midpoint, and `turnStyleFunc` cuts the gap itself from the
 * glyph as rendered.
 *
 * Two earlier attempts were both wrong for the same reason — a gap has to
 * follow whatever it makes room for. A fraction of `size` left a 16 px letter
 * in a hole several times its width on a long turn; a flat
 * `px × drawingResolution` then drifted the other way, because the label's own
 * scale is zoom-clamped to [0.3, 1.5] while a metric gap is not. Only measuring
 * at render time tracks it at every zoom.
 *
 * The zero is renderer-specific: a consumer that omits `labelGap` still gets
 * the generator's own `size`-proportional default.
 */
const TURN_LABEL_GAP_METERS = 0;
/** Index of the arrowhead-tip handle in `Turn.generateHandles`' output. */
const TURN_TIP_HANDLE = 1;

/** Index of the line-end handle in `Envelopment.generateHandles`' output. */
const ENVELOPMENT_LINE_HANDLE = 1;
/**
 * How far off the approach the cursor must be, as a share of the circle's own
 * radius, before a drag counts as a decision to swap flanks.
 *
 * The circle handle sits *on* the axis, so its perpendicular offset is zero at
 * rest. Reading the raw sign would let a pixel of jitter flip the graphic back
 * and forth while the user is only trying to lengthen the hook; requiring a
 * deliberate move to one side keeps the flip available without that.
 */
/** @see ENVELOPMENT_FLIP_THRESHOLD in the library, which this used to duplicate. */

/**
 * Graphics whose `size` is floored so the symbol is recognisable from the first cursor
 * move.
 *
 * **The arc mission-task circles are deliberately absent.** Contain, Control, Isolate,
 * Occupy, Retain and Secure used to take this floor, which stopped them being resized
 * below a 100px diameter — while Cordon and Search and Area Defense, built from the same
 * arcs, were never in the list and so had always been free to go small. Users hit the
 * inconsistency directly: a circle that refuses to shrink reads as a broken handle, not
 * a rule. Their label still scales from `graphicSize`, so a small circle gets a small
 * letter rather than one bursting out of it.
 *
 * What stays: the crossed four, which are fixed-size badges placed by a single click and
 * never resized — the floor is what gives them a size at all; and Turn / TacticalTurn /
 * Envelopment, which are curves rather than circles and collapse into an unreadable kink
 * without it.
 */
const MIN_SIZED_MISSION_TASKS: readonly TacticalGraphicName[] = [
    ...CROSSED_MISSION_TASKS,
    TacticalGraphicName.TacticalTurn,
    TacticalGraphicName.Turn,
    TacticalGraphicName.Envelopment,
];
const RATIO_LOCKED_MIN_RADIUS_PX = 50;

/**
 * The mission tasks drawn as two arcs of one circle with a one-letter label in
 * the gap between them.
 *
 * They ask the generator for **no** label gap and cut their own from the
 * rendered glyph — the same bargain `Turn` strikes, and for the same reason: the
 * generator can only express the gap as a slice of the circle, which grows with
 * the graphic, while the label inside it is capped. A 30° hole that fits a
 * letter on a small circle is four times too big on a large one.
 *
 * `AreaDefense` is in the set too, and is the only member whose teeth are solid
 * polygons rather than open outlines — `arcMissionTaskStyleFunc` fills those
 * separately, which is why it replaces the fill-and-stroke style this class used
 * to give it.
 */
const ARC_GAP_MISSION_TASKS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.AreaDefense,
    TacticalGraphicName.Contain,
    TacticalGraphicName.Control,
    TacticalGraphicName.CordonAndSearch,
    TacticalGraphicName.Isolate,
    TacticalGraphicName.Occupy,
    TacticalGraphicName.Retain,
    TacticalGraphicName.Secure,
];
/**
 * How far MovementToContact's zigzag "contact" arrows sit off the big arrow's
 * arrowhead edge, as a fraction of that arrow's half-length `r`. Expressed against
 * the graphic rather than the screen so the two stay locked together at every zoom
 * — see the note in the constructor.
 */
const SIDE_ARROW_GAP_RATIO = 0.12;
import {GraphicLabels} from "../../../utils/graphicLinkRegistry";
import { movementToContactStyleFunc, pursuitStyleFunc} from "../openlayerStyles";
import {getGraphicFields} from '../graphicFieldRegistry';
import {assignRole, GraphicGeometryState, readGraphicLabels, writeGraphicProperties} from "../graphicProperties";

export class MissionTaskGraphicBase implements MissionTaskGraphic {
    center: Coordinate = [0, 0];
    /**
     * The center the graphic is built around, and — since it is now published from
     * `getFeatures()` — the only part of a mission task that has to survive a save.
     * Everything else regenerates from it plus `size` / `rotation`.
     *
     * `base` is deliberately left **false**. That flag means "has vertices the Modify
     * interaction may drag" (`getRenderedFeaturesByProp('base')`), which a
     * point-anchored graphic does not: it is reshaped by rotate / resize / translate.
     * Same trick as `mobileDefense` in `controllerRegistry.ts`. The `role` tag, not
     * this flag, is what identifies the feature when serializing.
     */
    base: Feature<Point | LineString> = createCenterBaseFeature() as Feature<Point | LineString>;
    rotation: number = 0;
    size: number;
    symbolId: string = '';

    handles: Feature<MultiPoint> = <Feature<MultiPoint>>createHandleFeature();
    /** The center dot — visual anchor only. @see publishHandles */
    centerHandle: Feature<MultiPoint> = <Feature<MultiPoint>>createInertHandleFeature();
    graphic: Feature = createFeature();
    /**
     * The radius read-out. Empty unless a gesture is in progress — @see showMeasure.
     */
    measure: Feature = createMeasureFeature();
    label: Feature = assignRole(new Feature(), 'label');
    name: TacticalGraphicName;

    constructor(
        name: TacticalGraphicName,
        size: number,
        drawingResolution?: number,
    ) {
        this.size = size;
        this.name = name;
        if (drawingResolution !== undefined) {
            this.label.set('drawingResolution', drawingResolution);
            this.graphic.set('drawingResolution', drawingResolution);
            // Restoring rebuilds through `getController(name, drawingResolution)`, so the
            // resolution has to ride on the base feature too — it is the only one saved.
            this.base.set('drawingResolution', drawingResolution);
        }
        if (name === TacticalGraphicName.FightingPosition) {
            this.graphic.setStyle(fightingPositionStyleFunc(name));
        }
        // The crossed-line tasks draw their own arms so the gap for the center
        // label can be measured off the glyph, and so one arm can be hashed.
        if (CROSSED_MISSION_TASKS.includes(name)) {
            this.graphic.setStyle(crossedMissionTaskStyleFunc(name));
        }
        // Turn is a GeometryCollection — stroked curve plus filled arrowhead —
        // so it needs a fill as well as a stroke, and not the default blue one.
        if (name === TacticalGraphicName.TacticalTurn || name === TacticalGraphicName.Turn) {
            this.graphic.setStyle(turnStyleFunc(name));
        }
        // Envelopment is point-anchored like Turn but still emits the same
        // MultiLineString the line-drawn version did, so its style function is
        // unchanged — only how the geometry gets built moved.
        // The readiness states differ only in which bar is dashed - a stroke property,
        // so it cannot live in the geometry.
        if (name === TacticalGraphicName.ExplosivesPlannedStateOfReadiness || name === TacticalGraphicName.ExplosivesStateOfReadiness1Safe || name === TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable || name === TacticalGraphicName.RoadblockCompleteExecuted) {
            this.graphic.setStyle(barSymbolStyleFunc(name));
        }
        if (name === TacticalGraphicName.Envelopment) {
            this.graphic.setStyle(envelopmentGraphicStyleFunc());
        }
        // Pursuit splits its horizontal line around the "P" so the letter always has
        // breathing room; the gap is measured off the rendered glyph.
        if (name === TacticalGraphicName.Pursuit) {
            this.graphic.setStyle(pursuitStyleFunc(name));
        }
        // MovementToContact nudges its zigzag "contact" arrows off the big arrow's
        // arrowhead edges — by a fraction of the arrow, not a screen constant.
        if (name === TacticalGraphicName.MovementToContact) {
            this.graphic.setStyle(movementToContactStyleFunc());
        }
        // The arc circles draw their own line work so the gap for the letter can
        // be measured off the glyph instead of being a fixed slice of the circle.
        if (ARC_GAP_MISSION_TASKS.includes(name)) {
            this.graphic.setStyle(arcMissionTaskStyleFunc(name, RATIO_LOCKED_MISSION_TASKS.has(name)));
        }
        // One call for the whole family: `missionTaskLabelPaint` picks the ratio-locked
        // 24px treatment or the ordinary zoom-anchored one from the name itself, so both
        // renderers make the same choice. @see RATIO_LOCKED_MISSION_TASKS
        this.label.setStyle((feature, resolution) => getMissionTaskStyleFn(name)(feature, resolution));
        // BaseDefenseZone uses a hardcoded "BDZ" label whose scale tracks
        // the circle's radius rather than the zoom-anchored
        // featureLabelScale. Override the default mission-task label style
        // for it; the radius is stamped on the label feature in
        // updateGeometry as `graphicSize`.
        if (name === TacticalGraphicName.BaseDefenseZone) {
            this.label.setStyle(baseDefenseZoneLabelStyleFn());
        }
        // …but the crossed four cap their symbol at 100 px across, and the
        // letter has to stop growing with it. Must come after the block above.
        if (CROSSED_MISSION_TASKS.includes(name)) {
            this.label.setStyle(crossedMissionTaskLabelStyleFn(name));
        }
    }

    /**
     * Generator options beyond `size` / `rotation`, for subclasses whose shape
     * takes another input. Split into two so a subclass can say which of them
     * belong in the saved bag: this one is everything the generator needs,
     * `persistedGeometryState` only the portable part.
     * @see TurnGraphicBase
     */
    protected generatorOptions(): Record<string, unknown> {
        // Zero, not "a bit smaller": the arcs run right up to the label axis and
        // `arcMissionTaskStyleFunc` takes back exactly what the glyph needs.
        // @see ARC_GAP_MISSION_TASKS
        return ARC_GAP_MISSION_TASKS.includes(this.name) ? {labelGapDegrees: 0} : {};
    }

    /** The subset of `generatorOptions` that a restore has to carry. */
    protected persistedGeometryState(): GraphicGeometryState {
        return {};
    }

    updateGeometry = () => {
        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.name,
            this.base,
            {size: this.size, rotation: this.rotation, mirrored: this.mirrored, ...this.generatorOptions()}
        );
        if (!tacticalGraphic) return;

        const {graphic, handles, labels} = tacticalGraphic;

        this.graphic.setGeometry(graphic);
        this.publishHandles(handles as MultiPoint);
        this.label.setGeometry(labels);

        // Stamp the current radius on the label feature so size-tracking
        // label styles (e.g. baseDefenseZoneLabelStyleFn) can scale text to
        // the circle without poking at the label feature.
        this.label.set('graphicSize', this.size);
        // …and on the graphic, for the styles that have to reproduce the
        // label's scale to leave room for it (crossedMissionTaskStyleFunc).
        this.graphic.set('graphicSize', this.size);
        // The projected center, for styles that scale the symbol about it. It
        // cannot be recovered from the geometry: the generator walks out
        // geodesically and Mercator does not preserve the midpoint.
        const center = this.centerCoordinate();
        if (center) this.graphic.set('graphicCenter', center);
        // …and where the label sits, for the styles that have to open a hole for
        // it. Which direction that is differs per graphic — Contain's is due
        // west, everyone else's is along the rotation axis — so the anchor is
        // published rather than re-derived from `rotation`.
        const labelPoint = labels instanceof Point ? labels.getCoordinates() : undefined;
        if (labelPoint) this.graphic.set('graphicLabelPoint', labelPoint);

        // Store the graphic's bounding box on the label feature so edge-anchored
        // label styles (e.g. PositionAreaArtillery's four PAA labels) can compute
        // positions without inspecting the graphic feature directly.
        const graphicGeom = this.graphic.getGeometry();
        if (graphicGeom) {
            const [minX, minY, maxX, maxY] = graphicGeom.getExtent();
            this.label.set('polygonMinX', minX);
            this.label.set('polygonMinY', minY);
            this.label.set('polygonMaxX', maxX);
            this.label.set('polygonMaxY', maxY);
        }

        // `size` and `rotation` are the whole of a mission task's editable state; keep
        // them on the features so a reload gets an editable graphic, not a frozen one.
        this.publishGeometryState();
    };

    /**
     * Splits the generator's handle set into the draggable ones and the center,
     * which is published on a separate gray `inert` feature that
     * `TacticalGraphicsManager.handleDownEvent` refuses to start a drag from.
     *
     * The center is worse than useless as a drag origin: `handleResize` scales by
     * `distanceToCenter(cursor) / distanceToCenter(lastPointer)`, and both are
     * ~0 there, so a nudge on the center dot used to blow `size` up by twenty
     * orders of magnitude.
     *
     * **Matches on position, not index** — the same rule as `visiblePathHandles`.
     * Generators do not agree on an order: the MissionTask convention is
     * `[edge, center]` but the range fans emit `[center, rim]`. "Is this handle
     * on the base point" is the only stable test, and it costs nothing to be
     * right for a generator that emits no center handle at all (Ambush, Pursuit).
     *
     * Never leaves the draggable set empty: a generator whose handles all sit on
     * the center keeps them, so the graphic cannot end up with nothing to grab.
     */
    protected publishHandles(handles: MultiPoint): void {
        const coords = handles.getCoordinates();
        const center = this.centerCoordinate();
        if (!center) {
            this.handles.setGeometry(handles);
            this.centerHandle.setGeometry(new MultiPoint([]));
            return;
        }

        const onCenter = (c: number[]) => Math.hypot(c[0] - center[0], c[1] - center[1]) <= SAME_POINT_EPSILON_M;
        const draggable = coords.filter(c => !onCenter(c));
        if (draggable.length === 0) {
            this.handles.setGeometry(new MultiPoint(coords));
            this.centerHandle.setGeometry(new MultiPoint([]));
            return;
        }

        this.handles.setGeometry(new MultiPoint(draggable));
        this.centerHandle.setGeometry(new MultiPoint(coords.filter(onCenter)));
    }

    /**
     * Arms or disarms the radius read-out.
     *
     * Armed by the controller for the duration of a draw or resize gesture and disarmed
     * when it ends, so the hashed line is a live measurement rather than decoration.
     * Off by default, which is what keeps it out of a restored map and out of the sample
     * gallery — both drive `updateGeom` without any gesture.
     */
    showMeasure(active: boolean, anchor?: Coordinate): void {
        this.measuring = active;
        if (anchor) this.measureAnchor = anchor;
        if (!active) this.measureAnchor = undefined;
        this.refreshMeasure();
    }

    /**
     * Suspends the minimum-size floor below while a snapshot is rebuilt.
     *
     * The floor is `RATIO_LOCKED_MIN_RADIUS_PX * drawingResolution`, and on a restore
     * that resolution is the *current* view's, not the one the graphic was drawn at. So
     * restoring zoomed out clamped the size up by exactly the ratio between them — the
     * crossed four, Turn, TacticalTurn and Envelopment all came back 4x too large in a
     * 4x-resolution session. The floor is a draw-time affordance; on restore the size is
     * already final. @see LineGraphicBase.suspendMinimumLength for the twin.
     */
    suspendMinimumSize = false;

    /**
     * Which side an asymmetric point-anchored graphic hangs its hook on — Pursuit's
     * semicircle and P-line. Reflected in the graphic's own local frame, so it survives
     * rotation. Stamped and replayed like any other geometry input.
     */
    mirrored: boolean = false;

    /** @see TacticalGraphicHandler.setMirrored */
    setMirrored(mirrored: boolean): void {
        if (mirrored === this.mirrored) return;
        this.mirrored = mirrored;
        this.updateGeometry();
        this.publishGeometryState();
    }

    private measuring = false;
    /**
     * Where the gesture actually is — the cursor while drawing, the dragged point while
     * resizing. The line is drawn to whichever handle is nearest it, so the read-out
     * follows the handle the user has hold of rather than whichever one the generator
     * happened to emit first.
     */
    private measureAnchor: Coordinate | undefined;

    /**
     * Redraws the line from the center handle to the edit handle, or clears it when
     * disarmed.
     *
     * Anchored on the two handles rather than on `center` + `size` so it lands exactly
     * where the user is dragging: the edit handle is the thing under the cursor, and a
     * line drawn to a computed bearing instead would sit beside it on any graphic whose
     * handle is not due east.
     */
    private refreshMeasure(): void {
        const edge = this.measureEdge();
        // Same list the properties dialog reads, so a graphic can never report a radius
        // in one place and not the other. @see RADIUS_GRAPHICS
        if (!getGraphicFields(this.name).radius) {
            this.measure.setGeometry(undefined);
            return;
        }
        if (!this.measuring || !edge || !this.center) {
            this.measure.setGeometry(undefined);
            return;
        }
        this.measure.setGeometry(new LineString([this.center, edge]));
    }

    /**
     * Where the line ends: the radius projected along the direction of the gesture.
     *
     * Not the handle coordinate itself. A circular graphic carries one rim handle whose
     * bearing is derived from `rotation`, and for these graphics that lands roughly
     * opposite the cursor — measured at 155° out — so drawing to it puts the read-out on
     * the far side of the circle from the hand moving it. Projecting `size` along
     * center→anchor keeps the line under the cursor while staying exactly one radius
     * long, which is the number the label reports.
     *
     * Falls back to the first handle before any gesture has supplied an anchor.
     */
    private measureEdge(): Coordinate | undefined {
        const handles = (this.handles.getGeometry() as MultiPoint | undefined)?.getCoordinates() ?? [];
        const anchor = this.measureAnchor;
        if (!anchor || !this.center || !this.size) return handles[0];
        const dx = anchor[0] - this.center[0];
        const dy = anchor[1] - this.center[1];
        const len = Math.hypot(dx, dy);
        if (len === 0) return handles[0];
        return [this.center[0] + (dx / len) * this.size, this.center[1] + (dy / len) * this.size];
    }

    getFeatures(): Feature[] {
        return [this.graphic, this.label, this.handles, this.centerHandle, this.measure, this.base];
    }

    /**
     * Republishes the amplifiers together with the geometry inputs that produced the
     * current shape, so a saved graphic can be rebuilt rather than merely redrawn.
     *
     * Reads the existing bag back rather than taking amplifiers as an argument: the
     * properties dialog stamps amplifiers straight onto the features
     * (`tactical-graphics-dialog.tsx`), so a resize that wrote only `{name, size,
     * rotation}` would silently wipe the hostility the user had just set.
     */
    protected publishGeometryState(extra?: GraphicGeometryState): void {
        writeGraphicProperties(this.getFeatures(), this.name, {...readGraphicLabels(this.graphic)}, {
            radius: this.size,
            rotation: this.rotation,
            mirrored: this.mirrored,
            ...this.persistedGeometryState(),
            ...extra,
        });
    }

    updateGeom({size, center, rotation}: { size?: number, center?: Coordinate, rotation?: number }): void {
        this.rotation = rotation || this.rotation;
        // The crossed four are drawn in one fixed orientation — an X turned 45°
        // is a "+", and Interdict's and Neutralize's horizontal arm is what
        // distinguishes them from Destroy and Suppress. Zeroing here rather
        // than refusing the gesture upstream catches every route into rotation
        // at once: the draw drag (which derives one from the cursor bearing),
        // `handleRotate`, and a restore carrying an old non-zero value.
        if (CROSSED_MISSION_TASKS.includes(this.name)) this.rotation = 0;
        let newSize = size || this.size;
        if (MIN_SIZED_MISSION_TASKS.includes(this.name) && !this.suspendMinimumSize) {
            const drawingRes = this.label.get('drawingResolution') as number | undefined;
            if (drawingRes && drawingRes > 0) {
                const minSize = RATIO_LOCKED_MIN_RADIUS_PX * drawingRes;
                if (newSize < minSize) newSize = minSize;
            }
        }
        this.size = newSize;
        this.center = center || this.center;
        this.writeBase();
        this.updateGeometry();
        this.refreshMeasure();
    }

    setSymbolId(symbolId: string) {
        this.symbolId = symbolId;
        // Every feature, not just graphic + label. A restore looks the holder up by the
        // symbolId on whichever feature it happens to hold, and the base feature is the
        // one it starts from — it used to be the one feature that never carried it.
        this.getFeatures().forEach(f => f.set('symbolId', this.symbolId));
    }

    /**
     * Adopts a new center point.
     *
     * Used to be `this.base = base` and nothing else, which left `center` pointing at
     * the old coordinate: the next rotate or resize — neither passes a center — would
     * read the stale `this.center` back out and snap the graphic to where it used to
     * be. Mission tasks are kept out of the Modify interaction so nothing reached this
     * in practice, but it is on the public `TacticalGraphicHandler` interface and the
     * manager calls it by symbolId.
     */
    setBaseFeature(base: Feature<Point | LineString>) {
        this.base = base;
        const geometry = base.getGeometry();
        if (!geometry) return;

        // A converted graphic's base carries APP-06's anchor points, so the frame is
        // read back out of them rather than taken as a bare center. @see writeBase
        if (geometry instanceof LineString) {
            this.adoptAnchors(geometry.getCoordinates().map(c => toLonLat(c)) as Position[]);
            return;
        }

        const coords = (geometry as Point).getCoordinates();
        if (!coords || coords.length < 2) return;
        this.updateGeom({center: coords as Coordinate});
    }

    /**
     * The center, which is holder state rather than something to read back off the base.
     *
     * It used to come from `this.base.getGeometry().getCoordinates()`, which is a
     * coordinate for a point base and an array of them for an anchored one — so every
     * style that consumed it silently got a nested array the moment a graphic converted.
     */
    centerCoordinate(): Coordinate {
        return this.center;
    }

    /**
     * Writes the base geometry: APP-06's anchor points for a converted graphic, the
     * bare center for everything else.
     *
     * Doing it here rather than in each holder is what lets the conversion be a
     * one-name-at-a-time change: the drag logic above works entirely in
     * center / size / rotation and never learns that the base grew vertices.
     */
    private writeBase(): void {
        if (!usesDrawnAnchors(this.name)) {
            const geometry = this.base.getGeometry();
            if (geometry instanceof LineString) this.base.setGeometry(new Point(this.center));
            else (geometry as Point | undefined)?.setCoordinates(this.center);
            return;
        }
        this.base.setGeometry(new LineString(this.anchorPoints().map(c => fromLonLat(c as Coordinate))));
    }

    /**
     * The anchor points APP-06 describes this symbol by, in lon/lat.
     *
     * **Virtual, because the eight symbols being converted do not share a point
     * layout.** Envelop spends four points on a run and a half circle, Pursue three on
     * the same shape, Contain two on a semicircle's opening, Movement to Contact
     * anywhere from three to fifty. A single reader would have to be told which it was
     * looking at, which is the switch this replaces. The default is the generic
     * run-with-an-offset form; a holder whose symbol is built differently overrides
     * this and `adoptAnchors` together, and they must stay exact inverses.
     */
    protected anchorPoints(): Position[] {
        const {offset, side} = this.anchorReach();
        return anchorsFromFrame(toLonLat(this.center) as Position, this.size, this.rotation, offset, side);
    }

    /**
     * Read holder state back out of drawn anchor points. `false` means the points do
     * not describe a usable frame — a click rather than a drag — and the caller should
     * leave the holder alone rather than snap it to a degenerate shape.
     */
    protected adoptAnchors(coords: Position[]): boolean {
        const frame = frameFromAnchors(coords);
        if (!frame) return false;
        this.adoptFrame(frame);
        return true;
    }

    /**
     * How far off its own axis this graphic's third anchor point sits, and on which
     * side. Overridden by the holders whose symbol has a reach.
     */
    protected anchorReach(): {offset?: number; side: number} {
        return {side: this.mirrored ? -1 : 1};
    }

    /** Takes center, length and bearing from anchor points the user drew. */
    protected adoptFrame(frame: DrawnFrame): void {
        this.center = fromLonLat(frame.center as Coordinate);
        this.rotation = (frame.angle * 180) / Math.PI;
        this.updateGeom({size: frame.size});
    }
}

export class CircularAreaGraphicBase extends MissionTaskGraphicBase {
    graphicLabels: GraphicLabels = {label: ''};

    constructor(
        name: TacticalGraphicName,
        size: number,
        drawingResolution?: number,
    ) {
        super(name, size, drawingResolution);

        // Amplifiers come off the feature, so this needs no closure.
        this.label.setStyle(getAreaLabelStylesFn(name));

        if (
            name === TacticalGraphicName.FreeFireAreaCircular ||
            name === TacticalGraphicName.RestrictiveFireAreaCircular ||
            name === TacticalGraphicName.PositionAreaArtilleryCircular ||
            name === TacticalGraphicName.AirSpaceCoordinationAreaCircular
        ) {
            this.graphic.setStyle(freeFireAreaCircularStyleFunc());
        }
        // NoFireAreaCircular gets the always-hatched LimitedAccessArea fill.
        //
        // `CircularArea` emits its outline as a MultiLineString — a ring with no
        // declared interior — so a hatch applied to it has nothing to fill. That
        // coercion used to happen here, which meant it existed for OpenLayers and
        // not for any other renderer; it now lives in `limitedAccessAreaPaint`
        // (`fillableGeometry`), so both engines close the ring the same way.
        if (name === TacticalGraphicName.NoFireAreaCircular) {
            this.graphic.setStyle(limitedAccessAreaStyleFunc);
        }

        writeGraphicProperties(this.getFeatures(), name, this.graphicLabels);
    }

    setLabel = (labels: GraphicLabels) => {
        this.graphicLabels = labels;
        // Stamping fires a `change` event on each feature, which re-renders them.
        // Geometry inputs travel with the amplifiers — a bare write drops them.
        writeGraphicProperties(this.getFeatures(), this.name, labels, {radius: this.size, rotation: this.rotation});
    };


}

/**
 * Turn — the one mission task with a third shape input, `bend`.
 *
 * `bend` is how sharp the turn is, a signed multiple of `size`. Being unitless
 * it survives a resize, which is the point: the user sets the sharpness once
 * and stretching the curve does not undo it.
 *
 * The arrowhead is sized in **flat meters off the drawing resolution**, not as
 * a fraction of `size`, for the same reason — it holds its size while the curve
 * is resized, and grows with the world on zoom-in like any baked geometry. The
 * "T" is the opposite: it uses the default zoom-anchored label scale, capped to
 * [0.3, 1.5], so it stays legible without ever running away.
 */
export class TurnGraphicBase extends MissionTaskGraphicBase {
    /** @see TURN_DEFAULT_BEND */
    bend: number = TURN_DEFAULT_BEND;

    /**
     * Restore's way in to the curve's sharpness, clamped by *this* family's rule.
     *
     * Persistence used to reach for `bend` behind an `instanceof TurnGraphicBase`
     * check, which quietly skipped `EnvelopmentGraphicBase` — it is a sibling, not a
     * subclass — so a saved envelopment came back at the default sharpness however it
     * was drawn. The clamps genuinely differ between the two, so the setter is virtual
     * rather than the field being read directly.
     */
    setBend(value: number): void {
        this.bend = clampTurnBend(value);
    }
    /**
     * Arrowhead size in meters. Seeded from the drawing resolution and then **stamped**,
     * because a restore no longer has that resolution to rebuild it from — the snapshot
     * carries the derived distance instead. @see persistedGeometryState
     */
    headSize: number;

    constructor(name: TacticalGraphicName, size: number, drawingResolution?: number) {
        super(name, size, drawingResolution);
        this.headSize = arrowheadMeters(name, drawingResolution ?? 1) ?? 0;
    }

    protected generatorOptions(): Record<string, unknown> {
        return {bend: this.bend, headSize: this.headSize, labelGap: TURN_LABEL_GAP_METERS};
    }

    protected persistedGeometryState(): GraphicGeometryState {
        // `headSize` used to be omitted, on the grounds that a restore rebuilt it from
        // the `renderer` bag's `drawingResolution`. That bag is gone, so it has to travel
        // as what it is — a distance in meters. `bend` is portable either way: a Cesium
        // view would need it to draw the same curve.
        return {bend: this.bend, decorationSize: this.headSize};
    }

    /**
     * Drags one of Turn's two shape handles.
     *
     * Reached through `MissionTaskController.handleBandResize`, the manager's
     * hook for "this graphic's handles are not interchangeable — hand the
     * grabbed one the raw cursor". The range fans got there first, hence the
     * name; the mechanism is general and this is the second user. A resize drag
     * that starts on the *graphic* rather than on a handle still scales the
     * whole thing, because the manager only routes here when a handle set was
     * grabbed (`activeHandleIndex >= 0`).
     *
     * Index order is `Turn.generateHandles`' contract — `[bend, arrowTip]`,
     * the center having been split off onto the inert feature by
     * `publishHandles`, which preserves order.
     */
    setBandRange(handleIndex: number, coordinate: Coordinate): void {
        const center = this.centerCoordinate();
        if (!center || this.size <= 0) return;
        const dx = coordinate[0] - center[0];
        const dy = coordinate[1] - center[1];

        if (handleIndex === TURN_TIP_HANDLE) {
            // The tip is the far end of the chord, so the cursor gives both of
            // the chord's inputs directly: how long it is and which way it
            // points. `bend` is unitless and rides along unchanged.
            const reach = Math.hypot(dx, dy);
            if (reach <= 0) return;
            this.rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
            this.updateGeom({size: reach});
            return;
        }

        // Bend: the cursor's signed perpendicular distance from the chord, over
        // `size` — so the handle tracks the pointer exactly, and dragging
        // across the chord flips which way the turn bends. Chord direction from
        // `rotation` (planar degrees, 0 = east), then the clockwise
        // perpendicular, the side `bendLine` bows toward.
        const theta = (this.rotation * Math.PI) / 180;
        const perpX = Math.sin(theta);
        const perpY = -Math.cos(theta);
        this.bend = clampTurnBend((dx * perpX + dy * perpY) / this.size);
        this.updateGeometry();
    }
}

/**
 * Envelopment — the same point-anchored model as Turn, with `bend` standing for
 * the half circle's radius rather than a curve's depth.
 *
 * @see Envelopment in the core library for why the circle is derived from the
 * approach rather than drawn: it is what puts the arrowhead on the line's own
 * continuation and stops the user assembling the circle wrong.
 */
export class EnvelopmentGraphicBase extends MissionTaskGraphicBase {
    /** @see ENVELOPMENT_DEFAULT_BEND */
    bend: number = ENVELOPMENT_DEFAULT_BEND;

    /** @see TurnGraphicBase.setBend — the same hook, this family's clamp. */
    setBend(value: number): void {
        this.bend = clampEnvelopmentBend(value);
    }

    /**
     * APP-06 343500's four points: the run, then the semicircle's two feet, then the
     * flank it bulges to.
     *
     * `bend` is a signed multiple of the half-length, so the arc's radius is
     * `|bend| x size` and its sign is the side. Writing the points out here is what
     * makes the saved base self-describing — the diameter is on the geometry, not
     * inferred from an amplifier a foreign reader would have to know about.
     */
    protected anchorPoints(): Position[] {
        const bend = clampEnvelopmentBend(this.bend);
        return anchorsForRunAndArc(
            toLonLat(this.center) as Position,
            this.size,
            Math.abs(bend) * this.size,
            this.rotation,
            Math.sign(bend) || 1,
        );
    }

    /**
     * The exact inverse. Sets the bend as well as the run, so a graphic restored or
     * imported from anchor points comes back with the arc it was saved with rather than
     * the family default.
     */
    protected adoptAnchors(coords: Position[]): boolean {
        const frame = runAndArcFromAnchors(coords);
        if (!frame) return false;
        if (frame.radius !== undefined && frame.size > 0) {
            this.bend = clampEnvelopmentBend((frame.radius / frame.size) * frame.side);
        }
        this.center = fromLonLat(frame.center as Coordinate);
        this.rotation = (frame.angle * 180) / Math.PI;
        this.updateGeom({size: frame.size});
        return true;
    }
    /** Arrowhead size in meters — stamped, not re-derived. @see TurnGraphicBase.headSize */
    headSize: number;

    constructor(name: TacticalGraphicName, size: number, drawingResolution?: number) {
        super(name, size, drawingResolution);
        this.headSize = arrowheadMeters(name, drawingResolution ?? 1) ?? 0;
        // The "E" lies along the approach rather than standing upright on the
        // screen. The rotation has to be read per render, not baked in here:
        // `this.rotation` changes every time the line-end handle is dragged, and
        // the closure keeps the style honest because the label feature's geometry
        // is re-set on the same update, which is what triggers the redraw.
        this.label.setStyle((feature, resolution) =>
            getMissionTaskStyleFn(name, this.projectedRotation)(feature, resolution));

        // `updateGeometry` is an arrow property on the base, not a method, so it
        // cannot be overridden — wrap it instead. Every path that rebuilds the
        // graphic goes through it, so the label is re-anchored on draw, resize,
        // rotate, translate and both handle drags alike.
        const rebuild = this.updateGeometry;
        this.updateGeometry = () => {
            rebuild();
            this.reanchorLabel();
        };
    }

    /** The approach's bearing **as drawn**, in OpenLayers' clockwise radians. */
    private projectedRotation = 0;

    /**
     * Re-anchors the "E" onto the line the renderer actually draws.
     *
     * The generator works in EPSG:4326 and the renderer in EPSG:3857, whose y is
     * **not** linear in latitude — so a label the generator places exactly on its
     * axis lands slightly off the straight segment drawn between that axis's
     * reprojected endpoints. It measured 3.5 km off a 4739 km run, which is a
     * fraction of a pixel zoomed out and grows linearly as you zoom in: the "E"
     * visibly drifts off the line. Nothing was moving; the error was there all
     * along and only zoom made it legible.
     *
     * Both the anchor and the rotation are therefore taken from the projected
     * segment. 0.25 is the same fraction `envelopmentGraphicStyleFunc` opens its
     * gap at, measured on the same coordinates, so the letter and its hole cannot
     * drift apart at any zoom.
     */
    private reanchorLabel = (): void => {
        const geom = this.graphic.getGeometry();
        if (!(geom instanceof MultiLineString)) return;
        const run = geom.getCoordinates()[0];
        if (!run || run.length < 2) return;
        const [a, b] = [run[0], run[run.length - 1]];
        this.label.setGeometry(new Point([a[0] + (b[0] - a[0]) * 0.25, a[1] + (b[1] - a[1]) * 0.25]));

        // Upright rule, as `getRotation` applies to the retrograde labels: flip
        // through 180° when the approach points left so the "E" is never inverted.
        let r = -Math.atan2(b[1] - a[1], b[0] - a[0]);
        if (r > Math.PI / 2 || r < -Math.PI / 2) r += Math.PI;
        if (r > Math.PI) r -= 2 * Math.PI;
        this.projectedRotation = r;
    };

    protected generatorOptions(): Record<string, unknown> {
        return {bend: this.bend, headSize: this.headSize};
    }

    protected persistedGeometryState(): GraphicGeometryState {
        // `headSize` is derived from `drawingResolution`, which the renderer bag
        // already carries. `bend` is portable — it is the shape, not a rendering
        // choice, and another view would need it to draw the same hook.
        return {bend: this.bend, decorationSize: this.headSize};
    }

    /**
     * Drags one of Envelopment's two shape handles, in the order
     * `Envelopment.generateHandles` emits them: `[arrowTip, lineEnd]`, the center
     * having been split onto the inert feature by `publishHandles`.
     */
    setBandRange(handleIndex: number, coordinate: Coordinate): void {
        const center = this.centerCoordinate();
        if (!center || this.size <= 0) return;
        const dx = coordinate[0] - center[0];
        const dy = coordinate[1] - center[1];

        if (handleIndex === ENVELOPMENT_LINE_HANDLE) {
            // The line's end carries both of the approach's inputs: how long it
            // runs and which way it points. `bend` is unitless and rides along,
            // so the circle keeps its proportion through a resize.
            const reach = Math.hypot(dx, dy);
            if (reach <= 0) return;
            this.rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
            this.updateGeom({size: reach});
            return;
        }

        // Arrow tip. It sits at `size + 2 * radius` along the approach and
        // nothing off it, so — unlike Turn's bend handle — the perpendicular
        // offset cannot carry the radius. The two components split the job:
        // distance *along* the axis past the line's end is the circle's
        // diameter, and the side the cursor strays to picks the flank.
        const theta = (this.rotation * Math.PI) / 180;
        const along = dx * Math.cos(theta) + dy * Math.sin(theta);
        const perp = dx * -Math.sin(theta) + dy * Math.cos(theta);

        // The rule itself is the library's, so both renderers bend this graphic by the
        // same arithmetic rather than by two copies of it. @see envelopmentBendFrom
        this.bend = envelopmentBendFrom(along, perp, this.size, this.bend);
        this.updateGeometry();
    }
}

/**
 * Pursuit — a straight line with a half-circle hook on its end.
 *
 * APP-06 344000 draws it from three points, and the third of them is the arrowhead's
 * tip. The one thing this holder carries that the others do not is `lineRatio`: the
 * drawn form lets the straight line be any length relative to the hook, where the
 * dropped form fixed it at 2.4 radii, and without somewhere to keep it the next
 * regeneration would quietly snap a hand-drawn line back to that constant.
 *
 * @see Pursuit in the core library for the shape, and core/anchors.ts for the points.
 */
export class PursuitGraphicBase extends MissionTaskGraphicBase {
    /** The straight line's length as a multiple of the hook's radius. */
    private lineRatio = HOOK_DEFAULT_LINE_RATIO;

    protected anchorPoints(): Position[] {
        return anchorsForHook(
            toLonLat(this.center) as Position,
            this.size,
            this.rotation,
            this.mirrored ? -1 : 1,
            this.lineRatio,
        );
    }

    protected adoptAnchors(coords: Position[]): boolean {
        const frame = hookFromAnchors(coords);
        if (!frame) return false;

        // Every one of these is the library's answer, not this holder's: which drawn
        // point carries the aim, and which way round "mirrored" runs. @see hookPose
        const pose = hookPose(frame);
        this.center = fromLonLat(pose.center as Coordinate);
        this.rotation = pose.rotationDegrees;
        this.mirrored = pose.side < 0;
        this.lineRatio = pose.lineRatio;
        this.updateGeom({size: pose.radius});
        return true;
    }
}
