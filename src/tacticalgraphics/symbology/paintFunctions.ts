/**
 * # Three graphics, painted without a renderer
 *
 * The spike from `ai/maplibre-renderer.md`: one plain line, one screen-pixel
 * decoration, one point-anchored letter with a glyph-measured gap. They were
 * picked because they are the three *kinds* of work the other 66 style functions
 * are made of, not because they are the easiest three.
 *
 * | | ported from | what it proves |
 * |---|---|---|
 * | {@link phaseLinePaint} | `phaseLineStyle` | rotation, upright flip, a gap measured off the glyph |
 * | {@link obstacleLinePaint} | `obstacleLineStyleFromLabels` | geometry synthesised per frame, `decorationScale` against the shape |
 * | {@link arcMissionTaskPaint} | `arcMissionTaskStyleFunc` | a gap cut from the *rendered* letter, projected onto a tangent |
 *
 * Each is a transcription of its OpenLayers original — the arithmetic is
 * unchanged, so a difference between the two renderings is a porting bug and not
 * a redesign. What changed is only where the inputs come from: amplifiers off
 * `feature.properties` instead of `feature.get()`, text widths through
 * `context.measureText` instead of a module-level canvas.
 *
 * **The finding this spike exists to produce**: none of the three could be
 * expressed as a MapLibre paint/layout expression. All three build geometry that
 * is not in the source, and two of them size it from a text measurement. See the
 * write-up in `ai/maplibre-renderer.md`.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {
    CAP_HEIGHT_FRACTION,
    HALO_WIDTH,
    LINE_WIDTH,
    RATIO_LOCKED_LABEL_FONT,
    RATIO_LOCKED_LABEL_FONT_PX,
    fontStyle,
    getColorByHostility,
    getLabelFillColor,
    getLabelHaloColor,
    labelScale,
    ratioLockedLabelScale,
} from '../core/symbology';
import {BASE_FONT_SIZE_PX} from '../core/config';
import {TacticalGraphicHostility, TacticalGraphicName, getLabel} from '../core/type';
import {
    centreSegmentIndex,
    crenellatedPath,
    cutArcAtLabel,
    obstacleToothSize,
    textWidth,
    uprightRotation,
} from './decorations';

/** A graphic's static prefix joined to the user's free text — "PL", "PL BLUE". */
export function formatFullLabel(prefix: string, name: string): string {
    return prefix ? `${prefix} ${name}`.trim() : name;
}

export function getFullLabel(graphicName: TacticalGraphicName, customName: string): string {
    return formatFullLabel(getLabel(graphicName), customName);
}

/** The affiliation a feature draws in. `unknown` resolves to the default line colour. */
function hostilityOf(feature: PaintFeature): TacticalGraphicHostility {
    return feature.properties.hostility ?? TacticalGraphicHostility.unknown;
}

function lineColorOf(feature: PaintFeature): string {
    return getColorByHostility(hostilityOf(feature));
}

/** The halo every label carries, so it stays legible over the basemap. */
function halo(): {color: string; widthPx: number} {
    return {color: getLabelHaloColor(), widthPx: HALO_WIDTH};
}

/** Zoom-anchored label scale for a paint feature. */
function scaleOf(feature: PaintFeature, context: PaintContext): number {
    return labelScale(feature.drawingResolution, context.resolution);
}

// ── 1. Phase line — the plain case, which still needs a glyph measurement ─────

/** Screen-pixel gap between the end of the line and the nearest edge of its label. */
const PHASE_LINE_GAP_PX = 8;

/**
 * A line with its designation repeated outside each end, laid along the line's
 * own bearing and kept upright.
 *
 * The "plain line" of the spike, and it is already not expressible declaratively:
 * `offsetXPx` has to clear the label's own rendered width, which is a text
 * measurement, and the side it is pushed to depends on which way the segment
 * runs on screen.
 *
 * **Hostile lines prefix their label with "ENY", and the test is the affiliation,
 * not the colour string.** A colour is resolved at stamp time, so a string
 * compare would both miss a feature stamped under a different palette and be one
 * refactor away from matching some unrelated red.
 */
