import {Feature} from "ol";
import {LineString, MultiPoint} from "ol/geom";
import {Coordinate} from "ol/coordinate";
import {LineGraphic} from "../controllers/LineGraphicController";
import {
    coordinatedFireLineStyle,
    createBaseFeature,
    createFeature,
    createHandleFeature,
    directionArrowStyleFunc,
    ferryCrossingStyleFunc,
    fieldOfFireStyleFunc,
    defaultLineStyle,
    finalProtectiveFireStyleFunc,
    fortifiedLineStyleFunc,
    forwardLineOfOwnTroopsStyleFunc,
    lineOfContactStyleFunc,
    linearSmokeTargetStyleFunc,
    linearTargetStyleFunc,
    munitionFlightPathStyleFunc,
    obstacleLineStyle,
    passageLaneGraphicStyle,
    probableLineOfDeploymentStyleFunc,
    routeControlMeasureStyle, engineerWorkLineStyle,
    tacticalFixStyleFunc,
    phaseLineStyleFunc,
} from '../openlayerStyles';
import {TacticalGraphicName} from '@zaes-code/tactical-graphics';
import {GraphicLabels} from "../../../utils/graphicLinkRegistry";
import openlayersAdapter from "../openlayersAdapter";
import {writeGraphicProperties} from "../graphicProperties";

export class LineGraphicBase implements LineGraphic {
    base: Feature<LineString> = <Feature<LineString>>createBaseFeature();
    graphics: Feature = createFeature();
    handles: Feature<MultiPoint> = <Feature<MultiPoint>>createHandleFeature();
    symbolId: string = '';
    graphicName: TacticalGraphicName;
    graphicLabel: GraphicLabels = {label: ''};
    resolution: number | undefined;

    constructor(name: TacticalGraphicName, resolution?: number) {
        if (resolution !== undefined) {
            this.graphics.set('drawingResolution', resolution);
        }
        // Every style function below reads its amplifiers from the feature via
        // `readGraphicLabels`, so the switch dispatches on name alone.
        this.graphics.setStyle((feature, resolution) => {
            switch (name) {
                case TacticalGraphicName.PhaseLine:
                    return phaseLineStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.CoordinatedFireLine:
                    return coordinatedFireLineStyle(name)(feature, resolution);
                case TacticalGraphicName.EngineerWorkLine:
                    return engineerWorkLineStyle(name)(feature, resolution);
                case TacticalGraphicName.MainSupplyRoute:
                case TacticalGraphicName.AlternateSupplyRoute:
                case TacticalGraphicName.Route:
                    return routeControlMeasureStyle(name)(feature, resolution);
                case TacticalGraphicName.MunitionFlightPath:
                    return munitionFlightPathStyleFunc()(feature, resolution);
                case TacticalGraphicName.FieldsOfFire:
                    return fieldOfFireStyleFunc()(feature, resolution);
                case TacticalGraphicName.ForwardLineOfOwnTroops:
                    return forwardLineOfOwnTroopsStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.LineOfContact:
                    return lineOfContactStyleFunc()(feature, resolution);
                case TacticalGraphicName.ProbableLineOfDeployment:
                    return probableLineOfDeploymentStyleFunc()(feature, resolution);
                case TacticalGraphicName.TacticalFix:
                    return tacticalFixStyleFunc()(feature, resolution);
                case TacticalGraphicName.FerryCrossing:
                case TacticalGraphicName.TacticalTurn:
                    return ferryCrossingStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.DirectionOfMainAttack:
                case TacticalGraphicName.DirectionOfSupportingAttack:
                case TacticalGraphicName.AviationDirectionOfAttack:
                case TacticalGraphicName.DirectionOfMainAttackFeint:
                    return directionArrowStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.ObstacleLine:
                    return obstacleLineStyle(name)(feature, resolution);
                case TacticalGraphicName.FortifiedLine:
                    return fortifiedLineStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.LinearTarget:
                    return linearTargetStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.LinearSmokeTarget:
                    return linearSmokeTargetStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.FinalProtectiveFire:
                    return finalProtectiveFireStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.PassageLane:
                    return passageLaneGraphicStyle()(feature, resolution);
                default:
                    return defaultLineStyle(name)(feature, resolution);
            }
        });

        this.graphicName = name;
        this.resolution = resolution;
        writeGraphicProperties(this.getFeatures(), name, this.graphicLabel);
    }

