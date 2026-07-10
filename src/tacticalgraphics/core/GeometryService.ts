import {Feature, LineString, MultiLineString, Point, Polygon, Position} from 'geojson';
import {Coordinate} from './type';
import * as turf from '@turf/turf';

const EARTH_RADIUS_METERS = 6378137;

class GeometryService {
    arrowCenterPadding: number = 120;

    /**
     * Rotate a feature around a given center
     */
    rotate<T extends Point | LineString | Polygon>(
        feature: Feature<T>,
        angle: number,
        center?: Position
    ): Feature<T> {
        return turf.transformRotate(feature, angle, {pivot: center});
    }

    /**
     * Translate a feature by given x/y delta (in meters)
     */
    translate<T extends Point | LineString | Polygon>(
        feature: Feature<T>,
        distance: number,
        bearing: number,
    ): Feature<T> {
        return turf.transformTranslate(feature, distance, bearing);
    }

    /**
     * Scale a feature relative to a center point
     */
    scale<T extends Point | LineString | Polygon>(
        feature: Feature<T>,
        factor: number,
        center?: Position
    ): Feature<T> {
        return turf.transformScale(feature, factor, {origin: center});
    }

    /**
     * Get the geometric center of a feature (used for rotations/scaling)
     */
    getCenter<T extends Point | LineString | Polygon>(feature: Feature<T>): Position {
        const geom = feature.geometry;

        switch (geom.type) {
            case 'Point':
                return geom.coordinates;

            case 'LineString': {
                // Use the first point
                return geom.coordinates[0];
            }

            case 'Polygon': {
                // Use centroid for geometric balance (not bbox center)
                const centroid = turf.centroid(turf.polygon(geom.coordinates));
                return centroid.geometry.coordinates;
            }

            default:
                throw new Error(`Unsupported geometry type: ${geom}`);
        }
    }

    createCircle = (center: number[], radius: number): number[][][] => {
        var options = {steps: 60, units: "meters", properties: {foo: "bar"}};
        return turf.circle(center, radius, <any>options).geometry.coordinates;
    }

    toRadians = (deg: number) => (deg * Math.PI) / 180;

