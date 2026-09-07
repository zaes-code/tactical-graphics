/**
 * # Search area / reconnaissance area — APP-06 152200
 *
 * The two stepped arms come from the generator; this adds the **solid** arrowhead at each
 * tip, at a fixed screen size.
 *
 * Solid rather than the open V the 2026-04 implementation drew. The two forms are not
 * interchangeable in this symbology — several graphics are told apart by exactly that
 * difference — and both the Template and the Example fill this one in.
 */
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {LINE_WIDTH} from '../core/symbology';
import {
    ARROWHEAD_MAX_SHARE,
    DECORATION_MIN_PX,
    SOLID_ARROWHEAD_HALF_ANGLE_DEG,
    SOLID_ARROWHEAD_PX,
    solidArrowHead,
} from './decorations';
import {amplifierDash, lineColorOf} from './paintFunctions';

type LinePaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/*
 * **The head is Fix's head, and none of its numbers live here.**
 *
 * The first version measured the plate — a 46-degree half-angle and a 20 px reach — and
 * drew something correct against that drawing and unlike every other arrowhead in this
 * library. A broad, stubby head reads as a different family of symbol; the user's call
 * (2026-09-04) is that it should match the ones already in use.
 *
 * So it takes `SOLID_ARROWHEAD_PX` and `ARROWHEAD_MAX_SHARE`, the same two constants
 * `screenSizedArrowHead` applies to Fix, tactical fix and ferry crossing, and the half-angle
 * the generators' own `createArrowHeadPolygon` produces. Nothing to keep in step: change
 * the family's head and this changes with it.
 */

export function searchAreaPaint(): LinePaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiLineString') return [];

        const color = lineColorOf(feature);
        const stroke = {color, widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)};
        const paints: Paint[] = [{geometry, stroke}];

        for (const path of geometry.coordinates) {
            if (path.length < 2) continue;
            const tip = path[path.length - 1] as ProjectedPosition;
            const from = path[path.length - 2] as ProjectedPosition;

            // The arm end to end, not the stepped path: the step nearly doubles how far
            // the pen travels, and a share of the traversal would let the head reach full
            // size on an arm half as long as it thinks. Same correction `screenSizedArrowHead`
            // takes as `measure: 'reach'`.
            const reachPx = Math.hypot(tip[0] - path[0][0], tip[1] - path[0][1]) / context.resolution;
            const lengthPx = Math.min(SOLID_ARROWHEAD_PX, reachPx * ARROWHEAD_MAX_SHARE);
            if (lengthPx < DECORATION_MIN_PX) continue;

            // `solidArrowHead` takes the **barb** length, which is the hypotenuse of the
            // reach and the half-width, so it is longer than the head's own reach.
            const barb = (lengthPx * context.resolution) / Math.cos((SOLID_ARROWHEAD_HALF_ANGLE_DEG * Math.PI) / 180);
            const ring = solidArrowHead(from, tip, barb, SOLID_ARROWHEAD_HALF_ANGLE_DEG);
            if (ring) paints.push({geometry: {type: 'Polygon', coordinates: [ring]}, fill: {color}});
        }

        return paints;
    };
}
