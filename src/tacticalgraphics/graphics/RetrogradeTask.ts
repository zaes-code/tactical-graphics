import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {Feature, LineString, MultiLineString, MultiPoint, Point, Position} from "geojson";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import geometryService from "../core/GeometryService";
import * as turf from "../core/turf";

/**
 * The seven cane-arrow retrograde and passage tasks, **built from three anchor points.**
 *
 * ## One rule, shared word for word
 *
 * APP-06 states the same Anchor Points and Size/Shape paragraph for every one of them:
 *
 * > This symbol requires three anchor points. **Point 1 defines the tip of the arrowhead.**
 * > Point 2 defines the end of the straight line portion of the symbol. Point 3 defines the
 * > diameter and orientation of the 180 degree circular arc.
 * >
 * > Points 1 and 2 determine the length of the straight line portion of the symbol. Point 3
 * > defines which side of the line the arc is on and the diameter of the arc.
 *
 * | Code | Graphic | Draw Rules cell |
 * |---|---|---|
 * | 340800 | delay | its own |
 * | 342000 | retirement | its own |
 * | 342400 | withdraw | its own |
 * | 342500 | withdraw under pressure | **empty - inherits 342400** |
 * | 344100 | forward passage of lines | its own |
 * | 344200 | rearward passage of lines | its own |
 * | 344400 | disengage | its own |
 *
 * 342500's cell really is empty: its page opens with the tail of 342400's paragraph
 * ("...line portion of the symbol. Point 3 defines which side...") continuing across the
 * page break, and then goes straight on to 342600. The row inherits, as 94 others do.
 *
 * Six of the seven add *"The 180 degree circular arc is always perpendicular to the line"*.
 * **344400 disengage does not** - it is the one row that omits the sentence. It is drawn
 * square here regardless, which is an **interpretation**: the six it shares a rule and a
 * picture with all state it, and an arc meeting the line at any other angle is a shape the
 * plate does not draw.
 *
 * ## What this changed
 *
 * The base carried two points and the arc came from a `size` amplifier with a `mirrored`
 * flag for its side - so the third of the plate's three anchor points had nowhere to live,
 * the diameter could not be set by pointing at it, and which side the cane hung on was a
 * hidden boolean rather than a place. Point 3 states both, exactly as it does for 152800,
 * whose rule is this one minus the barbs clause. @see mobileDefenceAnchors
 *
 * ## Reading order
 *
 * These are `TIP_FIRST_GRAPHICS`, so the **stored** base is APP-06's `[tip, join, far]` and
 * `TacticalGraphicsBase.generate` hands this class the reverse, `[far, join, tip]`. Read
 * from the end - tip last, join before it - with point 3 at index 0, which is the same way
 * `MobileDefense.frame` reads its own three. @see generatorOrder
 */
export class RetrogradeTask extends TacticalGraphicsBase<PointGraphicOptions> {
    name: TacticalGraphicName;
    type: string = "LineString";

    constructor(tacticalGraphicName: TacticalGraphicName) {
        super();
        this.name = tacticalGraphicName;
    }

