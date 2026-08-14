import {Coordinate} from 'ol/coordinate';
import {Feature} from 'ol';
import {LineString, MultiPoint, Point, Polygon} from 'ol/geom';
import {createBaseFeature, createHandleFeature, createMeasureFeature, getAreaLabelStylesFn, getStyle} from '../openlayerStyles';
import {PolygonGraphic} from '../controllers/PolygonGraphicController';
import openlayersAdapter from '../openlayersAdapter';
import {TacticalGraphicHostility, TacticalGraphicName, isRectangular} from '@zaes/tactical-graphics';
import {toLonLat} from 'ol/proj';
import {getDistance} from 'ol/sphere';
import {GraphicLabels} from '../../../utils/graphicLinkRegistry';
import {assignRole, writeGraphicProperties} from '../graphicProperties';
import {decorationMeters} from './decorationPx';

export class AreaGraphicBase implements PolygonGraphic {
    // open layers related
    base: Feature<Polygon> = <Feature<Polygon>>createBaseFeature();
    graphic: Feature = assignRole(new Feature(), 'graphic');
    labels: Feature = assignRole(new Feature(), 'label');
    handles: Feature<MultiPoint> = <Feature<MultiPoint>>createHandleFeature();
    /** The live width read-out. Empty unless a gesture is in progress. @see showMeasure */
    measure: Feature = createMeasureFeature();
    symbolId: string = '';
    size: number = 1;

    graphicLabels: GraphicLabels = {label: ''};
    graphicName: TacticalGraphicName;

    constructor(name: TacticalGraphicName, size?: number, drawingResolution?: number) {
        this.graphicName = name;
        if (size) this.size = size;
        // Seeded from the drawing resolution; replaced by a stamped value on restore, so
        // the decoration does not get re-derived from whatever zoom the loading session
        // happens to be at. @see setOffset
        this.decorationSize = decorationMeters(name, this.size);
        if (drawingResolution !== undefined) {
            this.graphic.set('drawingResolution', drawingResolution);
            this.labels.set('drawingResolution', drawingResolution);
        }

        // Both style functions read their amplifiers from the feature.
        this.labels.setStyle(getAreaLabelStylesFn(name));
        this.graphic.setStyle((feature, resolution) => getStyle(this.graphicName, feature, resolution));

        writeGraphicProperties(this.getFeatures(), name, this.graphicLabels, this.stampedGeometry());
    }


    /**
     * Decoration size in meters — the width of the gaps a hostile Encirclement cuts in
     * its outline for the "ENY" amplifiers. Stamped, then replayed.
     *
     * It used to size the teeth as well; those are drawn in screen space now, so this
     * only reaches the label gaps. @see encirclementPaint
     */
    decorationSize: number = 0;

    /**
     * Only Encirclement's generator still reads the decoration scalar. Stamping it on the other
     * area graphics puts a number in the bag that nothing consumes and that then has to
     * survive a round trip it has no business being part of.
     */
    private stampedGeometry(): {decorationSize?: number} {
        return this.graphicName === TacticalGraphicName.Encirclement
            ? {decorationSize: this.decorationSize}
            : {};
    }

    /** Replays a stamped decoration size. Named for the hook restore already calls. */
    setOffset(size: number) {
        this.decorationSize = size;
        this.setBaseFeature(this.base);
        // Republish. Restore applies amplifiers before geometry inputs, so the bag still
        // holds the value this holder was constructed with until something writes the new
        // one — `setBaseFeature` regenerates the shape but stamps nothing.
        writeGraphicProperties(this.getFeatures(), this.graphicName, this.graphicLabels, this.stampedGeometry());
    }

