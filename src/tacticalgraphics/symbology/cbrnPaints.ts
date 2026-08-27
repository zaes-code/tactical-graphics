/**
 * # CBRN contaminated areas
 *
 * APP-06 Table 8-19 draws all four the same way: a drawn area filled with **yellow**
 * hatching, and a downward-pointing triangle inscribed in the middle carrying the
 * hazard's letter over the contamination mark — two lobes above an arch.
 *
 * Only the letter changes between them — `B`, `C`, `N`, `R` — so the construction is
 * stated once here and the registry names four graphics against it. Four near-identical
 * paints would be four places for the triangle's proportions to drift apart.
 *
 * **Nothing here follows hostility.** The yellow is the hazard convention, on the same
 * reasoning that makes the no-fire family's hatch a neutral: a contaminated area warns
 * about the ground, and it reads the same whoever drew it. As of 2026-08-26 the outline
 * does not carry an affiliation either — these are exempt in `supportsHostility`, so
 * `lineColorOf` answers the unaffiliated colour whatever the property bag says, and the
 * dialog offers no identity to choose. @see HAZARD_AREAS
 *
 * The split between the two paints below mirrors the airfield's, and for the same
 * reason: the glyph is placed on the **label** feature, which is the bare interior point
 * the holder stamps, while the fill belongs to the polygon. @see airfieldPaints
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor, withOpacity} from '../core/symbology';
import {lineColorOf} from './paintFunctions';
import {fitSymbolScale, sampleSegments} from './symbolFit';
import {liftedAnchor} from './labelFit';

type CbrnPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** The hazard yellow, from the plate. Fixed, for the reason in the file header. */
const HAZARD_YELLOW = '#FFEB00';

/**
 * The triangle at scale 1, in projected meters from the center — point down, so the
 * unscaled symbol is ~400 km across and the fit brings it inside whatever was drawn.
 */
const HALF_WIDTH = 200_000;
const HALF_HEIGHT = 170_000;

/** Apex at the bottom, flat side on top: the plate's orientation. */
const TRIANGLE: readonly ProjectedPosition[] = [
    [-HALF_WIDTH, HALF_HEIGHT],
    [HALF_WIDTH, HALF_HEIGHT],
    [0, -HALF_HEIGHT],
    [-HALF_WIDTH, HALF_HEIGHT],
];

const EDGES = TRIANGLE.slice(0, 3).map(
    (p, i) => [p, TRIANGLE[i + 1]] as [ProjectedPosition, ProjectedPosition],
);
const SAMPLES: readonly ProjectedPosition[] = sampleSegments(EDGES);

/** Clear space between the triangle's top edge and the designation above it, in pixels. */
const LABEL_CLEARANCE_PX = 10;
/**
 * The date-time group hangs below the designation, so the lift has to clear **both** or
 * the name rises clear of the triangle and the date lands straight back on it.
 * @see areaDefaultLabelPaint, which owns that offset.
 */
const LABEL_BLOCK_PX = 20;

/** Share of the largest fitting triangle actually drawn. @see the note at its use. */
const INSET = 0.62;

/**
 * The contamination mark: two crossed **arcs**, each rooted in a disc.
 *
 * Each arm leaves a filled disc at one upper corner, sweeps inward and down to the crossing
 * on the axis, then curves away to a blunt end low on the *opposite* side — inboard of the
 * discs, not splayed past them. The two are mirror images, so the pair reads as an `X` with
 * heavy upper corners and two near-vertical legs beneath.
 *
 * Six earlier readings were wrong, and every one of them rendered plausibly:
 *
 * 1. A stem rising from one foot and forking into two — a `Y`. Upside down.
 * 2. Two discs floating above a separate arch. The right parts, unconnected.
 * 3. Two teardrops above an arch: what looks like a comma's tail is the arm *continuing
 *    through* the disc toward the far side.
 * 4. The right structure with the discs at a third of their size.
 * 5. Solid arms tapering to a point, which reads as two needles rather than two spoons.
 * 6. Straight stems splayed past the discs, which loses the curve entirely.
 *
 * **The lesson is that a raster cannot settle this.** Every wrong reading above came from
 * measuring a bitmap — the conformance sheets crop the plates at 150 dpi, which tells a
 * triangle from a square and cannot tell a disc from a comma from the end of a tapering arm,
 * and even a clean 600 dpi thresholding leaves the curve's shape a judgement call. The
 * numbers below are instead transcribed from a **vector** reference: two cubic Béziers and a
 * circle, so there is nothing left to infer.
 *
 * Its own frame was `viewBox="0 0 542 253"`, discs of `r=65` at `(79,66)` and `(463,66)`, and
 * a `stroke-width` of 17 with butt caps. Everything here is that, divided by the mark's
 * half-width of 257 and flipped to y-up, with the crossing at `(271,80)` as the origin.
 *
 * **This deliberately does not match APP-06's own plate, and must not be "corrected" to it.**
 * The two genuinely disagree below the crossing: the plate's arms bend to near-vertical and
 * stop about a third of the way out, where the reference splays them wider and sets the discs
 * at the full half-width. The reference is the more legible mark at the size these render,
 * and following it is a confirmed decision — asked and answered, 2026-08-17. It is on the
 * conformance review page as a departure. @see ai/decisions.md
 *
 * The frame is therefore the mark's own: `x` in half-widths either side of the crossing, `y`
 * up from it, both scaled by {@link MARK_HALF_WIDTH} and placed in the triangle at
 * {@link CROSS_Y}.
 */
