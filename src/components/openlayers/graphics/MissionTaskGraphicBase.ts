import {Coordinate} from "ol/coordinate";
import {MissionTaskGraphic} from "../controllers/MissionTaskController";
import {SAME_POINT_EPSILON_M} from "../controllers/LineGraphicController";
import {Feature} from "ol";
import {
    baseDefenseZoneLabelStyleFn,
    createCenterBaseFeature,
    createFeature,
    createHandleFeature,
    createInertHandleFeature,
    featureLabelScale,
    fightingPositionStyleFunc,
    fontStyle,
    freeFireAreaCircularStyleFunc,
    getAreaLabelStylesFn,
    getMissionTaskStyleFn,
    getRatioLockedMissionTaskStyleFn,
    getTextWidth,
    limitedAccessAreaStyleFunc,
} from "../openlayerStyles";
import {LineString, MultiLineString, MultiPoint, Point, Polygon} from "ol/geom";
import openlayersAdapter from "../openlayersAdapter";

import {getLabel, TacticalGraphicName} from '@zaes/tactical-graphics';

// Mission-task graphics that lock to a 100px-diameter minimum and use the
// ratio-locked label style. Adding a name here gives it the block-family
// label treatment + min-size enforcement.
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
]);
const RATIO_LOCKED_MIN_RADIUS_PX = 50;
/**
 * How far MovementToContact's zigzag "contact" arrows sit off the big arrow's
 * arrowhead edge, as a fraction of that arrow's half-length `r`. Expressed against
 * the graphic rather than the screen so the two stay locked together at every zoom
 * — see the note in the constructor.
 */
const SIDE_ARROW_GAP_RATIO = 0.12;
import {GraphicLabels} from "../../../utils/graphicLinkRegistry";
import {Fill, Stroke, Style} from "ol/style";
import {getDefaultLineColor, LINE_WIDTH} from "../openlayerStyles";
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
        if (name === TacticalGraphicName.AreaDefense) {
            this.graphic.setStyle((feature, resolution) => {
                let color = feature.get('hostilityColor') || getDefaultLineColor();
                return new Style({
                    fill: new Fill({color: color}),
                    stroke: new Stroke({
                        color: color,
                        width: LINE_WIDTH,
                    }),
                })
            })
        }
        if (name === TacticalGraphicName.FightingPosition) {
            this.graphic.setStyle(fightingPositionStyleFunc());
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
                const color = feature.get('hostilityColor') || getDefaultLineColor();
                const stroke = new Stroke({color, width: LINE_WIDTH});

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
                const defaultColor = feature.get('hostilityColor') || getDefaultLineColor();

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
                    stroke: new Stroke({color: defaultColor, width: LINE_WIDTH}),
                }));
            });
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
    }

    updateGeometry = () => {
        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.name,
            this.base,
            {size: this.size, rotation: this.rotation}
        );
        if (!tacticalGraphic) return;

        const {graphic, handles, labels} = tacticalGraphic;

        this.graphic.setGeometry(graphic);
        this.publishHandles(handles as MultiPoint);
        this.label.setGeometry(labels);

        // Stamp the current radius on the label feature so size-tracking
        // label styles (e.g. baseDefenseZoneLabelStyleFn) can scale text to
        // the circle without poking at the graphic feature.
        this.label.set('graphicSize', this.size);

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
            ...extra,
        });
    }

    updateGeom({size, center, rotation}: { size?: number, center?: Coordinate, rotation?: number }): void {
        this.rotation = rotation || this.rotation;
        let newSize = size || this.size;
        if (RATIO_LOCKED_MISSION_TASKS.has(this.name)) {
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