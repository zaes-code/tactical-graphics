import {Feature, LineString, Point, Polygon, Position} from 'geojson';
import * as turf from '../turf';
import {getExtendedPoint, getPerpendicularPoint, project, reflectAcrossYAxis, unproject} from './primitives';
import {lineStringToDashes} from './wavesBendsDashes';

/**
 * Generate an arrow head at the end of a line
 * @param start
 * @param end
 * @param arrowHeadLength
 * @param arrowDeg
 */
export function computeArrowheadPoints(start: Position, end: Position, arrowHeadLength: number, arrowDeg: number): Position[] {
    const lineBearing = turf.bearing(start, end);

    // Compute bearings for left and right arrowhead sides
    const leftBearing = lineBearing + 180 - arrowDeg;
    const rightBearing = lineBearing + 180 + arrowDeg;

    // Compute destination points for arrow tips
    const leftPoint = turf.destination(end, arrowHeadLength, leftBearing, {units: "meters"});
    const rightPoint = turf.destination(end, arrowHeadLength, rightBearing, {units: "meters"});

    return [
        leftPoint.geometry.coordinates,
        end,
        rightPoint.geometry.coordinates,
    ];
}

export function computeArrowheadPointsProjected(
    start: number[],
    end: number[],
    arrowHeadLength: number,
    arrowDeg: number
): number[][] {

    // Direction vector
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const len = Math.hypot(dx, dy);

    if (len === 0) {
        throw new Error('Arrow base line has zero length');
    }

    // Unit direction
    const ux = dx / len;
    const uy = dy / len;

    // Reverse direction (equivalent to +180° bearing)
    const rx = -ux;
    const ry = -uy;

    const angle = arrowDeg * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Left side (180 - arrowDeg)
    const lx = cos * rx - sin * ry;
    const ly = sin * rx + cos * ry;

    // Right side (180 + arrowDeg)
    const rx2 = cos * rx + sin * ry;
    const ry2 = -sin * rx + cos * ry;

    return [
        [
            end[0] + lx * arrowHeadLength,
            end[1] + ly * arrowHeadLength
        ],
        end,
        [
            end[0] + rx2 * arrowHeadLength,
            end[1] + ry2 * arrowHeadLength
        ]
    ];
}

export function createArrowHeadPolygon(
    tip: Position,
    dir: Position,        // unit vector pointing *outward*
    arrowSize: number,
): Feature<Polygon> {
    const [ux, uy] = dir;

    let projectedTip = project(tip);

    // perpendicular
    const px = -uy;
    const py = ux;

    const baseX = projectedTip[0] - ux * arrowSize;
    const baseY = projectedTip[1] - uy * arrowSize;

    const halfWidth = arrowSize / 2;

    const left: number[] = [
        baseX + px * halfWidth,
        baseY + py * halfWidth
    ];

    const right: number[] = [
        baseX - px * halfWidth,
        baseY - py * halfWidth
    ];

    return turf.polygon([[projectedTip, left, right, projectedTip].map(unproject)]);
}

export function createMainAttackArrow(baseCoords: Position[], leftArrowBase: Position[], rightArrowBase: Position[], radius: number): Position[] {
    let lastLinePoint = baseCoords[baseCoords.length - 1];
    let secondToLastLinePoint = baseCoords[baseCoords.length - 2];

    const leftArrowHeadBase: Position = getPerpendicularPoint(
        leftArrowBase[leftArrowBase.length - 1],
        leftArrowBase[leftArrowBase.length - 2],
        radius);
    const rightArrowHeadBase: Position = getPerpendicularPoint(
        rightArrowBase[rightArrowBase.length - 1],
        rightArrowBase[rightArrowBase.length - 2],
        -radius,
    );
    let lastLeft = leftArrowBase[leftArrowBase.length - 1];
    let lastRight = rightArrowBase[rightArrowBase.length - 1];

    const arrowTipCoord: Position = getExtendedPoint(lastLinePoint, secondToLastLinePoint, radius);
    const extendedTip: Position = getExtendedPoint(lastLinePoint, secondToLastLinePoint, radius * 0.5);
    return [lastLeft, leftArrowHeadBase, arrowTipCoord, rightArrowHeadBase, lastRight, extendedTip, lastLeft, extendedTip, lastRight];

}

