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

/** Where the mast stands in the glyph's own box: the midpoint of its two feet, at ground. */
const PYLON_FOOT_X = 100;
const PYLON_GROUND_Y = 446;
/** Top of the mast, so the glyph's own height is a number rather than a guess. */
const PYLON_TOP_Y = 15;

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
 * The anchor is the pylon's **foot**: the plate points its `PT 1` arrow at the bottom of
 * the legs, so the drawn line is the wire's ground track and the towers stand on it.
 */
function pylonAt(anchor: ProjectedPosition, context: PaintContext): ProjectedPosition[][] {
    const k = (PYLON_HEIGHT_PX * context.resolution) / (PYLON_GROUND_Y - PYLON_TOP_Y);
    return PYLON.map(path =>
        path.map(
            ([x, y]): ProjectedPosition => [
                anchor[0] + (x - PYLON_FOOT_X) * k,
                // The glyph's y runs down and the projection's runs up, so this subtracts
                // from ground rather than adding to it. Getting it backwards buries the
                // pylon instead of standing it up, and looks deliberate.
                anchor[1] + (PYLON_GROUND_Y - y) * k,
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

        /*
         * Across the lane, on the **left**-hand side looking from entry to exit -- taken
         * from travel rather than from the map's north, so the column stays on the same
         * side of the symbol whichever way the lane was drawn.
         *
         * Left, because that is the plate's side: 290600 draws its lane running down the
         * page from point 1 to point 2 and stacks the boxes to the *page's* right, which
         * for southward travel is the left hand.
         *
         * **The alignment follows the side, or the block runs back over the lane.** The
         * text is hung from a point beside the line and grows in its own direction; hung
         * left-aligned on the west side, it starts 10 px clear and then crosses the lane it
         * is labelling. Which side "right of travel" lands on depends on the lane's
         * heading, so the alignment has to be decided from the offset that came out rather
         * than fixed.
         */
        const offset = SAFE_LANE_LABEL_GAP_PX * context.resolution;
        const acrossX = -dy / len;
        const at: ProjectedPosition = [entry[0] + acrossX * offset, entry[1] + (dx / len) * offset];
        const align: 'left' | 'right' = acrossX >= 0 ? 'left' : 'right';

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
                    // Hung from the entry corner, so the column grows down the lane the way
                    // the plate stacks it rather than straddling the end.
                    align,
                    baseline: 'top',
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
