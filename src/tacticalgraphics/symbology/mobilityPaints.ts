/**
 * # Passage lane and fields of fire
 *
 * Two mobility graphics that share nothing but a habit of measuring their label's
 * placement off the geometry rather than off a constant.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {BASE_FONT_SIZE_PX} from '../core/config';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {dateRangeLabel} from './midLabelLinePaints';
import {textWidth} from './decorations';
import {lineColorOf, scaleOf, labelColorOf} from './paintFunctions';
import {labelGapPx} from './labelFit';
import {strokeParts} from './dashFit';
import {FIELD_OF_FIRE_BLADE} from '../core/fieldOfFire';
import {TacticalGraphicName} from '../core/type';

type LinePaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** Screen-pixel clear space between the passage lane's fishtail and its DTG. */
const PASSAGE_LANE_LABEL_GAP_PX = 8;

/**
 * The passage lane: the drawn line work, with its date-time group set behind the
 * fishtail and reading across the lane.
 *
 * ## The clearance is measured, not assumed
 *
 * The DTG has to start behind the *fishtail*, not behind the center line — which
 * is where a flat offset off the start point put it. Sub-line `[2]` is the tail,
 * `[hook, start, hook]`, both hooks swept back from the start, so measuring how
 * far they reach along the line is the only way to know what to clear. A constant
 * cannot: the hooks are `size × 20` meters, so their screen reach changes with
 * zoom while a pixel offset does not.
 *
 * ## Upright, not across the lane
 *
 * The DTG used to read across the lane, with its own upright pass to keep it from
 * turning over. FM 1-02.2 Table 5-16 sets it level, so it is drawn upright on screen
 * and its clearance is measured along the lane instead.
 */
export function passageLanePaint(showDates = true): LinePaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];
        const center = geometry.coordinates[1];
        if (!center || center.length < 2) return [];

        const [x1, y1] = center[0];
        const [x2, y2] = center[1];
        const dx = x2 - x1;
        const dy = y2 - y1;

        // Zoom-anchored and clamped, exactly as Bridge sizes its DTG. The
        // span-proportional formula this replaced tied the glyph to the width of the
        // lane, so a lane drawn a few hundred meters wider rendered text several times
        // the height of every other mobility label.
        const scale = scaleOf(feature, context);
        const dates = dateRangeLabel(feature.properties);

        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const tail = geometry.coordinates[2] ?? [];
        let tailReachPx = 0;
        for (const p of [tail[0], tail[2]]) {
            if (!p) continue;
            const alongPx = ((p[0] - x1) * ux + (p[1] - y1) * uy) / context.resolution;
            tailReachPx = Math.max(tailReachPx, -alongPx); // negative = behind the start
        }
        /*
         * **Upright, past the entry end.** FM 1-02.2 Table 5-16 sets W W1 level below the
         * lane, which is to say upright on the page and clear of the symbol. It used to be
         * turned across the lane, which stood it on end on a lane drawn east to west. Upright
         * text overhangs toward the symbol by half its width along a horizontal lane and half
         * its height along a vertical one, so the clearance is measured along the lane.
         */
        const halfWidthPx = (dates ? textWidth(context, dates, fontStyle, scale) : 0) / 2;
        const halfHeightPx = (BASE_FONT_SIZE_PX / 2) * scale;
        const clearancePx = tailReachPx + labelGapPx(PASSAGE_LANE_LABEL_GAP_PX, scale) + Math.abs(ux) * halfWidthPx + Math.abs(uy) * halfHeightPx;
        const at: ProjectedPosition = [
            x1 - ux * clearancePx * context.resolution,
            y1 - uy * clearancePx * context.resolution,
        ];

        /*
         * **The safe lane borrows the line work and not the label.** APP-06 290600 draws
         * this exact outline but stacks its dates in a column of four amplifiers beside the
         * lane, so drawing them here as well would print the range twice, in two places, on
         * one symbol. It is the same shape either way -- which is the point of sharing the
         * function rather than copying the construction. @see safeLaneOrGapPaint
         */
        const lineWork: Paint = {
            geometry,
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
        };
        if (!showDates) return [lineWork];

        return [
            {
                geometry: {type: 'Point', coordinates: at},
                text: {
                    text: dates,
                    kind: 'amplifier',
                    font: fontStyle,
                    fill: labelColorOf(feature),
                    halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                    align: 'center',
                    baseline: 'middle',
                    scale,
                },
            },
            lineWork,
        ];
    };
}

/**
 * Where along its leg the solid bar starts and ends, from the leg's tip: 80% of the leg,
 * centred. MIL-STD-2525E Change 1 140501: "The length of the 'blade' shall be 80% of the
 * length of point 1 and point 2, centered and connected to the inside of the line." It ran
 * 0.2 to 0.7, half the leg and off centre.
 */
