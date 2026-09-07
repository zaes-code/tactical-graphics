import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";
import {frontEdgeFrame, legacyAxis} from "./frontEdgeFrame";

/**
 * Clear — APP-06 340500.
 *
 * > **Anchor Points.** This symbol requires three anchor points. Points 1 and 2 define the
 * > endpoints of the symbol's vertical line and point 3 defines the rear of the symbol.
 * > **Size/Shape.** Points 1 and 2 determine the symbol's height and point 3 determines its
 * > length. The spacing between the symbol's arrows will stay proportional to the symbol's
 * > height. The tip of the middle arrowhead will be at the midpoint of the vertical line.
 * > The arrows will stay perpendicular to the vertical line, regardless of the rotational
 * > orientation of the symbol as a whole.
 * > **Orientation.** The arrows typically point toward enemy forces.
 *
 * Three arrows run from the rear to a vertical line at the front, which points 1 and 2 are
 * the ends of. All three constraints in Size/Shape fall out of building the figure on that
 * frame rather than on a drawn axis and a derived width: the arrows are laid along the
 * axis, which is perpendicular to the front edge **by construction**, so they stay square
 * to it at any rotation; the middle one runs to the axis's own end, which is the front
 * edge's midpoint; and the outer two are offset by a fraction of the height, so their
 * spacing is proportional to it.
 *
 * **The spacing is measured, not chosen.** Off the Template raster (215 × 215): the vertical
 * line spans rows 37–179, so its height is 142 and its midpoint row 108; the three arrow
 * shafts sit at rows 56, 106 and 158. The middle one is on the midpoint, and the outer two
 * are 50 and 52 rows out — 0.36 of the height either side, which is what
 * {@link ARROW_SPACING_RATIO} states. Note the outer arrows are *inset*: they are not at
 * points 1 and 2, but about a seventh of the height in from each end.
 *
 * Two points and a locked 0.3 aspect ratio until 2026-09-06, which made the height and the
 * length one number where the plate states two. @see frontEdgeFrame
 */
export class Clear extends TacticalGraphicsBase<PointGraphicOptions> {
    /**
     * How far the outer arrows sit from the middle one, as a share of the symbol's height.
     *
     * Measured off 340500's Template — see the class doc. The plate asks only that the
     * spacing "stay proportional to the symbol's height", which this is: a ratio, applied to
     * the height points 1 and 2 state.
     */
    private static readonly ARROW_SPACING_RATIO = 0.36;

    name: string = TacticalGraphicName.Clear;
    /**
     * **LineString, not Point.** This generator is driven by a drawn line — its
     * `generateGraphics` takes `Feature<LineString>` — and declaring `Point` made
     * `renderTacticalGraphic` reject every base a consumer could give it. The
     * OpenLayers holders never noticed because they call the registry directly and
     * bypass that guard; the public entry point is the only reader of this field.
     */
    type: string = 'LineString';

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiLineString> {
        const {axis, half} = frontEdgeFrame(base, opts.size);
        /*
         * The spacing and the height go in separately, which is how the plate states them:
         * the outer arrows sit `ARROW_SPACING_RATIO` of the height either side of the middle
         * one, and the front line runs the full height points 1 and 2 gave. Handing the
         * helper one number put the outer arrows *on* points 1 and 2, which the Template
         * shows they are not — they are inset about a seventh of the height from each end.
         */
        return geometryService.getClearGraphic(axis, half * 2 * Clear.ARROW_SPACING_RATIO, half);
    }

    /** `[vertical line end 1, end 2, rear]`, or the legacy `[offset, p0, p1]`. @see Breach */
    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        if (coords.length >= 3) return this.asMultiPointFeature([coords[0], coords[1], coords[2]]);

        const legacy = legacyAxis(coords);
        let topArrow = geometryService.getBypassArrow(legacy, -opts.size);
        return this.asMultiPointFeature([topArrow.geometry.coordinates[1][2], legacy[0], legacy[1]]);
    }

    /** The letter belongs at the rear, which is the axis's start. @see Breach.generateLabels */
    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([frontEdgeFrame(base, opts.size).axis[0]]);
    }

}