    setSymbolId = (symbolId: string) => {
        this.symbolId = symbolId;
        this.graphics.set('symbolId', this.symbolId);
        this.base.set('symbolId', this.symbolId)
        this.handles.set('symbolId', this.symbolId)
    }

    getFeatures(): Feature[] {
        return [this.graphics, this.handles, this.base];
    }

    private enforcingMinLength = false;

    setBaseFeature(base: Feature<LineString>): void {
        // AviationDirectionOfAttack carries a bow-tie baked into geometry near
        // the start of the line. Enforce a minimum first-segment length so the
        // bow-tie (centerDist + halfWidth = 60 px) plus the arrowhead (~20 px)
        // always fit. Modifying the shared geometry re-fires the draw
        // interaction's 'change' event, which lands back here with the line
        // already long enough and falls through to the normal update. The
        // `enforcingMinLength` flag + tolerance guard against floating-point
        // recursion where the re-fired change event sees `len` a ULP below min.
        if (
            this.graphicName === TacticalGraphicName.AviationDirectionOfAttack &&
            this.resolution &&
            !this.enforcingMinLength
        ) {
            this.enforcingMinLength = true;
            try {
                this.enforceMinFirstSegmentLength(base, 80 * this.resolution);
            } finally {
                this.enforcingMinLength = false;
            }
        }

        // TacticalFix: 145px minimum line length — 50px for the F-labelled
        // first segment, 45px for the three triangles, 50px for the trailing
        // segment leading into the arrowhead.
        if (
            this.graphicName === TacticalGraphicName.TacticalFix &&
            this.resolution &&
            !this.enforcingMinLength
        ) {
            this.enforcingMinLength = true;
            try {
                this.enforceMinFirstSegmentLength(base, 145 * this.resolution);
            } finally {
                this.enforcingMinLength = false;
            }
        }

        this.base.setGeometry(base.getGeometry());
        let geom = this.base.getGeometry();
        if (!geom) return;
        let coords = geom.getCoordinates();
        if (coords.length < 2) return;
        this.updateGraphic();
    }

    private enforceMinFirstSegmentLength(base: Feature<LineString>, minLength: number): void {
        const geom = base.getGeometry();
        if (!geom) return;
        const coords = geom.getCoordinates();
        if (coords.length < 2) return;
        const [p0, p1] = coords;
        const dx = p1[0] - p0[0];
        const dy = p1[1] - p0[1];
        const len = Math.hypot(dx, dy);
        // Tolerance to avoid FP-driven re-entrance when the re-fired change
        // event computes `len` at (min - 1 ULP) after round-tripping through
        // setCoordinates.
        const tolerance = Math.max(1e-6, minLength * 1e-9);
        if (len === 0 || len >= minLength - tolerance) return;

        // Extend P1 outward along P0→P1 so the first segment hits minLength.
        // Shift all subsequent points by the same delta so the segments after
        // P1 keep their shape.
        const shiftX = dx * (minLength / len - 1);
        const shiftY = dy * (minLength / len - 1);
        const newCoords: Coordinate[] = coords.map((c, i) =>
            i === 0 ? c : [c[0] + shiftX, c[1] + shiftY],
        );
        geom.setCoordinates(newCoords);
    }

    updateGraphic = () => {
        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.graphicName,
            this.base,
            {size: this.resolution}
        );
        if (!tacticalGraphic) return;
        const {graphic, handles, labels} = tacticalGraphic;

        this.graphics.setGeometry(graphic);
        this.handles.setGeometry(handles as MultiPoint);
    };

    setLabel = (labels: GraphicLabels): void => {
        this.graphicLabel = labels;
        // Stamping fires a `change` event on each feature, which re-renders them.
        writeGraphicProperties(this.getFeatures(), this.graphicName, labels);
    };

}