export const createExtendedArrow = (arrowCoords: Position[], size: number, lineBearing: number): Position[] => {
    let arrowOffset = size / 2;
    let insetLength = 0.6;
    let lastLinePoint = arrowCoords[1];
    const leftPoint = turf.destination(arrowCoords[arrowCoords.length - 1], arrowOffset, lineBearing - 90, {units: "meters"});
    const rightPoint = turf.destination(arrowCoords[0], arrowOffset, lineBearing + 90, {units: "meters"});
    const insetPoint = turf.destination(
        lastLinePoint,
        -size * insetLength,
        lineBearing + 180,
        {units: "meters"}
    );
    return [leftPoint.geometry.coordinates, insetPoint.geometry.coordinates, rightPoint.geometry.coordinates];
}

export const createDirectionOfMainAttackArrow = (baseCoords: Position[], size: number,): Position[] => {
    let lastLinePoint = baseCoords[baseCoords.length - 1];
    let secondToLastLinePoint = baseCoords[baseCoords.length - 2];

    let lineBearing = turf.bearing(secondToLastLinePoint, lastLinePoint);
    let arrowCoords = computeArrowheadPoints(secondToLastLinePoint, lastLinePoint, size, 45);
    let extendedArrow = createExtendedArrow(arrowCoords, size, lineBearing);

    return [...arrowCoords, ...extendedArrow, arrowCoords[0]];
}

export const createDirectionOfFeintAttackArrow = (baseCoords: Position[], size: number,): Position[][] => {
    let lastLinePoint = baseCoords[baseCoords.length - 1];
    let secondToLastLinePoint = baseCoords[baseCoords.length - 2];

    let lineBearing = turf.bearing(secondToLastLinePoint, lastLinePoint);
    let arrowCoords = computeArrowheadPoints(secondToLastLinePoint, lastLinePoint, size, 45);

    let mainAttackArrow = createDirectionOfMainAttackArrow(baseCoords, size);
    let feintArrow = lineStringToDashes(
        createExtendedArrow(arrowCoords, size * 1.75, lineBearing),
        [size / 3, size / 3]
    );

    return [mainAttackArrow, ...feintArrow.geometry.coordinates];
}

export function getSearchArrowLine(base: Feature<Point>, centerPadding: number, arrowLength: number, arrowDepth: number): Position[] {

    // We'll use turf.transformTranslate to move from the base point by distances in meters
    const start = turf.transformTranslate(base, centerPadding, 90, {units: 'meters'});
    const next = turf.transformTranslate(base, (2 * arrowLength), 90, {units: 'meters'});
    const diag = turf.transformTranslate(base, (2 * arrowLength - arrowDepth), 90, {units: 'meters'});
    const diagDown = turf.transformTranslate(diag, arrowDepth, 180, {units: 'meters'}); // move "down" (south)
    const final = turf.transformTranslate(base, (2 * arrowLength - arrowDepth + arrowLength), 90, {units: 'meters'});
    const finalDown = turf.transformTranslate(final, arrowDepth, 180, {units: 'meters'});

    // Return raw coordinate list for line geometry
    return [
        start.geometry.coordinates,
        next.geometry.coordinates,
        diagDown.geometry.coordinates,
        finalDown.geometry.coordinates,
    ];
}

/**
 * The default standoff from a symbol's centre to the foot of a search-area arrow, in metres.
 *
 * A field on the old `GeometryService` class rather than a function, and it survived the split
 * only because it is put back here: `geometryService` is a public export, so a member vanishing
 * from it is a breaking change, and this one would have gone without anybody deciding it. It is
 * `getSearchAreaArrow`'s first argument, which is why it sits beside it. Nothing in this
 * repository reads it — a consumer that does still can. @see getSearchAreaArrow
 */
export const arrowCenterPadding = 120;

