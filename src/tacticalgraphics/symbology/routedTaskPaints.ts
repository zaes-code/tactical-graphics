/**
 * # Turn, relief in place and exfiltrate
 *
 * Three route-shaped tasks that each open a gap for a designation and each do it
 * somewhere different: turn cuts its at the arc-length midpoint of a bowed curve,
 * relief in place at 20% along its top rail, exfiltrate at the middle of its
 * first segment.
 *
 * All three size the gap from the **rendered** glyph. The labels are zoom-clamped
 * while the geometry is not, so a gap baked in meters drifts against the letter
 * it makes room for — wider zoomed in, tighter zoomed out.
 * @see conventions.md, "a gap follows what it makes room for"
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {paintGeometryMembers} from '../core/paint';
import {
    HALO_WIDTH,
    LINE_WIDTH,
    RATIO_LOCKED_LABEL_FONT,
    fontStyle,
    getLabelFillColor,
    getLabelHaloColor,
} from '../core/symbology';
import {screenSizedArrowHead, textWidth, uprightRotation} from './decorations';
import {lineColorOf, scaleOf} from './paintFunctions';

type TaskPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** Clearance either side of a letter within its gap, in screen pixels. */
const GAP_PADDING_PX = 4;
/** Turn's is wider — its letter sits in a curve, which crowds the glyph. */
const TURN_LABEL_PAD_PX = 5;

/** A text amplifier with the usual halo. */
function amplifier(at: ProjectedPosition, text: string, font: string, scale: number, rotation: number): Paint {
    return {
        geometry: {type: 'Point', coordinates: at},
        text: {
            text,
            font,
            fill: getLabelFillColor(),
            halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
            rotation,
            align: 'center',
            baseline: 'middle',
            scale,
        },
    };
}

/** Shortens a path by `distance` map units, taken off its far end. */
function trimFromEnd(coords: ProjectedPosition[], distance: number): ProjectedPosition[] {
    let remaining = distance;
    const kept = coords.map(c => [c[0], c[1]] as ProjectedPosition);
    while (kept.length >= 2) {
        const last = kept[kept.length - 1];
        const prev = kept[kept.length - 2];
        const segment = Math.hypot(last[0] - prev[0], last[1] - prev[1]);
        if (segment > remaining) {
            const t = remaining / segment;
            kept[kept.length - 1] = [last[0] + (prev[0] - last[0]) * t, last[1] + (prev[1] - last[1]) * t];
            return kept;
        }
        remaining -= segment;
        kept.pop();
    }
    return kept;
}

/**
 * Turn: the bowed curve and its filled arrowhead, with the curve trimmed back
 * either side of the "T".
 *
 * The curve arrives as `[before, after]`, two halves meeting exactly at the
 * arc-length midpoint — the holder asks the generator for no gap and the cutting
 * happens here instead, so the hole always matches the letter.
 *
 * **No letter, no gap.** The padding is added on top of the measured width, so an
 * empty label would still leave 10 px of curve missing.
 *
 * The arrowhead is filled, never trimmed, and held at a screen size rather than
 * the meters the generator baked in at draw time.
 */
export function turnPaint(label: string): TaskPaint {
    return (feature, context) => {
        const color = lineColorOf(feature);
        const stroke = {color, widthPx: LINE_WIDTH()};
        const members = paintGeometryMembers(feature.geometry);

        const scale = scaleOf(feature, context);
        const halfGap = label
            ? (textWidth(context, label, fontStyle, scale) / 2 + TURN_LABEL_PAD_PX) * context.resolution
            : 0;

        // The curve, for capping the head against the graphic's own on-screen size.
        const curve: ProjectedPosition[] = [];
        for (const member of members) {
            if (member.type === 'MultiLineString') for (const part of member.coordinates) curve.push(...part);
        }

        const paints: Paint[] = [];
        for (const member of members) {
            if (member.type === 'Polygon') {
                const head = screenSizedArrowHead(member.coordinates[0], curve, context.resolution);
                if (head) paints.push({geometry: {type: 'Polygon', coordinates: [head]}, fill: {color}, stroke});
                continue;
            }
            if (member.type !== 'MultiLineString') {
                paints.push({geometry: member, stroke});
                continue;
            }
            member.coordinates.forEach((half, i) => {
                const trimmed = halfGap > 0
                    ? i === 0
                        ? trimFromEnd(half, halfGap)
                        : trimFromEnd(half.slice().reverse(), halfGap).reverse()
                    : half;
                if (trimmed.length >= 2) paints.push({geometry: {type: 'LineString', coordinates: trimmed}, stroke});
            });
        }
        return paints;
    };
}

