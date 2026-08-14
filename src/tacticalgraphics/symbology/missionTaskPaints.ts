/**
 * # The point-anchored mission tasks
 *
 * The crossed tasks — destroy, interdict, neutralize, suppress — and the
 * explosives-readiness bar symbols.
 *
 * Both families render at a **constant screen size** whatever the zoom, which is
 * unusual here: most graphics scale with the map. These are badges rather than
 * measured control measures, so they hold their size the way a unit symbol does.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {BASE_FONT_SIZE_PX, getDefaultLabelSize} from '../core/config';
import {
    CAP_HEIGHT_FRACTION,
    fontStyle,
    maxGraphicLabelScale,
    HALO_WIDTH,
    LINE_WIDTH,
    RATIO_LOCKED_LABEL_FONT,
    RATIO_LOCKED_LABEL_FONT_PX,
    RATIO_LOCKED_LABEL_FRACTION,
    getLabelFillColor,
    getLabelHaloColor,
} from '../core/symbology';
import {TacticalGraphicName, getLabel} from '../core/type';
import {BAR_SYMBOL_DASHES} from '../graphics/ExplosivesReadiness';
import {textWidth} from './decorations';
import {lineColorOf, scaleOf} from './paintFunctions';

type MissionTaskPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/**
 * Screen half-width a crossed mission task always renders at — 100 px across.
 *
 * Exported because the controller seeds a graphic's stored `size` from it, and the
 * two have to agree or the badge is built at one size and drawn at another.
 */
export const CROSSED_HALF_WIDTH_PX = 50;

/** Which of the two arms renders hashed, by sub-line index. Absent = both solid. */
const CROSSED_HASHED_ARM: Partial<Record<TacticalGraphicName, number>> = {
    // The "/" stroke of the X.
    [TacticalGraphicName.Suppress]: 0,
    // The diagonal; the horizontal stays solid.
    [TacticalGraphicName.Neutralize]: 1,
};

/** Hash pattern of a doctrinally-broken arm, in screen pixels. */
const CROSSED_HASH_DASH = [12, 8];

/**
 * Clearance between the label's glyph box and the arm ends that stop short of it.
 *
 * Added **along the arm**, past where it leaves the box — not as padding on the box
 * itself. Padding the box inflates on the diagonal, so an X would end up with a
 * visibly wider gap than a cross for the same number.
 */
const CROSSED_LABEL_CLEARANCE_PX = 7;

/** The label scale of a crossed mission task — constant, like the symbol. */
export function crossedMissionTaskLabelScale(): number {
    const sizeFactor = getDefaultLabelSize() / BASE_FONT_SIZE_PX;
    return (sizeFactor * RATIO_LOCKED_LABEL_FRACTION * CROSSED_HALF_WIDTH_PX) / BASE_FONT_SIZE_PX;
}

/**
 * The crossed mission tasks: two arms meeting at a one-letter label, with the arms
 * stopping clear of the glyph.
 *
 * ## The center is the stamped one, not the arms' midpoint
 *
 * The generator walks out from the center with a geodesic step, and Mercator then
 * stretches the northern end of a diagonal arm more than the southern one — so the
 * *projected* midpoint sits a little north of the true center. That error is fixed
 * in map units, so on screen it grows as you zoom in; and since the geometry is
 * scaled about this point while the label is not, the letter visibly drifts out of
 * its own gap.
 *
 * ## The symbol is pinned to a constant screen size
 *
 * `k` is the ratio between the half-width the geometry was built at and the one
 * wanted, so the stored size cancels out entirely and the result is the same pixel
 * count at every zoom. No clamp: it grows the geometry on zoom-out exactly as it
 * shrinks it on zoom-in.
 *
 * Where an arm leaves the label's box depends on its angle — a near-horizontal arm
 * clears the glyph's width, a near-vertical one its height — so the exit is
 * whichever half-extent that direction reaches first.
 */
