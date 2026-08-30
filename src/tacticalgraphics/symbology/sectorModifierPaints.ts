/**
 * # The sector modifiers, and the three areas that carry them
 *
 * APP-06 Table 8-24 (Sector 1) and Table 8-25 (Sector 2). Between them they say what a
 * piece of ground restricts and why, and three graphics read them:
 *
 * | | Sector 1 | Sector 2 | Field H |
 * |---|---|---|---|
 * | Limited access area (151100) | yes | - | yes |
 * | Restricted terrain (152400) | yes | yes | yes |
 * | Severely restricted terrain (152500) | yes | yes | yes |
 *
 * **The Remarks column is a constraint, not a note.** Every `MOBILITY` row of Table 8-24
 * is remarked *"For use with Limited Access Area, Restricted Terrain, and Severely
 * Restricted Terrain only"*, and every `MINE TYPE` row *"Used with minefields & mined
 * areas only"*. The two categories therefore never appear on the same symbol, which is
 * why {@link TacticalGraphicMobility} and `TacticalGraphicMineType` are separate enums
 * and why the field registry offers each on its own three (or two) graphics.
 * @see minePaints.ts for the other half.
 *
 * ## Sector 1 is fourteen glyphs; Sector 2 is a word
 *
 * Table 8-24's MODIFIER column draws a picture: wheels on a bar, a capsule for tracks, a
 * ski, a sled, a zigzag for a pack animal. Table 8-25's prints a *word* -- `URBAN`,
 * `WATER`, `GROUND`, `VEGETATION`, `OBSTACLES` -- plus an optional hatching color. So the
 * two halves of this file look nothing alike: {@link MOBILITY_GLYPHS} is a shape table and
 * Sector 2 is {@link TERRAIN_HATCH_COLORS} and an upper-cased enum value.
 *
 * Two of the fourteen are not line work at all. Code 12, `NO VEHICLES`, is the literal
 * `ALL`; code 00, `UNSPECIFIED`, draws nothing and is the default, so a user who never
 * opens the dialog gets the bare hatched area the library drew before this existed.
 *
 * ## The frame the shapes are written in
 *
 * Every glyph is described in **half-widths**: `x` runs -1 to 1 and `y` is in the same
 * unit, centered on zero, so a shape's numbers can be read straight off a plate measured
 * with a ruler. {@link GLYPH_HALF_WIDTH} turns that into projected meters and the fit
 * turns it into something that sits inside the area the user drew.
 *
 * The stroke weight is in the same unit rather than in screen pixels, for the reason the
 * CBRN mark's arms are: this is a symbol that was just fitted to its area, so a constant
 * screen weight reads as spindly on a large one and as a blot on a small one.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {BASE_FONT_SIZE_PX} from '../core/config';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicMobility, TacticalGraphicTerrain} from '../core/type';
import {amplifierText, labelColorOf, lineColorOf, scaleOf} from './paintFunctions';
import {fitSymbolScale} from './symbolFit';
import { fitLabelScale} from './labelFit';

type AreaPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** A newline, without putting a literal one inside a string in this file. */
const BREAK = String.fromCharCode(10);

// -- Sector 2 -----------------------------------------------------------------

/**
 * The optional hatching color of each Sector 2 modifier, from Table 8-25's Remarks.
 *
 * **The standard names a color, not a value** -- "BLACK", "BLUE", "BROWN", "GREEN" -- so
 * these are the plainest reading of each name rather than a measurement. Measuring was
 * tried: the plate's own hatch samples at about `#AB926B` for brown and `#427A4C` for
 * green, which are those colors already thinned by a hairline stroke on white. The area
 * paints apply their own opacity, so a solid color belongs here and the thinning happens
 * where the hatch is built.
 *
 * `undefined` means the area keeps whatever color it would have had -- which is what the
 * word *optional* in the Remarks column is doing, and what code 00 gets.
 */
export const TERRAIN_HATCH_COLORS: Readonly<Record<TacticalGraphicTerrain, string | undefined>> = {
    [TacticalGraphicTerrain.unspecified]: undefined,
    [TacticalGraphicTerrain.urban]: '#000000',
    [TacticalGraphicTerrain.water]: '#0000FF',
    [TacticalGraphicTerrain.ground]: '#8B5A2B',
    [TacticalGraphicTerrain.vegetation]: '#2E7D32',
    [TacticalGraphicTerrain.obstacles]: '#2E7D32',
};

