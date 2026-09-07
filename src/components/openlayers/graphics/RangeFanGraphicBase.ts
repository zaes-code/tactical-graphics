import {Stroke, Style} from "ol/style";
import {Coordinate} from "ol/coordinate";
import {fromLonLat, toLonLat} from "ol/proj";
import type {Position} from "geojson";
import {MultiLineString, MultiPoint} from "ol/geom";
import {RadarSearchFrame, RangeFanOptions, TacticalGraphicName, TacticalGraphicProperties} from '@zaes/tactical-graphics';
import {GraphicLabels} from "../../../utils/graphicLinkRegistry";
import {MissionTaskGraphicBase} from "./MissionTaskGraphicBase";
import {latitudeFromMercatorY, projectedLength} from '@zaes/tactical-graphics';
import openlayersAdapter from "../openlayersAdapter";
import {getRangeFanLabelStyleFn, LINE_WIDTH, radarSearchDoctrineStyleFunc, readHostilityColor} from "../openlayerStyles";
import {RSD_DEFAULT_RELATIVE_BEARING_DEG, RSD_DEFAULT_START_SHARE, radarSectorOpening, resolveBandAzimuths, resolveBands, resolveRangeFanBands, rotationToAzimuth} from '@zaes/tactical-graphics';
import {writeGraphicProperties} from "../graphicProperties";

/**
 * Specialised base for the two doctrinal weapon/sensor range fans. Layered
 * on top of MissionTaskGraphicBase so the controller plumbing
 * (size/rotation drag, translate/rotate handles) is reused — the only
 * differences are:
 *   1. The geometry generator receives the user-edited multi-band config
 *      (bands + azimuths) as RangeFanOptions, which means setLabel must
 *      regenerate geometry, not just restyle.
 *   2. The graphic feature is a MultiLineString of arcs/edges/axis, so it
 *      gets a plain stroke style (no text); the label feature is a
 *      MultiPoint whose vertices anchor per-band and azimuth text drawn by
 *      getRangeFanLabelStyleFn.
 *
 * Wired through MissionTaskController via the `rangeFan` factory in
 * controllerRegistry.
 */
/**
 * Minimum gap between two rings when one is dragged towards the other, as a
 * fraction of the outermost band's range — proportional so the rings stay
 * visibly apart whatever size the fan is.
 */
const BAND_SEPARATION_FRACTION = 0.02;

/**
 * The narrowest a sector band's wedge may be dragged, in degrees.
 *
 * A wedge dragged to zero width is a line, and dragged through zero it turns inside out —
 * the left edge ends up right of the right edge and the arc takes the long way round the
 * circle. Neither is recoverable by dragging back, because there is no longer an arc under
 * the cursor to grab.
 */
const MIN_SECTOR_ARC_DEG = 5;

/** Wraps any angle into [0, 360). */
const normAz = (deg: number): number => ((deg % 360) + 360) % 360;

/** The signed turn from `from` to `to`, in (-180, 180]. */
const angleDelta = (from: number, to: number): number => {
    const d = normAz(to - from);
    return d > 180 ? d - 360 : d;
};

export class RangeFanGraphicBase extends MissionTaskGraphicBase {
    graphicLabels: GraphicLabels = {designation: ''};

    constructor(
        name: TacticalGraphicName,
        size: number,
        drawingResolution?: number,
    ) {
        super(name, size, drawingResolution);

        /*
         * **The radar search doctrine rides this holder but paints itself.**
         *
         * 200700 is the same kind of symbol as the sector fan — one anchor point, ranges
         * stated as numbers, an axis and an opening — so it wants the band editor, the rim
         * handles and the inert centre this class provides. What it does not want is the
         * fan's stroke: it has a filled cyan sector of its own, and its field `T` rides the
         * graphic's own geometry collection rather than a separate label feature, so
         * attaching the fan's label style would draw a designation the paint has already
         * drawn. @see radarSearchDoctrinePaint, RadarSearchDoctrine
         */
        if (name === TacticalGraphicName.RadarSearchDoctrine) {
            this.graphic.setStyle(radarSearchDoctrineStyleFunc());
        } else {
            // Range fans render the geometry as plain strokes — nothing fancy
            // (no fill, no per-feature label baked into the line).
            this.graphic.setStyle((feature) => {
                const color = readHostilityColor(feature);
                return new Style({
                    stroke: new Stroke({color, width: LINE_WIDTH()}),
                });
            });

            // Band metadata is stamped on the label feature by updateGeometry; the
            // style function reads it (and any amplifiers) straight off the feature.
            this.label.setStyle(getRangeFanLabelStyleFn(name));
        }

        writeGraphicProperties([this.graphic, this.label, this.handles], name, this.graphicLabels);
    }