    createCircularArc(centroid: number[], rotation: number, scale: number, startAngleDeg: number, endAngleDeg: number, steps = 64): Position[] {
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

    calculateLineAngle(start: number[], end: number[]) {
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        return Math.atan2(dy, dx);
    }

    /**
     * Generate an arrow head at the end of a line
     * @param start
     * @param end
     * @param arrowHeadLength
     * @param arrowDeg
     */
    computeArrowheadPoints(start: Position, end: Position, arrowHeadLength: number, arrowDeg: number): Position[] {
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

    /**
     * Transforms a LineString into a wave of semicircles
     * @param {Object} lineString - Turf.js LineString feature or geometry
     * @param targetWavelength
     * @param amplitude
     * @param steps
     * @returns {Object} Turf.js LineString feature with semicircle wave
     */
    lineStringToWave(lineString: Feature<LineString>, targetWavelength = 5, amplitude: number, steps: number, flipDirection = false) {

        // Extract coordinates from the lineString
        const coords = turf.getCoords(lineString);

        if (coords.length < 2) {
            throw new Error('LineString must have at least 2 points');
        }

        // Calculate total length of the line
        const totalLength = turf.length(lineString, {units: 'meters'});

        // Dynamically calculate number of waves based on line length
        // This keeps the wave shape consistent regardless of line length
        const numWaves = Math.max(1, Math.round(totalLength / targetWavelength));

        // Calculate actual wavelength (distance per semicircle)
        const wavelength = totalLength / numWaves;

        // Calculate amplitude if not provided (20% of wavelength)
        const amp = amplitude || wavelength * 0.2;

        // Generate wave coordinates
        const waveCoords = [];

        for (let i = 0; i <= numWaves; i++) {
            // Position along the original line (0 to 1)
            const t = i / numWaves;

            // Get point along the line at this position
            const pointAlong = turf.along(lineString, t * totalLength, {units: 'meters'});

            // Add the start point of each wave
            waveCoords.push(turf.getCoord(pointAlong));

            // Generate semicircle between this point and the next (except for last point)
            if (i < numWaves) {
                const nextT = (i + 1) / numWaves;
                const nextPoint = turf.along(lineString, nextT * totalLength, {units: 'meters'});

                // Get bearing between the two points
                const bearing = turf.bearing(pointAlong, nextPoint);

                // Create semicircle arc
                const arcCoords = this.createSemicircle(
                    turf.getCoord(pointAlong),
                    turf.getCoord(nextPoint),
                    bearing,
                    amp,
                    steps,
                    flipDirection
                );

                // Add arc points (skip first point as it's already added)
                waveCoords.push(...arcCoords.slice(1));
            }
        }
        return turf.lineString(waveCoords);

    }

    /**
     * Creates a semicircle arc between two points
     * @param {Array} start - Start coordinate [lon, lat]
     * @param {Array} end - End coordinate [lon, lat]
     * @param {number} bearing - Bearing from start to end
     * @param {number} amplitude - Height of the semicircle
     * @param {number} steps - Number of points in the arc
     * @returns {Array} Array of coordinates forming the semicircle
     */
    createSemicircle(start: Position, end: Position, bearing: number, amplitude: number, steps: number, flipDirection = false) {
        const arcCoords = [start];

        // Calculate distance between start and end
        const distance = turf.distance(start, end, {units: 'meters'});

        // Perpendicular bearing: left (-90) or right (+90)
        const perpBearing = flipDirection ? bearing + 90 : bearing - 90;

        for (let i = 1; i < steps; i++) {
            // Parameter along the chord (0 to 1)
            const t = i / steps;

            // Point along the straight line from start to end
            const basePoint = turf.along(
                turf.lineString([start, end]),
                t * distance,
                {units: 'meters'}
            );

            // Calculate height offset using semicircle formula
            // y = sqrt(r^2 - x^2) where r = distance/2, x = distance from center
            const x = (t - 0.5) * distance; // Distance from center
            const radius = distance / 2;
            const circleHeight = Math.sqrt(Math.max(0, radius * radius - x * x));

            // Scale by amplitude factor
            const offset = (circleHeight / radius) * amplitude;

            // Move the base point perpendicular to the line
            const arcPoint = turf.destination(
                turf.getCoord(basePoint),
                offset,
                perpBearing,
                {units: 'meters'}
            );

            arcCoords.push(turf.getCoord(arcPoint));
        }

        arcCoords.push(end);

        return arcCoords;
    }

    translateCoordinates = (coordinate: Coordinate, scale: number, rotation: number) => {
        // Convert planar rotation → geodesic bearing
        let bearingDeg = 90 - (rotation * 180) / Math.PI;
        if (bearingDeg < 0) bearingDeg += 360;

        // Convert meters → kilometers for Turf
        const distanceKm = scale / 1000;

        // Compute destination using Turf
        const destination = turf.destination(coordinate, distanceKm, bearingDeg, {
            units: "kilometers",
        });

        return destination.geometry.coordinates;
    };

    arcMidpoint(centroid: Coordinate, rotation: number, scale: number, startDeg: number, endDeg: number): Position {
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

    generateRadialLineStrings(
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
            const mid = this.arcMidpoint(centroid, rotation, scale, baseStartDeg, baseEndDeg);

            // Bearing from centroid to midpoint
            const bearingToMid = turf.bearing(centroid, mid);

            // Tip of the radial line = extend from midpoint along same bearing
            const tip = turf.destination(mid, lineLength / 1000, bearingToMid, {units: "kilometers"});

            lines.push([tip.geometry.coordinates, mid]);
        }

        return lines;
    }

    generateArcTrianglesWithGap(
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

            const apex = this.computeIsoscelesApexPoint(p1, p2, triangleHeight, centroid);
            let triangleCoords = [p1, apex, p2];
            if (asPolygon) triangleCoords.push(p1);
            triangles.push(triangleCoords);
        }

        return triangles;
    }

    computeIsoscelesApexPoint(p1: Position, p2: Position, height: number, centroid: Position): Position {
        // Midpoint of the base
        const midpoint = turf.midpoint(p1, p2);

        // Perpendicular bearing toward the centroid
        const perpBearing = turf.bearing(midpoint, centroid); // points toward centroid

        // Apex point at distance = height along perpendicular
        const apex = turf.destination(midpoint, height / 1000, perpBearing, {units: "kilometers"});

        return apex.geometry.coordinates;
    }

    /**
     * Generates a dynamic, symmetrically-spaced number of isosceles triangles
     * along the exterior edges of a polygon, ensuring continuous spacing
     * across all vertices.
     * * @param polygonRings The coordinates of the polygon as an array of rings (Position[][]).
     * @param triangleWidth The base width of the triangle (distance along the edge) in meters.
     * @param triangleHeight The height of the triangle (distance from base to apex) in meters.
     * @param gap The desired gap distance between the base of adjacent triangles in meters.
     * @param outward If true, triangles point outward from the polygon (default); otherwise, they point inward.
     * @returns An array of triangle polygons, where each triangle is [p1, apex, p2].
     */
    public generatePolygonTriangles(
        polygonRings: Position[][],
        triangleWidth: number,
        triangleHeight: number,
        gap: number,
        outward: boolean = true,
    ): Position[][] {
        if (!polygonRings || polygonRings.length === 0) {
            console.warn("Input polygon has no rings.");
            return [];
        }
        const exteriorRing = polygonRings[0];
        const numVertices = exteriorRing.length;
        const allTriangles: Position[][] = [];

        // 1. Calculate Total Perimeter Length and Segment Lengths (Global Calculation)
        const segmentLengthsMeters: number[] = [];
        let totalPerimeter = 0;

        // We only iterate (numVertices - 1) segments, since the last point is the same as the first.
        for (let i = 0; i < numVertices - 1; i++) {
            const pStart = exteriorRing[i];
            const pEnd = exteriorRing[i + 1];

            const segmentLine = turf.lineString([pStart, pEnd]);
            const lengthKm = turf.length(segmentLine, {units: 'kilometers'});
            const lengthM = lengthKm * 1000;

            segmentLengthsMeters.push(lengthM);
            totalPerimeter += lengthM;
        }

        // 2. Global Spacing Calculation
        const unitLength = triangleWidth + gap; // length of one triangle base + one gap

        // Calculate the maximum number of full units that fit around the whole perimeter.
        const N_total = Math.floor((totalPerimeter + gap) / unitLength);

        if (N_total <= 0) {
            return [];
        }

        // Recalculate Effective Gap for perfect symmetry around the entire perimeter
        const totalBaseLength = N_total * triangleWidth;
        const totalGapSpace = totalPerimeter - totalBaseLength;

        // The total gap space is distributed among N_total slots (gap after each triangle).
        const effectiveGap = totalGapSpace / N_total;

        if (effectiveGap < 0) {
            console.warn("Negative effective gap. Check input values.");
            return [];
        }

        // 3. Sequential Triangle Generation along the Perimeter
        let currentPerimeterDistance = 0; // Tracks the distance along the whole polygon perimeter

        for (let i = 0; i < numVertices - 1; i++) {
            const pStart = exteriorRing[i];
            const pEnd = exteriorRing[i + 1];
            const segmentLength = segmentLengthsMeters[i];

            // Calculate where the first triangle *could* start on this segment
            const segmentStartMod = currentPerimeterDistance % unitLength;

            // The starting point for the first triangle base on this segment (relative to pStart).
            let baseStartDistRel = (unitLength - segmentStartMod) % unitLength;

            // If we're starting at position 0, we need to account for the gap
            if (baseStartDistRel === 0) {
                baseStartDistRel = effectiveGap;
            }

            // Loop to generate all triangles that fit on the current segment
            while (true) {
                const baseEndDistRel = baseStartDistRel + triangleWidth;

                // Check if the current triangle base exceeds the segment length
                if (baseEndDistRel > segmentLength) {
                    break; // Move to the next segment
                }

                // Generate the triangle using linear interpolation for precision
                const segmentTriangles = this.generateSingleTriangleLinear(
                    pStart,
                    pEnd,
                    segmentLength,
                    baseStartDistRel,
                    triangleWidth,
                    triangleHeight,
                    outward
                );

                allTriangles.push(segmentTriangles);

                // Advance the starting point for the next triangle base
                baseStartDistRel += triangleWidth + effectiveGap;
            }

            // Update the total distance traveled
            currentPerimeterDistance += segmentLength;
        }

        return allTriangles;
    }

    generateToothedPolygonFromTriangles(
        polygonRings: Position[][],
        triangleWidth: number,
        triangleHeight: number,
        gap: number,
        outward: boolean = true
    ): Position[][] {

        if (!polygonRings || polygonRings.length === 0) {
            console.warn("Input polygon has no rings.");
            return [];
        }

        const exteriorRing = polygonRings[0];
        const numVertices = exteriorRing.length;
        const newRing: Position[] = [];

        // ---- 1. Compute segment lengths & total perimeter ----
        const segmentLengthsMeters: number[] = [];
        let totalPerimeter = 0;

        for (let i = 0; i < numVertices - 1; i++) {
            const seg = turf.lineString([
                exteriorRing[i],
                exteriorRing[i + 1]
            ]);

            const lengthM = turf.length(seg, {units: "kilometers"}) * 1000;
            segmentLengthsMeters.push(lengthM);
            totalPerimeter += lengthM;
        }

        // ---- 2. Global spacing logic (same as your triangle generator) ----
        const unitLength = triangleWidth + gap;
        const N = Math.floor((totalPerimeter + gap) / unitLength);

        if (N <= 0) return [];

        const totalBaseLength = N * triangleWidth;
        const totalGapSpace = totalPerimeter - totalBaseLength;
        const effectiveGap = totalGapSpace / N;

        if (effectiveGap < 0) {
            console.warn("Negative effective gap.");
            return [];
        }

        // ---- 3. Walk the polygon & insert teeth ----
        let currentPerimeterDistance = 0;

        for (let i = 0; i < numVertices - 1; i++) {
            const pStart = exteriorRing[i];
            const pEnd = exteriorRing[i + 1];
            const segmentLength = segmentLengthsMeters[i];

            // Always add first point once
            if (newRing.length === 0) {
                newRing.push(pStart);
            }

            const segmentStartMod = currentPerimeterDistance % unitLength;
            let baseStartDistRel = (unitLength - segmentStartMod) % unitLength;

            if (baseStartDistRel === 0) {
                baseStartDistRel = effectiveGap;
            }

            const cornerBuffer = triangleWidth * 0.2;

            while (true) {
                const baseEndDistRel = baseStartDistRel + triangleWidth;

                // --- skip teeth too close to the start corner ---
                if (baseStartDistRel < cornerBuffer) {
                    baseStartDistRel += triangleWidth + effectiveGap;
                    continue;
                }

                // --- skip teeth too close to the end corner ---
                if (baseEndDistRel > segmentLength - cornerBuffer) {
                    break;
                }

                const [p1, apex, p2] = this.generateSingleTriangleLinear(
                    pStart,
                    pEnd,
                    segmentLength,
                    baseStartDistRel,
                    triangleWidth,
                    triangleHeight,
                    outward
                );

                newRing.push(p1, apex, p2);

                baseStartDistRel += triangleWidth + effectiveGap;
            }

            // Add segment end if it isn't already there
            const last = newRing[newRing.length - 1];
            if (last[0] !== pEnd[0] || last[1] !== pEnd[1]) {
                newRing.push(pEnd);
            }

            currentPerimeterDistance += segmentLength;
        }

        // ---- 4. Close the polygon ring ----
        newRing.push(newRing[0]);

        return [newRing];
    }

    generateToothedLineStringFromTriangles(
        lineCoords: Position[],
        triangleWidth: number,
        triangleHeight: number,
        gap: number,
        outward: boolean = true
    ): Position[] {

        if (!lineCoords || lineCoords.length < 2) {
            console.warn("LineString must have at least 2 points.");
            return [];
        }

        const numVertices = lineCoords.length;
        const newLine: Position[] = [];

        // ---- 1. Segment lengths & total length ----
        const segmentLengthsMeters: number[] = [];
        let totalLength = 0;

        for (let i = 0; i < numVertices - 1; i++) {
            const seg = turf.lineString([
                lineCoords[i],
                lineCoords[i + 1]
            ]);

            const lengthM = turf.length(seg, {units: "kilometers"}) * 1000;
            segmentLengthsMeters.push(lengthM);
            totalLength += lengthM;
        }

        // ---- 2. Spacing logic ----
        const unitLength = triangleWidth + gap;
        const N = Math.floor((totalLength + gap) / unitLength);

        if (N <= 0) return lineCoords.slice();

        const totalBaseLength = N * triangleWidth;
        const totalGapSpace = totalLength - totalBaseLength;
        const effectiveGap = totalGapSpace / N;

        if (effectiveGap < 0) return lineCoords.slice();

        // ---- 3. Walk the line ----
        let currentDistance = 0;

        for (let i = 0; i < numVertices - 1; i++) {
            const pStart = lineCoords[i];
            const pEnd = lineCoords[i + 1];
            const segmentLength = segmentLengthsMeters[i];

            if (newLine.length === 0) {
                newLine.push(pStart);
            }

            const segmentStartMod = currentDistance % unitLength;
            let baseStartDistRel = (unitLength - segmentStartMod) % unitLength;

            if (baseStartDistRel === 0) {
                baseStartDistRel = effectiveGap;
            }
            const cornerBuffer = triangleWidth * 0.6;

            while (true) {
                const baseEndDistRel = baseStartDistRel + triangleWidth;

                // --- skip teeth too close to the start corner ---
                if (baseStartDistRel < cornerBuffer) {
                    baseStartDistRel += triangleWidth + effectiveGap;
                    continue;
                }

                // --- skip teeth too close to the end corner ---
                if (baseEndDistRel > segmentLength - cornerBuffer) {
                    break;
                }

                const [p1, apex, p2] = this.generateSingleTriangleLinear(
                    pStart,
                    pEnd,
                    segmentLength,
                    baseStartDistRel,
                    triangleWidth,
                    triangleHeight,
                    outward
                );

                newLine.push(p1, apex, p2);
                baseStartDistRel += triangleWidth + effectiveGap;
            }

            const last = newLine[newLine.length - 1];
            if (last[0] !== pEnd[0] || last[1] !== pEnd[1]) {
                newLine.push(pEnd);
            }

            currentDistance += segmentLength;
        }

        return newLine;
    }

    generateFixGraphic(
        lineCoords: Position[], // Always [pStart, pEnd]
        triangleWidth: number,
        triangleHeight: number,
        gap: number,
        firstSegmentLength?: number
    ): Position[] {
        const pStart = lineCoords[0];
        const pEnd = lineCoords[1];

        // 1. Calculate segment metrics
        const seg = turf.lineString([pStart, pEnd]);
        const segmentLength = turf.length(seg, {units: "kilometers"}) * 1000;

        // 2. Place the three triangles. By default the leading and trailing
        //    segments are equal; when `firstSegmentLength` is provided the
        //    first segment is forced to that length and the remainder of the
        //    line becomes the trailing segment.
        const totalContentWidth = (3 * triangleWidth) + (2 * gap);
        let currentDistRel = firstSegmentLength !== undefined
            ? firstSegmentLength
            : (segmentLength - totalContentWidth) / 2;

        const newLine: Position[] = [pStart];

        // 3. Generate 3 alternating triangles
        for (let i = 0; i < 3; i++) {
            // Toggle direction: i=0 (true), i=1 (false), i=2 (true)
            const isOutward = (i % 2 === 0);

            const [p1, apex, p2] = this.generateSingleTriangleLinear(
                pStart,
                pEnd,
                segmentLength,
                currentDistRel,
                triangleWidth,
                triangleHeight,
                isOutward
            );

            newLine.push(p1, apex, p2);

            // Move to the start of the next triangle, including the gap
            currentDistRel += triangleWidth + gap;
        }

        newLine.push(pEnd);
        return newLine;
    }

    bendLine(
        lineCoords: Position[], // [pStart, pEnd]
        resolution: number,     // meters per unit (caller-defined)
        bendFactor: number = 40,
        segments: number = 32
    ): Position[] {
        const [pStart, pEnd] = lineCoords;

        // 1. Segment metrics (meters)
        const segment = turf.lineString([pStart, pEnd]);
        const segmentLength =
            turf.length(segment, {units: 'kilometers'}) * 1000;

        if (segmentLength === 0) {
            return [pStart, pEnd];
        }

        // 2. Visual bend size (same role as triangleWidth, gap, etc.)
        const bendDistanceMeters = resolution * bendFactor;

        // 3. Midpoint along the segment
        const midPoint = turf.along(
            segment,
            segmentLength / 2 / 1000,
            {units: 'kilometers'}
        );

        // 4. Perpendicular control point
        const baseBearing = turf.bearing(
            turf.point(pStart),
            turf.point(pEnd)
        );

        const control = turf.destination(
            midPoint,
            bendDistanceMeters / 1000,
            baseBearing + 90,
            {units: 'kilometers'}
        );

        const [cx, cy] = control.geometry.coordinates;
        const [x1, y1] = pStart;
        const [x2, y2] = pEnd;

        // 5. Quadratic Bézier sampling (geographic-safe)
        const line: Position[] = [];

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;

            const x =
                (1 - t) * (1 - t) * x1 +
                2 * (1 - t) * t * cx +
                t * t * x2;

            const y =
                (1 - t) * (1 - t) * y1 +
                2 * (1 - t) * t * cy +
                t * t * y2;

            line.push([x, y]);
        }

        return line;
    }

