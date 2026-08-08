/**
 * # The echeloned positions
 *
 * Battle position, strong point and the unexploded-ordnance area: closed shapes
 * that break their outline open and set a symbol in the gap.
 *
 * The first two carry an **echelon glyph** — the dots and bars that say squad
 * through brigade — which is drawn rather than lettered, so it is line work and
 * takes the affiliation's colour like the outline it sits in. (The boundary's
 * echelon is the documented exception that stays black; these are not it.)
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelFillColor, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicEchelon, TacticalGraphicStatus} from '../core/type';
import {decorationScale} from './decorations';
import {PLANNED_DASH_PX, lineColorOf, scaleOf} from './paintFunctions';

type AreaPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** Screen-pixel clearance either side of the echelon glyph in its gap. */
const ECHELON_GAP_PX = 10;
/** Where along the opening segment the gap runs, before clearance. */
const ECHELON_GAP_FROM = 0.4;
const ECHELON_GAP_TO = 0.6;

/** Echelon glyph dimensions, in screen pixels at scale 1. */
const ECHELON_DOT_RADIUS_PX = 5;
const ECHELON_SPACING_PX = 12;
const ECHELON_HALF_LENGTH_PX = 10;

/** Screen-pixel length of a strong point's cross tie, and the spacing between ties. */
const CROSS_TIE_PX = 10;

/** The gap cut for the unexploded-ordnance area's "UXO", in screen pixels. */
const UXO_GAP_WIDTH_PX = 40;

interface OpenedRing {
    /** Every edge of the ring, with the opening segment split around its gap. */
    outline: ProjectedPosition[][];
    /** Centre of the gap — where the echelon glyph goes. */
    midGap: ProjectedPosition;
    /** The opening segment's direction. */
    dx: number;
    dy: number;
}

/**
 * Breaks a polygon's outer ring open on the segment facing `rotation`, and cuts a
 * gap in it for the echelon glyph.
 *
 * The ring is wound counter-clockwise, so a segment's outward normal is
 * `[-dy, dx]`; the opening is whichever segment's normal best aligns with the
 * rotation. **That is why the callers default to π/2 and get the *southern*
 * edge** — the formula is the inward normal, so pointing north selects the
 * south-facing side.
 */
function openRing(ring: ProjectedPosition[], rotation: number, resolution: number): OpenedRing | null {
    if (ring.length < 2) return null;

    const unitRot = [Math.cos(rotation), Math.sin(rotation)];
    let openIndex = 0;
    let bestDot = -Infinity;
    for (let i = 0; i < ring.length - 1; i++) {
        const dx = ring[i + 1][0] - ring[i][0];
        const dy = ring[i + 1][1] - ring[i][1];
        const segLen = Math.hypot(dx, dy);
        if (segLen === 0) continue;
        const dot = (-dy / segLen) * unitRot[0] + (dx / segLen) * unitRot[1];
        if (dot > bestDot) {
            bestDot = dot;
            openIndex = i;
        }
    }

    const p1 = ring[openIndex];
    const p2 = ring[openIndex + 1];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const segLen = Math.hypot(dx, dy);
    if (segLen === 0) return null;

    const outline: ProjectedPosition[][] = [];
    for (let i = 0; i < ring.length - 1; i++) {
        if (i !== openIndex) outline.push([ring[i], ring[i + 1]]);
    }

    const gapRatio = (ECHELON_GAP_PX * resolution) / segLen;
    const gapA: ProjectedPosition = [
        p1[0] + dx * (ECHELON_GAP_FROM - gapRatio),
        p1[1] + dy * (ECHELON_GAP_FROM - gapRatio),
    ];
    const gapB: ProjectedPosition = [
        p1[0] + dx * (ECHELON_GAP_TO + gapRatio),
        p1[1] + dy * (ECHELON_GAP_TO + gapRatio),
    ];
    outline.push([p1, gapA], [gapB, p2]);

    return {outline, midGap: [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2], dx, dy};
}

/**
 * The echelon glyph: dots for squad through platoon, perpendicular bars for
 * company through regiment, and an X for brigade.
 *
 * Every size is screen pixels multiplied by the label scale, so the glyph grows
 * and shrinks with the amplifiers around it rather than with the map.
 *
 * An unrecognised echelon falls back to the single dot rather than drawing
 * nothing: a position with no readable echelon is still a position.
 */
