import {MultiLineString, MultiPoint, Feature, LineString, Position} from 'geojson';
import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {SecurityOperationOptions, TacticalGraphicName} from "../core/type";
import * as turf from '../core/turf';

/**
 * # Cover, guard and screen: two clicks, four anchor points
 *
 * APP-06 342201/342202/342203 are **four-point symbols**:
 *
 * > Anchor Points. This symbol requires four points. Point 1 and Point 2 define the ends of
 * > one arrow and Point 3 and Point 4 define the ends of the other arrow. Point 1 and Point
 * > 4 define the ends of their respective arrowheads.
 * > Size/Shape. Points 1 and 2 and Points 3 and 4 determine the length of the arrows.
 *
 * They were drawn from a single anchor at a fixed screen size until 2026-08-29 — a badge
 * rather than a measure, marking a point on the display instead of a span of ground. The
 * operator now draws **one arrow**, point 1 at the arrowhead and point 2 at its inner end,
 * and the other arrow is derived: the standard's own symmetry, so the pair always agree in
 * length and lie on one axis, which four hand-placed points cannot be relied on to do.
 * (User's call, 2026-08-29.)
 *
 * Everything is a ratio of the drawn arm, so a resize scales the whole symbol and the gap
 * that carries the letters and the unit symbol keeps its proportion. The ratios are the
 * shipped ones, recovered from the pixel constants the badge was built from — the symbol
 * looks exactly as it did, at whatever size it is drawn.
 */

/**
 * The symbol's proportions in screen pixels at scale 1 — the shipped numbers, kept as the
 * source the ratios below are derived from so the look is traceable to what it replaced.
 *
 * Still exported: `symbology.ts` reads the half-extent to describe the graphic's size, and
 * the OpenLayers holder used to multiply each of these by the live resolution.
 */
