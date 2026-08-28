import {MultiLineString, MultiPoint, Feature, Point} from 'geojson';
import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {SecurityOperationOptions, TacticalGraphicName} from "../core/type";
import geometryService from "../core/GeometryService";
import * as turf from '../core/turf';

/**
 * The symbol's dimensions in screen pixels at scale 1 - the shipped proportions,
 * and the single source of truth for them.
 *
 * `SecurityOperationGraphicBase` imports these rather than declaring its own copy:
 * the OpenLayers holder multiplies each by the live map resolution, because the
 * graphic holds a constant on-screen size, while a renderer with no resolution to
 * hand gets the same proportions from `size`. Two copies of these numbers would be
 * two symbols that silently disagree.
 */
export const SECURITY_OPERATION_PX = {
    /** Where the label anchor sits, measured from the center. */
    labelPadding: 50,
    /**
     * Clear space between the label and the line that runs away from it.
     *
     * The two used to be locked together: the label was placed at
     * `centerPadding / 1.5`, so the gap was always a third of the padding - 25 px,
     * changeable only by moving the arms too. Naming the gap lets the line come in
     * to meet the label without the label or the arrowheads moving at all.
     */
    labelGap: 20,
    arrowLength: 75,
    arrowDepth: 20,
    arrowHeadLength: 10,
    /** Degrees, not pixels - the one dimensionless member. */
    arrowHeadDegree: 60,
} as const;

const CENTER_PADDING_PX = SECURITY_OPERATION_PX.labelPadding + SECURITY_OPERATION_PX.labelGap;
const ARROW_LENGTH_PX = SECURITY_OPERATION_PX.arrowLength;
const ARROW_DEPTH_PX = SECURITY_OPERATION_PX.arrowDepth;
const ARROW_HEAD_LENGTH_PX = SECURITY_OPERATION_PX.arrowHeadLength;
const ARROW_HEAD_DEGREE = SECURITY_OPERATION_PX.arrowHeadDegree;

/**
 * Center to arrow tip at scale 1, in screen pixels - what `size` measures.
 *
 * Each arm runs from `centerPadding` out to `2 x arrowLength`, so the tip is the
 * padding plus twice the arm.
 */
const HALF_EXTENT_PX = CENTER_PADDING_PX + 2 * ARROW_LENGTH_PX;

/**
 * The half-extent used when a caller supplies no size at all, in meters.
 *
 * The shipped pixel sizes at a mid-scale view (~100 m per pixel), so a graphic
 * built from nothing but a center point is legible rather than a dot. A caller
 * that cares passes `radius`.
 */
const DEFAULT_HALF_EXTENT_METERS = HALF_EXTENT_PX * 100;

export class SecurityOperation extends TacticalGraphicsBase<SecurityOperationOptions> {
    name: string;
    type: string = "Point";

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    /**
     * Every dimension of the symbol, in meters.
     *
     * ## Why these can be derived rather than passed
     *
     * A security operation is a **badge**: it is not resized, and nothing about it
     * describes ground extent. The five numbers below are screen-pixel constants
     * with fixed ratios to one another, so exactly one of them is free - the
     * overall size - and the rest follow.
     *
     * That matters for more than tidiness. The OpenLayers holder passes all five
     * explicitly, straight past `renderTacticalGraphic`, so **no caller of the
     * public API could build one of these at all**: the options are not in
     * `TacticalGraphicProperties` and there is nowhere to put them. Deriving them
     * from `size` - which the property bag does carry, as `radius` - makes the
     * graphic reachable through the published entry point without adding five
     * fields to a public schema to describe constants.
     *
     * An explicit value always wins, so the holder's geometry is unchanged.
     */
    private dimensions(opts: SecurityOperationOptions) {
        // `size` is the symbol's half-extent: center to arrow tip, which at scale 1
        // is the padding plus twice the arm length.
        const size = opts.size ?? DEFAULT_HALF_EXTENT_METERS;
        const of = (px: number) => (size * px) / HALF_EXTENT_PX;

        const centerPadding = opts.centerPadding ?? of(CENTER_PADDING_PX);
        return {
            centerPadding,
            arrowLength: opts.arrowLength ?? of(ARROW_LENGTH_PX),
            arrowDepth: opts.arrowDepth ?? of(ARROW_DEPTH_PX),
            arrowHeadLength: opts.arrowHeadLength ?? of(ARROW_HEAD_LENGTH_PX),
            arrowHeadDegree: opts.arrowHeadDegree ?? ARROW_HEAD_DEGREE,
            // `centerPadding / 1.5` was the original rule and is kept as the fallback,
            // so an options object written against the old signature still produces the
            // geometry it always did. It ties the label-to-line gap to a third of the
            // padding, which is why the holder passes an explicit value instead.
            labelPadding: opts.labelPadding ?? centerPadding / 1.5,
        };
    }

    generateGraphics(base: Feature<Point>, opts: SecurityOperationOptions): Feature<MultiLineString> {
        let {centerPadding, arrowLength, arrowDepth, arrowHeadLength, arrowHeadDegree} = this.dimensions(opts);
        let searchArrowCoords = geometryService.getSearchAreaArrow(centerPadding, arrowLength, arrowDepth, arrowHeadLength, arrowHeadDegree);
        return this.asMultiLineStringFeature(searchArrowCoords);
    }

    generateHandles(base: Feature<Point>, opts: SecurityOperationOptions): Feature {
        let {centerPadding, arrowLength, arrowDepth, arrowHeadLength, arrowHeadDegree} = this.dimensions(opts);
        let searchArrowCoords = geometryService.getSearchAreaArrow(centerPadding, arrowLength, arrowDepth, arrowHeadLength, arrowHeadDegree);

        return this.asMultiPointFeature([[0, 0], searchArrowCoords[1][1], searchArrowCoords[3][1]]);
    }

    generateLabels(base: Feature<Point>, opts: SecurityOperationOptions): Feature<MultiPoint> {
        let {arrowLength, arrowDepth, labelPadding: padding} = this.dimensions(opts);
        let centroid = turf.point([0, 0]);
        // Only element 0 — the inner end — is read, and it depends on the padding
        // alone; `arrowLength` and `arrowDepth` shape the rest of the line and are
        // passed only because the helper takes them.
        let rightArrowBaseCoords = geometryService.getSearchArrowLine(centroid, padding, arrowLength, arrowDepth);
        let leftArrowBaseCoords = geometryService.getSearchArrowLine(centroid, -padding, -arrowLength, -arrowDepth);
        return this.asMultiPointFeature([leftArrowBaseCoords[0], rightArrowBaseCoords[0]]);
    }
}
