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
    /**
     * `[point 3, point 2, centre]` — the two anchor points the operator sets, and the grip
     * that moves the whole graphic.
     *
     * **Handle 0 is point 3, the diameter**, at `size + 2 * radius` along the approach and
     * nothing off it. It used to be drawn on the arc's *apex* — `size + radius` along and
     * one radius to the flank — while `setBandRange` had always read it as the point on the
     * axis, its own comment saying so in as many words. So the dot the operator grabbed and
     * the position the drag solved from were different places, and the handle jumped to the
     * axis on first movement.
     *
     * **Point 4 is not a handle and cannot be.** The standard calls it "the orientation of
     * the 180 degree circular arc" — which flank the arc bulges to, not a position. Dragging
     * point 3 to one side or the other of the approach is what picks it, which is what
     * `setBandRange` already does: *"distance along the axis past the line's end is the
     * circle's diameter, and the side the cursor strays to picks the flank."*
     *
     * Point 1, the beginning of the straight line, is likewise determined — it is `size`
     * back from the centre along the approach — so it carries no grip of its own; the centre
     * is the move affordance. (User's call, 2026-08-27.)
     */
    generateHandles(base: Feature<LineString>, opts?: TurnOptions): Feature<MultiPoint> {
        const {center, angle, size, radius} = this.frame(base, opts);
        return this.asMultiPointFeature([
            this.at(center, angle, size + 2 * radius, 0),
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
/**
 * Barb base as a share of the arc's radius — the symbol's own cross-dimension.
 *
 * Measured off 152800's Template at 600 dpi: the arc's radius is 210 px and each barb's
 * base spans 110, so 0.52. Sized against the *radius* rather than against the straight
 * line, because the line's length is free and the barbs must not grow with it: a long,
 * shallow mobile defence would otherwise sprout teeth taller than the figure is wide.
 */
const MD_BARB_BASE_OF_RADIUS = 0.52;

/** Height of an equilateral triangle, as a share of its base. */
const MD_EQUILATERAL_HEIGHT = Math.sqrt(3) / 2;

/**
 * Where the four barbs sit: a fraction along each straight line, measured from its free
 * end, and a fraction along the arc from each end.
 *
 * From the Template — the near line runs 630 px from point 1 to point 2 and its barb is
 * centred 172 px along, which is 0.27. The two arc barbs sit just past where the straights
 * meet the curve.
 */
const MD_BARB_ALONG_LINE = 0.27;
const MD_BARB_ALONG_ARC = 0.15;

/** Vertices in the half circle. 36 is one every five degrees. */
const MD_ARC_STEPS = 36;

/**
 * How far out the "MD" sits from the arc's diameter, as a share of the radius.
 *
 * The Template centres the letters 0.7 of a radius past the diameter, just inside the
 * arc's apex, so they read inside the bend rather than on top of it.
 */
const MD_LABEL_REACH_OF_RADIUS = 0.7;

/**
 * The diameter a **legacy** two-point mobile defence is redrawn at, as a share of its
 * length. Only reached by a graphic saved before 2026-09-06. @see MobileDefense.frame
 */
const MD_LEGACY_DIAMETER_SHARE = 0.5;

/**
 * Mobile defence — APP-06 152800.
 *
 * ## What the standard says
 *
 * > **Anchor Points:** This symbol requires three anchor points. Point 1 defines the tip of
 * > the arrowhead. Point 2 defines the end of the straight line portion of the symbol.
 * > Point 3 defines the diameter and orientation of the 180 degree circular arc.
 * >
 * > **Size/Shape:** Points 1 and 2 determine the length of the straight line portion of the
 * > symbol. Point 3 defines which side of the line the arc is on and the diameter of the
 * > arc. The number of barbs shall remain proportional as the area enlarges.
 * >
 * > **Orientation.** Not applicable. **Static/Dynamic:** D
 *
 * ## What the Template draws
 *
 * A **hairpin**: two parallel straight lines of equal length joined by a 180 degree arc,
 * with an open arrowhead on the free end of the near line and filled barbs hanging outward.
 * Measured off the plate at 600 dpi: the two lines sit 420 px apart and the arc's rightmost
 * point is 210 px beyond them, so the arc's radius is exactly half the separation and it is
 * tangent to both lines — which is what makes the figure close smoothly.
 *
 * So point 2 and point 3 are **the two ends of the arc's diameter**, that diameter is
 * perpendicular to the straight line, and the arc bulges away from point 1.
 *
 * ## What is read, and what is interpretation
 *
 * Stated by the plate: three points; point 1 the arrowhead tip; points 1-2 the straight
 * length; point 3 the arc's diameter and which side it falls on; barbs proportional.
 *
 * **Interpretation, recorded rather than left to be re-derived:**
 *
 * - *The return line.* The rule names one "straight line portion" and the Template draws
 *   two. The second is taken to mirror the first — same length, parallel, running back from
 *   point 3 — because that is the figure the Template draws and nothing else closes it.
 * - *Point 3's along-axis component is discarded.* Only its distance across the line and
 *   which side it fell on are read. The arc is tangent to both straights, so its diameter
 *   **must** be perpendicular; a point off that perpendicular describes a figure the plate
 *   does not draw. The same discipline pursuit's third click is read with, and the reason
 *   `generateHandles` republishes the grip on the perpendicular rather than where it was
 *   dropped — a grip whose position and whose reader disagree is the "very jumpy handle"
 *   this repository has already paid for once. @see pursuitAnchors
 * - *Barb count.* "The number of barbs shall remain proportional as the area enlarges" is
 *   read as scale-invariance — four barbs at fixed fractions, so the picture is the same at
 *   every size, which is the property the sentence protects. It is **not** read as "add
 *   more barbs as it grows", which would make the symbol's appearance depend on its size.
 *
 * It was a two-point **ellipse** with a gap and an arrow leaving one arc until 2026-09-06,
 * which is not a shape the plate draws at all; `mirrored` was its only asymmetry. Point 3
 * states the side now, so the flip is a placed point rather than a hidden amplifier.
 * (User's call.)
 */
export class MobileDefense extends MovementGraphicBase {
    name: string = TacticalGraphicName.MobileDefense;

    /** Nothing is drawn past the arrowhead. */
    protected tipOverhang: number = 0;

    /**
     * The hairpin's own frame.
     *
     * **Coordinates arrive tip-first-reversed**, so the last is point 1 (the arrowhead) and
     * the first is point 3. 152800 is in `TIP_FIRST_GRAPHICS` because its rule numbers the
     * arrowhead first; `TacticalGraphicsBase.generate` hands every generator the rear-to-tip
     * copy. @see drawOrder.ts
     */
    private frame(base: Feature<LineString>, opts?: MovementGraphicOptions) {
        const coords = base.geometry.coordinates;
        const tip = coords[coords.length - 1];
        const join = coords.length >= 2 ? coords[coords.length - 2] : tip;

        const length = Math.max(turf.distance(turf.point(join), turf.point(tip), {units: 'meters'}), 1);
        // Points at the arrowhead, which is the direction the near line runs.
        const axis = turf.bearing(turf.point(join), turf.point(tip));

        let diameter: number;
        let side: number;
        if (coords.length >= 3) {
            /*
             * Point 3, read for the two things the plate gives it and nothing else: how far
             * across the line it is, and which side of the line that is. Its component
             * *along* the line is the freedom 152800 does not have.
             */
            const reach = turf.distance(turf.point(join), turf.point(coords[0]), {units: 'meters'});
            const toward = turf.bearing(turf.point(join), turf.point(coords[0]));
            const across = reach * Math.sin(((toward - axis) * Math.PI) / 180);
            diameter = Math.max(Math.abs(across), 1);
            side = Math.sign(across) || 1;
        } else {
            // A graphic saved before 2026-09-06 carries two points and, at most, a
            // `mirrored` flag — which is the only thing its old shape said about the side.
            diameter = Math.max(length * MD_LEGACY_DIAMETER_SHARE, 1);
            side = opts?.mirrored ? -1 : 1;
        }

        const radius = diameter / 2;
        // Square to the line, on the side point 3 fell.
        const acrossBearing = axis + side * 90;
        const far = turf.destination(turf.point(join), diameter, acrossBearing, {units: 'meters'}).geometry
            .coordinates as Position;
        const center = turf.destination(turf.point(join), radius, acrossBearing, {units: 'meters'}).geometry
            .coordinates as Position;

        return {tip, join, far, center, radius, axis, length, side};
    }

    /**
     * The half circle, from point 2 round to point 3, bulging **away from the arrowhead**.
     *
     * Walked as a bearing from the centre: it leaves at `axis - side * 90` (which is point 2)
     * and turns through `axis + 180` (the apex, furthest from the tip) to `axis + side * 90`
     * (point 3). Sweeping the other way would put the bend over the straight lines.
     */
    private arc(center: Position, radius: number, axis: number, side: number): Position[] {
        const startBearing = axis - side * 90;
        const points: Position[] = [];
        for (let i = 0; i <= MD_ARC_STEPS; i++) {
            const bearing = startBearing - side * 180 * (i / MD_ARC_STEPS);
            points.push(turf.destination(turf.point(center), radius, bearing, {units: 'meters'}).geometry
                .coordinates as Position);
        }
        return points;
    }

    /**
     * One barb: an equilateral triangle sitting on the path with its apex pointing outward.
     *
     * Returned closed, with four vertices, because that is what `mobileDefenseGraphicPaint`
     * fills — an open ring of the same points would be stroked as a line instead.
     * @see TRIANGLE_RING_LENGTH
     */
    private barb(at: Position, alongBearing: number, outBearing: number, base: number): Position[] {
        const half = base / 2;
        const b1 = turf.destination(turf.point(at), half, alongBearing + 180, {units: 'meters'}).geometry
            .coordinates as Position;
        const b2 = turf.destination(turf.point(at), half, alongBearing, {units: 'meters'}).geometry
            .coordinates as Position;
        const apex = turf.destination(turf.point(at), base * MD_EQUILATERAL_HEIGHT, outBearing, {units: 'meters'})
            .geometry.coordinates as Position;
        return [b1, apex, b2, b1];
    }

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        const coords = base.geometry.coordinates;
        // Mid-draw the interaction hands over a one-point sketch on every pointer move.
        if (coords.length < 2) return this.asMultiLineStringFeature([]);

        const {tip, join, far, center, radius, axis, length, side} = this.frame(base, opts);

        const arc = this.arc(center, radius, axis, side);
        // The return line mirrors the near one: same length, parallel, from point 3 out.
        const farEnd = turf.destination(turf.point(far), length, axis, {units: 'meters'}).geometry
            .coordinates as Position;

        const nearLine: Position[] = [join, tip];
        const farLine: Position[] = [far, farEnd];

        /*
         * The arrowhead, on the free end of the near line only — the Template leaves the
         * return line's end plain. Sized against the radius so it stays in proportion with
         * the bend rather than with the run's length.
         */
        const headSize = Math.max(radius * MD_BARB_BASE_OF_RADIUS, 1);
        const arrowHead = geometryService.computeArrowheadPoints(join, tip, headSize, 45);

        /*
         * Four barbs, pointing **outward** — away from the ground the hairpin encloses. The
         * near line's outward side is the one point 3 did *not* fall on; the return line's
         * is the other; on the arc it is radially out from the centre.
         */
        const barbBase = Math.max(radius * MD_BARB_BASE_OF_RADIUS, 1);
        const alongNear = turf.destination(turf.point(tip), length * MD_BARB_ALONG_LINE, axis + 180, {
            units: 'meters',
        }).geometry.coordinates as Position;
        const alongFar = turf.destination(turf.point(farEnd), length * MD_BARB_ALONG_LINE, axis + 180, {
            units: 'meters',
        }).geometry.coordinates as Position;

        const arcBarb = (t: number): Position[] => {
            const bearing = (axis - side * 90) - side * 180 * t;
            const at = turf.destination(turf.point(center), radius, bearing, {units: 'meters'}).geometry
                .coordinates as Position;
            // On a circle the tangent is a quarter turn from the radius, and outward is the
            // radius itself — so the barb sits on the curve and points away from the middle.
            return this.barb(at, bearing - side * 90, bearing, barbBase);
        };

        const barbs: Position[][] = [
            this.barb(alongNear, axis, axis - side * 90, barbBase),
            this.barb(alongFar, axis, axis + side * 90, barbBase),
            arcBarb(MD_BARB_ALONG_ARC),
            arcBarb(1 - MD_BARB_ALONG_ARC),
        ];

        return this.asMultiLineStringFeature([nearLine, arc, farLine, arrowHead, ...barbs]);
    }

    /**
     * `[point 3, point 2, point 1]` — a grip on each anchor the plate names, in the order
     * the generator sees them.
     *
     * **Point 3's grip is republished on the perpendicular**, not where the vertex happens
     * to sit. Only its across-the-line component is read, so a grip left at a freely dragged
     * position would sit off the symbol and its own reader would disagree with it — which is
     * exactly what made envelopment's bend handle jump. `nearestBaseVertexIndex` still maps
     * the grab back to base vertex 0, because that vertex is the nearest one to it.
     */
    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        if (coords.length < 2) return this.asMultiPointFeature(coords);
        const {tip, join, far} = this.frame(base, opts);
        return this.asMultiPointFeature([far, join, tip]);
    }

    /**
     * Where "MD" goes: inside the bend, just short of the arc's apex.
     *
     * The Template sets the letters 0.7 of a radius past the diameter, so they read within
     * the curve rather than across it. `mobileDefenseLabelPaint` draws them upright and
     * centred at `coords[0]`; the second point is kept so anything reading a span still has
     * one. @see mobileDefenseLabelPaint
     */
    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        if (coords.length < 2) return this.asMultiPointFeature(coords);
        const {tip, center, radius, axis} = this.frame(base, opts);
        const at = turf.destination(turf.point(center), radius * MD_LABEL_REACH_OF_RADIUS, axis + 180, {
            units: 'meters',
        }).geometry.coordinates as Position;
        return this.asMultiPointFeature([at, tip]);
    }
}

