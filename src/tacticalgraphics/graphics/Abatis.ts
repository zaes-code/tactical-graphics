import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {BaseGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';

/**
 * Apex height as a multiple of the chevron's base width.
 *
 * The old point-anchored build used 0.85 of a half-span, which is the same
 * proportion read the other way round; keeping it means the tooth is the shape it
 * always was, only now it no longer grows with the route.
 */
export const ABATIS_HEIGHT_RATIO = 0.588;

/**
 * Abatis — "an obstacle constructed by the felling and interlacing of trees across a
 * route" (FM 1-02.2 table 5-19).
 *
 * **A drawn route carrying one fixed-size tooth**, in the anti-tank ditches' mold.
 * The user draws the line the obstacle lies along, adding as many vertices as the
 * road needs, and the chevron sits at the leading end at a constant screen size.
 *
 * APP-06 Ed E (280100) states both halves of that:
 *
 * > This symbol requires at least two anchor points, points 1 and 2, to define the
 * > line. Additional points can be defined to extend the line.
 * >
 * > The first and last anchor points determine the length of the line. **The size of
 * > the tooth does not change.**
 *
 * FM 1-02.2 agrees in its plate, whose example lays four abatis of visibly different
 * lengths across one road with the same tooth on each.
 *
 * **This used to be point-anchored** with a fixed 6:1 route derived from one `size`,
 * so the tooth grew with the obstacle and the obstacle could not follow a road at
 * all. @see ai/app-6.md, "F1"
 *
 * **The route runs *into* the chevron and out the other side** rather than continuing
 * beneath it: drawing the base line straight through would close the chevron into a
 * triangle, which is a different symbol. So the emitted path is the two chevron legs
 * followed by whatever is left of the drawn route.
 *
 * `size` is the chevron's base width **in meters**, and is a decoration size rather
 * than a reach — the renderer derives it from the zoom through `decorationMeters`, so
 * the tooth holds its size on screen. `mirrored` puts the chevron on the other side of
 * the route.
 */
export class Abatis extends TacticalGraphicsBase<BaseGraphicOptions> {
    name: string = TacticalGraphicName.Abatis;
    type: string = 'LineString';

    /**
     * The chevron's three points plus the rest of the route, as one open path.
     *
     * Returns `null` when the drawn line is too short to carry a tooth, so callers can
     * fall back to the bare route instead of emitting a degenerate zigzag.
     */
    private path(base: Feature<LineString>, opts?: BaseGraphicOptions): Position[] | null {
        const coords = base.geometry.coordinates;
        if (coords.length < 2) return null;

        const line = turf.lineString(coords);
        const total = turf.length(line, {units: 'meters'});
        if (!isFinite(total) || total <= 0) return null;

        // Never let the tooth eat more than half the obstacle: on a route drawn shorter
        // than the tooth is wide there is no "rest of the route" left to run away, and
        // the symbol reads as a bare triangle.
        const span = Math.min(Math.max(opts?.size ?? 0, 0), total / 2);
        if (span <= 0) return null;

        const height = span * ABATIS_HEIGHT_RATIO;
        const start = coords[0];
        const mid = turf.along(line, span / 2, {units: 'meters'}).geometry.coordinates;
        const foot = turf.along(line, span, {units: 'meters'}).geometry.coordinates;

        const heading = turf.bearing(turf.point(start), turf.point(foot));
        const apex = turf.destination(turf.point(mid), height, heading + (opts?.mirrored ? 90 : -90), {
            units: 'meters',
        }).geometry.coordinates as Position;

        // `lineSliceAlong` keeps the intermediate vertices, which is what lets the
        // obstacle bend with the road rather than straightening to its endpoints.
        const tail = turf.lineSliceAlong(line, span, total, {units: 'meters'}).geometry.coordinates;
        return [start, apex, ...tail];
    }

    generateGraphics(base: Feature<LineString>, opts?: BaseGraphicOptions): Feature<MultiLineString> {
        const coords = base.geometry.coordinates;
        // Mid-draw the interaction hands us a one-point sketch on every pointer move;
        // a one-point LineString is not a line.
        if (coords.length < 2) return this.asMultiLineStringFeature([]);
        return this.asMultiLineStringFeature([this.path(base, opts) ?? coords]);
    }

    /**
     * `[start, end, apex]` — the two ends of the drawn line, then the chevron's apex.
     *
     * The apex is third and exists to be *seen*: flipping the chevron means dragging a
     * handle across the route, and without a dot on the tip nothing tells a user the
     * chevron is the thing that moves. `handleContract` names index 2 the mirror handle
     * for exactly this. When the line is too short to carry a tooth the apex is simply
     * absent, and the contract's trailing role goes unfilled rather than pointing at a
     * place the symbol does not occupy.
     */
    generateHandles(base: Feature<LineString>, opts?: BaseGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        if (coords.length < 2) return this.asMultiPointFeature(coords);

        const ends = [coords[0], coords[coords.length - 1]];
        const path = this.path(base, opts);
        return this.asMultiPointFeature(path ? [...ends, path[1]] : ends);
    }

    /** No amplifiers: affiliation and nothing else. */
    generateLabels(): Feature<MultiPoint> {
        return this.asMultiPointFeature([]);
    }
}