export function crossedMissionTaskPaint(name: TacticalGraphicName): MissionTaskPaint {
    const label = getLabel(name);
    const hashedArm = CROSSED_HASHED_ARM[name];

    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];
        const lines = geometry.coordinates;
        if (lines.length < 2) return [];

        const color = lineColorOf(feature);
        const strokeFor = (hashed: boolean) => ({
            color,
            widthPx: LINE_WIDTH(),
            dashPx: hashed ? CROSSED_HASH_DASH : undefined,
        });

        const [a0, a1] = lines[0];
        const cx = feature.graphicCenter?.[0] ?? (a0[0] + a1[0]) / 2;
        const cy = feature.graphicCenter?.[1] ?? (a0[1] + a1[1]) / 2;

        const size = feature.graphicSize;
        const k = size && size > 0 ? (CROSSED_HALF_WIDTH_PX * context.resolution) / size : 1;
        const pinned = (p: ProjectedPosition): ProjectedPosition => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k];

        const scale = crossedMissionTaskLabelScale();
        const halfW = (textWidth(context, label, RATIO_LOCKED_LABEL_FONT, scale) / 2) * context.resolution;
        const halfH = ((RATIO_LOCKED_LABEL_FONT_PX * scale * CAP_HEIGHT_FRACTION) / 2) * context.resolution;
        const clearance = CROSSED_LABEL_CLEARANCE_PX * context.resolution;

        const paints: Paint[] = [];

        for (let i = 0; i < 2; i++) {
            const start = pinned(lines[i][0]);
            const end = pinned(lines[i][1]);
            const dx = end[0] - start[0];
            const dy = end[1] - start[1];
            const len = Math.hypot(dx, dy);
            if (len === 0) continue;

            const stroke = strokeFor(i === hashedArm);
            const ux = dx / len;
            const uy = dy / len;
            const boxExit = Math.min(
                Math.abs(ux) > 1e-9 ? halfW / Math.abs(ux) : Infinity,
                Math.abs(uy) > 1e-9 ? halfH / Math.abs(uy) : Infinity,
            );
            const gap = boxExit + clearance;

            if (!isFinite(gap) || gap * 2 >= len) {
                paints.push({geometry: {type: 'LineString', coordinates: [start, end]}, stroke});
                continue;
            }
            paints.push({
                geometry: {type: 'LineString', coordinates: [start, [cx - ux * gap, cy - uy * gap]]},
                stroke,
            });
            paints.push({
                geometry: {type: 'LineString', coordinates: [[cx + ux * gap, cy + uy * gap], end]},
                stroke,
            });
        }

        // Arrowheads are never hashed: FM 1-02.2 draws Interdict's heads solid even
        // where the arm they sit on is broken.
        for (let i = 2; i < lines.length; i++) {
            paints.push({
                geometry: {type: 'LineString', coordinates: lines[i].map(pinned)},
                stroke: strokeFor(false),
            });
        }

        return paints;
    };
}

/** The one-letter label of a crossed mission task, at its constant scale. */
export function crossedMissionTaskLabelPaint(name: TacticalGraphicName): MissionTaskPaint {
    const label = getLabel(name);
    return feature => {
        if (!label || feature.geometry.type !== 'Point') return [];
        return [{
            geometry: feature.geometry,
            text: {
                text: label,
                font: RATIO_LOCKED_LABEL_FONT,
                fill: getLabelFillColor(),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                align: 'center',
                baseline: 'middle',
                scale: crossedMissionTaskLabelScale(),
            },
        }];
    };
}

/**
 * The explosives-readiness bar symbols: a stack of horizontal bars, some dashed.
 *
 * `BAR_SYMBOL_DASHES` says which — it lives in the map-agnostic half because which
 * bar is broken *is* the symbol, and each readiness state differs only in that.
 *
 * **The dash is in screen pixels, not map units.** Multiplying by the resolution
 * once made the pattern `[200, 140]` px on a bar about 50 px long, so the whole bar
 * fell inside a single "on" segment and every state rendered identically solid.
 */
export function barSymbolPaint(name: TacticalGraphicName): MissionTaskPaint {
    const dashed = BAR_SYMBOL_DASHES[name] ?? [];

    return feature => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];
        const bars = geometry.coordinates;
        if (bars.length < 2) return [];

        const color = lineColorOf(feature);
        return bars.map((bar, i) => ({
            geometry: {type: 'LineString' as const, coordinates: bar},
            stroke: {color, widthPx: LINE_WIDTH(), dashPx: dashed[i] ? CROSSED_HASH_DASH : undefined},
        }));
    };
}

/** Padding either side of Pursuit's "P" within the gap cut for it, in pixels. */
const PURSUIT_GAP_PADDING_PX = 4;

