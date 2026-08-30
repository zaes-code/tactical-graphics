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
import {lineColorOf, scaleOf, labelColorOf} from './paintFunctions';

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
 * ## The label's own upright pass
 *
 * The DTG reads across the lane, so it needs a second normalization — adding a
 * quarter turn to an already-upright angle pushes it straight back out of range,
 * and a lane drawn north-to-south landed on π, upside down.
 *
 * **Wrap before comparing.** The first pass corrects by *adding* π, so a
 * south-west lane leaves the angle at 7π/4 — the same direction as −π/4 and drawn
 * identically, but numerically far outside any range test. A bare `θ > π/2` reads
 * that as needing a flip and turns an upright label over, which is the fault this
 * is fixing. `atan2(sin, cos)` folds any angle back into (−π, π] first.
 *
 * Correcting by ±π keeps the label perpendicular to the lane, so it only ever
 * flips end-for-end about its own center. That matters twice: the anchor does not
 * move, and the clearance above stays valid, because it is still the glyph's
 * *height* that overhangs toward the symbol.
 */
export function passageLanePaint(): LinePaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];
        const center = geometry.coordinates[1];
        if (!center || center.length < 2) return [];

        const [x1, y1] = center[0];
        const [x2, y2] = center[1];
        const dx = x2 - x1;
        const dy = y2 - y1;

        let rotation = -Math.atan2(dy, dx);
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;

        // Zoom-anchored and clamped, exactly as Bridge sizes its DTG. The
        // span-proportional formula this replaced tied the glyph to the width of the
        // lane, so a lane drawn a few hundred meters wider rendered text several times
        // the height of every other mobility label.
        const scale = scaleOf(feature, context);

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
        // The text is turned 90°, so half its *height* is what overhangs toward the
        // symbol; `BASE_FONT_SIZE_PX` is the height `fontStyle` declares.
        const clearancePx = tailReachPx + PASSAGE_LANE_LABEL_GAP_PX + (BASE_FONT_SIZE_PX / 2) * scale;
        const at: ProjectedPosition = [
            x1 - ux * clearancePx * context.resolution,
            y1 - uy * clearancePx * context.resolution,
        ];

        const acrossLane = rotation + Math.PI / 2;
        let labelRotation = Math.atan2(Math.sin(acrossLane), Math.cos(acrossLane));
        if (labelRotation > Math.PI / 2) labelRotation -= Math.PI;
        else if (labelRotation <= -Math.PI / 2) labelRotation += Math.PI;

        return [
            {
                geometry: {type: 'Point', coordinates: at},
                text: {
                    text: dateRangeLabel(feature.properties),
                    kind: 'amplifier',
                    font: fontStyle,
                    fill: labelColorOf(feature),
                    halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                    rotation: labelRotation,
                    align: 'center',
                    baseline: 'middle',
                    scale,
                },
            },
            {
                geometry,
                stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
            },
        ];
    };
}

/** Where along the left leg the solid bar starts and ends. */
const FIELD_OF_FIRE_BAR_FROM = 0.2;
const FIELD_OF_FIRE_BAR_TO = 0.7;
/** Thickness of that bar, in screen pixels. */
const FIELD_OF_FIRE_BAR_WIDTH_PX = 12;
/** Drop from the V's vertex to the top of its label, in screen pixels. */
const FIELD_OF_FIRE_LABEL_OFFSET_PX = 8;

/** A point `ratio` of the way from `a` to `b`. */
function along(a: ProjectedPosition, b: ProjectedPosition, ratio: number): ProjectedPosition {
    return [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio];
}

/**
 * Fields of fire: a V with a solid bar across the middle of its left leg and the
 * weapon's designation hanging below the vertex.
 *
 * The bar is drawn as a thick butt-capped stroke rather than as a filled polygon,
 * which is what makes its ends square — a rounded cap would read as a lozenge. It
 * is part of the symbol, so it takes the same standard-identity color as the legs
 * rather than a fixed black.
 *
 * **The label carries no halo.** It sits below the vertex in open space, where a
 * halo only thickens the glyph; every other amplifier in the library sits on or
 * beside line work and needs one.
 */
export function fieldsOfFirePaint(): LinePaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];

        const color = lineColorOf(feature);
        const paints: Paint[] = [{geometry, stroke: {color, widthPx: LINE_WIDTH()}}];

        const leg = geometry.coordinates[0] ?? [];
        if (leg.length >= 2) {
            paints.push({
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        along(leg[0], leg[1], FIELD_OF_FIRE_BAR_FROM),
                        along(leg[0], leg[1], FIELD_OF_FIRE_BAR_TO),
                    ],
                },
                stroke: {color, widthPx: FIELD_OF_FIRE_BAR_WIDTH_PX, cap: 'butt'},
            });
        }

        const label = feature.properties.designation ?? '';
        if (leg.length >= 3 && label) {
            paints.push({
                geometry: {type: 'Point', coordinates: leg[1]},
                text: {
                    text: label,
                    font: fontStyle,
                    fill: labelColorOf(feature),
                    align: 'center',
                    baseline: 'top',
                    offsetYPx: FIELD_OF_FIRE_LABEL_OFFSET_PX,
                    scale: scaleOf(feature, context),
                },
            });
        }

        return paints;
    };
}
