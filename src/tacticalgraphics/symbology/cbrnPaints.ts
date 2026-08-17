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
 * **The yellow is not an affiliation colour and must not follow hostility.** It is the
 * hazard convention, on the same reasoning that makes the no-fire family's hatch a
 * neutral: a contaminated area warns about the ground, and it reads the same whoever
 * drew it. The outline still carries the affiliation, so a hostile contaminated area is
 * red line work over the same yellow.
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
 * The contamination mark, measured off the plate: two filled lobes, and beneath and between
 * them an **arch** — a curve whose two legs point down.
 *
 * It was drawn upside down until 2026-08-17: a stem rising from a single foot and forking
 * into two, which reads as a `Y`. The plate has one apex and *two* feet.
 */
const LOBE_RADIUS = 20_000;
const LOBE_X = 51_000;
const LOBE_Y = 52_000;

/** The arch: apex on the axis between the lobes, legs splaying down and out. */
const ARCH_APEX_Y = 44_000;
const ARCH_FOOT_X = 28_000;
const ARCH_FOOT_Y = -35_000;
/** How many points the arch is sampled at. */
const ARCH_STEPS = 16;

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
 */
export function cbrnMarkPaint(letter: string, label: CbrnPaint): CbrnPaint {
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
            liftedAnchor(feature, HALF_HEIGHT * scale + (LABEL_CLEARANCE_PX + LABEL_BLOCK_PX) * context.resolution),
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
            geometry: {type: 'Point', coordinates: at(0, 96_000)},
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
        // The lobes are filled discs; the stem forks up between them.
        for (const side of [-1, 1]) {
            paints.push({
                geometry: {type: 'Point', coordinates: at(side * LOBE_X, LOBE_Y)},
                circle: {radiusPx: (LOBE_RADIUS * scale) / context.resolution, fill: {color}},
            });
        }
        // A parabola through the apex and both feet — smooth, and symmetric by construction.
        const arch: ProjectedPosition[] = [];
        for (let i = 0; i <= ARCH_STEPS; i++) {
            const t = (i / ARCH_STEPS) * 2 - 1;
            arch.push(at(t * ARCH_FOOT_X, ARCH_APEX_Y - (ARCH_APEX_Y - ARCH_FOOT_Y) * t * t));
        }
        paints.push({geometry: {type: 'LineString', coordinates: arch}, stroke});
        return paints;
    };
}
