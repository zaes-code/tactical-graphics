import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {PointGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, LineString, MultiLineString, MultiPoint} from 'geojson';
import geometryService from '../core/GeometryService';

/**
 * Safe lane or gap (APP-06 290600) — a lane *through* an obstacle, splayed at both ends.
 *
 * > This symbol requires two anchor points. Point 1 defines the entry point and Point 2
 * > defines the exit point of the lane. Points 1 and 2 determine the length of the symbol,
 * > which varies only in length.
 *
 * ## It is the same picture as the passage lane, and that is not a mistake
 *
 * APP-06 290600's Template and FM 1-02.2 Table 5-16's *passage lane* draw the identical
 * outline: a straight lane with a two-armed splay at each end, arms opening away from the
 * lane. Both were read at 900 dpi to be sure, because two symbols rendering as one picture
 * is the sort of thing nothing in a test suite objects to.
 *
 * **The amplifiers are what separate them.** The passage lane letters `W` and `W1` and
 * nothing else. The safe lane adds `T` and `AM` — so a lane carrying a name, or a stated
 * width, can only be this symbol. That is why this is its own graphic rather than a second
 * entity code hung on `PassageLane`: the two offer different fields, and
 * `GRAPHIC_FIELDS` is per graphic.
 *
 * Neither of them is APP-06's *gap*. @see ai/decisions.md, "The FM's `gap` is not APP-06's
 * safe lane or gap"
 *
 * The line work is `passageLineGraphic`'s, unchanged — the same construction cannot be
 * written twice and stay the same shape.
 */
export class SafeLaneOrGap extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.SafeLaneOrGap;
    type: string = 'LineString';

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiLineString> {
        const size: number = opts?.size || 20;
        return geometryService.passageLineGraphic(base.geometry.coordinates, size);
    }

    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates);
    }

    /**
     * Both anchors, entry first.
     *
     * The plate stacks `T` / `AM` / `W` / `W1` down one side of the lane starting level
     * with point 1, so the paint needs the direction as well as the corner — and a single
     * point gives it neither.
     */
    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        return this.asMultiPointFeature([coords[0], coords[coords.length - 1]]);
    }
}