export function phaseLinePaint(name: TacticalGraphicName): (f: PaintFeature, c: PaintContext) => Paint[] {
    return (feature, context) => {
        if (feature.geometry.type !== 'LineString') return [];
        const coords = feature.geometry.coordinates;
        if (coords.length < 2) return [];

        let text = getFullLabel(name, feature.properties.label ?? '');
        if (hostilityOf(feature) === TacticalGraphicHostility.hostileFaker) text = `ENY ${text}`;

        const start = coords[0];
        const startNext = coords[1];
        const end = coords[coords.length - 1];
        const endPrev = coords[coords.length - 2];

        const scale = scaleOf(feature, context);
        const width = textWidth(context, text, fontStyle, scale);

        // Which screen-x side is "outside" each endpoint. `offsetXPx` is in screen
        // pixels and is NOT rotated with the text, so the actual x-component of each
        // segment has to be checked — the "keep upright" flip makes the rotation
        // identical for both directions, and without this the label lands on the line.
        const startOutsideRight = start[0] - startNext[0] >= 0;
        const endOutsideRight = end[0] - endPrev[0] >= 0;

        const endLabel = (at: ProjectedPosition, rotation: number, align: 'left' | 'right', offsetXPx: number): Paint => ({
            geometry: {type: 'Point', coordinates: at},
            text: {
                text,
                font: fontStyle,
                fill: getLabelFillColor(),
                halo: halo(),
                rotation,
                align,
                baseline: 'middle',
                offsetXPx,
                scale,
            },
        });

        return [
            {
                geometry: feature.geometry,
                stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH(), cap: 'butt', join: 'round'},
            },
            endLabel(start, uprightRotation(start, startNext), 'left',
                startOutsideRight ? PHASE_LINE_GAP_PX : -PHASE_LINE_GAP_PX - width),
            endLabel(end, uprightRotation(endPrev, end), 'right',
                endOutsideRight ? PHASE_LINE_GAP_PX + width : -PHASE_LINE_GAP_PX),
        ];
    };
}

// ── 2. Obstacle line — geometry that does not exist until it is drawn ─────────

/** Screen-pixel gap between an obstacle line's teeth and the nearest edge of its label. */
const OBSTACLE_LABEL_GAP_PX = 8;

/**
 * A line wearing triangular teeth, with its designation below.
 *
 * The teeth are **not in the geometry**. They are built here, at this frame's
 * resolution, by {@link crenellatedPath} — which is the whole difficulty of a
 * second renderer in one function. A MapLibre `line` layer renders what its
 * source holds; there is no expression that can add a tooth.
 *
 * The label takes the lower side and the teeth the upper, whichever way the line
 * was drawn, so the two never compete. "Lower" is the perpendicular with a
 * negative northing rather than one derived from the direction of travel — that
 * is what stopped the label changing sides when the same line was drawn
 * right-to-left. A vertical line has no lower side, so the tie breaks east.
 */
export function obstacleLinePaint(name: TacticalGraphicName): (f: PaintFeature, c: PaintContext) => Paint[] {
    return (feature, context) => {
        if (feature.geometry.type !== 'LineString') return [];
        const coords = feature.geometry.coordinates;
        if (coords.length < 2) return [];

        const text = getFullLabel(name, feature.properties.label ?? '');
        const paints: Paint[] = [];

        const segIdx = centreSegmentIndex(coords);
        const p1 = coords[segIdx];
        const p2 = coords[segIdx + 1];

        const segDx = p2[0] - p1[0];
        const segDy = p2[1] - p1[1];
        const segLength = Math.hypot(segDx, segDy);
        if (segLength === 0) return paints;

        const dir: ProjectedPosition = [segDx / segLength, segDy / segLength];
        const mid: ProjectedPosition = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];

        let normal: ProjectedPosition = [-dir[1], dir[0]];
        if (normal[1] > 0 || (normal[1] === 0 && normal[0] < 0)) normal = [-normal[0], -normal[1]];

        // Stand off the line by a constant number of pixels. Both terms are
        // screen-sized, because text does not scale with the map — this used to be a
        // scan of the rendered geometry to discover how far metric teeth happened to
        // reach, which sent the label a screen away on a line that doubled back.
        const scale = scaleOf(feature, context);
        const halfTextHeightPx = (BASE_FONT_SIZE_PX / 2) * scale;
        const offsetMap = (halfTextHeightPx + OBSTACLE_LABEL_GAP_PX) * context.resolution;

        paints.push({
            geometry: {
                type: 'Point',
                coordinates: [mid[0] + normal[0] * offsetMap, mid[1] + normal[1] * offsetMap],
            },
            text: {
                text,
                font: fontStyle,
                fill: getLabelFillColor(),
                halo: halo(),
                rotation: uprightRotation(p1, p2),
                align: 'center',
                baseline: 'middle',
                scale,
            },
        });

        const {heightMap, baseMap, gapMap} = obstacleToothSize(coords, false, context.resolution);
        paints.push({
            geometry: {type: 'LineString', coordinates: crenellatedPath(coords, heightMap, baseMap, gapMap, 'up')},
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
        });

        return paints;
    };
}

// ── 3. Arc mission tasks — a hole cut to fit the letter that actually renders ─

/** Clearance between the label's glyph box and each arc end, in screen pixels. */
const ARC_LABEL_CLEARANCE_PX = 5;

/**
 * Widest the label gap may open, in degrees of arc either side of the label. Only
 * reached when the circle is small enough that the letter genuinely spans that
 * much of it; past this the arcs would stop reading as a circle at all, so the
 * letter is allowed to overhang instead.
 */
