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
 * away on the next realization, so the only thing worth editing is the thing that
 * survives: `base` plus `properties.tacticalGraphic`, which is also exactly what
 * gets saved.
 *
 * The upshot is that these are pure functions of a portable description, so they
 * need no holder, no controller and no map — which is what makes them testable and
 * what would let a third renderer reuse them unchanged.
 *
 * ## Everything is done in projected meters
 *
 * A drag arrives as two lon/lat points, and lon/lat is not a metric space: moving
 * a graphic "one degree east" moves it a different distance at 60° north than at
 * the equator, and rotating in degrees is meaningless. So each operation projects,
 * does planar arithmetic, and unprojects — the same frame every paint function
 * works in. @see conventions.md
 */

import type {Geometry, Position} from 'geojson';
import type {ProjectedPosition, TacticalGraphicName, TacticalGraphicProperties} from '@zaes/tactical-graphics';
import {generatorOrder, groundLength, mercatorScale, rotationAnchor} from '@zaes/tactical-graphics';
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
export function centerOf(geometry: Geometry, name?: TacticalGraphicName): Position {
    return rotationAnchor(geometry as {type: string; coordinates: unknown}, name);
}

/**
 * The pivot for a whole description — the same point, with the graphic's name supplied.
 *
 * Every gesture here has the name to hand, and one family needs it: a symbol described by
 * anchor points turns about its own centre rather than about its first vertex, which for
 * a Turn is the tip of the arrow. @see rotationAnchor
 */
