import {Position} from 'geojson';
import {Coordinate} from '../type';
import * as turf from '../turf';

export function createCircularArc(centroid: number[], rotation: number, scale: number, startAngleDeg: number, endAngleDeg: number, steps = 64): Position[] {
    const coords: Position[] = [];
    const totalAngle = endAngleDeg - startAngleDeg;
    const angleStep = totalAngle / steps;

    for (let i = 0; i <= steps; i++) {
        const planarAngleDeg = startAngleDeg + i * angleStep + rotation;
        let bearingDeg = 90 - planarAngleDeg;
        if (bearingDeg < 0) bearingDeg += 360;

        const point = turf.destination(centroid, scale, bearingDeg, {units: "meters"});
        coords.push(point.geometry.coordinates);
    }

    return coords;
}

export function arcMidpoint(centroid: Coordinate, rotation: number, scale: number, startDeg: number, endDeg: number): Position {
    // Normalize angles
    const normalizedStart = startDeg % 360;
    let normalizedEnd = endDeg % 360;
    if (normalizedEnd < normalizedStart) normalizedEnd += 360;

    // Mid-angle in degrees + rotation
    const midDeg = (normalizedStart + normalizedEnd) / 2 + rotation;

    // Convert planar CCW-from-east to Turf CW-from-north
    let bearing = 90 - midDeg;
    if (bearing < 0) bearing += 360;

    // Distance from centroid to arc = scaleMeters
    const midPoint = turf.destination(centroid, scale / 1000, bearing, {units: "kilometers"});

    return midPoint.geometry.coordinates;
}

export function generateRadialLineStrings(
    centroid: Coordinate,
    rotation: number,
    scale: number,
    startDeg: number,
    endDeg: number,
    lineLength: number,
    numLines: number,
    gapDeg: number = 2,
): Position[][] {
    const lines: Position[][] = [];
    const totalArc = endDeg - startDeg;
    const totalGap = (numLines - 1) * gapDeg;
    const effectiveArc = totalArc - totalGap;

    if (effectiveArc <= 0) {
        console.warn("Not enough arc space for lines given the gap.");
        return [];
    }

    const segmentDeg = effectiveArc / numLines;
    const segmentWithGap = segmentDeg + gapDeg;

    for (let i = 0; i < numLines; i++) {
        const baseStartDeg = startDeg + i * segmentWithGap;
        const baseEndDeg = baseStartDeg + segmentDeg;

        // Midpoint along arc base
        const mid = arcMidpoint(centroid, rotation, scale, baseStartDeg, baseEndDeg);

        // Bearing from centroid to midpoint
        const bearingToMid = turf.bearing(centroid, mid);

        // Tip of the radial line = extend from midpoint along same bearing
        const tip = turf.destination(mid, lineLength / 1000, bearingToMid, {units: "kilometers"});

        lines.push([tip.geometry.coordinates, mid]);
    }

    return lines;
}

export function generateArcTrianglesWithGap(
    centroid: Position,
    scale: number,
    rotation: number,
    startDeg: number,
    endDeg: number,
    triangleHeight: number,
    numTriangles: number,
    gapDeg: number = 15, // gap between triangles.
    asPolygon: boolean = false,
): Position[][] {
    const triangles: Position[][] = [];

    const totalArc = endDeg - startDeg;
    const totalGap = (numTriangles - 1) * gapDeg;
    const effectiveArc = totalArc - totalGap;

    if (effectiveArc <= 0) {
        console.warn("Not enough arc space for triangles given the gap.");
        return [];
    }

    const triangleArcDeg = effectiveArc / numTriangles;
    const triangleWithGapDeg = triangleArcDeg + gapDeg;

    for (let i = 0; i < numTriangles; i++) {
        const baseStartDeg = startDeg + i * triangleWithGapDeg;
        const baseEndDeg = baseStartDeg + triangleArcDeg;

        // Convert planar CCW-from-east angle to Turf CW-from-north bearing
        const angle1Deg = 90 - (baseStartDeg + rotation);
        const angle2Deg = 90 - (baseEndDeg + rotation);

        const p1 = turf.destination(centroid, scale / 1000, angle1Deg, {units: "kilometers"}).geometry.coordinates;
        const p2 = turf.destination(centroid, scale / 1000, angle2Deg, {units: "kilometers"}).geometry.coordinates;

        const apex = computeIsoscelesApexPoint(p1, p2, triangleHeight, centroid);
        let triangleCoords = [p1, apex, p2];
        if (asPolygon) triangleCoords.push(p1);
        triangles.push(triangleCoords);
    }

    return triangles;
}

export function computeIsoscelesApexPoint(p1: Position, p2: Position, height: number, centroid: Position): Position {
    // Midpoint of the base
    const midpoint = turf.midpoint(p1, p2);

    // Perpendicular bearing toward the centroid
    const perpBearing = turf.bearing(midpoint, centroid); // points toward centroid

    // Apex point at distance = height along perpendicular
    const apex = turf.destination(midpoint, height / 1000, perpBearing, {units: "kilometers"});

    return apex.geometry.coordinates;
}
