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
 * The contamination mark, traced off a 600 dpi render of the plate's own Example cell.
 *
 * It is an **X**: two long strokes crossing just under the letter. Each runs from a filled
 * blob at one upper corner, through the crossing, and on to the *opposite* lower foot, the
 * lower halves bowing outward as they fall.
 *
 * Three earlier readings of it were wrong, and each rendered plausibly enough to survive:
 *
 * 1. A stem rising from one foot and forking into two — a `Y`. Upside down.
 * 2. Two discs floating above a separate arch. The right parts, unconnected.
 * 3. Two teardrops above an arch. Wrong again: what looked like a tail at 150 dpi is the
 *    stroke *continuing through* the blob and on to the far foot.
 *
 * The lesson is in the resolution. The contact sheets crop at 150 dpi, which is enough to
 * tell a triangle from a square and not enough to tell a disc from a comma from the end of a
 * stroke. Anything at glyph scale has to be read at 600.
 *
 * Every number below is **measured, not eyeballed**: the plate's Example cell is rendered at
 * 600 dpi, thresholded, and the mark isolated as a connected component, so the blob centres,
 * the crossing height and the feet come off a pixel profile rather than a squint.
 *
 * Coordinates are projected metres at scale 1, against the triangle: its top edge is
 * `+HALF_HEIGHT` and its apex `-HALF_HEIGHT`.
 */
const CROSS_Y = 20_500;
const BLOB_X = 62_300;
const BLOB_Y = 47_700;
/** The blobs are **ellipses**, half again as tall as they are wide. */
const BLOB_RX = 24_400;
const BLOB_RY = 32_100;
const FOOT_X = 33_100;
const FOOT_Y = -41_900;

/** How many points each falling leg and each blob is drawn with. */
const LEG_STEPS = 14;
const BLOB_STEPS = 20;

/** A closed ring approximating an ellipse. */
function ellipse(center: ProjectedPosition, rx: number, ry: number): ProjectedPosition[] {
    const ring: ProjectedPosition[] = [];
    for (let i = 0; i <= BLOB_STEPS; i++) {
        const t = (i / BLOB_STEPS) * 2 * Math.PI;
        ring.push([center[0] + Math.cos(t) * rx, center[1] + Math.sin(t) * ry]);
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
        // The X. Each stroke runs blob -> crossing -> *opposite* foot, so the pair reads as
        // two continuous lines rather than four spokes meeting at a point.
        for (const side of [-1, 1]) {
            const stroke_ = [at(side * BLOB_X, BLOB_Y), at(0, CROSS_Y)];
            // The falling half bows outward: a quadratic whose control sits directly above
            // the foot leaves the crossing steeply and arrives near-vertical, which is the
            // shape the plate draws.
            const footX = -side * FOOT_X;
            for (let i = 1; i <= LEG_STEPS; i++) {
                const t = i / LEG_STEPS;
                const u = 1 - t;
                stroke_.push(at(
                    (2 * u * t + t * t) * footX,
                    u * u * CROSS_Y + 2 * u * t * ((CROSS_Y + FOOT_Y) / 2) + t * t * FOOT_Y,
                ));
            }
            paints.push({geometry: {type: 'LineString', coordinates: stroke_}, stroke});
        }

        // The blobs last, so they cap the strokes rather than being cut by them.
        for (const side of [-1, 1]) {
            paints.push({
                geometry: {
                    type: 'Polygon',
                    coordinates: [ellipse([side * BLOB_X, BLOB_Y], BLOB_RX, BLOB_RY).map(([x, y]) => at(x, y))],
                },
                fill: {color},
            });
        }
        return paints;
    };
}
