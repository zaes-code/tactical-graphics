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
            liftedAnchor(
                feature,
                HALF_HEIGHT * scale + (LABEL_CLEARANCE_PX + LABEL_BLOCK_PX) * context.resolution,
                LABEL_CLEARANCE_PX * context.resolution,
            ),
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

/**
 * Half-width the point airfield is **dropped** at, in screen pixels at the placing zoom.
 *
 * A starting size, not a fixed one — see {@link airfieldPointPaint}. It is read once, when
 * the controller converts it to metres for the drop, and never again.
 */
export const AIRFIELD_DROP_HALF_WIDTH_PX = 34;

/**
 * The **point** airfield (131900): the two crossed arms, with the designation set beside the
 * runway's right-hand end.
 *
 * **Drawn at its own size in metres, so it scales with the map.** It was pinned to a constant
 * screen size until 2026-08-17, on a reading of the row's "Size/Shape. Static" as "the size
 * is not the operator's". That was wrong twice over: the phrase describes how the symbol
 * responds to its *anchor points* — a static symbol does not change shape as they move, and
 * this one has only the one — and a symbol welded to the screen is a symbol that does not
 * mark a place on the ground. An airfield covers a real extent, so it grows when you zoom in.
 *
 * So there is nothing to divide out here: the arms are painted as the generator laid them
 * out. The operator sets the extent by dragging the edge handle, and it is stored in metres
 * like every other resizable graphic's.
 *
 * Distinct from {@link airfieldPaint}, which fits the same glyph *inside a drawn boundary*
 * for the airfield **zone** (120400). The two were one paint until 2026-08-17 and rendered
 * identically, which is why nobody could tell the graphics apart.
 */
export function airfieldPointPaint(): AirfieldPaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString' || geometry.coordinates.length < 2) return [];

        return [{
            geometry,
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
        }];
    };
}

/** Clearance between the runway's end and the designation beside it, in screen pixels. */
const AIRFIELD_LABEL_GAP_PX = 8;

/** Fallback half-width, in metres, for a feature carrying no size. */
const AIRFIELD_FALLBACK_HALF_WIDTH = 2_000;

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

        // The runway's reach is metres now, so the clearance is the only part in pixels — a
        // gap that shrank with the zoom would close up long before the glyph did.
        const reach = feature.graphicSize && feature.graphicSize > 0 ? feature.graphicSize : AIRFIELD_FALLBACK_HALF_WIDTH;
        const offset = reach + AIRFIELD_LABEL_GAP_PX * context.resolution;
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
