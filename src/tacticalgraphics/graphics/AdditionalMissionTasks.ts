import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint, Position} from "geojson";
import geometryService from "../core/GeometryService";
import * as turf from '../core/turf';
import {squareOntoBisector, supportByFireAnchors} from '../core/anchors';

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
 * APP-06 152000's three anchor points, from however many clicks are down.
 *
 * > Anchor Points: This symbol requires three anchor points. Point 1 is the tip of the
 * > arrowhead. Points 2 and 3 define the endpoints of the straight line on the back side of
 * > the symbol.
 * >
 * > Size/Shape: Points 2 and 3 determine the length of the straight line on the back side of
 * > the symbol. The rear of the arrowhead line shall connect to the midpoint of the line
 * > between points 2 and 3. The arrowhead line shall be perpendicular to the line formed by
 * > points 2 and 3.
 *
 * **All three are placed, and it is point 1 that gives way.** Points 2 and 3 set the back
 * line's length *and* its orientation, exactly as the Size/Shape cell says. That leaves the
 * arrow over-constrained — it must start at point 1, meet the midpoint, and stand square to
 * the back line, which three free points cannot all satisfy — so point 1 is read for the one
 * thing the symbol can express: **how far it reaches from the middle**. Its component along
 * the back line is discarded and it is set on the perpendicular bisector, which makes both of
 * the plate's sentences true by construction rather than by the operator's aim. (User's call,
 * 2026-09-06: "let the user pick point 3 as documentation says […] arrowline needs to always
 * be at the middle/center of line 2,3".)
 *
 * That is `sideAnchors`' arithmetic, about the midpoint instead of an edge's end — the same
 * projection the bracket tasks and the obstacle bypasses apply to *their* third point, for
 * the same reason: a component the symbol cannot draw is better dropped than stored.
 *
 * **Two clicks preview it.** The tip and one end of the back line leave a family of symbols
 * rather than one, so the preview closes it the way 141700 ambush does — the shape is held at
 * the ratio the symbol is already drawn at and the click sets only the size — and the third
 * click replaces that guess with a placed point. The arithmetic there is a right triangle:
 * the axis makes `atan(ratio)` with the click, so the shaft is `span / sqrt(1 + ratio^2)`.
 */
export function firePositionAnchors(clicks: Position[] | undefined): Position[] | undefined {
    if (!clicks || clicks.length < 2) return undefined;

    if (clicks.length >= 3) {
        const [tip, one, two] = clicks;
        const squared = squareOntoBisector(tip, one, two);
        return squared ? [squared, one, two] : undefined;
    }

    const [tip, click] = clicks;
    const span = turf.distance(turf.point(tip), turf.point(click), {units: 'meters'});
    if (!Number.isFinite(span) || span <= 0) return undefined;

    const stretch = Math.sqrt(1 + FIRE_POSITION_BAR_RATIO * FIRE_POSITION_BAR_RATIO);
    const shaft = span / stretch;
    const skew = (Math.atan(FIRE_POSITION_BAR_RATIO) * 180) / Math.PI;
    const axis = turf.bearing(turf.point(tip), turf.point(click)) - skew;

    const middle = turf.destination(turf.point(tip), shaft, axis, {units: 'meters'}).geometry.coordinates as Position;
    // Point 3 is point 2 reflected through the middle, which is what makes the middle their
    // midpoint exactly — the plate's own words — rather than to floating-point precision.
    const back = turf.distance(turf.point(middle), turf.point(click), {units: 'meters'});
    const away = turf.bearing(turf.point(middle), turf.point(click)) + 180;
    const other = turf.destination(turf.point(middle), back, away, {units: 'meters'}).geometry.coordinates as Position;
    return [tip, click, other];
}

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

    /**
     * 152000's three points, from however many the base carries — **including a half-drawn
     * two.**
     *
     * `firePositionAnchors` reads two points as *the tip and one end of the back line*, which
     * is what the operator has after the first click, so the preview is the symbol they are
     * drawing. It read them as the legacy `[bar centre, tip]` shaft until 2026-09-06, and
     * that pair runs the other way — so between the two clicks the bar sat on the arrowhead's
     * own point and the arrowhead followed the cursor, which is the symbol backwards.
     * (User's report, 2026-09-06: "after click one, point 2 needs to get the handle, then
     * point 3 gets the handle".)
     *
     * A genuinely legacy two-point base is not reached this way in practice: restore and
     * every MapLibre build run it through `normalizeDrawnBase` first and it arrives here as
     * three. What is left for the old reading is raw GeoJSON a consumer hand-wrote, and the
     * plate's own numbering — point 1 is the arrowhead — says this reading is the right one
     * for that too.
     */
    private firePositionPoints(base: Feature<LineString>): Position[] | undefined {
        return firePositionAnchors(base.geometry.coordinates);
    }

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<LineString | MultiLineString> {
        if (this.name === TacticalGraphicName.AttackByFire) {
            /*
             * `getAttackByFireSymbol` wants the shaft as `[bar centre, tip]` and the bar's
             * half-height. Both come straight out of the points: the centre is the midpoint
             * the plate names and the half-height is half the line between points 2 and 3.
             */
            const points = this.firePositionPoints(base);
            if (points) {
                const [tip, one, two] = points;
                const middle = turf.midpoint(turf.point(one), turf.point(two)).geometry.coordinates as Position;
                const half = turf.distance(turf.point(one), turf.point(two), {units: 'meters'}) / 2;
                return geometryService.getAttackByFireSymbol([middle, tip], half);
            }
            // One point is a draw that has only just started, and draws nothing rather than a
            // degenerate symbol built on a zero-length shaft.
            return this.asMultiLineStringFeature([]);
        }
        if (this.name === TacticalGraphicName.SupportByFire) {
            const coords = base.geometry.coordinates;
            /*
             * **Through the resolver, so a half-drawn symbol is the symbol being drawn.**
             *
             * This used to take the anchor-driven branch only at four points and fall back to
             * the pre-2026-09-06 description below — a shaft with the bar sized as a ratio of
             * it — for anything shorter. That reading takes the placed points to mean
             * something else, so between the second and fourth clicks the preview was a
             * differently-shaped figure that neither matched the clicks nor followed the
             * cursor. @see supportByFireAnchors
             */
            const points = supportByFireAnchors(coords);
            if (points) return this.asMultiLineStringFeature(supportByFireFromAnchors(points));
            // A base saved before the conversion describes a shaft and nothing else, and the
            // ratio-built symbol is what it still draws as. One click lands here too, and a
            // symbol on a zero-length back line is what it has to draw.
            return geometryService.getSupportByFireSymbol(coords, this.barHalf(base));
        }
        return geometryService.getBlockArrow(base, opts.size);
    }

    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        if (this.name === TacticalGraphicName.SupportByFire) {
            /*
             * `[point 1, point 2, point 3, point 4]` — the bar's two ends and both arrow tips,
             * every one placed. There is no width to drag any more: the bar was a ratio of the
             * shaft and it is two anchor points now. @see handleContract
             *
             * **Read through the same resolver the drawing uses**, so a half-drawn base
             * publishes a grip on the point the operator is placing. Without it the fallback
             * below answered `[coords[0], coords[0], coords[last]]` for every count under
             * four, which piled three grips on point 1 and gave the point being placed none.
             * @see supportByFireAnchors
             */
            const points = supportByFireAnchors(base.geometry.coordinates);
            if (points) return this.asMultiPointFeature(points);
        }
        if (this.name === TacticalGraphicName.AttackByFire) {
            /*
             * `[point 1, point 2, point 3]` — the arrowhead's tip and the back line's two
             * ends. The bar was a ratio of the shaft and is two anchor points now, so there
             * is no width left to drag.
             *
             * Read through the same resolver the drawing uses, so a half-drawn base publishes
             * the grip on the point the operator is placing rather than none at all.
             * @see firePositionAnchors
             */
            return this.asMultiPointFeature(this.firePositionPoints(base) ?? base.geometry.coordinates.slice(0, 1));
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