/** The hatch color a feature's Sector 2 modifier asks for, or `undefined` for none. */
export function terrainHatchColor(feature: PaintFeature): string | undefined {
    const terrain = feature.properties.terrain;
    return terrain ? TERRAIN_HATCH_COLORS[terrain] : undefined;
}

/** The word Table 8-25 prints, or empty for the unspecified modifier. */
export function terrainWord(terrain: TacticalGraphicTerrain | undefined): string {
    if (!terrain || terrain === TacticalGraphicTerrain.unspecified) return '';
    return terrain.toUpperCase();
}

// -- Sector 1: the shape table ------------------------------------------------

/**
 * One Sector 1 mobility glyph, in half-widths.
 *
 * `strokes` are open runs, `rings` are closed outlines, and `text` is the one modifier
 * the table sets in type rather than in line work. `halfHeight` is what the fit measures
 * against -- it is the shape's own extent, not a shared constant, because these range
 * from a nearly flat bar of wheels to a hexagon taller than it is wide.
 */
export interface MobilityGlyph {
    halfHeight: number;
    strokes?: ProjectedPosition[][];
    rings?: ProjectedPosition[][];
    text?: string;
}

/** A closed circle, in half-widths. */
function circle(cx: number, cy: number, r: number, steps = 28): ProjectedPosition[] {
    const ring: ProjectedPosition[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        ring.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
    }
    return ring;
}

/** A capsule: a rectangle from `x0` to `x1` with semicircular ends of radius `halfHeight`. */
function capsule(x0: number, x1: number, halfHeight: number, steps = 14): ProjectedPosition[] {
    const ring: ProjectedPosition[] = [];
    const right = x1 - halfHeight;
    const left = x0 + halfHeight;
    for (let i = 0; i <= steps; i++) {
        const t = -Math.PI / 2 + (i / steps) * Math.PI;
        ring.push([right + Math.cos(t) * halfHeight, Math.sin(t) * halfHeight]);
    }
    for (let i = 0; i <= steps; i++) {
        const t = Math.PI / 2 + (i / steps) * Math.PI;
        ring.push([left + Math.cos(t) * halfHeight, Math.sin(t) * halfHeight]);
    }
    ring.push(ring[0]);
    return ring;
}

/** An arc, degrees measured the usual way and swept from `from` to `to`. */
function arc(cx: number, cy: number, r: number, from: number, to: number, steps = 16): ProjectedPosition[] {
    const points: ProjectedPosition[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
        points.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
    }
    return points;
}

/** A regular hexagon with a vertex at the top -- the plate's orientation for code 51. */
function hexagon(r: number): ProjectedPosition[] {
    const ring: ProjectedPosition[] = [];
    for (let i = 0; i <= 6; i++) {
        const t = (90 + i * 60) * (Math.PI / 180);
        ring.push([Math.cos(t) * r, Math.sin(t) * r]);
    }
    return ring;
}

/** The wheel radius the two road-mobility glyphs share. Three wheels touch; two do not. */
const WHEEL_R = 0.3;
const HIGH_WHEEL_R = 0.31;

/** The sled's runner: a flat bottom with a half-turn up at each end. */
const SLED_R = 0.147;

/** How deep the barge's hull hangs below its deck, and how tall the amphibious wave is. */
const BARGE_DEPTH = 0.167;
const WAVE_AMPLITUDE = 0.186;
/** Four full periods across the glyph, which is what the plate draws. */
const WAVE_PERIODS = 4;
const WAVE_STEPS = 96;

function wave(): ProjectedPosition[] {
    const points: ProjectedPosition[] = [];
    for (let i = 0; i <= WAVE_STEPS; i++) {
        const x = -1 + (2 * i) / WAVE_STEPS;
        points.push([x, WAVE_AMPLITUDE * Math.sin(Math.PI * WAVE_PERIODS * (x + 1))]);
    }
    return points;
}

/** The barge's hull: a straight deck with a shallow arc slung under it. */
function hull(): ProjectedPosition[] {
    const points: ProjectedPosition[] = [];
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
        const x = -1 + (2 * i) / steps;
        points.push([x, BARGE_DEPTH - 2 * BARGE_DEPTH * (1 - x * x)]);
    }
    return points;
}

/**
 * Every glyph of Table 8-24's `MOBILITY` category, transcribed from the plate.
 *
 * Exported because the shapes are **symbology**: a renderer paints them, it does not get
 * to decide what they are. @see ai/conventions.md, "A symbology fact never lives in a
 * holder".
 */
