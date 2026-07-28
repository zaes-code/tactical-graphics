import {Stroke, Style} from "ol/style";
import {Coordinate} from "ol/coordinate";
import {MultiLineString, MultiPoint} from "ol/geom";
import {RangeFanOptions, TacticalGraphicName} from '@zaes/tactical-graphics';
import {GraphicLabels} from "../../../utils/graphicLinkRegistry";
import {MissionTaskGraphicBase} from "./MissionTaskGraphicBase";
import openlayersAdapter from "../openlayersAdapter";
import {getDefaultLineColor, getRangeFanLabelStyleFn, LINE_WIDTH} from "../openlayerStyles";
import {resolveBandAzimuths, resolveBands} from '@zaes/tactical-graphics';
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
/** `RangeFanBand.range` is kilometres; `size` and turf distances are metres. */
const KM_TO_M = 1000;

/**
 * Minimum gap between two rings when one is dragged towards the other, as a
 * fraction of the outermost band's range — proportional so the rings stay
 * visibly apart whatever size the fan is.
 */
const BAND_SEPARATION_FRACTION = 0.02;

export class RangeFanGraphicBase extends MissionTaskGraphicBase {
    graphicLabels: GraphicLabels = {label: ''};

    constructor(
        name: TacticalGraphicName,
        size: number,
        drawingResolution?: number,
    ) {
        super(name, size, drawingResolution);

        // Range fans render the geometry as plain strokes — nothing fancy
        // (no fill, no per-feature label baked into the line).
        this.graphic.setStyle((feature) => {
            const color = feature.get('hostilityColor') || getDefaultLineColor();
            return new Style({
                stroke: new Stroke({color, width: LINE_WIDTH}),
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
        // Same split as every other circle graphic: the centre becomes the grey
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
        const isSector = this.name === TacticalGraphicName.WeaponSensorRangeFanSector;
        const resolvedBands = resolveBands(opts);
        const bandsForStyle = isSector
            ? resolvedBands.map(band => {
                const {leftAz, rightAz} = resolveBandAzimuths(band, opts);
                return {
                    ...band,
                    // Resolved absolute azimuths (CW from N) for the style
                    // fn to print as compass bearings; the raw user-facing
                    // fields on the band are deflections from center.
                    resolvedLeftAz: leftAz,
                    resolvedRightAz: rightAz,
                };
            })
            : resolvedBands;
        this.label.set('rangeFanShape', isSector ? 'sector' : 'circular');
        this.label.set('rangeFanBands', bandsForStyle);
    };

    setLabel = (labels: GraphicLabels) => {
        this.graphicLabels = labels;
        // Bands or azimuths may have changed → geometry must be redrawn,
        // not just the labels restyled.
        this.updateGeometry();
        // Stamping fires a `change` event on each feature, which re-renders them.
        writeGraphicProperties(this.getFeatures(), this.name, labels);
    };

    /**
     * Drags band `bandIndex`'s ring to `coordinate`. `bandIndex` counts in the
     * **sorted** band order, matching the rim handles `generateHandles` emits.
     *
     * The new range is the *geodesic* distance from the centre in kilometres —
     * `RangeFanBand.range` is km and the generator spends it through
     * `turf.destination`, so measuring the same way is what makes the ring land
     * under the cursor at any latitude. Measuring in EPSG:3857 map units would
     * only agree near the equator.
     *
     * **Clamped between its neighbours**, which is what keeps an inner ring from
     * expanding past the outer one. Neighbour clamping rather than a bare
     * "not past the outermost" rule, because `resolveBands` re-sorts on every
     * render: if a ring could cross its neighbour, the sorted index the drag is
     * holding would start pointing at a different band halfway through the
     * gesture.
     */
    setBandRange = (bandIndex: number, coordinate: Coordinate): void => {
        const center = this.base.getGeometry();
        if (!center) return;

        const km = openlayersAdapter.getTurfDistance(
            openlayersAdapter.coordinateToTurfPoint(center.getCoordinates()),
            openlayersAdapter.coordinateToTurfPoint(coordinate),
        );
        if (!Number.isFinite(km) || km <= 0) return;

        const configBands = this.graphicLabels?.rangeFan?.bands;
        const sorted = resolveBands(this.currentOptions());
        if (bandIndex < 0 || bandIndex >= sorted.length) return;

        // Keep rings visibly apart, proportional to the fan so the gap holds up
        // at any size.
        const gapKm = sorted[sorted.length - 1].range * BAND_SEPARATION_FRACTION;
        const min = bandIndex === 0 ? gapKm : sorted[bandIndex - 1].range + gapKm;
        const max = bandIndex === sorted.length - 1 ? Number.POSITIVE_INFINITY : sorted[bandIndex + 1].range - gapKm;
        const clamped = Math.min(Math.max(km, min), Math.max(min, max));

        // No user-entered bands: the fan is rendering `resolveBands`' fallback
        // single band derived from `size`, so drive `size` and leave the
        // amplifiers alone rather than inventing a band the user never typed.
        if (!configBands || configBands.length === 0) {
            this.size = clamped * KM_TO_M;
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
