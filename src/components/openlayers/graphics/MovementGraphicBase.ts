import Feature from 'ol/Feature';
import {
    airCoordinatingCorridorStyleFunc,
    bridgeGraphicStyleFunc,
    createBaseFeature,
    createFeature,
    createHandleFeature,
    createInertHandleFeature,
    createOffsetHandleFeature,
    envelopmentGraphicStyleFunc,
    barSymbolStyleFunc,
    mobileDefenseGraphicStyleFunc,
    movementGraphicPathStyleFunc,
} from '../openlayerStyles';
import {MultiPoint, Point} from "ol/geom";
import LineString from "ol/geom/LineString";
import {LineGraphic, pivotCoordinate, visiblePathHandles} from '../controllers/LineGraphicController';
import {handlesAreInert, axisOf, axisWithWidthPoint, baseVertexCount, carriesSeparationInBase, carriesWidthPointInBase, groundLength, halfWidthFromBase, latitudeFromMercatorY, normalizeDrawnBase, TacticalGraphicName} from '@zaes/tactical-graphics';
import {fromLonLat, toLonLat} from 'ol/proj';
import type {Position} from 'geojson';
import {GraphicLabels} from "../../../utils/graphicLinkRegistry";
import openlayersAdapter from "../openlayersAdapter";
import {assignRole, readGraphicLabels, writeGraphicProperties} from "../graphicProperties";
import {decorationMeters} from './decorationPx';

/**
 * Drag sensitivity for the width handle, where the shared 0.5 default is wrong.
 * `TacticalGraphicsManager.handleOffset` sets `offset = perpendicularDistance ×
 * offsetScale`, so the factor must be the reciprocal of however many `offset`s
 * out the generator draws the handle — otherwise it runs away from the cursor.
 * The 0.5 default suits a handle drawn at two offsets out, which is where the
 * inherited `leftArrowHeadBase` sits.
 */
const OFFSET_SCALE: Partial<Record<TacticalGraphicName, number>> = {
    // Empty since 2026-09-05, when 140800 — its only entry — stopped deriving a width
    // handle and started storing point 3 as a vertex. Kept because the mechanism is real:
    // a graphic that draws its offset handle N widths out needs 1/N of the drag, and the
    // next one to do so belongs here. @see handles.ts OFFSET_SCALE, the portable twin
};

/**
 * The demolition obstacles, whose line work is a pair of rails stroked differently
 * per readiness state rather than the movement family's arrow.
 */
/**
 * How close two projected coordinates have to be to count as the same point when deciding
 * whether a settle changed anything. A millimetre, which is far inside the 4326 round trip's
 * own error and far outside anything an operator could drag. @see squared
 */
const SETTLED_EPSILON_M = 1e-3;

const BAR_SYMBOL_GRAPHIC_NAMES: TacticalGraphicName[] = [
    TacticalGraphicName.ExplosivesPlannedStateOfReadiness,
    TacticalGraphicName.ExplosivesStateOfReadiness1Safe,
    TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable,
];

export class MovementGraphicBase implements LineGraphic {
    offset: number;
    graphicLabels: GraphicLabels = {designation: ''};
    /** @see LineGraphic.offsetScale — read off the controller by the manager. */
    offsetScale?: number;

    base: Feature<LineString> = <Feature<LineString>>createBaseFeature();
    graphic: Feature = createFeature();
    labels: Feature = assignRole(new Feature<MultiPoint>(), 'label');
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

    /**
     * Which side an asymmetric movement graphic hangs its arrow on — MobileDefense's,
     * which leaves from one of the two ellipse arcs. Driven by the sign of the same
     * offset drag that sets the width. @see TacticalGraphicHandler.setMirrored
     */
    mirrored: boolean = false;

    /** @see TacticalGraphicHandler.setMirrored */
    setMirrored(mirrored: boolean) {
        if (mirrored === this.mirrored) return;
        this.mirrored = mirrored;
        this.updateGeometry();
    }

