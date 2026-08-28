import {Coordinate} from 'ol/coordinate';
import {Feature} from 'ol';
import {LineString, MultiPoint, Point, Polygon} from 'ol/geom';
import {fromLonLat, toLonLat} from 'ol/proj';
import type {Position} from 'geojson';
import {
    RECTANGLE_DEFAULT_HALF_WIDTH_PX,
    TacticalGraphicName,
    carriesRectangleLength,
    constrainRectangleAxis,
    groundLength,
    levelRectangleAxis,
    latitudeFromMercatorY,
} from '@zaes/tactical-graphics';
import {
    createBaseFeature,
    createHandleFeature,
    createMeasureFeature,
    createOffsetHandleFeature,
    getAreaLabelStylesFn,
    getStyle,
} from '../openlayerStyles';
import {LineGraphic} from '../controllers/LineGraphicController';
import openlayersAdapter from '../openlayersAdapter';
import {GraphicLabels} from '../../../utils/graphicLinkRegistry';
import {assignRole, writeGraphicProperties} from '../graphicProperties';

/**
 * # The eighteen rectangular zones — two anchor points and a width
 *
 * > This symbol requires two anchor points and a width, defined in metres, to define the
 * > boundary of the area. Points 1 and 2 will be located in the centre of two opposing
 * > sides of the rectangle. (APP-06 240202, and seventeen more in the same words)
 *
 * So the **base is the axis** — a two-point `LineString` — and the width is an amplifier.
 * `AreaGraphicBase` still holds every other area, whose base *is* its drawn outline; this
 * one exists because a rectangle's outline is derived and its base is not an outline at
 * all.
 *
 * ## What that buys, and what it replaced
 *
 * The user dragged a box before. It produced the same picture and three things followed:
 *
 * - **The width could be read but not dragged.** It was measured off the ring, so the only
 *   way to change it was to type a number into the dialog or scale the whole zone.
 * - **The zone could not be turned.** Every dimension came off the *projected bounding
 *   box*, so a rotate had nothing to act on and `setRectangleWidth` could only stretch
 *   north-south.
 * - **Points 1 and 2 existed nowhere**, so a snapshot could not state the symbol the way
 *   the standard defines it.
 *
 * Now the two points are the base's own vertices — `Modify` drags them, which sets the
 * length and the orientation together — and the third handle is the width, on the `offset`
 * role the corridors already use. (User's call, 2026-08-27.)
 *
 * **The labels are untouched.** They read `polygonRing` and the four `polygon*` extents,
 * which are stamped here exactly as they were, from the **built rectangle** rather than
 * from the base. That is the one thing that had to change and the one thing that must not
 * show.
 */
export class RectangularAreaGraphicBase implements LineGraphic {
    base: Feature<LineString> = <Feature<LineString>>createBaseFeature();
    graphic: Feature = assignRole(new Feature(), 'graphic');
    labels: Feature = assignRole(new Feature(), 'label');
    handles: Feature<MultiPoint> = <Feature<MultiPoint>>createHandleFeature();
    /**
     * The width handle, in a feature of its own.
     *
     * **Not a third point in `handles`.** The manager routes a width drag by asking which
     * *feature* was grabbed — `offsetHandler` — and everything in the handles feature goes
     * to the reshape path, where `nearestBaseVertexIndex` answers with the nearest base
     * vertex however far away it is. A drag on the width handle therefore moved point 2:
     * measured, it took 2,300 km off the length and changed the width by nothing. The
     * mirror handles sit apart for exactly this reason. @see createOffsetHandleFeature
     */
    offsetHandle: Feature = <Feature>createOffsetHandleFeature();
    /** The live width read-out. Empty unless a gesture is in progress. @see showMeasure */
    measure: Feature = createMeasureFeature();
    symbolId: string = '';

    graphicLabels: GraphicLabels = {label: ''};
    graphicName: TacticalGraphicName;

    /**
     * Half the width, in **ground** metres — the generators' own unit.
     *
     * `toGraphicOptions` halves the public `width` on the way into a generator, so this is
     * the same quantity a corridor's `radius` is, and the same quantity the `offset` drag
     * hands to {@link setOffset}.
     */
    private halfWidth: number;

