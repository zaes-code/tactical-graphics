import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {MovementGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';

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

/** How far each bar leans off the drawn axis. */
const BAR_LEAN_DEG = 45;

/**
 * Roadblock complete (executed) - FM 1-02.2 table 5-19, APP-06 271204.
 *
 * Two overlapping crosses: four bars, a leaning pair each way, displaced along the drawn
 * axis so the crosses sit side by side and share their middle.
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
 * So points 1 and 2 give the axis the crosses are laid along - its bearing is the symbol's
 * orientation and its length is a bar's span - and point 3, arriving as the half-width,
 * sets how far the two crosses are pushed apart. A roadblock can now be laid across a road
 * running any way at all, which is the same thing the readiness states gained when they
 * stopped being point-anchored. @see ExplosivesReadiness, ai/app-6.md "F2"
 *
 * **Which of points 1, 2 and 3 is which is an interpretation**, because the row states no
 * rule of its own and the inherited one was written for a two-rail symbol rather than a
 * four-bar one. This reading is the one that keeps the plate's picture and matches the
 * family's contract; it is recorded here rather than left to be re-derived.
 *
 * Bars come out west-to-east within each lean, which is the order `BAR_SYMBOL_DASHES`
 * indexes. Nothing dashes here, but the ordering is what makes that table meaningful.
 */
export class RoadblockComplete extends TacticalGraphicsBase<MovementGraphicOptions> {
    name: string = TacticalGraphicName.RoadblockCompleteExecuted;
    type: string = 'LineString';

    /**
     * The four bars: both leaning one way first, then both the other.
     *
     * Displaced along the drawn axis rather than perpendicular to each bar's own bearing.
     * A perpendicular offset slides the second bar *along* its lean, so the two crosses
     * would sit diagonally apart instead of level - the same trap the readiness states hit.
     */
    private bars(base: Feature<LineString>, opts?: MovementGraphicOptions): Position[][] {
        const coords = base.geometry.coordinates;
        const first = coords[0];
        const last = coords[coords.length - 1];

        const centre = turf.point([(first[0] + last[0]) / 2, (first[1] + last[1]) / 2]);
        const span = Math.max(turf.distance(turf.point(first), turf.point(last), {units: 'meters'}), 1);
        const half = span / 2;
        const axis = turf.bearing(turf.point(first), turf.point(last));

        // `radius` is the half-width the movement family fills from the public `width`,
        // and here that is the gap from the middle out to one cross. Absent, the plate's
        // own proportion stands in.
        const gap = Math.max(opts?.radius ?? (span * SEPARATION_RATIO) / 2, 1);

        const bar = (alongAxis: number, lean: number): Position[] => {
            const anchor = turf.destination(centre, gap, alongAxis, {units: 'meters'});
            return [
                turf.destination(anchor, half, axis + lean + 180, {units: 'meters'}).geometry.coordinates as Position,
                turf.destination(anchor, half, axis + lean, {units: 'meters'}).geometry.coordinates as Position,
            ];
        };
        // Behind the middle, then ahead of it, for each lean.
        return [
            bar(axis + 180, BAR_LEAN_DEG), bar(axis, BAR_LEAN_DEG),
            bar(axis + 180, -BAR_LEAN_DEG), bar(axis, -BAR_LEAN_DEG),
        ];
    }

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        // Mid-draw the interaction hands us a one-point sketch on every pointer move.
        if (base.geometry.coordinates.length < 2) return this.asMultiLineStringFeature([]);
        return this.asMultiLineStringFeature(this.bars(base, opts));
    }

    /**
     * `[start, end, width]` - the movement family's contract: the two vertices the user
     * drew, plus one handle that sets how far apart the crosses sit. The width handle rides
     * the outer end of the first bar, so the thing being dragged is on the symbol rather
     * than out in space. @see ExplosivesReadiness.generateHandles
     */
    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        if (coords.length < 2) return this.asMultiPointFeature(coords);
        const firstBar = this.bars(base, opts)[0];
        return this.asMultiPointFeature([coords[0], coords[coords.length - 1], firstBar[0]]);
    }

    /** No amplifiers: affiliation and nothing else. */
    generateLabels(): Feature<MultiPoint> {
        return this.asMultiPointFeature([]);
    }
}
