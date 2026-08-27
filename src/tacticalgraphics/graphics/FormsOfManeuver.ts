import * as turf from '../core/turf';
import {MovementGraphicBase} from "./Movement";
import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {MovementGraphicOptions, PointGraphicOptions, TacticalGraphicName, TurnOptions} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint, Position} from "geojson";
import {anchorsForHook, ARC_ARROW_DEFAULT_REACH, arcAndArrowFromAnchors, HookFrame, hookFromAnchors, runAndArcFromAnchors} from "../core/anchors";
import geometryService from "../core/GeometryService";
import {toRadians} from "../core/math";

// ─── Solid movement arrow variants ───────────────────────────────────────────
// These share the SupportingAttack shape; identity is established by name/label.

class SolidManeuverArrow extends MovementGraphicBase {
    name: string;

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        let radius: number = opts?.radius || 20;
        let baseCoords = this.arrowCenterline(base, radius);
        let lastLinePoint = baseCoords[baseCoords.length - 1];
        let secondToLastLinePoint = baseCoords[baseCoords.length - 2];

        const leftArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, radius);
        const rightArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, -radius);
        const leftArrowHeadBase: Position = geometryService.getPerpendicularPoint(
            leftArrowBase[leftArrowBase.length - 1],
            leftArrowBase[leftArrowBase.length - 2],
            radius);
        const rightArrowHeadBase: Position = geometryService.getPerpendicularPoint(
            rightArrowBase[rightArrowBase.length - 1],
            rightArrowBase[rightArrowBase.length - 2],
            -radius,
        );
        const arrowTipCoord: Position = geometryService.getExtendedPoint(lastLinePoint, secondToLastLinePoint, radius);

        const arrowCoords: Position[] = [
            leftArrowBase[leftArrowBase.length - 1],
            leftArrowHeadBase,
            arrowTipCoord,
            rightArrowHeadBase,
            rightArrowBase[rightArrowBase.length - 1],
        ];
        return this.asMultiLineStringFeature([leftArrowBase, arrowCoords, rightArrowBase.reverse()]);
    }
}

// ─── MovementToContact — hollow arrow with back V-notch + two zigzag "contact" ─
// Point-based (resize + rotate only). At rotation = 0 the arrow points east.
// `size` is the big arrow's half-length (so full length = 2 * size).
//
// Composition (all in one MultiLineString):
//   1. Big outlined arrow: body rectangle + flared arrowhead + V-notched back.
//   2. Two lightning-bolt "contact" arrows emerging from the upper/lower
//      arrowhead edges, each tipped with a small arrowhead.
export class MovementToContact extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.MovementToContact;
    type: string = 'Point';

    generateGraphics(base: Feature<any>, opts: PointGraphicOptions): Feature<MultiLineString> {
        const center = base.geometry.coordinates;
        const {rotation, size} = opts;
        const r = Math.max(size, 1);

        // Convert a local Cartesian offset (x east, y north) in meters to a
        // geographic position, applying `rotation` in planar degrees (0 = east,
        // 90 = north). Matches the bearing convention used by Ambush.
        const local = (x: number, y: number): Position => {
            const dist = Math.hypot(x, y);
            if (dist === 0) return [center[0], center[1]];
            const planarDeg = (Math.atan2(y, x) * 180) / Math.PI;
            let bearing = 90 - (planarDeg + rotation);
            bearing = ((bearing % 360) + 360) % 360;
            return turf.destination(center, dist, bearing, {units: 'meters'}).geometry.coordinates as Position;
        };

        // ── Big arrow outline (V-notch removed, back is open) ─────────
        // Vertices D and G removed; the upper body/fin is now one diagonal
        // segment CE, the lower is one diagonal segment HF. Fin tips E/F
        // flare outward (|y| = yFin) farther than the shoulders C/H
        // (|y| = yBody), so EF > CH.
        const xTip      =  r;
        const xShoulder =  0.30 * r;   // body ↔ arrowhead boundary
        const xFinTip   = -r;          // tail fin outer tip (leftmost)
        const yBody     =  0.30 * r;   // half body thickness at the shoulders (C, H)
        const yFin      =  0.50 * r;   // half fin-tip span (E, F) — bigger than yBody
        const yWing     =  0.55 * r;   // half arrowhead flare (B, I)

        // Upper half — vertices A B C E (A = tip).
        const upperPath: Position[] = [
            local(xTip,       0),        // A  arrow tip
            local(xShoulder,  yWing),    // B  upper wing
            local(xShoulder,  yBody),    // C  upper shoulder
            local(xFinTip,    yFin),     // E  upper tail fin outer tip (open end)
        ];

        // Lower half — vertices F H I (then back to A = tip).
        const lowerPath: Position[] = [
            local(xFinTip,   -yFin),     // F  lower tail fin outer tip (open end)
            local(xShoulder, -yBody),    // H  lower shoulder
            local(xShoulder, -yWing),    // I  lower wing
            local(xTip,       0),        //    back to A (tip)
        ];

        // ── Lightning-bolt "contact" side arrows ───────────────────────
        // Each side arrow starts at 25% along the arrowhead edge (B→A for
        // upper, I→A for lower). Segments JK and LM are parallel outward
        // strokes tilted ZIG_ANGLE_DEG off horizontal (toward the big
        // arrow's forward direction); KL joins K horizontally back to
        // directly above J so LM lives in the same forward x-range as JK.
        //   J (start) → K (outer, +angle from J)
        //             → L (directly above/below J, via horizontal KL)
        //             → M (+angle from L; arrowhead on outermost line)
        const ZIG_START_T    = 0.5;
        const ZIG_SEG_LEN    = 0.475 * r;    // length of each outward stroke (JK, LM) — 5% shorter than 0.5r
        const ZIG_ANGLE_DEG  = 25;           // tilt of JK/LM from forward axis
        const ZIG_HEAD_R     = 0.08 * r;

        const sideArrow = (side: 1 | -1): Position[][] => {
            const wingX = xShoulder, wingY = side * yWing;
            const sx = wingX + ZIG_START_T * (xTip - wingX);
            const sy = wingY + ZIG_START_T * (0    - wingY);
            const out = side;

            const ang = ZIG_ANGLE_DEG * Math.PI / 180;
            const dx = ZIG_SEG_LEN * Math.cos(ang);   // forward step per stroke
            const dy = ZIG_SEG_LEN * Math.sin(ang);   // outward step per stroke

            // KL joins K back to L horizontally, with KL length = dx/2
            // (half the forward step per stroke). LM stays parallel to JK.
            const p0: [number, number] = [sx,              sy];
            const p1: [number, number] = [sx + dx,         sy + out * dy];         // K (outer)
            const p2: [number, number] = [sx + dx / 2,     sy + out * dy];         // L (half-back from K)
            const p3: [number, number] = [sx + 3 * dx / 2, sy + out * 2 * dy];     // M (arrow, outermost)

            const line: Position[] = [local(...p0), local(...p1), local(...p2), local(...p3)];
            const head = geometryService.computeArrowheadPoints(line[2], line[3], ZIG_HEAD_R, 35);
            return [line, head];
        };

        const [upperLine, upperHead] = sideArrow(1);
        const [lowerLine, lowerHead] = sideArrow(-1);

        // Index layout (used by the debug style in MissionTaskGraphicBase to
        // label vertices A..I):
        //   [0] upperPath — vertices A B C D E (5 points)
        //   [1] lowerPath — vertices F G H I A (5 points, returns to tip=A)
        //   [2..5] side-arrow lines and heads
        return this.asMultiLineStringFeature([
            upperPath,
            lowerPath,
            upperLine, upperHead,
            lowerLine, lowerHead,
        ]);
    }

    generateHandles(base: Feature<any>, opts: PointGraphicOptions): Feature<MultiPoint> {
        // [edge, center] — edge handle at the arrow tip (planar 0° + rotation,
        // distance = size). Matches the MissionTask convention.
        const center = base.geometry.coordinates;
        const edge = geometryService.createCircularArc(center, opts.rotation, opts.size, 0, 1, 1)[0];
        return this.asMultiPointFeature([edge, center]);
    }

    generateLabels(base: Feature<any>, _opts: PointGraphicOptions): Feature<any> {
        return this.asPointFeature(base.geometry.coordinates);
    }
}

