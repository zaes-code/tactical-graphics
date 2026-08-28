import {Coordinate} from 'ol/coordinate';
import {Feature} from 'ol';
import {LineString, MultiPoint, Point, Polygon} from 'ol/geom';
import {toLonLat} from 'ol/proj';
import {
    TacticalGraphicName,
    carriesRectangleLength,
    groundLength,
    latitudeFromMercatorY,
} from '@zaes/tactical-graphics';
import {createBaseFeature, createHandleFeature, createMeasureFeature, getAreaLabelStylesFn, getStyle} from '../openlayerStyles';
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
        this.halfWidth = DEFAULT_HALF_WIDTH_PX * (groundPerPixel > 0 ? groundPerPixel : 1);
        if (drawingResolution !== undefined) {
            this.graphic.set('drawingResolution', drawingResolution);
            this.labels.set('drawingResolution', drawingResolution);
        }
        this.labels.setStyle(getAreaLabelStylesFn(name));
        this.graphic.setStyle((feature, resolution) => getStyle(this.graphicName, feature, resolution));
        writeGraphicProperties(this.getFeatures(), name, this.graphicLabels);
    }

    getFeatures(): Feature[] {
        return [this.graphic, this.labels, this.handles, this.measure, this.base];
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
        this.base.setGeometry(base.getGeometry());

        const built = openlayersAdapter.getTacticalGraphic(
            this.graphicName,
            this.base,
            {radius: this.halfWidth},
        );
        if (!built) return;
        const {graphic, handles, labels} = built;

        this.graphic.setGeometry(graphic);
        this.labels.setGeometry(labels as Point);
        this.handles.setGeometry(handles as MultiPoint);

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

    /** @see AreaGraphicBase.showMeasure — the same read-out, on the same reasoning. */
    showMeasure(active: boolean): void {
        this.measuring = active;
        this.refreshMeasure();
    }

    /**
     * Draws the width **across the rectangle**, through the two anchor points' midpoint,
     * which is where FM 1-02.2 table 5-24 puts its `AM` / "Width (m)" arrow.
     *
     * Along the rectangle's own axis rather than down the projected right edge: a zone can
     * be turned now, and a vertical read-out beside a rotated shape measures nothing the
     * shape has.
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

        const mid: Coordinate = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        // The left normal of point 1 → point 2, one projected half-width each way.
        const half = this.halfWidth / groundLength(1, latitudeFromMercatorY(mid[1]));
        const nx = (-(b[1] - a[1]) / span) * half;
        const ny = ((b[0] - a[0]) / span) * half;
        this.measure.set('measureMeters', this.halfWidth * 2);
        this.measure.setGeometry(new LineString([[mid[0] - nx, mid[1] - ny], [mid[0] + nx, mid[1] + ny]]));
    }

    /** Where the axis sits, in lon/lat — for anything that needs the portable form. */
    axisLonLat(): [number, number][] {
        return (this.base.getGeometry()?.getCoordinates() ?? []).map(c => toLonLat(c)) as [number, number][];
    }
}

/**
 * Half-width a freshly drawn zone starts at, in screen pixels.
 *
 * **The same twenty the other engine spends**, which is the whole reason it is written
 * down rather than picked: `sizeDefaults` in the MapLibre adapter gives every drawn width
 * `drawingResolution × 20` per side, and a zone drawn with the identical two clicks has to
 * come out the identical size on both. Measured before they agreed: 782 km against 391.
 *
 * The operator drags the third handle from there, and a restore replays whatever they
 * left, so this only has to be grabbable at the zoom it was drawn at.
 */
const DEFAULT_HALF_WIDTH_PX = 20;
