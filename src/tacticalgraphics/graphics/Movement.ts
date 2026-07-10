import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {MovementGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint, Position} from "geojson";
import geometryService from "../core/GeometryService";
import * as turf from "@turf/turf";

export abstract class MovementGraphicBase extends TacticalGraphicsBase<MovementGraphicOptions> {
    type = "LineString";

    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        let radius: number = opts?.radius || 20;
        let baseCoords = base.geometry.coordinates;
        let lastLinePoint = baseCoords[baseCoords.length - 1];
        let secondToLastLinePoint = baseCoords[baseCoords.length - 2];
        const leftArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, radius);
        const arrowTipCoord: Position = geometryService.getExtendedPoint(lastLinePoint, secondToLastLinePoint, radius);
        const leftArrowHeadBase: Position = geometryService.getPerpendicularPoint(leftArrowBase[leftArrowBase.length - 1], leftArrowBase[leftArrowBase.length - 2], radius);
        return this.asMultiPointFeature([baseCoords[0], arrowTipCoord, leftArrowHeadBase]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        const baseCoords = base.geometry.coordinates;
        return this.asMultiPointFeature(geometryService.labelCoordsAtFraction(baseCoords[0], baseCoords[1], 0.5, radius));
    }
}

export class AttackHelicopterAxisOfAdvance extends MovementGraphicBase {
    name: string = TacticalGraphicName.AttackHelicopterAxisOfAdvance;

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
        // add a twist in the middle of the arrow segment (same as AviationAxisOfAdvance)
        const [lastLeft] = leftArrowBase.splice(leftArrowBase.length - 1, 1);
        const [lastRight] = rightArrowBase.splice(rightArrowBase.length - 1, 1);

        // Save twist edge start points before the push overwrites them
        const secondToLastLeft = leftArrowBase[leftArrowBase.length - 1];
        const secondToLastRight = rightArrowBase[rightArrowBase.length - 1];

        leftArrowBase.push(lastRight);
        rightArrowBase.push(lastLeft);
        const arrowTipCoord: Position = geometryService.getExtendedPoint(lastLinePoint, secondToLastLinePoint, radius);

        let arrowCoords: Position[] = [lastLeft, leftArrowHeadBase, arrowTipCoord, rightArrowHeadBase, lastRight];

        // Two bars parallel to the arrowhead base, snapped to the twist edges.
        // Bar direction is parallel to lastLeft→lastRight (the arrowhead base).
        // Endpoints are found by intersecting that bar line with the two twist edges:
        //   Edge A: secondToLastLeft → lastRight
        //   Edge B: secondToLastRight → lastLeft
        const barDir: Position = [lastRight[0] - lastLeft[0], lastRight[1] - lastLeft[1]];
        const edgeADir: Position = [lastRight[0] - secondToLastLeft[0], lastRight[1] - secondToLastLeft[1]];
        const edgeBDir: Position = [lastLeft[0] - secondToLastRight[0], lastLeft[1] - secondToLastRight[1]];

        // 2D cross product: a × b = a[0]*b[1] - a[1]*b[0]
        const cross = (a: Position, b: Position) => a[0] * b[1] - a[1] * b[0];

        const lerp = (a: Position, b: Position, t: number): Position =>
            [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];

        const bars: Position[][] = [];
        for (const t of [0.3, 0.7]) {
            const center = lerp(secondToLastLinePoint, lastLinePoint, t);
            // Intersect line (center + s*barDir) with Edge A (secondToLastLeft + u*edgeADir)
            const dA: Position = [center[0] - secondToLastLeft[0], center[1] - secondToLastLeft[1]];
            const denomA = cross(barDir, edgeADir);
            const uA = denomA !== 0 ? cross(barDir, dA) / denomA : 0;
            const ptA: Position = [secondToLastLeft[0] + uA * edgeADir[0], secondToLastLeft[1] + uA * edgeADir[1]];

            // Intersect line (center + s*barDir) with Edge B (secondToLastRight + v*edgeBDir)
            const dB: Position = [center[0] - secondToLastRight[0], center[1] - secondToLastRight[1]];
            const denomB = cross(barDir, edgeBDir);
            const vB = denomB !== 0 ? cross(barDir, dB) / denomB : 0;
            const ptB: Position = [secondToLastRight[0] + vB * edgeBDir[0], secondToLastRight[1] + vB * edgeBDir[1]];

            bars.push([ptA, ptB]);
        }
        const [bar1, bar2] = bars;

