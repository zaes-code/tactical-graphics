import {Coordinate} from "ol/coordinate";
import {MissionTaskGraphic} from "../controllers/MissionTaskController";
import {SAME_POINT_EPSILON_M} from "../controllers/LineGraphicController";
import {Feature} from "ol";
import {
    arcMissionTaskStyleFunc,
    baseDefenseZoneLabelStyleFn,
    createCenterBaseFeature,
    createFeature,
    createHandleFeature,
    createInertHandleFeature,
    crossedMissionTaskLabelStyleFn,
    crossedMissionTaskStyleFunc,
    featureLabelScale,
    fightingPositionStyleFunc,
    fontStyle,
    freeFireAreaCircularStyleFunc,
    getAreaLabelStylesFn,
    getMissionTaskStyleFn,
    getRatioLockedMissionTaskStyleFn,
    getTextWidth,
    limitedAccessAreaStyleFunc,
    turnStyleFunc,
    envelopmentGraphicStyleFunc,
} from "../openlayerStyles";
import {LineString, MultiLineString, MultiPoint, Point, Polygon} from "ol/geom";
import openlayersAdapter from "../openlayersAdapter";

import {
    clampEnvelopmentBend,
    clampTurnBend,
    ENVELOPMENT_DEFAULT_BEND,
    getLabel,
    TacticalGraphicName,
    TURN_DEFAULT_BEND,
} from '@zaes/tactical-graphics';

/**
 * Turn's arrowhead length in screen pixels at the drawing zoom. Baked into
 * metres once, so it neither follows a resize nor stays pinned to the screen.
 */
const TURN_ARROWHEAD_PX = 26;
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
const TURN_LABEL_GAP_METRES = 0;
/** Index of the arrowhead-tip handle in `Turn.generateHandles`' output. */
const TURN_TIP_HANDLE = 1;

/** Envelopment's arrowhead length in screen pixels at the drawing zoom. @see TURN_ARROWHEAD_PX */
const ENVELOPMENT_ARROWHEAD_PX = 22;
/** Index of the line-end handle in `Envelopment.generateHandles`' output. */
const ENVELOPMENT_TIP_HANDLE = 1;

/**
 * The four tactical mission tasks FM 1-02.2 draws as two straight lines crossing
 * at a one-letter label. They share one generator (`CrossedMissionTask`) and one
 * style function, which needs the name to know which arm is hashed and which
 * ends carry arrowheads.
 */
const CROSSED_MISSION_TASKS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.Destroy,
    TacticalGraphicName.Interdict,
    TacticalGraphicName.Neutralize,
    TacticalGraphicName.Suppress,
];

/**
 * Mission-task graphics whose label scales with the graphic rather than with
 * the zoom — the block-family treatment: 24 px base font, scale off
 * `graphicSize`.
 *
 * **Turn is deliberately absent.** Its "T" has to hold its size while the curve
 * is resized and stay capped on zoom, which is exactly what the default
 * `getMissionTaskStyleFn` (`featureLabelScale`, clamped to [0.3, 1.5]) already
 * does. Adding it here would make the letter track the curve instead.
 */
const RATIO_LOCKED_MISSION_TASKS: Set<TacticalGraphicName> = new Set([
    TacticalGraphicName.Contain,
    TacticalGraphicName.Control,
    TacticalGraphicName.Isolate,
    // The other three arc-and-arrowhead circles. Their letters used to render at
    // the zoom-anchored 16px default while Isolate's "I" tracked its circle, so
    // four graphics built from the same arcs disagreed about how big a one-letter
    // label is. Same treatment now: 24px base font, scale from `graphicSize`,
    // and the 100px-diameter floor.
    TacticalGraphicName.Occupy,
    TacticalGraphicName.Retain,
    TacticalGraphicName.Secure,
    // The crossed-line tasks, for the 24px font. Their scale does not actually
    // come from here — `crossedMissionTaskLabelStyleFn` overrides this entry
    // with a constant, because the whole symbol is pinned to a fixed screen
    // size — but leaving them in keeps the family's font literal in one place.
    ...CROSSED_MISSION_TASKS,
]);

/**
 * Graphics whose `size` is floored so the symbol is recognisable from the first
 * cursor move. A superset of the ratio-locked set — Turn takes the floor
 * without taking the label treatment.
 */