    /**
     * The handle sits exactly one half-width off the axis, so a width drag has to track
     * the cursor 1:1. @see handleContract, which states the same number in the portable
     * half so MapLibre reads it too.
     */
    offsetScale = 1;

    /**
     * @param drawingResolution projected metres per pixel — what the label scale anchors to
     * @param groundPerPixel the same figure as a **ground** distance, which is what a
     *   screen-sized default has to be spent in. They differ by 1/cos(latitude), and the
     *   width is a ground measurement. @see getController
     */
    constructor(name: TacticalGraphicName, drawingResolution: number, groundPerPixel = drawingResolution) {
        this.graphicName = name;
        // A zone drawn with two clicks carries no width yet, so it starts at a screen
        // size — the same rule every other drawn width here follows — and the operator
        // drags the third handle from there.
        this.halfWidth = RECTANGLE_DEFAULT_HALF_WIDTH_PX * (groundPerPixel > 0 ? groundPerPixel : 1);
        if (drawingResolution !== undefined) {
            this.graphic.set('drawingResolution', drawingResolution);
            this.labels.set('drawingResolution', drawingResolution);
        }
        this.labels.setStyle(getAreaLabelStylesFn(name));
        this.graphic.setStyle((feature, resolution) => getStyle(this.graphicName, feature, resolution));
        writeGraphicProperties(this.getFeatures(), name, this.graphicLabels);
    }

    getFeatures(): Feature[] {
        return [this.graphic, this.labels, this.handles, this.offsetHandle, this.measure, this.base];
    }

    getCenter = (): Coordinate => {
        const coords = this.base.getGeometry()?.getCoordinates() ?? [];
        if (coords.length < 2) return coords[0] ?? [0, 0];
        return [(coords[0][0] + coords[1][0]) / 2, (coords[0][1] + coords[1][1]) / 2];
    };

    setSymbolId = (symbolId: string) => {
        this.symbolId = symbolId;
        this.labels.set('symbolId', this.symbolId);
        this.graphic.set('symbolId', this.symbolId);
        this.base.set('symbolId', this.symbolId);
    };

    /** The width a drag or a restore sets, as a half-width in ground metres. */
    setOffset(halfWidth: number): void {
        if (!(halfWidth > 0)) return;
        this.halfWidth = halfWidth;
        this.setBaseFeature(this.base);
    }

    /** What the manager latches at pointer-down, so a drag is a delta. @see setOffset */
    currentOffset(): number {
        return this.halfWidth;
    }

    /**
     * The scalar a **resize** scales along with the axis.
     *
     * `LineGraphicController.handleResize` reads this and multiplies it by the same delta
     * it applies to the base, so the rectangle grows as a rectangle. Without it the axis
     * lengthened and the width stayed put — the zone got longer and thinner, which is a
     * different shape rather than a bigger one, and it is exactly what a cross-engine
     * comparison caught: 360 km against MapLibre's 460 for the same drag.
     * @see currentDecorationSize
     */
    graphicSize(): number {
        return this.halfWidth;
    }

    setLabel = (labels: GraphicLabels) => {
        // A width typed into the dialog restretches the rectangle, and a width the holder
        // itself just published must not read as an edit and loop. A metre of slack: the
        // amplifier is stamped rounded. @see publishWidth
        const typed = Number(labels.width);
        if (labels.width !== undefined && Number.isFinite(typed) && typed > 0
            && Math.abs(typed - this.widthAmplifier()) > 1) {
            this.graphicLabels = labels;
            this.halfWidth = typed / 2;
            this.setBaseFeature(this.base);
            return;
        }
        this.graphicLabels = labels;
        writeGraphicProperties(this.getFeatures(), this.graphicName, labels);
    };

