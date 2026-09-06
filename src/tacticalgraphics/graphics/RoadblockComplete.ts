/**
 * # Switched off — see `ai/excluded-graphics.md`
 *
 * APP-06 271204 is excluded as of 2026-09-05. Its enum member is commented out, so this class
 * is registered by nothing and its `name` is a string literal standing in for the member.
 * The code is kept whole rather than deleted because the exclusion is expected to be
 * temporary: the plate's Draw Rules cell is empty and the Template alone did not settle how
 * three points lay four strokes out. What *is* established, and the proof that constrains
 * every candidate reading, is written up in that file.
 */
import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {MovementGraphicOptions} from '../core/type';
import {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';
import {halfWidthFromSide, sidePoint} from './ExplosivesReadiness';

/**
 * Separation between the two crosses, as a fraction of a bar's span, when nothing is typed.
 *
 * Set from the plate's proportions rather than picked: at 45 degrees the symbol is
 * `span * cos45 + 2 * gap` wide and `span * sin45` tall, so its aspect ratio is
 * `1 + SEPARATION_RATIO / cos45`. The plate reads about 1.28 wide to tall, which puts the
 * ratio at 0.2 - the readiness states' 0.42 pushed the crosses far enough apart to read as
 * two separate X's rather than one overlapping symbol.
 *
 * It is now a **default** rather than a lock: point 3 sets the separation, and this is what
 * the symbol opens at before anyone drags it.
 */
const SEPARATION_RATIO = 0.2;

/**
 * Roadblock complete (executed) - FM 1-02.2 table 5-19, APP-06 271204.
 *
 * One cross with both of its arms doubled: four bars, a leaning pair each way, the pair
 * displaced **across** the drawn centreline so the two arms cross at the middle.
 *
 * **Drawn from a centreline and a width, like the three readiness states it sits with.**
 * It was dropped on one point at a fixed 45-degree bearing until 2026-09-05, on the reading
 * that no rule in APP-06 described a centreline for it. The plate settles that the other
 * way: 271204's Template letters **PT 1, PT 2 and PT 3** against the crosses, and its own
 * Draw Rules cell is *empty*, so the row inherits 271201's - the rule that governs the whole
 * block:
 *
 * > This symbol requires three anchor points. Points 1 and 2 define the endpoints of the
 * > symbol and point 3 defines the location of one side of the symbol.
 * >
 * > Points 1 and 2 determine the **centreline** of the symbol and point 3 determines its
 * > **width**.
 *
 * So points 1 and 2 give the centreline - its bearing is the symbol's orientation and its
 * length is a bar's span - and point 3, **a placed vertex since 2026-09-05 rather than a
 * filed width**, sets how far apart the two crosses sit across it. A roadblock can now be
 * laid across a road running any way at all, which is the same thing the readiness states
 * gained when they stopped being point-anchored. @see ExplosivesReadiness, ai/app-6.md "F2"
 *
 * **One reading is still an interpretation**, and it is worth naming: the template draws
 * points 1 and 2 as the two ends of a *stroke*, where the inherited rule calls them the
 * centreline. This generator follows the rule, exactly as the three readiness states do -
 * the bars straddle the line rather than lying on it - so that the whole block is one
 * construction. What the template settles, and what was wrong before, is the *direction*
 * point 3 displaces in: across the centreline, not along it.
 */
export class RoadblockComplete extends TacticalGraphicsBase<MovementGraphicOptions> {
    // Excluded — see ai/excluded-graphics.md. The class is kept whole so the exclusion is a
    // switch rather than a deletion; the literal stands in for the commented enum member.
    name: string = 'RoadblockCompleteExecuted';
    type: string = 'LineString';

    /**
     * The four bars: both leaning one way first, then both the other.
     *
     * **Two crosses displaced ACROSS the drawn axis**, which is what makes the plate's
     * picture: one X with each of its arms doubled, rather than two X's standing side by
     * side. They were displaced *along* the axis until 2026-09-05, which drew the second
     * reading. (User's report: "the only diff is that this one needs a mirrored copy
     * across".)
     *
     * The template settles it. Measured off 271204's own Template raster, the four strokes
     * are two parallel pairs, and the anchor letters land on:
     *
     * | Letter | Where it sits on the template |
     * |---|---|
     * | PT 1 | one end of a single stroke |
     * | PT 2 | the other end of that same stroke |
     * | PT 3 | the **crossing point of the other two strokes** |
     *
     * and the crossing of the remaining pair falls on the midpoint of PT 1 - PT 2, to within
     * a stroke width. So the symbol is a cross centred on the centreline's midpoint plus a
     * second cross centred at point 3, and point 3 is across the centreline rather than
     * along it. That is exactly the readiness states' construction with a cross in place of
     * each rail, which is why it can share their reader. @see halfWidthFromSide
     *
     * The offset is taken from the axis rather than from each bar's own bearing: a
     * perpendicular to the *bar* slides it along its own lean, so the crosses would sit
     * diagonally apart instead of level - the trap the readiness states hit.
     */
    /**
     * The four strokes: **the two diagonals of the box points 1, 2 and 3 describe, doubled.**
     *
     * This is the explosives' own construction with one addition. Those take points 1 and 2
     * as the ends of a centreline and point 3 as the half-width, and draw a rail either side;
     * 271204 takes the same box and draws its **diagonals** instead, then mirrors the pair —
     * which is the doubled X the plate shows. (User's call, 2026-09-05.)
     *
     * **Why the ends matter.** The strokes used to be laid out from the centre at a fixed
     * lean, half a span long each way, so the figure's extent had nothing to do with where
     * points 1 and 2 were: the two grips sat outside the drawing and the third floated beside
     * it. Building the strokes off the box corners puts every handle back on the symbol,
     * which is the property the explosives already had and the one a user reported missing.
     *
     * @see ExplosivesReadiness.rails — the same box, the sides instead of the diagonals
     */
    private bars(base: Feature<LineString>, opts?: MovementGraphicOptions): Position[][] {
        const coords = base.geometry.coordinates;
        const [first, last] = [coords[0], coords[1]];

        const span = Math.max(turf.distance(turf.point(first), turf.point(last), {units: 'meters'}), 1);
        const axis = turf.bearing(turf.point(first), turf.point(last));

        /*
         * **The half-width comes off point 3**, exactly as it does for the readiness states —
         * *"points 1 and 2 determine the centreline of the symbol and point 3 determines its
         * width"*. A graphic saved before point 3 became a placed vertex has two points and a
         * filed width and still reads; with neither, the plate's own proportion stands in.
         * @see halfWidthFromSide
         */
        const half = coords.length >= 3 || opts?.radius
            ? Math.max(halfWidthFromSide(coords, opts), 1)
            : Math.max((span * SEPARATION_RATIO) / 2, 1);

        // The box: each end of the centreline pushed out to either side of it.
        const corner = (end: Position, side: number): Position =>
            turf.destination(turf.point(end), half, axis + side * 90, {units: 'meters'}).geometry.coordinates as Position;
        const nearLeft = corner(first, -1);
        const nearRight = corner(first, +1);
        const farLeft = corner(last, -1);
        const farRight = corner(last, +1);

        /*
         * Each diagonal, and its mirror image in the centreline — which is the same pair of
         * corners taken the other way round, so the two cross at the box's middle and the
         * figure is symmetric about the line the operator drew.
         *
         * Near-left first, which is the order `BAR_SYMBOL_DASHES` indexes. Nothing dashes
         * here, but the family's ordering is what makes that table meaningful.
         */
        /*
         * **Twice, displaced along the axis** — the plate's X has each arm doubled, which
         * reads as two crossings rather than one. It cannot be done inside a single box: a
         * stroke parallel to a diagonal keeps both ends on the end edges only when it *is*
         * that diagonal, so the doubling has to move the whole X. Displaced along the drawn
         * axis and symmetrically about the middle, so the figure stays centred on the line
         * the operator drew and points 1 and 2 stay its mid-edge grips. (User's call,
         * 2026-09-05.)
         */
        const shift = (stroke: Position[], side: number): Position[] =>
            stroke.map(
                point =>
                    turf.destination(turf.point(point), half / 2, axis + (side < 0 ? 180 : 0), {units: 'meters'})
                        .geometry.coordinates as Position,
            );
        const down = [nearLeft, farRight];
        const up = [nearRight, farLeft];
        return [shift(down, -1), shift(down, +1), shift(up, -1), shift(up, +1)];
    }

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        // Mid-draw the interaction hands us a one-point sketch on every pointer move.
        if (base.geometry.coordinates.length < 2) return this.asMultiLineStringFeature([]);
        return this.asMultiLineStringFeature(this.bars(base, opts));
    }

    /** `[start, end, side]` — all three placed. @see ExplosivesReadiness.generateHandles */
    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        if (coords.length < 2) return this.asMultiPointFeature(coords);
        return this.asMultiPointFeature([coords[0], coords[1], sidePoint(coords, opts)]);
    }

    /** No amplifiers: affiliation and nothing else. */
    generateLabels(): Feature<MultiPoint> {
        return this.asMultiPointFeature([]);
    }
}
