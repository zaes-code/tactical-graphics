import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, GeometryCollection, LineString, MultiPoint, Position} from "geojson";
import geometryService from "../core/GeometryService";
import * as turf from '../core/turf';

/**
 * # The zigzag is a screen size; how many teeth you get is the line's business
 *
 * FM 1-02.2 draws Fix as a short straight run, a zigzag, and a second straight run into
 * an arrowhead. The zigzag is a *texture*: a longer obstacle carries more of it, the way
 * the wire obstacles carry more barbs, and every tooth is the same size.
 *
 * **It used to be exactly three triangles, every dimension a fraction of the drawn
 * length** — so a Fix drawn twice as long was the same picture at twice the scale, with
 * three enormous teeth, and a short one had three tiny ones. Both read as a different
 * symbol rather than a longer or shorter one.
 *
 * Everything below is a multiple of {@link PointGraphicOptions.size}, the decoration size
 * the renderer passes — a screen-pixel constant times the map resolution — so the teeth
 * hold their size on screen at any zoom and the *count* follows the line.
 */

/** Apex height either side of the run, as a share of the step. */
const FIX_AMPLITUDE_RATIO = 0.85;

/**
 * The straight run before the zigzag starts and after it ends, as a share of the step.
 *
 * The tail is longer because the arrowhead lives in it: a tooth running into the head
 * makes the point of the arrow ambiguous.
 */
const FIX_LEAD_RATIO = 1.6;
const FIX_TAIL_RATIO = 2.6;

/** Neither run may eat the line: on a short base the zigzag still gets most of it. */
const FIX_MAX_LEAD_SHARE = 0.22;
const FIX_MAX_TAIL_SHARE = 0.3;

/** Below two apexes it is a kink rather than a zigzag. */
const FIX_MIN_APEXES = 2;

/** Arrowhead length, as a share of the step. */
const FIX_ARROW_RATIO = 1.5;

/**
 * The step to use when the caller supplies no size.
 *
 * `renderTacticalGraphic` may be handed a bare base with no options at all, and a symbol
 * that came back as a straight line would look broken rather than unsized. A share of the
 * drawn length is the old behaviour's proportion, so the fallback still looks like a Fix.
 */
const FIX_FALLBACK_STEP_SHARE = 15 / 145;

export class Fix extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string;
    /**
     * **LineString, not Point.** This generator is driven by a drawn line — its
     * `generateGraphics` takes `Feature<LineString>` — and declaring `Point` made
     * `renderTacticalGraphic` reject every base a consumer could give it. The
     * OpenLayers holders never noticed because they call the registry directly and
     * bypass that guard; the public entry point is the only reader of this field.
     */
    type: string = 'LineString';

    /** Mission task or table 5-19 obstacle effect — same zigzag, "F" aside. @see Block */
    constructor(name: TacticalGraphicName = TacticalGraphicName.TacticalFix) {
        super();
        this.name = name;
    }

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<GeometryCollection> {
        const coords = base.geometry.coordinates;
        const [p0, p1] = coords;
        const dir01 = geometryService.unitVector(p0, p1);
        const total = turf.distance(turf.point(p0), turf.point(p1), {units: 'meters'});

        const step = opts?.size && opts.size > 0 ? opts.size : total * FIX_FALLBACK_STEP_SHARE;
        if (!(total > 0) || !(step > 0)) return this.asGeometryCollectionFeature([base.geometry]);

        const path = this.zigzag(p0, p1, total, step);
        const arrowHead = geometryService.createArrowHeadPolygon(p1, dir01, step * FIX_ARROW_RATIO);

        return this.asGeometryCollectionFeature([
            this.asLineStringFeature(path).geometry,
            arrowHead.geometry,
        ]);
    }

    /**
     * The run: straight, then alternating apexes one step apart, then straight again.
     *
     * The zigzag is centred in whatever the two straight runs leave, so the teeth stay
     * evenly placed however the remainder divides — a run that simply started after the
     * lead left a ragged gap before the arrowhead on most lengths.
     */
    private zigzag(p0: Position, p1: Position, total: number, step: number): Position[] {
        const amplitude = step * FIX_AMPLITUDE_RATIO;
        const lead = Math.min(step * FIX_LEAD_RATIO, total * FIX_MAX_LEAD_SHARE);
        const tail = Math.min(step * FIX_TAIL_RATIO, total * FIX_MAX_TAIL_SHARE);
        const band = Math.max(0, total - lead - tail);

        const apexes = Math.max(FIX_MIN_APEXES, Math.floor(band / step));
        const used = apexes * step;
        const start = lead + Math.max(0, band - used) / 2;

        const line = turf.lineString([p0, p1]);
        const bearing = turf.bearing(turf.point(p0), turf.point(p1));
        const along = (distance: number): Position =>
            turf.along(line, Math.max(0, Math.min(total, distance)), {units: 'meters'}).geometry.coordinates;
        const offset = (distance: number, side: number): Position =>
            turf.destination(turf.point(along(distance)), amplitude, bearing + side * 90, {units: 'meters'})
                .geometry.coordinates as Position;

        const path: Position[] = [p0, along(start)];
        for (let i = 0; i < apexes; i++) {
            // Half a step in: the apex sits between two crossings of the run, which is
            // what makes the teeth symmetric about it.
            path.push(offset(start + (i + 0.5) * step, i % 2 === 0 ? 1 : -1));
        }
        path.push(along(start + used), p1);
        return path;
    }

    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature(base.geometry.coordinates);
    }

    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([base.geometry.coordinates[0]]);
    }

}