    /**
     * Generates triangles along a MultiLineString, treating it as if it were a continuous polygon.
     * This is useful when you've broken a polygon into multiple linestrings (e.g., for adding gaps/labels)
     * but want to maintain the same triangle spacing as if the polygon were intact.
     *
     * @param multiLineStringCoords Array of linestring coordinates (Position[][]), where each linestring is a Position[]
     * @param triangleWidth The base width of the triangle (distance along the edge) in meters.
     * @param triangleHeight The height of the triangle (distance from base to apex) in meters.
     * @param gap The desired gap distance between the base of adjacent triangles in meters.
     * @param outward If true, triangles point outward from the polygon (default); otherwise, they point inward.
     * @returns An array of triangle polygons, where each triangle is [p1, apex, p2, p1].
     */
    public generateMultiLineStringTriangles(
        multiLineStringCoords: Position[][],
        triangleWidth: number,
        triangleHeight: number,
        gap: number,
        outward: boolean = true
    ): Position[][] {
        if (!multiLineStringCoords || multiLineStringCoords.length === 0) {
            console.warn("Input MultiLineString has no linestrings.");
            return [];
        }

        const allTriangles: Position[][] = [];

        // 1. Calculate total length across all linestrings and store segment info
        interface SegmentInfo {
            lineStringIndex: number;
            segmentIndex: number;
            pStart: Position;
            pEnd: Position;
            lengthMeters: number;
        }

        const segments: SegmentInfo[] = [];
        let totalLength = 0;

        // Process each linestring
        for (let lsIndex = 0; lsIndex < multiLineStringCoords.length; lsIndex++) {
            const lineString = multiLineStringCoords[lsIndex];

            if (lineString.length < 2) {
                console.warn(`LineString ${lsIndex} has fewer than 2 points, skipping.`);
                continue;
            }

            // Process each segment within the linestring
            for (let i = 0; i < lineString.length - 1; i++) {
                const pStart = lineString[i];
                const pEnd = lineString[i + 1];

                const segmentLine = turf.lineString([pStart, pEnd]);
                const lengthKm = turf.length(segmentLine, {units: 'kilometers'});
                const lengthM = lengthKm * 1000;

                segments.push({
                    lineStringIndex: lsIndex,
                    segmentIndex: i,
                    pStart,
                    pEnd,
                    lengthMeters: lengthM
                });

                totalLength += lengthM;
            }
        }

        if (segments.length === 0) {
            console.warn("No valid segments found in MultiLineString.");
            return [];
        }

        // 2. Global Spacing Calculation (treat as closed polygon)
        const unitLength = triangleWidth + gap;

        // Calculate as if this were a closed polygon
        const N_total = Math.floor((totalLength + gap) / unitLength);

        if (N_total <= 0) {
            return [];
        }

        // Recalculate Effective Gap for perfect symmetry
        const totalBaseLength = N_total * triangleWidth;
        const totalGapSpace = totalLength - totalBaseLength;
        const effectiveGap = totalGapSpace / N_total;

        if (effectiveGap < 0) {
            console.warn("Negative effective gap. Check input values.");
            return [];
        }

        // 3. Sequential Triangle Generation across all segments
        let currentPathDistance = 0;
        const initialOffset = effectiveGap; // Start with gap like closed polygon

        for (const segment of segments) {
            const {pStart, pEnd, lengthMeters: segmentLength} = segment;

            // Calculate where the first triangle *could* start on this segment
            const segmentStartMod = (currentPathDistance + initialOffset) % unitLength;
            let baseStartDistRel = (unitLength - segmentStartMod) % unitLength;

            // For the first segment, account for the initial gap
            if (currentPathDistance === 0 && baseStartDistRel === 0) {
                baseStartDistRel = effectiveGap;
            }

            // Loop to generate all triangles that fit on the current segment
            while (true) {
                const baseEndDistRel = baseStartDistRel + triangleWidth;

                // Check if the current triangle base exceeds the segment length
                if (baseEndDistRel > segmentLength) {
                    break; // Move to the next segment
                }

                // Generate the triangle
                const triangle = this.generateSingleTriangleLinear(
                    pStart,
                    pEnd,
                    segmentLength,
                    baseStartDistRel,
                    triangleWidth,
                    triangleHeight,
                    outward
                );

                allTriangles.push(triangle);

                // Advance the starting point for the next triangle base
                baseStartDistRel += triangleWidth + effectiveGap;
            }

            // Update the total distance traveled
            currentPathDistance += segmentLength;
        }

        return allTriangles;
    }

