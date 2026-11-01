import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, MultiLineString, MultiPoint, Point, Position} from "geojson";
import geometryService from "../core/GeometryService";
import {toDegrees, toRadians} from "../core/math";
import {publishesAnchorHandleOnly} from "../core/symbology";

/**
 * Half-height ÷ half-width of the 3:2 box all four crossed tasks are drawn in.
 *
 * MIL-STD-2525E Table L-XXI draws every one of them wider than tall: Destroy, Suppress and
 * Neutralize as an X of the box's two diagonals (measured off the Template at 300 dpi, 32°
 * either side of horizontal), Interdict as a horizontal plus one diagonal (35°). FM 1-02.2
 * draws Destroy and Suppress square, and the library followed it until 2026-10-31.
 *
 * Interdict's rule text asks for 45° between the arrows while its own Template draws 35°;
 * the drawing, which FM 1-02.2 agrees with, is what this follows.
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

/** An X of the 3:2 box's two diagonals: `[0]` is the "/", `[1]` the "\\". */
const WIDE_X_ARMS: CrossArm[] = [
    {angleDeg: toDegrees(Math.atan(WIDE_ASPECT)), reach: Math.hypot(1, WIDE_ASPECT)},
    {angleDeg: 180 - toDegrees(Math.atan(WIDE_ASPECT)), reach: Math.hypot(1, WIDE_ASPECT)},
];

/** Horizontal line plus a corner-to-corner diagonal of the 3:2 box. */
const wideArms = (head: boolean): CrossArm[] => [
    {angleDeg: 0, reach: 1, head},
    {angleDeg: toDegrees(Math.atan(WIDE_ASPECT)), reach: Math.hypot(1, WIDE_ASPECT), head},
];

const CROSS_ARMS: Partial<Record<TacticalGraphicName, CrossArm[]>> = {
    [TacticalGraphicName.Destroy]: WIDE_X_ARMS,
    [TacticalGraphicName.Suppress]: WIDE_X_ARMS,
    [TacticalGraphicName.Neutralize]: WIDE_X_ARMS,
    [TacticalGraphicName.Interdict]: wideArms(true),
};

/**
 * The four tactical mission tasks drawn as two straight lines crossing at a
 * one-letter label: Destroy (solid X, "D"), Suppress (X with both strokes
 * hashed, "S"), Neutralize (X with its "/" hashed, "N") and Interdict
 * (horizontal and diagonal lines, both arrowheaded, "I").
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
    /** A dropped point has no size; it comes from `radius`. @see IGraphicGenerator.requiresRadius */
    readonly requiresRadius = true;

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    private arms(): CrossArm[] {
        return CROSS_ARMS[this.name as TacticalGraphicName] ?? WIDE_X_ARMS;
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
    /**
     * **The centre, alone.** All four plates say "requires one anchor point. The centre
     * point defines the centre of the symbol", and one anchor point is one handle.
     *
     * They still resize — the edit-mode affordance offers it and `handleResize` performs
     * it — so this is not a refusal, and it deliberately does not read `allowedGestures`.
     * It used to: emitting `[edge, centre]` whenever a resize was allowed made the *edge*
     * the live red handle and left the centre as a grey inert dot, which put the grip
     * beside a symbol described by its middle. @see publishesAnchorHandleOnly
     *
     * The `[edge, centre]` branch is kept for any future member of this family whose plate
     * gives it a second anchor point; edge first, the order the controllers depend on.
     */
    generateHandles(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiPoint> {
        const center = base.geometry.coordinates;
        if (publishesAnchorHandleOnly(this.name as TacticalGraphicName)) {
            return this.asMultiPointFeature([center]);
        }
        const edge = geometryService.translateCoordinates(center, opts.size, toRadians(opts.rotation));
        return this.asMultiPointFeature([edge, center]);
    }

    generateLabels(base: Feature<Point>, opts: PointGraphicOptions): Feature<Point> {
        return this.asPointFeature(base.geometry.coordinates);
    }
}