export const MOBILITY_GLYPHS: Readonly<Record<TacticalGraphicMobility, MobilityGlyph>> = {
    // 00 - the default. Nothing is drawn, and the area is the bare hatched outline.
    [TacticalGraphicMobility.unspecified]: {halfHeight: 0},

    // 01 - two wheels hanging from a bar. The bar runs past them at both ends.
    [TacticalGraphicMobility.standardMobility]: {
        halfHeight: WHEEL_R,
        strokes: [[[-1, WHEEL_R], [1, WHEEL_R]]],
        rings: [circle(-0.7, 0, WHEEL_R), circle(0.7, 0, WHEEL_R)],
    },

    // 02 - three wheels, close enough to touch. The difference from 01 is the count.
    [TacticalGraphicMobility.highMobility]: {
        halfHeight: HIGH_WHEEL_R,
        strokes: [[[-1, HIGH_WHEEL_R], [1, HIGH_WHEEL_R]]],
        rings: [circle(-0.62, 0, HIGH_WHEEL_R), circle(0, 0, HIGH_WHEEL_R), circle(0.62, 0, HIGH_WHEEL_R)],
    },

    // 03 - a track, drawn as a capsule.
    [TacticalGraphicMobility.tracked]: {halfHeight: 0.36, rings: [capsule(-1, 1, 0.36)]},

    // 04 - one wheel beside one track, in that order: the plate puts the wheel left.
    [TacticalGraphicMobility.trackedAndWheeled]: {
        halfHeight: WHEEL_R,
        rings: [circle(-0.7, 0, WHEEL_R), capsule(-0.28, 1, WHEEL_R)],
    },

    // 05 - a drawbar between two wheels, joining their centers rather than their tops.
    [TacticalGraphicMobility.towed]: {
        halfHeight: 0.24,
        strokes: [[[-0.76, 0], [0.76, 0]]],
        rings: [circle(-0.76, 0, 0.24), circle(0.76, 0, 0.24)],
    },

    // 06 - two bogies of two wheels each, under the same bar as 01 and 02.
    [TacticalGraphicMobility.railway]: {
        halfHeight: 0.2,
        strokes: [[[-1, 0.2], [1, 0.2]]],
        rings: [circle(-0.8, 0, 0.2), circle(-0.41, 0, 0.2), circle(0.41, 0, 0.2), circle(0.8, 0, 0.2)],
    },

    // 07 - a ski seen from the side: the tip turned up at the leading end.
    [TacticalGraphicMobility.overSnow]: {
        halfHeight: 0.145,
        strokes: [[[-1, 0.145], [-0.7, -0.145], [1, -0.145]]],
    },

    // 08 - a sled runner: flat under foot, curling up and back in at both ends.
    [TacticalGraphicMobility.sled]: {
        halfHeight: SLED_R,
        strokes: [[
            ...arc(-1 + SLED_R, 0, SLED_R, 90, 270),
            ...arc(1 - SLED_R, 0, SLED_R, -90, 90),
        ]],
    },

    // 09 - the pack animal's zigzag. The middle valley stops short of the two ends.
    [TacticalGraphicMobility.packAnimal]: {
        halfHeight: 0.4,
        strokes: [[[-1, -0.4], [-0.48, 0.4], [0, -0.22], [0.48, 0.4], [1, -0.4]]],
    },

    // 10 - a barge: a straight deck over a shallow hull.
    [TacticalGraphicMobility.barge]: {
        halfHeight: BARGE_DEPTH,
        strokes: [[[-1, BARGE_DEPTH], [1, BARGE_DEPTH]], hull()],
    },

    // 11 - water, as four waves.
    [TacticalGraphicMobility.amphibious]: {halfHeight: WAVE_AMPLITUDE, strokes: [wave()]},

    // 12 - the one modifier set in type rather than drawn.
    [TacticalGraphicMobility.noVehicles]: {halfHeight: 0.36, text: 'ALL'},

    // 51 - dismounted, past the mine block at the table's end. A hexagon, vertex up.
    [TacticalGraphicMobility.dismounted]: {halfHeight: 0.42, rings: [hexagon(0.42)]},
};

// -- Drawing one --------------------------------------------------------------

/** The glyph's half-width at scale 1, in projected meters, before it is fitted. */
export const GLYPH_HALF_WIDTH = 120_000;