    generateLabelGaps(
        polygon: Polygon,
        options: {
            rotationRad: number;
            gapSize: number; // map units
        }
    ): {
        outlineSegments: Position[][];
        labelPoints: Position[];
    } {

        // 1. Extract the exterior ring coordinates (handle both Feature and raw Geometry input)
        const coords = polygon.coordinates;
        const ring = coords[0];

        if (!ring || ring.length < 3) {
            return {outlineSegments: [], labelPoints: []};
        }

        // 2. Setup the rotation unit vector
        const unitRot: [number, number] = [
            Math.cos(options.rotationRad),
            Math.sin(options.rotationRad),
        ];

        /* -----------------------------------
         * 1) Find opposite segments
         * ----------------------------------- */
        let maxProj = -Infinity;
        let minProj = Infinity;
        let maxIdx = -1;
        let minIdx = -1;

        // 3. Iterate over all segments to find the ones defining the extent along the rotation axis
        for (let i = 0; i < ring.length - 1; i++) {
            const p1 = ring[i];
            const p2 = ring[i + 1];

            // Cartesian Midpoint: essential for planar map units
            const midX = (p1[0] + p2[0]) / 2;
            const midY = (p1[1] + p2[1]) / 2;

            // Scalar projection of the midpoint onto the rotation axis
            const projection = midX * unitRot[0] + midY * unitRot[1];

            if (projection > maxProj) {
                maxProj = projection;
                maxIdx = i;
            }
            if (projection < minProj) {
                minProj = projection;
                minIdx = i;
            }
        }

        // 4. Handle cases where opposite segments couldn't be found
        if (maxIdx === minIdx || maxIdx === -1 || minIdx === -1) {
            // Return the full closed outline as separate segments
            const outline = ring.slice(0, -1).map((p: any, i: number) => [p, ring[i + 1]]);
            return {
                outlineSegments: outline,
                labelPoints: [],
            };
        }

        const gapIndices = new Set([maxIdx, minIdx]);
        const outlineSegments: Position[][] = [];
        const labelPoints: Position[] = [];

        /* -----------------------------------
         * 2) Build outline + gaps
         * ----------------------------------- */
        // 5. Process all segments to create the outline and gaps
        for (let i = 0; i < ring.length - 1; i++) {
            const p1 = ring[i];
            const p2 = ring[i + 1];

            // Change in X and Y, and segment length (planar distance)
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const segLen = Math.hypot(dx, dy);
            console.log('Segment length:', segLen, 'Gap size:', options.gapSize, 'Ratio:', options.gapSize / segLen);

            if (!gapIndices.has(i)) {
                // Normal segment: add the full segment
                outlineSegments.push([p1, p2]);
                continue;
            }

            // Segment requires a gap and a label
            if (segLen <= options.gapSize) {
                // Segment is too short for a gap, add full segment
                outlineSegments.push([p1, p2]);
                continue;
            }

            // Interpolation function to find a point along the segment (linear interpolation)
            const breakpoint = (t: number): Position => [
                p1[0] + dx * t,
                p1[1] + dy * t,
            ];

            // Calculate the fraction (t-value) for the start and end of the gap
            const centerT = 0.5;
            const halfGapRatio = (options.gapSize * 0.5) / segLen;

            const tStart = centerT - halfGapRatio;
            const tEnd = centerT + halfGapRatio;

            const gapStart = breakpoint(tStart);
            const gapEnd = breakpoint(tEnd);
            const labelPos = breakpoint(centerT);

            // Add the two line pieces around the gap
            outlineSegments.push(
                [p1, gapStart], // Piece before the gap
                [gapEnd, p2]    // Piece after the gap
            );

            // Record the label position (midpoint of the gap)
            labelPoints.push(labelPos);
        }

        // 6. Return the results
        return {outlineSegments, labelPoints};
    }

    getBridgeLabelPoints(coords: Position[], distance: number): Position[] {
        let start = coords[0];
        let stop = coords[1];
        const identifierCoord = geometryService.getMidpoint(start, stop);
        // date time label
        let dateCoordinate = geometryService.getExtendedPoint(start, stop, distance);
        return [identifierCoord, dateCoordinate];
    }

    /**
     * Transforms a simple 2-point LineString into a crowbar with cleaner perpendicular hooks
     * @param coords
     * @param hookLength
     * @param direction
     * @returns {Object} Turf.js LineString feature with crowbar shape
     */
    simpleLineToCrowbar(coords: Position[],
                        hookLength = 100,
                        direction = 'right'
    ) {

        if (coords.length !== 2) {
            console.warn('simpleLineToCrowbar works best with 2-point lines. Use lineStringToCrowbar for complex lines.');
        }

        const startPoint = coords[0];
        const endPoint = coords[coords.length - 1];

        // Calculate the bearing of the line
        const lineBearing = turf.bearing(startPoint, endPoint);
        const upperBearingOffset = 45;
        const lowerBearingOffset = 135;
        // Perpendicular bearings
        const upperPerpBearing = direction === 'left' ? lineBearing - upperBearingOffset : lineBearing + upperBearingOffset;
        const lowerPerpBearing = direction === 'left' ? lineBearing - lowerBearingOffset : lineBearing + lowerBearingOffset;

        // Create hooks perpendicular to the main line
        const startHook = turf.destination(
            startPoint,
            hookLength,
            lowerPerpBearing,
            {units: 'meters'}
        );

        const endHook = turf.destination(
            endPoint,
            hookLength,
            upperPerpBearing,
            {units: 'meters'}
        );

        // Build crowbar: start hook -> start point -> end point -> end hook
        const crowbarCoords = [
            turf.getCoord(startHook),
            startPoint,
            endPoint,
            turf.getCoord(endHook)
        ];

        return turf.lineString(crowbarCoords);
    }

    /**
     * Transforms a simple 2-point LineString into a crowbar with cleaner perpendicular hooks
     * @param coords
     * @param hookLength
     * @param direction
     * @returns {Object} Turf.js LineString feature with crowbar shape
     */
    passageLineGraphic(coords: Position[],
                       hookLength = 100,
    ) {

        if (coords.length !== 2) {
            console.warn('simpleLineToCrowbar works best with 2-point lines. Use lineStringToCrowbar for complex lines.');
        }

        const startPoint = coords[0];
        const endPoint = coords[coords.length - 1];

        // Calculate the bearing of the line
        const lineBearing = turf.bearing(startPoint, endPoint);
        const upperBearingOffset = 45;
        const lowerBearingOffset = 135;
        // Perpendicular bearings
        const upperRightBearing = lineBearing + upperBearingOffset;
        const upperLeftBearing = lineBearing - upperBearingOffset;
        const lowerRightBearing = lineBearing + lowerBearingOffset;
        const lowerLeftBearing = lineBearing - lowerBearingOffset;

        // Create hooks perpendicular to the main line
        const upperLeftHook = turf.destination(
            endPoint,
            hookLength,
            upperLeftBearing,
            {units: 'meters'}
        );
        const upperRightHook = turf.destination(
            endPoint,
            hookLength,
            upperRightBearing,
            {units: 'meters'}
        );
        const lowerLeftHook = turf.destination(
            startPoint,
            hookLength,
            lowerLeftBearing,
            {units: 'meters'}
        );
        const lowerRightHook = turf.destination(
            startPoint,
            hookLength,
            lowerRightBearing,
            {units: 'meters'}
        );

        let upperBar = [
            turf.getCoord(upperLeftHook),
            endPoint,
            turf.getCoord(upperRightHook)
        ];

        let lowerBar = [
            turf.getCoord(lowerLeftHook),
            startPoint,
            turf.getCoord(lowerRightHook)
        ]
        return turf.multiLineString([upperBar, [startPoint, endPoint], lowerBar]);
    }