/**
 * # Advance to contact — APP-06's drawn route arrow
 *
 * **Not the same symbol as movement to contact, despite naming the same operation.**
 * NATO calls the operation "advance to contact" and the US Army calls it "movement to
 * contact", and the two standards draw it differently enough that one graphic cannot
 * serve both:
 *
 * | | FM 1-02.2 movement to contact | APP-06 342900 advance to contact |
 * |---|---|---|
 * | construction | fixed badge on one point | drawn route, N points, 3 to 50 |
 * | head | flared, swept-back fins | square shoulders |
 * | contact bolts | **two**, upper and lower | **one**, lower flank |
 * | amplifiers | none on the template | T, W, W1 |
 *
 * The evidence that these are separate symbols rather than one under two names: FM never
 * uses the phrase "advance to contact"; APP-06 has no "movement to contact"; and JMSML,
 * the data behind MIL-STD-2525, carries neither — 342900 does not exist there at all. So
 * the code belongs to this graphic alone, and `MovementToContact` is FM-only.
 *
 * APP-06 342900: "The symbol requires N anchor points, where N is between 3 and 50.
 * Point 1 defines the tip of the arrowhead. Point N-1 defines the rear of the symbol.
 * Point N defines the back of the arrowhead."
 *
 * **Vertex order is this library's, not APP-06's.** The standard numbers from the tip
 * backwards; every drawn arrow here runs rear-to-tip, because that is the direction a
 * user draws a route and the direction the whole movement family already stores.
 * @see ai/app-6.md
 */
export class AdvanceToContact extends SolidManeuverArrow {
    constructor() {
        super(TacticalGraphicName.AdvanceToContact);
    }

    /**
     * The bolt is **FM's bolt**, restated against this head.
     *
     * Both standards draw the same lightning mark; only the count and the arrow it hangs
     * off differ. So rather than invent proportions, these are `MovementToContact`'s own,
     * re-expressed as fractions of the **arrowhead's flank** — the feature the bolt
     * actually attaches to. FM's head has a flank of `0.890 x r` carrying a `0.475 x r`
     * stroke and a `0.08 x r` head; this head's flank is `sqrt(5) x radius`, so the same
     * ratios give the same picture at a different head shape.
     */
    private static readonly ZIG_START_T = 0.5;
    private static readonly ZIG_SEG_PER_FLANK = 0.534;
    private static readonly ZIG_HEAD_PER_FLANK = 0.09;
    /** Tilt of each stroke off the heading, toward the outside. FM's value, unchanged. */
    private static readonly ZIG_ANGLE_DEG = 25;
    /**
     * Clear space between the arrowhead's flank and the bolt that leaves it.
     *
     * FM applies the same gap, but in its **renderer** — `movementToContactPaint` shifts
     * the bolts off the outline in projected meters. Doing it in the geometry instead
     * means both engines get it from one place, which is the standing rule here.
     *
     * `0.12 x r` against FM's half-length, and its flank is `0.890 x r`, so the gap is
     * this share of the flank whatever shape the head is.
     */
    private static readonly ZIG_GAP_PER_FLANK = 0.135;

    /**
     * The lightning bolt, leaving the arrowhead's right-hand wing.
     *
     * Built from bearings off the arrow's own heading rather than in a local planar
     * frame, because a drawn arrow's head sits at whatever angle the last leg of the
     * route arrived at.
     */
    private zigzag(wing: Position, tip: Position, centerEnd: Position, heading: number): Position[][] {
        const walk = (from: Position, distance: number, bearing: number): Position =>
            turf.destination(turf.point(from), distance, bearing, {units: 'meters'}).geometry.coordinates as Position;

        // **Outward is read off the geometry, not asserted.** The wing is a perpendicular
        // offset from the centerline's end, so the bearing from that end out to the wing
        // *is* the outward direction — there is no left/right sign to get backwards.
        const outward = turf.bearing(turf.point(centerEnd), turf.point(wing));
        const turn = ((((outward - heading) % 360) + 540) % 360) - 180;
        const tilt = Math.sign(turn) * AdvanceToContact.ZIG_ANGLE_DEG;

        const flank = turf.distance(turf.point(wing), turf.point(tip), {units: 'meters'});
        const flankBearing = turf.bearing(turf.point(wing), turf.point(tip));
        // Halfway along the flank, then lifted clear of it. The lift is perpendicular to
        // the flank rather than to the arrow, so the gap is even along the whole mark
        // instead of closing up toward the tip.
        const lift = flankBearing + Math.sign(turn) * 90;
        const start = walk(
            walk(wing, flank * AdvanceToContact.ZIG_START_T, flankBearing),
            flank * AdvanceToContact.ZIG_GAP_PER_FLANK,
            lift,
        );

        const step = flank * AdvanceToContact.ZIG_SEG_PER_FLANK;
        const stroke = heading + tilt;
        const k = walk(start, step, stroke);
        // Back down the heading by half a stroke's forward reach, so the second stroke
        // covers the same ground as the first rather than running away from it.
        const back = (step * Math.cos(toRadians(AdvanceToContact.ZIG_ANGLE_DEG))) / 2;
        const l = walk(k, back, heading + 180);
        const m = walk(l, step, stroke);

        const head = geometryService.computeArrowheadPoints(l, m, flank * AdvanceToContact.ZIG_HEAD_PER_FLANK, 35);
        return [[start, k, l, m], head];
    }

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        const radius = opts?.radius || 20;
        const arrow = super.generateGraphics(base, opts).geometry.coordinates;

