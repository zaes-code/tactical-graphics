/**
 * # The airfield, and why it is a point
 *
 * APP-06 131900 is a **point symbol**: a runway crossed by a taxiway, dropped on one
 * anchor point, with `T` beside it.
 *
 * > Anchor Points. This symbol requires one anchor point. […] Size/Shape. Static.
 * > Orientation. The symbol is typically centred over the desired location.
 *
 * It was an *area* until 2026-08-17, which made it indistinguishable from
 * `AirfieldZone` (120400) — the same runway glyph fitted inside a drawn boundary. Two
 * graphics that render the same thing are one graphic with a spare name, and the standard
 * draws these two differently on purpose: the zone is a piece of ground with a boundary
 * the operator traces, the airfield is a place.
 *
 * **"Static" describes the anchor points, not the extent.** It says the symbol does not
 * change shape as its anchors move — and with a single anchor there is nothing it could
 * change in response to. It was read as "the size is not the operator's" until 2026-08-17,
 * which pinned the arms to a constant screen size in the paint layer; the symbol then stayed
 * the same size on screen at every zoom, so it marked a point on the *display* rather than an
 * extent on the ground. It is dropped at a sensible size and resized from the edge handle
 * like any other point-anchored graphic. @see airfieldPointPaint
 *
 * Rotation stays off. The row gives the symbol one orientation and the controller no-ops it.
 */

import {Feature, MultiLineString, MultiPoint, Point, Position} from 'geojson';
import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {PointGraphicOptions, TacticalGraphicName} from '../core/type';
import geometryService from '../core/GeometryService';
import {toRadians} from '../core/math';

/**
 * The two arms, measured off the plate: a runway across the symbol and a taxiway crossing
 * it at about a third of a right angle. Reach is a multiple of `size`; both cross at the
 * anchor point, which is what "centred over the desired location" means.
 */
const ARMS: readonly {angleDeg: number; reach: number}[] = [
    {angleDeg: 0, reach: 1},
    {angleDeg: 32, reach: 1.05},
];

export class Airfield extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string = TacticalGraphicName.Airfield;
    type: string = 'Point';

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiLineString> {
        const center = base.geometry.coordinates;
        const {rotation, size} = opts;

        const arms: Position[][] = ARMS.map(arm => {
            const angle = toRadians(arm.angleDeg + rotation);
            const half = size * arm.reach;
            return [
                geometryService.translateCoordinates(center, half, angle + Math.PI),
                geometryService.translateCoordinates(center, half, angle),
            ];
        });
        return this.asMultiLineStringFeature(arms);
    }

    /**
     * `[edge, center]` — **edge first**, which is the order every point-anchored graphic
     * emits and which the controllers depend on: `handles[0]` drives the resize,
     * `handles[1]` the translate.
     *
     * The edge is the runway's own right-hand end, so the handle sits on the thing being
     * measured rather than floating beside it.
     */
    generateHandles(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiPoint> {
        const {rotation, size} = opts;
        const edge = geometryService.translateCoordinates(
            base.geometry.coordinates, size * ARMS[0].reach, toRadians(ARMS[0].angleDeg + rotation));
        return this.asMultiPointFeature([edge, base.geometry.coordinates]);
    }

    generateLabels(base: Feature<Point>): Feature<Point> {
        return this.asPointFeature(base.geometry.coordinates);
    }
}
