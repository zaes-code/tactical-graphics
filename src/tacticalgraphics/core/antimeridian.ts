import {Feature, Geometry, Position} from 'geojson';

/**
 * # A base that crosses the antimeridian, unwrapped
 *
 * A file folds longitudes into [-180, 180), so points placed either side of the
 * antimeridian arrive as 179.99 and -179.99. Most generators build in degree space (a
 * midpoint, a Bézier control point, a fraction along the chord), and on those two numbers
 * that arithmetic lands on the far side of the globe: Capture's arc reached longitude 225
 * and a difficult ford's bank marks were drawn near longitude 0.
 *
 * So each vertex is moved by whole turns to sit within 180 degrees of the one before it,
 * and the line runs on past 180 instead of jumping back. That leaves every base that does
 * not cross untouched, and turns one that does into the continuous line its user drew.
 * Positions past 180 are valid GeoJSON and every engine draws them in place.
 */
export function unwrappedLongitudes<F extends Feature>(feature: F): F {
    const geometry = feature.geometry;
    if (!geometry || !crossesAntimeridian(geometry)) return feature;
    return {...feature, geometry: unwrapGeometry(geometry)};
}

/** Whether any two neighboring vertices are more than half a turn apart. */
function crossesAntimeridian(geometry: Geometry): boolean {
    return linesOf(geometry).some(line => line.some((p, i) => i > 0 && Math.abs(p[0] - line[i - 1][0]) > 180));
}

function linesOf(geometry: Geometry): Position[][] {
    switch (geometry.type) {
        case 'LineString':
        case 'MultiPoint':
            return [geometry.coordinates];
        case 'Polygon':
        case 'MultiLineString':
            return geometry.coordinates;
        case 'MultiPolygon':
            return geometry.coordinates.flat();
        case 'GeometryCollection':
            return geometry.geometries.flatMap(linesOf);
        default:
            return [];
    }
}

/** `line` with each longitude moved by whole turns to within 180 degrees of its neighbor. */
function unwrapLine(line: Position[], start = line[0]?.[0]): Position[] {
    let previous = start;
    return line.map(p => {
        const lon = previous + ((((p[0] - previous) % 360) + 540) % 360) - 180;
        previous = lon;
        return [lon, ...p.slice(1)];
    });
}

function unwrapGeometry(geometry: Geometry): Geometry {
    switch (geometry.type) {
        case 'LineString':
        case 'MultiPoint':
            return {...geometry, coordinates: unwrapLine(geometry.coordinates)};
        case 'Polygon':
        case 'MultiLineString': {
            // Every ring on the outer ring's turn, so a hole stays inside its area.
            const start = geometry.coordinates[0]?.[0]?.[0];
            return {...geometry, coordinates: geometry.coordinates.map(line => unwrapLine(line, start))};
        }
        case 'MultiPolygon': {
            const start = geometry.coordinates[0]?.[0]?.[0]?.[0];
            return {...geometry, coordinates: geometry.coordinates.map(poly => poly.map(line => unwrapLine(line, start)))};
        }
        case 'GeometryCollection':
            return {...geometry, geometries: geometry.geometries.map(unwrapGeometry)};
        default:
            return geometry;
    }
}
