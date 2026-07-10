import {LineString, MultiLineString, Polygon, MultiPolygon, Geometry} from 'ol/geom';
import GeoJSON from 'ol/format/GeoJSON';
import {Coordinate} from 'ol/coordinate';
import {_scaleAndRotateCoordinates} from './scaleAndRotateCoordinates';

interface ParsedGeometry {
    type: 'LineString' | 'Polygon';
    coordinates: Coordinate[] | Coordinate[][];
}

interface SVGConversionResult {
    geometry: Geometry;
    geoJSON: GeoJSON.Feature;
    originalGeometries: ParsedGeometry[];
}

function parseSVGPath(pathData: string): ParsedGeometry[] {
    // Enhanced parser for SVG path commands
    const commands = pathData.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi) || [];
    const geometries: ParsedGeometry[] = [];
    let currentPath: Coordinate[] = [];
    let currentPoint: Coordinate = [0, 0];
    let startPoint: Coordinate = [0, 0];

    commands.forEach(command => {
        const type = command[0].toUpperCase();
        const isRelative = command[0] !== command[0].toUpperCase();
        const coords = command
            .slice(1)
            .trim()
            .split(/[\s,]+/)
            .filter(x => x)
            .map(Number);

        switch (type) {
            case 'M': // Move to
                if (currentPath.length > 1) {
                    geometries.push({type: 'LineString', coordinates: [...currentPath]});
                }
                const movePoint: Coordinate = isRelative ? [currentPoint[0] + coords[0], currentPoint[1] + coords[1]] : [coords[0], coords[1]];
                currentPath = [movePoint];
                currentPoint = movePoint;
                startPoint = movePoint;

                // Handle implicit line commands after move
                for (let i = 2; i < coords.length; i += 2) {
                    const nextPoint: Coordinate = isRelative
                        ? [currentPoint[0] + coords[i], currentPoint[1] + coords[i + 1]]
                        : [coords[i], coords[i + 1]];
                    currentPath.push(nextPoint);
                    currentPoint = nextPoint;
                }
                break;

            case 'L': // Line to
                for (let i = 0; i < coords.length; i += 2) {
                    const nextPoint: Coordinate = isRelative
                        ? [currentPoint[0] + coords[i], currentPoint[1] + coords[i + 1]]
                        : [coords[i], coords[i + 1]];
                    currentPath.push(nextPoint);
                    currentPoint = nextPoint;
                }
                break;

            case 'H': // Horizontal line
                coords.forEach(x => {
                    const nextPoint: Coordinate = isRelative ? [currentPoint[0] + x, currentPoint[1]] : [x, currentPoint[1]];
                    currentPath.push(nextPoint);
                    currentPoint = nextPoint;
                });
                break;

            case 'V': // Vertical line
                coords.forEach(y => {
                    const nextPoint: Coordinate = isRelative ? [currentPoint[0], currentPoint[1] + y] : [currentPoint[0], y];
                    currentPath.push(nextPoint);
                    currentPoint = nextPoint;
                });
                break;

            case 'Z': // Close path
                if (currentPath.length > 2) {
                    currentPath.push(startPoint); // Close the path
                    geometries.push({type: 'Polygon', coordinates: [currentPath]});
                } else if (currentPath.length > 1) {
                    geometries.push({type: 'LineString', coordinates: currentPath});
                }
                currentPath = [];
                currentPoint = startPoint;
                break;

            // Add basic support for curves (approximate with line segments)
            case 'C': // Cubic Bezier curve
                for (let i = 0; i < coords.length; i += 6) {
                    const cp1: Coordinate = isRelative ? [currentPoint[0] + coords[i], currentPoint[1] + coords[i + 1]] : [coords[i], coords[i + 1]];
                    const cp2: Coordinate = isRelative
                        ? [currentPoint[0] + coords[i + 2], currentPoint[1] + coords[i + 3]]
                        : [coords[i + 2], coords[i + 3]];
                    const endPoint: Coordinate = isRelative
                        ? [currentPoint[0] + coords[i + 4], currentPoint[1] + coords[i + 5]]
                        : [coords[i + 4], coords[i + 5]];

                    // Approximate curve with line segments
                    const segments = approximateBezier(currentPoint, cp1, cp2, endPoint, 10);
                    currentPath.push(...segments.slice(1)); // Skip first point (already in path)
                    currentPoint = endPoint;
                }
                break;
        }
    });

    // Handle remaining path
    if (currentPath.length > 1) {
        geometries.push({type: 'LineString', coordinates: currentPath});
    }

    return geometries;
}

