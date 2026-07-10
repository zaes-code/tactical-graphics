import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {MovementGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint, Position} from "geojson";
import geometryService from "../core/GeometryService";
import * as turf from "@turf/turf";

export class DirectionOfSupportingAttack extends TacticalGraphicsBase<MovementGraphicOptions> {
    name: string = TacticalGraphicName.DirectionOfSupportingAttack;
    type: string = 'LineString';

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        let size: number = opts?.size || 20;
        let baseCoords = base.geometry.coordinates;
        let arrowCoords: Position[] = geometryService.computeArrowheadPoints(baseCoords[baseCoords.length - 2], baseCoords[baseCoords.length - 1], size * 20, 45)
        return this.asMultiLineStringFeature([baseCoords, arrowCoords]);
    }

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
        let baseCoords = base.geometry.coordinates;
        return this.asMultiPointFeature(baseCoords.slice(0, 2));
    }

}

export class DirectionOfMainAttack extends TacticalGraphicsBase<MovementGraphicOptions> {
    name: string = TacticalGraphicName.DirectionOfMainAttack;
    type: string = 'LineString';

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        let size: number = opts?.size || 20;
        let baseCoords = base.geometry.coordinates;
        let arrowCoords: Position[] = geometryService.createDirectionOfMainAttackArrow(baseCoords, size * 20);
        return this.asMultiLineStringFeature([baseCoords, arrowCoords]);
    }

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
        return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 2));
    }

}


export class DirectionOfMainAttackFeint extends TacticalGraphicsBase<MovementGraphicOptions> {
    name: string = TacticalGraphicName.DirectionOfMainAttackFeint;
    type: string = 'LineString';

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        let size: number = opts?.size || 20;
        let baseCoords = base.geometry.coordinates;
        let arrowCoords: Position[][] = geometryService.createDirectionOfFeintAttackArrow(baseCoords, size * 20);
        return this.asMultiLineStringFeature([baseCoords, ...arrowCoords]);
    }

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
        return this.asMultiPointFeature(base.geometry.coordinates.slice(0, 2));
    }

}

export class AviationDirectionOfAttack extends TacticalGraphicsBase<MovementGraphicOptions> {
    name: string = TacticalGraphicName.AviationDirectionOfAttack;
    type: string = 'LineString';

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        let size: number = opts?.size || 20;
        let baseCoords = base.geometry.coordinates;
        let arrowCoords: Position[] = geometryService.computeArrowheadPoints(baseCoords[baseCoords.length - 2], baseCoords[baseCoords.length - 1], size * 20, 45);
        const bowtieLines = this.createBowtie(baseCoords, size);
        return this.asMultiLineStringFeature([baseCoords, arrowCoords, ...bowtieLines]);
    }

    /**
     * Bow-tie `|><|` marker near the start of the line. Center sits
     * 50 * size map units along the first segment from P0 (≈ 50 screen px at
     * draw time); total width 20 * size, total height 20 * size — scales with
     * the graphic because it's baked into geometry.
     *
     * Along-line points are placed via linear lon/lat interpolation so the
     * apex lands exactly on the rendered segment (which is drawn as a straight
     * line through the same lon/lat endpoints); turf.destination would land on
     * the geodesic, which diverges from the rendered line by a sub-pixel at
     * moderate zoom but becomes visible when zoomed in.
     */
    private createBowtie(baseCoords: Position[], size: number): Position[][] {
        const P0 = baseCoords[0];
        const P1 = baseCoords[1];
        const centerDist = 50 * size;
        const halfWidth = 10 * size;
        const halfHeight = 10 * size;

        const segMeters = turf.distance(turf.point(P0), turf.point(P1), {units: 'meters'});
        if (segMeters === 0) return [];
        const lerp = (d: number): Position => {
            const t = d / segMeters;
            return [P0[0] + t * (P1[0] - P0[0]), P0[1] + t * (P1[1] - P0[1])];
        };

        const center = lerp(centerDist);
        const lCenter = lerp(centerDist - halfWidth);
        const rCenter = lerp(centerDist + halfWidth);

        const lbTop = geometryService.getPerpendicularPoint(lCenter, P0, halfHeight);
        const lbBottom = geometryService.getPerpendicularPoint(lCenter, P0, -halfHeight);
        const rbTop = geometryService.getPerpendicularPoint(rCenter, P0, halfHeight);
        const rbBottom = geometryService.getPerpendicularPoint(rCenter, P0, -halfHeight);

        return [
            [lbTop, lbBottom, center, lbTop],
            [rbTop, rbBottom, center, rbTop],
        ];
    }

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
        let baseCoords = base.geometry.coordinates;
        return this.asMultiPointFeature(baseCoords.slice(0, 2));
    }

}