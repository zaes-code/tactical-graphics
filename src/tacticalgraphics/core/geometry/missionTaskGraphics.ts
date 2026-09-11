import {Feature, MultiLineString, Position} from 'geojson';
import * as turf from '../turf';
import {computeArrowheadPoints, computeArrowheadPointsProjected} from './arrows';
import {computeParallelLineString, project, unproject} from './primitives';
import {lineStringToDashes} from './wavesBendsDashes';

/**
 * Internal proportions of the attack-by-fire / support-by-fire position symbols,
 * all expressed against the bar's half-height so the whole symbol scales as one
 * piece. Measured off the FM 1-02.2 table 6-1 constructs — the 89x149 px
 * attack-by-fire figure (printed page 239) and the 42x101 px support-by-fire
 * figure (printed page 243):
 *
 *   attack by fire   barHalf 42.5   feather 40.3   arrowhead ~22
 *   support by fire  barHalf 28.5   feather 26.9   arrow spread 16
 *
 * @see getFirePositionBracket
 */
const FIRE_POSITION_FEATHER_RATIO = 0.95;
const FIRE_POSITION_ARROWHEAD_RATIO = 0.52;
/**
 * The two components of a support-by-fire arrow, measured from the bar it leaves:
 * how far forward it reaches (as a fraction of the shaft) and how far past the bar
 * it lands (as a fraction of the bar's half-height).
 *
 * Both are half what they first shipped as (1.0 / 0.56 — the arrows reached exactly
 * as far as the user dragged), on the user's call 2026-07-29. Halving *both* is what
 * halves the arrow's length without changing the angle it diverges at. The
 * construct puts an arrow at 0.90 x barHalf; these values give 1.15, so short is
 * also the more doctrinal direction.
 */
const FIRE_POSITION_ARROW_REACH_RATIO = 0.5;
const FIRE_POSITION_ARROW_SPREAD_RATIO = 0.28;

/**
 * The "position" bracket shared by the attack-by-fire and support-by-fire
 * symbols: a bar perpendicular to the shaft, centred on `start`, with a
 * feather swept back off each end of it.
 *
 * Emitted as ONE polyline `[featherTop, barTop, barBottom, featherBottom]`
 * so a single Stroke draws the whole bracket in lock-step — the bar and its
 * feathers are one pen line in the doctrinal figure, not three.
 *
 * Proportions are measured off the FM 1-02.2 table 6-1 constructs (printed
 * pages 239 and 243): a feather is `FIRE_POSITION_FEATHER_RATIO` of the
 * bar's half-height, swept 45° back off the bar. The bar's own size relative
 * to the shaft is the caller's business — see `FIRE_POSITION_BAR_RATIO` in
 * `AdditionalMissionTasks.ts`.
 */
export function getFirePositionBracket(start: Position, bearing: number, barHalf: number): Position[] {
    const featherLength = barHalf * FIRE_POSITION_FEATHER_RATIO;
    const barTop = turf.destination(start, barHalf, bearing - 90, {units: 'meters'});
    const barBottom = turf.destination(start, barHalf, bearing + 90, {units: 'meters'});
    const featherTop = turf.destination(barTop, featherLength, bearing - 135, {units: 'meters'});
    const featherBottom = turf.destination(barBottom, featherLength, bearing + 135, {units: 'meters'});
    return [
        featherTop.geometry.coordinates,
        barTop.geometry.coordinates,
        barBottom.geometry.coordinates,
        featherBottom.geometry.coordinates,
    ];
}

/**
 * AttackByFire symbol — the position bracket at `start` plus one shaft out of
 * the bar's midpoint ending in an open arrowhead. `barHalf` is the bar's
 * half-height in metres; every other dimension is derived from it, so the
 * whole symbol scales uniformly.
 *
 * Returned MultiLineString segments (in order):
 *   0: position bracket  (feather → bar → feather, 4 points)
 *   1: shaft             (start → end)
 *   2: arrowhead         (3 points produced by computeArrowheadPoints at end)
 */
export function getAttackByFireSymbol(base: Position[], barHalf: number): Feature<MultiLineString> {
    const start = base[0];
    const end = base[base.length - 1];
    const bearing = turf.bearing(start, end);
    const arrowhead = computeArrowheadPoints(start, end, barHalf * FIRE_POSITION_ARROWHEAD_RATIO, 45);
    return turf.multiLineString([
        getFirePositionBracket(start, bearing, barHalf),
        [start, end],
        arrowhead,
    ]);
}

