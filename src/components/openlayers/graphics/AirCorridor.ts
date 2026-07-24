import {
    airCorridorCircleStyleFunc
} from '../openlayerStyles';

import {MovementGraphicBase} from './MovementGraphicBase';
import openlayersAdapter from "../openlayersAdapter";
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {MultiPoint} from 'ol/geom';
import {GraphicLabels} from '../../../utils/graphicLinkRegistry';
import {writeGraphicProperties} from '../graphicProperties';

export class AirCorridor extends MovementGraphicBase {
    constructor(name: TacticalGraphicName, offset: number, resolution: number = 0) {
        super(name, offset, resolution);

        this.graphic.setStyle(feature => {
            return airCorridorCircleStyleFunc(feature);
        });
    }

    /**
     * The perpendicular distance from the corridor centre-line to a width
     * handle IS the circle radius, so the radius must track the cursor 1:1 for
     * the handle to stay under it. The shared default halves that distance,
     * which is right for graphics whose offset is a full width rather than a
     * radius.
     */
    offsetScale = 1;

    updateGeometry = () => {
        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.graphicName,
            this.base,
            {radius: this.offset}
        );
        if (!tacticalGraphic) return;

        const {graphic, handles, labels} = tacticalGraphic;

        // The generator emits `[...vertices, ...tangentPoints]`. Vertices stay on
        // `handles` (drag = move the path); the tangent points go on the offset
        // handle, which the manager routes to setOffset (drag = change width).
        const handleCoords = (handles as MultiPoint).getCoordinates();
        const vertexCount = this.base.getGeometry()?.getCoordinates().length ?? handleCoords.length;

        // Publish the radius so the ACP labels can size themselves against the
        // circle instead of the zoom. Set before setGeometry, whose change event
        // is what triggers the re-render that reads it.
        this.labels.set('graphicSize', this.offset);

        this.graphic.setGeometry(graphic);
        this.handles.setGeometry(new MultiPoint(handleCoords.slice(0, vertexCount)));
        this.offsetHandle.setGeometry(new MultiPoint(handleCoords.slice(vertexCount)));
        this.labels.setGeometry(labels);
    };

    /**
     * Editing WIDTH in the Feature Properties dialog resizes the corridor, the
     * mirror of dragging a width handle. The guard compares against the string
     * this graphic would print for its current geometry, so the write that
     * `setOffset` makes never loops back in here as a resize.
     *
     * An unparseable value (a unit we don't read, e.g. feet) is stored as typed
     * and leaves the geometry alone — better a label we didn't act on than a
     * corridor silently resized from a misread number.
     */
    setLabel = (labels: GraphicLabels) => {
        const requested = parseCorridorWidth(labels.width);
        if (requested !== null && labels.width !== formatCorridorWidth(this.offset * 2)) {
            this.offset = requested / 2;
            this.updateGeometry();
            labels = {...labels, width: formatCorridorWidth(this.offset * 2)};
        }
        this.graphicLabels = labels;
        writeGraphicProperties(this.getFeatures(), this.graphicName, labels);
    };

    /**
     * A width drag rewrites the WIDTH amplifier too, so the label can never
     * contradict the drawn shape. Any value typed into the dialog is replaced —
     * the geometry is the source of truth for this one field.
     *
     * Doctrinally this is amplifier **AM** ("a numeric amplifier that displays a
     * minimum, maximum, or specific distance (including range, radius, width, or
     * length) in meters or feet", FM 1-02.2 line 7409). It is NOT W — in this
     * template W/W1 carry the corridor's date-time group, which is what the
     * separate start/end date fields hold.
     */
    setOffset(offset: number) {
        super.setOffset(offset);
        // `offset` is the circle radius, so the corridor spans twice that. The
        // generator consumes the same number as turf metres when it builds the
        // rails, so this is the width of the shape as actually drawn.
        this.setLabel({...this.graphicLabels, width: formatCorridorWidth(offset * 2)});
    }

}

/**
 * AM is a *numeric* amplifier, and the dialog's Width input strips everything
 * that isn't a digit — so the stored value is bare metres, with no separators
 * and no unit. That way a drag-written value survives being hand-edited. The
 * `M` suffix and thousands separators are added when the label is drawn
 * (`formatWidthAmplifier` in openlayerStyles).
 *
 * Rounds to whole metres below 1 km and to 10 m above, so a drag doesn't churn
 * insignificant digits on a wide corridor.
 */
function formatCorridorWidth(metres: number): string {
    const rounded = metres >= 1000 ? Math.round(metres / 10) * 10 : Math.round(metres);
    return `${rounded}`;
}

/**
 * Reads a width value: `"93910"` from the dialog, or `"1.5 KM"` / `"93,910 M"`
 * from imported properties. A bare number is metres. Returns null for anything
 * else — including units we don't read, such as feet — so the caller can
 * decline to touch the geometry rather than resize it from a misread number.
 */
function parseCorridorWidth(value?: string): number | null {
    if (!value) return null;
    const match = /^([0-9]*\.?[0-9]+)\s*(m|km)?$/i.exec(value.replace(/,/g, '').trim());
    if (!match) return null;
    const metres = Number(match[1]) * (match[2]?.toLowerCase() === 'km' ? 1000 : 1);
    return Number.isFinite(metres) && metres > 0 ? metres : null;
}