// ─── InfiltrationLane — two parallel rails with a right-aligned name label ────

/**
 * 140800 — two parallel rails, **built from three placed points like the demolition block.**
 *
 * APP-06 states the same contract 271201 states for the readiness states, word for word:
 *
 * > This symbol requires three anchor points. Points 1 and 2 define the endpoints of the
 * > infiltration lane and point 3 defines one side of the lane.
 *
 * So it is the same construction, and it shares the block's helpers rather than restating
 * them: `halfWidthFromSide` measures the separation off point 3 and `sidePoint` puts the
 * grip back on the rail. (User's call, 2026-09-05.)
 *
 * **What changed.** It was a two-point centreline carrying its separation beside it as a
 * `width` amplifier, dragged by a *derived* offset handle riding the end of the left rail —
 * so the number the plate puts in a coordinate lived in two places at once, and the draw
 * ended on the second click with the width never asked for. Point 3 is a stored vertex now:
 * the rails separate and contract live as the third click is aimed, and there is no second
 * copy of the width to drift. @see ExplosivesReadiness, carriesSeparationInBase
 *
 * **Only points 1 and 2 make the centreline.** The rails used to be offset from the whole
 * base, which was right while every vertex was centreline and is wrong now that the last
 * one is the side — offsetting from all three would bend both rails towards point 3.
 */
