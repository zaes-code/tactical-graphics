import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {BaseGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, LineString, MultiLineString, MultiPoint} from 'geojson';

/**
 * The three anti-tank ditches of FM 1-02.2 table 5-19 - "triangular shaped or wide ditches
 * designed to stop tanks and armor fighting vehicles around a fortified position".
 *
 * A drawn route carrying triangular teeth, in the wire obstacles' mould rather than the
 * point-dropped explosives': the user draws the ditch's line and the teeth repeat along it
 * at a constant screen size. One symbol in three states:
 *
 * ```
 * under construction   teeth outlined
 * completed            teeth filled
 * reinforced           teeth filled, with a mine nested in each notch between them
 * ```
 *
 * **The teeth touch.** Their bases run edge to edge along the route, so consecutive teeth
 * share a base corner and the notch between two of them is what a mine sits in. That is
 * also why the run always begins and ends with a tooth - a mine has no notch to sit in
 * unless there is a tooth either side of it.
 *
 * The teeth are *not* in the geometry: they are a screen-space decoration, so
 * `antiTankDitchStyleFunc` synthesises them through `decorationScale` exactly as the wire
 * obstacles and the fortified merlons do. Baking them in metres froze them at the drawing
 * zoom. Fill could not live in the geometry either - a MultiLineString has no fill - so
 * the renderer owns both.
 */

/** How each state is drawn. */
export interface AntiTankDitchStyle {
    /** Are the teeth solid? Only "under construction" is not. */
    filled: boolean;
    /** Does a mine sit in the notch between each pair of teeth? */
    mines: boolean;
}

export const ANTI_TANK_DITCH_STYLES: Partial<Record<TacticalGraphicName, AntiTankDitchStyle>> = {
    [TacticalGraphicName.AntiTankDitchUnderConstruction]: {filled: false, mines: false},
    [TacticalGraphicName.AntiTankDitchCompleted]: {filled: true, mines: false},
    [TacticalGraphicName.AntiTankDitchReinforcedWithMines]: {filled: true, mines: true},
};

/**
 * Tooth base width in screen pixels - the unit the whole pattern is built from.
 *
 * Sized up from 18 for the reinforced state's sake: with the teeth touching, the notch a
 * mine nests in is bounded by the two tooth edges, so the mine can only be about a quarter
 * of a tooth wide. At 18 px that left the mines as specks.
 */
export const ANTI_TANK_TOOTH_PX = 24;

/** Tooth height, as a multiple of its base width. */
export const ANTI_TANK_HEIGHT_RATIO = 0.8;

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