/** Where along relief in place's top rail its "RIP" sits. */
const RELIEF_IN_PLACE_GAP_POSITION = 0.2;

/**
 * Relief in place: two rails joined by a curve, with "RIP" set near the start of
 * the top one.
 *
 * Sub-line layout, from `ReliefInPlace.generateGraphics`: `[0]` top rail,
 * `[1]` curve, `[2]` bottom rail, `[3]` bottom arrow, `[4]` top arrow. The top
 * arrow is optional — a route short enough not to carry one simply omits it.
 */
export function reliefInPlacePaint(label: string): TaskPaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];
        const coords = geometry.coordinates;
        if (coords.length < 4) return [];

        const stroke = {color: lineColorOf(feature), widthPx: LINE_WIDTH()};
        const top = coords[0];
        const p1 = top[0];
        const p2 = top[1];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);
        if (segLen === 0) return [];

        const scale = scaleOf(feature, context);
        const halfGapPx = textWidth(context, label, RATIO_LOCKED_LABEL_FONT, scale) / 2 + GAP_PADDING_PX;
        const gapRatio = (halfGapPx * context.resolution) / segLen;
        const t = RELIEF_IN_PLACE_GAP_POSITION;

        const gapA: ProjectedPosition = [p1[0] + dx * (t - gapRatio), p1[1] + dy * (t - gapRatio)];
        const gapB: ProjectedPosition = [p1[0] + dx * (t + gapRatio), p1[1] + dy * (t + gapRatio)];

        const line = (c: ProjectedPosition[]): Paint => ({geometry: {type: 'LineString', coordinates: c}, stroke});

        return [
            line([p1, gapA]),
            line([gapB, p2]),
            ...coords.slice(1, 5).map(line),
            amplifier(
                [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2],
                label,
                RATIO_LOCKED_LABEL_FONT,
                scale,
                uprightRotation(p1, p2),
            ),
        ];
    };
}

/**
 * Exfiltrate: the whole drawn route with a gap in the middle of its **first**
 * segment for the "EX", plus the arrowhead on the far end.
 *
 * Geometry from `Exfiltrate.generateGraphics`: `[0]` is the route, `[1]` the
 * arrowhead. Only the first segment is split; everything past the first bend
 * renders as one continuous piece — which is why this is not
 * {@link retrogradeTaskPaint}, whose rebuild from the first two vertices alone
 * would drop every segment after the bend.
 *
 * A label wider than the segment holding it leaves the route unbroken, rather
 * than opening a gap that swallows the segment whole.
 */
export function exfiltratePaint(label: string): TaskPaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];
        const lines = geometry.coordinates;
        const route = lines[0];
        if (!route || route.length < 2) return [];

        // Everything after the route renders untouched — that is the arrowhead.
        const outline: ProjectedPosition[][] = lines.slice(1);

        const p1 = route[0];
        const p2 = route[1];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        const scale = scaleOf(feature, context);
        const halfGapPx = textWidth(context, label, RATIO_LOCKED_LABEL_FONT, scale) / 2 + GAP_PADDING_PX;
        const gapRatio = segLen > 0 ? (halfGapPx * context.resolution) / segLen : 0;

        if (gapRatio > 0 && gapRatio < 0.5) {
            const at = (t: number): ProjectedPosition => [p1[0] + dx * t, p1[1] + dy * t];
            outline.push([p1, at(0.5 - gapRatio)]);
            // The far side of the gap runs on through every remaining vertex, so a
            // bent route stays connected.
            outline.push([at(0.5 + gapRatio), ...route.slice(1)]);
        } else {
            outline.push(route);
        }

        return [
            amplifier(
                [p1[0] + dx * 0.5, p1[1] + dy * 0.5],
                label,
                RATIO_LOCKED_LABEL_FONT,
                scale,
                uprightRotation(p1, p2),
            ),
            {geometry: {type: 'MultiLineString', coordinates: outline}, stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()}},
        ];
    };
}
