/**
 * # Overhead wire, and the safe lane
 *
 * Two APP-06 obstacle symbols added on 2026-09-01, sharing a file because both put
 * everything that is not the drawn line into the paint layer.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {amplifierText, lineColorOf, scaleOf, labelColorOf} from './paintFunctions';
import {dateRangeLabel} from './midLabelLinePaints';
import {passageLanePaint} from './mobilityPaints';

type LinePaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/**
 * The pylon, traced from the plate as polylines in its own coordinate space.
 *
 * Units are the SVG the symbol was supplied in — a 237 x 463 box with **y running down**,
 * which is the one thing to keep in mind reading these numbers. `pylonAt` flips it.
 *
 * Seven strokes: the cross-arm with its hooked ends, the two legs running from the top of
 * the mast down to the feet, the splay bracing those feet, the horizontal brace across the
 * mast, and the stay leaving the cross-arm to the lower right. The stay is part of the
 * glyph, not a stub of wire — the plate draws it on a pylon whose wire leaves horizontally.
 */
const PYLON: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
    [
        [19, 85],
        [19, 67],
        [177, 67],
        [177, 86],
    ],
    [
        [98, 15],
        [92, 112],
        [56, 445],
    ],
    [
        [105, 83],
        [145, 446],
    ],
    [
        [98, 338],
        [56, 445],
    ],
    [
        [98, 338],
        [145, 446],
    ],
    [
        [82, 208],
        [125, 208],
    ],
    [
        [111, 86],
        [228, 336],
    ],
];

/** Where the mast stands in the glyph's own box: the midpoint of its two feet. */
const PYLON_FOOT_X = 100;
/** Ground and mast-top, so the glyph's own height is a number rather than a guess. */
const PYLON_GROUND_Y = 446;
const PYLON_TOP_Y = 15;
/**
 * The height the wire attaches at — the middle of the glyph, not its foot.
 *
 * The plate points its `PT` arrow at the base, and standing the pylon on the anchor was the
 * literal reading of that; it draws the wire along the ground with the towers above it,
 * which is not what either the Template or the Example shows. Both run the wire through the
 * pylons at mid height. (User's call, 2026-09-02: "the line needs to be from the middle of
 * the svg, like the decision line".)
 */
const PYLON_ANCHOR_Y = (PYLON_TOP_Y + PYLON_GROUND_Y) / 2;

/** How tall a pylon stands on screen, in pixels. */
export const PYLON_HEIGHT_PX = 26;

/**
 * One pylon, standing on `anchor`.
 *
 * **Upright on screen, at a fixed pixel height, whichever way the wire runs.** 282003's
 * Draw Rules say the symbol "varies only in length" — this repo's standing tell for a
 * screen-sized decoration — and the plate's Example draws three pylons the same size with
 * the wire arriving at each from a different angle. Turning the glyph with the line, or
 * sizing it in metres, would both be wrong, and the second would be invisible until
 * someone zoomed.
 *
 * The wire meets the pylon at its **middle**, so the glyph straddles the line rather than
 * standing on it. @see PYLON_ANCHOR_Y
 */
function pylonAt(anchor: ProjectedPosition, context: PaintContext): ProjectedPosition[][] {
    const k = (PYLON_HEIGHT_PX * context.resolution) / (PYLON_GROUND_Y - PYLON_TOP_Y);
    return PYLON.map(path =>
        path.map(
            ([x, y]): ProjectedPosition => [
                anchor[0] + (x - PYLON_FOOT_X) * k,
                // The glyph's y runs down and the projection's runs up, so this subtracts
                // rather than adding. Getting it backwards buries the pylon instead of
                // standing it up, and looks deliberate.
                anchor[1] + (PYLON_ANCHOR_Y - y) * k,
            ],
        ),
    );
}

/**
 * Overhead wire (APP-06 282003): the run of wire, with a pylon at every anchor point.
 *
 * The symbol carries no amplifier box of any kind — the whole of it is line work — so this
 * paint reads nothing off the property bag and the dialog offers nothing beyond the
 * affiliation every graphic gets.
 */
export function overheadWirePaint(): LinePaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        const coords =
            geometry.type === 'LineString' || geometry.type === 'MultiPoint' ? geometry.coordinates : undefined;
        if (!coords || coords.length < 2) return [];

        const stroke = {color: lineColorOf(feature), widthPx: LINE_WIDTH()};
        return [
            {geometry: {type: 'LineString', coordinates: coords}, stroke},
            {geometry: {type: 'MultiLineString', coordinates: coords.flatMap(at => pylonAt(at, context))}, stroke},
        ];
    };
}

/** Clear space between the lane and the column of amplifiers beside it, in screen pixels. */
const SAFE_LANE_LABEL_GAP_PX = 10;