        // `SolidManeuverArrow` emits `[leftBody, head, rightBody]`, and the head runs
        // `[leftEnd, leftWing, tip, rightWing, rightEnd]`.
        const head = arrow[1];
        if (!head || head.length < 5) return this.asMultiLineStringFeature(arrow);
        const [, leftWing, tip, rightWing] = head;

        const centerline = this.arrowCenterline(base, radius);
        const centerEnd = centerline[centerline.length - 1];
        const heading = turf.bearing(turf.point(centerEnd), turf.point(tip));

        // **One bolt per flank**, as on FM's badge. The extracted template appeared to
        // show a single mark, but that template is itself a crop and the symbol runs off
        // its top edge — the upper bolt was outside the picture, not absent from the
        // symbol. Trusting the crop is the same mistake `ai/app-6.md` records twice.
        return this.asMultiLineStringFeature([
            ...arrow,
            ...this.zigzag(leftWing, tip, centerEnd, heading),
            ...this.zigzag(rightWing, tip, centerEnd, heading),
        ]);
    }
}

export class FrontalAttack extends SolidManeuverArrow {
    constructor() { super(TacticalGraphicName.FrontalAttack); }

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        const radius = opts?.radius || 20;
        const baseCoords = this.arrowCenterline(base, radius);
        const lastPoint = baseCoords[baseCoords.length - 1];
        const secondToLast = baseCoords[baseCoords.length - 2];

        const arrowLines = super.generateGraphics(base, opts).geometry.coordinates;

        // Vertical line at the arrow tip, perpendicular to arrow direction.
        // Arrowhead base spans 4×radius; line is 50% larger → ±3×radius each side.
        const arrowTip = geometryService.getExtendedPoint(lastPoint, secondToLast, radius);
        const lineTop    = geometryService.getPerpendicularPoint(arrowTip, lastPoint,  3 * radius);
        const lineBottom = geometryService.getPerpendicularPoint(arrowTip, lastPoint, -3 * radius);

        return this.asMultiLineStringFeature([...arrowLines, [lineTop, lineBottom]]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        const baseCoords = this.arrowCenterline(base, radius);
        const lastPoint = baseCoords[baseCoords.length - 1];
        const secondToLast = baseCoords[baseCoords.length - 2];
        const arrowTip = geometryService.getExtendedPoint(lastPoint, secondToLast, radius);
        // Midpoint of [lastPoint, arrowTip] = center of the arrowhead area
        return this.asMultiPointFeature([lastPoint, arrowTip]);
    }
}

/*export class FlankAttack extends SolidManeuverArrow {
    constructor() { super(TacticalGraphicName.FlankAttack); }
}*/

export class TurningMovement extends SolidManeuverArrow {
    constructor() { super(TacticalGraphicName.TurningMovement); }

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        const radius = opts?.radius || 20;
        const baseCoords = this.arrowCenterline(base, radius);

        const arrowLines = super.generateGraphics(base, opts).geometry.coordinates;

        // Perpendicular crossing line at 60% along the first segment (toward the arrowhead).
        // Linear interpolation is accurate enough for the short segments tactical graphics use.
        // Extends ±1.5×radius — 50% wider than the 2×radius arrow body.
        const t = 0.6;
        const crossPoint: Position = [
            baseCoords[0][0] + t * (baseCoords[1][0] - baseCoords[0][0]),
            baseCoords[0][1] + t * (baseCoords[1][1] - baseCoords[0][1]),
        ];
        const tailTop    = geometryService.getPerpendicularPoint(crossPoint, baseCoords[1],  1.5 * radius);
        const tailBottom = geometryService.getPerpendicularPoint(crossPoint, baseCoords[1], -1.5 * radius);

        return this.asMultiLineStringFeature([...arrowLines, [tailTop, tailBottom]]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        const baseCoords = this.arrowCenterline(base, radius);
        const lastPoint = baseCoords[baseCoords.length - 1];
        const secondToLast = baseCoords[baseCoords.length - 2];
        const arrowTip = geometryService.getExtendedPoint(lastPoint, secondToLast, radius);
        return this.asMultiPointFeature([lastPoint, arrowTip]);
    }
}

