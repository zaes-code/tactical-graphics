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
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicHostility, TacticalGraphicMineType} from '../core/type';
import {PLANNED_DASH_PX, hostilityOf, lineColorOf, scaleOf, labelColorOf} from './paintFunctions';
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
 *
 * Exported because the mineline strings the same glyph along a line rather than setting
 * three of them inside an area — the icon is the same fact either way, and having it in
 * two places is how the two would drift apart.
 */
export function mineGlyph(
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
/** How far above the row the free text sits, in row half-heights, with no outline to use. */
const TEXT_OFFSET = 1.9;

/**
 * Clear space between the area's own edge and the block of text above or below it, in
 * screen pixels **at label scale 1**.
 *
 * **Off the outline, not off the mine row.** Both plates set field H clear above the
 * boundary and the DTG clear below it; hanging them off the row instead put them inside a
 * tall area and outside a short one, because the row is sized to fit the shape and the
 * shape is not. (User's call, 2026-08-27.)
 *
 * **Scaled by the label, not fixed on screen.** The amplifiers around these areas use the
 * zoom-anchored scale, so they *grow* as the operator zooms in — and a constant 30 px gap
 * that cleared the fenced area's top `M` at one zoom stopped clearing it at the next. The
 * clash is invisible on MapLibre and on OpenLayers it is worse than invisible: the
 * declutter drops one of the two labels, so field H simply disappears as you zoom in.
 * A gap in the same units as the thing it is clearing holds at every zoom.
 */
const AREA_TEXT_GAP_PX = 20;

/**
 * The hostile marker's height, as a share of its base.
 *
 * Measured off 270801's second Example: a base of 458 units carrying a 271-unit peak.
 */
const HOSTILE_PEAK_HEIGHT = 0.6;

/** Both areas' hostile marker, and the letters that go with it, are the same size rule. */
function isHostile(feature: PaintFeature): boolean {
    return hostilityOf(feature) === TacticalGraphicHostility.hostileFaker;
}

/**
 * A text amplifier centred on `at`, in the label colour.
 *
 * The affiliation rule is `labelColorOf`'s and not this file's: text follows the host's
 * `labelUsesHostilityColor` setting, and defaults to black beside red line work.
 */
function areaText(
    feature: PaintFeature,
    at: ProjectedPosition,
    text: string,
    scale: number,
    baseline: 'top' | 'middle' | 'bottom',
    align: 'left' | 'center' | 'right' = 'center',
): Paint {
    return {
        geometry: {type: 'Point', coordinates: at},
        text: {
            text,
            font: fontStyle,
            fill: labelColorOf(feature),
            halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
            align,
            baseline,
            scale,
        },
    };
}

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

        const textScale = scaleOf(feature, context);
        const gap = AREA_TEXT_GAP_PX * textScale * context.resolution;
        const bounds = feature.bounds;
        const midX = bounds ? (bounds.minX + bounds.maxX) / 2 : center[0];

        // **Field H above, field W below** — the two amplifiers both plates name, and the
        // only two. There is no designation: `T` appears on neither Template, and the box
        // in the middle is Sector 1, which is the mine type drawn rather than typed.
        // (User's call, 2026-08-27.)
        // **Just above the boundary**, which on a hostile mined area puts it inside the
        // peak near its base. It was lifted clear of the apex for a while, and that read
        // as a caption on the marker rather than on the minefield. (User's call,
        // 2026-08-27.)
        const above = (feature.properties.additionalInfo ?? '').trim();
        if (above) {
            const top = bounds ? bounds.maxY + gap : center[1] + ROW_HALF_HEIGHT * scale * TEXT_OFFSET;
            paints.push(areaText(feature, [midX, top], above, textScale, 'bottom'));
        }

        const below = (feature.properties.startDate ?? '').trim();
        if (below && bounds) {
            paints.push(areaText(feature, [midX, bounds.minY - gap], below, textScale, 'top'));
        }
        return paints;
    };
}

/** Screen-pixel size of the fence's crosses, and how far apart they sit. */
const FENCE_MARK_PX = 9;
const FENCE_PITCH_PX = 26;

/**
 * Where a fenced area's letters sit on its boundary, as compass bearings.
 *
 * **Fixed directions, not fixed fractions of the perimeter.** Spacing them evenly along
 * the walk put them wherever the drawing happened to start, so the same area redrawn with
 * its first click somewhere else wore its `M`s in different places — and on an irregular
 * boundary none of them landed anywhere a reader could name. The Template puts `M` at the
 * four cardinals and the two `N` boxes between north and each shoulder, so that is what
 * these are: a ray cast from the middle of the area, and the letter set where it crosses
 * the fence. (User's call, 2026-08-27.)
 */