const MARK_HALF_WIDTH = 80_000;
const CROSS_Y = 55_000;

/** The disc at one arm's upper end. A circle: not an oval, and not a teardrop. */
const BOWL_AT: ProjectedPosition = [-0.747, 0.054];
const BOWL_RADIUS = 0.253;
const BOWL_STEPS = 28;

/** The arm's width. Constant along it — the reference strokes one path, it does not taper. */
const STEM_WIDTH = 0.0661;

/**
 * One arm, as the two cubics the reference draws: `[P0, C1, C2, crossing, C3, C4, P2]`.
 *
 * The crossing is shared, so the two halves join with a continuous tangent and the arm reads
 * as one sweep rather than as two curves meeting. Note that `P0` sits *inside* the disc
 * rather than on its rim — the disc is where the arm begins, not an ornament stuck onto it.
 */
const ARM: readonly ProjectedPosition[] = [
    [-0.747, 0.28],
    [-0.459, 0.28],
    [-0.183, 0.156],
    [0, 0],
    [0.23, -0.195],
    [0.366, -0.428],
    [0.401, -0.665],
];

/** Samples per cubic. */
const ARM_STEPS = 16;

/** One arm's centreline, sampled. `side` mirrors it, which is what makes the pair cross. */
function armPath(side: number): ProjectedPosition[] {
    const p = ARM.map(([x, y]): ProjectedPosition => [side * x, y]);
    const out: ProjectedPosition[] = [];
    for (let seg = 0; seg < 2; seg++) {
        const [a, b, c, d] = [p[seg * 3], p[seg * 3 + 1], p[seg * 3 + 2], p[seg * 3 + 3]];
        // The second cubic skips t=0, which is the first one's endpoint.
        for (let i = seg === 0 ? 0 : 1; i <= ARM_STEPS; i++) {
            const t = i / ARM_STEPS;
            const u = 1 - t;
            out.push([0, 1].map(k =>
                u * u * u * a[k] + 3 * u * u * t * b[k] + 3 * u * t * t * c[k] + t * t * t * d[k],
            ) as ProjectedPosition);
        }
    }
    return out;
}

/** One arm's disc, as a closed ring. */
function bowl(side: number): ProjectedPosition[] {
    const ring: ProjectedPosition[] = [];
    for (let i = 0; i <= BOWL_STEPS; i++) {
        const t = (i / BOWL_STEPS) * 2 * Math.PI;
        ring.push([side * BOWL_AT[0] + Math.cos(t) * BOWL_RADIUS, BOWL_AT[1] + Math.sin(t) * BOWL_RADIUS]);
    }
    return ring;
}

/** The area's fill and outline. The glyph rides the label feature. */
export function cbrnContaminatedAreaPaint(): CbrnPaint {
    return feature => {
        if (feature.geometry.type !== 'Polygon') return [];
        return [{
        geometry: feature.geometry,
        fill: {
            color: withOpacity(HAZARD_YELLOW, 0.3),
            pattern: {kind: 'diagonal', color: HAZARD_YELLOW, sizePx: 10, lineWidthPx: 2},
        },
        stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
        }];
    };
}

/**
 * The triangle, its letter and the contamination mark, over whatever the area's ordinary
 * label paint already drew.
 *
 * @param letter the hazard's letter — `B`, `C`, `N` or `R`, straight off the plate.
 * @param options `toxic` adds the **T** the three toxic-industrial-material variants carry
 *        in the bottom of the triangle (APP-06 271701, 271801, 272001). It is the only
 *        difference between a contaminated area and its TIM subtype, which is why it is a
 *        flag here rather than three more paints.
 */