/**
 * Safe lane or gap (APP-06 290600): the lane, and `T` / `AM` / `W` / `W1` stacked beside it.
 *
 * ## One paint, not a shape and a label
 *
 * The column could be a `label` paint on the labels feature, and on MapLibre it would work.
 * **OpenLayers has no labels feature for a line graphic** — `LineGraphicBase` owns a base,
 * a graphics and a handles feature and nothing else — so the column would render on one
 * engine and silently not on the other. That is the exact defect shape this repo keeps
 * finding, so the amplifiers ride the graphic feature with the line work, which both
 * engines draw. @see ai/conventions.md, "A symbology fact never lives in a holder"
 *
 * ## The stack sits to one side, level with the entry
 *
 * The plate runs the four boxes down the lane's right-hand side starting at point 1, which
 * is what this reproduces: offset across the lane by a fixed number of screen pixels and
 * hung from the entry rather than the middle. Both are measured off the centre line the
 * geometry already carries, so a lane drawn in either direction puts its column on the same
 * side relative to travel.
 *
 * ## Right of travel, upright, and measured clear of the symbol
 *
 * Three rules, all of them about the reader rather than the plate (user's call, 2026-09-02):
 *
 * - **Right of the line running point 1 to point 2.** Relative to travel, not to the map's
 *   north, so redrawing the same lane the other way round does not swap the column across
 *   the symbol.
 * - **Never rotated.** The block reads horizontally whatever the lane's heading. A column
 *   of four amplifiers turned to follow a diagonal is unreadable, and turned upside down on
 *   a north-running lane it is worse.
 * - **Never touching the line work.** The clearance is *measured* off the realized geometry
 *   rather than assumed: the splay at each end reaches out perpendicular to the lane by an
 *   amount that depends on the decoration size and the zoom, so a fixed offset that clears
 *   it at one zoom sits on top of it at another.
 *
 * The last two interact, and that is the part worth reading twice. An upright block hung
 * beside the line grows in its own two directions from its anchor, so a block placed to the
 * east and aligned to grow west walks straight back over the symbol. Both the horizontal
 * and the vertical alignment therefore follow the sign of the offset, which puts the anchor
 * on the corner nearest the lane and sends the block away in both axes.
 *
 * ## The width is a stated number, and nothing draws it
 *
 * `AM` is the lane's width in metres. The symbol is a single line, so there is no drawn
 * width for it to agree with — it is text, and the Example's `4.5M` sits in the column with
 * the rest. This is the amplifier that separates this symbol from the passage lane it
 * shares an outline with. @see SafeLaneOrGap
 */
export function safeLaneOrGapPaint(): LinePaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];
        // Sub-line [1] is the centre line, [entry, exit] — the same one `passageLanePaint`
        // measures its own clearance from.
        const center = geometry.coordinates[1];
        if (!center || center.length < 2) return [];

        // The line work is the passage lane's own function, with its date-time group turned
        // off: this symbol shows the dates in the column instead, and drawing them twice on
        // one graphic is what sharing the paint is meant to prevent.
        const lineWork = passageLanePaint(false)(feature, context);

        const lines = [
            feature.properties.designation?.trim() ?? '',
            amplifierText(feature, formatLaneWidth(feature.properties.width)),
            amplifierText(feature, dateRangeLabel(feature.properties)),
        ].filter(Boolean);
        if (!lines.length) return lineWork;

        const [entry, exit] = center;
        const dx = exit[0] - entry[0];
        const dy = exit[1] - entry[1];
        const len = Math.hypot(dx, dy);
        if (len === 0) return lineWork;

        // The right hand looking from point 1 to point 2, in a projection whose y runs up.
        const rightX = dy / len;
        const rightY = -dx / len;

        /*
         * How far the drawn symbol reaches on that side, measured rather than assumed.
         *
         * The splay is `size` metres long at 45 degrees to the lane, and `size` is derived
         * from the zoom — so the reach in projected metres changes as the user zooms, and
         * any constant that cleared it at one zoom would sit on the arm at another. Every
         * point of the realized geometry is projected onto the offset direction and the
         * furthest one wins; the fixed gap is then added to that.
         */
        let reach = 0;
        for (const path of geometry.coordinates) {
            for (const point of path) {
                reach = Math.max(reach, (point[0] - entry[0]) * rightX + (point[1] - entry[1]) * rightY);
            }
        }
        const offset = reach + SAFE_LANE_LABEL_GAP_PX * context.resolution;
        const at: ProjectedPosition = [entry[0] + rightX * offset, entry[1] + rightY * offset];

        /*
         * The block grows away from the lane in both axes.
         *
         * `align` puts the anchor on the block's near edge horizontally and `baseline` does
         * the same vertically, each taken from the sign of the offset. The dead band is
         * what makes a lane that runs nearly north-south centre its column rather than
         * flipping it end for end over a rounding error.
         */
        const DEAD_BAND = 0.2;
        const align: 'left' | 'center' | 'right' = rightX > DEAD_BAND ? 'left' : rightX < -DEAD_BAND ? 'right' : 'center';
        const baseline: 'top' | 'middle' | 'bottom' =
            rightY > DEAD_BAND ? 'bottom' : rightY < -DEAD_BAND ? 'top' : 'middle';

        return [
            ...lineWork,
            {
                geometry: {type: 'Point', coordinates: at},
                text: {
                    text: lines.join('\n'),
                    /*
                     * **Doctrinal, not `amplifier`, even though three of its four lines
                     * are.** The column is one mark and `withHiddenAmplifiers` drops a mark
                     * whole -- so tagging it would take the designation away with the width
                     * and the dates, and "name only" would leave a lane with no name on it.
                     * `amplifierText` has already blanked the lines that must go, line by
                     * line, which is the finer-grained tool and the right one here.
                     */
                    font: fontStyle,
                    fill: labelColorOf(feature),
                    halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                    // Both taken from the offset, so the anchor is the block's corner
                    // nearest the lane and the text runs away from it. @see the note above.
                    align,
                    baseline,
                    scale: scaleOf(feature, context),
                },
            },
        ];
    };
}

/**
 * The width amplifier as the plate writes it: a number and a unit, with no space.
 *
 * The Example reads `4.5M`. A trailing `.0` is dropped, so a whole number of metres does
 * not render as `4.0M` beside a plate that would have written `4M`.
 */
export function formatLaneWidth(width?: number): string {
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return '';
    const rounded = Math.round(width * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}M`;
}
