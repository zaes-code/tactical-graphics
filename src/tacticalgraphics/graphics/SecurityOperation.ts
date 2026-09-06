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

/**
 * The three graphics drawn this way. @see securityOperationBaseCentre
 *
 * Exported because the *gestures* need to know them — `rotationAnchor` turns and scales
 * these about their middle rather than an end — and a second list of the same three names
 * somewhere else is how a rule ends up true of two of them.
 */
export const SECURITY_OPERATION_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.Cover,
    TacticalGraphicName.Guard,
    TacticalGraphicName.Screen,
];

/**
 * The four anchor points APP-06 342201 names, from however many the base carries.
 *
 * > Anchor Points. This symbol requires four points. Point 1 and Point 2 define the ends of
 * > one arrow and Point 3 and Point 4 define the ends of the other arrow. Point 1 and Point
 * > 4 define the ends of their respective arrowheads.
 * >
 * > Size/Shape. Points 1 and 2 and Points 3 and 4 determine the length of the arrows. **The
 * > length and orientation of the arrows can vary independently.**
 *
 * Four placed points as of 2026-09-06. The operator drew *one* arm before that and the other
 * was mirrored from it, so the two always agreed in length and lay on one axis — which the
 * Size/Shape cell explicitly does not ask for. A screen whose two arms face different
 * distances along different bearings is the ordinary case, and it could not be drawn.
 * (User's call: "the draw rules say that line 1,2 length and line 3,4 can vary in length and
 * direction […] we need to let them pick the 4 points".)
 *
 * **A shorter base is the old form, and upgrades in place.** Two points are point 1 and
 * point 2; the other arm is laid out as the mirror this used to derive, so every saved
 * graphic comes back the shape it was saved as and gains two grips. The derived point 3 sits
 * `2 x HALF_GAP_RATIO` of an arm past point 2 — which is exactly what puts the old centre,
 * `HALF_GAP_RATIO` beyond point 2, midway between points 2 and 3 where the plate wants it.
 * So the upgrade moves nothing.
 */
export function securityOperationAnchors(coords: readonly Position[] | undefined): Position[] | undefined {
    if (!coords || coords.length < 2) return undefined;
    if (coords.length >= 4) return coords.slice(0, 4) as Position[];

    const tip = coords[0];
    const inner = coords[1];
    const arm = turf.distance(turf.point(tip), turf.point(inner), {units: 'meters'});
    if (!(arm > 0)) return undefined;

    /*
     * **Three points is the operator placing point 3, so point 3 is where they put it.**
     *
     * Only point 4 is still missing, and it previews as an arm of the same length carrying
     * on outward — the direction point 2 → point 3 already states, which is the gap's own
     * axis. Placing point 3 on that axis therefore previews exactly the symmetric form, and
     * moving it off previews the oblique one the operator is actually drawing.
     *
     * Without this the third click read through the two-point branch below, which takes the
     * *last* point as arm 1's inner end — so the cursor dragged point 2 around and point 3
     * never appeared until the click landed. (User's report, 2026-09-06: "click 3 is still
     * dragging on point 2 location [...] after click 2 the active handle should go to point
     * 3 location".)
     */
    if (coords.length === 3) {
        const otherInner = coords[2];
        const outward = turf.bearing(turf.point(inner), turf.point(otherInner));
        if (!Number.isFinite(outward)) return undefined;
        return [tip, inner, otherInner, at(otherInner, outward, arm, 0)];
    }

    /*
     * **Two points is one arm, and the other is its mirror** — the shape this graphic was
     * until 2026-09-06, so it is what an old save holds and what the second click previews.
     */
    const inward = turf.bearing(turf.point(tip), turf.point(inner));
    const otherInner = at(inner, inward, arm * 2 * HALF_GAP_RATIO, 0);
    return [tip, inner, otherInner, at(otherInner, inward, arm, 0)];
}

/**
 * The middle of a cover, guard or screen — **midway between points 2 and 3.**
 *
 * > Orientation. […] The tactical symbol indicator is centred between point 2 and point 3.
 *
 * The plate says it outright, and it is the one construction that always has an answer. The
 * two arms' axes *extended* meet at the same place whenever the arms are symmetric, which is
 * the only shape this graphic could take until 2026-09-06 — but with the arms independent
 * that intersection is undefined for parallel arms and runs away to infinity as they
 * approach parallel, which is a centre that leaves the graphic. The midpoint does not.
 *
 * Stated here, beside the ratio the fallback uses, because three separate things need it and
 * each was a chance to restate the arithmetic: the generator laying the arms out,
 * `securityPaints` placing the symbol, and the rotate and resize gestures. The paint layer
 * reads its own from the *rendered* inner ends, which is the same point arrived at from the
 * other side — this one answers from the base, which is all a gesture has.
 *
 * `undefined` for a base too short to describe an arm, so a caller falls back rather than
 * pivoting on a guess.
 */
