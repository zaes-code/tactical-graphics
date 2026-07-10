import * as turf from '@turf/turf';
import {MovementGraphicBase} from "./Movement";
import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {MovementGraphicOptions, PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint, Position} from "geojson";
import geometryService from "../core/GeometryService";

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
        let baseCoords = base.geometry.coordinates;
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

export class FrontalAttack extends SolidManeuverArrow {
    constructor() { super(TacticalGraphicName.FrontalAttack); }

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        const radius = opts?.radius || 20;
        const baseCoords = base.geometry.coordinates;
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
        const baseCoords = base.geometry.coordinates;
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
        const baseCoords = base.geometry.coordinates;

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
        const baseCoords = base.geometry.coordinates;
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
    type: string = 'Point';

    generateGraphics(base: Feature<any>, opts: PointGraphicOptions): Feature<MultiLineString> {
        const center = base.geometry.coordinates;
        const {rotation, size} = opts;
        const r = Math.max(size, 1);

        // Convert a local Cartesian offset (x east, y north in meters) to a
        // geographic position, applying `rotation` (planar deg, 0 = east).
        const local = (x: number, y: number): Position => {
            const dist = Math.hypot(x, y);
            if (dist === 0) return [center[0], center[1]];
            const planarDeg = (Math.atan2(y, x) * 180) / Math.PI;
            let bearing = 90 - (planarDeg + rotation);
            bearing = ((bearing % 360) + 360) % 360;
            return turf.destination(center, dist, bearing, {units: 'meters'}).geometry.coordinates as Position;
        };

        // Horizontal line: from (−2.4r, +r) to (0, +r) — ends at the top of
        // the semicircle.
        const lineLen = 2.4 * r;
        const line: Position[] = [local(-lineLen, r), local(0, r)];

        // Semicircle: bulges east, from top (+r) clockwise through east (+r, 0)
        // to bottom (−r). Center is the graphic's center; planar angles go
        // 90° → −90° (decreasing = clockwise).
        const arc: Position[] = geometryService.createCircularArc(center, rotation, r, 90, -90, 48);

        // Arrowhead at the end of the arc (bottom), pointing in the tangent
        // direction at that point (≈ −x at rotation 0 — i.e., back toward
        // the horizontal line's start).
        const ARROW_LEN_DEG = 30;
        const arrowLen = r * 0.25;
        const arrowFrom = arc[arc.length - 2];
        const arrowTip = arc[arc.length - 1];
        const arrowHead = geometryService.computeArrowheadPoints(arrowFrom, arrowTip, arrowLen, ARROW_LEN_DEG);

        // Perpendicular crossbar at the arrowhead tip, slightly wider than the
        // arrowhead's wing span (= 2·arrowLen·sin(angle)). In the graphic's
        // local frame the tangent is along −x (LEFT), so the crossbar runs
        // vertically through the tip in local coords and rotates with the
        // graphic through `local()`.
        const wingHalf = arrowLen * Math.sin((ARROW_LEN_DEG * Math.PI) / 180);
        const crossHalf = wingHalf * 1.3;   // 30% wider than the arrowhead
        const crossBar: Position[] = [local(0, -r + crossHalf), local(0, -r - crossHalf)];

        return this.asMultiLineStringFeature([line, arc, arrowHead, crossBar]);
    }

    generateHandles(base: Feature<any>, opts: PointGraphicOptions): Feature<MultiPoint> {
        // [edge, center, lineStart] — edge handle at the east end of the
        // semicircle (drives rotate/resize per MissionTask convention),
        // center handle for translate, plus an edit handle at the beginning
        // of the horizontal "P" line (local (−2.4r, +r)).
        const center = base.geometry.coordinates;
        const {rotation, size} = opts;
        const r = Math.max(size, 1);

        const edge = geometryService.createCircularArc(center, rotation, r, 0, 1, 1)[0];

        // P-line start at local (−2.4r, +r), rotated with the graphic.
        const x = -2.4 * r, y = r;
        const dist = Math.hypot(x, y);
        const planarDeg = (Math.atan2(y, x) * 180) / Math.PI;
        let bearing = 90 - (planarDeg + rotation);
        bearing = ((bearing % 360) + 360) % 360;
        const lineStart = turf.destination(center, dist, bearing, {units: 'meters'}).geometry.coordinates as Position;

        return this.asMultiPointFeature([edge, center, lineStart]);
    }

    generateLabels(base: Feature<any>, opts: PointGraphicOptions): Feature<any> {
        // "P" label sits at the midpoint of the horizontal line: (−1.2r, +r).
        // The label position rotates with the graphic, but the label text
        // itself is rendered un-rotated (see MissionTaskGraphicBase →
        // getMissionTaskStyleFn with rotation = 0).
        const center = base.geometry.coordinates;
        const {rotation, size} = opts;
        const r = Math.max(size, 1);
        const x = -1.2 * r, y = r;
        const dist = Math.hypot(x, y);
        const planarDeg = (Math.atan2(y, x) * 180) / Math.PI;
        let bearing = 90 - (planarDeg + rotation);
        bearing = ((bearing % 360) + 360) % 360;
        const labelPos = turf.destination(center, dist, bearing, {units: 'meters'}).geometry.coordinates as Position;
        return this.asPointFeature(labelPos);
    }
}

