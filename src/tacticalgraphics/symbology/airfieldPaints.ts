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

/**
 * Share of the area's shorter side the symbol spans. The same fraction the area's
 * own text block is capped to, so symbol and text agree about how much room a
 * polygon offers.
 */
const FIT_SHARE = 0.8;

/** How many times the fit may be tightened before a polygon is called degenerate. */
const SHRINK_STEPS = 30;
const SHRINK_FACTOR = 0.9;

/**
 * Points along both arms, used to test the symbol against the polygon outline.
 *
 * **Endpoints alone are not enough**: both arms pass through the center, so a notch
 * in a concave ring can cut a stroke without containing either of its ends.
 */
const SAMPLES: readonly ProjectedPosition[] = ARMS.flatMap(([a, b]) => {
    const steps = 8;
    const points: ProjectedPosition[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return points;
});

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

        const scale = symbolScale(feature, center);
        const place = ([x, y]: ProjectedPosition): ProjectedPosition => [center[0] + x * scale, center[1] + y * scale];

        paints.push({
            geometry: {type: 'MultiLineString', coordinates: ARMS.map(arm => arm.map(place))},
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
        });
        return paints;
    };
}

/**
 * How much to shrink the symbol so it sits inside its polygon.
 *
 * Starts from the bounding box's shorter side and then tightens until every sample
 * point is inside the ring, which is what keeps it out of a concave notch the box
 * knows nothing about. Bounded, because a polygon that still fails at 0.9^30 — about
 * 4% of the box fit — is degenerate rather than tight.
 *
 * Returns 1 when the bounds have not been stamped yet, keeping the historical fixed
 * size rather than collapsing the symbol to nothing on a first render.
 */
function symbolScale(feature: PaintFeature, center: ProjectedPosition): number {
    const bounds = feature.bounds;
    if (!bounds) return 1;

    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    if (!(width > 0) || !(height > 0)) return 1;

    let scale = FIT_SHARE * Math.min(width / (HALF_WIDTH * 2), height / (HALF_HEIGHT * 2));

    const ring = feature.ring;
    if (!ring || ring.length < 3) return scale;

    const fits = (s: number) =>
        SAMPLES.every(p => pointInRing(ring, [center[0] + p[0] * s, center[1] + p[1] * s]));

    for (let i = 0; i < SHRINK_STEPS && !fits(scale); i++) scale *= SHRINK_FACTOR;
    return scale;
}

/** Ray casting, in the plane — these are projected meters. */
function pointInRing(ring: readonly ProjectedPosition[], [x, y]: ProjectedPosition): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/** The graphic this paints. Exported so the registry and the tests name one thing. */
export const AIRFIELD = TacticalGraphicName.Airfield;