export function echelonMarks(
    mid: ProjectedPosition,
    dx: number,
    dy: number,
    resolution: number,
    echelon: TacticalGraphicEchelon,
    color: string,
    scale = 1,
): Paint[] {
    const segLen = Math.hypot(dx, dy);
    if (!segLen) return [];

    const ux = dx / segLen;
    const uy = dy / segLen;
    const nx = -uy;
    const ny = ux;

    const spacing = ECHELON_SPACING_PX * scale * resolution;
    const halfLength = ECHELON_HALF_LENGTH_PX * scale * resolution;
    const stroke = {color, widthPx: LINE_WIDTH()};

    const dot = (offset: number): Paint => ({
        geometry: {type: 'Point', coordinates: [mid[0] + ux * spacing * offset, mid[1] + uy * spacing * offset]},
        circle: {radiusPx: ECHELON_DOT_RADIUS_PX * scale, fill: {color}},
    });
    const bar = (offset: number): Paint => {
        const cx = mid[0] + ux * spacing * offset;
        const cy = mid[1] + uy * spacing * offset;
        return {
            geometry: {
                type: 'LineString',
                coordinates: [
                    [cx - nx * halfLength, cy - ny * halfLength],
                    [cx + nx * halfLength, cy + ny * halfLength],
                ],
            },
            stroke,
        };
    };

    switch (echelon) {
        case TacticalGraphicEchelon.squad:
            return [dot(0)];
        case TacticalGraphicEchelon.section:
            return [dot(-1), dot(1)];
        case TacticalGraphicEchelon.platoonDetachment:
            return [dot(-1), dot(0), dot(1)];
        case TacticalGraphicEchelon.companyBatteryTroop:
            return [bar(0)];
        case TacticalGraphicEchelon.battalionSquadron:
            return [bar(-1), bar(1)];
        case TacticalGraphicEchelon.regimentGroup:
            return [bar(-1), bar(0), bar(1)];
        case TacticalGraphicEchelon.brigade: {
            // The tangent turned ±45°, so the X straddles the segment evenly however
            // the position was drawn.
            const cos = Math.cos(Math.PI / 4);
            const sin = Math.sin(Math.PI / 4);
            const arm = (vx: number, vy: number): Paint => ({
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [mid[0] - vx * halfLength, mid[1] - vy * halfLength],
                        [mid[0] + vx * halfLength, mid[1] + vy * halfLength],
                    ],
                },
                stroke,
            });
            return [arm(ux * cos - uy * sin, ux * sin + uy * cos), arm(ux * cos + uy * sin, -ux * sin + uy * cos)];
        }
        default:
            return [dot(0)];
    }
}

/**
 * The strong point's cross ties: short perpendicular strokes stepping along the
 * whole outline.
 *
 * **These are where the screen-fixed decorations started** — the obstacle teeth
 * and the fortified merlons were changed to match them — but they were the one
 * set never capped, so zoomed out they swamped the ring they hang off. They take
 * the same shape-relative rule as the rest now, measured across the whole outline
 * because what arrives here is already broken into segments rather than one
 * closed ring.
 */
function crossTies(outline: ProjectedPosition[][], resolution: number, color: string): Paint[] {
    const flat = outline.flat();
    const scale = decorationScale(flat, true, resolution, CROSS_TIE_PX);
    if (scale <= 0) return [];

    const spacing = CROSS_TIE_PX * scale * resolution;
    const length = CROSS_TIE_PX * scale * resolution;
    const paints: Paint[] = [];

    for (const ring of outline) {
        let travelled = 0;
        let lastTie = 0;
        for (let i = 0; i < ring.length - 1; i++) {
            const p1 = ring[i];
            const p2 = ring[i + 1];
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const segLen = Math.hypot(dx, dy);
            if (segLen === 0) continue;

            const segStart = travelled;
            const segEnd = travelled + segLen;
            while (lastTie + spacing <= segEnd) {
                lastTie += spacing;
                if (lastTie < segStart) continue;
                const t = (lastTie - segStart) / segLen;
                const x = p1[0] + t * dx;
                const y = p1[1] + t * dy;
                paints.push({
                    geometry: {
                        type: 'LineString',
                        coordinates: [[x, y], [x + (-dy / segLen) * length, y + (dx / segLen) * length]],
                    },
                    stroke: {color, widthPx: LINE_WIDTH()},
                });
            }
            travelled = segEnd;
        }
    }
    return paints;
}

/** The outer ring of a feature's polygon, or nothing. */
function outerRing(feature: PaintFeature): ProjectedPosition[] | null {
    return feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0] ?? null : null;
}

/**
 * Battle position: the outline broken open on the facing side with the echelon
 * glyph in the gap, dashed when planned.
 */
