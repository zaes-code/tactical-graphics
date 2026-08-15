import {Feature} from "ol";
import {LineString, MultiPoint} from "ol/geom";
import {Coordinate} from "ol/coordinate";
import {LineGraphic, visiblePathHandles} from "../controllers/LineGraphicController";
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
    abatisStyleFunc,
    fortifiedLineStyleFunc,
    endGlyphLineStyleFunc,
    nestedZoneStyleFunc,
    obstacleBypassStyleFunc,
    escortOrDemonstrationStyleFunc,
    sweptArcTaskStyleFunc,
    protectionLineStyleFunc,
    wireObstacleStyleFunc,
    antiTankDitchStyleFunc,
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
import {getLabel, TacticalGraphicName} from '@zaes/tactical-graphics';
import {GraphicLabels} from "../../../utils/graphicLinkRegistry";
import openlayersAdapter from "../openlayersAdapter";
import {readGraphicLabels, writeGraphicProperties} from "../graphicProperties";
import {decorationMeters} from './decorationPx';

export class LineGraphicBase implements LineGraphic {
    base: Feature<LineString> = <Feature<LineString>>createBaseFeature();
    graphics: Feature = createFeature();
    handles: Feature<MultiPoint> = <Feature<MultiPoint>>createHandleFeature();
    symbolId: string = '';
    graphicName: TacticalGraphicName;
    /** @see LineGraphic.hidesStartHandle — set by LineGraphicController. */
    hidesStartHandle?: boolean;
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
                case TacticalGraphicName.Fix:
                    // 'F' for the mission task, '' for the table 5-19 twin.
                    return tacticalFixStyleFunc(getLabel(name))(feature, resolution);
                case TacticalGraphicName.FerryCrossing:
                    return ferryCrossingStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.DirectionOfMainAttack:
                case TacticalGraphicName.DirectionOfSupportingAttack:
                case TacticalGraphicName.AviationDirectionOfAttack:
                case TacticalGraphicName.DirectionOfMainAttackFeint:
                    return directionArrowStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.ObstacleLine:
                    return obstacleLineStyle(name)(feature, resolution);
                case TacticalGraphicName.AntiTankDitchUnderConstruction:
                case TacticalGraphicName.AntiTankDitchCompleted:
                case TacticalGraphicName.AntiTankDitchReinforcedWithMines:
                    return antiTankDitchStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.FortifiedLine:
                    return fortifiedLineStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.MinimumSafeDistanceZone:
                case TacticalGraphicName.MinimumSafeDistanceMultipleStrike:
                    return nestedZoneStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.ObstacleBypassEasy:
                case TacticalGraphicName.ObstacleBypassDifficult:
                case TacticalGraphicName.ObstacleBypassImpossible:
                    return obstacleBypassStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.Escort:
                case TacticalGraphicName.Demonstration:
                    return escortOrDemonstrationStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.Capture:
                case TacticalGraphicName.Evacuate:
                case TacticalGraphicName.Recover:
                    return sweptArcTaskStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.DecisionLine:
                case TacticalGraphicName.MobilityCorridor:
                    return endGlyphLineStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.Mineline:
                case TacticalGraphicName.MineCluster:
                case TacticalGraphicName.TripWire:
                case TacticalGraphicName.RaftSite:
                case TacticalGraphicName.FortifiedPosition:
                    return protectionLineStyleFunc(name)(feature, resolution);
                // The chevron is in the geometry, so a plain stroke draws it. Not the
                // default: `defaultLinePaint` returns nothing for a MultiLineString.
                case TacticalGraphicName.Abatis:
                    return abatisStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.WireUnspecified:
                case TacticalGraphicName.WireSingleFence:
                case TacticalGraphicName.WireDoubleFence:
                case TacticalGraphicName.WireDoubleApronFence:
                case TacticalGraphicName.WireLowWireFence:
                case TacticalGraphicName.WireHighWireFence:
                case TacticalGraphicName.WireSingleConcertina:
                case TacticalGraphicName.WireDoubleStrandConcertina:
                case TacticalGraphicName.WireTripleStrandConcertina:
                    return wireObstacleStyleFunc(name)(feature, resolution);
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

