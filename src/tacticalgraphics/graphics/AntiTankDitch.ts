import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {BaseGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, LineString, MultiLineString, MultiPoint} from 'geojson';

/**
 * The three anti-tank ditches of FM 1-02.2 table 5-19 - "triangular shaped or wide ditches
 * designed to stop tanks and armor fighting vehicles around a fortified position".
 *
 * A drawn route carrying triangular teeth, in the wire obstacles' mold rather than the
 * point-dropped explosives': the operator draws the ditch's line and the teeth repeat along it
 * at a constant screen size. One symbol in three states:
 *
 * ```
 * under construction   teeth outlined
 * completed            teeth filled
 * reinforced           teeth filled and spaced, with a mine in each gap
 * ```
 *
 * **The plain ditches' teeth touch**: their bases run edge to edge along the route. The
 * mined ditch spaces them apart and puts a mine in each gap, tooth first from PT 1, as
 * 2525E 290203 draws it.
 *
 * The teeth are *not* in the geometry: they are a screen-space decoration, so
 * `antiTankDitchStyleFunc` synthesizes them through `decorationScale` exactly as the wire
 * obstacles and the fortified merlons do. Baking them in meters froze them at the drawing
 * zoom. Fill could not live in the geometry either - a MultiLineString has no fill - so
 * the renderer owns both.
 */

/** How each state is drawn. */
export interface AntiTankDitchStyle {
    /** Are the teeth solid? Only "under construction" is not. */
    filled: boolean;
    /** Does a mine sit in the gap after each tooth? */
    mines: boolean;
    /**
     * Which side of PT 1 -> PT 2 the teeth (and mines) hang on.
     *
     * MIL-STD-2525E Table L-XVI draws 290201 and 290202 with PT 1 at the top, PT 2 below and
     * the teeth to the image's right, which is the **left** of travel; APP-06 agrees. Its
     * 290203 runs PT 1 to PT 2 left to right with the teeth below, the **right** of travel,
     * where APP-06 has them on the left. 2525E decides, so the mined ditch differs from the
     * other two.
     */
    side: 'left' | 'right';
}

export const ANTI_TANK_DITCH_STYLES: Partial<Record<TacticalGraphicName, AntiTankDitchStyle>> = {
    [TacticalGraphicName.AntiTankDitchUnderConstruction]: {filled: false, mines: false, side: 'left'},
    [TacticalGraphicName.AntiTankDitchCompleted]: {filled: true, mines: false, side: 'left'},
    [TacticalGraphicName.AntiTankDitchReinforcedWithMines]: {filled: true, mines: true, side: 'right'},
};

/**
 * Tooth base width in screen pixels - the unit the whole pattern is built from.
 *
 * Sized up twice for the reinforced state's sake. With the teeth touching, the notch a mine
 * nests in is bounded by the two tooth edges, so the mine is about a sixth of a tooth wide
 * and the white gap holding it clear is narrower still. At 18 px the mines were specks; at
 * 24 the gap was thinner than the stroke drawing it and the notch filled in solid.
 */
export const ANTI_TANK_TOOTH_PX = 30;

/**
 * Tooth height, as a multiple of its base width - `sqrt(3) / 2`, which makes the teeth
 * equilateral.
 *
 * It is the steepest the teeth have been, and steepness is what pinches shut the notch a
 * mine nests in. It stays workable only because the teeth are 30 px: the notch's half-angle
 * sine is exactly 0.5 for an equilateral tooth, so a mine centered at 0.72 of the tooth
 * height clears the edges either side by about 4.7 px, wider than the stroke that draws
 * them. Shrink `ANTI_TANK_TOOTH_PX` and the mines close up again.
 */
export const ANTI_TANK_HEIGHT_RATIO = Math.sqrt(3) / 2;

export class AntiTankDitch extends TacticalGraphicsBase<BaseGraphicOptions> {
    name: string;
    type: string = 'LineString';

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    /**
     * The drawn route, and only that - the teeth are screen-space and live in the style
     * function. @see the class comment.
     */
    generateGraphics(base: Feature<LineString>, opts?: BaseGraphicOptions): Feature<MultiLineString> {
        const coords = base.geometry.coordinates;

        // Mid-draw the interaction hands us a one-point sketch on every pointer move.
        // Returning `[coords]` there emits a one-point LineString, which is not a line.
        if (coords.length < 2) return this.asMultiLineStringFeature([]);
        return this.asMultiLineStringFeature([coords]);
    }

    generateHandles(base: Feature<LineString>, opts?: BaseGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        return this.asMultiPointFeature([coords[0], coords[coords.length - 1]]);
    }

    /** No amplifiers: affiliation and nothing else. */
    generateLabels(base: Feature<LineString>, opts?: BaseGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([]);
    }
}
