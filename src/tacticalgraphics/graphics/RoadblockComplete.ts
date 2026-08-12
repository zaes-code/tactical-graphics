import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {PointGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, MultiLineString, MultiPoint, Point, Position} from 'geojson';
import * as turf from '../core/turf';

/**
 * Horizontal distance between the two crosses, as a fraction of a bar's span.
 *
 * Set from the plate's proportions rather than picked: at 45 degrees the symbol is
 * `span * cos45 + 2 * gap` wide and `span * sin45` tall, so its aspect ratio is
 * `1 + SEPARATION_RATIO / cos45`. The plate reads about 1.28 wide to tall, which puts the
 * ratio at 0.2 - the readiness states' 0.42 pushed the crosses far enough apart to read as
 * two separate X's rather than one overlapping symbol.
 */
const SEPARATION_RATIO = 0.2;

/** The bars lean at 45 degrees, and the symbol does not rotate. */
const BAR_BEARING = 45;

/**
 * Roadblock complete (executed) - FM 1-02.2 table 5-19.
 *
 * Two overlapping crosses: four bars, a leaning pair each way, displaced east and west so
 * the crosses sit side by side and share their middle. It is the explosives readiness pair
 * plus its mirror, drawn all solid, and it follows the same rules - dropped whole on one
 * click at a default size, resizable afterwards, never rotated, affiliation only.
 *
 * Bars come out west-to-east within each lean, which is the order `BAR_SYMBOL_DASHES`
 * indexes. Nothing dashes here, but the ordering is what makes that table meaningful.
 */
export class RoadblockComplete extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.RoadblockCompleteExecuted;
    type: string = 'Point';

    /**
     * The four bars: both west-leaning first, then both east-leaning.
     *
     * Displaced east and west rather than perpendicular to each bar's own bearing. A
     * perpendicular offset slides the second bar *along* its lean, so the two crosses would
     * sit diagonally apart instead of level - the same trap the readiness states hit.
     */
    private bars(base: Feature<Point>, opts: PointGraphicOptions): Position[][] {
        const centre = turf.point(base.geometry.coordinates);
        const span = Math.max(opts?.size ?? 1, 1);
        const half = span / 2;
        const gap = (span * SEPARATION_RATIO) / 2;

        // 270 = due west, 90 = due east: same latitude, so the crosses stay level.
        const bar = (bearingToAnchor: number, lean: number): Position[] => {
            const anchor = turf.destination(centre, gap, bearingToAnchor, {units: 'meters'});
            return [
                turf.destination(anchor, half, lean + 180, {units: 'meters'}).geometry.coordinates as Position,
                turf.destination(anchor, half, lean, {units: 'meters'}).geometry.coordinates as Position,
            ];
        };
        return [bar(270, BAR_BEARING), bar(90, BAR_BEARING), bar(270, -BAR_BEARING), bar(90, -BAR_BEARING)];
    }

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiLineString> {
        return this.asMultiLineStringFeature(this.bars(base, opts));
    }

    /**
     * `[edge, centre]` - edge first, as every point-dropped graphic must: `handles[0]` drives
     * resize, `handles[1]` drives translate. Rotation is off, so the edge handle only scales.
     */
    generateHandles(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([this.bars(base, opts)[0][0], base.geometry.coordinates]);
    }

    /** No amplifiers: affiliation and nothing else. */
    generateLabels(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([]);
    }
}
