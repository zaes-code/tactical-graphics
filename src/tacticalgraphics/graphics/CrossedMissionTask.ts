import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, MultiLineString, MultiPoint, Point, Position} from "geojson";
import geometryService from "../core/GeometryService";
import {toDegrees, toRadians} from "../core/math";

/**
 * Half-height ÷ half-width of the symbol box the two "wide" crossed tasks are
 * drawn in. FM 1-02.2's Interdict and Neutralize plates sit in a 3:2 box with
 * the second line running corner to corner — that is what puts it at ~34°
 * instead of the 45° the square Destroy / Suppress plates use.
 */
const WIDE_ASPECT = 2 / 3;

/** Arrowhead length and half-angle, as drawn on the Interdict plate. */
const ARROWHEAD_RATIO = 0.22;
const ARROWHEAD_DEG = 30;

/**
 * One of the two straight lines that cross at the symbol's center.
 *
 * Both ends are drawn; `head` puts an open arrowhead on the end in the
 * `+angleDeg` direction only, which is the end FM 1-02.2 marks on Interdict.
 */
interface CrossArm {
    /** Planar angle through the center, degrees, 0 = east, before `rotation`. */
    angleDeg: number;
    /** Half-length as a multiple of `opts.size` — the box's half-width. */
    reach: number;
    /** Arrowhead on the `+angleDeg` end. */
    head?: boolean;
}

/** 45° X reaching the corners of a square box. */
const SQUARE_ARMS: CrossArm[] = [
    {angleDeg: 45, reach: Math.SQRT2},
    {angleDeg: 135, reach: Math.SQRT2},
];

/** Horizontal line plus a corner-to-corner diagonal of a 3:2 box. */
const wideArms = (head: boolean): CrossArm[] => [
    {angleDeg: 0, reach: 1, head},
    {angleDeg: toDegrees(Math.atan(WIDE_ASPECT)), reach: Math.hypot(1, WIDE_ASPECT), head},
];

const CROSS_ARMS: Partial<Record<TacticalGraphicName, CrossArm[]>> = {
    [TacticalGraphicName.Destroy]: SQUARE_ARMS,
    [TacticalGraphicName.Suppress]: SQUARE_ARMS,
    [TacticalGraphicName.Neutralize]: wideArms(false),
    [TacticalGraphicName.Interdict]: wideArms(true),
};

/**
 * The four tactical mission tasks drawn as two straight lines crossing at a
 * one-letter label: Destroy (solid X, "D"), Suppress (X with one hashed
 * stroke, "S"), Neutralize (horizontal line plus a hashed diagonal, "N") and
 * Interdict (horizontal and diagonal lines, both arrowheaded, "I").
 *
 * Point-anchored: the user places a center and the symbol keeps its doctrinal
 * proportions under resize and rotate. Nothing about it is stretchable, so
 * there are no line vertices to edit — `generateHandles` publishes the center
 * and nothing else.
 *
 * **Sub-line layout**, which `crossedMissionTaskStyleFunc` depends on:
 *   `[0]` first arm, `[1]` second arm, `[2…]` arrowheads.
 * The two arms run right through the center; the style function is what opens
 * the gap for the label, sized from the glyph it actually renders.
 */
export class CrossedMissionTask extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string;
    type: string = 'Point';

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    private arms(): CrossArm[] {
        return CROSS_ARMS[this.name as TacticalGraphicName] ?? SQUARE_ARMS;
    }

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiLineString> {
        const center = base.geometry.coordinates;
        const {rotation, size} = opts;

        const arms: Position[][] = [];
        const heads: Position[][] = [];
        for (const arm of this.arms()) {
            const half = size * arm.reach;
            const angle = toRadians(arm.angleDeg + rotation);
            const positive = geometryService.translateCoordinates(center, half, angle);
            const negative = geometryService.translateCoordinates(center, half, angle + Math.PI);
            arms.push([negative, positive]);
            if (arm.head) {
                heads.push(geometryService.computeArrowheadPoints(negative, positive, size * ARROWHEAD_RATIO, ARROWHEAD_DEG));
            }
        }
        return this.asMultiLineStringFeature([...arms, ...heads]);
    }

    /**
     * The center, and only the center. A crossed mission task has no dimension
     * the user may drag independently — an edge handle would suggest one that
     * does not exist. Resize and rotate work off the symbol itself.
     */
    generateHandles(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([base.geometry.coordinates]);
    }

    generateLabels(base: Feature<Point>, opts: PointGraphicOptions): Feature<Point> {
        return this.asPointFeature(base.geometry.coordinates);
    }
}
