import {Feature} from "ol";
import {LineString, MultiPoint} from "ol/geom";
import {Coordinate} from "ol/coordinate";
import {LineGraphic, pivotCoordinate, visiblePathHandles} from '../controllers/LineGraphicController';
import {
    abatisStyleFunc,
    antiTankDitchStyleFunc,
    coordinatedFireLineStyle,
    createBaseFeature,
    createFeature,
    createHandleFeature,
    defaultLineStyle,
    directionArrowStyleFunc,
    endGlyphLineStyleFunc,
    engineerWorkLineStyle,
    escortOrDemonstrationStyleFunc,
    ferryCrossingStyleFunc,
    fieldOfFireStyleFunc,
    finalProtectiveFireStyleFunc,
    followTaskStyleFunc,
    fortifiedLineStyleFunc,
    forwardLineOfOwnTroopsStyleFunc,
    lineOfContactStyleFunc,
    linearSmokeTargetStyleFunc,
    linearTargetStyleFunc,
    munitionFlightPathStyleFunc,
    nestedZoneStyleFunc,
    obstacleBypassStyleFunc,
    obstacleLineStyle,
    overheadWireStyle,
    passageLaneGraphicStyle,
    safeLaneOrGapStyle,
    phaseLineStyleFunc,
    probableLineOfDeploymentStyleFunc,
    protectionLineStyleFunc,
    routeControlMeasureStyle,
    securityOperationStyleFunc,
    sweptArcTaskStyleFunc,
    tacticalFixStyleFunc,
    wireObstacleStyleFunc,
} from '../openlayerStyles';
import {defaultStandoffMetres, getLabel, groundLength, latitudeFromMercatorY, minimumFirstSegmentPx, TacticalGraphicName} from '@zaes/tactical-graphics';
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
    graphicLabel: GraphicLabels = {designation: ''};
    resolution: number | undefined;
    /** A standoff replayed by a restore, if any. @see setStandoff */
    private standoffOverride: number | undefined;
    /**
     * The standoff the current geometry was actually built from.
     *
     * `setLabel` needs to know whether a typed value differs from what is ON SCREEN, and
     * the bag is no help: `featurePropertiesSource.apply` writes the new labels onto the
     * feature and only then calls `setLabel`, so by that point the bag already holds the
     * number the operator just typed and every comparison against it says "unchanged".
     */
    private standoffInUse: number | undefined;

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
                case TacticalGraphicName.Seize:
                case TacticalGraphicName.Evacuate:
                case TacticalGraphicName.Recover:
                    return sweptArcTaskStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.FollowAndAssume:
                case TacticalGraphicName.FollowAndSupport:
                    return followTaskStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.Cover:
                case TacticalGraphicName.Guard:
                case TacticalGraphicName.Screen:
                    return securityOperationStyleFunc(name)(feature, resolution);
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
                // Same outline as the passage lane above, drawn by the same function, plus
                // the amplifier column APP-06 letters and FM 1-02.2 does not.
                case TacticalGraphicName.SafeLaneOrGap:
                    return safeLaneOrGapStyle(name)(feature, resolution);
                case TacticalGraphicName.OverheadWire:
                    return overheadWireStyle(name)(feature, resolution);
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

    /**
     * Whether the gesture in progress is **authoring the line's shape** — a draw, or a
     * vertex being dragged — as opposed to moving, turning or scaling the whole graphic.
     *
     * The floors below only make sense for the first kind. `setBaseFeature` is the door
     * every gesture comes through, so gating them on "not a restore" alone let a *move*
     * stretch the graphic: at a zoom where a restored Fix was 96 px long against a 145 px
     * floor, one drag took its base from 5.2 degrees to 35.8 — the near end followed the
     * cursor and the far end shot off. The user moved it and it changed shape.
     *
     * Set by `LineGraphicController` around the two gestures that author geometry.
     * @see MissionTaskGraphicBase.sizingFromDraw, the same rule for the curves' size
     */
    shapingFromGesture = false;

    setBaseFeature(base: Feature<LineString>): void {
        /*
         * **A floor on the first segment, while the shape is being authored.**
         *
         * Three graphics bake a mark into the geometry near the start of the line and
         * need room for it and for the arrowhead at the far end. Which graphics, and how
         * many pixels, is `minimumFirstSegmentPx` — in the map-agnostic half, so MapLibre
         * applies the same floor rather than none at all, which is what it did while
         * these were two literals here.
         *
         * Modifying the shared geometry re-fires the draw interaction's `change` event,
         * which lands back here with the line already long enough and falls through to
         * the normal update. The `enforcingMinLength` flag and the tolerance inside
         * guard against floating-point recursion where the re-fired event sees `len` a
         * ULP below the minimum.
         */
        const minFirstSegmentPx = minimumFirstSegmentPx(this.graphicName);
        if (
            minFirstSegmentPx !== undefined &&
            this.resolution &&
            this.shapingFromGesture &&
            !this.suspendMinimumLength &&
            !this.enforcingMinLength
        ) {
            this.enforcingMinLength = true;
            try {
                // Projected metres against projected coordinates, which is exactly the
                // pixel count asked for. MapLibre corrects for latitude because it holds
                // ground distances; the two agree on the screen.
                this.enforceMinFirstSegmentLength(base, minFirstSegmentPx * this.resolution);
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

    /**
     * The decoration size actually in force, in metres — the stamped override if a drag
     * or a restore set one, else the per-name default for this zoom.
     *
     * Public because a resize has to scale it, and `sizeOverride` alone is `undefined`
     * on a freshly drawn graphic: reading that would leave the first resize scaling the
     * line and not its symbol. @see LineGraphicController.handleResize
     */
    graphicSize(): number {
        // Per-name, because this holder serves 80 graphics and they do not all bake a
        // decoration of the same size. @see decorationMeters
        //
        // **At this graphic's own latitude**, which is why the derivation is here rather
        // than in the factory that built the holder: by the time anything asks, the line
        // has been drawn, so the exact place is known. A pixel size times the bare
        // resolution is a projected length, and every tooth, tick and chevron derived
        // that way came out 1/cos(latitude) too large — twice the size at 60 degrees
        // north. @see screenMeters
        return this.sizeOverride ?? decorationMeters(this.graphicName, groundLength(this.resolution ?? 0, this.latitude()));
    }

    /**
     * Where this graphic sits, in degrees, for anything sized in screen pixels.
     *
     * The first vertex, and zero before one exists — a holder is built when the tool is
     * picked and only learns its place when the user clicks.
     */
    protected latitude(): number {
        const first = (this.base.getGeometry() as LineString | undefined)?.getCoordinates()?.[0];
        return first ? latitudeFromMercatorY(first[1]) : 0;
    }

    /**
     * The standoff between the multiple-strike zone's two rings, in metres.
     *
     * Three sources, in order: a distance replayed by a restore, one the operator typed in
     * the dialog, and failing both a seed of half a screen inch at the resolution the
     * graphic is being drawn at. The seed is taken **once** — after it is stamped, `filed`
     * carries it and this returns it unchanged — so the gap is a real distance from the
     * first render and does not move when the operator zooms.
     *
     * `groundLength`, not the bare resolution: a pixel size times the raw number is a
     * projected length and comes out 1/cos(latitude) too large. @see graphicSize
     */
    private standoff(filed: number | undefined): number {
        if (this.standoffOverride !== undefined) return this.standoffOverride;
        if (filed !== undefined) return filed;
        return defaultStandoffMetres(this.graphicName, groundLength(this.resolution ?? 0, this.latitude())) ?? 0;
    }

    /**
     * Replays a saved standoff.
     *
     * Separate from `setOffset` because the two are different numbers: `setOffset` carries
     * the holder's decoration size, and this carries an amplifier the generator reads. A
     * restore strips `width` out of the amplifier bag as a geometry key, so without this
     * hook the standoff never came back and the graphic re-seeded itself from whatever zoom
     * the file was opened at. @see toLabels in persistence.ts
     */
    setStandoff(metres: number) {
        this.standoffOverride = metres;
        this.updateGraphic();
    }

    /**
     * Replays a stamped `size`. Named for the `LineGraphic` hook restore already calls;
     * no graphic in this family has a draggable width handle, so nothing else reaches it.
     */
    setOffset(size: number) {
        this.sizeOverride = size;
        this.updateGraphic();
    }

    /**
     * Which side the graphic's decoration hangs on. Abatis's chevron is the one in this
     * family that flips; a symmetric graphic ignores it. @see setMirrored
     */
    mirrored: boolean = false;

    /**
     * @see TacticalGraphicHandler.setMirrored
     *
     * **This family had no mirror at all.** `LineGraphicController.setMirrored` forwarded
     * to `graphic.setMirrored?.()` and every holder here was missing it, so the call
     * landed on `undefined` and did nothing — silently, because the optional call is
     * exactly the shape a symmetric graphic legitimately has. Abatis's apex handle is
     * declared a `mirror` in the contract precisely so the flip has something to grab,
     * and grabbing it flipped nothing.
     */
    setMirrored(mirrored: boolean): void {
        if (mirrored === this.mirrored) return;
        this.mirrored = mirrored;
        this.updateGraphic();
    }

    /**
     * How many handles `visiblePathHandles` dropped off the front.
     *
     * `handleRole` is indexed against the *generator's* list, and this holder renders a
     * filtered one — a two-point graphic hides the handle sitting on its own start. So
     * the apex the contract calls index 2 arrives as index 1, is answered `shape`, and
     * the mirror never fires. Recomputed on every publish rather than assumed, because
     * whether the start handle is dropped depends on where it landed.
     * @see TacticalGraphicHandler.handleIndexOffset
     */
    handleIndexOffset = 0;

    updateGraphic = () => {
        // **Resolved before generating, not after.** The standoff is an INPUT to the
        // shape — without it the multiple-strike zone has no second ring to draw — so
        // stamping it after the generator ran produced a symbol with one ring and a width
        // in its bag that nothing had read. Caught by drawing it in the running app; every
        // unit-level check passed, because they hand the generator a width up front.
        const bag = {...readGraphicLabels(this.graphics)};
        const standoff =
            this.graphicName === TacticalGraphicName.MinimumSafeDistanceMultipleStrike ? this.standoff(bag.width) : undefined;
        this.standoffInUse = standoff;

        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.graphicName,
            this.base,
            {
                size: this.graphicSize(),
                mirrored: this.mirrored,
                // Halved, because that is what `toGraphicOptions` hands a generator for a
                // public `width` and the generator doubles it straight back. Passing the
                // whole distance here would have made a graphic drawn in the app twice the
                // one restored from a file. @see standoffMetres
                ...(standoff !== undefined ? {radius: standoff / 2} : {}),
            }
        );
        if (!tacticalGraphic) return;
        const {graphic, handles, labels} = tacticalGraphic;

        this.graphics.setGeometry(graphic);
        const generated = (handles as MultiPoint).getCoordinates();
        const visible = visiblePathHandles(generated, pivotCoordinate(this.graphicName, this.base.getGeometry()?.getCoordinates()), this.hidesStartHandle);
        this.handleIndexOffset = generated.length - visible.length;
        this.handles.setGeometry(new MultiPoint(visible));

        // Persist the *effective* meter value rather than the viewport factor it came
        // from, so a restore replays a distance instead of re-deriving one from whatever
        // zoom it happens to be at. `decorationSize` is the schema's name for this scalar.
        writeGraphicProperties(this.getFeatures(), this.graphicName, bag, {
            decorationSize: this.graphicSize(),
            mirrored: this.mirrored,
            // The same number the shape was just built from, filed so a restore replays a
            // distance instead of re-deriving one from whatever zoom the file is opened at.
            ...(standoff !== undefined ? {width: standoff} : {}),
        });
    };

    setLabel = (labels: GraphicLabels): void => {
        this.graphicLabel = labels;

        // **A width that is a shape input has to rebuild the shape.**
        //
        // Amplifiers do not normally change geometry, so this used to write the bag and
        // stop. The multiple-strike zone's width is the standoff its outer ring is derived
        // from: typing a new one changed the number in the file and left the picture alone
        // until some later gesture happened to regenerate it. @see AirCorridor.setLabel,
        // which has done this since its own width became typeable.
        const filesStandoff = this.graphicName === TacticalGraphicName.MinimumSafeDistanceMultipleStrike;
        // The gap in force right now: a replayed or typed override, else the value already
        // stamped on the features, else the seed. Read BEFORE adopting anything, so the
        // comparison below is against what is on screen. @see standoff
        const inForce = filesStandoff ? (this.standoffInUse ?? this.standoff(readGraphicLabels(this.graphics).width)) : undefined;
        const typed = filesStandoff ? labels.width : undefined;
        const rebuild = typed !== undefined && Number.isFinite(typed) && typed > 0 && typed !== inForce;
        if (rebuild) this.standoffOverride = typed;

        // Carry the standoff through. `writeGraphicProperties` replaces the bag wholesale,
        // so a write that omits it erases the gap the graphic was drawn with — and then
        // nothing recomputes it, so editing any unrelated amplifier would silently reset
        // the zone. Same trap AirCorridor documents for its own width.
        writeGraphicProperties(this.getFeatures(), this.graphicName, labels, {
            decorationSize: this.graphicSize(),
            // The effective gap, not just an override: a graphic drawn a moment ago has its
            // standoff from the seed and no override at all, so keying off the override
            // erased the very thing this write exists to preserve.
            ...(filesStandoff ? {width: rebuild ? (typed as number) : (inForce as number)} : {}),
        });

        // After the write, so the regenerate reads the bag the operator just set.
        if (rebuild) this.updateGraphic();
    };

}