// ─── Pursuit — horizontal line + semicircle hook + arrowhead ─────────────────
// Point-based (resize + rotate only). At rotation = 0 the horizontal line
// runs east with a "P" label in its middle; the semicircle bulges east from
// the line's right end and hooks down to an arrowhead. `size` is the
// semicircle radius; the horizontal line is 2.4·size long.
export class Pursuit extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.Pursuit;
    /**
     * **Drawn, not dropped.** APP-06 344000: "This symbol requires three anchor points.
     * Point 1 defines the beginning of the straight line. Point 2 defines the end of the
     * straight line portion of the graphic. Point 3 defines the diameter and orientation
     * of the 180 degree circular arc and the tip of the arrowhead."
     *
     * Points 2 and 3 are the ends of the arc's diameter, and the standard's template
     * runs that diameter **across** the straight line: the line arrives at the top of
     * the hook and the arrowhead leaves from the bottom. The line's length and the
     * hook's size are therefore two separate things the user sets, where the dropped
     * form fixed the line at 2.4 x the radius forever.
     * @see core/anchors.ts, ai/app-6.md "F3"
     */
    type: string = 'LineString';

    /** Half-angle of the arrowhead's wings, and its length as a share of the radius. */
    private static readonly ARROW_ANGLE_DEG = 30;
    private static readonly ARROW_LEN_RATIO = 0.25;
    /** The crossbar is drawn wider than the arrowhead's wing span, by this much. */
    private static readonly CROSSBAR_OVERHANG = 1.3;

    /**
     * The hook's geometry, read off the drawn points.
     *
     * A base that is not three points yet — mid-draw, or a save written before the
     * conversion — is turned into three and read back through the same function, so
     * there is exactly one path that decides what this symbol looks like. Building the
     * fallback as points rather than as a parallel set of formulas is what stops the
     * dropped and drawn forms drifting apart.
     */
    private frame(base: Feature<any>, opts?: PointGraphicOptions): HookFrame | undefined {
        const coords = base.geometry?.coordinates;
        const drawn = Array.isArray(coords?.[0]) ? hookFromAnchors(coords as Position[]) : undefined;
        if (drawn) return drawn;

        const center = (Array.isArray(coords?.[0]) ? coords[0] : coords) as Position | undefined;
        if (!center) return undefined;
        const radius = Math.max(opts?.size ?? 1, 1);
        const side = opts?.mirrored ? -1 : 1;
        return hookFromAnchors(anchorsForHook(center, radius, opts?.rotation ?? 0, side));
    }

    /** The semicircle, swept from the line's end round to the arrowhead's tip. */
    private arc(frame: HookFrame): Position[] {
        const points: Position[] = [];
        for (let i = 0; i <= PURSUIT_ARC_STEPS; i++) {
            const angle = frame.startAngle + (frame.sweep * Math.PI * i) / PURSUIT_ARC_STEPS;
            points.push(geometryService.translateCoordinates(frame.center, frame.radius, angle));
        }
        return points;
    }

    generateGraphics(base: Feature<any>, opts?: PointGraphicOptions): Feature<MultiLineString> {
        const frame = this.frame(base, opts);
        if (!frame) return this.asMultiLineStringFeature([]);

        const arc = this.arc(frame);
        const tip = arc[arc.length - 1];
        const approach = arc[arc.length - 2];

        const arrowLen = frame.radius * Pursuit.ARROW_LEN_RATIO;
        const arrowHead = geometryService.computeArrowheadPoints(approach, tip, arrowLen, Pursuit.ARROW_ANGLE_DEG);

        // The bar across the tip, perpendicular to the direction the arrow is travelling
        // in. Taken off the arc's own last step rather than from a local frame, so it
        // stays square to the arrowhead however the hook was drawn.
        const wingHalf = arrowLen * Math.sin(toRadians(Pursuit.ARROW_ANGLE_DEG));
        const crossHalf = wingHalf * Pursuit.CROSSBAR_OVERHANG;
        const heading = toRadians(90 - turf.bearing(turf.point(approach), turf.point(tip)));
        const crossBar: Position[] = [
            geometryService.translateCoordinates(tip, crossHalf, heading + Math.PI / 2),
            geometryService.translateCoordinates(tip, crossHalf, heading - Math.PI / 2),
        ];

        return this.asMultiLineStringFeature([[frame.start, frame.join], arc, arrowHead, crossBar]);
    }

    /**
     * `[arrowTip, lineStart]` — the order the holder and controller rely on, unchanged
     * by the conversion. Both still sit at an end of the drawn path, which is now
     * literally true: they are anchor points 3 and 1.
     *
     * The mission-task convention's center handle stays deliberately absent. It rendered
     * in the middle of the empty space inside the hook, and it is not load-bearing.
     */
    generateHandles(base: Feature<any>, opts?: PointGraphicOptions): Feature<MultiPoint> {
        const frame = this.frame(base, opts);
        if (!frame) return this.asMultiPointFeature([]);
        return this.asMultiPointFeature([frame.tip, frame.start]);
    }

    /**
     * "P" at the middle of the straight line, which is the run it names.
     *
     * Kept as a single point rather than handing the paint the line's two ends the way
     * Envelopment does: this label is not set into a gap cut in the line, so a fraction
     * of a pixel of projection drift has nothing to fall out of alignment with.
     */
    generateLabels(base: Feature<any>, opts?: PointGraphicOptions): Feature<any> {
        const frame = this.frame(base, opts);
        if (!frame) return this.asPointFeature([0, 0]);
        const span = turf.distance(turf.point(frame.start), turf.point(frame.join), {units: 'meters'});
        const bearing = turf.bearing(turf.point(frame.start), turf.point(frame.join));
        const middle = turf.destination(turf.point(frame.start), span / 2, bearing, {units: 'meters'}).geometry
            .coordinates as Position;
        return this.asPointFeature(middle);
    }
}

/** Half-circle radius as a signed multiple of `size`. The sign picks the flank. */
export const ENVELOPMENT_DEFAULT_BEND = 0.45;
/**
 * Bounds on that radius. Below the floor the hook stops reading as a half circle
 * and collapses onto the line; above the ceiling it dwarfs the approach it is
 * supposed to hang off.
 */
export const ENVELOPMENT_MIN_BEND = 0.12;
export const ENVELOPMENT_MAX_BEND = 1.2;
/** Arrowhead length as a fraction of `size`, when `headSize` is not supplied. */
const ENVELOPMENT_HEAD_RATIO = 0.3;
/** Arc sampling density — enough that the half circle reads smooth at any zoom. */
const ENVELOPMENT_ARC_STEPS = 48;
/** Segments in Pursue's semicircle. Matches the arc the dropped form drew. */
const PURSUIT_ARC_STEPS = 48;

/** Keeps the half circle inside the range the shape stays readable over. */
export function clampEnvelopmentBend(bend: number): number {
    const magnitude = Math.min(ENVELOPMENT_MAX_BEND, Math.max(ENVELOPMENT_MIN_BEND, Math.abs(bend)));
    return bend < 0 ? -magnitude : magnitude;
}

/**
 * How far off the axis a drag has to stray before it means the *other* flank, as a
 * share of the circle's own radius. Below it the hook keeps the side it had, so a
 * handle resting on the axis cannot flip on jitter alone.
 */
export const ENVELOPMENT_FLIP_THRESHOLD = 0.25;

/**
 * The bend an arrow-tip drag asks for, from the cursor's position about the graphic's
 * own frame.
 *
 * **The perpendicular offset, as a turn's bend handle uses.** This used to read the
 * distance *along* the approach instead, and it had to: the handle sat on the arrow tip,
 * on the axis, where the perpendicular carries no radius at all. Moving the handle to the
 * arc's apex — one radius off the axis — makes its own offset the radius and its own sign
 * the flank, so dragging it across the run flips the hook, which is what the handle
 * looks like it should do and previously did not.
 *
 * `along` is no longer read. It stays in the signature because both engines call this
 * through `applyHandleRole` and a shrinking argument list is a worse change than an
 * unused one; the parameter documents what the frame offers.
 *
 * All planar, in projected meters — the frame both renderers edit in.
 */
export function envelopmentBendFrom(
    along: number,
    perpendicular: number,
    size: number,
    currentBend: number,
): number {
    void along;
    if (!(size > 0)) return clampEnvelopmentBend(currentBend);

    const radius = Math.abs(perpendicular);
    const current = Math.sign(currentBend) || 1;
    // A handle resting on the axis must not flip on jitter alone; below the threshold it
    // keeps the flank it had. @see ENVELOPMENT_FLIP_THRESHOLD
    const side = radius > size * ENVELOPMENT_FLIP_THRESHOLD * 0.1 ? Math.sign(perpendicular) : current;
    return clampEnvelopmentBend((side || 1) * (radius / size));
}

/**
 * Envelopment — a straight approach that hooks into a half circle and ends in an
 * open arrowhead.
 *
 * **Point-anchored**, like Turn. It used to be drawn as a multi-vertex line whose
 * *last segment* was the half circle's diameter, which meant the user set the
 * circle's radius and its angle by where they happened to put the final vertex:
 * the shape could be assembled wrong, and the arrowhead could end up anywhere
 * rather than on the approach's own axis.
 *
 * Now the circle is derived, not drawn. The base point is the midpoint of the
 * straight run, `size` is its half-length, `rotation` aims it, and `bend` is the
 * circle's radius as a signed multiple of `size` — the sign choosing which flank
 * it sweeps round, so an envelopment can go either way about the enemy.
 *
 * Because the diameter always lies **along** the approach, the far end of the arc
 * — and so the arrowhead — falls on the line's own continuation by construction.
 * That is a property of the geometry now, not something the user has to achieve
 * by hand.
 *
 * Emitted as MultiLineString `[straightRun, arc, arrowHead]`, the same shape the
 * renderer already expected.
 */
