/**
 * # The mine-type icons, and the two areas that carry them
 *
 * APP-06 270707 minefield (dynamic depiction) and 270801 mined area (fenced). Both say the
 * same thing about their interior: *"the area boundary will be filled with the type of
 * mine(s) contained in the minefield (see mine types listed in Table 8-24)."*
 *
 * ## Table 8-24's mine types are seven glyphs and a composition rule
 *
 * The table enumerates about forty mine-type codes, which looks like forty icons and is
 * not. Every one of them is **three glyphs in a row**, drawn from seven primitives:
 *
 * | Code | Type | Glyph |
 * |---|---|---|
 * | 13 | unspecified | hollow disc |
 * | 14 | antipersonnel | filled disc with two antennae |
 * | 15 | antipersonnel, directional effects | the above, plus an arrow to one side |
 * | 16 | antitank | filled disc |
 * | 17 | antitank with antihandling device | filled disc with a hooked stem below |
 * | 18 | wide area antitank | filled disc over a V |
 * | 19 | mine cluster | the mine cluster's own dashed dome |
 *
 * The remaining thirty-odd codes are named "A and B" or "A, B, and C" and drawn by putting
 * those two or three primitives across the three slots. So the primitives are what a
 * renderer needs; the combinations are a *field value* problem, not a drawing one.
 *
 * **This library models one type, not a combination.** `mineType` selects a single
 * primitive and all three slots draw it, which is codes 13–19 exactly. Expressing the
 * combinations needs the amplifier to be an ordered list of up to three, which is a schema
 * change for one field on two graphics — recorded here rather than guessed at. The slot
 * order the plates use, when that day comes: **first-named on the outside, last-named in
 * the middle** (codes 20, 22, 23, 24), though code 21 draws it the other way round, so the
 * plates are composed by eye rather than by rule.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelFillColor, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicMineType} from '../core/type';
import {PLANNED_DASH_PX, lineColorOf, scaleOf} from './paintFunctions';
import {fitSymbolScale} from './symbolFit';

type MinePaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** The disc's radius at scale 1, in projected meters, and the row's pitch. */
const DISC_RADIUS = 26_000;
const SLOT_PITCH = DISC_RADIUS * 2.9;
const SLOTS = 3;

/** Half the width and height the whole row occupies, for fitting it inside an area. */
const ROW_HALF_WIDTH = SLOT_PITCH + DISC_RADIUS * 1.6;
const ROW_HALF_HEIGHT = DISC_RADIUS * 2.6;

/** A disc's outline, as a closed ring about a center. */
function disc(at: ProjectedPosition, radius: number): ProjectedPosition[] {
    const ring: ProjectedPosition[] = [];
    for (let a = 0; a <= 360; a += 15) {
        const t = (a * Math.PI) / 180;
        ring.push([at[0] + Math.cos(t) * radius, at[1] + Math.sin(t) * radius]);
    }
    return ring;
}

/**
 * One mine glyph, centered on `at`. Returns the paints for it.
 *
 * Everything is expressed against the disc's radius, so the seven stay in proportion with
 * each other however large the row is drawn.
 */
