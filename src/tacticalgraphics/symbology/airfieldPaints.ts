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
import {LINE_WIDTH} from '../core/symbology';
import {TacticalGraphicName} from '../core/type';
import {lineColorOf} from './paintFunctions';
import {fitSymbolScale, sampleSegments} from './symbolFit';

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
        const paints = label(feature, context);
        const center = feature.geometry.type === 'Point' ? feature.geometry.coordinates : undefined;
        if (!center) return paints;

        const scale = fitSymbolScale(feature, center, HALF_WIDTH, HALF_HEIGHT, SAMPLES);
        const place = ([x, y]: ProjectedPosition): ProjectedPosition => [center[0] + x * scale, center[1] + y * scale];

        paints.push({
            geometry: {type: 'MultiLineString', coordinates: ARMS.map(arm => arm.map(place))},
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
        });
        return paints;
    };
}

/** The graphic this paints. Exported so the registry and the tests name one thing. */
export const AIRFIELD = TacticalGraphicName.Airfield;
