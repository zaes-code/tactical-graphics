/**
 * # The lines whose ends carry a fixed glyph
 *
 * Decision line (APP-06 110500) and mobility corridor (142100). Both put **nothing** in
 * the geometry beyond the line the user drew: the star and the fork are a fixed screen
 * size, so they are built in the paint layer where both renderers reach them.
 * @see endGlyphLinePaints.ts
 */

import {Feature, LineString, MultiPoint} from 'geojson';
import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {IBaseGraphicOptions, TacticalGraphicName} from '../core/type';

abstract class EndGlyphLineBase extends TacticalGraphicsBase {
    type: string = 'LineString';

    generateGraphics(base: Feature<LineString>, opts?: IBaseGraphicOptions): Feature {
        return this.asLineStringFeature(base.geometry.coordinates);
    }

    generateHandles(base: Feature<LineString>): Feature<MultiPoint> {
        const c = base.geometry.coordinates;
        return this.asMultiPointFeature([c[0], c[c.length - 1]]);
    }

    generateLabels(base: Feature<LineString>): Feature<MultiPoint> {
        const c = base.geometry.coordinates;
        return this.asMultiPointFeature([c[0], c[c.length - 1]]);
    }
}

/** APP-06 110500 — a star on each anchor point, holding the end-of-line information. */
export class DecisionLine extends EndGlyphLineBase {
    name: string = TacticalGraphicName.DecisionLine;
}

/** APP-06 142100 — forked at both mouths, echeloned at the middle. */
export class MobilityCorridor extends EndGlyphLineBase {
    name: string = TacticalGraphicName.MobilityCorridor;
}