/** The glyph's stroke weight, in half-widths. @see the note in the file header. */
const GLYPH_STROKE_UNITS = 0.055;

/** The glyph a feature's Sector 1 modifier asks for. Unspecified by default. */
function mobilityOf(feature: PaintFeature): TacticalGraphicMobility {
    return feature.properties.mobility ?? TacticalGraphicMobility.unspecified;
}

/**
 * One mobility glyph, centered on `at` and scaled by `scale`.
 *
 * `scale` is in the same unit {@link fitSymbolScale} answers in: 1 draws the glyph at
 * {@link GLYPH_HALF_WIDTH} meters either side of `at`.
 */
export function mobilityMarks(
    at: ProjectedPosition,
    scale: number,
    mobility: TacticalGraphicMobility,
    color: string,
    resolution: number,
): Paint[] {
    const glyph = MOBILITY_GLYPHS[mobility];
    if (!glyph) return [];

    const unit = GLYPH_HALF_WIDTH * scale;
    const place = ([x, y]: ProjectedPosition): ProjectedPosition => [at[0] + x * unit, at[1] + y * unit];
    const widthPx = Math.max(LINE_WIDTH(), (GLYPH_STROKE_UNITS * unit) / resolution);
    const stroke = {color, widthPx, cap: 'round' as const, join: 'round' as const};
    const paints: Paint[] = [];

    for (const run of glyph.strokes ?? []) {
        paints.push({geometry: {type: 'LineString', coordinates: run.map(place)}, stroke});
    }
    for (const ring of glyph.rings ?? []) {
        paints.push({geometry: {type: 'LineString', coordinates: ring.map(place)}, stroke});
    }
    if (glyph.text) {
        paints.push({
            geometry: {type: 'Point', coordinates: at},
            text: {
                text: glyph.text,
                font: fontStyle,
                fill: color,
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                align: 'center',
                baseline: 'middle',
                // Sized off the glyph rather than off the label, so `ALL` is the same
                // height as the wheels it replaces.
                scale: (glyph.halfHeight * 2 * unit) / (resolution * BASE_FONT_SIZE_PX),
            },
        });
    }
    return paints;
}

// -- The stack the three areas draw -------------------------------------------

/**
 * The glyph's half-width, in screen pixels at label scale 1.
 *
 * **A constant, and it has to be one: the icon is the same size on every graphic that
 * carries it.** The first version took a share of the block's *widest line*, which reads
 * plausibly and is wrong -- a restricted terrain saying `DENSE WOODLAND` drew a visibly
 * larger icon than one saying `SOFT`, and the limited access area a different size again.
 * The Sector 1 modifier is one symbol out of one table; how large it is drawn is not a
 * fact about the words beside it. (User's call, 2026-08-26.)
 *
 * It rides the *label* scale rather than a raw pixel count, so the pair still reads as one
 * mark: a host that configures a larger label size gets a larger icon with it, and an area
 * too small for its own text shrinks both together.
 *
 * The number is the plate's proportion brought down to what reads on a map. A Control
 * Measure plate gives one symbol a page's worth of room and sets the icon at about the
 * full width of the Sector 2 word; an operator traces an area at whatever size the ground
 * is, and there the full-width icon crowds its own text.
 */
const GLYPH_HALF_WIDTH_PX = 53;

/** Share of the largest fitting glyph actually drawn, so it does not touch the outline. */
const INSET = 0.8;

/** Clear space between the glyph and the text above or below it, in screen pixels. */
const GLYPH_GAP_PX = 6;

/** Line height as a multiple of the font size. Matches `labelFit`'s estimate. */
const LINE_HEIGHT = 1.32;

/** The box corners and edge midpoints of a glyph, for the fit. */
function glyphSamples(halfHeight: number): ProjectedPosition[] {
    const w = GLYPH_HALF_WIDTH;
    const h = GLYPH_HALF_WIDTH * halfHeight;
    return [
        [-w, -h], [0, -h], [w, -h],
        [-w, 0], [w, 0],
        [-w, h], [0, h], [w, h],
    ];
}

/** A centered, multi-line text mark. */
function textMark(feature: PaintFeature, at: ProjectedPosition, lines: string[], scale: number): Paint {
    return {
        geometry: {type: 'Point', coordinates: at},
        text: {
            text: lines.join(BREAK),
            font: fontStyle,
            fill: labelColorOf(feature),
            halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
            align: 'center',
            baseline: 'middle',
            scale,
        },
    };
}