    setLabel = (labels: GraphicLabels) => {
        if (this.graphicName === TacticalGraphicName.Encirclement) {
            const wasHostileFaker = this.graphicLabels.hostility === TacticalGraphicHostility.hostileFaker;
            const isHostileFaker = labels.hostility === TacticalGraphicHostility.hostileFaker;
            if (wasHostileFaker !== isHostileFaker) {
                // Update graphicLabels BEFORE regenerating so getTacticalGraphic
                // receives the new hostility and picks the correct geometry path.
                this.graphicLabels = labels;
                this.setBaseFeature(this.base);
                writeGraphicProperties(this.getFeatures(), this.graphicName, labels, this.stampedGeometry());
                return;
            }
        }

        // A width typed into the dialog restretches the rectangle. The guard compares
        // against the exact string a drag writes, so the holder's own write can never
        // loop back in here as a resize. @see publishRectangleWidth
        // A meter of slack: the amplifier is stamped rounded, so re-stamping the value
        // a drag just wrote must not read as an edit and restretch the shape.
        if (isRectangular(this.graphicName) && labels.width !== undefined && Math.abs(Number(labels.width) - this.widthAmplifier()) > 1) {
            const meters = Number(labels.width);
            if (Number.isFinite(meters) && meters > 0) {
                this.graphicLabels = labels;
                this.setRectangleWidth(meters);
                this.setBaseFeature(this.base);
                return;
            }
        }

        this.graphicLabels = labels;
        // Stamping fires a `change` event on each feature, which re-renders them.
        writeGraphicProperties(this.getFeatures(), this.graphicName, labels, this.stampedGeometry());
    };

    setSymbolId = (symbolId: string) => {
        this.symbolId = symbolId;
        this.labels.set('symbolId', this.symbolId);
        this.graphic.set('symbolId', this.symbolId);
        this.base.set('symbolId', this.symbolId);
    };

    getFeatures(): Feature[] {
        return [this.graphic, this.labels, this.handles, this.measure, this.base];
    }

    getCenter = (): Coordinate => {
        return this.base.getGeometry()!.getInteriorPoint().getCoordinates();
    };


    setBaseFeature(base: Feature<Polygon>): void {
        if (!base) return;

        this.base.setGeometry(base.getGeometry());

        // Store polygon bounding-box dimensions (map units) on the label feature
        // so style functions can compute a fit-to-polygon text scale.
        const geom = base.getGeometry();
        if (geom) {
            const [minX, minY, maxX, maxY] = geom.getExtent();
            this.labels.set('polygonExtentWidth', maxX - minX);
            this.labels.set('polygonExtentHeight', maxY - minY);
            this.labels.set('polygonMinX', minX);
            this.labels.set('polygonMinY', minY);
            this.labels.set('polygonMaxX', maxX);
            this.labels.set('polygonMaxY', maxY);
            this.labels.set('polygonRing', geom.getCoordinates()[0]);
        }

        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.graphicName,
            this.base,
            {size: this.decorationSize, hostility: this.graphicLabels.hostility},
        );
        if (!tacticalGraphic) return;
        const {graphic, handles, labels} = tacticalGraphic;

        this.graphic.setGeometry(graphic);
        this.labels.setGeometry(labels as Point);
        this.handles.setGeometry(handles as MultiPoint);

        // GroupOrSeriesOfTargets places its name on the northern-most segment.
        // Anchor the labels feature there (instead of the centroid) so OL's
        // feature-level culling keeps the text rendered when the user zooms in
        // close to the label position. labelSegmentA/B are the segment endpoints
        // used to rotate the text along the segment.
        if (this.graphicName === TacticalGraphicName.GroupOrSeriesOfTargets && geom) {
            const ring = geom.getCoordinates()[0];
            if (ring.length >= 2) {
                let bestIdx = 0;
                let bestMidY = -Infinity;
                for (let i = 0; i < ring.length - 1; i++) {
                    const midY = (ring[i][1] + ring[i + 1][1]) / 2;
                    if (midY > bestMidY) {
                        bestMidY = midY;
                        bestIdx = i;
                    }
                }
                const a = ring[bestIdx];
                const b = ring[bestIdx + 1];
                this.labels.setGeometry(new Point([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]));
                this.labels.set('labelSegmentA', a);
                this.labels.set('labelSegmentB', b);
            }
        }