        return this.asMultiLineStringFeature([
            leftArrowBase, arrowCoords.reverse(), rightArrowBase.reverse(),
            bar1, bar2,
        ]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        const baseCoords = base.geometry.coordinates;
        // coords[0..1]: text label position (near tail, same as AviationAxisOfAdvance)
        const textCoords = geometryService.labelCoordsAtFraction(baseCoords[0], baseCoords[1], 0.1, radius);
        // coords[2]: actual twist intercept (midpoint of the last centerline segment)
        const last = baseCoords[baseCoords.length - 1];
        const secondToLast = baseCoords[baseCoords.length - 2];
        const twistCenter: Position = [(secondToLast[0] + last[0]) / 2, (secondToLast[1] + last[1]) / 2];
        // coords[3]: direction point (for computing arrow heading)
        return this.asMultiPointFeature([...textCoords, twistCenter, secondToLast]);
    }
}

export class AviationAxisOfAdvance extends MovementGraphicBase {
    name: string = 'AviationAxisOfAdvance';

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
        // add a twist in the middle of the arrow segment
        const [lastLeft] = leftArrowBase.splice(leftArrowBase.length - 1, 1);
        const [lastRight] = rightArrowBase.splice(rightArrowBase.length - 1, 1);

        leftArrowBase.push(lastRight);
        rightArrowBase.push(lastLeft);
        const arrowTipCoord: Position = geometryService.getExtendedPoint(lastLinePoint, secondToLastLinePoint, radius);

        let arrowCoords: Position[] = [lastLeft, leftArrowHeadBase, arrowTipCoord, rightArrowHeadBase, lastRight];
        return this.asMultiLineStringFeature([leftArrowBase, arrowCoords.reverse(), rightArrowBase.reverse()]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        const baseCoords = base.geometry.coordinates;
        return this.asMultiPointFeature(geometryService.labelCoordsAtFraction(baseCoords[0], baseCoords[1], 0.1, radius));
    }
}

export class AxisOfAttack extends MovementGraphicBase {
    name: string = 'AxisOfAttack';

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
        let lastLeft = leftArrowBase[leftArrowBase.length - 1];
        let lastRight = rightArrowBase[rightArrowBase.length - 1];

        const arrowTipCoord: Position = geometryService.getExtendedPoint(lastLinePoint, secondToLastLinePoint, radius);
        const leftArrowHeadParallel: Position = geometryService.getExtendedPoint(
            leftArrowHeadBase,
            leftArrowBase[leftArrowBase.length - 1],
            radius * 0.3,
        );
        const rightArrowHeadParallel: Position = geometryService.getExtendedPoint(
            rightArrowHeadBase,
            rightArrowBase[rightArrowBase.length - 1],
            radius * 0.3,
        );
        const extendedTip: Position = geometryService.getExtendedPoint(lastLinePoint, secondToLastLinePoint, radius * 1.3);
        const arrowExtraSegments = geometryService.lineStringToDashes([leftArrowHeadParallel, extendedTip, rightArrowHeadParallel], [radius / 3, radius / 3]);
        let arrowCoords: Position[] = [lastLeft, leftArrowHeadBase, arrowTipCoord, rightArrowHeadBase, lastRight];

        return this.asMultiLineStringFeature([leftArrowBase, rightArrowBase, arrowCoords, ...arrowExtraSegments.geometry.coordinates]);
    }
}

/**
 * Emits a 2-point label span lying along the last base segment, ending at the
 * final base vertex (= arrow tip anchor). The style function uses this span
 * for rotation + scale and places the right-aligned "name DTG" label just
 * behind the arrowhead.
 */
export function labelSpanNearArrowhead(base: Feature<LineString>, opts?: MovementGraphicOptions): Position[] {
    const radius = opts?.radius || 20;
    const baseCoords = base.geometry.coordinates;
    const last = baseCoords[baseCoords.length - 1];
    const secondToLast = baseCoords[baseCoords.length - 2];
    const segLen = turf.distance(secondToLast, last, {units: 'meters'});
    if (segLen === 0) return [secondToLast, last];
    const t0 = Math.max(0, 1 - radius / segLen);
    const c0: Position = [
        secondToLast[0] + t0 * (last[0] - secondToLast[0]),
        secondToLast[1] + t0 * (last[1] - secondToLast[1]),
    ];
    return [c0, last];
}

export class MainAttack extends MovementGraphicBase {
    name: string = TacticalGraphicName.MainAxisOfAdvance;

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        let radius: number = opts?.radius || 20;
        let baseCoords = base.geometry.coordinates;

        const leftArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, radius);
        const rightArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, -radius);
        let arrowCoords: Position[] = geometryService.createMainAttackArrow(baseCoords, leftArrowBase, rightArrowBase, radius);
        return this.asMultiLineStringFeature([leftArrowBase, arrowCoords, rightArrowBase.reverse()]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature(labelSpanNearArrowhead(base, opts));
    }
}

export class MainAttackFeint extends MovementGraphicBase {
    name: string = TacticalGraphicName.MainAxisOfAdvanceFeint;

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        let radius: number = opts?.radius || 20;
        let baseCoords = base.geometry.coordinates;