    setBaseFeature(base: Feature<LineString>): void {
        if (!base) return;

        /*
         * **Dragging an anchor point changes the length, not the orientation.**
         *
         * `Modify` moves a base vertex freely, so a drag meant to lengthen the zone also
         * swung it — and there was then no way to change the length *without* risking a
         * turn. Rotating is the rotate gesture's job. The rule is in the map-agnostic
         * half so MapLibre's vertex drag obeys the same one, and it recognises the case
         * by the only thing visible at this level: exactly one endpoint moved.
         * @see constrainRectangleAxis
         */
        // **The remembered axis, not the base's own coordinates.** OpenLayers' `Modify`
        // mutates the base geometry *in place*, so by the time this runs the "previous"
        // read off `this.base` is already the dragged one and nothing looks moved.
        const previous = this.lastAxis;
        const incoming = base.getGeometry()?.getCoordinates();
        /*
         * **Level while drawing, held to its own axis while editing.**
         *
         * `LineGraphicController` republishes the base on every pointer move, so this is
         * also the preview — and the preview followed the mouse in any direction while
         * the committed geometry came out level, which is a symbol that changes shape at
         * the moment of the last click. Levelling here makes the two the same thing.
         * (User's call, 2026-08-27.) @see levelRectangleAxis, constrainRectangleAxis
         */
        if (incoming?.length === 2 && !this.rotating) {
            const lonLat = incoming.map(c => toLonLat(c)) as Position[];
            const held = this.drawing
                ? levelRectangleAxis(lonLat)
                : previous?.length === 2 ? constrainRectangleAxis(previous, lonLat) : lonLat;
            base = new Feature(new LineString(held.map(c => fromLonLat(c as Coordinate))));
        }

        this.base.setGeometry(base.getGeometry());
        this.lastAxis = (this.base.getGeometry()?.getCoordinates() ?? []).map(c => toLonLat(c)) as Position[];

        const built = openlayersAdapter.getTacticalGraphic(
            this.graphicName,
            this.base,
            {radius: this.halfWidth},
        );
        if (!built) return;
        const {graphic, handles, labels} = built;

        this.graphic.setGeometry(graphic);
        this.labels.setGeometry(labels as Point);

        // `[point 1, point 2, width]` — the first two are the base's own vertices and
        // reshape, the third widens and lives apart. @see offsetHandle
        const all = (handles as MultiPoint | undefined)?.getCoordinates() ?? [];
        this.handles.setGeometry(new MultiPoint(all.slice(0, 2)));
        if (all.length >= 3) this.offsetHandle.setGeometry(new Point(all[2]));

        // **Off the built rectangle, not off the base.** Every area label paint reads
        // these — the fitted text scale, the corner a date-time group hangs from, the
        // edge midpoints the position-area symbol writes `PAA` on — and the base is now
        // an axis with no area at all. This is the whole of what the conversion owes the
        // labels, and they are otherwise untouched.
        const ring = (graphic as Polygon | undefined)?.getCoordinates?.()?.[0];
        if (ring?.length) {
            const xs = ring.map(c => c[0]);
            const ys = ring.map(c => c[1]);
            const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
            const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
            this.labels.set('polygonExtentWidth', maxX - minX);
            this.labels.set('polygonExtentHeight', maxY - minY);
            this.labels.set('polygonMinX', minX);
            this.labels.set('polygonMinY', minY);
            this.labels.set('polygonMaxX', maxX);
            this.labels.set('polygonMaxY', maxY);
            this.labels.set('polygonRing', ring);
        }

        this.publishWidth();
        // Mid-gesture the shape changes on every pointer move, so the read-out has to be
        // re-derived here rather than only when it is armed.
        this.refreshMeasure();
    }

    /** The amplifier a drag writes: whole ground metres, as the bag holds it. */
    private widthAmplifier(): number {
        return Math.round(this.halfWidth * 2);
    }

    /**
     * The length — the dimension **along** the rectangle — in ground metres.
     *
     * Only the rectangular target files one; every other rectangle takes its length from
     * the two anchor points, so filing a number there would be a figure nothing set.
     * @see carriesRectangleLength
     */
    private lengthMeters(): number {
        const coords = this.base.getGeometry()?.getCoordinates() ?? [];
        if (coords.length < 2) return 0;
        const [a, b] = [coords[0], coords[coords.length - 1]];
        return groundLength(Math.hypot(b[0] - a[0], b[1] - a[1]), latitudeFromMercatorY(a[1]));
    }