    computeParallelLineString(coords: Coordinate[], offsetPixels: number): Position[] {
        const cleanedCoords = coords.filter((c, i, arr) => {
            if (i === 0) return true;
            // @ts-ignore
            const prev = arr[i - 1];
            return c[0] !== prev[0] || c[1] !== prev[1];
        });
        const line: Feature<LineString> = turf.lineString(cleanedCoords);

        // Use Turf's lineOffset to compute the parallel line
        const offsetLine = turf.lineOffset(line, offsetPixels, {units: 'meters'});

        return offsetLine.geometry.coordinates as Position[];
    }

    createMainAttackArrow(baseCoords: Position[], leftArrowBase: Position[], rightArrowBase: Position[], radius: number): Position[] {
        let lastLinePoint = baseCoords[baseCoords.length - 1];
        let secondToLastLinePoint = baseCoords[baseCoords.length - 2];

        const leftArrowHeadBase: Coordinate = this.getPerpendicularPoint(
            leftArrowBase[leftArrowBase.length - 1],
            leftArrowBase[leftArrowBase.length - 2],
            radius);
        const rightArrowHeadBase: Coordinate = this.getPerpendicularPoint(
            rightArrowBase[rightArrowBase.length - 1],
            rightArrowBase[rightArrowBase.length - 2],
            -radius,
        );
        let lastLeft = leftArrowBase[leftArrowBase.length - 1];
        let lastRight = rightArrowBase[rightArrowBase.length - 1];

        const arrowTipCoord: Coordinate = this.getExtendedPoint(lastLinePoint, secondToLastLinePoint, radius);
        const extendedTip: Coordinate = this.getExtendedPoint(lastLinePoint, secondToLastLinePoint, radius * 0.5);
        return [lastLeft, leftArrowHeadBase, arrowTipCoord, rightArrowHeadBase, lastRight, extendedTip, lastLeft, extendedTip, lastRight];

    }

    createExtendedArrow = (arrowCoords: Position[], size: number, lineBearing: number): Position[] => {
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

    createDirectionOfMainAttackArrow = (baseCoords: Position[], size: number,): Position[] => {
        let lastLinePoint = baseCoords[baseCoords.length - 1];
        let secondToLastLinePoint = baseCoords[baseCoords.length - 2];

        let lineBearing = turf.bearing(secondToLastLinePoint, lastLinePoint);
        let arrowCoords = this.computeArrowheadPoints(secondToLastLinePoint, lastLinePoint, size, 45);
        let extendedArrow = this.createExtendedArrow(arrowCoords, size, lineBearing);

        return [...arrowCoords, ...extendedArrow, arrowCoords[0]];
    }

    createDirectionOfFeintAttackArrow = (baseCoords: Position[], size: number,): Position[][] => {
        let lastLinePoint = baseCoords[baseCoords.length - 1];
        let secondToLastLinePoint = baseCoords[baseCoords.length - 2];

        let lineBearing = turf.bearing(secondToLastLinePoint, lastLinePoint);
        let arrowCoords = this.computeArrowheadPoints(secondToLastLinePoint, lastLinePoint, size, 45);

        let mainAttackArrow = this.createDirectionOfMainAttackArrow(baseCoords, size);
        let feintArrow = this.lineStringToDashes(
            this.createExtendedArrow(arrowCoords, size * 1.75, lineBearing),
            [size / 3, size / 3]
        );

        return [mainAttackArrow, ...feintArrow.geometry.coordinates];
    }


    generateZigZag(
        centerlineCoords: Coordinate[],
        totalWidthPx: number,      // visual width (pixels)
        resolution: number,        // meters per pixel
        numTeeth: number = 4
    ): Coordinate[] {
        if (centerlineCoords.length < 2) return [];

        // Project centerline
        const projected = centerlineCoords.map(this.project);

        // Get midpoint + tangent in projected space
        const midInfo = this.getPointAndUnitVectorAt(projected, 0.5);
        const [mx, my] = midInfo.point;
        const [ux, uy] = midInfo.unitVec;

        // Perpendicular axis
        const px = -uy;
        const py = ux;

        // Scale dimensions to meters
        const totalWidth = totalWidthPx * resolution;
        const amplitude = totalWidth * 0.15;
        const halfWidth = totalWidth / 2;

        const zigZagPoints: Coordinate[] = [];
        const totalSteps = numTeeth * 2;

        for (let i = 0; i <= totalSteps; i++) {
            const t = i / totalSteps;
            const perpDist = -halfWidth + t * totalWidth;

            const alongOffset = (i % 2 === 0)
                ? amplitude
                : -amplitude;

            const x =
                mx +
                perpDist * px +
                alongOffset * ux;

            const y =
                my +
                perpDist * py +
                alongOffset * uy;

            zigZagPoints.push(this.unproject([x, y]));
        }

        return zigZagPoints;
    }

    getPerpendicularPoint(last: Position, secondLast: Position, offsetMeters: number): Position {
        const bearing = turf.bearing(turf.point(secondLast), turf.point(last));
        const perpBearing = bearing + 90; // or -90 for opposite side
        return turf.destination(turf.point(last), offsetMeters, perpBearing, {units: 'meters'}).geometry.coordinates as Position;
    }

    unitVector(from: Coordinate, to: Coordinate): Position {
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        const len = Math.hypot(dx, dy);
        return [dx / len, dy / len];
    }

    createArrowHeadPolygon(
        tip: Position,
        dir: Position,        // unit vector pointing *outward*
        arrowSize: number,
    ): Feature<Polygon> {
        const [ux, uy] = dir;

        let projectedTip = this.project(tip);

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

        return turf.polygon([[projectedTip, left, right, projectedTip].map(this.unproject)]);
    }

    getCurveTangentAtEnd(
        curve: Position[],
        epsilon: number = 1
    ): Position {
        const n = curve.length;

        if (n < 2) {
            return [1, 0];
        }

        const p2 = curve[n - 1];
        const p1 = curve[Math.max(0, n - 1 - epsilon)];

        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];

        const len = Math.hypot(dx, dy);
        if (len === 0) {
            return [1, 0];
        }

        return [dx / len, dy / len];
    }

    getExtendedPoint(last: Position, secondLast: Position, lengthMeters: number): Position {
        // Compute bearing from secondLast → last
        const bearing = turf.bearing(turf.point(secondLast), turf.point(last));

        // Extend last point along that bearing by length * 1.5 meters
        const extended = turf.destination(turf.point(last), lengthMeters * 1.5, bearing, {units: 'meters'});

        return extended.geometry.coordinates as Position;
    }

    getMidpoint(coord1: Coordinate, coord2: Coordinate): Coordinate {
        const midX = (coord1[0] + coord2[0]) / 2;
        const midY = (coord1[1] + coord2[1]) / 2;
        return [midX, midY];
    }

    /**
     * Returns two EPSG:4326 positions that are `radius` metres apart, centred at
     * fraction `t` along segment P0→P1.  Pass these as [c0, c1] to generateLabels
     * so that graphicProportionalLabel (OL StyleFunction) derives font scale from
     * `radius` screen pixels — the same approach as FrontalAttack / TurningMovement.
     */
    labelCoordsAtFraction(P0: Position, P1: Position, t: number, radius: number): Position[] {
        const segLen = turf.distance(P0, P1, { units: 'meters' });
        const tHalf = segLen > 0 ? (radius / 2) / segLen : 0;
        return [
            [P0[0] + (t - tHalf) * (P1[0] - P0[0]), P0[1] + (t - tHalf) * (P1[1] - P0[1])],
            [P0[0] + (t + tHalf) * (P1[0] - P0[0]), P0[1] + (t + tHalf) * (P1[1] - P0[1])],
        ];
    }