        const leftArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, radius);
        const rightArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, -radius);
        let arrowCoords: Position[] = geometryService.createMainAttackArrow(baseCoords, leftArrowBase, rightArrowBase, radius);

        const feintDashes = this.computeFeintOutline(baseCoords, radius);

        return this.asMultiLineStringFeature([
            leftArrowBase,
            arrowCoords,
            rightArrowBase.reverse(),
            ...feintDashes.dashes,
        ]);
    }

    /**
     * Dashed 3-point chevron (leftWing → apex → rightWing) in front of the
     * solid arrow casing, matching the solid arrowhead's angle.
     *
     * Solid arrowhead: wings at (0, ±2r) relative to `last`, tip at 1.5r
     * forward → half-angle atan2(2r, 1.5r) ≈ 53°.
     *
     * Feint uses the same perp / forward ratio so the angle matches:
     *   wings at (wingForward, ±2r), apex at (wingForward + 1.5r, 0).
     * `wingForward` = 1.75r sits 0.25r (= 5 px at draw time) past the solid
     * tip, keeping the chevron close. All distances scale with `radius`.
     */
    private computeFeintOutline(baseCoords: Position[], radius: number): {
        dashes: Position[][];
        tip: Position;
    } {
        const last = baseCoords[baseCoords.length - 1];
        const secondToLast = baseCoords[baseCoords.length - 2];
        const lineBearing = turf.bearing(secondToLast, last);

        //const wingForward = radius * .60; //.60

        const apexForward = radius * 2.25;      // fixed — this is the tip
        const armLength = radius * 3.7;         // ← lengthen by increasing this
        const wingForward = apexForward - armLength * 0.6;   // pulls wing back
        const wingPerp    = armLength * 0.8;                 // spreads wing out

        const wingCenter = turf.destination(last, wingForward, lineBearing, {units: 'meters'})
            .geometry.coordinates as Position;
        const feintLeftWing = turf.destination(wingCenter, wingPerp, lineBearing - 90, {units: 'meters'})
            .geometry.coordinates as Position;
        const feintRightWing = turf.destination(wingCenter, wingPerp, lineBearing + 90, {units: 'meters'})
            .geometry.coordinates as Position;
        const feintTip = turf.destination(last, apexForward, lineBearing, {units: 'meters'})
            .geometry.coordinates as Position;

        const dashed = geometryService.lineStringToDashes(
            [feintLeftWing, feintTip, feintRightWing],
            [radius / 3, radius / 3],
        );
        return {dashes: dashed.geometry.coordinates, tip: feintTip};
    }

    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        const baseCoords = base.geometry.coordinates;

        const leftArrowBase: Position[] = geometryService.computeParallelLineString(baseCoords, radius);
        const leftArrowHeadBase: Position = geometryService.getPerpendicularPoint(
            leftArrowBase[leftArrowBase.length - 1],
            leftArrowBase[leftArrowBase.length - 2],
            radius,
        );

        // Tip handle = feint chevron apex instead of the solid arrow tip.
        const {tip: feintTip} = this.computeFeintOutline(baseCoords, radius);

        return this.asMultiPointFeature([baseCoords[0], feintTip, leftArrowHeadBase]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature(labelSpanNearArrowhead(base, opts));
    }
}

export class SupportingAttack extends MovementGraphicBase {
    name: string = TacticalGraphicName.SupportingAxisOfAdvance;

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

        let arrowCoords: Position[] = [
            leftArrowBase[leftArrowBase.length - 1],
            leftArrowHeadBase,
            arrowTipCoord,
            rightArrowHeadBase,
            rightArrowBase[rightArrowBase.length - 1]
        ];
        return this.asMultiLineStringFeature([leftArrowBase, arrowCoords, rightArrowBase.reverse()]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature(labelSpanNearArrowhead(base, opts));
    }
}

export class Counterattack extends MovementGraphicBase {
    name: string = TacticalGraphicName.Counterattack;

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

        let arrowCoords: Position[] = [
            leftArrowBase[leftArrowBase.length - 1],
            leftArrowHeadBase,
            arrowTipCoord,
            rightArrowHeadBase,
            rightArrowBase[rightArrowBase.length - 1]
        ];
        return geometryService.lineStringToDashes([leftArrowBase, arrowCoords, rightArrowBase.reverse()].flat(), [radius / 3, radius / 3]);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const radius = opts?.radius || 20;
        const baseCoords = base.geometry.coordinates;
        const secondToLast = baseCoords[baseCoords.length - 2];
        const lastPoint = baseCoords[baseCoords.length - 1];
        // Label sits at midpoint of the last body segment (not in the arrowhead).
        return this.asMultiPointFeature(geometryService.labelCoordsAtFraction(secondToLast, lastPoint, 0.5, radius));
    }
}