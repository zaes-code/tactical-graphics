import {Stroke, Style} from "ol/style";
import {Coordinate} from "ol/coordinate";
import {MultiLineString, MultiPoint} from "ol/geom";
import {RangeFanOptions, TacticalGraphicName} from '@zaes/tactical-graphics';
import {GraphicLabels} from "../../../utils/graphicLinkRegistry";
import {MissionTaskGraphicBase} from "./MissionTaskGraphicBase";
import openlayersAdapter from "../openlayersAdapter";
import {getRangeFanLabelStyleFn, LINE_WIDTH, readHostilityColor} from "../openlayerStyles";
import {resolveBandAzimuths, resolveBands, resolveRangeFanBands, rotationToAzimuth} from '@zaes/tactical-graphics';
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

        writeGraphicProperties([this.graphic, this.label, this.handles], name, this.graphicLabels);
    }

    /**
     * Re-runs geometry generation with the current `graphicLabels.rangeFan`
     * config merged in. Called both by the parent's drag pipeline (size /
     * rotation changes) and by setLabel (bands / azimuths changed).
     */
    updateGeometry = () => {
        const rangeFan = this.graphicLabels?.rangeFan;
        const opts: RangeFanOptions = {
            size: this.size,
            rotation: this.rotation,
            bands: rangeFan?.bands,
            centerAzimuthDeg: rangeFan?.centerAzimuthDeg,
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

    setLabel = (labels: GraphicLabels) => {
        this.graphicLabels = labels;
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
        if (handleIndex >= bandCount) {
            const arcHandle = handleIndex - bandCount;
            this.setBandAzimuth(arcHandle >> 1, arcHandle % 2 === 0 ? 'left' : 'right', coordinate);
            return;
        }
        const bandIndex = handleIndex;

        // `getTurfDistance` is kilometers by contract and stays that way — it is a general
        // adapter method. Bands are metres as of 4.0.0, so the conversion is explicit here
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
            // Both metres as of 4.0.0 — this used to scale a kilometer band up to `size`.
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