export class Envelopment extends MovementGraphicBase {
    name: string = TacticalGraphicName.Envelopment;

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        const radius = opts?.radius || 20;
        const baseCoords = base.geometry.coordinates;
        const P0 = baseCoords[baseCoords.length - 2]; // arc start = end of straight part
        const P1 = baseCoords[baseCoords.length - 1]; // arc end = last user point

        // Straight part: all base points except the last.
        // Must have ≥ 2 positions for a valid GeoJSON LineString; duplicate P0 if needed.
        const rawStraight = baseCoords.slice(0, -1);
        const straightPart = rawStraight.length >= 2 ? rawStraight : [P0, P0];

        // Clockwise semicircular arc from P0 to P1
        const center = geometryService.getMidpoint(P0, P1);
        const arcRadius = turf.distance(P0, P1, { units: 'meters' }) / 2;
        const rotation = Math.atan2(P0[1] - center[1], P0[0] - center[0]) * 180 / Math.PI;
        const arc = geometryService.createCircularArc(center, rotation, arcRadius, 0, -180, 64);

        // Open arrowhead tangent to the end of the arc
        const arrowHead = geometryService.computeArrowheadPoints(arc[arc.length - 2], arc[arc.length - 1], radius, 45);

        return this.asMultiLineStringFeature([straightPart, arc, arrowHead]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        const baseCoords = base.geometry.coordinates;
        return this.asMultiPointFeature(geometryService.labelCoordsAtFraction(baseCoords[0], baseCoords[1], 0.25, radius));
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

        // Arrow head sits exactly where the p1-side gap begins (top arc's endpoint),
        // pointing along the arc's tangent. No shaft.
        const arrowTip = topArc[topArc.length - 1];
        const arrowPrev = topArc[topArc.length - 2];
        const arrowHead: Position[] = geometryService.computeArrowheadPoints(arrowPrev, arrowTip, radius, 45);

        // Outward-facing triangles with both base vertices lying on the arc, and
        // apex perpendicular to the base (not radial). Placed at 33%/67% along
        // each arc.
        const triSize = Math.min(radius * 0.9, minorR * 1.1);
        const triangleFractions = [0.33, 0.67];
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
                const apex = turf.destination(mid, triSize, outBearing, {units: 'meters'}).geometry.coordinates as Position;
                triangles.push([b1, apex, b2, b1]);
            }
        };
        addTriangles(topArc, 1);
        addTriangles(bottomArc, -1);

        return this.asMultiLineStringFeature([topArc, bottomArc, arrowHead, ...triangles]);
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

export class Infiltration extends MovementGraphicBase {
    name: string = TacticalGraphicName.Infiltration;

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        const radius: number = opts?.radius || 20;
        const baseCoords = base.geometry.coordinates;
        const lastPoint = baseCoords[baseCoords.length - 1];
        const secondToLastPoint = baseCoords[baseCoords.length - 2];

        const arrowHead: Position[] = geometryService.computeArrowheadPoints(secondToLastPoint, lastPoint, radius, 45);

        return this.asMultiLineStringFeature([baseCoords, arrowHead]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        const baseCoords = base.geometry.coordinates;
        return this.asMultiPointFeature(geometryService.labelCoordsAtFraction(baseCoords[0], baseCoords[1], 0.25, radius));
    }
}

// ─── Ambush — 1/3-circle arc with 7 horizontal hashes + right-pointing arrow ──
// Point-based. At rotation = 0 the arc bulges right (convex facing right, concave
// opening facing left); 7 horizontal hashes fill the half-moon interior between
// the chord and the arc; the arrow emerges from the convex outer bulge pointing
// east. `rotation` rotates the whole graphic; `size` is the circle radius.

export class Ambush extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.Ambush;
    type: string = 'Point';

    generateGraphics(base: Feature<any>, opts: PointGraphicOptions): Feature<MultiLineString> {
        const center = base.geometry.coordinates;
        const {rotation, size} = opts;
        const r = Math.max(size, 1);

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
        const arrowTip = polar(2 * r, 0);
        const arrowHead = geometryService.computeArrowheadPoints(arrowBase, arrowTip, r * 0.25, 30);

        return this.asMultiLineStringFeature([arc, ...lines, [arrowBase, arrowTip], arrowHead]);
    }

    generateHandles(base: Feature<any>, opts: PointGraphicOptions): Feature<MultiPoint> {
        // Match the MissionTask convention: [edge, center]. Edge handle lives at
        // the upper arc endpoint (planar 60° + rotation) and drives rotate/resize;
        // center handle is used for translation.
        const center = base.geometry.coordinates;
        const endPoint = geometryService.createCircularArc(center, opts.rotation, opts.size, 60, 61, 1)[0];
        return this.asMultiPointFeature([endPoint, center]);
    }

    generateLabels(base: Feature<any>, opts: PointGraphicOptions): Feature<any> {
        return this.asPointFeature(base.geometry.coordinates);
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
