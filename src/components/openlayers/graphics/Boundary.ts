import {LineGraphic} from "../controllers/LineGraphicController";
import Feature from "ol/Feature";
import LineString from "ol/geom/LineString";
import {
    boundariesStyleFunc,
    createBaseFeature,
    createHandleFeature,
} from "../openlayerStyles";
import {MultiPoint} from "ol/geom";
import openlayersAdapter from "../openlayersAdapter";
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {GraphicLabels} from "../../../utils/graphicLinkRegistry";
import {writeGraphicProperties} from "../graphicProperties";


export class Boundary implements LineGraphic {
    base: Feature<LineString> = <Feature<LineString>>createBaseFeature();
    graphics: Feature = new Feature();
    handles: Feature<MultiPoint> = <Feature<MultiPoint>>createHandleFeature();
    labels: Feature = new Feature<MultiPoint>();
    symbolId: string = '';
    graphicLabel: GraphicLabels = {label: ''};

    constructor(resolution?: number) {
        if (resolution !== undefined) {
            this.graphics.set('drawingResolution', resolution);
        }

        // Reads its amplifiers from the feature, so it needs no closure.
        this.graphics.setStyle(boundariesStyleFunc());
        writeGraphicProperties(this.getFeatures(), TacticalGraphicName.Boundary, this.graphicLabel);
    }

    getFeatures(): Feature[] {
        return [this.graphics, this.handles, this.labels, this.base];
    }

    updateGraphic = () => {
        if (this.base.getGeometry()!.getCoordinates().length < 2) return;

        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            TacticalGraphicName.Boundary,
            this.base
        );

        if (!tacticalGraphic) return;
        const {graphic, handles, labels} = tacticalGraphic;

        this.graphics.setGeometry(graphic as LineString);
        this.handles.setGeometry(handles as MultiPoint);
        // this.labels.setGeometry(labels);
    };

    setBaseFeature(base: Feature<LineString>): void {
        this.base.setGeometry(base.getGeometry());
        this.updateGraphic();
    }

    setLabel = (labels: GraphicLabels): void => {
        this.graphicLabel = labels;
        writeGraphicProperties(this.getFeatures(), TacticalGraphicName.Boundary, labels);
    };

    setSymbolId = (symbolId: string) => {
        this.symbolId = symbolId;
        this.labels.set('symbolId', this.symbolId);
        this.graphics.set('symbolId', this.symbolId);
        this.base.set('symbolId', this.symbolId)
        this.handles.set('symbolId', this.symbolId)
    }
}