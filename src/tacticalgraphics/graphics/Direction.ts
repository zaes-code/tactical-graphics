import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {MovementGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint, Position} from "geojson";
import geometryService from "../core/GeometryService";
import * as turf from '../core/turf';

export class DirectionOfSupportingAttack extends TacticalGraphicsBase<MovementGraphicOptions> {
    name: string = TacticalGraphicName.DirectionOfSupportingAttack;
    type: string = 'LineString';

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        let size: number = opts?.size || 20;
        let baseCoords = base.geometry.coordinates;
        let arrowCoords: Position[] = geometryService.computeArrowheadPoints(baseCoords[baseCoords.length - 2], baseCoords[baseCoords.length - 1], size, 45)
        return this.asMultiLineStringFeature([baseCoords, arrowCoords]);
    }

    /**
     * **The drawn vertices, and nothing else.**
     *
     * These used to be `[start, arrowTip, arrowHeadBase]` — two of them placed off the
     * line by `radius`, on the arrow. OpenLayers never passed a radius into this call, so
     * its fallback of 20 m collapsed both onto the line's end and it drew what looked
     * like two handles at one vertex; MapLibre passed the real one and drew them out on
     * the arrowhead, where they read as dots floating beside the graphic.
     *
     * Neither placement earned its keep. The tip and the arrowhead base are *derived* —
     * dragging them cannot mean anything the line's own ends do not already say — so the
     * handles are the vertices the user drew, in both engines and for any consumer.
     */
    generateHandles(base: Feature<LineString>, _opts?: MovementGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates);
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
        let arrowCoords: Position[] = geometryService.createDirectionOfMainAttackArrow(baseCoords, size);
        return this.asMultiLineStringFeature([baseCoords, arrowCoords]);
    }

    /**
     * **The drawn vertices, and nothing else.**
     *
     * These used to be `[start, arrowTip, arrowHeadBase]` — two of them placed off the
     * line by `radius`, on the arrow. OpenLayers never passed a radius into this call, so
     * its fallback of 20 m collapsed both onto the line's end and it drew what looked
     * like two handles at one vertex; MapLibre passed the real one and drew them out on
     * the arrowhead, where they read as dots floating beside the graphic.
     *
     * Neither placement earned its keep. The tip and the arrowhead base are *derived* —
     * dragging them cannot mean anything the line's own ends do not already say — so the
     * handles are the vertices the user drew, in both engines and for any consumer.
     */
    generateHandles(base: Feature<LineString>, _opts?: MovementGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates);
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
        let arrowCoords: Position[][] = geometryService.createDirectionOfFeintAttackArrow(baseCoords, size);
        return this.asMultiLineStringFeature([baseCoords, ...arrowCoords]);
    }

    /**
     * **The drawn vertices, and nothing else.**
     *
     * These used to be `[start, arrowTip, arrowHeadBase]` — two of them placed off the
     * line by `radius`, on the arrow. OpenLayers never passed a radius into this call, so
     * its fallback of 20 m collapsed both onto the line's end and it drew what looked
     * like two handles at one vertex; MapLibre passed the real one and drew them out on
     * the arrowhead, where they read as dots floating beside the graphic.
     *
     * Neither placement earned its keep. The tip and the arrowhead base are *derived* —
     * dragging them cannot mean anything the line's own ends do not already say — so the
     * handles are the vertices the user drew, in both engines and for any consumer.
     */
    generateHandles(base: Feature<LineString>, _opts?: MovementGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates);
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
        let arrowCoords: Position[] = geometryService.computeArrowheadPoints(baseCoords[baseCoords.length - 2], baseCoords[baseCoords.length - 1], size, 45);
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
     *
     * **It is clamped to the segment it sits on, and clear of the arrowhead.**
     * The centre distance is a fixed multiple of `size`, so on a base shorter than
     * that multiple the interpolation runs past P1 and the bow-tie leaves the line
     * altogether — at a quarter of the needed length it sat six times the line's own
     * length beyond the end. `minimumFirstSegmentPx` stops a *drawn* graphic ever
     * getting that short, but the generator cannot assume it was consulted: a base
     * arrives here from an imported file, from a host calling `renderTacticalGraphic`
     * directly, and from any renderer that has not applied the floor. So the geometry
     * defends itself, and the floor is what keeps it from ever having to.
     *
     * Room runs out in two stages. First the glyph slides back along the segment,
     * keeping its size; when even that will not fit it shrinks to the room there is,
     * which reads as a graphic drawn too small rather than as a broken symbol.
     */
    private createBowtie(baseCoords: Position[], size: number): Position[][] {
        const P0 = baseCoords[0];
        const P1 = baseCoords[1];
        // Was 50/10/10 x a 20px unit; `size` now *is* that unit's worth of meters,
        // so the same shape is 2.5 / 0.5 / 0.5 x it.
        const preferredCenter = 2.5 * size;
        const glyphHalf = 0.5 * size;

        const segMeters = turf.distance(turf.point(P0), turf.point(P1), {units: 'meters'});
        if (segMeters === 0) return [];

        /*
         * What the far end of the first segment is already spending.
         *
         * The arrowhead is drawn on the LAST segment, so it only competes with the
         * bow-tie when the base is two points and the two segments are the same one.
         * Its barbs run back from the tip at 45°, so along the line it reaches
         * `size * cos(45°)`. @see GeometryService.computeArrowheadPoints
         */
        const arrowheadReach = baseCoords.length === 2 ? size * Math.SQRT1_2 : 0;
        const clearance = 0.25 * size; // a visible gap, not a touch
        const usable = segMeters - arrowheadReach - clearance;
        if (usable <= 0) return [];

        let halfWidth = glyphHalf;
        let halfHeight = glyphHalf;
        let centerDist: number;
        if (2 * glyphHalf > usable) {
            const scale = usable / (2 * glyphHalf);
            halfWidth = glyphHalf * scale;
            halfHeight = glyphHalf * scale;
            centerDist = usable / 2;
        } else {
            centerDist = Math.min(preferredCenter, usable - halfWidth);
            centerDist = Math.max(centerDist, halfWidth); // never start behind P0
        }

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

    /**
     * **The drawn vertices, and nothing else.**
     *
     * These used to be `[start, arrowTip, arrowHeadBase]` — two of them placed off the
     * line by `radius`, on the arrow. OpenLayers never passed a radius into this call, so
     * its fallback of 20 m collapsed both onto the line's end and it drew what looked
     * like two handles at one vertex; MapLibre passed the real one and drew them out on
     * the arrowhead, where they read as dots floating beside the graphic.
     *
     * Neither placement earned its keep. The tip and the arrowhead base are *derived* —
     * dragging them cannot mean anything the line's own ends do not already say — so the
     * handles are the vertices the user drew, in both engines and for any consumer.
     */
    generateHandles(base: Feature<LineString>, _opts?: MovementGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates);
    }

    generateLabels(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        let baseCoords = base.geometry.coordinates;
        return this.asMultiPointFeature(baseCoords.slice(0, 2));
    }

}