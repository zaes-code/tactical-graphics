import {Feature, MultiPoint, Point, Polygon, Position} from 'geojson';
import {RectangularTargetOptions, TacticalGraphicName} from '../core/type';
import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {rectangleFromAxis} from '../core/anchors';
import * as turf from '../core/turf';

/** Full length used when a target files none, in metres. */
const DEFAULT_LENGTH_M = 2000;
/** Half-width used when a target files none, in metres. */
const DEFAULT_HALF_WIDTH_M = 500;

/**
 * `metres` along a true bearing.
 *
 * Deliberately not `GeometryService.translateCoordinates`, which takes a *planar* angle in
 * radians and reads 0 as east. The attitude is a compass bearing, and `rectangleFromAxis`
 * — which this hands off to — works in the same terms.
 */
function along(from: Position, metres: number, bearingDeg: number): Position {
    return turf.destination(turf.point(from), metres, bearingDeg, {units: 'meters'}).geometry.coordinates as Position;
}

/**
 * Rectangular target (APP-06 240802) — **one anchor point, and a shape made of amplifiers**.
 *
 * ## Why this is not `RectangularArea`
 *
 * Every other rectangle in the set is "two anchor points and a width, defined in metres":
 * the user drags a box, the two points give the length and the orientation, and only the
 * width is typed. This one is different, and its plate says so in as many words — it
 * "requires one (1) anchor point", with "the target length (AM1) in metres and target
 * width (AM) in metres" and a target attitude (AN).
 *
 * So the anchor is the centre and nothing about the shape comes from geometry. That is the
 * whole reason it needs its own generator rather than a flag on the rectangular area: the
 * two disagree about what a base *is*, not about how to draw a box.
 *
 * **This is a breaking change for saved targets.** A rectangular target stored before 3.2.0
 * carries a two-point `LineString` base and will not restore as the same shape; the anchor
 * count is part of the symbol's definition, so there is no reading of the old geometry that
 * is also correct under the plate. (User's call, 2026-08-31.)
 *
 * ## Attitude
 *
 * `rotation` is the attitude, in degrees clockwise from north like every other angle here.
 * The plate quotes AN in mils; converting for display is a host's business, and carrying a
 * second field for the same physical quantity would be the parallel-flag mistake.
 */
export class RectangularTarget extends TacticalGraphicsBase {
    name: string;
    type: string = 'Point';

    constructor(tacticalGraphicName: TacticalGraphicName) {
        super();
        this.name = tacticalGraphicName;
    }

    /** The centre, the two axis ends and the half-width, defaulted for a bare point. */
    private frame(base: Feature<Point>, opts: RectangularTargetOptions | undefined) {
        const center = base.geometry.coordinates;
        const length = opts?.length && opts.length > 0 ? opts.length : DEFAULT_LENGTH_M;
        const halfWidth = opts?.radius && opts.radius > 0 ? opts.radius : DEFAULT_HALF_WIDTH_M;
        /*
         * **`rotation` is planar here, and `along` wants a compass bearing.**
         *
         * The point-anchored holders measure rotation the way trigonometry does — 0 is
         * east, counter-clockwise positive — while a bearing is 0 at north and runs
         * clockwise. `90 - r` is the conversion, and without it the box was built at right
         * angles to the grip that sized it: drag east, get a box running north.
         */
        const attitude = 90 - (opts?.rotation ?? 0);

        // Half the length either side of the centre, along the attitude. `rectangleFromAxis`
        // then takes it from there, so the corner construction stays in one place.
        const half = length / 2;
        const p1 = along(center, half, attitude + 180);
        const p2 = along(center, half, attitude);
        return {center, p1, p2, halfWidth, length, attitude};
    }

    generateGraphics(base: Feature<Point>, opts: RectangularTargetOptions | undefined): Feature<Polygon> {
        const {p1, p2, halfWidth} = this.frame(base, opts);
        return this.asPolygonFeature([rectangleFromAxis(p1, p2, halfWidth)]);
    }

    /**
     * `[length grip, width grip, centre]`.
     *
     * **Two grips, because the plate gives this symbol two independent dimensions.** Every
     * other point-anchored graphic has one number to drag — a radius — so the convention
     * there is `[edge, centre]`. A rectangle sized entirely by amplifiers has a length and
     * a width, and a single grip can only set one of them; the other would be typed-only,
     * which is a control the user cannot see.
     *
     * - **Grip 0** sits at the middle of the leading short side, one half-length out along
     *   the attitude. Dragging it swings the attitude and sets the length together.
     * - **Grip 1** sits at the middle of a long side, one half-width out across the
     *   attitude. Dragging it sets the width and nothing else.
     *
     * Both sit exactly *on* the outline, which is what lets the measure read-out end on the
     * edge it is reporting rather than extrapolating a distance past it.
     *
     * The centre is last and is split off by position, not index. @see publishHandles
     */
    generateHandles(base: Feature<Point>, opts: RectangularTargetOptions | undefined): Feature<MultiPoint> {
        const {center, p2, halfWidth, attitude} = this.frame(base, opts);
        return this.asMultiPointFeature([p2, along(center, halfWidth, attitude + 90), center]);
    }

    generateLabels(base: Feature<Point>, opts: RectangularTargetOptions | undefined): Feature<Point> {
        return this.asPointFeature(this.frame(base, opts).center);
    }
}
