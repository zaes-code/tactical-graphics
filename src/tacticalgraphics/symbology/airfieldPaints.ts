/**
 * # The airfield's crossed runways
 *
 * The last style function that lived only in `openlayerStyles.ts`, and the reason
 * MapLibre drew an airfield as a bare polygon with a label in it: the symbol inside
 * — a runway and a crossing taxiway — was OpenLayers-only.
 *
 * It was written as an SVG path string and converted through an OpenLayers helper,
 * which is why it read as renderer-specific. It is not: the "path" is two straight
 * segments in projected meters, and every renderer can draw two lines.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelFillColor, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicName} from '../core/type';
import {getFullLabel, lineColorOf, scaleOf} from './paintFunctions';
import {fitSymbolScale, sampleSegments} from './symbolFit';
import {liftedAnchor} from './labelFit';

/** A paint function, in the shape the registry stores. */
type AirfieldPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/**
 * The crossed runways at scale 1, in projected meters from the center — so the
 * unscaled symbol is ~400 km across, whatever polygon it sits in.
 */
const HALF_WIDTH = 200_000;
const HALF_HEIGHT = 120_000;

const ARMS: readonly [ProjectedPosition, ProjectedPosition][] = [
    [[-HALF_WIDTH, 0], [HALF_WIDTH, 0]],
    [[-HALF_WIDTH, -HALF_HEIGHT], [HALF_WIDTH, HALF_HEIGHT]],
];

/** Clear space between the runway cross and the designation above it, in pixels. */
const LABEL_CLEARANCE_PX = 10;
/**
 * The date-time group hangs below the designation, so the lift has to clear **both** or
 * the name rises clear of the runway cross and the date lands straight back on it.
 * @see areaDefaultLabelPaint, which owns that offset.
 */
const LABEL_BLOCK_PX = 20;

/** Points along both arms, tested against the outline. @see sampleSegments */
const SAMPLES: readonly ProjectedPosition[] = sampleSegments(ARMS);

/**
 * The airfield: the area's ordinary label block, plus the runway symbol at its
 * interior point.
 *
 * The runways take the **standard identity color**, with the area outline, because
 * they are the symbol's own line work rather than an amplifier — FM 1-02.2 para 5-3.
 */
export function airfieldPaint(label: AirfieldPaint): AirfieldPaint {
    return (feature, context) => {
        const center = feature.geometry.type === 'Point' ? feature.geometry.coordinates : undefined;
        if (!center) return label(feature, context);

        const scale = fitSymbolScale(feature, center, HALF_WIDTH, HALF_HEIGHT, SAMPLES);
        // Above the runways, by however tall they came out. @see liftedAnchor
        const paints = label(
            liftedAnchor(feature, HALF_HEIGHT * scale + (LABEL_CLEARANCE_PX + LABEL_BLOCK_PX) * context.resolution),
            context,
        );
        const place = ([x, y]: ProjectedPosition): ProjectedPosition => [center[0] + x * scale, center[1] + y * scale];

        paints.push({
            geometry: {type: 'MultiLineString', coordinates: ARMS.map(arm => arm.map(place))},
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
        });
        return paints;
    };
}

/** Screen half-width of the point airfield's runway, in pixels. Static, per the row. */
export const AIRFIELD_HALF_WIDTH_PX = 34;

/**
 * The **point** airfield (131900): the two crossed arms at a constant screen size, with the
 * designation set beside the runway's right-hand end.
 *
 * Pinned the way the crossed mission tasks are — the generator lays the arms out against
 * `size`, and `k` divides that back out so the symbol is the same number of pixels at every
 * zoom. The row says "Size/Shape. Static", which is the standard saying the size is not the
 * operator's to set.
 *
 * Distinct from {@link airfieldPaint}, which fits the same glyph *inside a drawn boundary*
 * for the airfield **zone** (120400). The two were one paint until 2026-08-17 and rendered
 * identically, which is why nobody could tell the graphics apart.
 */
export function airfieldPointPaint(): AirfieldPaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString' || geometry.coordinates.length < 2) return [];

        const arms = geometry.coordinates;
        const [a0, a1] = arms[0];
        const cx = feature.graphicCenter?.[0] ?? (a0[0] + a1[0]) / 2;
        const cy = feature.graphicCenter?.[1] ?? (a0[1] + a1[1]) / 2;

        const size = feature.graphicSize;
        const k = size && size > 0 ? (AIRFIELD_HALF_WIDTH_PX * context.resolution) / size : 1;
        const pin = (p: ProjectedPosition): ProjectedPosition => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k];

        return [{
            geometry: {type: 'MultiLineString', coordinates: arms.map(arm => arm.map(pin))},
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
        }];
    };
}

/** Clearance between the runway's end and the designation beside it, in screen pixels. */
const AIRFIELD_LABEL_GAP_PX = 8;

/**
 * The point airfield's designation, set to the right of the runway rather than through it.
 *
 * The plate boxes a `T` clear of the symbol's right-hand end. Centring it on the anchor —
 * which is what the ordinary area label block does — puts the text straight through the
 * crossing, which is where it was until the airfield became a point.
 */
export function airfieldPointLabelPaint(name: TacticalGraphicName): AirfieldPaint {
    return (feature, context) => {
        const center = feature.geometry.type === 'Point' ? feature.geometry.coordinates : undefined;
        const text = getFullLabel(name, feature.properties.label ?? '').trim();
        if (!center || !text) return [];

        const offset = (AIRFIELD_HALF_WIDTH_PX + AIRFIELD_LABEL_GAP_PX) * context.resolution;
        return [{
            geometry: {type: 'Point', coordinates: [center[0] + offset, center[1]]},
            text: {
                text,
                font: fontStyle,
                fill: getLabelFillColor(),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                align: 'left',
                baseline: 'middle',
                scale: scaleOf(feature, context),
            },
        }];
    };
}

/** The graphic this paints. Exported so the registry and the tests name one thing. */
export const AIRFIELD = TacticalGraphicName.Airfield;
