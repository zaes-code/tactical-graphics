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
import type {ProjectedPosition, TacticalGraphicProperties} from '@zaes/tactical-graphics';
import {rotationAnchor} from '@zaes/tactical-graphics';
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
 * The point a rotate or a resize is measured about.
 *
 * **The rule is the library's, not this renderer's.** It differs per base shape —
 * a point turns about itself, a drawn line about its first vertex, a polygon about
 * a point inside itself — and choosing here rather than asking is what made the two
 * engines edit differently from the same drag. @see rotationAnchor
 */
export function centreOf(geometry: Geometry): Position {
    return rotationAnchor(geometry as {type: string; coordinates: unknown});
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
    // **A grab on the pivot rotates by the direction of the drag**, which is what
    // OpenLayers does: its start angle there is `atan2(0, 0)` = 0, so the graphic turns
    // to face wherever the cursor went. Reproduced explicitly rather than left to
    // `atan2` of a sub-metre vector, which is the direction of a rounding error.
    // @see PIVOT_GRAB_SHARE
    const [fromX, fromY] = toMercator([from[0], from[1]]);
    const onPivot = Math.hypot(fromX - centre[0], fromY - centre[1]) <= PIVOT_GRAB_SHARE * spanOf(description.geometry);
    const angleTo = (position: Position) => {
        const [x, y] = toMercator([position[0], position[1]]);
        return Math.atan2(y - centre[1], x - centre[0]);
    };
    // Zero when the grab was on the pivot, matching OpenLayers' `atan2(0, 0)`.
    const delta = angleTo(to) - (onPivot ? 0 : angleTo(from));
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
/**
 * How close to the pivot a grab has to be before it is treated as *on* it, as a
 * share of the graphic's own diagonal. Below this a rotate or a resize is refused
 * rather than amplified. @see resize
 */
const PIVOT_GRAB_SHARE = 0.02;

/** The graphic's diagonal in projected metres — its own scale, for relative tests. */
function spanOf(geometry: Geometry): number {
    const positions = positionsOf(geometry).map(p => toMercator([p[0], p[1]]));
    if (positions.length < 2) return 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of positions) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return Math.hypot(maxX - minX, maxY - minY);
}

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

    // A grab that starts **at the pivot** carries no scale: the ratio is a tiny
    // number divided by a tiny number. Testing for exactly zero was not enough,
    // because the grab point is a handle's rounded screen position converted back to
    // lon/lat and lands a fraction of a metre off — which scaled a fields-of-fire to
    // 1384 degrees across from one drag. Measured against the graphic's own size, so
    // it needs no resolution.
    const before = distance(from);
    if (before <= PIVOT_GRAB_SHARE * spanOf(description.geometry)) return description;
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

// ── the per-handle gestures ─────────────────────────────────────────────────

/**
 * How far off the base a drag must reach before it counts as a decision to flip
 * the graphic to the other side, in projected metres per unit of resolution.
 *
 * Crossing the line is easy to do by accident; going a long way past it is not. So
 * the magnitude of the drag sets the width and the *sign* sets the side, read
 * separately — using the signed number for both would make a flip jump the width
 * at the same moment.
 */
const MIRROR_FLIP_MIN_PX = 12;

/** The squared distance from a point to a segment, all in projected metres. */
function distanceToSegmentSq(point: ProjectedPosition, a: ProjectedPosition, b: ProjectedPosition): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return (point[0] - a[0]) ** 2 + (point[1] - a[1]) ** 2;

    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq));
    return (point[0] - (a[0] + t * dx)) ** 2 + (point[1] - (a[1] + t * dy)) ** 2;
}

/**
 * Sets a graphic's **width** from how far the cursor sits off its base — the
 * offset handle.
 *
 * Measured against the base segment the cursor is *nearest*, not always the first:
 * a movement graphic drawn with several bends has a width that means the same
 * thing at every one of them, and measuring from the first segment makes the
 * handle fight the cursor as soon as the path turns. A two-point base has one
 * segment, so this picks the same one either way.
 *
 * The stored field is a **full width**, edge to edge, while the generator takes a
 * half-width offset — the factor of two lives in `toGraphicOptions` and must not
 * be applied twice.
 *
 * One handle, two jobs: the magnitude sets the width and the sign sets the side.
 */