export class Envelopment extends TacticalGraphicsBase<TurnOptions> {
    name: string = TacticalGraphicName.Envelopment;
    /**
     * **Drawn, not dropped.** APP-06 343500: "This symbol requires four anchor points.
     * Point 1 defines the beginning of the straight line. Point 2 defines the end of
     * the straight line portion of the graphic. Point 3 defines the diameter. Point 4
     * defines the orientation of the 180 degree circular arc."
     *
     * Points 2 and 3 are therefore the **feet of the semicircle**, and the standard's
     * own template puts both of them on the run's continuation — which is exactly where
     * the construction below already had them. So the shape math is untouched: `frame`
     * reads its center, bearing, half-length and arc radius off the points the user
     * drew instead of off a `size` and a `rotation`. That is what makes the approach's
     * length and the arc's diameter independent, which they were not when one `size`
     * drove both.
     * @see core/anchors.ts, ai/app-6.md "F3"
     */
    type: string = 'LineString';

    /**
     * One point of the graphic, given as local coordinates **relative to the base
     * point**: `u` along the approach, `v` to its left.
     *
     * Every vertex goes through here, from the *same* origin, and that is the
     * whole trick. Chaining translations instead — center to the line's end, then
     * to the circle's center, then out to the arc — accumulates the
     * latitude-dependent scaling each hop applies, and the arc lands beside the
     * line rather than on it. Measured at 13.7 km off a 4739 km run before this,
     * which reads as the circle crossing under the line at the joint.
     *
     * With one origin, any point at `v = 0` resolves to the identical call as the
     * line's own end, so the joint is exact by construction rather than by
     * tolerance.
     */
    private at(center: Position, angle: number, u: number, v: number): Position {
        const distance = Math.hypot(u, v);
        if (distance === 0) return center;
        return geometryService.translateCoordinates(center, distance, angle + Math.atan2(v, u));
    }

    /**
     * The approach's local geometry: half-length, circle radius and which flank.
     *
     * Read from the drawn anchor points when there are any. `bend` still supplies the
     * radius for a two-point sketch — mid-draw the interaction hands over a run and
     * nothing else, and a graphic that drew no arc until its third point landed would
     * flicker rather than grow.
     */
    private frame(base: Feature<LineString>, opts?: TurnOptions): {center: Position; angle: number; size: number; radius: number; side: number} {
        const drawn = runAndArcFromAnchors(base.geometry.coordinates);
        const bend = clampEnvelopmentBend(opts?.bend ?? ENVELOPMENT_DEFAULT_BEND);
        const size = drawn?.size ?? opts?.size ?? 1;
        return {
            center: drawn?.center ?? base.geometry.coordinates[0] ?? [0, 0],
            angle: drawn?.angle ?? toRadians(opts?.rotation ?? 0),
            size,
            // `bend` is the fallback, not the input: it is what a two-point sketch and a
            // pre-conversion save both still speak. Once point 3 exists the drawn
            // diameter wins, which is the whole freedom the conversion buys — the
            // approach's length and the arc's size stop being the same number.
            radius: drawn?.radius ?? Math.abs(bend) * size,
            side: drawn?.radius !== undefined ? drawn.side : Math.sign(bend) || 1,
        };
    }

    /** `[start, end]` of the straight run, centered on the base point. */
    private axis(base: Feature<LineString>, opts?: TurnOptions): [Position, Position] {
        const {center, angle, size} = this.frame(base, opts);
        return [this.at(center, angle, -size, 0), this.at(center, angle, size, 0)];
    }

    /**
     * The half circle, from the line's end round to the point the arrowhead sits
     * on. Its center is one radius past the line's end, so sweeping φ from π to 0
     * starts at `u = size` and finishes at `u = size + 2 * radius` — both on the
     * approach's own axis, whatever direction the graphic is aimed.
     */
    private arc(base: Feature<LineString>, opts?: TurnOptions): Position[] {
        const {center, angle, size, radius, side} = this.frame(base, opts);
        const pts: Position[] = [];
        for (let i = 0; i <= ENVELOPMENT_ARC_STEPS; i++) {
            const phi = Math.PI * (1 - i / ENVELOPMENT_ARC_STEPS);
            pts.push(this.at(center, angle, size + radius + radius * Math.cos(side * phi), radius * Math.sin(side * phi)));
        }
        return pts;
    }

    generateGraphics(base: Feature<LineString>, opts?: TurnOptions): Feature<MultiLineString> {
        const size = opts?.size ?? 1;
        const [start, end] = this.axis(base, opts);
        const arc = this.arc(base, opts);
        const headSize = opts?.headSize ?? size * ENVELOPMENT_HEAD_RATIO;
        const arrowHead = geometryService.computeArrowheadPoints(arc[arc.length - 2], arc[arc.length - 1], headSize, 45);
        return this.asMultiLineStringFeature([[start, end], arc, arrowHead]);
    }

    /**
     * `[arrowTip, lineEnd, center]` — the order `EnvelopmentGraphicBase.setBandRange`
     * relies on, matching Turn's `[bend, tip, center]` contract. The center is
     * split onto the inert feature by `publishHandles`, which preserves order.
     *
     * The circle handle sits on the **outer midpoint of the arc** — the apex, one
     * radius off the axis at `size + radius` along it, which is where sweeping the
     * arc's own parameter to a quarter turn lands.
     *
     * **It used to sit on the arrow tip, on the axis**, and being on the axis it could
     * not encode the radius by its offset: the drag had to read distance *along* the
     * approach instead, and dragging the handle across the run did not flip the hook
     * because there was no perpendicular to change sign. On the apex both readings are
     * the handle's own position — how far off the axis is the radius, and which side it
     * is on is the flank — which is the same rule Turn's bend handle already uses.
     *
     * The line end sets length and aim together. There is deliberately no handle on the
     * start of the run: it is where the "E" stacks, and a dot under the label reads as
     * clutter.
     */
    generateHandles(base: Feature<LineString>, opts?: TurnOptions): Feature<MultiPoint> {
        const {center, angle, size, radius, side} = this.frame(base, opts);
        return this.asMultiPointFeature([
            this.at(center, angle, size + radius, side * radius),
            this.at(center, angle, size, 0),
            center,
        ]);
    }

