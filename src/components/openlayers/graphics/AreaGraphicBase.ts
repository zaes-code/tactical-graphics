import {Coordinate} from 'ol/coordinate';
import {Feature} from 'ol';
import {MultiPoint, Point, Polygon} from 'ol/geom';
import {createBaseFeature, createHandleFeature, getAreaLabelStylesFn, getStyle} from '../openlayerStyles';
import {PolygonGraphic} from '../controllers/PolygonGraphicController';
import openlayersAdapter from '../openlayersAdapter';
import {TacticalGraphicHostility, TacticalGraphicName} from '@zaes/tactical-graphics';
import {GraphicLabels} from '../../../utils/graphicLinkRegistry';
import {assignRole, writeGraphicProperties} from '../graphicProperties';
import {decorationMeters} from './decorationPx';

export class AreaGraphicBase implements PolygonGraphic {
    // open layers related
    base: Feature<Polygon> = <Feature<Polygon>>createBaseFeature();
    graphic: Feature = assignRole(new Feature(), 'graphic');
    labels: Feature = assignRole(new Feature(), 'label');
    handles: Feature<MultiPoint> = <Feature<MultiPoint>>createHandleFeature();
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
        return [this.graphic, this.labels, this.handles, this.base];
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
    }
}