    /**
     * The three points the cane is built from, or `undefined` for a legacy two-point base.
     *
     * `far` is point 3 squared onto the perpendicular at `join`, because the arc is
     * perpendicular to the line: its along-axis component is a freedom the symbol does not
     * have. `normalizeDrawnBase` already squares the click, so for anything drawn since this
     * change the projection is the identity - it is here for a base edited vertex by vertex,
     * where the Modify interaction can put point 3 anywhere.
     */
    private frame(base: Feature<LineString>) {
        const coords = base.geometry.coordinates;
        if (coords.length < 3) return undefined;

        const tip = coords[coords.length - 1];
        const join = coords[coords.length - 2];
        const axis = turf.bearing(turf.point(join), turf.point(tip));

        const reach = turf.distance(turf.point(join), turf.point(coords[0]), {units: 'meters'});
        const toward = turf.bearing(turf.point(join), turf.point(coords[0]));
        const across = reach * Math.sin(((toward - axis) * Math.PI) / 180);
        if (!isFinite(across) || across === 0) return undefined;

        const far = turf.destination(turf.point(join), Math.abs(across), axis + Math.sign(across) * 90, {
            units: 'meters',
        }).geometry.coordinates as Position;
        return {tip, join, far, axis};
    }

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiLineString> {
        const frame = this.frame(base);
        // A base saved before 2026-09-06 has two points and states its arc as a `size` and a
        // `mirrored` flag. It keeps drawing exactly as it did, and grows its third point the
        // first time someone edits it. @see GeometryService.getCaneArrow
        if (!frame) return geometryService.getCaneArrow(base, opts.size, opts.size, opts.mirrored ?? false);

        const {tip, join, far, axis} = frame;
        const centre = turf.midpoint(turf.point(join), turf.point(far));
        const radius = turf.distance(turf.point(join), turf.point(far), {units: 'meters'}) / 2;
        const arrowHead = geometryService.computeArrowheadPoints(join, tip, Math.abs(opts?.size ?? radius), 45);

        return this.asMultiLineStringFeature([[join, tip], arrowHead, this.arc(centre, radius, join, axis)]);
    }

    /**
     * The 180 degree arc, swept so it **begins at point 2 and bulges away from the tip.**
     *
     * `turf.lineArc` always sweeps clockwise from its first bearing to its second, so which
     * half of the circle comes back depends on which end you start from - asking for the
     * "other" half by negating both ends returns a different, smaller segment rather than a
     * mirror. The half wanted is the one whose apex points back down the line, so that is
     * what is tested, and the other case is the same sweep taken from the far end and
     * reversed, which keeps the arc starting where the straight leaves off.
     */
    private arc(centre: Feature<Point>, radius: number, join: Position, axis: number): Position[] {
        const norm = (deg: number): number => ((deg % 360) + 360) % 360;
        const fromCentre = turf.bearing(centre, turf.point(join));
        // Where the apex has to land: back down the line, away from the arrowhead.
        const apex = norm(axis + 180 - fromCentre);

        if (apex < 180) {
            return turf.lineArc(centre, radius, fromCentre, fromCentre + 180, {units: 'meters'})
                .geometry.coordinates as Position[];
        }
        const swept = turf.lineArc(centre, radius, fromCentre + 180, fromCentre + 360, {units: 'meters'})
            .geometry.coordinates as Position[];
        return [...swept].reverse();
    }

    /**
     * The three anchor points, in the order the generator reads them - point 3, point 2,
     * point 1 - so a renderer publishing them in order grips the plate's own points.
     *
     * A legacy two-point base keeps the pair it had: the cane's free end, which is where the
     * mirror handle sat, and the arrowhead.
     */
    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        const frame = this.frame(base);
        if (!frame) {
            const graphic = geometryService.getCaneArrow(base, opts.size, opts.size, opts.mirrored ?? false);
            const cane = graphic.geometry.coordinates[graphic.geometry.coordinates.length - 1];
            // A one-click base draws no cane, so there is no grip to publish either.
            // @see GeometryService.getCaneArrow
            if (!cane?.length) return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 1));
            return this.asMultiPointFeature([cane[cane.length - 1], base.geometry.coordinates[1]]);
        }
        return this.asMultiPointFeature([frame.far, frame.join, frame.tip]);
    }

    /** The letter sits at the base of the arc, which is where the unit's location is. */
    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<Point> {
        return this.asPointFeature(base.geometry.coordinates[0]);
    }

}