function mineGlyph(
    at: ProjectedPosition,
    radius: number,
    type: TacticalGraphicMineType,
    color: string,
): Paint[] {
    const p = (dx: number, dy: number): ProjectedPosition => [at[0] + dx * radius, at[1] + dy * radius];
    const stroke = {color, widthPx: LINE_WIDTH()};
    const paints: Paint[] = [];

    if (type === TacticalGraphicMineType.mineCluster) {
        // The mine cluster's own symbol, small: a dashed dome standing on a dashed chord.
        const dome: ProjectedPosition[] = [];
        for (let a = 0; a <= 180; a += 15) {
            const t = (a * Math.PI) / 180;
            dome.push(p(Math.cos(t) * 1.2, Math.sin(t) * 1.2));
        }
        return [{
            geometry: {type: 'MultiLineString', coordinates: [dome, [p(-1.2, 0), p(1.2, 0)]]},
            stroke: {...stroke, dashPx: PLANNED_DASH_PX},
        }];
    }

    if (type === TacticalGraphicMineType.unspecified) {
        paints.push({geometry: {type: 'LineString', coordinates: disc(at, radius)}, stroke});
    } else {
        paints.push({geometry: {type: 'Polygon', coordinates: [disc(at, radius)]}, fill: {color}});
    }

    const antennae = type === TacticalGraphicMineType.antipersonnel
        || type === TacticalGraphicMineType.antipersonnelDirectional;
    if (antennae) {
        paints.push({
            geometry: {type: 'MultiLineString', coordinates: [
                [p(-0.5, 0.85), p(-1.5, 2.2)],
                [p(0.5, 0.85), p(1.5, 2.2)],
            ]},
            stroke,
        });
    }

    if (type === TacticalGraphicMineType.antipersonnelDirectional) {
        // The arrow that says which way the charge faces, on the disc's own axis.
        paints.push({
            geometry: {type: 'MultiLineString', coordinates: [
                [p(1.0, 0), p(2.2, 0)],
                [p(1.7, 0.4), p(2.2, 0), p(1.7, -0.4)],
            ]},
            stroke,
        });
    }

    if (type === TacticalGraphicMineType.antitankAntihandling) {
        // The hooked stem below: straight down, then a short flick to one side.
        paints.push({
            geometry: {type: 'LineString', coordinates: [p(0, -0.9), p(0, -2.2), p(0.55, -1.8)]},
            stroke,
        });
    }

    if (type === TacticalGraphicMineType.wideAreaAntitank) {
        paints.push({
            geometry: {type: 'LineString', coordinates: [p(-1.2, -0.6), p(-0.55, -2.0), p(0, -0.9), p(0.55, -2.0), p(1.2, -0.6)]},
            stroke,
        });
    }

    return paints;
}

/** The row of three, centered on `at`. */
export function mineRowMarks(
    at: ProjectedPosition,
    scale: number,
    type: TacticalGraphicMineType,
    color: string,
): Paint[] {
    const radius = DISC_RADIUS * scale;
    const pitch = SLOT_PITCH * scale;
    const paints: Paint[] = [];
    for (let i = 0; i < SLOTS; i++) {
        const x = at[0] + (i - (SLOTS - 1) / 2) * pitch;
        paints.push(...mineGlyph([x, at[1]], radius, type, color));
    }
    return paints;
}

/** Share of the fit the row is drawn at, so it does not touch the outline. @see cbrnPaints */
const INSET = 0.55;
/** How far above the row the free text sits, in row half-heights. */
const TEXT_OFFSET = 1.9;

/** The mine type a feature carries, defaulting to the unspecified disc. */
function mineTypeOf(feature: PaintFeature): TacticalGraphicMineType {
    return feature.properties.mineType ?? TacticalGraphicMineType.unspecified;
}

/**
 * The row of mines and the free text, over whatever the area's ordinary label paint drew.
 *
 * Rides the **label** feature — the bare interior point the holder stamps — while the
 * outline belongs to the polygon, the arrangement the CBRN triangle and the airfield's
 * runways already use. @see cbrnPaints, airfieldPaints
 */
export function mineFillPaint(): MinePaint {
    return (feature, context) => {
        const center = feature.geometry.type === 'Point' ? feature.geometry.coordinates : undefined;
        if (!center) return [];

        const color = lineColorOf(feature);
        const scale = fitSymbolScale(feature, center, ROW_HALF_WIDTH, ROW_HALF_HEIGHT, []) * INSET;
        const paints = mineRowMarks(center, scale, mineTypeOf(feature), color);

        const text = (feature.properties.label ?? '').trim();
        if (!text) return paints;

        paints.push({
            geometry: {
                type: 'Point',
                coordinates: [center[0], center[1] + ROW_HALF_HEIGHT * scale * TEXT_OFFSET],
            },
            text: {
                text,
                font: fontStyle,
                fill: getLabelFillColor(),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                align: 'center',
                baseline: 'middle',
                scale: scaleOf(feature, context),
            },
        });
        return paints;
    };
}

