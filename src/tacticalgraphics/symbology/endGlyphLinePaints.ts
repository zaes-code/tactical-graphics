/**
 * # The lines that stand a glyph on each anchor point
 *
 * The decision line (APP-06 110500) and the mobility corridor (142100). Both draw a plain
 * line and put a fixed mark at each end, and neither mark is anywhere else in the library:
 * a five-pointed star with text set inside it, and an outward-opening fork.
 *
 * Both marks are **screen-sized**. Neither row says the mark scales with the line — only
 * that *"the first and last anchor points determine the length of the line"* — and a mark
 * that does not scale with the graphic is a screen size. @see endMarkScale
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicEchelon} from '../core/type';
import {echelonMarks} from './echelonPaints';
import {
    centerSegmentIndex,
    endFrame,
    endMarkScale,
    offsetAbove,
    textWidth,
    uprightRotation,
} from './decorations';
import {amplifierDash, lineColorOf, scaleOf, labelColorOf} from './paintFunctions';

type EndGlyphPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** Screen-pixel clearance between the line and the nearest edge of an amplifier. */
const LABEL_OFFSET_PX = 8;

/** The path a line graphic was drawn along. */
function drawnPath(feature: PaintFeature): ProjectedPosition[] {
    const geometry = feature.geometry;
    if (geometry.type === 'LineString' || geometry.type === 'MultiPoint') return geometry.coordinates;
    if (geometry.type === 'MultiLineString') return geometry.coordinates[0] ?? [];
    return [];
}

/** Smallest outer radius of a decision line's star, in screen pixels before `endMarkScale`. */
const STAR_RADIUS_PX = 34;

/** Clear space between the text and the star's inner edge, in screen pixels. */
const STAR_TEXT_PADDING_PX = 5;

/**
 * The ratio of a five-pointed star's inner radius to its outer one.
 *
 * Not a taste decision: it is the value that makes the ten edges collinear in pairs, so the
 * outline reads as a pentagram rather than as a ten-sided cog. Any other ratio draws a star
 * that is recognisably not the one on the plate.
 */
const STAR_INNER_RATIO = Math.sin(Math.PI / 10) / Math.sin((7 * Math.PI) / 10);

/** A five-pointed star centered on `at`, one point up, closed. */
function starRing(at: ProjectedPosition, radius: number): ProjectedPosition[] {
    const ring: ProjectedPosition[] = [];
    for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? radius : radius * STAR_INNER_RATIO;
        // Start at straight up and step a tenth of a turn, so a point leads.
        const angle = Math.PI / 2 + (i * Math.PI) / 5;
        ring.push([at[0] + Math.cos(angle) * r, at[1] + Math.sin(angle) * r]);
    }
    ring.push(ring[0]);
    return ring;
}

/**
 * APP-06 110500 decision line: a line with a star on each anchor point and the end-of-line
 * information set inside it.
 *
 * The template writes that information as `T/AS` and the Example renders it `1X/007`, so
 * the two fields are joined by a slash — and a lone one is shown alone rather than with a
 * dangling separator, since a decision line known only by its designation is a real thing
 * an operator enters.
 *
 * **The stars stay upright** whichever way the line runs. They are a symbol rather than a
 * decoration of the stroke, and a star rotated to a line's bearing stops looking like one.
 */
export function decisionLinePaint(): EndGlyphPaint {
    return (feature, context) => {
        const path = drawnPath(feature);
        if (path.length < 2) return [];

        const color = lineColorOf(feature);
        const stroke = {color, widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)};
        const paints: Paint[] = [{geometry: {type: 'LineString', coordinates: path}, stroke}];

        const text = [feature.properties.label, feature.properties.secondId]
            .map(part => (part ?? '').trim())
            .filter(Boolean)
            .join('/');

        // **The star is sized from the rendered text, not the other way round.** The
        // information goes *inside* it, and a fixed radius leaves "1X/007" hanging out of
        // both sides of the star at any realistic font size. Sizing from `measureText` is
        // the same rule the munition flight path's gap follows.
        const textScale = scaleOf(feature, context);
        const halfText = textWidth(context, text, fontStyle, textScale) / 2;
        const neededPx = text ? (halfText + STAR_TEXT_PADDING_PX) / STAR_INNER_RATIO : 0;
        const radiusPx = Math.max(STAR_RADIUS_PX, neededPx);

        const scale = endMarkScale(path, context.resolution, radiusPx);
        if (scale <= 0) return paints;

        const radius = radiusPx * scale * context.resolution;

        for (const at of [path[0], path[path.length - 1]]) {
            paints.push({geometry: {type: 'LineString', coordinates: starRing(at, radius)}, stroke});
            if (!text) continue;
            paints.push({
                geometry: {type: 'Point', coordinates: at},
                text: {
                    text,
                    font: fontStyle,
                    fill: labelColorOf(feature),
                    halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                    align: 'center',
                    baseline: 'middle',
                    scale: textScale,
                },
            });
        }
        return paints;
    };
}