    /**
     * A quarter of the way along the straight run — the same place
     * `envelopmentGraphicStyleFunc` opens its gap, so the "E" lands in the hole
     * left for it rather than beside one. Expressed off the center so it stays
     * exact: the run spans `2 * size`, so a quarter along is `0.5 * size` back
     * from the middle.
     */
    /**
     * **The run's two ends, not the letter's own point.**
     *
     * The "E" belongs a quarter of the way along the approach, in the hole the paint
     * cuts for it. Naming that spot here — geodesically, in 4326 — puts it a little off
     * the *straight segment* a renderer then draws between the run's reprojected ends,
     * because 3857's y is not linear in latitude. Measured at 3.5 km off a 4739 km run:
     * a fraction of a pixel on a small graphic, and growing with every meter you add, so
     * the letter drifts out of its hole exactly when the graphic gets big.
     *
     * Handing over the ends instead lets the paint find the quarter point on the segment
     * it is actually drawing, in projected meters, which is where the gap is cut too.
     * Letter and hole then agree by construction at any size and any zoom.
     * @see envelopmentLabelPaint
     */
    generateLabels(base: Feature<LineString>, opts?: TurnOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature(this.axis(base, opts));
    }
}

/*export class DoubleEnvelopment extends SolidManeuverArrow {
    constructor() { super(TacticalGraphicName.DoubleEnvelopment); }
}*/

// ─── MobileDefense — full ellipse (lens shape) with outward-facing triangles ──
// p0 = MD-label vertex (tail end); p1 = arrow vertex (maneuver direction).
// The body is a full ellipse with its major axis along p0→p1; an arrow extends
// past p1; two triangles sit on the top curve and two on the bottom curve,
// each pointing outward (away from the ellipse center).
export class MobileDefense extends MovementGraphicBase {
    name: string = TacticalGraphicName.MobileDefense;

    /** The ellipse is defined by its two endpoints; nothing is drawn past p1. */
    protected tipOverhang: number = 0;

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        const radius = opts?.radius || 20;
        const baseCoords = base.geometry.coordinates;
        const p0 = baseCoords[0];
        const p1 = baseCoords[baseCoords.length - 1];

        const center = geometryService.getMidpoint(p0, p1);
        const majorR = turf.distance(p0, p1, {units: 'meters'}) / 2;
        const minorR = majorR * 0.4;
        const axisBearing = turf.bearing(p0, p1);

        // Build a half-ellipse that leaves gaps on BOTH vertices: a small gap on
        // the p0 (MD-label) side and a larger gap on the p1 (arrow) side.
        // `perpSign` selects top (+1) or bottom (-1) (perp+ = left of p0→p1).
        const labelGap = 0.45; // radians of arc omitted on the p0 side
        const arrowGap = 0.90;  // radians of arc omitted on the p1 side
        const halfEllipse = (perpSign: 1 | -1, steps: number): Position[] => {
            const pts: Position[] = [];
            const startTheta = Math.PI - labelGap; // near p0
            const endTheta = 0 + arrowGap;         // near p1
            for (let i = 0; i <= steps; i++) {
                const theta = startTheta + (i / steps) * (endTheta - startTheta);
                const along = majorR * Math.cos(theta);
                const perp = perpSign * minorR * Math.sin(theta);
                const dist = Math.hypot(along, perp);
                if (dist === 0) {
                    pts.push([center[0], center[1]]);
                    continue;
                }
                const thetaDeg = Math.atan2(perp, along) * 180 / Math.PI;
                const bearing = axisBearing - thetaDeg;
                pts.push(turf.destination(center, dist, bearing, {units: 'meters'}).geometry.coordinates as Position);
            }
            return pts;
        };

        const topArc = halfEllipse(1, 48);
        const bottomArc = halfEllipse(-1, 48);

        // Arrow head sits exactly where the p1-side gap begins, pointing along that arc's
        // tangent. No shaft.
        //
        // The ellipse itself is symmetric about its major axis, so *this* is the graphic's
        // asymmetry: which arc the arrow leaves from. Mirroring swaps it to the other one,
        // which is the whole flip — nothing else needs reflecting.
        const arrowArc = opts?.mirrored ? bottomArc : topArc;
        const arrowTip = arrowArc[arrowArc.length - 1];
        const arrowPrev = arrowArc[arrowArc.length - 2];
        const arrowHead: Position[] = geometryService.computeArrowheadPoints(arrowPrev, arrowTip, radius, 45);

        // Outward-facing triangles with both base vertices lying on the arc, and apex
        // perpendicular to the base (not radial). Placed at 33%/67% along each arc.
        //
        // **The height follows the base, so the triangle stays equilateral.** It used to
        // be `min(radius * 0.9, minorR * 1.1)` — a height that stops growing once the
        // arrowhead size caps it, while the base is a chord of the arc and keeps widening
        // with the ellipse. The triangles therefore flattened as the graphic was resized,
        // which is the one thing a symbol built from equilateral teeth must not do.
        //
        // Geodesic, like every other length in this generator: the base is measured on
        // the same sphere the apex is projected from, so the three sides agree.
        const triangleFractions = [0.33, 0.67];
        /** Height of an equilateral triangle, as a share of its base. */
        const EQUILATERAL_HEIGHT = Math.sqrt(3) / 2;
        const triBaseHalfSpan = 0.05; // fraction of arc length between base vertices (×2)
        const triangles: Position[][] = [];
        const addTriangles = (arc: Position[], perpSign: 1 | -1) => {
            const last = arc.length - 1;
            for (const t of triangleFractions) {
                const i1 = Math.max(0, Math.round((t - triBaseHalfSpan) * last));
                const i2 = Math.min(last, Math.round((t + triBaseHalfSpan) * last));
                const b1 = arc[i1];
                const b2 = arc[i2];
                const mid: Position = [(b1[0] + b2[0]) / 2, (b1[1] + b2[1]) / 2];
                const baseBearing = turf.bearing(b1, b2);
                // Top arc walks p0→p1 with outward on the left (base − 90);
                // bottom arc has outward on the right (base + 90).
                const outBearing = perpSign === 1 ? baseBearing - 90 : baseBearing + 90;
                const base = turf.distance(b1, b2, {units: 'meters'});
                const apex = turf.destination(mid, base * EQUILATERAL_HEIGHT, outBearing, {units: 'meters'}).geometry.coordinates as Position;
                triangles.push([b1, apex, b2, b1]);
            }
        };
        addTriangles(topArc, 1);
        addTriangles(bottomArc, -1);