export function setOffset(
    description: GraphicDescription,
    cursor: Position,
    options: {offsetScale?: number; resolution: number},
): GraphicDescription {
    const coords = positionsOf(description.geometry).map(p => toMercator([p[0], p[1]]));
    if (coords.length < 2) return description;

    const at = toMercator([cursor[0], cursor[1]]);
    let segment: [ProjectedPosition, ProjectedPosition] = [coords[0], coords[1]];
    let nearest = Infinity;
    for (let i = 0; i < coords.length - 1; i++) {
        const distance = distanceToSegmentSq(at, coords[i], coords[i + 1]);
        if (distance < nearest) {
            nearest = distance;
            segment = [coords[i], coords[i + 1]];
        }
    }

    const angle = Math.atan2(segment[1][1] - segment[0][1], segment[1][0] - segment[0][0]);
    // The segment's left normal.
    const axisX = Math.cos(angle + Math.PI / 2);
    const axisY = Math.sin(angle + Math.PI / 2);
    const perpendicular = (at[0] - segment[0][0]) * axisX + (at[1] - segment[0][1]) * axisY;

    const width = Math.abs(perpendicular) * (options.offsetScale ?? DEFAULT_OFFSET_SCALE) * 2;
    const properties = {...description.properties, width};

    // **Negative, not positive.** The axis above is the left normal and an
    // unmirrored graphic already hangs on that side, so reading a positive
    // perpendicular as "mirrored" flips it the moment the user drags along the side
    // it is already on.
    if (Math.abs(perpendicular) > MIRROR_FLIP_MIN_PX * options.resolution) {
        properties.mirrored = perpendicular < 0;
    }

    return {...description, properties};
}

/** Default offset sensitivity — a handle drawn two widths out. @see HandleContract */
const DEFAULT_OFFSET_SCALE = 0.5;

/**
 * Sets a curve's `bend` from the cursor's signed perpendicular distance to the
 * chord, over the graphic's own size.
 *
 * Over the size, so the handle tracks the pointer exactly at any scale, and
 * dragging across the chord flips which way the curve bows. The chord's direction
 * comes from `rotation` — planar degrees, 0 = east — and then its *clockwise*
 * perpendicular, which is the side the generator bows toward.
 */
export function setBend(description: GraphicDescription, cursor: Position, clamp: (bend: number) => number): GraphicDescription {
    const size = description.properties.radius;
    if (!size || size <= 0) return description;

    const centre = toMercator(centreOf(description.geometry) as [number, number]);
    const at = toMercator([cursor[0], cursor[1]]);
    const theta = ((description.properties.rotation ?? 0) * Math.PI) / 180;
    const bend = clamp(((at[0] - centre[0]) * Math.sin(theta) + (at[1] - centre[1]) * -Math.cos(theta)) / size);

    return {...description, properties: {...description.properties, bend}};
}

/**
 * Sets both size and bearing from one cursor position — the tip handle.
 *
 * The far end of a chord carries both of its inputs: how long it is and which way
 * it points. `bend` is unitless and rides along unchanged, so the curve keeps its
 * proportion through a resize.
 */
export function setReach(description: GraphicDescription, cursor: Position): GraphicDescription {
    const centre = toMercator(centreOf(description.geometry) as [number, number]);
    const at = toMercator([cursor[0], cursor[1]]);
    const dx = at[0] - centre[0];
    const dy = at[1] - centre[1];
    const reach = Math.hypot(dx, dy);
    if (reach <= 0) return description;

    return {
        ...description,
        properties: {
            ...description.properties,
            radius: reach,
            rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
        },
    };
}

/** Metres in a kilometre — range bands are stored in km. */
const KM = 1000;

/**
 * How far apart two range-fan rings are kept, as a share of the outermost.
 *
 * Proportional so the gap holds up at any size: a fixed number of kilometres is
 * invisible on a 500 km fan and larger than the whole of a 2 km one.
 */
const BAND_SEPARATION_FRACTION = 0.05;

/**
 * Sets one range-fan band's range from the cursor's distance to the centre.
 *
 * Clamped between its neighbours, so a band can never be dragged through the one
 * inside or outside it — which would reorder the rings and leave the handle the
 * user is holding attached to a different band.
 *
 * A fan with no user-entered bands is rendering the fallback single band derived
 * from `radius`, so the drag drives `radius` and leaves the amplifiers alone
 * rather than inventing a band the user never typed.
 */
export function setBandRange(description: GraphicDescription, index: number, cursor: Position): GraphicDescription {
    const centre = toMercator(centreOf(description.geometry) as [number, number]);
    const at = toMercator([cursor[0], cursor[1]]);
    const km = Math.hypot(at[0] - centre[0], at[1] - centre[1]) / KM;
    if (!isFinite(km) || km <= 0) return description;

    const bands = description.properties.rangeFan?.bands;
    if (!bands || !bands.length) {
        return {...description, properties: {...description.properties, radius: km * KM}};
    }

    const sorted = [...bands].sort((a, b) => a.range - b.range);
    if (index < 0 || index >= sorted.length) return description;

    const gap = sorted[sorted.length - 1].range * BAND_SEPARATION_FRACTION;
    const min = index === 0 ? gap : sorted[index - 1].range + gap;
    const max = index === sorted.length - 1 ? Number.POSITIVE_INFINITY : sorted[index + 1].range - gap;

    const next = sorted.map((band, i) => (i === index ? {...band, range: Math.min(Math.max(km, min), Math.max(min, max))} : band));
    return {
        ...description,
        properties: {...description.properties, rangeFan: {...description.properties.rangeFan, bands: next}},
    };
}

