import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {PointGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, GeometryCollection, MultiPoint, Point, Position} from 'geojson';
import geometryService from '../core/GeometryService';
import {toRadians} from '../core/math';
import {publishesAnchorHandleOnly} from '../core/symbology';

/**
 * The four diagonals the arrows arrive along, in degrees CCW from east, before `rotation`.
 *
 * The plate puts one arrow in each quadrant and nothing on the cardinals, and that is the
 * symbol: turned 45 degrees it would read as arrows converging along the compass points,
 * which is a picture the standard does not draw. Rotation is refused for the same reason
 * it is refused for Destroy. @see RESIZE_ONLY_SYMBOLS
 */
const ARROW_ANGLES_DEG = [45, 135, 225, 315];

/**
 * The arrow's proportions, as fractions of its own reach — the distance from the centre to
 * its outer end.
 *
 * **Measured off APP-06 344300's Template at 600 dpi**, not chosen. The ink was segmented
 * into its four arrows and one was profiled perpendicular to its axis: the width grows
 * linearly from nothing at the tip to 125 px at 115 px back, then steps to a constant
 * 50 px for the remaining 300 px. So the head is a plain isosceles triangle on a
 * rectangular shaft, with a base square to the axis — there are no swept-back barbs, which
 * is what the low-resolution plate looks like it has.
 *
 * On the same measurement the reach is 519 px and the tip stands 99.7 px off the centre,
 * which is the gap the `D` sits in.
 */
const REACH_TO_TIP = 0.192;
const REACH_TO_HEAD_LENGTH = 0.222;
const REACH_TO_HEAD_HALF_WIDTH = 0.12;
const REACH_TO_SHAFT_HALF_WIDTH = 0.048;

/**
 * APP-06 344300 defeat — four solid arrows converging on a `D`.
 *
 * **Destroy's contract, exactly.** 344300's Draw Rules cell is word for word 340900's —
 * *"This symbol requires one anchor point. The centre point defines centre of the symbol.
 * Size/Shape. Static. Orientation. The symbol is typically centred over the desired
 * location."* — so it is point-anchored, translates and resizes, refuses rotation, and
 * drops at the crossed tasks' own size. Nothing here is a new interaction.
 *
 * **The arrows are geometry, not a paint-time decoration.** Each is a closed ring the paint
 * fills, in the shape the plate draws: a rectangular shaft with a triangular head. Building
 * them here rather than in a style function is what lets both renderers draw the same
 * symbol and what lets a test assert the shape — @see defeatPaint, which only fills them.
 *
 * The `D` is not cut out of anything: the ring stops short of the centre by
 * {@link REACH_TO_TIP} of the reach, which is where the plate stops it, and the label rides
 * its own feature at the centre. That is the difference from the crossed tasks, whose arms
 * run through the middle and are cut by the style function against the glyph it measures.
 */
export class Defeat extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.Defeat;
    type: string = 'Point';

    /**
     * One filled ring per arrow, tail first, running clockwise in the arrow's own frame.
     *
     * Every vertex is placed polar from the centre — one distance and one bearing — rather
     * than by stepping along the axis and then sideways.
     *
     * **Not because the two-step form was measured to be wrong: it is not.** Both were
     * built and compared at 0, 45, 60 and 75 degrees north, and the ground half-width of
     * the shaft holds to three parts in a million either way at this symbol's scale — the
     * arrow is about a kilometre wide and the offset is a rounding error against the
     * curvature. `conventions.md` records geodesic steps not commuting because it has cost
     * real time, but the cases that bit were a 77 km run and a bearing taken from the wrong
     * end, not a perpendicular this short.
     *
     * It is polar because it is *exact by construction* and needs no such argument: the
     * corner is defined by an angle from the centre, so that is what is asked for. One call
     * rather than two, and nothing to re-measure if the symbol is ever drawn much larger.
     */
    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<GeometryCollection> {
        const center = base.geometry.coordinates;
        const {rotation, size} = opts;
        // The reach is the box's half-width out to a corner, which is where Destroy's arms
        // end too — one number describes both symbols' extent. @see CrossedMissionTask
        const reach = size * Math.SQRT2;

        const tip = reach * REACH_TO_TIP;
        const headBase = tip + reach * REACH_TO_HEAD_LENGTH;
        const headHalf = reach * REACH_TO_HEAD_HALF_WIDTH;
        const shaftHalf = reach * REACH_TO_SHAFT_HALF_WIDTH;

        const rings = ARROW_ANGLES_DEG.map(angleDeg => {
            const axis = toRadians(angleDeg + rotation);
            /** A point `along` out from the centre and `across` to the left of the axis. */
            const at = (along: number, across: number): Position =>
                geometryService.translateCoordinates(center, Math.hypot(along, across), axis + Math.atan2(across, along));

            const ring: Position[] = [
                at(reach, shaftHalf),
                at(reach, -shaftHalf),
                at(headBase, -shaftHalf),
                at(headBase, -headHalf),
                at(tip, 0),
                at(headBase, headHalf),
                at(headBase, shaftHalf),
            ];
            ring.push(ring[0]);
            return ring;
        });

        return this.asGeometryCollectionFeature(rings.map(ring => this.asPolygonFeature([ring]).geometry));
    }

    /**
     * **The centre, alone** — APP-06 344300 gives it one anchor point and that is it.
     *
     * The same branch Destroy and the other three crossed tasks take, from the same table,
     * so the five letter-in-the-middle tasks cannot end up with different handle sets.
     * It still resizes; this decides what is grabbable, not what is allowed.
     * @see publishesAnchorHandleOnly
     */
    generateHandles(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiPoint> {
        const center = base.geometry.coordinates;
        if (publishesAnchorHandleOnly(TacticalGraphicName.Defeat)) {
            return this.asMultiPointFeature([center]);
        }
        const edge = geometryService.translateCoordinates(center, opts.size, toRadians(opts.rotation));
        return this.asMultiPointFeature([edge, center]);
    }

    /** The `D`, at the centre the arrows point to. */
    generateLabels(base: Feature<Point>): Feature<Point> {
        return this.asPointFeature(base.geometry.coordinates);
    }
}
