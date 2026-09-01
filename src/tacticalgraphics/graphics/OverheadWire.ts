import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {IBaseGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, LineString, MultiPoint} from 'geojson';

/**
 * Overhead wire (APP-06 282003) — a plain line with a pylon standing at every anchor point.
 *
 * > This symbol requires at least two anchor points, points 1 and 2, to define the line.
 * > Additional points can be defined to extend the line. The first and last anchor points
 * > determine the length of the line.
 *
 * **The line is all the geometry there is.** The plate says the symbol "varies only in
 * length", which is this repo's standing tell for a *screen-sized* decoration: the pylons
 * are the same size however far apart they are and at whatever zoom, so they are drawn in
 * the paint layer from the vertices rather than baked into metres here.
 * @see overheadWirePaint, ai/conventions.md
 *
 * Every vertex is a handle and a pylon, not just the two ends — the plate's Example draws
 * three pylons for a two-segment run, and the middle one stands on the bend.
 */
export class OverheadWire extends TacticalGraphicsBase {
    name: string = TacticalGraphicName.OverheadWire;
    type: string = 'LineString';

    generateGraphics(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<LineString> {
        return this.asLineStringFeature(base.geometry.coordinates);
    }

    generateHandles(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates);
    }

    /**
     * The vertices again, so the paint knows where to stand a pylon.
     *
     * 282003 carries no amplifier box at all, so nothing here is a text anchor. The
     * geometry is published as the labels feature because that is the feature the paint
     * layer is handed for decoration, and repeating the base's own coordinates costs
     * nothing.
     */
    generateLabels(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates);
    }
}
