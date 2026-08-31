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
    pathLength,
    textWidth,
    uprightRotation,
    walkPath,
} from './decorations';
import {amplifierDash, amplifierText, lineColorOf, scaleOf, labelColorOf} from './paintFunctions';

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
 * Where a ray leaving the star's centre crosses its outline, as a multiple of the outer
 * radius.
 *
 * A pentagram is star-shaped about its own centre, so a ray crosses the outline exactly
 * once and the answer is single-valued -- between `STAR_INNER_RATIO` into a valley and 1
 * along a point. Measured against `starRing` itself rather than against a formula, so the
 * two cannot drift: the outline the line stops at is the outline that gets drawn.
 */
function starExitRatio(direction: ProjectedPosition): number {
    const ring = starRing([0, 0], 1);
    let best = 0;
    for (let i = 0; i + 1 < ring.length; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        const ex = b[0] - a[0];
        const ey = b[1] - a[1];
        const denom = direction[0] * ey - direction[1] * ex;
        if (denom === 0) continue;
        const t = (a[0] * ey - a[1] * ex) / denom;
        const s = (a[0] * direction[1] - a[1] * direction[0]) / denom;
        if (t > best && s >= 0 && s <= 1) best = t;
    }
    return best;
}

/**
 * The drawn line with both ends pulled back to the outline of the star standing on them.
 *
 * > *(110500's Template: the line meets each star's edge and stops there.)*
 *
 * The line used to run all the way to the anchor point, which put it **inside** the star
 * and across half of it -- a stroke through the middle of a symbol that the plate draws
 * clear. The trim is directional because the star is: how far the outline is from the
 * centre depends on whether the line leaves through a point or a valley.
 *
 * `null` when the two stars leave nothing between them. That is unreachable while
 * `endMarkScale` caps each star at 30% of the line, but a line shorter than the marks
 * standing on it has no connecting stroke to draw, and inventing a backwards one is worse
 * than drawing none.
 */
function pathBetweenStars(path: ProjectedPosition[], radius: number): ProjectedPosition[] | null {
    const unit = (from: ProjectedPosition, to: ProjectedPosition): ProjectedPosition | null => {
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        const len = Math.hypot(dx, dy);
        return len === 0 ? null : [dx / len, dy / len];
    };

    const out = unit(path[0], path[1]);
    const back = unit(path[path.length - 1], path[path.length - 2]);
    if (!out || !back) return path;

    const fromStart = starExitRatio(out) * radius;
    const fromEnd = starExitRatio(back) * radius;
    const total = pathLength(path);
    if (!(total > fromStart + fromEnd)) return null;

    const startAt = walkPath(path, fromStart);
    const endAt = walkPath(path, total - fromEnd);
    if (!startAt || !endAt) return null;

    // Whatever the user drew between the two cuts, plus the cuts themselves. A vertex
    // inside either star is dropped rather than kept and hidden: the paint is the line,
    // and a renderer measuring it should measure what is on the screen.
    const middle: ProjectedPosition[] = [];
    let acc = 0;
    for (let i = 0; i + 1 < path.length; i++) {
        acc += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
        if (acc > fromStart && acc < total - fromEnd) middle.push(path[i + 1]);
    }
    return [startAt.point, ...middle, endAt.point];
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
        const paints: Paint[] = [];

        const text = [feature.properties.designation, feature.properties.secondDesignation]
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
        if (scale <= 0) {
            // No star small enough to be worth drawing, so nothing for the line to stop at.
            paints.push({geometry: {type: 'LineString', coordinates: path}, stroke});
            return paints;
        }

        const radius = radiusPx * scale * context.resolution;

        // **The line stops at each star's outline, and never inside it.** @see pathBetweenStars
        const between = pathBetweenStars(path, radius);
        if (between) paints.push({geometry: {type: 'LineString', coordinates: between}, stroke});

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
        const at = (u: number): ProjectedPosition => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
        const gapped = segLen > halfGap * 2;
        const t = gapped ? halfGap / segLen : 0;
        if (gapped) outline.push([a, at(0.5 - t)], [at(0.5 + t), b]);
        else outline.push([a, b]);

        // The line either side of the echelon, which is where the free text goes.
        const runs: ProjectedPosition[][] = [
            [...path.slice(0, segIdx + 1), at(0.5 - t)],
            [at(0.5 + t), ...path.slice(segIdx + 1)],
        ];

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

        /*
         * **Field H, not field T.** The Template carries `H` over `B` and no `T` at all, and
         * the worked example reads "SMALL DITCHES" — a description of the going, not a name.
         * This read `designation` while the comment below already called it field H.
         *
         * `designation` is still honoured as a fallback so corridors saved before the field
         * moved keep their text. Nothing writes it any more.
         */
        const props = feature.properties;
        /*
         * **Through `amplifierText`, unlike the designation this replaced.** A designation
         * survives "show name only" — it is the graphic's name. Field H is an annotation
         * and has to drop with the rest, and reading it raw leaked "TYPE II" onto a corridor
         * that was meant to be showing nothing but its symbol.
         */
        const text = amplifierText(feature, (props.additionalInfo ?? props.designation ?? '').trim());
        if (!text) return paints;

        /*
         * **Beside the echelon, not above it.** The Template stands field B in the break at
         * the middle and sets field H above the line *to one side of it*; ours put H at the
         * same midpoint, so the free text sat on top of the glyph it is meant to accompany.
         *
         * Which side is the content's business — the row's own note asks only that H "be
         * movable to avoid obscuring key geographic information" — so it goes over the run
         * that holds it better: the longer of the two on screen, and the leading one when
         * they are equal, which is the side the Template draws it on.
         */
        const widthPx = textWidth(context, text, fontStyle, scale);
        const lengthPx = (run: ProjectedPosition[]) => pathLength(run) / context.resolution;
        const [leading, trailing] = runs;
        const run = lengthPx(leading) >= widthPx || lengthPx(leading) >= lengthPx(trailing) ? leading : trailing;
        const spot = walkPath(run, pathLength(run) / 2);

        const anchor = spot ? spot.point : mid;
        const along: [ProjectedPosition, ProjectedPosition] = spot
            ? [anchor, [anchor[0] + spot.tangent[0], anchor[1] + spot.tangent[1]]]
            : [a, b];

        paints.push({
            geometry: {
                type: 'Point',
                coordinates: offsetAbove(anchor, along[0], along[1], context.resolution, LABEL_OFFSET_PX + 4),
            },
            text: {
                text,
                font: fontStyle,
                fill: labelColorOf(feature),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                rotation: uprightRotation(along[0], along[1]),
                align: 'center',
                baseline: 'bottom',
                scale,
            },
        });
        return paints;
    };
}
