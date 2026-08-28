/**
 * # The PsyOps zones
 *
 * APP-06 242701 irregular, 242702 rectangular, 242703 circular. Three shapes, one
 * construction: an ordinary area outline with a **filled loudspeaker** set inside it and
 * the amplifiers beside it.
 *
 * The glyph is drawn rather than imported. It could have been an inlined `data:` URI like
 * the route-direction arrows, and is not, for the reason those three are: an image is a
 * fixed raster that a second renderer has to place identically and that no test can read.
 * Four rectangles and a trapezoid describe the same mark, scale cleanly, and take the
 * affiliation color like the outline around them.
 *
 * The proportions below are measured off the plate, in units of the speaker body's
 * height: the body is a little wider than it is tall, the horn flares to about 1.6 of it,
 * and four bars project from the horn's face.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {fitSymbolScale, sampleSegments} from './symbolFit';
import {TacticalGraphicName} from '../core/type';
import {lineColorOf, scaleOf, labelColorOf} from './paintFunctions';

type PsyOpsPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** The three shapes the zone comes in. One construction, three outlines. */
export const PSYOPS_ZONES: readonly TacticalGraphicName[] = [
    TacticalGraphicName.PsyOpsZoneIrregular,
    TacticalGraphicName.PsyOpsZoneRectangular,
    TacticalGraphicName.PsyOpsZoneCircular,
];

/** The speaker at scale 1, in projected meters, measured from the glyph's own middle. */
const BODY_HALF_HEIGHT = 60_000;
const BODY_WIDTH = 0.91 * 2 * BODY_HALF_HEIGHT;
const HORN_WIDTH = 0.40 * 2 * BODY_HALF_HEIGHT;
const HORN_HALF_HEIGHT = 0.80 * 2 * BODY_HALF_HEIGHT;
const BAR_LENGTH = 0.36 * 2 * BODY_HALF_HEIGHT;
const BAR_HALF_THICKNESS = 0.075 * BODY_HALF_HEIGHT * 2 * 0.5;
const BAR_COUNT = 4;

/** Left edge of the speaker, so the whole glyph is centered on the point it is given. */
const GLYPH_HALF_WIDTH = (BODY_WIDTH + HORN_WIDTH + BAR_LENGTH) / 2;

/** Body and horn as one closed ring: rectangle on the left, flaring to the right. */
const SPEAKER: readonly ProjectedPosition[] = (() => {
    const x0 = -GLYPH_HALF_WIDTH;
    const x1 = x0 + BODY_WIDTH;
    const x2 = x1 + HORN_WIDTH;
    return [
        [x0, -BODY_HALF_HEIGHT],
        [x1, -BODY_HALF_HEIGHT],
        [x2, -HORN_HALF_HEIGHT],
        [x2, HORN_HALF_HEIGHT],
        [x1, BODY_HALF_HEIGHT],
        [x0, BODY_HALF_HEIGHT],
        [x0, -BODY_HALF_HEIGHT],
    ];
})();

/** The four sound bars, each a filled rectangle off the horn's face. */
const BARS: readonly (readonly ProjectedPosition[])[] = (() => {
    const x2 = -GLYPH_HALF_WIDTH + BODY_WIDTH + HORN_WIDTH;
    const x3 = x2 + BAR_LENGTH;
    const step = (HORN_HALF_HEIGHT * 2) / BAR_COUNT;
    return Array.from({length: BAR_COUNT}, (_bar, i) => {
        const y = -HORN_HALF_HEIGHT + step * (i + 0.5);
        return [
            [x2, y - BAR_HALF_THICKNESS],
            [x3, y - BAR_HALF_THICKNESS],
            [x3, y + BAR_HALF_THICKNESS],
            [x2, y + BAR_HALF_THICKNESS],
            [x2, y - BAR_HALF_THICKNESS],
        ] as ProjectedPosition[];
    });
})();

/** Every point of the glyph, for testing it against the ring it has to sit inside. */
const SAMPLES: readonly ProjectedPosition[] = sampleSegments(
    SPEAKER.slice(0, -1).map((p, i) => [p, SPEAKER[i + 1]] as [ProjectedPosition, ProjectedPosition]),
).concat(BARS.flat() as ProjectedPosition[]);