export class InfiltrationLane extends MovementGraphicBase {
    name: string = TacticalGraphicName.InfiltrationLane;

    /** Two bare rails, no arrowhead — the lane ends on the last vertex. */
    protected tipOverhang: number = 0;

    /**
     * `[start, end, side]` — the three points the plate names, all of them placed.
     *
     * The third is derived back onto the centreline's perpendicular rather than published
     * where it was clicked, so the grip stays on the rail it sets while the ends are dragged
     * around it. @see sidePoint
     */
    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        if (coords.length < 2) return this.asMultiPointFeature(coords);
        return this.asMultiPointFeature([coords[0], coords[1], sidePoint(coords, opts)]);
    }

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        const coords = base.geometry.coordinates;
        // Mid-draw the interaction hands us a one-point sketch on every pointer move.
        if (coords.length < 2) return this.asMultiLineStringFeature([]);
        const ends = this.centreline(base);
        const half = halfWidthFromSide(coords, opts);
        const leftRail = geometryService.computeParallelLineString(ends, half) as Position[];
        const rightRail = geometryService.computeParallelLineString(ends, -half) as Position[];
        return this.asMultiLineStringFeature([leftRail, rightRail]);
    }

    /**
     * Label span across the middle of the centreline. The style function uses the span for
     * rotation and scale and anchors the text at the midpoint with `textAlign: 'center'`.
     */
    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        if (coords.length < 2) return this.asMultiPointFeature([coords[0], coords[0]]);
        const [segStart, segEnd] = this.centreline(base);
        return this.asMultiPointFeature(
            geometryService.labelCoordsAtFraction(segStart, segEnd, 0.5, halfWidthFromSide(coords, opts)),
        );
    }
}