/**
 * SupportByFire symbol — the same position bracket, but with two arrows
 * diverging from the *ends* of the bar instead of one shaft from its middle.
 * Each arrow reaches `FIRE_POSITION_ARROW_REACH_RATIO` of the way along the
 * shaft and lands `FIRE_POSITION_ARROW_SPREAD_RATIO` past the bar, so it stops
 * short of the point the user dragged to — see those constants.
 *
 * Returned MultiLineString segments (in order):
 *   0: position bracket  (feather → bar → feather, 4 points)
 *   1: upper arrow line  (barTop → upperTip)
 *   2: upper arrowhead
 *   3: lower arrow line  (barBottom → lowerTip)
 *   4: lower arrowhead
 */
export function getSupportByFireSymbol(base: Position[], barHalf: number): Feature<MultiLineString> {
    const start = base[0];
    const end = base[base.length - 1];
    const bearing = turf.bearing(start, end);
    const bracket = getFirePositionBracket(start, bearing, barHalf);
    const barTop = bracket[1];
    const barBottom = bracket[2];

    // Forward reach measured along the shaft, so the arrows shorten and lengthen
    // with the line the user drew rather than with the bar alone.
    const shaftLength = turf.distance(turf.point(start), turf.point(end), {units: 'meters'});
    const reach = turf.destination(start, shaftLength * FIRE_POSITION_ARROW_REACH_RATIO, bearing, {units: 'meters'});
    const tipOffset = barHalf * (1 + FIRE_POSITION_ARROW_SPREAD_RATIO);
    const upperTip = turf.destination(reach, tipOffset, bearing - 90, {units: 'meters'}).geometry.coordinates;
    const lowerTip = turf.destination(reach, tipOffset, bearing + 90, {units: 'meters'}).geometry.coordinates;
    const headLength = barHalf * FIRE_POSITION_ARROWHEAD_RATIO;

    return turf.multiLineString([
        bracket,
        [barTop, upperTip],
        computeArrowheadPoints(barTop, upperTip, headLength, 45),
        [barBottom, lowerTip],
        computeArrowheadPoints(barBottom, lowerTip, headLength, 45),
    ]);
}

export function getBreachArrow(base: Position[], size: number, topBearingBuffer: number, bottomBearingBuffer: number): Feature<MultiLineString> {
    let offsetBase = computeParallelLineString(base, size);
    let bearing = turf.bearing(offsetBase[0], offsetBase[1]);
    let top = turf.destination(offsetBase[1], size * .75, bearing + topBearingBuffer, {units: 'meters'})
    let bottom = turf.destination(offsetBase[1], size * .75, bearing + bottomBearingBuffer, {units: 'meters'})
    return turf.multiLineString([offsetBase, [top.geometry.coordinates, bottom.geometry.coordinates]]);
}

export function getBypassArrow(base: Position[], size: number): Feature<MultiLineString> {
    let offsetBase = computeParallelLineString(base, size);
    let arrowHeadCoords = computeArrowheadPoints(offsetBase[offsetBase.length - 2], offsetBase[offsetBase.length - 1], Math.abs(size / 2), 45);
    return turf.multiLineString([offsetBase, arrowHeadCoords]);
}

/**
 * 340500's three arrows and the front line they reach.
 *
 * `size` is the **arrow spacing** — how far the outer two sit either side of the middle
 * one. `halfHeight` is how far the front line runs either side of the axis, which APP-06
 * states separately: points 1 and 2 give the height, and the spacing only has to "stay
 * proportional" to it. Passing it lets the caller honour both.
 *
 * Omitted, the front line overhangs the outer arrows by `0.75 * size`, which is what this
 * drew before 2026-09-06 and what a legacy two-point base still gets. 340500's own
 * Template puts that overhang at 0.39 of the spacing, not 0.75. @see Clear
 */
export function getClearGraphic(base: Position[], size: number, halfHeight?: number): Feature<MultiLineString> {
    let topArrow = getBypassArrow(base, -size);
    let bottomArrow = getBypassArrow(base, size);

    let middleArrow = computeArrowheadPoints(base[base.length - 2], base[base.length - 1], size / 2, 45);
    let bearing = turf.bearing(topArrow.geometry.coordinates[0][1], bottomArrow.geometry.coordinates[0][1]);
    const overhang = halfHeight === undefined ? size * .75 : Math.max(halfHeight - Math.abs(size), 0);
    let top = turf.destination(topArrow.geometry.coordinates[0][1], overhang, bearing - 180, {units: 'meters'})
    let bottom = turf.destination(bottomArrow.geometry.coordinates[0][1], overhang, bearing, {units: 'meters'})

    return turf.multiLineString([
        ...topArrow.geometry.coordinates,
        ...bottomArrow.geometry.coordinates,
        base,
        middleArrow,
        [top.geometry.coordinates, bottom.geometry.coordinates],
    ]);

}

