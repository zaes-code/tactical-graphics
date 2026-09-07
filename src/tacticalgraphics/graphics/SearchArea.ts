import {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import {IBaseGraphicOptions, TacticalGraphicName} from '../core/type';
import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import * as turf from '../core/turf';

/**
 * # Search area / reconnaissance area — APP-06 152200
 *
 * > **Anchor Points.** This symbol requires three anchor points. Point 1 defines the vertex
 * > of the graphic. Points 2 and 3 define the tips of the arrowheads.
 * >
 * > **Size/Shape.** Points 1 and 2 and points 1 and 3 determine the length of the arrows.
 * > The length and orientation of the arrows can vary independently.
 *
 * So it is the same three-point V that {@link FieldsOfFire} is, down to the stored layout —
 * `[end, apex, end]`, with the apex in the middle and swapped into APP-06's numbering by
 * `SWAP_FIRST_TWO`. What differs is the arms: each is a **stepped run** rather than a
 * straight one, and each ends in a solid arrowhead.
 *
 * ## The step is measured, not invented
 *
 * The 2026-04 implementation drew this from a fixed SVG path scaled and rotated about a
 * single anchor point. That path is gone, but its numbers are the plate's, so the four
 * waypoints below were recovered from it and re-expressed in each arm's own frame — a
 * fraction *along* the arm and a fraction *across* it — which is what makes them survive
 * the arms varying "independently" in length and orientation. Read off the old path:
 *
 * ```
 *   apex ----(0.060, +0.044)----(0.443, +0.137)
 *                                      \
 *                                       (0.463, -0.041)----(1.000, 0.000)  tip
 * ```
 *
 * Positive is **outward**, away from the other arm. The arm therefore leaves the vertex
 * steeply, cuts back across its own axis, and runs shallow into the tip — which is the
 * sawtooth both the Template and the Example draw, and is not something a straight leg
 * with a decoration could produce.
 *
 * ## What is deliberately not drawn
 *
 * The box at the vertex. `A` is the **tactical symbol indicator** — *"the tactical symbol
 * indicator is centred over point 1"* — an associated unit symbol, not text an operator
 * types into this graphic, and the Example fills it with a framed icon. Single-point icons
 * are milsymbol's job and nothing in this package names milsymbol; the seam for injecting
 * one already exists for cover, guard and screen, and could be widened to cover this if a
 * host ever asks. @see core/securitySymbol.ts, and `GRAPHIC_FIELDS` — this graphic offers
 * no amplifier field, because its plate letters none.
 */

/**
 * The waypoints of one arm, as `[along, outward]` fractions of the arm's length.
 *
 * @see the module header for where they come from and the picture they make.
 */
export const SEARCH_AREA_ARM: readonly (readonly [number, number])[] = [
    [0.060, 0.044],
    [0.443, 0.137],
    [0.463, -0.041],
    [1.0, 0.0],
];

/**
 * The V, whatever the user drew — the same synthesis {@link asVee} performs for fields of
 * fire, and for the same reason: two of the three anchor points do not make this symbol.
 *
 * Kept separate rather than shared because the two open to different defaults; a search
 * area's arms are drawn narrower than a right angle in both the Template and the Example.
 */
const DEFAULT_VEE_DEGREES = 60;

/** The base as `[end, apex, end]`, synthesising the second arm from a two-point sketch. */
export function asSearchVee(coords: Position[]): Position[] {
    if (coords.length >= 3) return coords;
    if (coords.length < 2) return coords;
    const [end, apex] = coords;
    const bearing = turf.bearing(turf.point(apex), turf.point(end));
    const length = turf.distance(turf.point(apex), turf.point(end), {units: 'meters'});
    if (!Number.isFinite(length) || length <= 0) return coords;
    // Geodesic, not a rotation of the raw degrees: a leg swung in degree space comes out
    // the wrong length and bearing away from the equator. @see asVee, which says the same
    const swung = turf.destination(turf.point(apex), length, bearing + DEFAULT_VEE_DEGREES, {units: 'meters'});
    return [end, apex, swung.geometry.coordinates];
}

/** One arm's stepped run, apex to tip, on the side `outward` points. */
function arm(apex: Position, tip: Position, outwardSign: number): Position[] {
    const bearing = turf.bearing(turf.point(apex), turf.point(tip));
    const length = turf.distance(turf.point(apex), turf.point(tip), {units: 'meters'});
    if (!Number.isFinite(length) || length <= 0) return [apex, tip];

    return SEARCH_AREA_ARM.map(([along, across]) => {
        // Along the arm first, then square across it — the construction every other
        // offset in this library uses, so "across" means the same thing everywhere.
        const on = turf.destination(turf.point(apex), length * along, bearing, {units: 'meters'});
        if (across === 0) return on.geometry.coordinates as Position;
        const side = bearing + 90 * outwardSign * Math.sign(across);
        const off = turf.destination(on, length * Math.abs(across), side, {units: 'meters'});
        return off.geometry.coordinates as Position;
    });
}

/**
 * Which way is **outward** for the arm running apex → tip, given the other arm's tip.
 *
 * Signed area of the triangle, so it answers the question the geometry actually asks —
 * "which side of this arm is the rest of the symbol on" — rather than depending on the
 * order the operator happened to click. Drawing the same V clockwise or anticlockwise
 * otherwise mirrors both steps inward and the two arms cross.
 */
function outwardSign(apex: Position, tip: Position, other: Position): number {
    const cross = (tip[0] - apex[0]) * (other[1] - apex[1]) - (tip[1] - apex[1]) * (other[0] - apex[0]);
    // Outward is away from the other arm, so the opposite hand from the cross product.
    return cross >= 0 ? 1 : -1;
}

export class SearchArea extends TacticalGraphicsBase {
    name: string = TacticalGraphicName.SearchArea;
    type: string = 'LineString';

    /**
     * The two arms, as a `MultiLineString`.
     *
     * The arrowheads are **not** here: they are a fixed screen size and are built by the
     * paint, like the convoys' block head and the maritime lines' letters. A head baked
     * into the GeoJSON in metres grows as the map is zoomed in, which is the failure
     * `screenSizedArrowHead` exists to undo for the generators that predate the rule.
     */
    generateGraphics(base: Feature<LineString>, _opts: IBaseGraphicOptions | undefined): Feature<MultiLineString> {
        const coords = asSearchVee(base.geometry.coordinates);
        if (coords.length < 3) return this.asMultiLineStringFeature([coords]);
        const [first, apex, second] = [coords[0], coords[1], coords[coords.length - 1]];
        return this.asMultiLineStringFeature([
            arm(apex, first, outwardSign(apex, first, second)),
            arm(apex, second, outwardSign(apex, second, first)),
        ]);
    }

    /** `[tip, tip, apex]` — leg ends first, apex last, which is fields of fire's contract. */
    generateHandles(base: Feature<LineString>, _opts: IBaseGraphicOptions | undefined): Feature<MultiPoint> {
        const coords = asSearchVee(base.geometry.coordinates);
        const ends = [coords[0], coords[coords.length - 1]];
        if (coords.length < 3) return this.asMultiPointFeature(ends);
        return this.asMultiPointFeature([...ends, coords[Math.floor(coords.length / 2)]]);
    }

    /**
     * The vertex, and only the vertex.
     *
     * There is no designation to draw — the plate letters nothing but `A`, which is a
     * symbol rather than text — so this exists to give a renderer the point the standard
     * says the tactical symbol indicator is centred over.
     */
    generateLabels(base: Feature<LineString>, _opts: IBaseGraphicOptions | undefined): Feature<MultiPoint> {
        const coords = asSearchVee(base.geometry.coordinates);
        if (coords.length < 3) return this.asMultiPointFeature([]);
        return this.asMultiPointFeature([coords[Math.floor(coords.length / 2)]]);
    }
}
