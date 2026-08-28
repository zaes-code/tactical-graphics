import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import type {Feature, LineString, MultiPoint} from 'geojson';
import {TacticalGraphicName} from '../core/type';

/**
 * APP-06 341200 follow and assume, and 341300 follow and support.
 *
 * > Anchor Points. This symbol requires exactly two anchor points. Point 1 defines the
 * > tip of the arrowhead and point 2 defines the rear of the symbol.
 * > Size/Shape. Points 1 and 2 determine the length of the symbol, which varies only in
 * > length.
 * > Orientation. The arrow typically points in the direction of the action.
 *
 * FM 1-02.2 draws both as well, and the two standards agree on everything except the
 * head of the support variant — @see followTaskPaint, which records that divergence and
 * which of the two is drawn.
 *
 * **The base is the axis and nothing else.** "Varies only in length" is this repository's
 * standing signal that every dimension except the run between the two points is a screen
 * size, so the rear shape, the connector and the head are synthesized at paint time
 * rather than baked here. A generator that baked them would freeze them at the zoom the
 * graphic was drawn at, which is the defect `watchResolution` exists to prevent.
 *
 * Both are in `TIP_FIRST_GRAPHICS`, so the stored base runs tip-first and
 * `TacticalGraphicsBase.generate` hands this class the rear-to-tip order it reads.
 */
export class FollowTask extends TacticalGraphicsBase {
    name: string;
    type: string = 'LineString';

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    /** The axis, rear to tip. Everything drawn along it is the paint's business. */
    generateGraphics(base: Feature<LineString>): Feature<LineString> {
        return this.asLineStringFeature(base.geometry.coordinates.slice(0, 2));
    }

    /** The two points the rule names, and no derived ones. */
    generateHandles(base: Feature<LineString>): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 2));
    }

    /**
     * None.
     *
     * Field T sits **inside** the rear shape, and that shape is a screen size the
     * generator does not know — so the paint places the text itself, against the box it
     * has just drawn. An anchor here would be a second opinion about where the text goes.
     */
    generateLabels(): Feature<MultiPoint> {
        return this.asMultiPointFeature([]);
    }
}
