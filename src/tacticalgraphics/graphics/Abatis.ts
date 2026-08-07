import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {BaseGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '@turf/turf';

/**
 * Where along the drawn line the chevron sits, as a fraction from the start.
 * FM 1-02.2 draws it near the leading end rather than centred.
 */
const APEX_FRACTION = 0.22;

/** Chevron half-width along the line, as a multiple of its height. */
const HALF_WIDTH_RATIO = 0.9;

/**
 * Abatis — "an obstacle constructed by the felling and interlacing of trees across a
 * route" (FM 1-02.2). Drawn as the route with a single chevron rising from it.
 *
 * The chevron is the whole symbol, so it is what `decorationSize` scales and what
 * `mirrored` flips: it points to one side of the route or the other, never along it.
 * Everything is built from the line's own bearing, so both survive rotation.
 */
export class Abatis extends TacticalGraphicsBase<BaseGraphicOptions> {
    name: string = TacticalGraphicName.Abatis;
    type: string = 'LineString';

    /** Apex of the chevron, and the two feet where it meets the route. */
    private chevron(base: Feature<LineString>, opts?: BaseGraphicOptions): Position[] {
        const coords = base.geometry.coordinates;
        const start = coords[0];
        const end = coords[coords.length - 1];
        const height = Math.max(opts?.size ?? 1, 1);
        const halfWidth = height * HALF_WIDTH_RATIO;

        const bearing = turf.bearing(turf.point(start), turf.point(end));
        const length = turf.distance(turf.point(start), turf.point(end), {units: 'meters'});
        const apexAlong = length * APEX_FRACTION;

        const on = (along: number): Position =>
            turf.destination(turf.point(start), Math.max(along, 0), bearing, {units: 'meters'})
                .geometry.coordinates as Position;

        // Perpendicular, relative to the bearing — never a compass direction, so the
        // chevron keeps its side when the graphic is rotated.
        const side = opts?.mirrored ? 90 : -90;
        const footBack = on(apexAlong - halfWidth);
        const footFwd = on(apexAlong + halfWidth);
        const apex = turf.destination(turf.point(on(apexAlong)), height, bearing + side, {units: 'meters'})
            .geometry.coordinates as Position;

        return [footBack, apex, footFwd];
    }

    generateGraphics(base: Feature<LineString>, opts?: BaseGraphicOptions): Feature<MultiLineString> {
        const coords = base.geometry.coordinates;
        if (coords.length < 2) return this.asMultiLineStringFeature([coords]);
        return this.asMultiLineStringFeature([coords, this.chevron(base, opts)]);
    }

    /**
     * `[apex, ...vertices]` — apex first.
     *
     * The retrograde holder publishes `handles[0]` as its offset handle, which is what
     * gives this graphic its resize and, through the sign of that same drag, its mirror.
     * Putting the apex there means the handle is the thing the user is actually sizing.
     */
    generateHandles(base: Feature<LineString>, opts?: BaseGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        if (coords.length < 2) return this.asMultiPointFeature(coords);
        return this.asMultiPointFeature([this.chevron(base, opts)[1], ...coords]);
    }

    generateLabels(base: Feature<LineString>, opts?: BaseGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([]);
    }
}
