import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";
import * as turf from '../core/turf';

/**
 * The bar half-height of a fire-position symbol, as a fraction of the shaft the
 * user drew. Everything else in the symbol is derived from the bar (see the
 * FIRE_POSITION_* ratios in `GeometryService`), so this is the single knob for
 * how big the whole thing renders.
 *
 * The doctrinal construct draws the bar at 0.76 of its shaft, but the construct's
 * shaft is a stub pointing at an adjacent objective — at that ratio a symbol
 * dragged across a map stands two and a half times taller than the line the user
 * drew. 0.45 keeps the footprint roughly square and comparable to the graphic's
 * previous size while still reading as the doctrinal shape.
 */
const FIRE_POSITION_BAR_RATIO = 0.45;

/**
 * Block-arrow mission task graphic with a configurable name.
 *
 * AttackByFire and SupportByFire render the doctrinal fire-position symbols — a
 * bar with two feathers swept back off its ends, plus one arrow out of the bar's
 * middle (attack) or two diverging off its ends (support). All other names render
 * the plain T-shape block arrow.
 *
 * Used for: AttackByFire and SupportByFire. Destroy, Interdict, Neutralize and
 * Suppress used to route through here too; they are crossed lines in FM 1-02.2,
 * not block arrows, and now have their own point-anchored generator — see
 * `CrossedMissionTask`. FollowAndAssume and FollowAndSupport were the last two
 * users of the plain block-arrow branch and are currently excluded — see
 * `ai/excluded-graphics.md`. Keep that branch: it is what they come back to.
 */
export class NamedBlockArrow extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string;
    /**
     * **LineString, not Point.** This generator is driven by a drawn line — its
     * `generateGraphics` takes `Feature<LineString>` — and declaring `Point` made
     * `renderTacticalGraphic` reject every base a consumer could give it. The
     * OpenLayers holders never noticed because they call the registry directly and
     * bypass that guard; the public entry point is the only reader of this field.
     */
    type: string = 'LineString';

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    private isFirePosition(): boolean {
        return this.name === TacticalGraphicName.AttackByFire
            || this.name === TacticalGraphicName.SupportByFire;
    }

    /**
     * Bar half-height in meters, derived from the drawn line's own length rather
     * than from `opts.size` — the Fix pattern. `opts.size` is a map-unit value
     * baked at construction time, so driving the bar off it would let the shaft
     * grow on resize while the bar stayed put.
     */
    private barHalf(base: Feature<LineString>): number {
        const coords = base.geometry.coordinates;
        const shaftLength = turf.distance(
            turf.point(coords[0]),
            turf.point(coords[coords.length - 1]),
            {units: 'meters'},
        );
        return shaftLength * FIRE_POSITION_BAR_RATIO;
    }

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<LineString | MultiLineString> {
        if (this.name === TacticalGraphicName.AttackByFire) {
            return geometryService.getAttackByFireSymbol(base.geometry.coordinates, this.barHalf(base));
        }
        if (this.name === TacticalGraphicName.SupportByFire) {
            return geometryService.getSupportByFireSymbol(base.geometry.coordinates, this.barHalf(base));
        }
        return geometryService.getBlockArrow(base, opts.size);
    }

    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        if (this.isFirePosition()) {
            // [offsetHandle (dropped by the openlayers Block holder — the symbol is
            //  ratio-locked, so there is no width to drag), startHandle, endHandle]
            const coords = base.geometry.coordinates;
            return this.asMultiPointFeature([coords[0], coords[0], coords[coords.length - 1]]);
        }
        const arrow = geometryService.getBlockArrow(base, opts.size).geometry.coordinates;
        return this.asMultiPointFeature([arrow[3], arrow[0], arrow[1]]);
    }

    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        if (this.isFirePosition()) {
            // Anchored at the bar's center. Both fire-position symbols are drawn
            // shape-only — the style function renders no text — but a library
            // consumer still gets a sane anchor to hang one off.
            return this.asMultiPointFeature([base.geometry.coordinates[0]]);
        }
        const arrow = geometryService.getBlockArrow(base, opts.size).geometry.coordinates;
        return this.asMultiPointFeature([arrow[0]]);
    }
}