export function cbrnMarkPaint(letter: string, label: CbrnPaint, options: {toxic?: boolean} = {}): CbrnPaint {
    return (feature, context) => {
        const center = feature.geometry.type === 'Point' ? feature.geometry.coordinates : undefined;
        if (!center) return label(feature, context);

        const color = lineColorOf(feature);
        // **Tightened well inside the fit.** `fitSymbolScale` answers "how large can this
        // be without crossing the outline", which for a triangle in a rectangle puts its
        // top edge flat against the area's own top edge — the two lines then read as one
        // and the triangle stops looking inscribed. The plate leaves clear ground all
        // round it, so the fit is a ceiling here rather than the answer.
        const scale = fitSymbolScale(feature, center, HALF_WIDTH, HALF_HEIGHT, SAMPLES) * INSET;
        const at = (x: number, y: number): ProjectedPosition => [center[0] + x * scale, center[1] + y * scale];

        // The designation goes *above the triangle*, and how far above is only knowable
        // here: the triangle was just fitted to whatever area it landed in.
        const paints = label(
            liftedAnchor(
                feature,
                HALF_HEIGHT * scale + (LABEL_CLEARANCE_PX + LABEL_BLOCK_PX) * context.resolution,
                LABEL_CLEARANCE_PX * context.resolution,
            ),
            context,
        );
        const stroke = {color, widthPx: LINE_WIDTH()};

        // **Filled, and filled with the halo colour rather than a literal white.** The plate
        // shows the yellow hatch stopping at the triangle's edge, which only happens if the
        // triangle is opaque — and the colour that means "the ground behind a symbol" in
        // this library is the one a host overrides for a dark basemap, not `#fff`.
        //
        // One paint carrying both a fill and a stroke, so the two can never be drawn in the
        // wrong order relative to each other.
        paints.push({
            geometry: {type: 'Polygon', coordinates: [TRIANGLE.map(([x, y]) => at(x, y))]},
            fill: {color: getLabelHaloColor()},
            stroke,
        });
        paints.push({
            geometry: {type: 'Point', coordinates: at(0, 120_000)},
            text: {
                text: letter,
                font: fontStyle,
                fill: color,
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                align: 'center',
                baseline: 'middle',
                scale: (HALF_HEIGHT * scale) / (context.resolution * 44),
            },
        });
        // The arms, then the discs over them, so each disc swallows its arm's start rather
        // than being cut by it. Butt caps, as the reference has: a round cap would round off
        // the blunt lower ends, which is one of the few things every reading of this symbol
        // has agreed on.
        //
        // The arm's width is derived from `scale` rather than taken from `LINE_WIDTH()`: this
        // is part of a symbol that was just fitted to the area it landed in, so a constant
        // screen weight would read as spindly on a large one and as a blot on a small one. It
        // is the same reasoning that sizes the letter above.
        const markPx = (v: number): number => (v * MARK_HALF_WIDTH * scale) / context.resolution;
        const mark = (x: number, y: number): ProjectedPosition =>
            at(x * MARK_HALF_WIDTH, y * MARK_HALF_WIDTH + CROSS_Y);

        for (const side of [-1, 1]) {
            paints.push({
                geometry: {type: 'LineString', coordinates: armPath(side).map(([x, y]) => mark(x, y))},
                stroke: {color, widthPx: markPx(STEM_WIDTH), cap: 'butt', join: 'round'},
            });
        }
        for (const side of [-1, 1]) {
            paints.push({
                geometry: {type: 'Polygon', coordinates: [bowl(side).map(([x, y]) => mark(x, y))]},
                fill: {color},
            });
        }

        /*
         * **The toxic-industrial-material variants add a `T` in the bottom of the
         * triangle**, under the contamination mark — the only difference between 271700
         * and 271701, and the same difference again for the chemical and radiological
         * pairs. It is set smaller than the hazard letter above because the triangle is
         * narrowing toward its point and a full-size glyph would touch both edges.
         */
        if (options.toxic) {
            paints.push({
                geometry: {type: 'Point', coordinates: at(0, TOXIC_LETTER_Y)},
                text: {
                    text: 'T',
                    font: fontStyle,
                    fill: color,
                    halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                    align: 'center',
                    baseline: 'middle',
                    scale: (HALF_HEIGHT * scale) / (context.resolution * 60),
                },
            });
        }

        return paints;
    };
}

/**
 * Where the toxic-industrial `T` sits, in the triangle's own metres.
 *
 * Below the contamination mark and clear of the point: the triangle runs from
 * `HALF_HEIGHT` at the top edge down to `-HALF_HEIGHT` at the tip, and the mark is
 * centred on {@link CROSS_Y}.
 */
const TOXIC_LETTER_Y = -95_000;
