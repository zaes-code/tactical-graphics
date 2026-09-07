import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {MovementGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';

/**
 * Horizontal distance between the two crosses, as a fraction of a bar's span.
 *
 * Set from the plate's proportions rather than picked: at 45 degrees the symbol is
 * `span * cos45 + 2 * gap` wide and `span * sin45` tall, so its aspect ratio is
 * `1 + SEPARATION_RATIO / cos45`. The plate reads about 1.28 wide to tall, which puts the
 * ratio at 0.2 — the readiness states' 0.42 pushed the crosses far enough apart to read as
 * two separate X's rather than one overlapping symbol.
 */
export const ROADBLOCK_SEPARATION_RATIO = 0.2;

/** The bars lean at 45 degrees, and the symbol does not rotate. */
const BAR_BEARING = 45;

/**
 * The three anchor points 271204 stores, from the centre and span of a dropped symbol.
 *
 * **Points 1 and 2 are not on a stroke.** They are the two extremes of the symbol's own
 * 45-degree axis — the line running *between* the two parallel leaning bars — so their
 * midpoint is the centre of the whole figure and the distance between them is the span.
 * Point 3 is one of the two crossings, which sits off that axis by the half-separation.
 * (User's call, 2026-09-07, against a drawing of the three: *"point 1 and 2 are not on the
 * line but in between the 2"*.)
 *
 * That is what makes three points enough to rebuild the picture: the midpoint gives the
 * centre, the separation gives the span, and the offset to point 3 gives the gap. It also
 * matches what the plate reading established before the symbol was switched off — *PT 3 at
 * a crossing 48.5 px off the PT1–PT2 midpoint on the 460×460 raster* — since that offset is
 * exactly the half-separation. @see ai/excluded-graphics.md
 */
export function roadblockAnchors(center: Position, span: number): Position[] {
    const half = span / 2;
    const gap = (span * ROADBLOCK_SEPARATION_RATIO) / 2;
    const at = (metres: number, bearing: number): Position =>
        turf.destination(turf.point(center), metres, bearing, {units: 'meters'}).geometry.coordinates as Position;
    // 270 is due west: the crossings sit level with each other, as the bars require.
    return [at(half, BAR_BEARING + 180), at(half, BAR_BEARING), at(gap, 270)];
}

/**
 * The centre and span a stored base describes — the inverse of {@link roadblockAnchors}.
 *
 * Exported because `drawnAnchorFrame` is how both engines read a stored base back into the
 * frame a gesture acts on, and a drop that cannot be read back cannot be resized.
 */
export function roadblockFrame(coords: Position[] | undefined): {center: Position; size: number; rotation: number} | undefined {
    const frame = coords && frameOf(coords);
    // Never rotates: an X turned is a different mark. @see BAR_BEARING
    return frame && {center: frame.center, size: frame.span, rotation: 0};
}

/** The centre, span and half-separation a stored base describes. @see roadblockAnchors */
function frameOf(coords: Position[]): {center: Position; span: number; gap: number} | undefined {
    if (coords.length < 3) return undefined;
    const [one, two, three] = coords;
    const center = turf.midpoint(turf.point(one), turf.point(two)).geometry.coordinates as Position;
    const span = turf.distance(turf.point(one), turf.point(two), {units: 'meters'});
    if (!(span > 0)) return undefined;
    return {center, span, gap: turf.distance(turf.point(center), turf.point(three), {units: 'meters'})};
}

/**
 * Roadblock complete (executed) — FM 1-02.2 table 5-19, APP-06 271204.
 *
 * Two overlapping crosses: four bars, a leaning pair each way, displaced east and west so
 * the crosses sit side by side and share their middle. It is the explosives readiness pair
 * plus its mirror, drawn all solid, and it follows the same rules — dropped whole on one
 * click at a default size, resizable afterwards, never rotated, affiliation only.
 *
 * **The picture is 3.4.0's exactly; what changed is what gets stored.** It used to file the
 * dropped point alone and derive everything from a `size` amplifier. It stores the three
 * anchor points the standard names now, so a file carries them and the operator can see
 * where they are — while none of them answers a drag, because 271204's own construction is
 * still unsettled and a grip on each would promise a shape the reading does not support.
 * @see roadblockAnchors, handlesAreInert, ai/excluded-graphics.md
 *
 * Bars come out west-to-east within each lean, which is the order `BAR_SYMBOL_DASHES`
 * indexes. Nothing dashes here, but the ordering is what makes that table meaningful.
 */
export class RoadblockComplete extends TacticalGraphicsBase<MovementGraphicOptions> {
    name: string = TacticalGraphicName.RoadblockCompleteExecuted;
    type: string = 'LineString';

    /**
     * The four bars: both west-leaning first, then both east-leaning.
     *
     * Displaced east and west rather than perpendicular to each bar's own bearing. A
     * perpendicular offset slides the second bar *along* its lean, so the two crosses would
     * sit diagonally apart instead of level — the same trap the readiness states hit.
     */
    private bars(base: Feature<LineString>, opts?: MovementGraphicOptions): Position[][] {
        const frame = frameOf(base.geometry.coordinates as Position[]);
        // A base saved before the anchor points, or a one-point sketch mid-drop, still has a
        // centre and a size to draw from.
        const coords = base.geometry.coordinates as Position[];
        const center = frame?.center ?? coords[0];
        const span = frame?.span ?? Math.max(opts?.radius ?? opts?.size ?? 1, 1);
        const gap = frame?.gap ?? (span * ROADBLOCK_SEPARATION_RATIO) / 2;
        const half = span / 2;

        const bar = (bearingToAnchor: number, lean: number): Position[] => {
            const anchor = turf.destination(turf.point(center), gap, bearingToAnchor, {units: 'meters'});
            return [
                turf.destination(anchor, half, lean + 180, {units: 'meters'}).geometry.coordinates as Position,
                turf.destination(anchor, half, lean, {units: 'meters'}).geometry.coordinates as Position,
            ];
        };
        return [bar(270, BAR_BEARING), bar(90, BAR_BEARING), bar(270, -BAR_BEARING), bar(90, -BAR_BEARING)];
    }

    generateGraphics(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiLineString> {
        if (base.geometry.coordinates.length < 1) return this.asMultiLineStringFeature([]);
        return this.asMultiLineStringFeature(this.bars(base, opts));
    }

    /**
     * The three stored points, every one of them inert.
     *
     * Published so the operator can see the symbol's anchors; none answers a drag, because
     * the whole graphic moves, turns and scales instead. @see handlesAreInert
     */
    generateHandles(base: Feature<LineString>, opts?: MovementGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates as Position[];
        if (coords.length >= 3) return this.asMultiPointFeature(coords.slice(0, 3));
        const frame = frameOf(coords);
        const span = frame?.span ?? Math.max(opts?.radius ?? opts?.size ?? 1, 1);
        return this.asMultiPointFeature(roadblockAnchors(coords[0] ?? [0, 0], span));
    }

    /** No amplifiers: affiliation and nothing else. */
    generateLabels(): Feature<MultiPoint> {
        return this.asMultiPointFeature([]);
    }
}