export const SECURITY_OPERATION_PX = {
    /** Where the label anchor sits, measured from the center. */
    labelPadding: 50,
    /** Clear space between the label and the line that runs away from it. */
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

/**
 * The arm the operator draws, in the old pixel frame: from its inner end at
 * `centerPadding` out to the tip, which the shipped shape put at
 * `2 x arrowLength - arrowDepth + arrowLength`.
 */
const ARM_PX = 3 * ARROW_LENGTH_PX - ARROW_DEPTH_PX - CENTER_PADDING_PX;

/**
 * The arm, as a polyline in units of its own length: `[along, across]` from the inner end
 * outward, `across` positive to the left.
 *
 * **The shipped profile, unchanged.** The line runs out, comes *back* while dropping, then
 * runs out again to the arrowhead — the fold is what the symbol has always drawn and what
 * tells these three apart from a plain double-headed arrow. Recovered from
 * `getSearchArrowLine`, which built the same four points in screen pixels — `(70,0)
 * (150,0) (130,-20) (205,-20)` — less the 70 of centre padding and over the 135 the arm
 * spans.
 *
 * Straightened once on 2026-08-29 and restored the same day at the user's direction, then
 * squared back to these numbers after a version measured off the Template ran the diagonal
 * outward instead of folding. The fold is the symbol; keep it. What did change is where the
 * arms start, which is `HALF_GAP_RATIO`.
 *
 * **The lateral runs positive, which puts the arrowhead below the letters.** The segment
 * leaving the letter sits on the axis, the fold drops, and the barbed segment runs lower —
 * "the lines going away from the symbol sit higher than the line with the arrowhead", which
 * is the plate and the user's own description of it. It was negative for two commits, which
 * stood the arrowheads above the axis instead. Check it as a number: each arm's tip should
 * measure *south* of its inner end on an east-west graphic.
 */
const ARM_PROFILE: readonly [number, number][] = [
    [0, 0],
    [(2 * ARROW_LENGTH_PX - CENTER_PADDING_PX) / ARM_PX, 0],
    [(2 * ARROW_LENGTH_PX - ARROW_DEPTH_PX - CENTER_PADDING_PX) / ARM_PX, ARROW_DEPTH_PX / ARM_PX],
    [1, ARROW_DEPTH_PX / ARM_PX],
];

/**
 * Half the gap between the two arms' inner ends, as a share of one arm's length.
 *
 * **Measured off the plate, not off the badge.** The shipped constants put the inner ends
 * `centerPadding` from the centre — 70 px against a 135 px arm, so the hole between the
 * arms was as wide as an arm was long. APP-06 342201's Template sets the two letters and
 * the unit box in a gap about 0.42 of one arm, which is what this is: the lines come in
 * close to what they surround. (User's call, 2026-08-29: "make the lines closer to the
 * center graphics".)
 */
const HALF_GAP_RATIO = 0.21;

/**
 * Where a letter sits, as a share of an arm's length inward from that arm's inner end.
 *
 * Small, because the plate sets each letter directly against the end of its own arm — it
 * belongs to that arm rather than to the space in the middle, which is the unit symbol's.
 */
const LABEL_INSET_RATIO = 0.04;

/** The arrowhead's barb, as a share of the arm's length, and its half-angle in degrees. */
const ARROW_HEAD_RATIO = SECURITY_OPERATION_PX.arrowHeadLength / ARM_PX;
const ARROW_HEAD_DEGREE = SECURITY_OPERATION_PX.arrowHeadDegree;

/**
 * Centre to arrow tip, as a share of one arm — what `radius` measures for these three.
 *
 * @see securityOperationHalfExtent, which converts a drawn arm into that number so the
 * dialog and the snapshot describe the same quantity every other resizable graphic does.
 */
export const HALF_EXTENT_RATIO = 1 + HALF_GAP_RATIO;

/**
 * The half-extent in the old pixel frame: the arm the badge drew, plus the gap the symbol
 * now keeps. Derived from the ratio rather than restated, so it cannot drift from the shape.
 */
export const SECURITY_OPERATION_HALF_EXTENT_PX = ARM_PX * HALF_EXTENT_RATIO;

/** The half-extent a drawn arm implies, in metres. */
export const securityOperationHalfExtent = (armMetres: number): number => armMetres * HALF_EXTENT_RATIO;

/** The arm length that produces a given half-extent, in metres — the inverse, for a resize. */
export const securityOperationArm = (halfExtentMetres: number): number => halfExtentMetres / HALF_EXTENT_RATIO;

/** A point `along` metres from `from` on `bearing`, then `across` metres to its left. */
const at = (from: Position, bearing: number, along: number, across: number): Position => {
    const forward = turf.destination(turf.point(from), along, bearing, {units: 'meters'});
    if (!across) return forward.geometry.coordinates;
    return turf.destination(forward, Math.abs(across), bearing + (across > 0 ? -90 : 90), {units: 'meters'})
        .geometry.coordinates;
};

export class SecurityOperation extends TacticalGraphicsBase<SecurityOperationOptions> {
    name: string;
    /**
     * **Two clicks, not one.** The base is the arrow of points 1 and 2; the second arrow is
     * derived. @see the docblock above.
     */
    type: string = 'LineString';

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    /**
     * The symbol's frame, from the drawn arm.
     *
     * `tip` is point 1 and `inner` is point 2, so the axis runs *inward* from the arrowhead
     * — which is the direction everything else is measured along. A base with one point, or
     * two points on top of each other, has no axis and produces nothing rather than a
     * degenerate symbol.
     */
    private frame(base: Feature<LineString>) {
        const coords = base.geometry?.coordinates ?? [];
        if (coords.length < 2) return undefined;

        const tip = coords[0];
        const inner = coords[coords.length - 1];
        /*
         * **The arm is what was drawn, and nothing else sets it.**
         *
         * Not `opts.size`: a resize on a fixed-vertex line scales the *base*, so the drawn
         * arm already carries the new length and reading a second number would fight it.
         * `LineGraphicBase` passes its decoration scalar as `size`, which for these is a
         * few hundred metres — taken as the half-extent it drew the whole symbol as a
         * speck. @see securityOperationHalfExtent for the number that describes the size.
         */
        const arm = turf.distance(turf.point(tip), turf.point(inner), {units: 'meters'});
        if (!(arm > 0)) return undefined;

        const inward = turf.bearing(turf.point(tip), turf.point(inner));
        const centre = at(inner, inward, arm * HALF_GAP_RATIO, 0);
        return {tip, inner, arm, inward, centre};
    }

    /** One arm, from its inner end outward along `bearing`, with the arrowhead at its tip. */
    private arm(innerEnd: Position, bearing: number, arm: number, mirrored: boolean): Position[][] {
        const across = (value: number) => (mirrored ? -value : value) * arm;
        const line = ARM_PROFILE.map(([along, lateral]) => at(innerEnd, bearing, along * arm, across(lateral)));

        // The barb sits on the last segment, opening back down it. Built from the two points
        // that segment runs between, so it follows the step rather than the axis.
        const shaft = line[line.length - 2];
        const point = line[line.length - 1];
        const back = turf.bearing(turf.point(point), turf.point(shaft));
        const barb = arm * ARROW_HEAD_RATIO;
        const head = [
            at(point, back + ARROW_HEAD_DEGREE / 2, barb, 0),
            point,
            at(point, back - ARROW_HEAD_DEGREE / 2, barb, 0),
        ];
        return [line, head];
    }

    generateGraphics(base: Feature<LineString>, opts: SecurityOperationOptions): Feature<MultiLineString> {
        const f = this.frame(base);
        if (!f) return this.asMultiLineStringFeature([]);

        // The drawn arm runs outward from its inner end, back toward point 1; the derived
        // arm runs outward the other way from the far side of the gap. Mirrored, not
        // rotated, so both steps fall on the same side — which is the shipped profile.
        const outward = f.inward + 180;
        const innerLeft = at(f.centre, outward, f.arm * HALF_GAP_RATIO, 0);
        const innerRight = at(f.centre, f.inward, f.arm * HALF_GAP_RATIO, 0);
        /*
         * **The second arm's fold is mirrored, so the symbol turns about its centre.**
         *
         * `across` is measured to the left of the direction of travel, and the two arms
         * travel opposite ways — so keeping the sign puts both arrowheads on the same side
         * of the axis, and flipping it puts one above and one below.
         *
         * The shipped badge did the former: `reflectAcrossYAxis` mirrored x and kept y, and
         * the catalog tile still shows both arms ending at the same lower y — right
         * `(168,77) (212,77) (201,88) (242,88)`, left `(92,77) (48,77) (59,88) (18,88)`.
         * Drawn at the size an operator chooses, the user picked the mirrored fold instead
         * (2026-08-29, having been shown both). So this is a deliberate departure from what
         * shipped, not a reproduction of it, and it is recorded as one.
         */
        return this.asMultiLineStringFeature([
            ...this.arm(innerLeft, outward, f.arm, false),
            ...this.arm(innerRight, f.inward, f.arm, true),
        ]);
    }

    /**
     * **No handles.** The operator moves the symbol and resizes it whole; there is nothing
     * to drag a vertex to, because every point but the two drawn ones is derived and
     * dragging one of those alone would break the symmetry the symbol is built on.
     * (User's call, 2026-08-29.)
     */
    generateHandles(): Feature<MultiPoint> {
        return this.asMultiPointFeature([]);
    }

    /** The two letters, set just inside each arm's inner end. */
    generateLabels(base: Feature<LineString>, opts: SecurityOperationOptions): Feature<MultiPoint> {
        const f = this.frame(base);
        if (!f) return this.asMultiPointFeature([]);

        const inset = f.arm * (HALF_GAP_RATIO - LABEL_INSET_RATIO);
        return this.asMultiPointFeature([
            at(f.centre, f.inward + 180, inset, 0),
            at(f.centre, f.inward, inset, 0),
        ]);
    }
}