        return this.asMultiLineStringFeature([topArc, bottomArc, arrowHead, ...triangles]);
    }

    /**
     * `[p1]` — the far end of the ellipse's major axis, and nothing else.
     *
     * p1 lands on the center-line in the gap between the arrowhead and the end
     * of the bottom arc, across the shape from the "MD" label. The p0 dot is
     * deliberately omitted: it would sit underneath that label, so it read as
     * clutter rather than as something grabbable.
     *
     * One point is enough. Nothing indexes into the handle set — the manager
     * only needs a feature under the cursor to start a drag, and
     * `LineGraphicController` rotates/resizes/translates the whole base
     * feature, anchored on `getCenter()` (= p0), never on a handle coordinate.
     *
     * The inherited `MovementGraphicBase` version is wrong for this graphic: it
     * returns an arrow tip extended *past* p1 (outside the ellipse) plus a
     * perpendicular width handle. MobileDefense has no width to drag — the
     * ellipse is derived entirely from p0 and p1, with `minorR = majorR × 0.4` —
     * so emitting fewer than three points tells the OpenLayers holder there is
     * no offset handle to show.
     */
    /**
     * `[end, mirror]`.
     *
     * The second is new, and it is what makes the flip reachable. This graphic's only
     * asymmetry is which half of the ellipse the arrow leaves from, so a user had no way
     * to swap it: the single end handle rotates and resizes, and there was no dot on the
     * side that moves. It sits at the top of the current arc — perpendicular from the
     * midpoint by the ellipse's own minor radius — so dragging it across the major axis
     * is the gesture, and it moves with the graphic when the flip lands.
     */
    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const baseCoords = base.geometry.coordinates;
        const p0 = baseCoords[0];
        const p1 = baseCoords[baseCoords.length - 1];

        const center = geometryService.getMidpoint(p0, p1);
        const minorR = (turf.distance(p0, p1, {units: 'meters'}) / 2) * 0.4;
        // `perp+` is left of p0→p1, which is the arc an unmirrored graphic uses.
        const bearing = turf.bearing(p0, p1) - (opts?.mirrored ? -90 : 90);
        const mirror = turf.destination(center, minorR, bearing, {units: 'meters'}).geometry.coordinates as Position;

        return this.asMultiPointFeature([p1, mirror]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        // coords[0] = p0 vertex anchor for the "MD" label (rendered horizontally).
        // coords[1] = p1, included so downstream style code that expects two points
        // still gets them; rotation is ignored by the MobileDefense style.
        const baseCoords = base.geometry.coordinates;
        const p0 = baseCoords[0];
        const p1 = baseCoords[baseCoords.length - 1];
        return this.asMultiPointFeature([p0, p1]);
    }
}

// ─── InfiltrationLane — two parallel rails with a right-aligned name label ────

export class InfiltrationLane extends MovementGraphicBase {
    name: string = TacticalGraphicName.InfiltrationLane;

    /** Two bare rails, no arrowhead — the lane ends on the last vertex. */
    protected tipOverhang: number = 0;

    /**
     * `[p0, p1, railEnd]` — the width handle sits on the end of the left rail,
     * i.e. on the graphic, rather than the inherited point a further `radius`
     * out into empty space.
     *
     * The handle is now one radius off the center line instead of two, so the
     * renderer has to halve its drag sensitivity to compensate — see
     * `OFFSET_SCALE` in the OpenLayers `MovementGraphicBase`.
     */
    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        const baseCoords = base.geometry.coordinates;
        const leftRail = geometryService.computeParallelLineString(baseCoords, radius);
        return this.asMultiPointFeature([baseCoords[0], baseCoords[baseCoords.length - 1], leftRail[leftRail.length - 1]]);
    }

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        const radius: number = opts?.radius || 20;
        const baseCoords = base.geometry.coordinates;
        const leftRail: Position[] = geometryService.computeParallelLineString(baseCoords, radius);
        const rightRail: Position[] = geometryService.computeParallelLineString(baseCoords, -radius);
        return this.asMultiLineStringFeature([leftRail, rightRail]);
    }

    /**
     * Label span centered on the middle of the center-most segment. The style
     * function uses the span for rotation + scale and anchors the text at the
     * midpoint with textAlign:'center'.
     */
    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        const baseCoords = base.geometry.coordinates;
        const numSegments = baseCoords.length - 1;
        if (numSegments < 1) return this.asMultiPointFeature([baseCoords[0], baseCoords[0]]);
        const centerIdx = Math.floor((numSegments - 1) / 2);
        const segStart = baseCoords[centerIdx];
        const segEnd = baseCoords[centerIdx + 1];
        return this.asMultiPointFeature(geometryService.labelCoordsAtFraction(segStart, segEnd, 0.5, radius));
    }
}

// ─── Infiltration — single-line arrow with "IN" label near tail ──────────────

/**
 * Infiltrate (APP-06 343800) — the same S as the exfiltration, pointed the other way.
 *
 * > Point 1 defines the end of the straight line portion of the graphic. Point 2 defines
 * > the centre of the two 90 degree circular arcs. Point 3 defines the tip of the
 * > arrowhead.
 *
 * 343700 and 343800 print that rule word for word and draw the same construction: a
 * straight run carrying the letters, an S of two quarter turns, a straight run to the
 * arrowhead. The only doctrinal difference is where the arrow points — *"in the direction
 * of enemy forces"* here, *"of friendly forces"* there.
 *
 * This used to be a plain arrow along the drawn polyline, which is the axis-of-advance
 * shape with a different label. @see GeometryService.createSCurve
 */
export class Infiltration extends MovementGraphicBase {
    name: string = TacticalGraphicName.Infiltration;

    /** `computeArrowheadPoints` puts the point on the last vertex already. */
    protected tipOverhang: number = 0;

    /** The three anchor points, in the order the standard numbers them. */
    generateHandles(base: Feature<LineString>, _opts?: MovementGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 3));
    }

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        const radius: number = opts?.radius || 20;
        const c = base.geometry.coordinates;
        if (c.length < 3) return this.asMultiLineStringFeature([c]);

        const path = geometryService.createSCurve(c[0], c[2], c[1]);
        const arrowHead: Position[] = geometryService.computeArrowheadPoints(
            path[path.length - 2], path[path.length - 1], radius, 45,
        );
        return this.asMultiLineStringFeature([path, arrowHead]);
    }

    /** A span along the **first straight**, which is where the plate sets `IN`. */
    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        const c = base.geometry.coordinates;
        if (c.length < 3) {
            return this.asMultiPointFeature(geometryService.labelCoordsAtFraction(c[0], c[1], 0.25, radius));
        }
        const path = geometryService.createSCurve(c[0], c[2], c[1]);
        return this.asMultiPointFeature([path[0], path[1]]);
    }
}

// ─── Ambush — 1/3-circle arc with 7 horizontal hashes + right-pointing arrow ──
// Point-based. At rotation = 0 the arc bulges right (convex facing right, concave
// opening facing left); 7 horizontal hashes fill the half-moon interior between
// the chord and the arc; the arrow emerges from the convex outer bulge pointing
// east. `rotation` rotates the whole graphic; `size` is the circle radius.

