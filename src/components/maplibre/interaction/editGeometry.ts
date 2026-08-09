/**
 * # Editing a graphic by editing its description
 *
 * Every gesture here changes the **base geometry** or the **property bag** and
 * lets the generator redraw. Nothing touches the drawn output.
 *
 * That is the difference from the OpenLayers controllers, which transform the
 * rendered features in place and keep the numbers that produced them on the holder
 * instance. It works there because those features are live objects a style
 * function re-reads every frame. Here the drawn geometry is derived and thrown
 * away on the next realisation, so the only thing worth editing is the thing that
 * survives: `base` plus `properties.tacticalGraphic`, which is also exactly what
 * gets saved.
 *
 * The upshot is that these are pure functions of a portable description, so they
 * need no holder, no controller and no map — which is what makes them testable and
 * what would let a third renderer reuse them unchanged.
 *
 * ## Everything is done in projected metres
 *
 * A drag arrives as two lon/lat points, and lon/lat is not a metric space: moving
 * a graphic "one degree east" moves it a different distance at 60° north than at
 * the equator, and rotating in degrees is meaningless. So each operation projects,
 * does planar arithmetic, and unprojects — the same frame every paint function
 * works in. @see conventions.md
 */

import type {Geometry, Position} from 'geojson';
import type {TacticalGraphicProperties} from '@zaes/tactical-graphics';
import {toLonLat, toMercator} from '../projection';

/** A graphic's editable state: what it was drawn from, and what shapes it. */
export interface GraphicDescription {
    geometry: Geometry;
    properties: TacticalGraphicProperties;
}

/**
 * Applies `fn` to every position of a geometry, whatever its nesting.
 *
 * **An empty array is nothing, not a position.** Recursing on `node[0]` alone reads
 * `[]` as a coordinate pair, hands it to `fn`, and every downstream number becomes
 * NaN — which then travels all the way to a rendered geometry that draws nothing,
 * with no error anywhere. An empty `coordinates` is what a geometry mid-draw or a
 * malformed import actually looks like, so this is reachable rather than
 * theoretical.
 *
 * The test is on the *first element*: a position is an array of numbers, so a node
 * whose first element is a number is one, and anything else is a level of nesting.
 */
function mapPositions(geometry: Geometry, fn: (position: Position) => Position): Geometry {
    if (geometry.type === 'GeometryCollection') {
        return {type: 'GeometryCollection', geometries: geometry.geometries.map(g => mapPositions(g, fn))};
    }
    const walk = (node: unknown): unknown => {
        if (!Array.isArray(node) || !node.length) return node;
        return typeof node[0] === 'number' ? fn(node as Position) : node.map(walk);
    };
    return {...geometry, coordinates: walk((geometry as {coordinates: unknown}).coordinates)} as Geometry;
}

/** Every position of a geometry, in order. */
export function positionsOf(geometry: Geometry): Position[] {
    const out: Position[] = [];
    mapPositions(geometry, position => {
        out.push(position);
        return position;
    });
    return out;
}

/**
 * The centre a rotate or a resize is measured about.
 *
 * The **midpoint of the extent**, not the average of the vertices: a line drawn
 * with ten points clustered at one end would otherwise pivot around the cluster
 * rather than around the middle of the shape the user can see.
 */
export function centreOf(geometry: Geometry): Position {
    const positions = positionsOf(geometry).map(p => toMercator([p[0], p[1]]));
    if (!positions.length) return [0, 0];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of positions) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return toLonLat([(minX + maxX) / 2, (minY + maxY) / 2]);
}

/** Moves a graphic by the metric offset between two lon/lat points. */
export function translate(description: GraphicDescription, from: Position, to: Position): GraphicDescription {
    const [fromX, fromY] = toMercator([from[0], from[1]]);
    const [toX, toY] = toMercator([to[0], to[1]]);
    const dx = toX - fromX;
    const dy = toY - fromY;

    return {
        ...description,
        geometry: mapPositions(description.geometry, position => {
            const [x, y] = toMercator([position[0], position[1]]);
            return toLonLat([x + dx, y + dy]);
        }),
    };
}