    /**
     * Which band the current gesture is moving, or nothing when it is not moving one.
     *
     * A fan has a range per ring, so "the size" is not one number and the inherited read-out
     * — which reports `size`, the outermost — named the wrong ring for every drag but the
     * last one. Dragging 200700's *start* range showed the stop range's figure sitting still
     * while the arc under the hand moved. @see measureStated
     */
    private measuringBand?: number;

    /** The range of the band being dragged, which is the number the hand is changing. */
    protected measureStated(): number {
        const band = this.bandBeingDragged();
        return band?.range ?? super.measureStated();
    }

    /**
     * Names the ring, because a two-ring symbol's figure does not say which is moving.
     *
     * 200700's two are named individually by its plate — a start range and a stop range — so
     * those are the words. A weapon fan's rings are an arbitrary stack with no doctrinal
     * names, so it keeps the bare figure it has always shown. @see fixedBands
     */
    protected measureCaption(): string | undefined {
        if (this.measuringBand === undefined) return super.measureCaption();
        if (this.name !== TacticalGraphicName.RadarSearchDoctrine) return super.measureCaption();
        return ['Start', 'Stop'][this.measuringBand] ?? undefined;
    }

    /** The line stops on the ring being dragged, not on the outermost one. */
    protected measureEdge(): Coordinate | undefined {
        const band = this.bandBeingDragged();
        const anchor = this.gestureAnchor;
        const center = this.centerCoordinate();
        if (!band || !anchor || !center) return super.measureEdge();

        // Projected metres, like the parent: the line lives in EPSG:3857 and a ground
        // distance laid out raw falls short by cos(latitude). @see mercator.ts
        const reach = projectedLength(band.range, latitudeFromMercatorY(center[1]));
        const dx = anchor[0] - center[0];
        const dy = anchor[1] - center[1];
        const len = Math.hypot(dx, dy);
        if (!(len > 0) || !(reach > 0)) return super.measureEdge();
        return [center[0] + (dx / len) * reach, center[1] + (dy / len) * reach];
    }

    private bandBeingDragged(): {range: number} | undefined {
        if (this.measuringBand === undefined) return undefined;
        if (this.isRadarSearch) {
            if (!this.radar) return undefined;
            // 200700 has two named ranges rather than a stack of rings. @see radar
            const range = this.measuringBand === 0 ? this.radar.startRange : this.radar.stopRange;
            return range === undefined ? undefined : {range};
        }
        return resolveBands(this.currentOptions())[this.measuringBand];
    }

    /**
     * Re-runs geometry generation with the current `graphicLabels.rangeFan`
     * config merged in. Called both by the parent's drag pipeline (size /
     * rotation changes) and by setLabel (bands / azimuths changed).
     */
    /**
     * 200700's four numbers — **the whole description of the symbol**, and what it saves as.
     *
     * It used to be held as the fans' `rangeFan` bands with the axis smuggled into `rotation`
     * and the opening into a pair of absolute band azimuths, because it shares this holder.
     * The saved file then described a radar search doctrine in a different symbol's terms,
     * and two of the four values the plate names appeared nowhere under their own names.
     * (User's report, 2026-09-05.) @see TacticalGraphicProperties.searchAxisAzimuthDeg
     *
     * `startRange` is absent between the second click and the third, which is what the
     * generator reads as "half drawn" and draws a bare arc for.
     */
    private radar?: {
        searchAxisAzimuthDeg: number;
        startRange?: number;
        stopRange: number;
        stopRelativeBearingDeg: number;
    };

    /** The four, as generator options — empty for the two weapon fans, which have none. */
    private radarOptions(): Partial<RangeFanOptions> {
        return this.radar ? {...this.radar} : {};
    }

    /** Whether this holder is carrying 200700 rather than one of the two weapon fans. */
    private get isRadarSearch(): boolean {
        return this.name === TacticalGraphicName.RadarSearchDoctrine;
    }

