import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint, Position} from "geojson";
import geometryService from "../core/GeometryService";
import * as turf from '../core/turf';

/**
 * The bar half-height of a fire-position symbol, as a fraction of the shaft the
 * user drew. Everything else in the symbol is derived from the bar (see the
 * FIRE_POSITION_* ratios in `GeometryService`), so this is the single knob for
 * how big the whole thing renders.
 *
 * The doctrinal construct draws the bar at 0.76 of its shaft, but the construct's
 * shaft is a stub pointing at an adjacent objective — at that ratio a symbol
 * dragged across a map stands two and a half times taller than the line the user
 * drew. 0.45 keeps the footprint roughly square and comparable to the graphic's
 * previous size while still reading as the doctrinal shape.
 */
const FIRE_POSITION_BAR_RATIO = 0.45;

/**
 * Feather length as a share of the bar's half-length, and arrowhead length in the same
 * units — the two proportions 152100's plate leaves to the picture once its four points are
 * placed. Both carried over from `GeometryService`'s FIRE_POSITION_* set, which measured
 * them off the FM 1-02.2 table 6-1 constructs; the anchor points changed on 2026-09-06, the
 * decoration did not.
 */
const SBF_FEATHER_RATIO = 0.95;
const SBF_ARROWHEAD_RATIO = 0.52;

/**
 * 152100 support by fire, from the four points its Draw Rules name.
 *
 * > This symbol requires four anchor points. Points 1 and 2 define the endpoints of the
 * > straight line on the back side of the symbol. Points 3 and 4 define the tips of the
 * > arrowheads.
 * >
 * > Points 1 and 2 determine the length of the straight line on the back side of the symbol.
 * > **The rear of the arrows should connect to points 1 and 2.**
 *
 * So every line in the symbol is stated: the bar is point 1 to point 2, and one arrow rises
 * from each of its ends to the tip the operator placed. Nothing is derived but the feathers
 * swept back off the bar's ends and the arrowheads, which are decoration.
 *
 * **It was a two-point graphic until 2026-09-06** — a shaft, off which the bar, both arrows
 * and their spread were all computed by ratio. The arrowheads "indicate the left and right
 * limits of coverage that the firing position is meant to support", and a limit of coverage
 * derived from a ratio is not a limit anybody stated.
 *
 * Returned as one polyline for the bracket plus a shaft and a head per arrow.
 * `firePositionStyles` strokes the whole collection, so the order carries no meaning here.
 */
function supportByFireFromAnchors(coords: Position[]): Position[][] {
    const [rearLeft, rearRight, tipLeft, tipRight] = coords;

    const bar = turf.bearing(turf.point(rearLeft), turf.point(rearRight));
    const barHalf = turf.distance(turf.point(rearLeft), turf.point(rearRight), {units: 'meters'}) / 2;

    /*
     * Which side the arrows rise on, so the feathers sweep back the other way. Taken from the
     * across-bar component of point 1 -> point 3: the plate draws the feathers opposite the
     * arrows, and a symbol drawn "upside down" has to keep them there.
     */
    const toTip = turf.bearing(turf.point(rearLeft), turf.point(tipLeft));
    const side = Math.sign(Math.sin(((toTip - bar) * Math.PI) / 180)) || 1;

    const featherLength = barHalf * SBF_FEATHER_RATIO;
    const feather = (from: Position, bearing: number): Position =>
        turf.destination(turf.point(from), featherLength, bearing, {units: 'meters'}).geometry
            .coordinates as Position;

    // Back along the bar and away from the arrows, 45 degrees off each end.
    const bracket = [
        feather(rearLeft, bar + 180 + 45 * side),
        rearLeft,
        rearRight,
        feather(rearRight, bar - 45 * side),
    ];

    const headLength = barHalf * SBF_ARROWHEAD_RATIO;
    return [
        bracket,
        [rearLeft, tipLeft],
        geometryService.computeArrowheadPoints(rearLeft, tipLeft, headLength, 45),
        [rearRight, tipRight],
        geometryService.computeArrowheadPoints(rearRight, tipRight, headLength, 45),
    ];
}