/**
 * Turns a graphic about its centre by the angle the cursor swept.
 *
 * Two graphics rotate two different ways and the difference is not cosmetic:
 *
 * - A **point-anchored** graphic keeps its base — a single point has no
 *   orientation to change — and carries its bearing in `properties.rotation`,
 *   which the generator reads. Rotating its geometry would do nothing at all.
 * - A **drawn** graphic has no such property; its orientation *is* its vertices,
 *   so they are the thing that turns.
 *
 * Getting this backwards is silent: the rotate appears to do nothing on half the
 * catalogue, which reads as a broken gesture rather than a wrong branch.
 */
export function rotate(description: GraphicDescription, from: Position, to: Position): GraphicDescription {
    const centre = toMercator(centreOf(description.geometry) as [number, number]);
    const angleTo = (position: Position) => {
        const [x, y] = toMercator([position[0], position[1]]);
        return Math.atan2(y - centre[1], x - centre[0]);
    };
    const delta = angleTo(to) - angleTo(from);
    if (!isFinite(delta) || delta === 0) return description;

    if (description.geometry.type === 'Point') {
        // Degrees, and **counter-clockwise from east** — the frame the generators
        // build their local axes in, not a compass bearing.
        const current = description.properties.rotation ?? 0;
        return {...description, properties: {...description.properties, rotation: current + (delta * 180) / Math.PI}};
    }

    const cos = Math.cos(delta);
    const sin = Math.sin(delta);
    return {
        ...description,
        geometry: mapPositions(description.geometry, position => {
            const [x, y] = toMercator([position[0], position[1]]);
            const dx = x - centre[0];
            const dy = y - centre[1];
            return toLonLat([centre[0] + dx * cos - dy * sin, centre[1] + dx * sin + dy * cos]);
        }),
    };
}

/** Smallest a graphic may be scaled to in one drag, as a ratio. */
const MIN_SCALE_STEP = 0.05;
/** Smallest radius a point-anchored graphic may be dragged to, in metres. */
const MIN_RADIUS_METRES = 100;

/**
 * Grows or shrinks a graphic by the ratio of the cursor's distance from its
 * centre, before and after.
 *
 * A ratio rather than a delta, so the gesture feels the same whether the graphic
 * is a hundred metres or a hundred kilometres across — and so a drag toward the
 * centre never flips the shape inside out, which a subtractive delta does the
 * moment it passes zero.
 *
 * Point-anchored graphics scale their stored `radius`; drawn ones scale their
 * vertices about the centre, which is the same operation one level down.
 */
export function resize(description: GraphicDescription, from: Position, to: Position): GraphicDescription {
    const centre = toMercator(centreOf(description.geometry) as [number, number]);
    const distance = (position: Position) => {
        const [x, y] = toMercator([position[0], position[1]]);
        return Math.hypot(x - centre[0], y - centre[1]);
    };

    const before = distance(from);
    if (before === 0) return description;
    const ratio = Math.max(MIN_SCALE_STEP, distance(to) / before);
    if (!isFinite(ratio) || ratio === 1) return description;

    if (description.geometry.type === 'Point') {
        const current = description.properties.radius;
        if (current === undefined) return description;
        return {
            ...description,
            properties: {...description.properties, radius: Math.max(MIN_RADIUS_METRES, current * ratio)},
        };
    }

    return {
        ...description,
        geometry: mapPositions(description.geometry, position => {
            const [x, y] = toMercator([position[0], position[1]]);
            return toLonLat([centre[0] + (x - centre[0]) * ratio, centre[1] + (y - centre[1]) * ratio]);
        }),
    };
}

/**
 * Moves one vertex of the base — the reshape gesture.
 *
 * Indexed against `positionsOf`, which walks the geometry in the order it is
 * stored, so the caller's index and this one agree by construction. A ring's
 * closing vertex is the same point as its first, so both move together or the
 * polygon comes apart.
 */
export function moveVertex(description: GraphicDescription, index: number, to: Position): GraphicDescription {
    const positions = positionsOf(description.geometry);
    if (index < 0 || index >= positions.length) return description;

    const isRing = description.geometry.type === 'Polygon' || description.geometry.type === 'MultiPolygon';
    const first = 0;
    const last = positions.length - 1;
    const alsoMove = isRing && (index === first || index === last) ? (index === first ? last : first) : -1;

    let seen = -1;
    return {
        ...description,
        geometry: mapPositions(description.geometry, position => {
            seen++;
            return seen === index || seen === alsoMove ? [to[0], to[1]] : position;
        }),
    };
}
