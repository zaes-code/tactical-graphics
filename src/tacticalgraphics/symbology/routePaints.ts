/**
 * # Route control measures
 *
 * Route, main supply route and alternate supply route: a line with a
 * traffic-direction figure and identifier at each end.
 *
 * **Everything in the end block is an amplifier, so it takes the label color and
 * stays black on a hostile route.** Only the route line itself answers to the
 * affiliation — the arrows annotate traffic flow, they are not line work
 * identifying a side. That distinction is doctrinal and easy to lose in a refactor,
 * which is why the two colors are fetched from different accessors here rather
 * than from one shared local.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {RouteDirection, TacticalGraphicName} from '../core/type';
import {offsetAbove, offsetBelow, pathLength, textWidth, uprightRotation} from './decorations';
import {amplifierDash, getFullLabel, lineColorOf, scaleOf, labelColorOf} from './paintFunctions';
import {capLabelToSpan} from './labelFit';

/** Stroke weight of the traffic arrows — half the line weight, never under 1 px. */
const routeArrowWidth = (): number => Math.max(1, LINE_WIDTH() / 2);

/** Height of the first arrow row above the route, in screen pixels. */
const ROUTE_ARROW_BASE_PX = 14;
/** Vertical pitch between the two rows of a two-way route. */
const ROUTE_ARROW_ROW_PITCH_PX = 12;
const ROUTE_ARROW_HEAD_LEN_PX = 10;
const ROUTE_ARROW_HEAD_HALF_PX = 5;
/** Clearance between the word ALT and the arrow arms either side of it. */
const ROUTE_ALT_GAP_PX = 5;
/** Length of one arm of the alternating figure. */
const ROUTE_ALT_ARM_PX = 26;
/** Floor on the span of a one- or two-way arrow figure. */
const ROUTE_ARROW_MIN_SPAN_PX = 56;

/** A text amplifier, in the label color with the usual halo. */
function amplifier(
    feature: PaintFeature, at: ProjectedPosition,
    text: string,
    scale: number,
    extra: {rotation?: number; align?: 'left' | 'center' | 'right'; baseline?: 'top' | 'middle' | 'bottom'} = {},
): Paint {
    return {
        geometry: {type: 'Point', coordinates: at},
        text: {
            text,
            font: fontStyle,
            fill: labelColorOf(feature),
            halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
            align: extra.align ?? 'center',
            baseline: extra.baseline ?? 'middle',
            rotation: extra.rotation,
            scale,
        },
    };
}

/**
 * The traffic-direction figure and identifier at one end of a route.
 *
 * The figure is built symmetrically about zero and then slid **inward** by half its
 * width, so it sits over the route rather than straddling its end. Which way is
 * inward has to be taken from the segment: the text-reading direction points
 * inward at one end of a line and outward at the other, so a fixed sign would push
 * one of the two blocks off into open space.
 */