const FENCE_LETTER_BEARINGS = [0, 90, 180, 270];
const FENCE_ENY_BEARINGS = [45, 315];

/**
 * Where a ray from `from` at `bearing` degrees (0 = north, clockwise) leaves the ring.
 *
 * The furthest crossing, so a boundary that folds back on itself gives the outer edge —
 * a letter inside a concave lobe would read as belonging to nothing.
 */
function ringCrossing(
    ring: ProjectedPosition[],
    from: ProjectedPosition,
    bearingDeg: number,
): ProjectedPosition | undefined {
    const t = (bearingDeg * Math.PI) / 180;
    const dx = Math.sin(t);
    const dy = Math.cos(t);
    let best: number | undefined;
    for (let i = 0; i + 1 < ring.length; i++) {
        const [ax, ay] = ring[i];
        const [bx, by] = ring[i + 1];
        const ex = bx - ax;
        const ey = by - ay;
        const denom = dx * ey - dy * ex;
        if (Math.abs(denom) < 1e-9) continue;
        // Solve `from + s·d = a + u·e` for s along the ray and u along the segment.
        const s = ((ax - from[0]) * ey - (ay - from[1]) * ex) / denom;
        const u = ((ax - from[0]) * dy - (ay - from[1]) * dx) / denom;
        if (s <= 0 || u < 0 || u > 1) continue;
        if (best === undefined || s > best) best = s;
    }
    return best === undefined ? undefined : [from[0] + dx * best, from[1] + dy * best];
}

/** Clear space between a boundary and an `ENY` set outside it, in screen pixels. */
const ENY_GAP_PX = 8;

/**
 * The midpoints of a ring's westmost and eastmost segments.
 *
 * The Template puts an `N` box against each flank, and *"flank"* on an irregular boundary
 * is the segment that reaches furthest that way — not the bounding box's corner, which for
 * a shape with a point on it can sit well off the line. Compared by midpoint rather than by
 * vertex so a long sloping side wins over a short vertical one that merely touches the
 * extreme.
 */
function flankMidpoints(ring: ProjectedPosition[]): {west: ProjectedPosition; east: ProjectedPosition} | undefined {
    let west: ProjectedPosition | undefined;
    let east: ProjectedPosition | undefined;
    for (let i = 0; i + 1 < ring.length; i++) {
        const mid: ProjectedPosition = [(ring[i][0] + ring[i + 1][0]) / 2, (ring[i][1] + ring[i + 1][1]) / 2];
        if (!west || mid[0] < west[0]) west = mid;
        if (!east || mid[0] > east[0]) east = mid;
    }
    return west && east ? {west, east} : undefined;
}

/**
 * APP-06 270707 minefield, dynamic depiction — a plain area outline, with an `ENY` against
 * each flank when the minefield is the enemy's.
 *
 * Everything else that makes it a minefield is the mine row inside it. @see mineFillPaint
 *
 * The `N` boxes of the Template are the two the Example fills with `ENY`, one at the west
 * and one at the east, set *outside* the boundary so neither lands on the line work.
 */
export function minefieldAreaPaint(): MinePaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'Polygon') return [];
        const paints: Paint[] = [{geometry, stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()}}];

        const ring = geometry.coordinates[0];
        if (!isHostile(feature) || !ring || ring.length < 4) return paints;
        const flanks = flankMidpoints(ring);
        if (!flanks) return paints;

        const scale = scaleOf(feature, context);
        const gap = ENY_GAP_PX * context.resolution;
        paints.push(areaText(feature, [flanks.west[0] - gap, flanks.west[1]], 'ENY', scale, 'middle', 'right'));
        paints.push(areaText(feature, [flanks.east[0] + gap, flanks.east[1]], 'ENY', scale, 'middle', 'left'));
        return paints;
    };
}

/**
 * The dashed peak a hostile mined area wears.
 *
 * **Its base is the graphic's own width.** The Example draws it that way, and it is the
 * only rule that survives an irregular boundary: the peak is a marker standing on the
 * area, not a shape with a size of its own. The base line itself is never drawn — the two
 * sloping sides meet above the area and that is the whole mark.
 *
 * The `ENY` letters belong to the *fence*, not to this: they sit on the boundary where the
 * Template's `N` boxes do. @see FENCE_ENY_BEARINGS
 */