// ─── Infiltration — single-line arrow with "IN" label near tail ──────────────

// Infiltrate lives beside the exfiltration now: they are one symbol with two letters.
// @see RetrogradeTask.ts, `Infiltration`

// ─── Ambush — 1/3-circle arc with 6 horizontal hashes + right-pointing arrow ──
// Point-based. At rotation = 0 the arc bulges right (convex facing right, concave
// opening facing left); 6 horizontal hashes fill the half-moon interior between
// the chord and the arc, three either side of the axis; the arrowhead line runs
// along the axis from the chord's midpoint out through the bulge, pointing east.
// `rotation` rotates the whole graphic; `size` is the circle radius.

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

    /**
     * Which of the seven evenly spaced hash slots falls on the axis, and is therefore
     * not a hash at all — the arrowhead line runs through it. @see generateGraphics
     */
    private static readonly ARROWHEAD_LINE_HASH = 4;

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

        // 6 horizontal hashes evenly spaced in y, each running from the chord
        // (x = +0.5r) rightward to the arc (x = +sqrt(r² − y²)). y endpoints at
        // ±r·sin(60°) = ±0.866r; 8 intervals → 7 interior lines, of which the
        // middle one is skipped: y = 0 is not a hash, it is the rear half of the
        // arrowhead line below. @see ARROWHEAD_LINE_HASH
        const yMax = r * Math.sin((60 * Math.PI) / 180);
        const chordX = 0.5 * r;
        const lines: Position[][] = [];
        for (let i = 1; i <= 7; i++) {
            if (i === Ambush.ARROWHEAD_LINE_HASH) continue;
            const y = -yMax + (i * (2 * yMax)) / 8;
            const startDeg = (Math.atan2(y, chordX) * 180) / Math.PI;
            const endDeg = (Math.atan2(y, Math.sqrt(Math.max(0, r * r - y * y))) * 180) / Math.PI;
            const startDist = Math.hypot(chordX, y);
            lines.push([polar(startDist, startDeg), polar(r, endDeg)]);
        }

        // **The arrowhead line is one line.** APP-06 141700: "The rear of the
        // arrowhead line shall connect to the midpoint of the line between points 2
        // and 3" — and on a 120° arc that midpoint is r·cos(60°) = 0.5r out along the
        // axis, which is exactly where the hashes start. So the run from the chord to
        // the tip is a single stroke, not a hash meeting an arrow at the bulge.
        //
        // It was emitted as two: a hash from 0.5r to r, then a shaft from r to the tip.
        // Both are sampled off the same great circle by `polar`, so they are collinear
        // in the plane the generator thinks in — but each was a bare pair of endpoints,
        // which puts the whole of the geodesic's curvature on the join as a corner.
        // Drawn at the demo's opening zoom that corner measured **7.1°**, with the two
        // halves visibly at different angles. One run, one bearing, no corner.
        const arrowRear = polar(chordX, 0);
        const arrowTip = polar(reach * r, 0);
        const arrowHead = geometryService.computeArrowheadPoints(arrowRear, arrowTip, r * 0.25, 30);

        return this.asMultiLineStringFeature([arc, ...lines, [arrowRear, arrowTip], arrowHead]);
    }

    generateHandles(base: Feature<any>, opts: PointGraphicOptions): Feature<MultiPoint> {
        // [arcEnd, arrowTip] — both on the graphic's own outline: the upper arc
        // endpoint (planar 60° + rotation) and the point of the arrow that
        // emerges from the bulge (planar 0°, distance 2r, matching
        // `generateGraphics`).
        //
        // The MissionTask convention's center handle is deliberately absent: it
        // rendered in the hollow of the arc with nothing under it, and it is not
/**
 * 140800 — two parallel rails, **built from three placed points like the demolition block.**
 *
 * APP-06 states the same contract 271201 states for the readiness states, word for word:
 *
 * > This symbol requires three anchor points. Points 1 and 2 define the endpoints of the
 * > infiltration lane and point 3 defines one side of the lane.
 *
 * So it is the same construction, and it shares the block's helpers rather than restating
 * them: `halfWidthFromSide` measures the separation off point 3 and `sidePoint` puts the
 * grip back on the rail. (User's call, 2026-09-05.)
 *
 * **What changed.** It was a two-point centreline carrying its separation beside it as a
 * `width` amplifier, dragged by a *derived* offset handle riding the end of the left rail —
 * so the number the plate puts in a coordinate lived in two places at once, and the draw
 * ended on the second click with the width never asked for. Point 3 is a stored vertex now:
 * the rails separate and contract live as the third click is aimed, and there is no second
 * copy of the width to drift. @see ExplosivesReadiness, carriesSeparationInBase
 *
 * **Only points 1 and 2 make the centreline.** The rails used to be offset from the whole
 * base, which was right while every vertex was centreline and is wrong now that the last
 * one is the side — offsetting from all three would bend both rails towards point 3.
 */
        // load-bearing — `handleCircleDrag` picks its operation from the global
        // interaction mode and does its angle/scale maths against the base
        // point, never against the handle the user grabbed.
        const {center, rotation, radius: r, reach} = this.frame(base, opts);
        const arcEnd = geometryService.createCircularArc(center, rotation, r, 60, 61, 1)[0];
        const arrowTip = geometryService.createCircularArc(center, rotation, reach * r, 0, 1, 1)[0];
    /** The centreline the plate names: points 1 and 2, never point 3. */
    private centreline(base: Feature<LineString>): Position[] {
        const coords = base.geometry.coordinates;
        return [coords[0], coords[1]];
    }

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