function routeEndPaints(
    feature: PaintFeature, context: PaintContext,
    text: string,
    direction: RouteDirection,
    atStart: boolean,
    anchor: ProjectedPosition,
    a: ProjectedPosition,
    b: ProjectedPosition,
    scale: number,
): Paint[] {
    const paints: Paint[] = [];
    const color = labelColorOf(feature);
    const rotation = uprightRotation(a, b);
    const resolution = context.resolution;

    // `uprightRotation` is `-atan2(dy, dx)` flipped to keep text upright, so negating
    // it recovers the along-line unit vector in that same upright direction.
    const ux = Math.cos(-rotation);
    const uy = Math.sin(-rotation);

    let shiftPx = 0;
    /** A point `alongPx` screen px along the line, from the row centered `upPx` above it. */
    const at = (upPx: number, alongPx: number): ProjectedPosition => {
        const [cx, cy] = offsetAbove(anchor, a, b, resolution, upPx);
        const d = (alongPx + shiftPx) * resolution;
        return [cx + ux * d, cy + uy * d];
    };

    const headLenPx = ROUTE_ARROW_HEAD_LEN_PX * scale;
    const headHalfPx = ROUTE_ARROW_HEAD_HALF_PX * scale;

    /** Shaft from `fromPx` to `toPx` on row `rowPx`, solid head always at `toPx`. */
    const arrow = (rowPx: number, fromPx: number, toPx: number) => {
        const base = at(rowPx, toPx + (fromPx > toPx ? headLenPx : -headLenPx));
        paints.push({
            geometry: {type: 'LineString', coordinates: [at(rowPx, fromPx), at(rowPx, toPx)]},
            stroke: {color, widthPx: routeArrowWidth()},
        });
        const tip = at(rowPx, toPx);
        const left = offsetAbove(base, a, b, resolution, headHalfPx);
        const right = offsetBelow(base, a, b, resolution, headHalfPx);
        // Ring closed explicitly: an open ring renders inconsistently.
        paints.push({geometry: {type: 'Polygon', coordinates: [[tip, left, right, tip]]}, fill: {color}});
    };

    const rows = direction === RouteDirection.twoWay ? 2 : direction === RouteDirection.general ? 0 : 1;
    const row = (i: number) => (ROUTE_ARROW_BASE_PX + i * ROUTE_ARROW_ROW_PITCH_PX) * scale;

    if (rows > 0) {
        const labelWidthPx = textWidth(context, text, fontStyle, scale);
        const altWidthPx = direction === RouteDirection.alternating ? textWidth(context, 'ALT', fontStyle, scale) : 0;
        // An alternating row has to hold ALT plus a full arrow either side, so its
        // floor is that content, never the label, which may be shorter.
        const minSpanPx = altWidthPx > 0
            ? altWidthPx + 2 * (ROUTE_ALT_GAP_PX + ROUTE_ALT_ARM_PX) * scale
            : ROUTE_ARROW_MIN_SPAN_PX * scale;
        const halfPx = Math.max(labelWidthPx, minSpanPx) / 2;

        const inward: ProjectedPosition = atStart ? [b[0] - a[0], b[1] - a[1]] : [a[0] - b[0], a[1] - b[1]];
        shiftPx = (inward[0] * ux + inward[1] * uy >= 0 ? 1 : -1) * halfPx;

        if (direction === RouteDirection.oneWay) {
            arrow(row(0), -halfPx, halfPx);
        } else if (direction === RouteDirection.twoWay) {
            arrow(row(0), halfPx, -halfPx);   // lower row points back
            arrow(row(1), -halfPx, halfPx);   // upper row points forward
        } else {
            // Both arms point away from the word, so each shaft runs outward.
            const innerPx = altWidthPx / 2 + ROUTE_ALT_GAP_PX * scale;
            arrow(row(0), innerPx, halfPx);
            arrow(row(0), -innerPx, -halfPx);
            paints.push(amplifier(feature, at(row(0), 0), 'ALT', scale, {rotation}));
        }
    }

    // The identifier clears the top arrow row; with no arrows it falls back to the
    // plain 8 px every other line graphic uses.
    const labelOffsetPx = rows > 0 ? row(rows - 1) + headHalfPx + 11 * scale : 8;
    // Each endpoint is judged on its own segment: a route can start left-to-right
    // and have its last leg turn back, so one shared flag would flip the wrong one.
    const goesRight = b[0] >= a[0];
    const endAlign: 'left' | 'right' = atStart ? (goesRight ? 'left' : 'right') : (goesRight ? 'right' : 'left');

    paints.push(amplifier(feature, at(labelOffsetPx, 0), text, scale, {
        rotation,
        // Center the identifier over the arrow figure it caps; with no arrows there
        // is nothing to center on, so run it inward off the endpoint.
        align: rows > 0 ? 'center' : endAlign,
        baseline: 'bottom',
    }));

    return paints;
}

export function routeControlMeasurePaint(name: TacticalGraphicName): (f: PaintFeature, c: PaintContext) => Paint[] {
    return (feature, context) => {
        // Early return rather than a ternary, so `geometry` narrows from
        // `ProjectedInputGeometry` to something a mark can actually hold. A ternary
        // leaves it wide and the stroke below then fails to typecheck — which is the
        // distinction between the input and mark geometry types doing its job.
        const geometry = feature.geometry;
        if (geometry.type !== 'LineString' && geometry.type !== 'MultiPoint') return [];
        const coords = geometry.coordinates;
        if (coords.length < 2) return [];

        const text = getFullLabel(name, feature.properties.designation ?? '');
        const direction = feature.properties.direction ?? RouteDirection.general;
        /*
         * **Capped against the route's own length.**
         *
         * The designation is drawn at *both* ends, so a route shorter than two labels
         * reads as one blob with no line between them — `MSR 1MSR 1` — which is what the
         * sweep shows once it is zoomed out. The zoom-anchored scale floors at 0.3 and the
         * route does not, so the text overruns a shape that keeps shrinking.
         */
        const scale = capLabelToSpan(
            context,
            text,
            fontStyle,
            scaleOf(feature, context),
            pathLength(coords) / context.resolution,
        );

        const start = coords[0];
        const afterStart = coords[1];
        const end = coords[coords.length - 1];
        const beforeEnd = coords[coords.length - 2];

        return [
            ...routeEndPaints(feature, context, text, direction, true, start, start, afterStart, scale),
            ...routeEndPaints(feature, context, text, direction, false, end, beforeEnd, end, scale),
            {
                geometry,
                stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)},
            },
        ];
    };
}
