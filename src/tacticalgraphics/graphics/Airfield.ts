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
 * "Static" means the size is not the operator's, so the arms are pinned to a screen size
 * in the paint layer, exactly as the crossed mission tasks are. The geometry here is
 * expressed against `opts.size` so a static GeoJSON consumer still gets a shape of a
 * sensible extent. @see airfieldPointPaint, crossedMissionTaskPaint
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
     * The centre, and only the centre. A static symbol has no dimension the operator may
     * drag, and an edge handle would suggest one that does not exist.
     */
    generateHandles(base: Feature<Point>): Feature<MultiPoint> {
        return this.asMultiPointFeature([base.geometry.coordinates]);
    }

    generateLabels(base: Feature<Point>): Feature<Point> {
        return this.asPointFeature(base.geometry.coordinates);
    }
}
