import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {PointGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, MultiLineString, MultiPoint, Point, Position} from 'geojson';
import * as turf from '../core/turf';

/** Overall length of the route, as a multiple of the chevron's height. */
const LENGTH_RATIO = 6;

/** Half the chevron's span along the route, as a multiple of its height. */
const HALF_SPAN_RATIO = 0.85;

/**
 * Abatis — "an obstacle constructed by the felling and interlacing of trees across a
 * route" (FM 1-02.2).
 *
 * **One open polyline, not a line with a triangle on it.** The route runs *into* the
 * chevron and out the other side rather than continuing beneath it: drawing the base line
 * straight through would close the chevron into a triangle, which is a different symbol.
 * The plate starts with the chevron, so it sits at the leading end with the route running
 * away from it.
 *
 * Point-anchored: dropped whole and resized whole. `radius` is the chevron's height and
 * everything else is a ratio of it, so one number scales the symbol. `mirrored` puts the
 * chevron below the route instead of above; both are built in the graphic's own rotated
 * frame, so they survive rotation.
 */
export class Abatis extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.Abatis;
    type: string = 'Point';

    /** Local (x along the route, y across it) → geographic, honouring rotation. */
    private local(center: Position, rotation: number, x: number, y: number): Position {
        const dist = Math.hypot(x, y);
        if (dist === 0) return [center[0], center[1]];
        const planarDeg = (Math.atan2(y, x) * 180) / Math.PI;
        let bearing = 90 - (planarDeg + rotation);
        bearing = ((bearing % 360) + 360) % 360;
        return turf.destination(turf.point(center), dist, bearing, {units: 'meters'}).geometry.coordinates as Position;
    }

    /** The whole symbol as one open path, left to right in its local frame. */
    private path(base: Feature<Point>, opts: PointGraphicOptions): Position[] {
        const center = base.geometry.coordinates;
        const {rotation} = opts;
        // `size` is the radius the controller drags — centre to the edge handle, which is
        // the trailing end of the route. So the route spans 2 x size, and the chevron's
        // height follows from that rather than the other way round.
        const height = Math.max(opts.size, 1) / (LENGTH_RATIO / 2);
        const halfSpan = height * HALF_SPAN_RATIO;
        const length = height * LENGTH_RATIO;
        const m = opts.mirrored ? -1 : 1;
        const at = (x: number, y: number) => this.local(center, rotation, x, y);

        const startX = -length / 2;
        return [
            at(startX, 0),                       // foot of the leading leg
            at(startX + halfSpan, m * height),   // apex
            at(startX + halfSpan * 2, 0),        // foot of the trailing leg
            at(length / 2, 0),                   // the route running away
        ];
    }

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiLineString> {
        return this.asMultiLineStringFeature([this.path(base, opts)]);
    }

    /**
     * `[edge, centre, apex]` — the MissionTask convention first: `handles[0]` drives rotate
     * and resize, `handles[1]` drives translate. The edge handle is the trailing end of the
     * route, the furthest point from the centre and so the steadiest thing to scale
     * against.
     *
     * The apex is third and exists to be *seen*. Flipping the chevron means dragging a
     * handle across the route, and without a dot on the tip there is nothing telling a
     * user that the chevron is the thing that moves — the gesture is discoverable only by
     * accident. It sits furthest off the axis, so it is also the easiest handle to carry
     * across and back.
     */
    generateHandles(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiPoint> {
        const path = this.path(base, opts);
        return this.asMultiPointFeature([path[path.length - 1], base.geometry.coordinates, path[1]]);
    }

    generateLabels(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([]);
    }
}