function approximateBezier(p0: Coordinate, p1: Coordinate, p2: Coordinate, p3: Coordinate, numSegments: number): Coordinate[] {
    const points: Coordinate[] = [];
    for (let i = 0; i <= numSegments; i++) {
        const t = i / numSegments;
        const x = Math.pow(1 - t, 3) * p0[0] + 3 * Math.pow(1 - t, 2) * t * p1[0] + 3 * (1 - t) * Math.pow(t, 2) * p2[0] + Math.pow(t, 3) * p3[0];
        const y = Math.pow(1 - t, 3) * p0[1] + 3 * Math.pow(1 - t, 2) * t * p1[1] + 3 * (1 - t) * Math.pow(t, 2) * p2[1] + Math.pow(t, 3) * p3[1];
        points.push([x, y]);
    }
    return points;
}

/**
 * Converts an SVG shape to OpenLayers geometry and GeoJSON
 * @param svgString - The SVG string or just the path data
 * @param centerCoordinate - [lon, lat] center point for the shape
 * @param scale - Scale factor for the shape size
 * @param rotation - Rotation angle in radians
 * @returns Object containing geometry and GeoJSON
 */
function svgToOpenLayersGeometry(
    svgString: string,
    centerCoordinate: Coordinate = [0, 0],
    scale: number = 1,
    rotation: number = 0,
): SVGConversionResult {
    // Extract all path elements from SVG string
    const paths: string[] = [];

    // Update this to work for a generic SVG file
    if (svgString.includes('<svg') || svgString.includes('<path')) {
        // Parse SVG DOM
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
        const pathElements = svgDoc.querySelectorAll('path');

        pathElements.forEach(pathElement => {
            const pathData = pathElement.getAttribute('d');
            if (pathData) {
                paths.push(pathData);
            }
        });
    } else {
        // Assume it's raw path data
        paths.push(svgString);
    }

    const allGeometries: ParsedGeometry[] = [];

    paths.forEach(pathData => {
        const geometries = parseSVGPath(pathData.trim());
        allGeometries.push(...geometries);
    });

    // Transform coordinates: scale, rotate, and translate
    const transformedGeometries: ParsedGeometry[] = allGeometries.map(geom => {
        let transformedCoords: Coordinate[] | Coordinate[][];

        if (geom.type === 'Polygon') {
            transformedCoords = (geom.coordinates as Coordinate[][]).map(ring =>
                ring.map(coord => _scaleAndRotateCoordinates(coord, centerCoordinate, scale, rotation)),
            );
        } else {
            transformedCoords = (geom.coordinates as Coordinate[]).map(coord => _scaleAndRotateCoordinates(coord, centerCoordinate, scale, rotation));
        }

        return {
            ...geom,
            coordinates: transformedCoords,
        };
    });

    // Create appropriate OpenLayers geometries
    const olGeometries: Geometry[] = transformedGeometries.map(geom => {
        switch (geom.type) {
            case 'LineString':
                return new LineString(geom.coordinates as Coordinate[]);
            case 'Polygon':
                return new Polygon(geom.coordinates as Coordinate[][]);
            default:
                return new LineString(geom.coordinates as Coordinate[]);
        }
    });

    // Determine the best single geometry to return
    let finalGeometry: Geometry;
    if (olGeometries.length === 1) {
        finalGeometry = olGeometries[0];
    } else {
        // Multiple geometries - group by type
        const lineStrings = olGeometries.filter((g): g is LineString => g instanceof LineString);
        const polygons = olGeometries.filter((g): g is Polygon => g instanceof Polygon);

        if (polygons.length > 0) {
            finalGeometry = polygons.length === 1 ? polygons[0] : new MultiPolygon(polygons.map(p => p.getCoordinates()));
        } else {
            finalGeometry = lineStrings.length === 1 ? lineStrings[0] : new MultiLineString(lineStrings.map(l => l.getCoordinates()));
        }
    }

    // Generate GeoJSON
    const transformedGeom = finalGeometry.clone().transform('EPSG:3857', 'EPSG:4326');
    const geoJSON: GeoJSON.Feature = {
        type: 'Feature',
        geometry: new GeoJSON().writeGeometryObject(transformedGeom),
        properties: {
            source: 'svg-conversion',
            originalSVG: svgString,
        },
    };

    return {
        geometry: finalGeometry,
        geoJSON: geoJSON,
        originalGeometries: transformedGeometries,
    };
}

export {svgToOpenLayersGeometry, type SVGConversionResult, type ParsedGeometry};