/** Share of the fit actually drawn, so the glyph does not touch the outline. @see cbrnPaints */
const INSET = 0.38;

/** How far right of the glyph the amplifier block sits, in glyph half-widths. */
const LABEL_GAP = 0.35;

/**
 * The tallest the speaker is drawn, in screen pixels above its own middle, at label
 * scale 1.
 *
 * Roughly the height of the two-line amplifier block beside it, which is what makes the
 * two read as one mark. @see the cap in `psyOpsMarkPaint`
 */
const GLYPH_MAX_HALF_HEIGHT_PX = 26;

/** The line break between the two amplifier lines, H over T. */
const BREAK = String.fromCharCode(10);

/**
 * The loudspeaker and the amplifiers, over whatever the area's ordinary label paint drew.
 *
 * Like the CBRN triangle and the airfield's runways, the glyph rides the **label**
 * feature — the bare interior point the holder stamps — while the outline belongs to the
 * polygon. @see cbrnPaints, airfieldPaints
 *
 * The glyph sits left of the middle and the text to its right, which is the plate's
 * arrangement and the only one that works: a speaker centered on the interior point puts
 * the text off the shape on a narrow area.
 */
export function psyOpsMarkPaint(base: PsyOpsPaint): PsyOpsPaint {
    return (feature, context) => {
        const paints = base(feature, context);
        const center = feature.geometry.type === 'Point' ? feature.geometry.coordinates : undefined;
        if (!center) return paints;

        const color = lineColorOf(feature);
        /*
         * **The speaker stops growing where the text does.**
         *
         * `fitSymbolScale` answers "how large can this be inside the outline", so on a
         * large zone the glyph kept growing while the amplifiers beside it hit the label
         * scale's clamp — the pair stopped reading as one block and the speaker turned
         * into the graphic. The fit is a ceiling; the label's own scale is the other one,
         * and the smaller wins. @see labelScale, which is what clamps
         */
        const labelling = scaleOf(feature, context);
        const capped = (GLYPH_MAX_HALF_HEIGHT_PX * labelling * context.resolution) / HORN_HALF_HEIGHT;
        const scale = Math.min(fitSymbolScale(feature, center, GLYPH_HALF_WIDTH, HORN_HALF_HEIGHT, SAMPLES) * INSET, capped);
        // Left of the interior point by half its own width, so the pair reads as one block.
        const at = (p: ProjectedPosition): ProjectedPosition => [
            center[0] + (p[0] - GLYPH_HALF_WIDTH) * scale,
            center[1] + p[1] * scale,
        ];

        paints.push({geometry: {type: 'Polygon', coordinates: [SPEAKER.map(at)]}, fill: {color}});
        paints.push({
            geometry: {type: 'MultiPolygon', coordinates: BARS.map(bar => [bar.map(at)])},
            fill: {color},
        });

        // **H over T**, which is the Template's arrangement: the free text above the
        // designation, both to the right of the speaker. Either may be empty; two empty
        // lines draw nothing at all.
        const lines = [
            (feature.properties.additionalInfo ?? '').trim(),
            (feature.properties.designation ?? '').trim(),
        ].filter(line => line.length > 0);
        if (!lines.length) return paints;

        paints.push({
            geometry: {
                type: 'Point',
                coordinates: [center[0] + GLYPH_HALF_WIDTH * scale * LABEL_GAP, center[1]],
            },
            text: {
                text: lines.join(BREAK),
                font: fontStyle,
                fill: labelColorOf(feature),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                align: 'left',
                baseline: 'middle',
                scale: labelling,
            },
        });
        return paints;
    };
}

/**
 * The zone's own outline.
 *
 * Accepts a ring **or** a MultiLineString, because the circular variant is a
 * `CircularArea` generator and hands its outline over as line work while the other two are
 * polygons. One painter either way; the difference is the generator's, not the symbol's.
 */
export function psyOpsZonePaint(): PsyOpsPaint {
    return feature => {
        const geometry = feature.geometry;
        if (geometry.type !== 'Polygon' && geometry.type !== 'MultiLineString') return [];
        return [{geometry, stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()}}];
    };
}