    /**
     * Suspends the minimum-length guards below while a snapshot is rebuilt.
     *
     * Those guards *modify the base geometry*, and their floors are screen-pixel
     * constants times the map resolution. On a draw or a vertex modify that is right —
     * they stop a gesture producing a line too short for the symbol to fit in. On a
     * restore it is not: the geometry is already final and was already valid, so
     * re-running the guard at a different resolution silently extends the drawn line.
     *
     * Set by `applyRestoredGeometry` for the duration of the rebuild only, so draw and
     * modify keep the protection.
     */
    suspendMinimumLength = false;

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
            !this.suspendMinimumLength &&
            !this.enforcingMinLength
        ) {
            this.enforcingMinLength = true;
            try {
                this.enforceMinFirstSegmentLength(base, 80 * this.resolution);
            } finally {
                this.enforcingMinLength = false;
            }
        }

        // Fix: 145px minimum line length — 50px for the F-labeled first
        // segment, 45px for the three triangles, 50px for the trailing segment
        // leading into the arrowhead. The table 5-19 twin draws no "F" but the
        // geometry is otherwise identical, so it takes the same floor.
        if (
            (this.graphicName === TacticalGraphicName.TacticalFix || this.graphicName === TacticalGraphicName.Fix) &&
            this.resolution &&
            !this.suspendMinimumLength &&
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

    /**
     * The `size` scalar handed to the generator, in meters.
     *
     * Starts as the draw-time resolution — one screen pixel's worth of ground — and is
     * replaced outright by a restored value. Most graphics in this family ignore `size`
     * (PhaseLine and friends are pure line work), but the ones that read it — PassageLane,
     * FieldsOfFire, FerryCrossing — would otherwise rebuild at whatever resolution the
     * restoring session happened to be at.
     */
    private sizeOverride: number | undefined;

    private graphicSize(): number {
        // Per-name, because this holder serves 41 graphics and they do not all bake a
        // decoration of the same size. @see decorationMeters
        return this.sizeOverride ?? decorationMeters(this.graphicName, this.resolution ?? 0);
    }

    /**
     * Replays a stamped `size`. Named for the `LineGraphic` hook restore already calls;
     * no graphic in this family has a draggable width handle, so nothing else reaches it.
     */
    setOffset(size: number) {
        this.sizeOverride = size;
        this.updateGraphic();
    }

    updateGraphic = () => {
        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.graphicName,
            this.base,
            {size: this.graphicSize()}
        );
        if (!tacticalGraphic) return;
        const {graphic, handles, labels} = tacticalGraphic;

        this.graphics.setGeometry(graphic);
        this.handles.setGeometry(new MultiPoint(visiblePathHandles((handles as MultiPoint).getCoordinates(), this.base.getGeometry()?.getCoordinates()[0], this.hidesStartHandle)));

        // Persist the *effective* meter value rather than the viewport factor it came
        // from, so a restore replays a distance instead of re-deriving one from whatever
        // zoom it happens to be at. `decorationSize` is the schema's name for this scalar.
        writeGraphicProperties(this.getFeatures(), this.graphicName, {...readGraphicLabels(this.graphics)}, {
            decorationSize: this.graphicSize(),
        });
    };

    setLabel = (labels: GraphicLabels): void => {
        this.graphicLabel = labels;
        // Stamping fires a `change` event on each feature, which re-renders them.
        // Geometry state travels with the amplifiers — a bare write drops the stamped
        // `radius` and the graphic stops describing itself. @see AirCorridor.setLabel
        writeGraphicProperties(this.getFeatures(), this.graphicName, labels, {decorationSize: this.graphicSize()});
    };

}