    project([lon, lat]: Position): number[] {
        const x = EARTH_RADIUS_METERS * lon * Math.PI / 180;
        const y = EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 360)));
        return [x, y];
    }

    unproject([x, y]: number[]): Position {
        const lon = (x / EARTH_RADIUS_METERS) * 180 / Math.PI;
        const lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS_METERS)) - Math.PI / 2) * 180 / Math.PI;
        return [lon, lat];
    }

    lineStringToDashes(coords: Position[], dashPattern = [10, 10]) {
        const [dashLength, gapLength] = dashPattern;
        if (coords.length < 2) {
            throw new Error('LineString must have at least 2 points');
        }

        const projected = coords.map(this.project);

        let carry = 0;
        let isDash = true;
        const dashSegments: Position[][] = [];

        for (let i = 0; i < projected.length - 1; i++) {
            const p0 = projected[i];
            const p1 = projected[i + 1];

            const dx = p1[0] - p0[0];
            const dy = p1[1] - p0[1];
            const segLen = Math.hypot(dx, dy);

            let dist = carry;

            while (dist < segLen) {
                const startFrac = dist / segLen;
                const endDist = Math.min(
                    dist + (isDash ? dashLength : gapLength),
                    segLen
                );
                const endFrac = endDist / segLen;

                if (isDash) {
                    const start = [
                        p0[0] + dx * startFrac,
                        p0[1] + dy * startFrac
                    ] as [number, number];

                    const end = [
                        p0[0] + dx * endFrac,
                        p0[1] + dy * endFrac
                    ] as [number, number];

                    dashSegments.push([
                        this.unproject(start),
                        this.unproject(end)
                    ]);
                }

                dist = endDist;
                isDash = !isDash;
            }

            carry = dist - segLen;
        }
        return turf.multiLineString(dashSegments);
    }

    /**
     * Compute outer tangent lines between two circles on the Earth's surface.
     * Inputs/outputs are lon/lat coordinates (degrees).
     * All internal math is done in meters, using Turf.js geodesic functions.
     */
    computeOuterTangents(
        center1: Position,
        center2: Position,
        radiusMeters: number
    ): Position[][] {
        // --- Input validation ---
        const c1 = Array.isArray(center1[0]) ? (center1[0] as Position) : center1;
        const c2 = Array.isArray(center2[0]) ? (center2[0] as Position) : center2;

        if (
            !Array.isArray(c1) ||
            !Array.isArray(c2) ||
            c1.length < 2 ||
            c2.length < 2 ||
            c1.some(isNaN) ||
            c2.some(isNaN)
        ) {
            console.warn('Invalid center coordinates:', {c1, c2});
            return [];
        }

        if (radiusMeters <= 0) {
            console.warn('Invalid radius:', radiusMeters);
            return [];
        }

        const dist = turf.distance(c1, c2, {units: 'meters'});
        if (!isFinite(dist) || dist === 0) return [];

        // --- Bearing & angle calculations ---
        const theta = turf.bearing(c1, c2);
        const angleOffset = Math.asin(Math.min(1, radiusMeters)) * (180 / Math.PI);

        // Bearings for tangent points
        const bearing1a = theta + angleOffset;
        const bearing1b = theta - angleOffset;
        const reverseBearing = turf.bearing(c2, c1);
        const bearing2a = reverseBearing - angleOffset;
        const bearing2b = reverseBearing + angleOffset;

        // --- Tangent points (in lon/lat) ---
        const p1a = turf.destination(c1, radiusMeters, bearing1a, {units: 'meters'}).geometry.coordinates;
        const p2a = turf.destination(c2, radiusMeters, bearing2a, {units: 'meters'}).geometry.coordinates;

        const p1b = turf.destination(c1, radiusMeters, bearing1b, {units: 'meters'}).geometry.coordinates;
        const p2b = turf.destination(c2, radiusMeters, bearing2b, {units: 'meters'}).geometry.coordinates;

        if (
            !p1a || !p2a || !p1b || !p2b ||
            p1a.some(isNaN) || p2a.some(isNaN) ||
            p1b.some(isNaN) || p2b.some(isNaN)
        ) {
            console.warn('Invalid tangent coordinates computed');
            return [];
        }

        return [
            [p1a, p2a], // top tangent
            [p1b, p2b], // bottom tangent
        ];
    }

    getPolygonCenter(polygonGeoJSON: Feature<Polygon>): Feature<Point> {
        // 1. Calculate the geometric centroid (aesthetically preferred center of mass).
        const centroid = turf.centroid(polygonGeoJSON);

        // 2. Check if the Centroid is inside. If so, return it immediately.
        if (turf.booleanPointInPolygon(centroid, polygonGeoJSON)) {
            // Centroid is generally the best aesthetic choice if available.
            return centroid;
        }

        // 3. Fallback to Pole of Inaccessibility (PoI).
        // PoI is guaranteed to be inside and attempts to maximize the distance
        // to the nearest boundary, which is ideal for text placement clearance.
        // In highly concave shapes, this point may still be in a "neck," but it is
        // the mathematically optimal point for clearance.
        const poI = turf.pointOnFeature(polygonGeoJSON);

        return poI;

    }

    getSearchAreaArrow = (centerPadding: number, arrowLength: number, arrowDepth: number, arrowHeadLength: number, arrowHeadDegree: number): Position[][] => {
        let base = turf.point([0, 0]);
        let arrowCoords = this.getSearchArrowLine(base, centerPadding, arrowLength, arrowDepth);
        let arrowHeadCoords = this.computeArrowheadPoints(arrowCoords[arrowCoords.length - 2], arrowCoords[arrowCoords.length - 1], arrowHeadLength, arrowHeadDegree);
        let rightArrow = [arrowCoords, arrowHeadCoords];
        let leftArrow = this.reflectAcrossYAxis(turf.multiLineString(rightArrow), 0);
        return [...rightArrow, ...leftArrow.geometry.coordinates];
    };

    getSearchArrowLine(base: Feature<Point>, centerPadding: number, arrowLength: number, arrowDepth: number): Position[] {

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

    reflectAcrossYAxis<T extends turf.AllGeoJSON>(geojson: T, pivotLon: number): T {
        const mirrored = turf.clone(geojson);

        turf.coordEach(mirrored, (coord) => {
            const [lon, lat] = coord;
            coord[0] = pivotLon - (lon - pivotLon); // mirror longitude
            coord[1] = lat;                         // latitude unchanged
        });

        return mirrored;
    }

    getCaneArrow = (base: Feature<LineString>, caneSize: number, arrowSize: number,) => {
        let baseCoords = base.geometry.coordinates;
        let start = baseCoords[0];
        let end = baseCoords[1];
        // Half-circle "cane" always opens downward (bulges north) regardless of
        // whether the base line was drawn left-to-right or right-to-left. Place
        // the arc's center horizontally opposite to `end` so the arc sits on the
        // far side of `start` from the arrow tip.
        // The cane's half-circle sits above `start` with its center directly north of it.
        // The arc bulges horizontally AWAY from the arrow tip, producing "C___>" when drawn
        // left-to-right and "<___Ↄ" when drawn right-to-left. Arc coords are ordered so
        // `start` is first and the free top endpoint (used as the offset handle) is last.
        const center = turf.destination(turf.point(start), arrowSize, 0, {units: 'meters'});
        const endIsEast = end[0] >= start[0];
        let arcCoords = endIsEast
            ? turf.lineArc(center, arrowSize, 180, 360, {units: 'meters'}).geometry.coordinates
            : turf.lineArc(center, arrowSize, 0, 180, {units: 'meters'}).geometry.coordinates.slice().reverse();

        let arrowHeadCoords = this.computeArrowheadPoints(start, end, Math.abs(arrowSize), 45);
        return turf.multiLineString([baseCoords, arrowHeadCoords, arcCoords]);
    }

    getBlockArrow(base: Feature<LineString>, blockArrowSize: number): Feature<LineString> {
        let bearing = turf.bearing(base.geometry.coordinates[0], base.geometry.coordinates[1]);
        let top = turf.destination(base.geometry.coordinates[1], blockArrowSize, bearing + 90, {units: 'meters'})
        let bottom = turf.destination(base.geometry.coordinates[1], blockArrowSize, bearing - 90, {units: 'meters'})
        return turf.lineString([...base.geometry.coordinates, top.geometry.coordinates, bottom.geometry.coordinates]);
    }

    /**
     * AttackByFire symbol — backward "<" feathers at the start point plus a horizontal
     * shaft ending in an arrowhead. Ratio between feather size and shaft length is
     * controlled by the caller (passes `featherSize`).
     *
     * Returned MultiLineString segments (in order):
     *   0: upper feather   (featherTop → start)
     *   1: lower feather   (featherBottom → start)
     *   2: shaft           (start → end)
     *   3: arrowhead       (3 points produced by computeArrowheadPoints at end)
     */
    getAttackByFireSymbol(base: Position[], featherSize: number): Feature<MultiLineString> {
        const start = base[0];
        const end = base[base.length - 1];
        const bearing = turf.bearing(start, end);
        const featherTop = turf.destination(start, featherSize, bearing - 135, {units: 'meters'});
        const featherBottom = turf.destination(start, featherSize, bearing + 135, {units: 'meters'});
        const arrowhead = this.computeArrowheadPoints(start, end, featherSize, 45);
        return turf.multiLineString([
            [featherTop.geometry.coordinates, start],
            [featherBottom.geometry.coordinates, start],
            [start, end],
            arrowhead,
        ]);
    }

    getBreachArrow(base: Position[], size: number, topBearingBuffer: number, bottomBearingBuffer: number): Feature<MultiLineString> {
        let offsetBase = this.computeParallelLineString(base, size);
        let bearing = turf.bearing(offsetBase[0], offsetBase[1]);
        let top = turf.destination(offsetBase[1], size * .75, bearing + topBearingBuffer, {units: 'meters'})
        let bottom = turf.destination(offsetBase[1], size * .75, bearing + bottomBearingBuffer, {units: 'meters'})
        return turf.multiLineString([offsetBase, [top.geometry.coordinates, bottom.geometry.coordinates]]);
    }

    getBypassArrow(base: Position[], size: number): Feature<MultiLineString> {
        let offsetBase = this.computeParallelLineString(base, size);
        let arrowHeadCoords = this.computeArrowheadPoints(offsetBase[offsetBase.length - 2], offsetBase[offsetBase.length - 1], Math.abs(size / 2), 45);
        return turf.multiLineString([offsetBase, arrowHeadCoords]);
    }

    getClearGraphic(base: Position[], size: number): Feature<MultiLineString> {
        let topArrow = this.getBypassArrow(base, -size);
        let bottomArrow = this.getBypassArrow(base, size);

        let middleArrow = this.computeArrowheadPoints(base[base.length - 2], base[base.length - 1], size / 2, 45);
        let bearing = turf.bearing(topArrow.geometry.coordinates[0][1], bottomArrow.geometry.coordinates[0][1]);
        let top = turf.destination(topArrow.geometry.coordinates[0][1], size * .75, bearing - 180, {units: 'meters'})
        let bottom = turf.destination(bottomArrow.geometry.coordinates[0][1], size * .75, bearing, {units: 'meters'})

        return turf.multiLineString([
            ...topArrow.geometry.coordinates,
            ...bottomArrow.geometry.coordinates,
            base,
            middleArrow,
            [top.geometry.coordinates, bottom.geometry.coordinates],
        ]);

    }

    getPenetrationArrowGraphic(base: Position[], size: number): Feature<MultiLineString> {
        let middleArrow = this.computeArrowheadPoints(base[base.length - 2], base[base.length - 1], size / 2, 45);
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

    getExploitationArrowGraphic(base: Position[], size: number): Feature<MultiLineString> {
        let middleArrow = this.computeArrowheadPoints(base[base.length - 2], base[base.length - 1], size, 45);
        // Fish tail (dashed): twice the main arrowhead size so it reads as a
        // clearly larger backward chevron at the base.
        const tailSize = size * 2;
        let baseArrow = this.lineStringToDashes(
            this.computeArrowheadPoints(base[base.length - 1], base[base.length - 2], -tailSize, 45),
            [tailSize / 6, tailSize / 6]
        );

        return turf.multiLineString([
            base,
            middleArrow,
            ...baseArrow.geometry.coordinates
        ]);

    }

    computeArrowheadPointsProjected(
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

    getDisruptGraphic(base: Position[], size: number): Feature<MultiLineString> {
        const p0 = this.project(base[0]);
        const p1 = this.project(base[1]);

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

        // Bottom arrow stays 25% longer than the default (half-base − size).
        // Top arrow mirrors bottom around p1 so the three right-end extents
        // (bottom-right, p1, top-right) are linearly spaced, preserving the
        // staggered "rise" of the trident.
        const ARROW_EXTENSION_FACTOR = 1.25;
        const bottomArrowLength = Math.max(size * 0.5, (len / 2 - size) * ARROW_EXTENSION_FACTOR);
        const topArrowLength = len - bottomArrowLength;

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

        const topArrow = this.computeArrowheadPointsProjected(
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

        const bottomArrow = this.computeArrowheadPointsProjected(
            bottomBase[0],
            bottomBase[1],
            size / 2,
            45
        );

        const middleArrow = this.computeArrowheadPointsProjected(
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
            topBase.map(this.unproject),
            topArrow.map(this.unproject),
            bottomBase.map(this.unproject),
            bottomArrow.map(this.unproject),
            base,
            middleArrow.map(this.unproject),
            connector.map(this.unproject)
        ]);

    }

    fortifiedAreaGraphic(
        polygon: Polygon,
        merlonWidth: number,
        crenelWidth: number,
        depth: number
    ): Position[][] {
        const coords = polygon.coordinates[0];
        const out: Position[] = [];

        const patternWidth = merlonWidth + crenelWidth;

        // Calculate total perimeter and segment lengths
        const segmentLengths: number[] = [];
        let totalPerimeter = 0;

        for (let i = 0; i < coords.length - 1; i++) {
            const line = turf.lineString([coords[i], coords[i + 1]]);
            const len = turf.length(line, {units: 'meters'});
            segmentLengths.push(len);
            totalPerimeter += len;
        }

        // Calculate total number of patterns around entire perimeter
        const totalPatterns = Math.round(totalPerimeter / patternWidth);
        const adjustedPatternWidth = totalPerimeter / totalPatterns;
        const adjustedMerlonWidth = adjustedPatternWidth * (merlonWidth / patternWidth);
        const adjustedCrenelWidth = adjustedPatternWidth * (crenelWidth / patternWidth);

        let distanceFromStart = 0;
        let inMerlon = true; // Track whether we're currently in a merlon or crenel
        let nextTransition = adjustedMerlonWidth; // Distance to next transition

        for (let i = 0; i < coords.length - 1; i++) {
            const start = coords[i];
            const end = coords[i + 1];
            const segmentLength = segmentLengths[i];

            const line = turf.lineString([start, end]);
            const bearing = turf.bearing(turf.point(start), turf.point(end));
            const perpBearing = bearing + 90;

            let segmentDist = 0;

            while (segmentDist < segmentLength) {
                const remainingInSegment = segmentLength - segmentDist;
                const remainingToTransition = nextTransition - distanceFromStart;

                if (remainingToTransition <= remainingInSegment) {
                    // Transition happens within this segment
                    const transitionPoint = turf.along(line, segmentDist + remainingToTransition, {units: 'meters'});

                    if (inMerlon) {
                        // End of merlon: go from outer to inner
                        const outerPoint = turf.destination(transitionPoint, depth, perpBearing, {units: 'meters'});
                        out.push(outerPoint.geometry.coordinates);
                        out.push(transitionPoint.geometry.coordinates);
                    } else {
                        // End of crenel: go from inner to outer
                        out.push(transitionPoint.geometry.coordinates);
                        const outerPoint = turf.destination(transitionPoint, depth, perpBearing, {units: 'meters'});
                        out.push(outerPoint.geometry.coordinates);
                    }

                    segmentDist += remainingToTransition;
                    distanceFromStart += remainingToTransition;
                    inMerlon = !inMerlon;
                    nextTransition = distanceFromStart + (inMerlon ? adjustedMerlonWidth : adjustedCrenelWidth);
                } else {
                    // No transition in this segment, move to next segment
                    break;
                }
            }
        }

        // Close the polygon
        out.push(out[0]);

        return [out];
    }

    /**
     * Build the FortifiedLine "battlement" graphic from a base line: an
     * interrupted baseline plus a series of outward-bumping rectangular
     * teeth (merlons). The baseline is drawn ONLY in the gaps between teeth
     * — each tooth is open at its base so the rectangle reads as truly
     * three-sided rather than a closed box sitting on the line.
     *
     * Output is `Position[][]` — one sub-line per LineString in the
     * resulting MultiLineString. The order interleaves gap and tooth
     * sub-lines from start to end:
     *   gap_0, tooth_0, gap_1, tooth_1, ..., tooth_{N-1}, gap_N
     * where gap pieces are 2-point baseline segments and tooth pieces are
     * 4-point polylines `[leftBase, leftTop, rightTop, rightBase]`.
     *
     * Teeth are evenly distributed — N teeth and N+1 gaps, starting and
     * ending with a gap so corners aren't crowded. If the line is shorter
     * than one merlon+crenel pattern, only the baseline is returned.
     */
    generateCrenellatedLineGraphic(
        lineCoords: Position[],
        merlonWidth: number,
        crenelWidth: number,
        toothHeight: number,
        outward: boolean = true,
    ): Position[][] {
        if (!lineCoords || lineCoords.length < 2) return [];

        const segmentLengths: number[] = [];
        let totalLength = 0;
        for (let i = 0; i < lineCoords.length - 1; i++) {
            const len = turf.distance(lineCoords[i], lineCoords[i + 1], {units: 'meters'});
            segmentLengths.push(len);
            totalLength += len;
        }

        const patternWidth = merlonWidth + crenelWidth;
        if (patternWidth <= 0 || totalLength < patternWidth) {
            return [lineCoords.slice()];
        }

        // N teeth + (N+1) gaps. Solve for N closest to even spacing.
        const N = Math.max(1, Math.round((totalLength - crenelWidth) / patternWidth));
        const adjustedCrenel = (totalLength - N * merlonWidth) / (N + 1);

        const sample = (distance: number): { point: Position; bearing: number; segIdx: number } => {
            let accumulated = 0;
            for (let i = 0; i < lineCoords.length - 1; i++) {
                const segLen = segmentLengths[i];
                if (segLen <= 0) continue;
                if (accumulated + segLen >= distance - 1e-9) {
                    const segStart = lineCoords[i];
                    const segEnd = lineCoords[i + 1];
                    const t = (distance - accumulated) / segLen;
                    // Linear interpolation keeps the sample point exactly on
                    // the rendered segment (matches the rest of the codebase).
                    const point: Position = [
                        segStart[0] + t * (segEnd[0] - segStart[0]),
                        segStart[1] + t * (segEnd[1] - segStart[1]),
                    ];
                    const bearing = turf.bearing(segStart, segEnd);
                    return {point, bearing, segIdx: i};
                }
                accumulated += segLen;
            }
            const lastIdx = lineCoords.length - 2;
            const last = lineCoords[lineCoords.length - 1];
            const prev = lineCoords[lineCoords.length - 2];
            return {point: last, bearing: turf.bearing(prev, last), segIdx: lastIdx};
        };

        // Build the gap baseline between two cumulative distances. Walks any
        // intermediate user-drawn vertices so multi-segment baselines bend
        // correctly between teeth.
        const gapBetween = (fromDist: number, toDist: number): Position[] => {
            const from = sample(fromDist);
            const to = sample(toDist);
            const points: Position[] = [from.point];
            for (let i = from.segIdx + 1; i <= to.segIdx; i++) {
                points.push(lineCoords[i]);
            }
            points.push(to.point);
            return points;
        };

        const heightKm = toothHeight / 1000;
        const subLines: Position[][] = [];

        let cursor = 0;
        for (let i = 0; i < N; i++) {
            const leftDist = adjustedCrenel + i * (merlonWidth + adjustedCrenel);
            const rightDist = leftDist + merlonWidth;

            // Gap leading up to this tooth.
            subLines.push(gapBetween(cursor, leftDist));

            const left = sample(leftDist);
            const right = sample(rightDist);

            // Outward bump: same convention as generateSingleTriangleLinear
            // (bearing − 90 for outward = above a left-to-right line).
            const sign = outward ? -1 : 1;
            const leftPerp = (left.bearing + sign * 90 + 360) % 360;
            const rightPerp = (right.bearing + sign * 90 + 360) % 360;

            const leftTop = turf.destination(left.point, heightKm, leftPerp, {units: 'kilometers'}).geometry.coordinates;
            const rightTop = turf.destination(right.point, heightKm, rightPerp, {units: 'kilometers'}).geometry.coordinates;

            subLines.push([left.point, leftTop, rightTop, right.point]);
            cursor = rightDist;
        }
        // Final gap from the last tooth to the end.
        subLines.push(gapBetween(cursor, totalLength));

        return subLines;
    }

    private getPointAndUnitVectorAt(coords: Coordinate[], percent: number) {
        let totalLen = 0;
        for (let i = 0; i < coords.length - 1; i++) {
            totalLen += Math.hypot(coords[i + 1][0] - coords[i][0], coords[i + 1][1] - coords[i][1]);
        }

        const targetDist = totalLen * percent;
        let accumulated = 0;

        for (let i = 0; i < coords.length - 1; i++) {
            const d = Math.hypot(coords[i + 1][0] - coords[i][0], coords[i + 1][1] - coords[i][1]);
            if (accumulated + d >= targetDist || i === coords.length - 2) {
                const localT = d === 0 ? 0 : (targetDist - accumulated) / d;
                const dx = coords[i + 1][0] - coords[i][0];
                const dy = coords[i + 1][1] - coords[i][1];
                const mag = Math.hypot(dx, dy);
                return {
                    point: [coords[i][0] + dx * localT, coords[i][1] + dy * localT] as Coordinate,
                    unitVec: [dx / mag, dy / mag] as [number, number]
                };
            }
            accumulated += d;
        }
        return {point: coords[0], unitVec: [1, 0] as [number, number]};
    }

    /**
     * Helper to generate a single triangle using linear interpolation along the segment.
     * This ensures the base points lie exactly on the polygon edge.
     */
    private generateSingleTriangleLinear(
        pStart: Position,
        pEnd: Position,
        segmentLengthMeters: number,
        baseStartDistRel: number,
        triangleWidth: number,
        triangleHeight: number,
        outward: boolean
    ): Position[] {
        // Calculate interpolation factors (0 to 1) for p1 and p2 along the segment
        const t1 = baseStartDistRel / segmentLengthMeters;
        const t2 = (baseStartDistRel + triangleWidth) / segmentLengthMeters;

        // Linear interpolation to get p1 and p2 exactly on the line segment
        const p1: Position = [
            pStart[0] + t1 * (pEnd[0] - pStart[0]),
            pStart[1] + t1 * (pEnd[1] - pStart[1])
        ];

        const p2: Position = [
            pStart[0] + t2 * (pEnd[0] - pStart[0]),
            pStart[1] + t2 * (pEnd[1] - pStart[1])
        ];

        // Calculate the midpoint of the base
        const midpoint: Position = [
            (p1[0] + p2[0]) / 2,
            (p1[1] + p2[1]) / 2
        ];

        // Calculate the bearing of the segment
        const bearing = turf.bearing(pStart, pEnd);

        // Calculate perpendicular bearing
        // For outward triangles: rotate bearing by +90° (right side)
        // For inward triangles: rotate bearing by -90° (left side)
        let perpBearing = bearing + (outward ? -90 : 90);
        perpBearing = (perpBearing + 360) % 360;

        // Compute the apex point at the required height along the perpendicular bearing
        const heightKm = triangleHeight / 1000;
        const apex = turf.destination(midpoint, heightKm, perpBearing, {units: 'kilometers'}).geometry.coordinates;

        // Close the triangle by returning to p1
        return [p1, apex, p2];
    }
}

const geometryService = new GeometryService();
export default geometryService;