const FIELD_OF_FIRE_BAR_FROM = 0.1;
const FIELD_OF_FIRE_BAR_TO = 0.9;
/** Thickness of that bar, in screen pixels, before the cap below. */
const FIELD_OF_FIRE_BAR_WIDTH_PX = 12;

/**
 * The most of its own leg the bar may be thick.
 *
 * Measured off 140500's Template at 200 dpi: the leg runs 331 px from the vertex to the
 * arrowhead and the thick section is 19 px across it, which is 0.057. A flat 12 px is right
 * at the sizes a field of fire is usually drawn and wrong below them — the leg shrinks with
 * the zoom and the bar does not, so a symbol drawn small or zoomed away from wears a slab
 * down one side. The same shape-relative rule the obstacle teeth and the merlons take.
 * @see decorationScale for the repeating-decoration twin
 */
const FIELD_OF_FIRE_BAR_SHARE = 0.057;

/**
 * And a floor, because the bar is what tells this symbol apart.
 *
 * A share alone takes it to nothing on a very short leg, where what is left is a plain V —
 * which is a different symbol. Twice the line width is the least that still reads as a
 * thickening rather than as a heavy stroke.
 */
const FIELD_OF_FIRE_BAR_MIN_MULTIPLE = 2;
/** A point `ratio` of the way from `a` to `b`. */
function along(a: ProjectedPosition, b: ProjectedPosition, ratio: number): ProjectedPosition {
    return [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio];
}

/**
 * Fields of fire: a V with a solid bar along the inside of its left leg.
 *
 * **And its three MIL-STD-2525E Change 1 variants**, which differ only in the bar and the
 * dash: final protective fire (right) carries it on the PT 1 to PT 3 leg, principal direction
 * of fire has none, and secondary direction of fire has none and is dashed. "Left" is the leg
 * to PT 2, which the V hands over first. @see FIELD_OF_FIRE_BLADE
 *
 * The bar is drawn as a thick butt-capped stroke rather than as a filled polygon,
 * which is what makes its ends square — a rounded cap would read as a lozenge. It
 * is part of the symbol, so it takes the same standard-identity color as the legs
 * rather than a fixed black.
 */
export function fieldsOfFirePaint(name: TacticalGraphicName = TacticalGraphicName.FieldsOfFire): LinePaint {
    const blade = FIELD_OF_FIRE_BLADE[name];
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];

        const color = lineColorOf(feature);
        // The V and its two arrowheads; the secondary line dashes the V. @see DASHED_PARTS
        const paints: Paint[] = strokeParts(name, geometry.coordinates, {color, widthPx: LINE_WIDTH()});

        const vee = geometry.coordinates[0] ?? [];
        // [PT 2, PT 1, PT 3]: the bladed leg runs from its tip to the vertex.
        const leg = blade === 3 && vee.length >= 3 ? [vee[2], vee[1]] : vee;
        if (blade && leg.length >= 2) {
            // Capped against the leg's own on-screen length, so the bar keeps its share of
            // the symbol at every size instead of a fixed number of pixels.
            const legPx = Math.hypot(leg[1][0] - leg[0][0], leg[1][1] - leg[0][1]) / context.resolution;
            const widthPx = Math.max(
                LINE_WIDTH() * FIELD_OF_FIRE_BAR_MIN_MULTIPLE,
                Math.min(FIELD_OF_FIRE_BAR_WIDTH_PX, legPx * FIELD_OF_FIRE_BAR_SHARE),
            );
            // **On the inside of the line**, not centred on it: shifted toward the other leg so
            // its outer edge runs along the line's. @see FIELD_OF_FIRE_BAR_FROM
            const other = blade === 3 ? vee[0] : vee[2];
            const dx = leg[1][0] - leg[0][0];
            const dy = leg[1][1] - leg[0][1];
            const len = Math.hypot(dx, dy) || 1;
            let nx = -dy / len;
            let ny = dx / len;
            if (other && (other[0] - leg[1][0]) * nx + (other[1] - leg[1][1]) * ny < 0) {
                nx = -nx;
                ny = -ny;
            }
            const shift = (Math.max(0, widthPx - LINE_WIDTH()) / 2) * context.resolution;
            const inside = (p: ProjectedPosition): ProjectedPosition => [p[0] + nx * shift, p[1] + ny * shift];
            paints.push({
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        inside(along(leg[0], leg[1], FIELD_OF_FIRE_BAR_FROM)),
                        inside(along(leg[0], leg[1], FIELD_OF_FIRE_BAR_TO)),
                    ],
                },
                stroke: {color, widthPx, cap: 'butt'},
            });
        }

        // No designation. None of 140500-140504 letters an amplifier: the box at point 1 on
        // their Templates is the (grey) unit symbol the measure belongs to, which the plate
        // says "may touch point 1". It used to draw field T below the vertex.
        return paints;
    };
}