export const getSearchAreaArrow = (centerPadding: number, arrowLength: number, arrowDepth: number, arrowHeadLength: number, arrowHeadDegree: number): Position[][] => {
    let base = turf.point([0, 0]);
    let arrowCoords = getSearchArrowLine(base, centerPadding, arrowLength, arrowDepth);
    let arrowHeadCoords = computeArrowheadPoints(arrowCoords[arrowCoords.length - 2], arrowCoords[arrowCoords.length - 1], arrowHeadLength, arrowHeadDegree);
    let rightArrow = [arrowCoords, arrowHeadCoords];
    let leftArrow = reflectAcrossYAxis(turf.multiLineString(rightArrow), 0);
    return [...rightArrow, ...leftArrow.geometry.coordinates];
};

/**
 * @param mirrored Hangs the hook on the other side of the line.
 *
 * Expressed as a multiplier on the bearing-relative offsets, never as a compass test.
 * An earlier version flipped on `end[0] >= start[0]`, which pinned the hook to a
 * compass direction: rotating the graphic turned the base line and the arrowhead —
 * both derived from the coordinates — while the hook stayed put. Everything here
 * stays relative to the line's own bearing so the side survives rotation.
 */
export const getCaneArrow = (base: Feature<LineString>, caneSize: number, arrowSize: number, mirrored = false) => {
    let baseCoords = base.geometry.coordinates;
    // **A single click is a draw in progress, not a symbol.** Without this the seven cane
    // arrows threw `coord is required` out of `turf.bearing` on the first click of every
    // draw — invisible, because the renderer swallows it, but it meant "nothing is drawn
    // yet" was an exception rather than an answer. 344000 returns an empty geometry there;
    // this makes the family agree. (2026-09-06.)
    if (baseCoords.length < 2) return turf.multiLineString([]);
    let start = baseCoords[0];
    let end = baseCoords[1];

    // The half-circle "cane" hangs off `start`, opposite the arrow tip, so
    // the symbol reads "C___>" whichever way the line runs.
    //
    // Everything here is expressed **relative to the line's bearing**. It
    // used to be absolute — the arc's center was pinned due north of `start`
    // and the sweep used fixed compass bearings, with an `end[0] >= start[0]`
    // test to flip it east/west. That held the hook at a fixed compass
    // orientation, so rotating the graphic turned the base line and the
    // arrowhead (both derived from the coordinates) while the hook stayed
    // put. The east/west flip and the matching `.reverse()` are gone with it:
    // once the construction follows the bearing, the hook lands on the
    // correct side on its own, and the arc already starts at `start`.
    //
    // Center sits one radius off the line at `start`; the arc sweeps the half
    // that bulges backwards, away from the tip. Its far end is the free point
    // the holder uses as the offset (width) handle.
    const bearing = turf.bearing(start, end);
    // The center sits one radius off the line, on whichever side the user chose.
    const side = mirrored ? 1 : -1;
    const center = turf.destination(turf.point(start), arrowSize, bearing + side * 90, {units: 'meters'});

    // `lineArc` sweeps clockwise from the first bearing to the second, so the mirror is
    // not "negate both ends" — that asks for a backwards sweep and returns a different,
    // smaller segment. It is the same 180 degrees taken from the opposite start, then
    // reversed so the arc still *begins* at `start`: its far end is the point the holder
    // uses as the offset handle, and swapping the ends would move the handle.
    const arc = mirrored
        ? turf.lineArc(center, arrowSize, bearing - 270, bearing - 90, {units: 'meters'})
        : turf.lineArc(center, arrowSize, bearing + 90, bearing + 270, {units: 'meters'});
    let arcCoords = mirrored ? [...arc.geometry.coordinates].reverse() : arc.geometry.coordinates;

    let arrowHeadCoords = computeArrowheadPoints(start, end, Math.abs(arrowSize), 45);
    return turf.multiLineString([baseCoords, arrowHeadCoords, arcCoords]);
}

export function getBlockArrow(base: Feature<LineString>, blockArrowSize: number): Feature<LineString> {
    let bearing = turf.bearing(base.geometry.coordinates[0], base.geometry.coordinates[1]);
    let top = turf.destination(base.geometry.coordinates[1], blockArrowSize, bearing + 90, {units: 'meters'})
    let bottom = turf.destination(base.geometry.coordinates[1], blockArrowSize, bearing - 90, {units: 'meters'})
    return turf.lineString([...base.geometry.coordinates, top.geometry.coordinates, bottom.geometry.coordinates]);
}