const MIN_SIZED_MISSION_TASKS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.Contain,
    TacticalGraphicName.Control,
    TacticalGraphicName.Isolate,
    TacticalGraphicName.Occupy,
    TacticalGraphicName.Retain,
    TacticalGraphicName.Secure,
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
import {Stroke, Style} from "ol/style";
import {LINE_WIDTH, readHostilityColor} from "../openlayerStyles";
import {assignRole, GraphicGeometryState, readGraphicLabels, writeGraphicProperties} from "../graphicProperties";

export class MissionTaskGraphicBase implements MissionTaskGraphic {
    center: Coordinate = [0, 0];
    /**
     * The centre the graphic is built around, and — since it is now published from
     * `getFeatures()` — the only part of a mission task that has to survive a save.
     * Everything else regenerates from it plus `size` / `rotation`.
     *
     * `base` is deliberately left **false**. That flag means "has vertices the Modify
     * interaction may drag" (`getRenderedFeaturesByProp('base')`), which a
     * point-anchored graphic does not: it is reshaped by rotate / resize / translate.
     * Same trick as `mobileDefense` in `controllerRegistry.ts`. The `role` tag, not
     * this flag, is what identifies the feature when serialising.
     */
    base: Feature<Point> = createCenterBaseFeature();
    rotation: number = 0;
    size: number;
    symbolId: string = '';

