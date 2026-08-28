/**
 * # The obstacle bypasses
 *
 * The paint half of APP-06 270601 / 270602 / 270603. @see ObstacleBypass.ts for the
 * rectangle, which is geometry: all three of its dimensions come from anchor points the
 * user placed, so the shape scales with the graphic.
 *
 * Left here: the arrowheads, which are a screen size, and the rear bar's three forms.
 *
 * **The bar's zigzag is proportional, not screen-sized.** Every other repeating mark in
 * this library is a screen size capped against the shape, because it repeats along a line
 * of arbitrary length. This one does not repeat along anything arbitrary — the bar is
 * exactly as long as the symbol's own opening, and the plate draws a fixed number of zigs
 * across it whatever size the symbol is. A screen-sized pitch would put two zigs on a small
 * bypass and thirty on a large one, which reads as two different symbols.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {LINE_WIDTH} from '../core/symbology';
import {TacticalGraphicName} from '../core/type';
import {
    BYPASS_LOWER_LINE,
    BYPASS_REAR_BAR,
    BYPASS_UPPER_LINE,
    OBSTACLE_BYPASS_STYLES,
    ObstacleBypassRear,
} from '../graphics/ObstacleBypass';
import {endMarkScale, solidArrowHead} from './decorations';
import {lineColorOf} from './paintFunctions';

type BypassPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** Length of a bypass arrowhead's barbs, in screen pixels before `endMarkScale`. */
const ARROWHEAD_PX = 26;
/** Half the angle between the two barbs, in degrees. */
const ARROWHEAD_HALF_ANGLE_DEG = 20;

/** Zigs across the difficult bar, and how far each swings, as a share of the bar's length. */
const ZIGZAG_COUNT = 5;
const ZIGZAG_AMPLITUDE = 0.11;

/** Share of the broken bar each stub occupies, and how long its closing tick is. */
const BROKEN_STUB_SHARE = 0.41;
const BROKEN_TICK_SHARE = 0.14;

/** Straight-line interpolation between two projected points. */
const lerp = (a: ProjectedPosition, b: ProjectedPosition, t: number): ProjectedPosition =>
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** The rear bar, in whichever of its three forms this graphic draws. */
function rearBar(bar: ProjectedPosition[], style: ObstacleBypassRear): ProjectedPosition[][] {
    const [a, b] = [bar[0], bar[bar.length - 1]];
    if (style === 'straight') return [[a, b]];

    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return [[a, b]];
    // Unit normal, so a swing is measured across the bar rather than along it.
    const nx = -dy / len;
    const ny = dx / len;

    if (style === 'zigzag') {
        const swing = len * ZIGZAG_AMPLITUDE;
        const path: ProjectedPosition[] = [a];
        for (let i = 1; i <= ZIGZAG_COUNT * 2 - 1; i++) {
            const t = i / (ZIGZAG_COUNT * 2);
            const side = i % 2 === 1 ? 1 : -1;
            const on = lerp(a, b, t);
            path.push([on[0] + nx * swing * side, on[1] + ny * swing * side]);
        }
        path.push(b);
        return [path];
    }

    // Broken: two stubs, each closed by a short tick across the bar. The tick is what
    // makes the gap read as a deliberate break rather than as a bar that failed to draw.
    const tick = len * BROKEN_TICK_SHARE;
    const stubEnd = (t: number): ProjectedPosition[][] => {
        const on = lerp(a, b, t);
        return [
            [t === BROKEN_STUB_SHARE ? a : b, on],
            [[on[0] - nx * tick / 2, on[1] - ny * tick / 2], [on[0] + nx * tick / 2, on[1] + ny * tick / 2]],
        ];
    };
    return [...stubEnd(BROKEN_STUB_SHARE), ...stubEnd(1 - BROKEN_STUB_SHARE)];
}

/**
 * A bypass: two parallel arrows and the rear bar that closes them.
 *
 * **Always the neutral line color.** The row's own note says obstacle bypass symbols
 * *"indicate a mobility function and should be rendered in black"*, so the three are
 * exempt from the identity color — enforced in `supportsHostility` rather than here, so
 * an identity arriving from an imported file cannot reach the stroke either.
 */
export function obstacleBypassPaint(name: TacticalGraphicName): BypassPaint {
    const style = OBSTACLE_BYPASS_STYLES[name] ?? 'straight';

    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];

        const parts = geometry.coordinates;
        const stroke = {color: lineColorOf(feature), widthPx: LINE_WIDTH()};
        const upper = parts[BYPASS_UPPER_LINE];
        const lower = parts[BYPASS_LOWER_LINE];
        const bar = parts[BYPASS_REAR_BAR];
        if (!upper || !lower || !bar) return [{geometry, stroke}];

        const paints: Paint[] = [
            {geometry: {type: 'MultiLineString', coordinates: [upper, lower]}, stroke},
            {geometry: {type: 'MultiLineString', coordinates: rearBar(bar, style)}, stroke},
        ];

        const scale = endMarkScale(upper, context.resolution, ARROWHEAD_PX);
        if (scale <= 0) return paints;

        const size = ARROWHEAD_PX * scale * context.resolution;
        for (const line of [upper, lower]) {
            const head = solidArrowHead(line[0], line[line.length - 1], size, ARROWHEAD_HALF_ANGLE_DEG);
            // Filled and not also stroked: a stroke straddles the edge it draws, so it
            // inflates the head by half a line width all round. @see antiTankDitchPaint
            if (head) paints.push({geometry: {type: 'Polygon', coordinates: [head]}, fill: {color: stroke.color}});
        }
        return paints;
    };
}
