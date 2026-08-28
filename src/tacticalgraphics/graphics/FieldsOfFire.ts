import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {IBaseGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint, Position} from "geojson";
import geometryService from "../core/GeometryService";
import * as turf from '../core/turf';


/**
 * The angle the second leg opens to when a fields-of-fire is drawn with only two
 * points, in degrees.
 *
 * A right angle: wide enough to read unmistakably as a V rather than a bent line,
 * and a value a user is likely to want to adjust from rather than accept.
 */
const DEFAULT_VEE_DEGREES = 90;

/**
 * The base as a **V**, whatever the user drew.
 *
 * FM 1-02.2 draws fields of fire as two legs meeting at an apex, and the symbol is
 * not a fields-of-fire without both. A two-point base produced a straight line with
 * an arrowhead at each end — a different symbol, and one a user could reach simply
 * by clicking twice.
 *
 * So the second leg is synthesized: the drawn leg swung about the apex by
 * {@link DEFAULT_VEE_DEGREES}. The user then has a real V they can reshape by
 * dragging either end, which is what the handles are for.
 *
 * **Layout is `[end, apex, end]`** — the apex in the middle. That is what
 * `generateGraphics` reads to place its arrowheads and what `generateHandles`
 * publishes, so a synthesized leg has to land in the same order as a drawn one or
 * the arrowheads point at the wrong vertices.
 *
 * Done geodesically rather than by rotating the raw degrees: a leg swung in degree
 * space comes out the wrong length and the wrong bearing away from the equator, and
 * the V would open by a different angle at every latitude.
 */
export function asVee(coords: Position[]): Position[] {
    if (coords.length >= 3) return coords;
    if (coords.length < 2) return coords;

    // The user's second click is the apex: they draw a leg, then where it bends.
    const [end, apex] = coords;
    const bearing = turf.bearing(turf.point(apex), turf.point(end));
    const length = turf.distance(turf.point(apex), turf.point(end), {units: 'meters'});
    if (!Number.isFinite(length) || length <= 0) return coords;

    const swung = turf.destination(turf.point(apex), length, bearing + DEFAULT_VEE_DEGREES, {units: 'meters'});
    return [end, apex, swung.geometry.coordinates];
}

export class FieldsOfFire extends TacticalGraphicsBase {
    name: string = TacticalGraphicName.FieldsOfFire;
    type: string = "LineString";

    generateGraphics(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiLineString> {
        const coords = asVee(base.geometry.coordinates);
        if (coords.length < 3) return this.asMultiLineStringFeature([coords]);

        const size = opts?.size || 1;
        // Both arrowheads point *outward* along their own leg, away from the apex.
        const startArrow = geometryService.computeArrowheadPoints(coords[1], coords[0], -size, 135);
        const endArrow = geometryService.computeArrowheadPoints(coords[1], coords[2], -size, 135);

        return this.asMultiLineStringFeature([coords, startArrow, endArrow]);
    }

    /**
     * The two leg ends, plus the apex between them.
     *
     * Order is the contract the OpenLayers controller reads: ends first, apex last, so
     * `anchorVertex` can name it without depending on how many vertices were drawn. The
     * ends reshape the V — angle and leg length together — while the apex moves the whole
     * graphic, which is why it is a handle at all rather than just a corner.
     */
    generateHandles(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiPoint> {
        // The V, so a graphic drawn with two clicks still offers the apex handle that
        // moves it — the handles have to describe what is on the screen.
        const coords = asVee(base.geometry.coordinates);
        const ends = [coords[0], coords[coords.length - 1]];
        if (coords.length < 3) return this.asMultiPointFeature(ends);
        return this.asMultiPointFeature([...ends, coords[Math.floor(coords.length / 2)]]);
    }

    generateLabels(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiPoint> {
        const coords = asVee(base.geometry.coordinates);
        return this.asMultiPointFeature([coords[0], coords[coords.length - 1]]);
    };
}
