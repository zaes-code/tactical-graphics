import Feature from 'ol/Feature';
import {
    airCoordinatingCorridorStyleFunc,
    bridgeGraphicStyleFunc,
    createBaseFeature,
    createFeature,
    createHandleFeature,
    createOffsetHandleFeature,
    envelopmentGraphicStyleFunc,
    infiltrationGraphicStyleFunc,
    mobileDefenseGraphicStyleFunc,
    movementGraphicPathStyleFunc,
} from '../openlayerStyles';
import {MultiPoint, Point} from "ol/geom";
import LineString from "ol/geom/LineString";
import {LineGraphic} from "../controllers/LineGraphicController";
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {GraphicLabels} from "../../../utils/graphicLinkRegistry";
import openlayersAdapter from "../openlayersAdapter";
import {writeGraphicProperties} from "../graphicProperties";

export class MovementGraphicBase implements LineGraphic {
    offset: number;
    graphicLabels: GraphicLabels = {label: ''};

    base: Feature<LineString> = <Feature<LineString>>createBaseFeature();
    graphic: Feature = createFeature();
    labels: Feature = new Feature<MultiPoint>();
    handles: Feature = <Feature<MultiPoint>>createHandleFeature();
    offsetHandle: Feature = <Feature<Point>>createOffsetHandleFeature();

    features: Feature[] = [];
    symbolId: string = '';
    graphicName: TacticalGraphicName;
    resolution: number;

    constructor(name: TacticalGraphicName, offset: number, resolution: number = 0) {
        this.offset = offset;
        this.graphicName = name;
        this.resolution = resolution;

        if (resolution > 0) {
            this.labels.set('drawingResolution', resolution);
            this.graphic.set('drawingResolution', resolution);
        }

        this.setLabelStyle(name);
        if (name === TacticalGraphicName.Infiltration) {
            this.graphic.setStyle(infiltrationGraphicStyleFunc());
        }
        if (name === TacticalGraphicName.Envelopment) {
            this.graphic.setStyle(envelopmentGraphicStyleFunc());
        }
        if (name === TacticalGraphicName.MobileDefense) {
            this.graphic.setStyle(mobileDefenseGraphicStyleFunc());
        }

        writeGraphicProperties([this.graphic, this.labels, this.handles, this.base], name, this.graphicLabels);
    }

    setLabelStyle = (name: TacticalGraphicName) => {
        // Each style function reads its amplifiers from the feature, so the
        // switch dispatches on name alone.
        this.labels.setStyle((feature, resolution) => {
            switch (name) {
                case TacticalGraphicName.AssaultCrossing:
                case TacticalGraphicName.Gap:
                case TacticalGraphicName.Bridge:
                    return bridgeGraphicStyleFunc()(feature, resolution);
                case TacticalGraphicName.AirCorridor:
                case TacticalGraphicName.LowLevelTransitRoute:
                case TacticalGraphicName.MinimumRiskRoute:
                case TacticalGraphicName.SafeLane:
                case TacticalGraphicName.SpecialCorridor:
                case TacticalGraphicName.StandardUseArmyAircraftFlightRoute:
                case TacticalGraphicName.TransitCorridor:
                case TacticalGraphicName.UnmannedAircraftCorridor:
                    return airCoordinatingCorridorStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.AttackHelicopterAxisOfAdvance:
                case TacticalGraphicName.MainAxisOfAdvance:
                case TacticalGraphicName.AviationAxisOfAdvance:
                case TacticalGraphicName.SupportingAxisOfAdvance:
                case TacticalGraphicName.Counterattack:
                default:
                    return movementGraphicPathStyleFunc(name)(feature, resolution);
            }
        });
    }
    setLabel = (labels: GraphicLabels) => {
        this.graphicLabels = labels;
        // Stamping fires a `change` event on each feature, which re-renders them.
        writeGraphicProperties(this.getFeatures(), this.graphicName, labels);
    };

    updateGeometry = () => {
        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.graphicName,
            this.base,
            {radius: this.offset, size: this.resolution}
        );
        console.log(JSON.stringify(tacticalGraphic));
        if (!tacticalGraphic) return;

        let {graphic, handles, labels} = tacticalGraphic;
        let handleCoords = (handles as MultiPoint).getCoordinates();

        this.graphic.setGeometry(graphic);
        this.handles.setGeometry(new MultiPoint(handleCoords.slice(0, 2)));
        this.offsetHandle.setGeometry(new Point(handleCoords[2]));

        this.labels.setGeometry(labels);
    };
    getBaseGraphicFeature = (): Feature<LineString> => {
        return this.base;
    }

    setSymbolId = (symbolId: string) => {
        this.symbolId = symbolId;
        this.labels.set('symbolId', this.symbolId);
        this.graphic.set('symbolId', this.symbolId);
        this.base.set('symbolId', this.symbolId);
        this.offsetHandle.set('symbolId', this.symbolId);
    };

    setBaseFeature(base: Feature<LineString>) {
        this.base.setGeometry(base.getGeometry());
        this.updateGeometry();
    }

    setOffset(offset: number) {
        this.offset = offset;
        this.updateGeometry();
    }

    getFeatures(): Feature[] {
        return [this.graphic, this.labels, this.handles, this.base, this.offsetHandle];
    }
}