    /**
     * Keeps 200700's stated ranges in step with an inherited **resize**.
     *
     * A resize is the one gesture that moves the symbol's size without going through a grip
     * that names a range: it drives `size` on the holder, which every point-anchored graphic
     * has. With the ranges stated separately, a resized 200700 drew at the new size and *saved*
     * at the old one — it came back its original size, which is what
     * `manipulateRoundTrip.test.ts` caught. Both ranges scale, because a resize scales the
     * whole symbol rather than moving one arc.
     */
    private syncRadarState(): void {
        if (!this.isRadarSearch || !(this.size > 0)) return;

        /*
         * **Every 200700 carries its four, however it was made.** A graphic built without a
         * draw — the sample gallery, a thumbnail, a host constructing one, `manipulateRoundTrip`
         * — never reaches `applyRadarSearchFrame`, so it had no stated shape and saved an empty
         * bag: it drew correctly off the inherited `size` and `rotation` and came back at a
         * fallback size. Seeded from those two, with the plate's own default proportions.
         */
        if (!this.radar) {
            this.radar = {
                searchAxisAzimuthDeg: normAz(90 - this.rotation),
                startRange: this.size * RSD_DEFAULT_START_SHARE,
                stopRange: this.size,
                stopRelativeBearingDeg: RSD_DEFAULT_RELATIVE_BEARING_DEG,
            };
            return;
        }

        /*
         * **`searchAxisAzimuthDeg` and `rotation` are one bearing**, and this is the one place
         * that says so. Every inherited gesture drives `rotation` — the rotate affordance, a
         * restore, the selection box — while the generator reads the azimuth, so maintaining
         * the identity here rather than inside each gesture is what stops the symbol turning
         * under some routes and not others. The dialog writes the azimuth and sets `rotation`
         * from it, so the invariant holds in both directions. @see setLabel
         */
        const axis = normAz(90 - this.rotation);

        /*
         * **A resize moves `size` without naming a range.** It is the one gesture that changes
         * the symbol's scale outside a grip, so both ranges scale with it — otherwise a resized
         * 200700 drew at the new size and saved at the old one.
         */
        const stop = this.radar.stopRange;
        const scale = stop > 0 && Math.abs(this.size - stop) > 1e-6 ? this.size / stop : 1;
        this.radar = {
            ...this.radar,
            searchAxisAzimuthDeg: axis,
            startRange: this.radar.startRange === undefined ? undefined : this.radar.startRange * scale,
            stopRange: this.size,
        };
    }

    updateGeometry = () => {
        this.syncRadarState();
        const rangeFan = this.graphicLabels?.rangeFan;
        const opts: RangeFanOptions = {
            size: this.size,
            rotation: this.rotation,
            bands: rangeFan?.bands,
            centerAzimuthDeg: rangeFan?.centerAzimuthDeg,
            // 200700 is described by its own four numbers; the band fields above stay for the
            // two weapon fans, and for a 200700 restored from a snapshot written before
            // 2026-09-05, whose four are still in that shape. @see RadarSearchDoctrine.frame
            ...this.radarOptions(),
        };
        const tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.name,
            this.base,
            opts,
        );
        if (!tacticalGraphic) return;
        const {graphic, handles, labels} = tacticalGraphic;

        this.graphic.setGeometry(graphic as MultiLineString);
        // Same split as every other circle graphic: the center becomes the gray
        // inert dot, and what stays on `handles` is one draggable rim per band,
        // in sorted band order — which is what `setBandRange` indexes into.
        this.publishHandles(handles as MultiPoint);
        this.label.setGeometry(labels);
        // Stamp the drawn size on every feature in the group so the dialog
        // can read it no matter which one the user clicked (the visible
        // feature is the graphic MultiLineString, not the label point).
        this.label.set('graphicSize', this.size);
        this.graphic.set('graphicSize', this.size);

        // Stamp the resolved bands directly on the OL label feature so the
        // style fn can read them via feature.get(...). The adapter
        // discards properties from the GeoJSON feature returned by the
        // generator (only the geometry survives), so we have to mirror
        // them here using the same resolver helpers the generator uses —
        // that keeps the defaults consistent (single band at the drawn
        // radius; sector per-band azimuths fall back through band → config
        // → ±45° around the drawn rotation).
        const {shape, bands} = resolveRangeFanBands(this.name, opts);
        this.label.set('rangeFanShape', shape);
        this.label.set('rangeFanBands', bands);