const ARC_LABEL_MAX_HALF_GAP_RAD = (40 * Math.PI) / 180;

/**
 * The arc-and-arrowhead mission tasks — Secure, Isolate, Retain, Occupy, Control,
 * Contain, Cordon and Search — with the gap for their one-letter label **cut from
 * the rendered glyph** rather than left as a fixed slice of the circle.
 *
 * The generator is asked for no gap at all (`labelGapDegrees: 0`), so its two
 * arcs run right up to the label axis and this takes back exactly what the letter
 * needs. A fixed angular gap cannot do that: 30° of a 100 px circle is a
 * comfortable hole around a 22 px letter, and 30° of a 400 px circle is a hole
 * four times too big around the *same* letter, because the label scale is capped.
 *
 * **The gap is tangential, so it comes off the glyph's height as much as its
 * width.** The label is drawn horizontally wherever it sits on the circle: due
 * east, the letter's *height* runs along the arc; due north, its width.
 * Projecting the glyph box onto the tangent covers both and everything between.
 *
 * This is risk 3 from `ai/maplibre-renderer.md` in its purest form — the gap is a
 * function of a text measurement, and MapLibre sizes text through zoom
 * expressions it evaluates itself, so a declarative port would have the hole and
 * the letter drift apart.
 *
 * Sub-lines `[0]` and `[1]` are the two arcs; everything after them — arrowheads,
 * teeth, radials — is drawn untouched.
 */
export function arcMissionTaskPaint(name: TacticalGraphicName, ratioLocked: boolean): (f: PaintFeature, c: PaintContext) => Paint[] {
    const label = getLabel(name);
    return (feature, context) => {
        const lines = flattenLines(feature);
        if (!lines.length) return [];

        const centre = feature.graphicCenter;
        const labelPoint = feature.graphicLabelPoint;
        const radius = centre && labelPoint ? Math.hypot(labelPoint[0] - centre[0], labelPoint[1] - centre[1]) : 0;

        if (centre && labelPoint && radius > 0 && label) {
            const axis = Math.atan2(labelPoint[1] - centre[1], labelPoint[0] - centre[0]);
            const scale = ratioLocked
                ? ratioLockedLabelScale(feature.graphicSize, feature.drawingResolution, context.resolution)
                : scaleOf(feature, context);
            const font = ratioLocked ? RATIO_LOCKED_LABEL_FONT : fontStyle;
            const fontPx = ratioLocked ? RATIO_LOCKED_LABEL_FONT_PX : BASE_FONT_SIZE_PX;

            const halfWidthPx = textWidth(context, label, font, scale) / 2;
            const halfHeightPx = (fontPx * scale * CAP_HEIGHT_FRACTION) / 2;
            const tangentHalfPx =
                halfWidthPx * Math.abs(Math.sin(axis)) + halfHeightPx * Math.abs(Math.cos(axis)) + ARC_LABEL_CLEARANCE_PX;
            const halfGap = Math.min(ARC_LABEL_MAX_HALF_GAP_RAD, (tangentHalfPx * context.resolution) / radius);

            for (const i of [0, 1]) {
                if (lines[i]) lines[i] = cutArcAtLabel(lines[i], centre, axis, halfGap);
            }
        }

        const drawn = lines.filter(line => line.length >= 2);
        if (!drawn.length) return [];

        return [{
            geometry: {type: 'MultiLineString', coordinates: drawn},
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
        }];
    };
}

/**
 * The label a point-anchored mission task carries, at its own anchor.
 *
 * Separate from {@link arcMissionTaskPaint} because the two are separate features
 * in every renderer: the graphic owns the line work, the label feature owns the
 * text, and they are stamped and invalidated independently.
 */
export function missionTaskLabelPaint(name: TacticalGraphicName): (f: PaintFeature, c: PaintContext) => Paint[] {
    const label = getLabel(name);
    return (feature, context) => {
        if (!label || feature.geometry.type !== 'Point') return [];
        return [{
            geometry: feature.geometry,
            text: {
                text: label,
                font: RATIO_LOCKED_LABEL_FONT,
                fill: getLabelFillColor(),
                halo: halo(),
                scale: ratioLockedLabelScale(feature.graphicSize, feature.drawingResolution, context.resolution),
                align: 'center',
                baseline: 'middle',
            },
        }];
    };
}

/** Every sub-line of a feature's geometry, in order, as a mutable array. */
function flattenLines(feature: PaintFeature): ProjectedPosition[][] {
    const geometry = feature.geometry;
    if (geometry.type === 'MultiLineString') return geometry.coordinates.map(line => [...line]);
    if (geometry.type === 'LineString') return [[...geometry.coordinates]];
    return [];
}