    handles: Feature<MultiPoint> = <Feature<MultiPoint>>createHandleFeature();
    /** The centre dot — visual anchor only. @see publishHandles */
    centerHandle: Feature<MultiPoint> = <Feature<MultiPoint>>createInertHandleFeature();
    graphic: Feature = createFeature();
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
            this.graphic.setStyle(fightingPositionStyleFunc());
        }
        // The crossed-line tasks draw their own arms so the gap for the centre
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
        if (name === TacticalGraphicName.Envelopment) {
            this.graphic.setStyle(envelopmentGraphicStyleFunc());
        }
        // MovementToContact: shift the zigzag "contact" side arrows outward so
        // they don't touch the big arrow's arrowhead edge. B→A
        // (upperPath[1]→upperPath[0]) is the upper edge — its CCW perpendicular
        // points outward; I→A (lowerPath[2]→lowerPath[3]) is the lower edge —
        // its CW perpendicular points outward.
        //
        // The offset is a fraction of the arrow's own half-length, NOT the
        // `n * resolution` screen-pixel form used elsewhere in this file. Both are
        // "zoom-invariant", but in different frames, and here the pixel form was
        // the wrong one: the arrow is baked in metres, so a constant *screen*
        // offset slid the side arrows toward the arrowhead on zoom-in and away
        // from it on zoom-out. Deriving it from the geometry locks it to the
        // graphic under zoom and resize alike.
        //
        // `n * resolution` is right for things that must stay a fixed size on
        // screen — text gaps, label padding. It is wrong for anything that must
        // hold station against the geometry around it.
        //   MultiLineString layout (see MovementToContact.generateGraphics):
        //     [0] upperPath, [1] lowerPath,
        //     [2] upper zigzag line, [3] upper zigzag arrowhead,
        //     [4] lower zigzag line, [5] lower zigzag arrowhead.
        // Pursuit: split the horizontal line around its midpoint so the "P"
        // label always has breathing room. Gap width is derived from the
        // actual rendered text width at the current zoom (zoom-invariant on
        // screen). Other sub-lines (arc, arrowhead, crossbar) render as-is.
        //   MultiLineString layout (see Pursuit.generateGraphics):
        //     [0] horizontal line, [1] semicircle arc,
        //     [2] arrowhead, [3] perpendicular crossbar.
        if (name === TacticalGraphicName.Pursuit) {
            this.graphic.setStyle((feature, resolution) => {
                const geom = feature.getGeometry() as MultiLineString;
                if (!geom) return [];
                const lines = geom.getCoordinates();
                const color = readHostilityColor(feature);
                const stroke = new Stroke({color, width: LINE_WIDTH()});

                const styles: Style[] = [];
                const horiz = lines[0];
                if (horiz && horiz.length === 2) {
                    const [a, b] = horiz;
                    const mid: Coordinate = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
                    const dx = b[0] - a[0], dy = b[1] - a[1];
                    const len = Math.hypot(dx, dy);
                    const scale = featureLabelScale(feature, resolution);
                    // Measured width of 'P' (screen px) + 4px padding each side,
                    // then converted to map units by × resolution so the gap
                    // matches the rendered glyph at every zoom.
                    const pWidthPx = getTextWidth(getLabel(name), fontStyle, scale);
                    const gapHalf = (pWidthPx / 2 + 4) * resolution;
                    if (len > 2 * gapHalf) {
                        const ux = dx / len, uy = dy / len;
                        const gapA: Coordinate = [mid[0] - ux * gapHalf, mid[1] - uy * gapHalf];
                        const gapB: Coordinate = [mid[0] + ux * gapHalf, mid[1] + uy * gapHalf];
                        styles.push(new Style({geometry: new LineString([a, gapA]), stroke}));
                        styles.push(new Style({geometry: new LineString([gapB, b]), stroke}));
                    } else {
                        // Line is shorter than the label — don't split; render whole.
                        styles.push(new Style({geometry: new LineString(horiz), stroke}));
                    }
                }
                // Render the remaining sub-lines (arc, arrowhead, crossbar) as-is.
                for (let i = 1; i < lines.length; i++) {
                    styles.push(new Style({geometry: new LineString(lines[i]), stroke}));
                }
                return styles;
            });
        }
        if (name === TacticalGraphicName.MovementToContact) {
            // `_resolution` is deliberately unused: everything this style draws is
            // proportional to the graphic, so nothing here may depend on the zoom.
            // Reaching for it again is the bug this function used to have.
            this.graphic.setStyle((feature, _resolution) => {
                const geom = feature.getGeometry() as MultiLineString;
                if (!geom) return [];
                const rawLines = geom.getCoordinates();
                const defaultColor = readHostilityColor(feature);

                // Recover the arrow's half-length `r` from the geometry. The tip A
                // sits at local(+r, 0) and the two tail-fin tips E/F at
                // local(-r, ±0.5r), so A and the E–F midpoint are exactly 2r apart
                // — no stamped `graphicSize` needed, and it follows a resize for
                // free. Plain Euclidean math: these are projected EPSG:3857 metres,
                // so turf must not be used here.
                const A = rawLines[0]?.[0];
                const E = rawLines[0]?.[3];
                const F = rawLines[1]?.[0];
                let GAP = 0;
                if (A && E && F) {
                    const midEF = [(E[0] + F[0]) / 2, (E[1] + F[1]) / 2];
                    const r = Math.hypot(A[0] - midEF[0], A[1] - midEF[1]) / 2;
                    GAP = SIDE_ARROW_GAP_RATIO * r;
                }
                const perpShift = (
                    edgeStart: number[],
                    edgeEnd: number[],
                    ccw: boolean,
                ): [number, number] => {
                    const dx = edgeEnd[0] - edgeStart[0];
                    const dy = edgeEnd[1] - edgeStart[1];
                    const len = Math.hypot(dx, dy);
                    if (len === 0) return [0, 0];
                    const sign = ccw ? 1 : -1;
                    return [sign * -dy / len * GAP, sign * dx / len * GAP];
                };
                const [uDx, uDy] = (rawLines[0]?.length >= 2)
                    ? perpShift(rawLines[0][1], rawLines[0][0], true)
                    : [0, 0];
                const [lDx, lDy] = (rawLines[1]?.length >= 4)
                    ? perpShift(rawLines[1][2], rawLines[1][3], false)
                    : [0, 0];
                const shift = (line: number[][], dx: number, dy: number): number[][] =>
                    line.map(pt => [pt[0] + dx, pt[1] + dy]);
                const lines = rawLines.map((line, i) => {
                    if (i === 2 || i === 3) return shift(line, uDx, uDy);
                    if (i === 4 || i === 5) return shift(line, lDx, lDy);
                    return line;
                });

                return lines.map((line) => new Style({
                    geometry: new LineString(line),
                    stroke: new Stroke({color: defaultColor, width: LINE_WIDTH()}),
                }));
            });
        }
        // The arc circles draw their own line work so the gap for the letter can
        // be measured off the glyph instead of being a fixed slice of the circle.
        if (ARC_GAP_MISSION_TASKS.includes(name)) {
            this.graphic.setStyle(arcMissionTaskStyleFunc(name, RATIO_LOCKED_MISSION_TASKS.has(name)));
        }
        this.label.setStyle((feature, resolution) => {
            return getMissionTaskStyleFn(getLabel(name))(feature, resolution);
        })
        // BaseDefenseZone uses a hardcoded "BDZ" label whose scale tracks
        // the circle's radius rather than the zoom-anchored
        // featureLabelScale. Override the default mission-task label style
        // for it; the radius is stamped on the label feature in
        // updateGeometry as `graphicSize`.
        if (name === TacticalGraphicName.BaseDefenseZone) {
            this.label.setStyle(baseDefenseZoneLabelStyleFn());
        }
        // Contain and Control share the ratio-locked block-family treatment:
        // 24px base font, label scales with the circle, and a 100px-diameter
        // minimum size enforced in updateGeom so the graphic is recognisable
        // from the first click.
        if (RATIO_LOCKED_MISSION_TASKS.has(name)) {
            this.label.setStyle((feature, resolution) =>
                getRatioLockedMissionTaskStyleFn(getLabel(name))(feature, resolution)
            );
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
            {size: this.size, rotation: this.rotation, ...this.generatorOptions()}
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
        // The projected centre, for styles that scale the symbol about it. It
        // cannot be recovered from the geometry: the generator walks out
        // geodesically and Mercator does not preserve the midpoint.
        const centre = this.base.getGeometry()?.getCoordinates();
        if (centre) this.graphic.set('graphicCenter', centre);
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
     * Splits the generator's handle set into the draggable ones and the centre,
     * which is published on a separate grey `inert` feature that
     * `TacticalGraphicsManager.handleDownEvent` refuses to start a drag from.
     *
     * The centre is worse than useless as a drag origin: `handleResize` scales by
     * `distanceToCentre(cursor) / distanceToCentre(lastPointer)`, and both are
     * ~0 there, so a nudge on the centre dot used to blow `size` up by twenty
     * orders of magnitude.
     *
     * **Matches on position, not index** — the same rule as `visiblePathHandles`.
     * Generators do not agree on an order: the MissionTask convention is
     * `[edge, center]` but the range fans emit `[center, rim]`. "Is this handle
     * on the base point" is the only stable test, and it costs nothing to be
     * right for a generator that emits no centre handle at all (Ambush, Pursuit).
     *
     * Never leaves the draggable set empty: a generator whose handles all sit on
     * the centre keeps them, so the graphic cannot end up with nothing to grab.
     */
    protected publishHandles(handles: MultiPoint): void {
        const coords = handles.getCoordinates();
        const center = this.base.getGeometry()?.getCoordinates();
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

    getFeatures(): Feature[] {
        return [this.graphic, this.label, this.handles, this.centerHandle, this.base];
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
            size: this.size,
            rotation: this.rotation,
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
        if (MIN_SIZED_MISSION_TASKS.includes(this.name)) {
            const drawingRes = this.label.get('drawingResolution') as number | undefined;
            if (drawingRes && drawingRes > 0) {
                const minSize = RATIO_LOCKED_MIN_RADIUS_PX * drawingRes;
                if (newSize < minSize) newSize = minSize;
            }
        }
        this.size = newSize;
        this.center = center || this.center;
        this.base.getGeometry()!.setCoordinates(this.center);
        this.updateGeometry();
    }

    setSymbolId(symbolId: string) {
        this.symbolId = symbolId;
        // Every feature, not just graphic + label. A restore looks the holder up by the
        // symbolId on whichever feature it happens to hold, and the base feature is the
        // one it starts from — it used to be the one feature that never carried it.
        this.getFeatures().forEach(f => f.set('symbolId', this.symbolId));
    }

    /**
     * Adopts a new centre point.
     *
     * Used to be `this.base = base` and nothing else, which left `center` pointing at
     * the old coordinate: the next rotate or resize — neither passes a centre — would
     * read the stale `this.center` back out and snap the graphic to where it used to
     * be. Mission tasks are kept out of the Modify interaction so nothing reached this
     * in practice, but it is on the public `TacticalGraphicHandler` interface and the
     * manager calls it by symbolId.
     */
    setBaseFeature(base: Feature<Point>) {
        this.base = base;
        const coords = base.getGeometry()?.getCoordinates();
        if (!coords || coords.length < 2) return;
        this.updateGeom({center: coords as Coordinate});
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
        // CircularArea generates the outline as a MultiLineString (no interior),
        // so the style is forced onto a Polygon built from the ring so the hatch
        // pattern actually fills the circle.
        if (name === TacticalGraphicName.NoFireAreaCircular) {
            this.graphic.setStyle((feature, resolution) => {
                const style = limitedAccessAreaStyleFunc(feature, resolution);
                const geom = feature.getGeometry();
                if (geom instanceof MultiLineString) {
                    const rings = geom.getCoordinates();
                    if (rings.length > 0) style.setGeometry(new Polygon(rings));
                }
                return style;
            });
        }

        writeGraphicProperties(this.getFeatures(), name, this.graphicLabels);
    }

    setLabel = (labels: GraphicLabels) => {
        this.graphicLabels = labels;
        // Stamping fires a `change` event on each feature, which re-renders them.
        // Geometry inputs travel with the amplifiers — a bare write drops them.
        writeGraphicProperties(this.getFeatures(), this.name, labels, {size: this.size, rotation: this.rotation});
    };


}

/**
 * Turn — the one mission task with a third shape input, `bend`.
 *
 * `bend` is how sharp the turn is, a signed multiple of `size`. Being unitless
 * it survives a resize, which is the point: the user sets the sharpness once
 * and stretching the curve does not undo it.
 *
 * The arrowhead is sized in **flat metres off the drawing resolution**, not as
 * a fraction of `size`, for the same reason — it holds its size while the curve
 * is resized, and grows with the world on zoom-in like any baked geometry. The
 * "T" is the opposite: it uses the default zoom-anchored label scale, capped to
 * [0.3, 1.5], so it stays legible without ever running away.
 */
export class TurnGraphicBase extends MissionTaskGraphicBase {
    /** @see TURN_DEFAULT_BEND */
    bend: number = TURN_DEFAULT_BEND;
    private readonly headSize: number;

    constructor(name: TacticalGraphicName, size: number, drawingResolution?: number) {
        super(name, size, drawingResolution);
        this.headSize = TURN_ARROWHEAD_PX * (drawingResolution ?? 1);
    }

    protected generatorOptions(): Record<string, unknown> {
        return {bend: this.bend, headSize: this.headSize, labelGap: TURN_LABEL_GAP_METRES};
    }

    protected persistedGeometryState(): GraphicGeometryState {
        // `headSize` is deliberately absent: it is derived from
        // `drawingResolution`, which the renderer bag already carries, so a
        // restore rebuilds it through `getController(name, res)`. `bend` is
        // portable — a Cesium view would need it to draw the same curve.
        return {bend: this.bend};
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
     * the centre having been split off onto the inert feature by
     * `publishHandles`, which preserves order.
     */
    setBandRange(handleIndex: number, coordinate: Coordinate): void {
        const centre = this.base.getGeometry()?.getCoordinates();
        if (!centre || this.size <= 0) return;
        const dx = coordinate[0] - centre[0];
        const dy = coordinate[1] - centre[1];

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
    private readonly headSize: number;

    constructor(name: TacticalGraphicName, size: number, drawingResolution?: number) {
        super(name, size, drawingResolution);
        this.headSize = ENVELOPMENT_ARROWHEAD_PX * (drawingResolution ?? 1);
    }

    protected generatorOptions(): Record<string, unknown> {
        return {bend: this.bend, headSize: this.headSize};
    }

    protected persistedGeometryState(): GraphicGeometryState {
        // `headSize` is derived from `drawingResolution`, which the renderer bag
        // already carries. `bend` is portable — it is the shape, not a rendering
        // choice, and another view would need it to draw the same hook.
        return {bend: this.bend};
    }

    /**
     * Drags one of Envelopment's two shape handles, in the order
     * `Envelopment.generateHandles` emits them: `[apex, lineEnd]`, the centre
     * having been split onto the inert feature by `publishHandles`.
     */
    setBandRange(handleIndex: number, coordinate: Coordinate): void {
        const centre = this.base.getGeometry()?.getCoordinates();
        if (!centre || this.size <= 0) return;
        const dx = coordinate[0] - centre[0];
        const dy = coordinate[1] - centre[1];

        if (handleIndex === ENVELOPMENT_TIP_HANDLE) {
            // The line's end carries both of the approach's inputs: how long it
            // runs and which way it points. `bend` is unitless and rides along,
            // so the circle keeps its proportion through a resize.
            const reach = Math.hypot(dx, dy);
            if (reach <= 0) return;
            this.rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
            this.updateGeom({size: reach});
            return;
        }

        // Apex: the cursor's signed perpendicular distance from the approach,
        // over `size`. The apex sits at `(size + radius)` along the axis and
        // `radius` off it, so the perpendicular component *is* the radius —
        // which is why the handle tracks the pointer exactly, and why dragging
        // it across the approach flips which flank the envelopment sweeps.
        // CCW perpendicular, matching the generator's `angle + side * π/2`.
        const theta = (this.rotation * Math.PI) / 180;
        const perpX = -Math.sin(theta);
        const perpY = Math.cos(theta);
        this.bend = clampEnvelopmentBend((dx * perpX + dy * perpY) / this.size);
        this.updateGeometry();
    }
}