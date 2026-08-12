import openlayersAdapter from "../openlayersAdapter";
import {getLabel, TacticalGraphicName} from '@zaes/tactical-graphics';
import Feature from 'ol/Feature';
import {
    createBaseFeature,
    createFeature,
    createHandleFeature,
    createOffsetHandleFeature, retroGradeTaskStyleFunc
} from '../openlayerStyles';
import {MultiPoint, Point} from "ol/geom";
import LineString from "ol/geom/LineString";
import {LineGraphic, visiblePathHandles} from "../controllers/LineGraphicController";
import {assignRole, readGraphicLabels, writeGraphicProperties} from '../graphicProperties';


export class RetrogradeTask implements LineGraphic {
    rotation: number = 0;
    size: number = 1;
    /**
     * Which side of the drawn line the cane hangs on. User intent, so it is stamped and
     * replayed — and expressed relative to the line's bearing, so it survives rotation.
     * @see GeometryService.getCaneArrow
     */
    mirrored: boolean = false;

    /** @see TacticalGraphicHandler.setMirrored */
    setMirrored(mirrored: boolean) {
        if (mirrored === this.mirrored) return;
        this.mirrored = mirrored;
        this.updateGeometry();
        this.publish();
    }
    name: TacticalGraphicName;

    base: Feature<LineString> = <Feature<LineString>>createBaseFeature();
    graphic: Feature = createFeature();
    labels: Feature = assignRole(new Feature<MultiPoint>(), 'label');
    handles: Feature = <Feature<MultiPoint>>createHandleFeature();
    offsetHandle: Feature = <Feature<Point>>createOffsetHandleFeature();

    features: Feature[] = [];
    symbolId: string = '';
    /** @see LineGraphic.hidesStartHandle — set by LineGraphicController. */
    hidesStartHandle?: boolean;

    constructor(name: TacticalGraphicName, size: number, drawingResolution?: number) {
        this.name = name;
        this.size = size;
        if (drawingResolution !== undefined) {
            this.graphic.set('drawingResolution', drawingResolution);
        }
        this.setSymbolId('');
        this.graphic.setStyle(retroGradeTaskStyleFunc(getLabel(name)));
    }

    updateGeometry = () => {
        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.name,
            this.base,
            {size: this.size, mirrored: this.mirrored}
        );
        if (!tacticalGraphic) return;

        let {graphic, handles, labels} = tacticalGraphic;

        this.graphic.setGeometry(graphic);
        let handleCoords = (handles as MultiPoint).getCoordinates();

        this.handles.setGeometry(new MultiPoint(visiblePathHandles(handleCoords.slice(1), this.base.getGeometry()?.getCoordinates()[0], this.hidesStartHandle)));
        this.offsetHandle.setGeometry(new Point(handleCoords[0]));
        // Persist the *effective* meter value, not the viewport factor it came from.
        // `size` starts life as `20 x drawingResolution`, but what the generator actually
        // consumed is a distance in meters — and that is what a snapshot can carry and a
        // restore can replay without knowing anything about zoom. Stamped on every
        // rebuild, not just on a width drag, so a graphic the user never touched still
        // describes itself.
        this.publish();
    };


    getBaseGraphicFeature = (): Feature<LineString> => {
        return this.base;
    }

    setSymbolId = (symbolId: string) => {
        this.symbolId = symbolId;
        this.getFeatures().forEach(feature => {
            feature.set('symbolId', this.symbolId);
        })
    }

    setBaseFeature(base: Feature<LineString>) {
        this.base.setGeometry(base.getGeometry());
        this.updateGeometry();
    }

    setOffset(offset: number) {
        this.size = offset;
        this.updateGeometry();
        // `size` here is the width the user dragged, not a construction-time constant,
        // so it has to be saved. Persisted as `decorationSize` — it sizes the drawn
        // decoration, and is not a reach from any center. @see TacticalGraphicProperties.
        this.publish();
    }

    /** Republishes the amplifiers with the geometry state beside them. */
    private publish() {
        writeGraphicProperties(this.getFeatures(), this.name, {...readGraphicLabels(this.graphic)}, {
            decorationSize: this.size,
            mirrored: this.mirrored,
        });
    }

    getFeatures(): Feature[] {
        return [this.graphic, this.handles, this.labels, this.base, this.offsetHandle];
    }

}