export function getPenetrationArrowGraphic(base: Position[], size: number): Feature<MultiLineString> {
    let middleArrow = computeArrowheadPoints(base[base.length - 2], base[base.length - 1], size / 2, 45);
    let bearing = turf.bearing(base[0], base[1]);
    // Front line matches FrontalAttack's ±3×radius span (6×size total),
    // so both graphics read at the same visual weight at the tip.
    const frontHalf = size * 3;
    let top = turf.destination(base[1], frontHalf, bearing + 90, {units: 'meters'})
    let bottom = turf.destination(base[1], frontHalf, bearing - 90, {units: 'meters'})

    return turf.multiLineString([
        base,
        middleArrow,
        [top.geometry.coordinates, bottom.geometry.coordinates],
    ]);

}

export function getExploitationArrowGraphic(base: Position[], size: number): Feature<MultiLineString> {
    let middleArrow = computeArrowheadPoints(base[base.length - 2], base[base.length - 1], size, 45);
    // Fish tail (dashed): twice the main arrowhead size so it reads as a
    // clearly larger backward chevron at the base.
    const tailSize = size * 2;
    let baseArrow = lineStringToDashes(
        computeArrowheadPoints(base[base.length - 1], base[base.length - 2], -tailSize, 45),
        [tailSize / 6, tailSize / 6]
    );

    return turf.multiLineString([
        base,
        middleArrow,
        ...baseArrow.geometry.coordinates
    ]);

}

export function getDisruptGraphic(base: Position[], size: number): Feature<MultiLineString> {
    const p0 = project(base[0]);
    const p1 = project(base[1]);

    // direction vector
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy);

    if (len === 0) {
        throw new Error('Base line must have non-zero length');
    }

    const ux = dx / len;
    const uy = dy / len;

    const px = -uy;
    const py = ux;

    const midpoint = [
        (p0[0] + p1[0]) / 2,
        (p0[1] + p1[1]) / 2
    ];

    // The trident's two outer prongs are a long/short pair straddling the
    // middle one, and which side gets which was swapped on 2026-07-31 at
    // the user's request: the prong on the `-px` side (screen-*upper* for a
    // left-to-right base, despite the `top`/`bottom` variable names, which
    // are named for the perpendicular's sign) is now the long one.
    //
    // The short prong is 25% longer than the naive half-base − size; the
    // long one mirrors it around p1, which is what keeps the three
    // right-end extents linearly spaced and preserves the staggered "rise".
    const ARROW_EXTENSION_FACTOR = 1.25;
    const shortArrowLength = Math.max(size * 0.5, (len / 2 - size) * ARROW_EXTENSION_FACTOR);
    const topArrowLength = shortArrowLength;
    const bottomArrowLength = len - shortArrowLength;

    const topEnd = [
        midpoint[0] + ux * topArrowLength,
        midpoint[1] + uy * topArrowLength
    ];

    const topBase = [
        [
            midpoint[0] - px * size,
            midpoint[1] - py * size
        ],
        [
            topEnd[0] - px * size,
            topEnd[1] - py * size
        ]
    ];

    const topArrow = computeArrowheadPointsProjected(
        topBase[0],
        topBase[1],
        size / 2,
        45
    );

    const bottomEnd = [
        midpoint[0] + ux * bottomArrowLength,
        midpoint[1] + uy * bottomArrowLength
    ];

    const bottomBase = [
        [
            midpoint[0] + px * size,
            midpoint[1] + py * size
        ],
        [
            bottomEnd[0] + px * size,
            bottomEnd[1] + py * size
        ]
    ];

    const bottomArrow = computeArrowheadPointsProjected(
        bottomBase[0],
        bottomBase[1],
        size / 2,
        45
    );

    const middleArrow = computeArrowheadPointsProjected(
        p0,
        p1,
        size / 2,
        45
    );

    const connector = [
        topBase[0],
        midpoint,
        bottomBase[0]
    ];

    return turf.multiLineString([
        topBase.map(unproject),
        topArrow.map(unproject),
        bottomBase.map(unproject),
        bottomArrow.map(unproject),
        base,
        middleArrow.map(unproject),
        connector.map(unproject)
    ]);

}