/** Screen-pixel size of the fence's crosses, and how far apart they sit. */
const FENCE_MARK_PX = 9;
const FENCE_PITCH_PX = 26;
/** How many `M` markers ring a fenced area. */
const FENCE_LETTERS = 4;

/**
 * APP-06 270707 minefield, dynamic depiction — a plain area outline. Everything that makes
 * it a minefield is the mine row inside it. @see mineFillPaint
 */
export function minefieldAreaPaint(): MinePaint {
    return feature => {
        const geometry = feature.geometry;
        if (geometry.type !== 'Polygon') return [];
        return [{geometry, stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()}}];
    };
}

/**
 * APP-06 270801 mined area, fenced — the outline drawn as a **wire fence**, with `M`
 * markers set around it.
 *
 * The crosses are the wire obstacles' own mark walked around a closed ring rather than
 * along an open line, so the pitch is the same screen constant they use; the `M`s replace
 * a cross at four evenly spaced points, which is what makes the fence read as marked
 * rather than merely wired.
 */
export function minedAreaFencedPaint(): MinePaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'Polygon') return [];
        const ring = geometry.coordinates[0];
        if (!ring || ring.length < 4) return [];

        const color = lineColorOf(feature);
        const stroke = {color, widthPx: LINE_WIDTH()};
        const paints: Paint[] = [{geometry, stroke}];

        // Walk the ring at a constant screen pitch, dropping a cross at each step and an
        // `M` at four of them.
        const lengths: number[] = [0];
        for (let i = 1; i < ring.length; i++) {
            lengths.push(lengths[i - 1] + Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]));
        }
        const total = lengths[lengths.length - 1];
        const pitch = FENCE_PITCH_PX * context.resolution;
        const size = FENCE_MARK_PX * context.resolution;
        if (!(total > pitch * 4)) return paints;

        const steps = Math.floor(total / pitch);
        // The four steps that carry an `M`, named outright rather than by modulo: a
        // `s % every === 0` test fires at both ends of a closed ring and draws five.
        const letterSteps = new Set(
            Array.from({length: FENCE_LETTERS}, (_letter, i) => Math.round((i * steps) / FENCE_LETTERS)),
        );
        const crosses: ProjectedPosition[][] = [];
        const scale = scaleOf(feature, context);

        for (let s = 0; s < steps; s++) {
            const d = (s + 0.5) * pitch;
            let seg = 1;
            while (seg < lengths.length - 1 && lengths[seg] < d) seg++;
            const span = lengths[seg] - lengths[seg - 1];
            const t = span > 0 ? (d - lengths[seg - 1]) / span : 0;
            const at: ProjectedPosition = [
                ring[seg - 1][0] + (ring[seg][0] - ring[seg - 1][0]) * t,
                ring[seg - 1][1] + (ring[seg][1] - ring[seg - 1][1]) * t,
            ];

            if (letterSteps.has(s)) {
                paints.push({
                    geometry: {type: 'Point', coordinates: at},
                    text: {
                        text: 'M',
                        font: fontStyle,
                        fill: color,
                        halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                        align: 'center',
                        baseline: 'middle',
                        scale,
                    },
                });
                continue;
            }
            crosses.push([[at[0] - size, at[1] - size], [at[0] + size, at[1] + size]]);
            crosses.push([[at[0] - size, at[1] + size], [at[0] + size, at[1] - size]]);
        }

        if (crosses.length) paints.push({geometry: {type: 'MultiLineString', coordinates: crosses}, stroke});
        return paints;
    };
}