function hostilePeak(
    _feature: PaintFeature,
    ring: ProjectedPosition[],
    _context: PaintContext,
    stroke: {color: string; widthPx: number},
): Paint[] {
    const xs = ring.map(p => p[0]);
    const ys = ring.map(p => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const top = Math.max(...ys);
    const halfWidth = (maxX - minX) / 2;
    if (!(halfWidth > 0)) return [];

    const apex: ProjectedPosition = [(minX + maxX) / 2, top + halfWidth * 2 * HOSTILE_PEAK_HEIGHT];
    const left: ProjectedPosition = [minX, top];
    const right: ProjectedPosition = [maxX, top];

    return [{
        geometry: {type: 'MultiLineString', coordinates: [[left, apex], [apex, right]]},
        stroke: {...stroke, dashPx: PLANNED_DASH_PX},
    }];
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
        if (isHostile(feature)) paints.push(...hostilePeak(feature, ring, context, stroke));

        // Walk the ring at a constant screen pitch, dropping a cross at each step, and set
        // the letters at their own bearings rather than at whichever steps happen to fall
        // near them. @see FENCE_LETTER_BEARINGS
        const lengths: number[] = [0];
        for (let i = 1; i < ring.length; i++) {
            lengths.push(lengths[i - 1] + Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]));
        }
        const total = lengths[lengths.length - 1];
        const pitch = FENCE_PITCH_PX * context.resolution;
        const size = FENCE_MARK_PX * context.resolution;
        if (!(total > pitch * 4)) return paints;

        const xs = ring.map(p => p[0]);
        const ys = ring.map(p => p[1]);
        const middle: ProjectedPosition = [
            (Math.min(...xs) + Math.max(...xs)) / 2,
            (Math.min(...ys) + Math.max(...ys)) / 2,
        ];
        const scale = scaleOf(feature, context);
        const letters: ProjectedPosition[] = [];
        for (const bearing of FENCE_LETTER_BEARINGS) {
            const at = ringCrossing(ring, middle, bearing);
            if (!at) continue;
            letters.push(at);
            paints.push(areaText(feature, at, 'M', scale, 'middle'));
        }
        // The two `N` boxes, between north and each shoulder — on the fence, like the
        // `M`s, rather than floating above it. (User's call, 2026-08-27.)
        if (isHostile(feature)) {
            for (const bearing of FENCE_ENY_BEARINGS) {
                const at = ringCrossing(ring, middle, bearing);
                if (!at) continue;
                letters.push(at);
                paints.push(areaText(feature, at, 'ENY', scale, 'middle'));
            }
        }

        /** A cross this close to a letter would be drawn under it. */
        const clearOfLetters = (at: ProjectedPosition): boolean =>
            letters.every(l => Math.hypot(l[0] - at[0], l[1] - at[1]) > pitch * 0.9);

        const steps = Math.floor(total / pitch);
        // A cross arm's reach along each of its own two diagonals. `size` is the arm's
        // length, so the diagonal offsets are that over root two.
        const arm = size / Math.SQRT2;
        const crosses: ProjectedPosition[][] = [];

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
            // The segment's own frame: `u` along it, `v` to its left.
            const ux = span > 0 ? (ring[seg][0] - ring[seg - 1][0]) / span : 1;
            const uy = span > 0 ? (ring[seg][1] - ring[seg - 1][1]) / span : 0;

            if (!clearOfLetters(at)) continue;
            // **Turned with the wire, not with the map.** The crosses were built on the
            // screen axes, so a fence running north-south wore upright `x`s while the one
            // running east-west wore the same `x`s — the mark stopped belonging to the
            // line it sits on, and on a sloping side it read as a stray glyph rather than
            // as barbed wire. Each arm is now 45 degrees off the segment.
            // (User's call, 2026-08-27.)
            const diag = (sign: number): ProjectedPosition[] => {
                const dx = (ux - sign * uy) * arm;
                const dy = (uy + sign * ux) * arm;
                return [[at[0] - dx, at[1] - dy], [at[0] + dx, at[1] + dy]];
            };
            crosses.push(diag(1));
            crosses.push(diag(-1));
        }

        if (crosses.length) paints.push({geometry: {type: 'MultiLineString', coordinates: crosses}, stroke});
        return paints;
    };
}