export function battlePositionPaint(): AreaPaint {
    return (feature, context) => {
        const ring = outerRing(feature);
        if (!ring) return [];
        // π/2 selects the south-facing edge — @see openRing.
        const opened = openRing(ring, feature.properties.rotation ?? Math.PI / 2, context.resolution);
        if (!opened) return [];

        const color = lineColorOf(feature);
        return [
            {
                geometry: {type: 'MultiLineString', coordinates: opened.outline},
                stroke: {
                    color,
                    widthPx: LINE_WIDTH(),
                    dashPx: feature.properties.status === TacticalGraphicStatus.planned ? PLANNED_DASH_PX : undefined,
                },
            },
            ...echelonMarks(
                opened.midGap,
                opened.dx,
                opened.dy,
                context.resolution,
                feature.echelon ?? feature.properties.echelon ?? TacticalGraphicEchelon.squad,
                color,
                scaleOf(feature, context),
            ),
        ];
    };
}

/** Strong point: the battle position's outline and echelon, plus the cross ties. */
export function strongPointPaint(): AreaPaint {
    return (feature, context) => {
        const ring = outerRing(feature);
        if (!ring) return [];
        const opened = openRing(ring, feature.properties.rotation ?? Math.PI / 2, context.resolution);
        if (!opened) return [];

        const color = lineColorOf(feature);
        return [
            {geometry: {type: 'MultiLineString', coordinates: opened.outline}, stroke: {color, widthPx: LINE_WIDTH()}},
            ...echelonMarks(
                opened.midGap,
                opened.dx,
                opened.dy,
                context.resolution,
                feature.echelon ?? feature.properties.echelon ?? TacticalGraphicEchelon.squad,
                color,
                scaleOf(feature, context),
            ),
            ...crossTies(opened.outline, context.resolution, color),
        ];
    };
}

/**
 * The unexploded-ordnance area: "UXO" set in a gap on each of the two segments
 * that bound the shape along the rotation axis.
 *
 * The pair is found by projecting every segment's midpoint onto that axis and
 * taking the extremes, so the two labels land on opposite sides however many
 * vertices the polygon has. A shape whose extremes collapse onto one segment
 * falls back to a plain closed outline rather than labelling it twice.
 *
 * A segment shorter than the gap keeps its full length: breaking it would leave
 * nothing of the edge at all.
 */
export function unexplodedOrdnanceAreaPaint(): AreaPaint {
    return (feature, context) => {
        const ring = outerRing(feature);
        if (!ring || ring.length < 3) return [];

        const color = lineColorOf(feature);
        const rotation = feature.properties.rotation ?? 0;
        const unitRot = [Math.cos(rotation), Math.sin(rotation)];
        const gapMap = UXO_GAP_WIDTH_PX * context.resolution;

        let maxProjection = -Infinity;
        let minProjection = Infinity;
        let maxIndex = -1;
        let minIndex = -1;
        for (let i = 0; i < ring.length - 1; i++) {
            const midX = (ring[i][0] + ring[i + 1][0]) / 2;
            const midY = (ring[i][1] + ring[i + 1][1]) / 2;
            const projection = midX * unitRot[0] + midY * unitRot[1];
            if (projection > maxProjection) {
                maxProjection = projection;
                maxIndex = i;
            }
            if (projection < minProjection) {
                minProjection = projection;
                minIndex = i;
            }
        }

        if (maxIndex === minIndex || maxIndex === -1 || minIndex === -1) {
            return [{geometry: {type: 'Polygon', coordinates: [ring]}, stroke: {color, widthPx: LINE_WIDTH()}}];
        }

        const paints: Paint[] = [];
        const outline: ProjectedPosition[][] = [];
        const scale = scaleOf(feature, context);

        for (let i = 0; i < ring.length - 1; i++) {
            const p1 = ring[i];
            const p2 = ring[i + 1];
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const segLen = Math.hypot(dx, dy);

            if (i !== maxIndex && i !== minIndex) {
                outline.push([p1, p2]);
                continue;
            }
            if (segLen < gapMap) {
                outline.push([p1, p2]);
                continue;
            }

            const halfGapRatio = gapMap / 2 / segLen;
            const at = (t: number): ProjectedPosition => [p1[0] + dx * t, p1[1] + dy * t];
            outline.push([p1, at(0.5 - halfGapRatio)], [at(0.5 + halfGapRatio), p2]);

            paints.push({
                geometry: {type: 'Point', coordinates: at(0.5)},
                text: {
                    text: 'UXO',
                    font: fontStyle,
                    fill: getLabelFillColor(),
                    halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                    scale,
                },
            });
        }

        paints.push({geometry: {type: 'MultiLineString', coordinates: outline}, stroke: {color, widthPx: LINE_WIDTH()}});
        return paints;
    };
}