        // Bands ride in the amplifiers already; `size` and `rotation` do not, and a
        // fan restored without them loses its drawn radius and bearing.
        this.publishGeometryState();
    };

    /**
     * Takes 200700's three clicks, already read into its four numbers.
     *
     * **The axis goes into `rotation`, not into `centerAzimuthDeg`.** Both reach
     * `resolveCenterAzimuth` and `centerAzimuthDeg` wins — which is exactly why the drawn
     * axis must not be filed there: the rotate gesture turns `rotation`, so an axis stamped
     * as a centre azimuth would outrank every rotation the user then applied and the symbol
     * would sit still under a drag that visibly moved its handle. `rotation` is degrees
     * counter-clockwise from east, so the azimuth converts on the way in.
     * @see rotationToAzimuth, radarSearchFromClicks
     *
     * One range means the operator has clicked twice and the second arc is undecided; the
     * generator draws the bare arc for that. Two closes the sector. Either way the bands are
     * the amplifier the band editor already edits, so a symbol drawn this way and one typed
     * into the dialog are the same symbol. @see RadarSearchDoctrine.frame
     */
    applyRadarSearchFrame(frame: RadarSearchFrame): void {
        const stop = frame.ranges[frame.ranges.length - 1];
        if (!Number.isFinite(stop) || stop <= 0) return;

        this.radar = {
            searchAxisAzimuthDeg: normAz(frame.centerAzimuthDeg),
            // Absent until the third click settles which of the two ranges is which.
            startRange: frame.ranges.length > 1 ? frame.ranges[0] : undefined,
            stopRange: stop,
            stopRelativeBearingDeg: this.radar?.stopRelativeBearingDeg ?? RSD_DEFAULT_RELATIVE_BEARING_DEG,
        };
        /*
         * **`rotation` still tracks the axis**, even though it is no longer what the symbol
         * is saved as. Every gesture the holder inherits — translate, resize, the selection
         * box — measures against it, so leaving it stale would make the symbol turn under a
         * resize. The generator reads `searchAxisAzimuthDeg` and ignores it.
         */
        this.updateGeom({
            center: fromLonLat(frame.center as Coordinate),
            size: stop,
            rotation: normAz(90 - frame.centerAzimuthDeg),
        });
        this.publishRadar();
    }

    /** Stamps the four numbers on every feature, which is what a save and the dialog read. */
    private publishRadar(): void {
        writeGraphicProperties(this.getFeatures(), this.name, this.graphicLabels, this.radarOptions());
    }

    /**
     * Turns the symbol, and hands the axis back to the gesture.
     *
     * 200700's search axis has two possible homes and `centerAzimuthDeg` outranks `rotation`
     * — so a typed azimuth would otherwise pin the symbol against every later rotate, which
     * is the trap `applyRadarSearchFrame` avoids by never writing it. The modal *does* write
     * it, because the plate names the azimuth and an operator has to be able to state it. So
     * the two are ordered rather than merged: **typing wins until a rotate, and a rotate
     * takes it back** by dropping the typed value, after which the axis is the drawn bearing
     * again. The modal shows whichever is in force, so the field is never blank and never
     * disagrees with the symbol. @see resolveCenterAzimuth
     */
    handleRotate(delta: number): void {
        /*
         * **The axis is a stated value now, so a turn has to restate it.**
         *
         * `rotation` is still advanced, because every inherited gesture measures against it,
         * but the generator reads `searchAxisAzimuthDeg` — so a rotate that only moved
         * `rotation` would turn the frame and leave the sector pointing where it was. The two
         * are kept in step here, which is the one place a turn happens.
         *
         * A rotate is also the answer to "what if the operator typed an azimuth and then
         * dragged?": the drag wins, because it rewrites the same field.
         */
        // The axis follows `rotation` through `syncRadarState`, which `updateGeom` runs — one
        // statement of the identity rather than one per gesture. @see syncRadarState
        this.updateGeom({rotation: this.rotation + delta});
        if (this.isRadarSearch) {
            this.publishRadar();
            return;
        }
        writeGraphicProperties(this.getFeatures(), this.name, this.graphicLabels, {
            radius: this.size,
            rotation: this.rotation,
        });
    }

    /**
     * What a 200700 is written to a file as: **its own four numbers and nothing else.**
     *
     * The inherited stamp files `radius` and `rotation`, which for this symbol are a second
     * copy of the stop range and the search axis — the same "one fact stated twice" the
     * demolition block's `width` was, and the reason a consumer reading the GeoJSON found a
     * range fan's amplifiers instead of the values the plate names. (User's report,
     * 2026-09-05.)
     *
     * The two weapon fans are untouched: they really are described by bands and a drawn
     * radius. @see TacticalGraphicProperties.searchAxisAzimuthDeg
     */
    protected publishGeometryState(extra?: Parameters<MissionTaskGraphicBase['publishGeometryState']>[0]): void {
        if (!this.isRadarSearch) return super.publishGeometryState(extra);
        writeGraphicProperties(this.getFeatures(), this.name, this.graphicLabels, {
            ...this.radarOptions(),
            ...extra,
        });
    }

    /**
     * Adopts a restored 200700's four numbers off the base feature.
     *
     * Restore seeds the base geometry and replays the amplifiers; the four are geometry
     * inputs, so they arrive stamped on the base rather than through `setLabel`. Reading them
     * here — the one door a restore comes through — is what keeps the round trip closed
     * without persistence needing to know this symbol exists.
     *
     * A snapshot written before 2026-09-05 carries none of them and falls through to the
     * generator's own reading of the bands and the rotation. @see RadarSearchDoctrine.frame
     */
    /**
     * Adopts a restored 200700's four numbers.
     *
     * Called by `applyRestoredGeometry` before it rebuilds the frame, because a
     * point-anchored graphic restores through `updateGeom` — there is no `setBaseFeature` on
     * that path to read them off the base. A snapshot written before 2026-09-05 carries none
     * of them and falls through to the generator's own reading of the bands and the rotation.
     * @see RadarSearchDoctrine.frame
     */
    adoptStatedShape(state: Partial<TacticalGraphicProperties>): void {
        if (!this.isRadarSearch) return;
        if (state.stopRange === undefined || state.searchAxisAzimuthDeg === undefined) return;
        this.radar = {
            searchAxisAzimuthDeg: normAz(state.searchAxisAzimuthDeg),
            startRange: state.startRange,
            stopRange: state.stopRange,
            stopRelativeBearingDeg: state.stopRelativeBearingDeg ?? RSD_DEFAULT_RELATIVE_BEARING_DEG,
        };
        this.size = state.stopRange;
        this.rotation = normAz(90 - state.searchAxisAzimuthDeg);
    }

    setLabel = (labels: GraphicLabels) => {
        this.graphicLabels = labels;
        /*
         * **The dialog edits 200700's four numbers, so they arrive here.**
         *
         * They are geometry inputs rather than amplifiers, but they ride the label bag for the
         * same reason `rangeFan` does — it is the bag a properties dialog writes. Adopted into
         * the holder's own state so the next render and the next save both see them, and
         * republished below through `publishRadar` rather than as `radius`/`rotation`.
         */
        if (this.isRadarSearch) {
            const typed = labels as Partial<TacticalGraphicProperties>;
            if (typed.stopRange !== undefined || typed.searchAxisAzimuthDeg !== undefined) {
                const stopRange = Math.max(typed.stopRange ?? this.radar?.stopRange ?? this.size, 1);
                this.radar = {
                    searchAxisAzimuthDeg: normAz(typed.searchAxisAzimuthDeg ?? this.radar?.searchAxisAzimuthDeg ?? 0),
                    startRange: typed.startRange ?? this.radar?.startRange,
                    stopRange,
                    stopRelativeBearingDeg:
                        typed.stopRelativeBearingDeg ?? this.radar?.stopRelativeBearingDeg ?? RSD_DEFAULT_RELATIVE_BEARING_DEG,
                };
                this.size = stopRange;
                this.rotation = normAz(90 - this.radar.searchAxisAzimuthDeg);
            }
            this.updateGeometry();
            this.publishRadar();
            return;
        }
        // Bands or azimuths may have changed → geometry must be redrawn,
        // not just the labels restyled.
        this.updateGeometry();
        // Stamping fires a `change` event on each feature, which re-renders them.
        // Carries the geometry inputs through: a bare write here would drop the
        // `size`/`rotation` `updateGeometry` just published.
        writeGraphicProperties(this.getFeatures(), this.name, labels, {radius: this.size, rotation: this.rotation});
    };

    /**
     * Drags band `bandIndex`'s ring to `coordinate`. `bandIndex` counts in the
     * **sorted** band order, matching the rim handles `generateHandles` emits.
     *
     * The new range is the *geodesic* distance from the center in kilometers —
     * `RangeFanBand.range` is km and the generator spends it through
     * `turf.destination`, so measuring the same way is what makes the ring land
     * under the cursor at any latitude. Measuring in EPSG:3857 map units would
     * only agree near the equator.
     *
     * **Clamped between its neighbors**, which is what keeps an inner ring from
     * expanding past the outer one. Neighbor clamping rather than a bare
     * "not past the outermost" rule, because `resolveBands` re-sorts on every
     * render: if a ring could cross its neighbor, the sorted index the drag is
     * holding would start pointing at a different band halfway through the
     * gesture.
     */
    setBandRange = (handleIndex: number, coordinate: Coordinate): void => {
        // The holder's own center, not the base's coordinates: a base can carry APP-06
        // anchor points now, and a range fan must not read those as a position.
        const center = this.centerCoordinate();
        if (!center) return;

        /*
         * **The index says which of three things was grabbed.** The sector publishes three
         * handles per band -- `[rim x N, then left, right per band]` -- so anything past
         * the rims is an arc end and moves a bearing rather than a range. The circular fan
         * publishes only rims, so this branch never fires for it.
         *
         * The split is arithmetic on the generator's documented order and nothing else.
         * There is no marker on a handle to read: the renderer strips the centre and hands
         * over a bare index. @see WeaponRangeFanSector.generateHandles
         */
        const bandCount = resolveBands(this.currentOptions()).length;
        /*
         * **200700 publishes one arc grip, not two per band.** Its opening is a single number
         * — a *stop relative bearing* that is "an equal angle either side of the search axis"
         * — so there is one thing to drag and it moves both edges. The sector fan's
         * `left, right per band` arithmetic below would read this index as band 0's left edge
         * and open the wedge only one way. @see RadarSearchDoctrine.generateHandles
         */
        if (this.isRadarSearch) {
            /*
             * **Two range grips, then the opening** — a fixed three, because 200700's shape is
             * four stated numbers rather than a stack of rings. Asking `resolveBands` how many
             * there are answers 1 (its fallback single band), which sent the stop-range grip to
             * the opening. @see RadarSearchDoctrine.generateHandles
             */
            const ranges = 2;
            if (handleIndex >= ranges) {
                // The opening swings an angle; the read-out formats a distance, so it stays
                // off rather than reporting a range nobody is changing.
                this.measuringBand = undefined;
                this.showMeasure(false);
                this.setRadarHalfAngle(coordinate);
            } else {
                this.setRadarRange(handleIndex, coordinate);
                this.measuringBand = handleIndex;
                this.showMeasure(true, coordinate);
            }
            return;
        }
        if (handleIndex >= bandCount) {
            const arcHandle = handleIndex - bandCount;
            // An arc end swings a bearing, not a range — same reasoning as 200700's opening.
            this.measuringBand = undefined;
            this.showMeasure(false);
            this.setBandAzimuth(arcHandle >> 1, arcHandle % 2 === 0 ? 'left' : 'right', coordinate);
            return;
        }
        const bandIndex = handleIndex;
        // A rim drag sets that band's range, which is exactly what a read-out reports.
        this.measuringBand = bandIndex;
        this.showMeasure(true, coordinate);

        // `getTurfDistance` is kilometers by contract and stays that way — it is a general
        // adapter method. Bands are metres as of 3.2.0, so the conversion is explicit here
        // rather than hidden in the adapter. @see RangeFanBand.range
        const metres =
            openlayersAdapter.getTurfDistance(
                openlayersAdapter.coordinateToTurfPoint(center),
                openlayersAdapter.coordinateToTurfPoint(coordinate),
            ) * 1000;
        if (!Number.isFinite(metres) || metres <= 0) return;

        const configBands = this.graphicLabels?.rangeFan?.bands;
        const sorted = resolveBands(this.currentOptions());
        if (bandIndex < 0 || bandIndex >= sorted.length) return;

        // Keep rings visibly apart, proportional to the fan so the gap holds up
        // at any size.
        const gap = sorted[sorted.length - 1].range * BAND_SEPARATION_FRACTION;
        const min = bandIndex === 0 ? gap : sorted[bandIndex - 1].range + gap;
        const max = bandIndex === sorted.length - 1 ? Number.POSITIVE_INFINITY : sorted[bandIndex + 1].range - gap;
        const clamped = Math.min(Math.max(metres, min), Math.max(min, max));

        // No user-entered bands: the fan is rendering `resolveBands`' fallback
        // single band derived from `size`, so drive `size` and leave the
        // amplifiers alone rather than inventing a band the user never typed.
        if (!configBands || configBands.length === 0) {
            // Both metres as of 3.2.0 — this used to scale a kilometer band up to `size`.
            this.size = clamped;
            this.updateGeometry();
            return;
        }

        // `resolveBands` sorts a copy of the array but keeps the band objects,
        // so the sorted entry is identity-equal to one of the user's rows.
        const target = configBands.indexOf(sorted[bandIndex]);
        if (target < 0) return;

        const nextBands = configBands.map((band, i) => (i === target ? {...band, range: clamped} : band));
        this.setLabel({
            ...this.graphicLabels,
            rangeFan: {...this.graphicLabels.rangeFan, bands: nextBands},
        });
    };

    /**
     * Turns the whole fan, **carrying its bearings with it**.
     *
     * A range fan's azimuths are absolute compass bearings, and they live in two places the
     * base class knows nothing about: `centerAzimuthDeg` on the config, and an optional
     * `leftAzimuthDeg` / `rightAzimuthDeg` on every band. `resolveCenterAzimuth` prefers
     * the stated centre azimuth over `rotation` outright — so on a fan whose bearings had
     * been typed, the rotate gesture moved the axis arrow and **nothing else**: the wedges
     * stayed where they were, the printed bearings kept their old values, and the arrow
     * ended up pointing out of its own fan. That is what the user saw.
     *
     * So a rotate is folded into the numbers instead of competing with them. Every stated
     * bearing turns by the same delta, the printed values change with the symbol, and
     * `rotation` still moves so a fan with no stated bearings at all behaves as before.
     *
     * The delta is taken in *azimuth*, not rotation: `rotationToAzimuth` mirrors as well as
     * offsets (`90 - r`), so a bare `rotation` delta turns the bearings the wrong way.
     */
    updateGeom(changes: {size?: number; center?: Coordinate; rotation?: number}): void {
        const turned = changes.rotation !== undefined && changes.rotation !== this.rotation;
        if (turned) {
            const delta = angleDelta(rotationToAzimuth(this.rotation), rotationToAzimuth(changes.rotation!));
            if (delta !== 0) this.turnStatedAzimuths(delta);
        }
        super.updateGeom(changes);
        // The turn rewrote amplifiers, not just geometry, and `updateGeom` publishes only
        // the geometry state -- so the new bearings would live on the holder and never
        // reach the feature, which is where a save and the dialog both read them.
        if (turned) {
            writeGraphicProperties(this.getFeatures(), this.name, this.graphicLabels, {
                radius: this.size,
                rotation: this.rotation,
            });
        }
    }

    /** Adds `delta` degrees to every bearing the operator has actually stated. */
    private turnStatedAzimuths(delta: number): void {
        const config = this.graphicLabels?.rangeFan;
        if (!config) return;

        const centerAzimuthDeg =
            config.centerAzimuthDeg === undefined ? undefined : normAz(config.centerAzimuthDeg + delta);
        const bands = config.bands?.map(band => ({
            ...band,
            leftAzimuthDeg: band.leftAzimuthDeg === undefined ? undefined : normAz(band.leftAzimuthDeg + delta),
            rightAzimuthDeg: band.rightAzimuthDeg === undefined ? undefined : normAz(band.rightAzimuthDeg + delta),
        }));
        if (centerAzimuthDeg === undefined && !bands) return;

        this.graphicLabels = {...this.graphicLabels, rangeFan: {...config, centerAzimuthDeg, bands}};
    }

    /**
     * Drags one end of band `bandIndex`'s arc to a new bearing.
     *
     * **A band with no stated bearings gets them here**, resolved from whatever it was
     * already drawing, rather than only the edge that was grabbed. Writing one and leaving
     * the other to fall back would move both: the fallback is `centre ± 45`, so the moment
     * one edge is stated the other stops tracking it and the wedge changes width by however
     * far the drag went, on the side nobody touched.
     */
    /**
     * Drags 200700's start or stop arc to the cursor, along the search axis.
     *
     * Only the *distance* from the radar counts: the axis is the symbol's own and is moved by
     * the rotate gesture, so a grip dragged off it states a range and not a new bearing —
     * the same discipline the third click is read with. @see radarSearchFromClicks
     *
     * Kept apart by {@link BAND_SEPARATION_FRACTION}, so the near arc cannot be pushed
     * through the far one and leave the sector inside out.
     */
    private setRadarRange(which: number, coordinate: Coordinate): void {
        const center = this.centerCoordinate();
        if (!center || !this.radar) return;
        const metres =
            openlayersAdapter.getTurfDistance(
                openlayersAdapter.coordinateToTurfPoint(center),
                openlayersAdapter.coordinateToTurfPoint(coordinate),
            ) * 1000;
        if (!Number.isFinite(metres) || metres <= 0) return;

        /*
         * **Kept apart**, so the near arc cannot be pushed through the far one and leave the
         * sector inside out — the same proportional gap the fans' rings keep, and there is no
         * arc under the cursor to drag back with once it has crossed.
         */
        const gap = this.radar.stopRange * BAND_SEPARATION_FRACTION;
        const start = this.radar.startRange ?? 0;
        const next =
            which === 0
                ? {startRange: Math.min(Math.max(metres, gap), Math.max(gap, this.radar.stopRange - gap))}
                : {stopRange: Math.max(metres, start + gap)};

        this.radar = {...this.radar, ...next};
        // The stop range is also the holder's `size`, which is what the label scale and the
        // selection box read, and what a legacy consumer still expects to find.
        this.size = this.radar.stopRange;
        this.updateGeometry();
        this.publishRadar();
    }

    /**
     * Opens or closes 200700's sector, **symmetrically**.
     *
     * The plate gives one number for the opening — a *stop relative bearing*, "an equal angle
     * either side of the search axis" — so the grip states a half-angle and both edges take
     * it. Written onto the outer band as a pair of azimuths because that is the field the
     * band editor and the saved amplifiers already carry; `frame` re-centres the pair on the
     * axis on every render, so only the angle between them survives and a rotate still turns
     * the symbol. @see RadarSearchDoctrine.frame
     */
    private setRadarHalfAngle(coordinate: Coordinate): void {
        const center = this.centerCoordinate();
        if (!center || !this.radar) return;
        // The same reading MapLibre makes, and a geodesic one: the grip is placed with
        // `turf.destination`, so anything else fails to round-trip. @see radarSectorOpening
        const edges = radarSectorOpening(
            toLonLat(center) as Position,
            this.radar.searchAxisAzimuthDeg,
            toLonLat(coordinate) as Position,
        );
        if (!edges) return;

        // The pair comes back symmetric about the axis, so either edge states the angle.
        const half = normAz(edges.rightAzimuthDeg - this.radar.searchAxisAzimuthDeg);
        this.radar = {...this.radar, stopRelativeBearingDeg: half > 180 ? 360 - half : half};
        this.updateGeometry();
        this.publishRadar();
    }

    private setBandAzimuth(bandIndex: number, side: 'left' | 'right', coordinate: Coordinate): void {
        const center = this.centerCoordinate();
        if (!center) return;

        const bearing = normAz(
            openlayersAdapter.getTurfBearing(
                openlayersAdapter.coordinateToTurfPoint(center),
                openlayersAdapter.coordinateToTurfPoint(coordinate),
            ),
        );
        if (!Number.isFinite(bearing)) return;

        const opts = this.currentOptions();
        const sorted = resolveBands(opts);
        if (bandIndex < 0 || bandIndex >= sorted.length) return;
        const current = resolveBandAzimuths(sorted[bandIndex], opts);

        /*
         * **Clamped so the wedge cannot close or invert.** The width is measured as the
         * turn from left to right, kept positive, so a wedge that straddles north is the
         * same arithmetic as one that does not -- comparing the two bearings directly
         * would read 350 -> 010 as a wedge going the long way round.
         */
        const other = side === 'left' ? current.rightAz : current.leftAz;
        const width = side === 'left' ? normAz(other - bearing) : normAz(bearing - other);
        if (width < MIN_SECTOR_ARC_DEG || width > 360 - MIN_SECTOR_ARC_DEG) return;

        const next = side === 'left' ? {leftAzimuthDeg: bearing} : {rightAzimuthDeg: bearing};
        const stated = {leftAzimuthDeg: current.leftAz, rightAzimuthDeg: current.rightAz, ...next};

        // `resolveBands` sorts a copy but keeps the band objects, so the sorted entry is
        // identity-equal to one of the user's rows -- unless there are no rows at all, in
        // which case it is the fallback band derived from `size` and there is nothing to
        // edit until it is written down.
        const configBands = this.graphicLabels?.rangeFan?.bands;
        const bands =
            configBands && configBands.length
                ? configBands.map(band => (band === sorted[bandIndex] ? {...band, ...stated} : band))
                : sorted.map((band, i) => (i === bandIndex ? {...band, ...stated} : {...band}));

        this.setLabel({...this.graphicLabels, rangeFan: {...this.graphicLabels.rangeFan, bands}});
    }

    /** The option bag `updateGeometry` builds, reused by the band-drag clamp. */
    private currentOptions(): RangeFanOptions {
        const rangeFan = this.graphicLabels?.rangeFan;
        return {
            size: this.size,
            rotation: this.rotation,
            bands: rangeFan?.bands,
            centerAzimuthDeg: rangeFan?.centerAzimuthDeg,
        };
    }
}