    /** Mirror the drawn dimensions into the bag, without disturbing the other amplifiers. */
    private publishWidth(): void {
        const width = this.widthAmplifier();
        const length = carriesRectangleLength(this.graphicName) ? Math.round(this.lengthMeters()) : undefined;
        if (this.graphicLabels.width === width && this.graphicLabels.length === length) return;
        this.graphicLabels = {...this.graphicLabels, width, ...(length !== undefined ? {length} : {})};
        writeGraphicProperties(this.getFeatures(), this.graphicName, this.graphicLabels);
    }

    private measuring = false;

    /**
     * True from the first click to the last, set by the factory that builds this holder.
     *
     * The axis constraint is for *editing* an existing zone: while the shape is still
     * being authored there is no axis to hold it to, and the draw's own tidy-up levels it
     * at the last moment — which moves exactly one endpoint and so reads as a length drag.
     * Measured: 6.5 degrees of tilt survived on OpenLayers and none on MapLibre, for the
     * identical two clicks.
     *
     * **Not `shapingFromGesture`**, which `LineGraphicController` also raises around a
     * vertex drag — the one case that most needs the constraint. @see polygonRect
     */
    drawing = false;

    /**
     * True for the length of a rotate, set by the factory that builds this holder.
     *
     * **A rotate turns about point 1**, so only point 2 moves — which is the very shape a
     * length drag has, and the axis constraint ate it: measured, a 30-degree rotate left
     * the zone level and cut its length from 3,420 km to 528. The gesture has to say what
     * it is; nothing about the two points afterwards can. @see polygonRect
     */
    rotating = false;

    /**
     * The axis this holder last built from, in lon/lat.
     *
     * Kept rather than read back off `this.base`, because `Modify` edits that geometry in
     * place: the object the constraint would compare against is the very one the drag has
     * already changed. @see setBaseFeature
     */
    private lastAxis?: Position[];

    /** @see AreaGraphicBase.showMeasure — the same read-out, on the same reasoning. */
    showMeasure(active: boolean): void {
        this.measuring = active;
        this.refreshMeasure();
    }

    /**
     * Draws the width **across the rectangle, just inside one of its short sides**.
     *
     * FM 1-02.2 table 5-24 puts its `AM` / "Width (m)" arrow down the edge, and that is
     * also the only place it can go: across the middle it runs straight through the
     * designation and the date-time group, and the hashed line and the text are then two
     * things fighting for the same pixels. (User's call, 2026-08-27.)
     *
     * Along the rectangle's own axis rather than down the projected right edge — a zone
     * can be turned now, and a vertical read-out beside a rotated shape measures nothing
     * the shape has.
     */
    private refreshMeasure(): void {
        const coords = this.base.getGeometry()?.getCoordinates() ?? [];
        if (!this.measuring || coords.length < 2) {
            this.measure.setGeometry(undefined);
            return;
        }
        const [a, b] = [coords[0], coords[coords.length - 1]];
        const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (!(span > 0)) return;

        // A short way in from point 2, so the line sits inside the rectangle rather than
        // on its edge — an edge-riding read-out reads as part of the outline.
        const t = 1 - MEASURE_INSET;
        const at: Coordinate = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        // The left normal of point 1 → point 2, one projected half-width each way.
        const half = this.halfWidth / groundLength(1, latitudeFromMercatorY(at[1]));
        const nx = (-(b[1] - a[1]) / span) * half;
        const ny = ((b[0] - a[0]) / span) * half;
        this.measure.set('measureMeters', this.halfWidth * 2);
        this.measure.setGeometry(new LineString([[at[0] - nx, at[1] - ny], [at[0] + nx, at[1] + ny]]));
    }

    /** Where the axis sits, in lon/lat — for anything that needs the portable form. */
    axisLonLat(): [number, number][] {
        return (this.base.getGeometry()?.getCoordinates() ?? []).map(c => toLonLat(c)) as [number, number][];
    }
}



/**
 * How far in from point 2 the width read-out sits, as a share of the axis.
 *
 * Enough to clear the short side and stay well away from the centred designation, which
 * is what it used to run straight through. (User's call, 2026-08-27.)
 */
const MEASURE_INSET = 0.12;