    constructor(name: TacticalGraphicName, offset: number, resolution: number = 0) {
        /*
         * **Points this graphic shows but nobody may drag.** The inert feature paints grey and
         * sets the flag the manager reads to refuse a grab. Assigned here rather than in the
         * field above because a field initializer cannot see the name — and stated in
         * `LineGraphicBase` too, because that holder implements the same interface separately
         * rather than sharing a base. The *fact* lives in the library. @see handlesAreInert
         */
        if (handlesAreInert(name)) this.handles = <Feature<MultiPoint>>createInertHandleFeature();
        this.offset = offset;
        this.graphicName = name;
        this.resolution = resolution;
        this.offsetScale = OFFSET_SCALE[name];

        if (resolution > 0) {
            this.labels.set('drawingResolution', resolution);
            this.graphic.set('drawingResolution', resolution);
        }

        this.setLabelStyle(name);
        if (name === TacticalGraphicName.Envelopment) {
            this.graphic.setStyle(envelopmentGraphicStyleFunc());
        }
        if (name === TacticalGraphicName.MobileDefense) {
            this.graphic.setStyle(mobileDefenseGraphicStyleFunc());
        }
        // The demolition obstacles moved here from the mission-task holder when they
        // became centerline-plus-width graphics, and their dashing came with them:
        // which of the two rails is hashed is what separates planned from safe from
        // armed. @see BAR_SYMBOL_DASHES, ai/app-6.md "F2"
        if (BAR_SYMBOL_GRAPHIC_NAMES.includes(name)) {
            this.graphic.setStyle(barSymbolStyleFunc(name));
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
                case TacticalGraphicName.AvenueOfApproach:
                case TacticalGraphicName.Counterattack:
                default:
                    return movementGraphicPathStyleFunc(name)(feature, resolution);
            }
        });
    }
    /**
     * Whether this graphic's separation lives in its **base** rather than beside it.
     *
     * The movement family carries a width as an amplifier because the base is a centreline
     * and nothing in it says how far the rails sit apart. The demolition block is not like
     * that as of 2026-09-05: 271201 gives point 3 the job, it is a stored vertex, and the
     * generator measures the distance. Stamping a `width` as well would be a second copy of
     * a number the coordinates already carry — which is how the two drift.
     * (User's call.) @see halfWidthFromSide
     */
    private get separationIsInTheBase(): boolean {
        return carriesSeparationInBase(this.graphicName);
    }

    setLabel = (labels: GraphicLabels) => {
        this.graphicLabels = labels;
        // Stamping fires a `change` event on each feature, which re-renders them.
        // `radius` travels with the amplifiers — a bare write would drop the offset.
        writeGraphicProperties(
            this.getFeatures(),
            this.graphicName,
            labels,
            // As above: the base's third point states both. @see separationIsInTheBase
            this.separationIsInTheBase ? {} : {width: this.offset * 2, mirrored: this.mirrored},
        );
    };

    /**
     * Where this graphic sits, in degrees, for anything sized in screen pixels.
     *
     * The first vertex, and zero before one exists — the holder is built when the tool is
     * picked and only learns its place when the user clicks. @see LineGraphicBase.latitude
     */
    private get latitude(): number {
        const first = this.base.getGeometry()?.getCoordinates()?.[0];
        return first ? latitudeFromMercatorY(first[1]) : 0;
    }

    updateGeometry = () => {
        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.graphicName,
            this.base,
            // At this graphic's own latitude, like the rest of the family: the decoration
            // is a pixel size and the bare resolution would make it a projected one.
            // @see LineGraphicBase.graphicSize
            {
                radius: this.offset,
                size: decorationMeters(this.graphicName, groundLength(this.resolution, this.latitude)),
                mirrored: this.mirrored,
            }
        );
        if (!tacticalGraphic) return;

        let {graphic, handles, labels} = tacticalGraphic;
        let handleCoords = (handles as MultiPoint).getCoordinates();

        this.graphic.setGeometry(graphic);
        /*
         * **As many path handles as the base has vertices**, which is two for the movement
         * family and three for the demolition block, whose point 3 became a placed vertex
         * on 2026-09-05. A fixed `slice(0, 2)` published the first two and left the third
         * to the offset handle below — right while that point was derived, and wrong once
         * it is one of the points the operator placed. @see BASE_VERTEX_COUNT
         */
        const pathHandles = baseVertexCount(this.graphicName) ?? 2;
        this.handles.setGeometry(new MultiPoint(visiblePathHandles(handleCoords.slice(0, pathHandles), pivotCoordinate(this.graphicName, this.base.getGeometry()?.getCoordinates()), this.hidesStartHandle)));

        // A generator that emits fewer than three handle points is declaring that
        // the graphic has no width to drag — its shape follows entirely from its
        // two endpoints (MobileDefense, which emits just the far one). Leave the
        // offset handle without a geometry and drop it from getFeatures(), so it
        // neither renders nor resolves to this controller on a pointer-down.
        this.hasOffsetHandle = handleCoords.length > pathHandles;
        if (this.hasOffsetHandle) {
            this.offsetHandle.setGeometry(new Point(handleCoords[pathHandles]));
        }

        this.labels.setGeometry(labels);

        // `offset` is the one thing here the user can change that the base geometry does
        // not describe — the width drag. Everything else rebuilds from the base plus the
        // drawing resolution. Published after the offset-handle test above so the write
        // covers the feature set that actually exists.
        writeGraphicProperties(this.getFeatures(), this.graphicName, {...readGraphicLabels(this.graphic)}, {
            /*
             * **Neither the width nor the side, where the base's third point states both.**
             *
             * `width` came off on 2026-09-05; `mirrored` stayed and should not have. The three
             * point graphics — the demolition block, the infiltration lane and 152800 — all
             * ignore it: rendering each with `mirrored` true and false gives byte-identical
             * geometry, because which side the symbol falls on *is* where point 3 was placed.
             * A stamped flag beside it is a second copy of the same fact, and the pair drift.
             * (User's call, 2026-09-06.) @see separationIsInTheBase
             */
            ...(this.separationIsInTheBase
                ? {}
                : {width: this.offset * 2, mirrored: this.mirrored}),
        });
    };
    getBaseGraphicFeature = (): Feature<LineString> => {
        return this.base;
    }

    setSymbolId = (symbolId: string) => {
        this.symbolId = symbolId;
        // `handles` was missing, and `getFeatures()` is length-variable (the offset
        // handle comes and goes), so stamp the live set plus the two that can fall
        // outside it rather than a hand-written list.
        [...this.getFeatures(), this.handles, this.offsetHandle]
            .forEach(f => f.set('symbolId', this.symbolId));
    };

    /**
     * **The one door every base change comes through, so it is where the width point is put
     * back square.**
     *
     * `LineGraphicController.settle` does this for the graphics that drag their own vertices,
     * and this family does not — so an edit that reached the base another way left the point
     * wherever the cursor dropped it. Measured on the running app before this: a 90 px vertical
     * drag on an avenue of approach's grip moved the stored point straight up and left its
     * longitude untouched, where MapLibre — which normalizes inside `buildTacticalGraphic`, on
     * every build — had already squared it onto the arrowhead's corner. The two engines stored
     * different coordinates for the same gesture.
     *
     * Guarded on the predicate rather than run for the whole family, because everything else
     * this holder draws has a base whose every coordinate is a route point and nothing to
     * square. @see normalizeDrawnBase, carriesWidthPointInBase
     */
    setBaseFeature(base: Feature<LineString>) {
        const incoming = base.getGeometry();
        this.base.setGeometry(this.squared(incoming) ?? incoming);
        this.updateGeometry();
    }

    /**
     * The incoming geometry with its width point put back square, or `undefined` when there is
     * nothing to change.
     *
     * **Compared by content, and never mutated in place.** This holder's controller listens on
     * the base geometry's `change`, so writing coordinates into the geometry it was handed
     * re-enters this method — measured as a stack overflow on the second click of every draw.
     * A fresh `LineString` fires the same event once, and the pass it triggers finds the
     * coordinates already settled and returns `undefined`, which ends it.
     *
     * The comparison needs a tolerance rather than equality: the trip out to degrees and back
     * is not bit-exact, so `squareWidthPoint` returns a point a few nanodegrees from the one it
     * was given and an identity test would never converge. A nanodegree is about 0.1 mm.
     */
    private squared(incoming: LineString | undefined): LineString | undefined {
        if (!carriesWidthPointInBase(this.graphicName) || !incoming) return undefined;
        const projected = incoming.getCoordinates();
        // The library speaks degrees and these are projected metres, as everywhere else on
        // this boundary. @see LineGraphicController.settle
        const settled = normalizeDrawnBase(this.graphicName, projected.map(c => toLonLat(c)) as Position[]);
        const next = settled.map(c => fromLonLat(c as [number, number]));
        const unchanged = next.length === projected.length
            && next.every((c, i) => Math.hypot(c[0] - projected[i][0], c[1] - projected[i][1]) < SETTLED_EPSILON_M);
        return unchanged ? undefined : new LineString(next);
    }

    /**
     * The half-width, in ground metres, from a width drag or a restore.
     *
     * **For the eleven axis arrows this moves a stored coordinate**, because that coordinate is
     * the only statement of the width they have — `this.offset` is only what the generator is
     * offered when the base carries no point yet, which is a legacy save or a graphic mid-draw.
     * Writing the base here rather than in `updateGeometry` keeps the write to the gestures that
     * mean it: a rebuild must not author geometry. @see axisWithWidthPoint
     */
    setOffset(offset: number) {
        this.offset = offset;
        const geometry = this.base.getGeometry();
        if (carriesWidthPointInBase(this.graphicName) && geometry) {
            // The library speaks degrees and these are projected metres, as everywhere else on
            // this boundary. @see LineGraphicController.settle
            const stored = geometry.getCoordinates().map(c => toLonLat(c)) as Position[];
            if (stored.length >= 2) {
                const moved = axisWithWidthPoint(this.graphicName, axisOf(this.graphicName, stored), offset);
                geometry.setCoordinates(moved.map(c => fromLonLat(c as [number, number])));
            }
        }
        this.updateGeometry();
    }

    /**
     * The half-width a width drag starts from, so the manager's latched delta begins where the
     * graphic already is rather than where the cursor happens to have grabbed.
     *
     * Reads the stored coordinate for the eleven, and `this.offset` for everything else.
     * @see TacticalGraphicsManager.handleOffset
     */
    currentOffset(): number | undefined {
        if (!carriesWidthPointInBase(this.graphicName)) return this.offset;
        const stored = this.base.getGeometry()?.getCoordinates()?.map(c => toLonLat(c)) as Position[] | undefined;
        return halfWidthFromBase(this.graphicName, stored) ?? this.offset;
    }

    getFeatures(): Feature[] {
        const features = [this.graphic, this.labels, this.handles, this.base];
        return this.hasOffsetHandle ? [...features, this.offsetHandle] : features;
    }
}