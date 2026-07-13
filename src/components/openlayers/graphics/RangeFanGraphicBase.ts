import {Stroke, Style} from "ol/style";
import {MultiLineString, MultiPoint} from "ol/geom";
import {RangeFanOptions, TacticalGraphicName} from '@zaes-code/tactical-graphics';
import {GraphicLabels} from "../../../utils/graphicLinkRegistry";
import {MissionTaskGraphicBase} from "./MissionTaskGraphicBase";
import openlayersAdapter from "../openlayersAdapter";
import {getDefaultLineColor, getRangeFanLabelStyleFn, LINE_WIDTH} from "../openlayerStyles";
import {resolveBandAzimuths, resolveBands} from '@zaes-code/tactical-graphics';
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
        this.handles.setGeometry(handles as MultiPoint);
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
}