/**
 * Pursuit: the horizontal line split around its midpoint so the "P" always has
 * breathing room, with the arc, arrowhead and crossbar drawn whole.
 *
 * Sub-line layout, from `Pursuit.generateGraphics`: `[0]` horizontal, `[1]` arc,
 * `[2]` arrowhead, `[3]` crossbar.
 *
 * The gap is measured from the **rendered** glyph and converted to map units, so
 * it matches the letter at every zoom. A line shorter than the label is not split
 * at all — two stubs either side of a letter that overflows them both is worse
 * than a line running behind it.
 */
export function pursuitPaint(name: TacticalGraphicName): MissionTaskPaint {
    const label = getLabel(name);
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];
        const lines = geometry.coordinates;

        const stroke = {color: lineColorOf(feature), widthPx: LINE_WIDTH()};
        const paints: Paint[] = [];

        const horizontal = lines[0];
        if (horizontal && horizontal.length === 2) {
            const [a, b] = horizontal;
            const mid: ProjectedPosition = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const len = Math.hypot(dx, dy);
            const scale = scaleOf(feature, context);
            const halfGap =
                (textWidth(context, label, fontStyle, scale) / 2 + PURSUIT_GAP_PADDING_PX) * context.resolution;

            if (len > 2 * halfGap) {
                const ux = dx / len;
                const uy = dy / len;
                paints.push({
                    geometry: {type: 'LineString', coordinates: [a, [mid[0] - ux * halfGap, mid[1] - uy * halfGap]]},
                    stroke,
                });
                paints.push({
                    geometry: {type: 'LineString', coordinates: [[mid[0] + ux * halfGap, mid[1] + uy * halfGap], b]},
                    stroke,
                });
            } else {
                paints.push({geometry: {type: 'LineString', coordinates: horizontal}, stroke});
            }
        }

        for (let i = 1; i < lines.length; i++) {
            paints.push({geometry: {type: 'LineString', coordinates: lines[i]}, stroke});
        }
        return paints;
    };
}


/**
 * Movement to contact: the big arrow, with the two pairs of side arrows nudged
 * outward so they do not touch its arrowhead edges.
 *
 * **Nothing here may depend on the resolution.** Everything this draws is
 * proportional to the graphic; reaching for the zoom is the bug this function
 * used to have.
 *
 * The arrow's half-length is recovered from the geometry rather than from a
 * stamped size: the tip sits at local `(+r, 0)` and the two tail-fin tips at
 * `(-r, ±0.5r)`, so the tip and the fins' midpoint are exactly `2r` apart. That
 * follows a resize for free.
 */
export function movementToContactPaint(): MissionTaskPaint {
    return feature => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];
        const stroke = {color: lineColorOf(feature), widthPx: LINE_WIDTH()};
        // Every member is a plain stroke. This used to shift the two contact bolts off
        // the arrow's outline here, in projected space, because the generator started
        // them *on* the flank; they now start clear of the wing, so the offset is part
        // of the shape both renderers read rather than something one of them applies.
        return geometry.coordinates.map(line => ({
            geometry: {type: 'LineString' as const, coordinates: line},
            stroke,
        }));
    };
}

/**
 * Divisor that turns the base defense zone circle's pixel radius into a label
 * scale. Lower for a larger label; past a ~68 px radius the cap decides, so this
 * only shapes how the label grows on the way there.
 */
const BDZ_SCALE_DIVISOR = 45;
/** Floor, so a circle dragged small still shows something rather than nothing. */
const BDZ_MIN_SCALE = 0.1;

/**
 * The base defense zone's hardcoded "BDZ", scaled off the circle's radius rather
 * than off the zoom — so it grows and shrinks with the graphic it names.
 */
export function baseDefenseZoneLabelPaint(): MissionTaskPaint {
    return (feature, context) => {
        if (feature.geometry.type !== 'Point') return [];
        const size = feature.graphicSize;
        const radiusPx = size && size > 0 ? size / context.resolution : 0;
        const scale = Math.min(maxGraphicLabelScale(), Math.max(BDZ_MIN_SCALE, radiusPx / BDZ_SCALE_DIVISOR));
        return [{
            geometry: feature.geometry,
            text: {
                text: 'BDZ',
                font: fontStyle,
                fill: getLabelFillColor(),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                align: 'center',
                baseline: 'middle',
                scale,
            },
        }];
    };
}