/**
 * The label block the three sector-modifier areas share: a literal, the Sector 1 glyph,
 * and whatever text hangs under it, stacked and centered on the area's anchor.
 *
 * The plates left-align the block against the glyph. It is centered here instead, and
 * deliberately: the left edge of a *glyph* is not the left edge of a word, so aligning
 * them means measuring the widest line in the block and offsetting the icon by half the
 * difference -- a text measurement inside a layout that already carries two independent
 * scales. Centered, the assembly reads as one mark at every zoom, and the only thing lost
 * is which edge the lines agree on.
 *
 * **No date-time group, on any of the three.** FM 1-02.2's Table 5-5 does set `W` and `W1`
 * under the limited access area's Sector 1 box, where APP-06's Table 8-5 sets field H --
 * but the graphic offers H and not the pair, so nothing here draws one. An imported bag
 * can still carry a `startDate` for a symbol that has nowhere to put it, and painting it
 * anyway is how a field nobody offered ends up on the map. (User's call, 2026-08-26.)
 *
 * @param options.literal the fixed word above the glyph -- `LAA`, and nothing else today
 * @param options.sectorTwo whether Table 8-25's word joins the block, under the glyph
 */
export function sectorModifierLabelPaint(
    options: {literal?: string; sectorTwo?: boolean} = {},
): AreaPaint {
    return (feature, context) => {
        const at = feature.geometry.type === 'Point' ? feature.geometry.coordinates : undefined;
        if (!at) return [];

        const mobility = mobilityOf(feature);
        const glyph = MOBILITY_GLYPHS[mobility] ?? MOBILITY_GLYPHS[TacticalGraphicMobility.unspecified];

        const above = options.literal ? [options.literal] : [];
        const below = [
            options.sectorTwo ? terrainWord(feature.properties.terrain) : '',
            amplifierText(feature, (feature.properties.additionalInfo ?? '').trim()),
        ].filter(line => line.length > 0);

        const all = [...above, ...below];
        if (!all.length && !glyph.halfHeight) return [];

        // One scale for every line in the block, measured against the whole of it, so the
        // literal above the glyph and the text below cannot end up at two sizes. A graphic
        // carrying no text at all still needs the plain label scale, because the glyph is
        // sized off it.
        const base = scaleOf(feature, context);
        const textScale = all.length ? fitLabelScale(feature, context, at, all, fontStyle, base) : base;

        // The fit is a ceiling, not the answer. It reports how large the glyph *could* be
        // inside the outline, which on a large area keeps opening up while the text beside
        // it hits the label scale's clamp, and the pair stops reading as one mark.
        const fit = glyph.halfHeight
            ? fitSymbolScale(feature, at, GLYPH_HALF_WIDTH, GLYPH_HALF_WIDTH * glyph.halfHeight, glyphSamples(glyph.halfHeight)) * INSET
            : 0;
        const wanted = (GLYPH_HALF_WIDTH_PX * textScale * context.resolution) / GLYPH_HALF_WIDTH;
        const glyphScale = glyph.halfHeight ? Math.min(fit, wanted) : 0;

        // Heights, in projected meters, of each band of the stack.
        const lineHeight = BASE_FONT_SIZE_PX * LINE_HEIGHT * textScale * context.resolution;
        const glyphHeight = 2 * glyph.halfHeight * GLYPH_HALF_WIDTH * glyphScale;
        const gap = glyphHeight ? GLYPH_GAP_PX * context.resolution : 0;
        const aboveHeight = above.length * lineHeight;
        const belowHeight = below.length * lineHeight;
        const total = aboveHeight + belowHeight + glyphHeight
            + (above.length ? gap : 0) + (below.length ? gap : 0);

        let cursor = at[1] + total / 2;
        const paints: Paint[] = [];

        if (above.length) {
            paints.push(textMark(feature, [at[0], cursor - aboveHeight / 2], above, textScale));
            cursor -= aboveHeight + gap;
        }
        if (glyphHeight) {
            paints.push(...mobilityMarks(
                [at[0], cursor - glyphHeight / 2],
                glyphScale,
                mobility,
                lineColorOf(feature),
                context.resolution,
            ));
            cursor -= glyphHeight + (below.length ? gap : 0);
        }
        if (below.length) {
            paints.push(textMark(feature, [at[0], cursor - belowHeight / 2], below, textScale));
        }
        return paints;
    };
}