/** Length of a mobility corridor's fork arms, in screen pixels before `endMarkScale`. */
const FORK_ARM_PX = 34;
/** Half the angle the fork opens through, in degrees. */
const FORK_HALF_ANGLE_DEG = 30;
/** Screen-pixel clearance either side of the echelon glyph in the gap cut for it. */
const ECHELON_GAP_PX = 16;

/**
 * APP-06 142100 mobility corridor: a line forking open at each end, with the echelon in a
 * break at its middle and the free-text amplifier above it.
 *
 * **The echelon is mandatory here in a way it is nowhere else** — the row's own note says
 * field B *"is mandatory to articulate the size of force that could exploit the Mobility
 * Corridor"* — so an unset echelon still draws a glyph rather than nothing, which is what
 * `echelonMarks` already does for the battle position.
 *
 * The fork opens **outward**, away from the line, which is what makes the symbol read as a
 * corridor widening at both mouths rather than as an arrow pointing somewhere.
 */
export function mobilityCorridorPaint(): EndGlyphPaint {
    return (feature, context) => {
        const path = drawnPath(feature);
        if (path.length < 2) return [];

        const color = lineColorOf(feature);
        const stroke = {color, widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)};
        const scale = scaleOf(feature, context);

        // The middle segment, split around the gap the echelon glyph sits in.
        const segIdx = centerSegmentIndex(path);
        const a = path[segIdx];
        const b = path[segIdx + 1];
        const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const mid: ProjectedPosition = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

        const outline: ProjectedPosition[][] = [];
        for (let i = 0; i < path.length - 1; i++) {
            if (i !== segIdx) outline.push([path[i], path[i + 1]]);
        }

        const halfGap = ECHELON_GAP_PX * scale * context.resolution;
        if (segLen > halfGap * 2) {
            const t = halfGap / segLen;
            const at = (u: number): ProjectedPosition => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
            outline.push([a, at(0.5 - t)], [at(0.5 + t), b]);
        } else {
            outline.push([a, b]);
        }

        const paints: Paint[] = [{geometry: {type: 'MultiLineString', coordinates: outline}, stroke}];

        paints.push(...echelonMarks(
            mid,
            b[0] - a[0],
            b[1] - a[1],
            context.resolution,
            feature.echelon ?? feature.properties.echelon ?? TacticalGraphicEchelon.squad,
            color,
            scale,
        ));

        const armScale = endMarkScale(path, context.resolution, FORK_ARM_PX);
        if (armScale > 0) {
            const arm = FORK_ARM_PX * armScale * context.resolution;
            const spread = Math.tan((FORK_HALF_ANGLE_DEG * Math.PI) / 180);
            const arms: ProjectedPosition[][] = [];
            for (const atStart of [true, false]) {
                const frame = endFrame(path, atStart);
                if (!frame) continue;
                for (const side of [-1, 1]) {
                    arms.push([frame.origin, [
                        frame.origin[0] - (frame.u[0] - frame.v[0] * spread * side) * arm,
                        frame.origin[1] - (frame.u[1] - frame.v[1] * spread * side) * arm,
                    ]]);
                }
            }
            if (arms.length) paints.push({geometry: {type: 'MultiLineString', coordinates: arms}, stroke});
        }

        const text = (feature.properties.label ?? '').trim();
        if (!text) return paints;

        // Above the middle, on the far side of the line from nothing in particular — the
        // note only asks that it be movable, which is a host's job rather than a default's.
        paints.push({
            geometry: {type: 'Point', coordinates: offsetAbove(mid, a, b, context.resolution, LABEL_OFFSET_PX + 4)},
            text: {
                text,
                font: fontStyle,
                fill: labelColorOf(feature),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                rotation: uprightRotation(a, b),
                align: 'center',
                baseline: 'bottom',
                scale,
            },
        });
        return paints;
    };
}