function pivotOf(description: GraphicDescription): Position {
    return centerOf(description.geometry, description.properties.name);
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
 * Turns a graphic about its center by the angle the cursor swept.
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
 * catalog, which reads as a broken gesture rather than a wrong branch.
 */
export function rotate(description: GraphicDescription, from: Position, to: Position): GraphicDescription {
    const center = toMercator(pivotOf(description) as [number, number]);
    // **A grab on the pivot rotates by the direction of the drag**, which is what
    // OpenLayers does: its start angle there is `atan2(0, 0)` = 0, so the graphic turns
    // to face wherever the cursor went. Reproduced explicitly rather than left to
    // `atan2` of a sub-meter vector, which is the direction of a rounding error.
    // @see PIVOT_GRAB_SHARE
    const [fromX, fromY] = toMercator([from[0], from[1]]);
    const onPivot = Math.hypot(fromX - center[0], fromY - center[1]) <= PIVOT_GRAB_SHARE * spanOf(description.geometry);
    const angleTo = (position: Position) => {
        const [x, y] = toMercator([position[0], position[1]]);
        return Math.atan2(y - center[1], x - center[0]);
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
            const dx = x - center[0];
            const dy = y - center[1];
            return toLonLat([center[0] + dx * cos - dy * sin, center[1] + dx * sin + dy * cos]);
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

/** The graphic's diagonal in projected meters — its own scale, for relative tests. */
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

/** Smallest radius a point-anchored graphic may be dragged to, in meters. */
const MIN_RADIUS_METERS = 100;

/**
 * Grows or shrinks a graphic by the ratio of the cursor's distance from its
 * center, before and after.
 *
 * A ratio rather than a delta, so the gesture feels the same whether the graphic
 * is a hundred meters or a hundred kilometers across — and so a drag toward the
 * center never flips the shape inside out, which a subtractive delta does the
 * moment it passes zero.
 *
 * Point-anchored graphics scale their stored `radius`; drawn ones scale their
 * vertices about the center, which is the same operation one level down.
 */
export function resize(description: GraphicDescription, from: Position, to: Position): GraphicDescription {
    const center = toMercator(pivotOf(description) as [number, number]);
    const distance = (position: Position) => {
        const [x, y] = toMercator([position[0], position[1]]);
        return Math.hypot(x - center[0], y - center[1]);
    };

    // A grab that starts **at the pivot** carries no scale: the ratio is a tiny
    // number divided by a tiny number. Testing for exactly zero was not enough,
    // because the grab point is a handle's rounded screen position converted back to
    // lon/lat and lands a fraction of a meter off — which scaled a fields-of-fire to
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
            properties: {...description.properties, radius: Math.max(MIN_RADIUS_METERS, current * ratio)},
        };
    }

    return {
        ...description,
        // **The sizes the drawn geometry does not carry scale with it.**
        //
        // A corridor's width and a line graphic's decoration are filed as their own
        // distances in metres, beside the vertices rather than in them, so scaling only
        // the vertices made the graphic longer while its rails and its chevrons stayed
        // where they were: an air corridor resized 1.5x came out 420 x 40 px here against
        // OpenLayers' 431 x 51. "Resize the whole graphic as is" is the user's rule, and
        // the OpenLayers controller states it in the same words.
        // @see LineGraphicController.handleResize
        properties: scaleDrawnSizes(description.properties, ratio),
        geometry: mapPositions(description.geometry, position => {
            const [x, y] = toMercator([position[0], position[1]]);
            return toLonLat([center[0] + (x - center[0]) * ratio, center[1] + (y - center[1]) * ratio]);
        }),
    };
}

/**
 * The size properties a drawn graphic carries beside its vertices, scaled by `ratio`.
 *
 * `width` is the rails' separation and `decorationSize` the chevron, tooth or arrowhead —
 * both real distances, and both meaningless to a graphic that does not carry them, which
 * is why each is scaled only where it is already present. `radius` is deliberately absent:
 * on this family it is the *same* number as the half-width, replayed by `setOffset` on
 * restore, and scaling both would compound. @see toGraphicOptions
 */
function scaleDrawnSizes(properties: TacticalGraphicProperties, ratio: number): TacticalGraphicProperties {
    const scaled = (value: number | undefined): number | undefined =>
        value !== undefined && value > 0 ? value * ratio : value;

    return {
        ...properties,
        ...(properties.width === undefined ? {} : {width: scaled(properties.width)}),
        ...(properties.decorationSize === undefined ? {} : {decorationSize: scaled(properties.decorationSize)}),
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

/**
 * Adds a vertex to the base, at `index` — the reshape gesture that OpenLayers gives
 * you by dragging a segment rather than a corner.
 *
 * Indexed like {@link moveVertex}, against `positionsOf`, so the caller's index means
 * the same thing to both: the new vertex lands *before* the position currently at
 * `index`, which is what "insert into this segment" means when the segment is the one
 * ending there.
 *
 * **A ring's closing vertex is not an insertion point.** A polygon repeats its first
 * position last; inserting at 0 or at the end would put a vertex outside the ring's
 * closure and open the shape. Those two indices are refused, and every segment between
 * them is available — which is every segment a user can actually see.
 */
export function insertVertex(description: GraphicDescription, index: number, at: Position): GraphicDescription {
    const positions = positionsOf(description.geometry);
    if (index <= 0 || index > positions.length - 1) return description;

    const isRing = description.geometry.type === 'Polygon' || description.geometry.type === 'MultiPolygon';
    if (isRing && index === positions.length - 1) return description;

    const inserted = [...positions.slice(0, index), [at[0], at[1]] as Position, ...positions.slice(index)];

    let seen = -1;
    return {
        ...description,
        // Rebuilt by walking the *new* list in the same order `mapPositions` walks the
        // old one. The geometry has one more position than the walker will visit, so the
        // tail is appended by the structure rather than by the callback — which is why
        // this rewrites coordinates directly instead of mapping in place.
        geometry: rebuildWithPositions(description.geometry, () => inserted[++seen]),
    };
}

/**
 * A geometry of the same type carrying `next()`'s positions, however many there are.
 *
 * `mapPositions` cannot grow a geometry — it visits each existing position once — so
 * an insertion needs a builder that reads its length from the new list.
 */
function rebuildWithPositions(geometry: Geometry, next: () => Position): Geometry {
    const positions: Position[] = [];
    let candidate = next();
    while (candidate) {
        positions.push(candidate);
        candidate = next();
    }

    if (geometry.type === 'LineString') return {...geometry, coordinates: positions};
    if (geometry.type === 'Polygon') return {...geometry, coordinates: [positions]};
    return geometry;
}

// ── the per-handle gestures ─────────────────────────────────────────────────

/**
 * How far off the base a drag must reach before it counts as a decision to flip
 * the graphic to the other side, in projected meters per unit of resolution.
 *
 * Crossing the line is easy to do by accident; going a long way past it is not. So
 * the magnitude of the drag sets the width and the *sign* sets the side, read
 * separately — using the signed number for both would make a flip jump the width
 * at the same moment.
 */
const MIRROR_FLIP_MIN_PX = 12;

/** The squared distance from a point to a segment, all in projected meters. */
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
    // **Measured along the line the *generator* saw, not the line as stored.** Which
    // side is "the mirrored one" is decided by a segment's left normal, and thirty-two
    // graphics store their points tip-first now, so their stored line runs the opposite
    // way from the one their symbol was built along. Reading the stored order would
    // invert the sign for exactly those graphics: a corridor would flip the instant it
    // was dragged along the side it already hung on. @see drawOrder.ts
    const drawn = generatorOrder(description.properties.name, positionsOf(description.geometry));
    const coords = drawn.map(p => toMercator([p[0], p[1]]));
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

    // **A real width, not a projected one.** `width` is an amplifier in metres — the
    // dialog states it and the generator builds from it — while this measurement is in
    // mercator metres. Left unconverted, dragging the handle 120 px off the line at 50
    // degrees north set a corridor 1.56x that wide, so its edge outran the cursor
    // dragging it. @see mercator.ts
    const ground = groundLength(Math.abs(perpendicular), drawn[0][1]);
    const width = ground * (options.offsetScale ?? DEFAULT_OFFSET_SCALE) * 2;
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

/**
 * Flips the graphic to the other side of its own line, and changes nothing else.
 *
 * The retrograde tasks' second handle. Unlike an offset drag it carries no width: in
 * OpenLayers, dragging a retirement's handle 170 px either way leaves `width` exactly
 * where it was and moves no vertex — the only thing that changes is which side the cane
 * hangs on. So this reads the *sign* of the perpendicular and discards the magnitude.
 *
 * **Negative is the mirrored side**, matching `setOffset`: the axis is the segment's
 * left normal and an unmirrored symbol already hangs on that side, so treating a
 * positive perpendicular as mirrored would flip it the moment the user dragged along
 * the side it was already on.
 *
 * The threshold is the same one, and for the same reason — crossing the line is easy to
 * do by accident, going a little way past it is not.
 */
export function setMirror(
    description: GraphicDescription,
    cursor: Position,
    resolution: number,
    mirrorAxis: 'across' | 'along' = 'across',
): GraphicDescription {
    // The generator's orientation, for the reason `setOffset` gives. @see drawOrder.ts
    const coords = generatorOrder(description.properties.name, positionsOf(description.geometry))
        .map(p => toMercator([p[0], p[1]]));
    const at = toMercator([cursor[0], cursor[1]]);

    // **A point-anchored graphic has no drawn axis to measure against.** Its orientation
    // lives in `properties.rotation`, so the axis comes from there and the origin is the
    // point itself — which is what OpenLayers' `mirrorIfDraggedPastAxis` does for the
    // same family. Without this branch abatis and pursuit could not be flipped at all:
    // one position is not a line, and the segment loop below had nothing to run on.
    if (coords.length < 2) {
        if (!coords.length) return description;
        const axis = ((description.properties.rotation ?? 0) * Math.PI) / 180;
        const dx = at[0] - coords[0][0];
        const dy = at[1] - coords[0][1];
        // Which component decides the flip is the graphic's own business: a chevron
        // swaps sides *across* its route, a pursuit's semicircle bulges east or west
        // *along* the same axis. @see HandleContract.mirrorAxis
        const across = mirrorAxis === 'along'
            ? dx * Math.cos(axis) + dy * Math.sin(axis)
            : -dx * Math.sin(axis) + dy * Math.cos(axis);
        // A far more generous threshold than the line families': on these graphics a
        // handle drag normally means rotate, so the flip has to be a deliberate
        // excursion rather than anything a rotation could brush past.
        if (Math.abs(across) < MIRROR_PAST_AXIS_MIN_PX * resolution) return description;
        const flipped = across < 0;
        if (flipped === !!description.properties.mirrored) return description;
        return {...description, properties: {...description.properties, mirrored: flipped}};
    }

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
    const axisX = Math.cos(angle + Math.PI / 2);
    const axisY = Math.sin(angle + Math.PI / 2);
    const perpendicular = (at[0] - segment[0][0]) * axisX + (at[1] - segment[0][1]) * axisY;

    if (Math.abs(perpendicular) < MIRROR_FLIP_MIN_PX * resolution) return description;

    const mirrored = perpendicular < 0;
    if (mirrored === !!description.properties.mirrored) return description;
    return {...description, properties: {...description.properties, mirrored}};
}

/**
 * How far past its own axis, in screen pixels, a handle has to be dragged before a
 * point-anchored graphic flips. Much larger than `MIRROR_FLIP_MIN_PX`, and matching
 * OpenLayers' constant of the same name. @see setMirror
 */
const MIRROR_PAST_AXIS_MIN_PX = 40;

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
export function setBend(
    description: GraphicDescription,
    cursor: Position,
    clamp: (bend: number) => number,
    /**
     * Reads the bend from the cursor's own frame instead of the perpendicular offset.
     * Envelopment needs it: its tip sits **along** the axis, so the perpendicular
     * carries no radius and the default rule collapses the hook. @see envelopmentBendFrom
     */
    fromFrame?: (along: number, perpendicular: number, size: number, currentBend: number) => number,
): GraphicDescription {
    const size = description.properties.radius;
    if (!size || size <= 0) return description;

    const center = toMercator(pivotOf(description) as [number, number]);
    const at = toMercator([cursor[0], cursor[1]]);
    const theta = ((description.properties.rotation ?? 0) * Math.PI) / 180;
    // **On the ground, because `size` is.** `bend` is a ratio of the two, and mercator
    // metres are 1.56x too long at 50 degrees north — so the same drag produced a
    // sharper curve the further from the equator it was made, and a different one from
    // OpenLayers, which takes its bend geodesically off the anchor points. @see mercator.ts
    const scale = mercatorScale(pivotOf(description)[1]);
    const dx = (at[0] - center[0]) / scale;
    const dy = (at[1] - center[1]) / scale;

    const bend = fromFrame
        ? fromFrame(
            dx * Math.cos(theta) + dy * Math.sin(theta),
            -dx * Math.sin(theta) + dy * Math.cos(theta),
            size,
            description.properties.bend ?? 0,
        )
        : clamp((dx * Math.sin(theta) + dy * -Math.cos(theta)) / size);

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
    const center = toMercator(pivotOf(description) as [number, number]);
    const at = toMercator([cursor[0], cursor[1]]);
    const dx = at[0] - center[0];
    const dy = at[1] - center[1];
    const reach = Math.hypot(dx, dy);
    if (reach <= 0) return description;

    return {
        ...description,
        properties: {
            ...description.properties,
            // A real distance, not the projected one this was measured in: `radius` is
            // what the generator builds from and what the dialog states. @see mercator.ts
            radius: groundLength(reach, pivotOf(description)[1]),
            rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
        },
    };
}

/** Meters in a kilometer — range bands are stored in km. */
const KM = 1000;

/**
 * How far apart two range-fan rings are kept, as a share of the outermost.
 *
 * Proportional so the gap holds up at any size: a fixed number of kilometers is
 * invisible on a 500 km fan and larger than the whole of a 2 km one.
 */
const BAND_SEPARATION_FRACTION = 0.05;

/**
 * Sets one range-fan band's range from the cursor's distance to the center.
 *
 * Clamped between its neighbors, so a band can never be dragged through the one
 * inside or outside it — which would reorder the rings and leave the handle the
 * user is holding attached to a different band.
 *
 * A fan with no user-entered bands is rendering the fallback single band derived
 * from `radius`, so the drag drives `radius` and leaves the amplifiers alone
 * rather than inventing a band the user never typed.
 */
export function setBandRange(description: GraphicDescription, index: number, cursor: Position): GraphicDescription {
    const center = toMercator(pivotOf(description) as [number, number]);
    const at = toMercator([cursor[0], cursor[1]]);
    const km = Math.hypot(at[0] - center[0], at[1] - center[1]) / KM;
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

