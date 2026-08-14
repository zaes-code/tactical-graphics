/**
 * # CBRN contaminated areas
 *
 * APP-06 Table 8-19 draws all four the same way: a drawn area filled with **yellow**
 * hatching, and a downward-pointing triangle inscribed in the middle carrying the
 * hazard's letter over the international contamination mark.
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

/** Share of the largest fitting triangle actually drawn. @see the note at its use. */
const INSET = 0.62;

/** The contamination mark: two filled lobes either side of a stem that forks upward. */
const LOBE_RADIUS = 30_000;
const LOBE_X = 62_000;
const LOBE_Y = 6_000;

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
        const paints = label(feature, context);
        const center = feature.geometry.type === 'Point' ? feature.geometry.coordinates : undefined;
        if (!center) return paints;

        const color = lineColorOf(feature);
        // **Tightened well inside the fit.** `fitSymbolScale` answers "how large can this
        // be without crossing the outline", which for a triangle in a rectangle puts its
        // top edge flat against the area's own top edge — the two lines then read as one
        // and the triangle stops looking inscribed. The plate leaves clear ground all
        // round it, so the fit is a ceiling here rather than the answer.
        const scale = fitSymbolScale(feature, center, HALF_WIDTH, HALF_HEIGHT, SAMPLES) * INSET;
        const at = (x: number, y: number): ProjectedPosition => [center[0] + x * scale, center[1] + y * scale];
        const stroke = {color, widthPx: LINE_WIDTH()};

        paints.push({
            geometry: {type: 'LineString', coordinates: TRIANGLE.map(([x, y]) => at(x, y))},
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
        paints.push({
            geometry: {
                type: 'MultiLineString',
                coordinates: [
                    [at(0, -78_000), at(0, -14_000)],
                    [at(0, -14_000), at(-52_000, 30_000)],
                    [at(0, -14_000), at(52_000, 30_000)],
                ],
            },
            stroke,
        });
        return paints;
    };
}