export class Ambush extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.Ambush;
    /**
     * **Drawn, not dropped.** APP-06 141700: "Point 1 is the tip of the arrowhead.
     * Points 2 and 3 define the endpoints of the curved line on the back side of the
     * symbol."
     *
     * The center is never drawn — it is recovered from the chord, which works because
     * the curved line spans a known 120 degrees. Point 1 is honored as a real tip, so
     * how far the arrow reaches is now the user's to set; the dropped form fixed it at
     * two radii. @see core/anchors.ts, ai/app-6.md "F3"
     */
    type: string = 'LineString';

    /** The circle behind the arc, read off the drawn points or from the options. */
    private frame(base: Feature<any>, opts: PointGraphicOptions): {center: Position; rotation: number; radius: number; reach: number} {
        const coords = base.geometry?.coordinates;
        const anchored = Array.isArray(coords?.[0]);
        const drawn = anchored ? arcAndArrowFromAnchors(coords as Position[]) : undefined;
        if (drawn) {
            return {center: drawn.center, rotation: (drawn.angle * 180) / Math.PI, radius: drawn.radius, reach: drawn.arrowReach};
        }
        return {
            center: (anchored ? coords[0] : coords) as Position,
            rotation: opts.rotation ?? 0,
            radius: Math.max(opts.size ?? 1, 1),
            reach: ARC_ARROW_DEFAULT_REACH,
        };
    }

    generateGraphics(base: Feature<any>, opts: PointGraphicOptions): Feature<MultiLineString> {
        const {center, rotation, radius: r, reach} = this.frame(base, opts);

        // Point at polar (distance, planar angle) from center, with `rotation` applied.
        const polar = (dist: number, planarDeg: number): Position => {
            if (dist === 0) return [center[0], center[1]];
            let bearing = 90 - (planarDeg + rotation);
            bearing = ((bearing % 360) + 360) % 360;
            return turf.destination(center, dist, bearing, {units: 'meters'}).geometry.coordinates as Position;
        };

        // Arc: 1/3 circle (120°) bulging right — planar −60° → +60°.
        const arc: Position[] = geometryService.createCircularArc(center, rotation, r, -60, 60, 48);

        // 7 horizontal hashes evenly spaced in y, each running from the chord
        // (x = +0.5r) rightward to the arc (x = +sqrt(r² − y²)). y endpoints at
        // ±r·sin(60°) = ±0.866r; 8 intervals → 7 interior lines.
        const yMax = r * Math.sin((60 * Math.PI) / 180);
        const chordX = 0.5 * r;
        const lines: Position[][] = [];
        for (let i = 1; i <= 7; i++) {
            const y = -yMax + (i * (2 * yMax)) / 8;
            const startDeg = (Math.atan2(y, chordX) * 180) / Math.PI;
            const endDeg = (Math.atan2(y, Math.sqrt(Math.max(0, r * r - y * y))) * 180) / Math.PI;
            const startDist = Math.hypot(chordX, y);
            lines.push([polar(startDist, startDeg), polar(r, endDeg)]);
        }

        // Arrow: emerges from the convex bulge (planar 0°, distance r) and
        // extends one radius further outward (tip at planar 0°, distance 2r).
        const arrowBase = polar(r, 0);
        const arrowTip = polar(reach * r, 0);
        const arrowHead = geometryService.computeArrowheadPoints(arrowBase, arrowTip, r * 0.25, 30);

        return this.asMultiLineStringFeature([arc, ...lines, [arrowBase, arrowTip], arrowHead]);
    }

    generateHandles(base: Feature<any>, opts: PointGraphicOptions): Feature<MultiPoint> {
        // [arcEnd, arrowTip] — both on the graphic's own outline: the upper arc
        // endpoint (planar 60° + rotation) and the point of the arrow that
        // emerges from the bulge (planar 0°, distance 2r, matching
        // `generateGraphics`).
        //
        // The MissionTask convention's center handle is deliberately absent: it
        // rendered in the hollow of the arc with nothing under it, and it is not
        // load-bearing — `handleCircleDrag` picks its operation from the global
        // interaction mode and does its angle/scale maths against the base
        // point, never against the handle the user grabbed.
        const {center, rotation, radius: r, reach} = this.frame(base, opts);
        const arcEnd = geometryService.createCircularArc(center, rotation, r, 60, 61, 1)[0];
        const arrowTip = geometryService.createCircularArc(center, rotation, reach * r, 0, 1, 1)[0];
        return this.asMultiPointFeature([arcEnd, arrowTip]);
    }

    generateLabels(base: Feature<any>, opts: PointGraphicOptions): Feature<any> {
        return this.asPointFeature(this.frame(base, opts).center);
    }
}

// ─── ReliefInPlace — sideways U with a single arrowhead ──────────────────────
// Base: 2-point line (p0 = RIP-label end, p1 = curve end). The U's two parallel
// legs run between p0–p1 (top) and p1b–p0b (bottom, offset perpendicular by the
// U height); a semicircle at the p1 end connects them, and a single arrowhead
// sits at p0b pointing outward. Output order is [top, curve, bottom, arrow] —
// the style function relies on this order.
export class ReliefInPlace extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.ReliefInPlace;
    type: string = 'LineString';

    private computeU(base: Feature<LineString>, opts: PointGraphicOptions) {
        const baseCoords = base.geometry.coordinates;
        const p0 = baseCoords[0];
        const p1 = baseCoords[baseCoords.length - 1];
        const size = Math.max(opts?.size ?? 20, 1);
        const uHeight = size * 3;

        const axisBearing = turf.bearing(p0, p1);
        const perpBearing = axisBearing + 90;

        const p0b = turf.destination(p0, uHeight, perpBearing, {units: 'meters'}).geometry.coordinates as Position;
        const p1b = turf.destination(p1, uHeight, perpBearing, {units: 'meters'}).geometry.coordinates as Position;
        const curveCenter = turf.destination(p1, uHeight / 2, perpBearing, {units: 'meters'}).geometry.coordinates as Position;
        const curveCoords = turf.lineArc(
            turf.point(curveCenter),
            uHeight / 2,
            axisBearing - 90,
            axisBearing + 90,
            {units: 'meters'},
        ).geometry.coordinates as Position[];

        return {p0, p1, p0b, p1b, size, curveCoords};
    }

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiLineString> {
        const {p0, p1, p0b, p1b, size, curveCoords} = this.computeU(base, opts);
        const topLine: Position[] = [p0, p1];
        const bottomLine: Position[] = [p1b, p0b];
        const bottomArrow = geometryService.computeArrowheadPoints(p1b, p0b, size, 45);
        // Second arrow on the RIP line, tip at p1 pointing into the curve.
        const topArrow = geometryService.computeArrowheadPoints(p0, p1, size, 45);
        return this.asMultiLineStringFeature([topLine, curveCoords, bottomLine, bottomArrow, topArrow]);
    }

    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        // [0] = offset (U-height) handle; [1..] = base endpoint handles.
        const {p0, p1, p1b} = this.computeU(base, opts);
        return this.asMultiPointFeature([p1b, p0, p1]);
    }

    generateLabels(base: Feature<LineString>, _opts: PointGraphicOptions): Feature<any> {
        // Style function draws "RIP" itself in a gap along the top line; this
        // geometry is unused but kept for the standard handler contract.
        return this.asPointFeature(base.geometry.coordinates[0]);
    }
}