export function securityOperationBaseCentre(coords: readonly Position[] | undefined): Position | undefined {
    const anchors = securityOperationAnchors(coords);
    if (!anchors) return undefined;
    return turf.midpoint(turf.point(anchors[1]), turf.point(anchors[2])).geometry.coordinates as Position;
}

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
     * The symbol's frame: **two arms that are read, not one arm and its mirror.**
     *
     * Each arm carries its own inner end, its own outward bearing and its own length, which
     * is what "the length and orientation of the arrows can vary independently" asks for.
     * A base with one point, or an arm of zero length, has no axis and produces nothing
     * rather than a degenerate symbol.
     *
     * **Neither arm's length comes from `opts.size`.** A resize on a fixed-vertex line
     * scales the *base*, so the drawn arms already carry the new lengths and reading a
     * second number would fight them. `LineGraphicBase` passes its decoration scalar as
     * `size`, which for these is a few hundred metres — taken as the half-extent it drew the
     * whole symbol as a speck. @see securityOperationHalfExtent for the number that
     * describes the size.
     */
    private frame(base: Feature<LineString>) {
        const anchors = securityOperationAnchors(base.geometry?.coordinates);
        if (!anchors) return undefined;
        const [tip, inner, otherInner, otherTip] = anchors;

        const arm = turf.distance(turf.point(tip), turf.point(inner), {units: 'meters'});
        const otherArm = turf.distance(turf.point(otherInner), turf.point(otherTip), {units: 'meters'});
        if (!(arm > 0) || !(otherArm > 0)) return undefined;

        // Each arm's *outward* bearing: from its own inner end toward its own arrowhead.
        const outward = turf.bearing(turf.point(inner), turf.point(tip));
        const otherOutward = turf.bearing(turf.point(otherInner), turf.point(otherTip));
        // Called through the shared statement so the drawing and the gestures cannot
        // disagree about where the middle is. @see securityOperationBaseCentre
        const centre = securityOperationBaseCentre(anchors) ?? inner;
        return {tip, inner, otherInner, otherTip, arm, otherArm, outward, otherOutward, centre};
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

        // Each arm runs outward from its own inner end toward its own arrowhead. Those are
        // points 2 and 3 as placed — no longer a gap measured either side of the centre,
        // since the two arms need not be the same length or lie on one axis.
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
            ...this.arm(f.inner, f.outward, f.arm, false),
            ...this.arm(f.otherInner, f.otherOutward, f.otherArm, true),
        ]);
    }

    /**
     * **A grip on each of the four anchor points**, which is what makes the arms independent.
     *
     * It published none until 2026-09-06: the second arm was mirrored from the first, so
     * dragging any one point alone would have broken the symmetry the symbol was built on,
     * and the operator moved and resized it whole instead. 342201 asks for the opposite —
     * *"the length and orientation of the arrows can vary independently"* — so each end of
     * each arrow is placed and each is grabbable. @see securityOperationAnchors
     */
    generateHandles(base: Feature<LineString>): Feature<MultiPoint> {
        return this.asMultiPointFeature(securityOperationAnchors(base.geometry?.coordinates) ?? []);
    }

    /** The two letters, set just inside each arm's inner end. */
    generateLabels(base: Feature<LineString>, opts: SecurityOperationOptions): Feature<MultiPoint> {
        const f = this.frame(base);
        if (!f) return this.asMultiPointFeature([]);

        /*
         * **Measured from each arm's own inner end, inward toward the centre**, rather than
         * out from the centre along one shared axis. With the arms independent there is no
         * shared axis to measure along, and each letter belongs to the arm it labels — which
         * is what `LABEL_INSET_RATIO` already says.
         */
        const inset = (from: Position, arm: number) =>
            at(from, turf.bearing(turf.point(from), turf.point(f.centre)), arm * LABEL_INSET_RATIO, 0);
        return this.asMultiPointFeature([inset(f.inner, f.arm), inset(f.otherInner, f.otherArm)]);
    }
}