/**
 * Block-arrow mission task graphic with a configurable name.
 *
 * AttackByFire and SupportByFire render the doctrinal fire-position symbols — a
 * bar with two feathers swept back off its ends, plus one arrow out of the bar's
 * middle (attack) or two diverging off its ends (support). All other names render
 * the plain T-shape block arrow.
 *
 * Used for: AttackByFire and SupportByFire. Destroy, Interdict, Neutralize and
 * Suppress used to route through here too; they are crossed lines in FM 1-02.2,
 * not block arrows, and now have their own point-anchored generator — see
 * `CrossedMissionTask`. FollowAndAssume and FollowAndSupport were the last two
 * users of the plain block-arrow branch and are currently excluded — see
 * `ai/excluded-graphics.md`. Keep that branch: it is what they come back to.
 */
export class NamedBlockArrow extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string;
    /**
     * **LineString, not Point.** This generator is driven by a drawn line — its
     * `generateGraphics` takes `Feature<LineString>` — and declaring `Point` made
     * `renderTacticalGraphic` reject every base a consumer could give it. The
     * OpenLayers holders never noticed because they call the registry directly and
     * bypass that guard; the public entry point is the only reader of this field.
     */
    type: string = 'LineString';

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    private isFirePosition(): boolean {
        return this.name === TacticalGraphicName.AttackByFire
            || this.name === TacticalGraphicName.SupportByFire;
    }

    /**
     * Bar half-height in meters, derived from the drawn line's own length rather
     * than from `opts.size` — the Fix pattern. `opts.size` is a map-unit value
     * baked at construction time, so driving the bar off it would let the shaft
     * grow on resize while the bar stayed put.
     */
    private barHalf(base: Feature<LineString>): number {
        const coords = base.geometry.coordinates;
        const shaftLength = turf.distance(
            turf.point(coords[0]),
            turf.point(coords[coords.length - 1]),
            {units: 'meters'},
        );
        return shaftLength * FIRE_POSITION_BAR_RATIO;
    }

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<LineString | MultiLineString> {
        if (this.name === TacticalGraphicName.AttackByFire) {
            return geometryService.getAttackByFireSymbol(base.geometry.coordinates, this.barHalf(base));
        }
        if (this.name === TacticalGraphicName.SupportByFire) {
            const coords = base.geometry.coordinates;
            // Four placed points as of 2026-09-06. A base saved before that describes a shaft
            // and nothing else, and the ratio-built symbol is what it still draws as.
            if (coords.length >= 4) return this.asMultiLineStringFeature(supportByFireFromAnchors(coords));
            return geometryService.getSupportByFireSymbol(coords, this.barHalf(base));
        }
        return geometryService.getBlockArrow(base, opts.size);
    }

    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        if (this.name === TacticalGraphicName.SupportByFire && base.geometry.coordinates.length >= 4) {
            // `[point 1, point 2, point 3, point 4]` — the bar's two ends and both arrow tips,
            // every one placed. There is no width to drag any more: the bar was a ratio of the
            // shaft and it is two anchor points now. @see handleContract
            return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 4));
        }
        if (this.isFirePosition()) {
            // [offsetHandle (dropped by the openlayers Block holder — the symbol is
            //  ratio-locked, so there is no width to drag), startHandle, endHandle]
            const coords = base.geometry.coordinates;
            return this.asMultiPointFeature([coords[0], coords[0], coords[coords.length - 1]]);
        }
        const arrow = geometryService.getBlockArrow(base, opts.size).geometry.coordinates;
        return this.asMultiPointFeature([arrow[3], arrow[0], arrow[1]]);
    }

    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        if (this.isFirePosition()) {
            // Anchored at the bar's center. Both fire-position symbols are drawn
            // shape-only — the style function renders no text — but a library
            // consumer still gets a sane anchor to hang one off.
            return this.asMultiPointFeature([base.geometry.coordinates[0]]);
        }
        const arrow = geometryService.getBlockArrow(base, opts.size).geometry.coordinates;
        return this.asMultiPointFeature([arrow[0]]);
    }
}