/**
 * Exfiltrate — the drawn route, kept whole, with an arrowhead on its far end.
 *
 * Deliberately NOT a `RetrogradeTask`. It used to borrow the cane arrow, which
 * gave it two things it should not have: the half-circle hook at the start (that
 * hook is what distinguishes withdraw / delay / retirement from an exfiltration),
 * and a two-point limit, because `getCaneArrow` puts the arrowhead at
 * `baseCoords[1]` rather than at the end of the path. An exfiltration route bends,
 * so every vertex the user drew is kept and the arrowhead follows the last
 * segment's bearing.
 *
 * Returned MultiLineString segments:
 *   0: the route  (every drawn vertex)
 *   1: arrowhead  (3 points, at the last vertex)
 */
export class Exfiltrate extends TacticalGraphicsBase<PointGraphicOptions> {
    name: TacticalGraphicName = TacticalGraphicName.Exfiltrate;
    type: string = "LineString";

    /**
     * The S, per 343700's three anchor points.
     *
     * > Point 1 defines the end of the straight line portion of the graphic. Point 2
     * > defines the centre of the two 90 degree circular arcs. Point 3 defines the tip of
     * > the arrowhead.
     *
     * This used to draw the operator's raw polyline with a head on the end — a route, not
     * the symbol. The plate is a specific shape: a straight run carrying `EX`, an S made of
     * two quarter turns, and a straight run to the arrowhead.
     * @see GeometryService.createSCurve for why point 2 reads as depth and side
     */
    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiLineString> {
        const coords = base.geometry.coordinates;
        if (coords.length < 3) return this.asMultiLineStringFeature([coords]);

        const path = geometryService.createSCurve(coords[0], coords[2], coords[1]);
        // **Capped against the run.** `opts.size` is the holder's decoration size in metres
        // and is far larger than this symbol's head: unclamped it drew a V spanning most of
        // the graphic, which reads as the path folding back on itself rather than as an
        // arrowhead. A sixth of the run is what the plate draws.
        // A sixth of the run, and **never larger** — `opts.size` is the holder's decoration
        // size in metres and dwarfs this symbol's head. A caller with no size at all is the
        // ordinary case for a consumer reading raw GeoJSON, and `Math.min(undefined, x)` is
        // NaN, which loses the arrowhead entirely.
        const run = turf.distance(turf.point(coords[0]), turf.point(coords[2]), {units: 'meters'});
        const head = Math.min(opts?.size ?? Number.POSITIVE_INFINITY, run / 6);
        const arrowhead = geometryService.computeArrowheadPoints(
            path[path.length - 2],
            path[path.length - 1],
            head,
            45,
        );
        return this.asMultiLineStringFeature([path, arrowhead]);
    }

    /** The three anchor points, in the order the standard numbers them. */
    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 3));
    }

    /**
     * A two-point span along the **first straight**, so a renderer takes both the anchor
     * and the rotation of the `EX` label from it.
     *
     * Point 1 is the free end of that straight and the S begins part way along it, so the
     * span runs from point 1 toward point 2 rather than to the next drawn vertex — which
     * on a three-point base is the middle of the curve.
     */
    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        const c = base.geometry.coordinates;
        if (c.length < 3) return this.asMultiPointFeature(c.slice(0, 2));
        const path = geometryService.createSCurve(c[0], c[2], c[1]);
        return this.asMultiPointFeature([path[0], path[1]]);
    }
}

/**
 * Infiltrate (APP-06 343800) — **the exfiltration, with a different letter.**
 *
 * The two Draw Rules are the same text: three anchor points meaning the same three things,
 * one construction, one arrowhead. They differ by a typo — *"the length of the of the
 * symbol"* — and by one word of Orientation, *friendly* forces against *enemy* forces, which
 * tells the operator which way to aim it and changes no geometry.
 *
 * So this is a subclass carrying only the name, and it stays that way. Sharing the geometry
 * alone was tried and was not enough: the two still had different holders, different
 * controllers, different label paints and differently-sized arrowheads, and every one of
 * those was visible. A symbol whose only difference from another is its letter should be
 * one class.
 */
export class Infiltration extends Exfiltrate {
    name: TacticalGraphicName = TacticalGraphicName.Infiltration;
}
