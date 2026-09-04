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
import {DECORATION_MIN_PX, solidArrowHead} from './decorations';
import {amplifierDash, lineColorOf} from './paintFunctions';

type LinePaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/**
 * Half the angle between the head's barbs, in degrees — **measured**, not the 135° the
 * generators' default arrowhead uses.
 *
 * Off the plate: the head reaches 0.196 of the arm back from the tip and 0.205 of it out to
 * either side, so `atan(0.205 / 0.196)` = 46.2°. That is a notably broad head, and it is
 * what makes this symbol read as a search rather than as a movement arrow at a glance.
 */
const SEARCH_HEAD_HALF_ANGLE_DEG = 46.2;

/**
 * The head's reach back from the tip along the arm, in screen pixels.
 *
 * A screen constant for the standing reason — the arms vary in length independently, and a
 * head that was a share of one arm would come out a different size on each. 20 px is a
 * little over `SOLID_ARROWHEAD_PX`, because this head is broad rather than long and reads
 * smaller than its length suggests.
 */
const SEARCH_HEAD_LENGTH_PX = 20;

/** Ceiling on the head as a share of its own arm, so a short arm is not all head. */
const SEARCH_HEAD_MAX_SHARE = 0.3;

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
            // takes as `measure: 'reach'`. @see ai/current-task.md, the fix arrowhead
            const reachPx = Math.hypot(tip[0] - path[0][0], tip[1] - path[0][1]) / context.resolution;
            const lengthPx = Math.min(SEARCH_HEAD_LENGTH_PX, reachPx * SEARCH_HEAD_MAX_SHARE);
            if (lengthPx < DECORATION_MIN_PX) continue;

            // `solidArrowHead` takes the **barb** length, which is the hypotenuse of the
            // reach and the half-width, so it is longer than the head's own reach.
            const barb = (lengthPx * context.resolution) / Math.cos((SEARCH_HEAD_HALF_ANGLE_DEG * Math.PI) / 180);
            const ring = solidArrowHead(from, tip, barb, SEARCH_HEAD_HALF_ANGLE_DEG);
            if (ring) paints.push({geometry: {type: 'Polygon', coordinates: [ring]}, fill: {color}});
        }

        return paints;
    };
}