        // A rectangle's width is doctrinal input, so a drag has to write it back.
        // @see rectangleWidthMeters
        if (isRectangular(this.graphicName)) {
            this.publishRectangleWidth();
            // Mid-gesture the shape changes on every pointer move, so the line has to
            // be re-derived here rather than only when it is armed.
            this.refreshMeasure();
        }
    }

    // ── The rectangular zones' width amplifier ──────────────────────────────
    //
    // FM 1-02.2 table 5-24 draws these with an `AM` arrow down the edge labelled
    // "Width (M)", and APP-06 says the same in words: "two anchor points **and a
    // width, defined in metres**... points 1 and 2 will be located in the centre of
    // two opposing sides of the rectangle".
    //
    // We let the user drag a box, which produces the same rectangle — but the width
    // was pure geometry, so a saved zone carried no figure a NATO consumer could read
    // back, and none could be typed in. The two now drive each other, exactly as
    // `AirCorridor` does: a drag writes the amplifier, a typed amplifier resizes the
    // shape. @see ai/app-6.md, "F2"
    //
    // **Not printed on the symbol.** FM's construct examples show only the
    // designation and the date-time group; the width is an input, not a label.

    /**
     * The rectangle's width — the extent *across* it — in ground meters.
     *
     * Measured geodesically rather than from the projected extent: the amplifier is a
     * number a user reads and types, and projected meters are inflated by 1/cos(lat),
     * which at 51° would show a 10 km zone as 16 km.
     */
    private rectangleWidthMeters(): number {
        const geom = this.base.getGeometry();
        if (!geom) return 0;
        const [minX, minY, maxX, maxY] = geom.getExtent();
        const midX = (minX + maxX) / 2;
        return getDistance(toLonLat([midX, minY]), toLonLat([midX, maxY]));
    }

    /** The amplifier value a drag writes: whole ground meters, as the bag holds it. */
    private widthAmplifier(): number {
        return Math.round(this.rectangleWidthMeters());
    }

    /** Mirror the drawn width into the bag, without disturbing the other amplifiers. */
    private publishRectangleWidth(): void {
        const width = this.widthAmplifier();
        if (this.graphicLabels.width === width) return;
        this.graphicLabels = {...this.graphicLabels, width};
        writeGraphicProperties(this.getFeatures(), this.graphicName, this.graphicLabels, this.stampedGeometry());
    }

    /**
     * Restretch the rectangle about its own centre to `meters` of ground width.
     *
     * Scaling the projected half-height by the ratio of requested to measured width
     * keeps this correct without re-deriving the Mercator factor: both numbers carry
     * the same 1/cos(lat) inflation, so it cancels.
     */
    /**
     * Arms or disarms the width read-out.
     *
     * Duck-typed: `TacticalGraphicsManager` already calls `showMeasure` on whatever
     * holder is being resized, so adding the method is all it takes to opt in. Off by
     * default, which keeps the hashed line out of a restored map and out of the sample
     * gallery — neither runs a gesture.
     *
     * The width is a **read-out, not an input**, by the same decision the dialog
     * records: you size a zone by dragging it, and the number should be visible while
     * you do rather than only afterwards.
     */
    showMeasure(active: boolean): void {
        this.measuring = active;
        this.refreshMeasure();
    }

    private measuring = false;

    /**
     * Draws the width down the rectangle's right edge, which is exactly where FM 1-02.2
     * table 5-24 puts its `AM` / "Width (M)" arrow.
     *
     * The distance is *stated* rather than left to the style function's Euclidean
     * measure, so the hashed line and the filed amplifier report the same number. They
     * would otherwise differ by 1/cos(latitude). @see createMeasureFeature
     */
    private refreshMeasure(): void {
        const geom = this.base.getGeometry();
        if (!this.measuring || !geom || !isRectangular(this.graphicName)) {
            this.measure.setGeometry(undefined);
            return;
        }
        const [, minY, maxX, maxY] = geom.getExtent();
        this.measure.set('measureMeters', this.rectangleWidthMeters());
        this.measure.setGeometry(new LineString([[maxX, minY], [maxX, maxY]]));
    }

    private setRectangleWidth(meters: number): void {
        const geom = this.base.getGeometry();
        const current = this.rectangleWidthMeters();
        if (!geom || !(current > 0) || !(meters > 0)) return;

        const [minX, minY, maxX, maxY] = geom.getExtent();
        const midY = (minY + maxY) / 2;
        const half = ((maxY - minY) / 2) * (meters / current);
        geom.setCoordinates([[
            [minX, midY - half],
            [maxX, midY - half],
            [maxX, midY + half],
            [minX, midY + half],
            [minX, midY - half],
        ]]);
    }
}
