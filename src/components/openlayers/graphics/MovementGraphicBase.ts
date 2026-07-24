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
import {LineGraphic, visiblePathHandles} from "../controllers/LineGraphicController";
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
    /** @see LineGraphic.hidesStartHandle — set by LineGraphicController. */
    hidesStartHandle?: boolean;
    resolution: number;
    /**
     * Whether the generator emits a width handle. Starts true so the feature is
     * registered as it always was; `updateGeometry` corrects it on the first
     * render from the number of handle points the generator returned.
     */
    protected hasOffsetHandle: boolean = true;

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
        this.handles.setGeometry(new MultiPoint(visiblePathHandles(handleCoords.slice(0, 2), this.base.getGeometry()?.getCoordinates()[0], this.hidesStartHandle)));

        // A generator that emits fewer than three handle points is declaring that
        // the graphic has no width to drag — its shape follows entirely from its
        // two endpoints (MobileDefense, which emits just the far one). Leave the
        // offset handle without a geometry and drop it from getFeatures(), so it
        // neither renders nor resolves to this controller on a pointer-down.
        this.hasOffsetHandle = handleCoords.length > 2;
        if (this.hasOffsetHandle) {
            this.offsetHandle.setGeometry(new Point(handleCoords[2]));
        }

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
        const features = [this.graphic, this.labels, this.handles, this.base];
        return this.hasOffsetHandle ? [...features, this.offsetHandle] : features;
    }
}