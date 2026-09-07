import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {Feature, LineString, MultiLineString, MultiPoint, Position} from "geojson";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import geometryService from "../core/GeometryService";
import * as turf from "../core/turf";

export class Block extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string;
    /**
     * **LineString, not Point.** This generator is driven by a drawn line — its
     * `generateGraphics` takes `Feature<LineString>` — and declaring `Point` made
     * `renderTacticalGraphic` reject every base a consumer could give it. The
     * OpenLayers holders never noticed because they call the registry directly and
     * bypass that guard; the public entry point is the only reader of this field.
     */
    type: string = 'LineString';

    /**
     * Two names, one shape. FM 1-02.2 draws the Chapter 6 tactical mission task
     * and the Chapter 5 table 5-19 obstacle effect identically apart from the
     * "B", and that letter is a renderer concern (`blockStyleFunc`), so the
     * geometry is shared outright. Defaults to the mission task, the older name.
     */
    constructor(name: TacticalGraphicName = TacticalGraphicName.TacticalBlock) {
        super();
        this.name = name;
    }

    /**
     * The bar and the stem, from the three points APP-06 270501 / 340100 name.
     *
     * > Points 1 and 2 define the endpoints of the symbol's vertical line. Point 3 defines
     * > the endpoint of the symbol's horizontal line.
     * >
     * > Points 1 and 2 determine the length of the vertical line. The length of the
     * > horizontal line is determined by plotting point 3 on a plane extending
     * > perpendicularly from the midpoint of the vertical line.
     *
     * So the symbol is a T lying on its side: the bar is the two points the operator placed,
     * and the stem leaves the middle of it at a right angle, ending at point 3. 340100 says
     * the same in the same words, which is why the mission task and the table 8-17 obstacle
     * effect share this generator as they always have.
     *
     * **It was a two-point graphic until 2026-09-06**, and the two it had were the *stem* —
     * so the bar was not placed at all: it was derived from `size`, a screen constant, and
     * the operator could state neither its length nor where along the stem it sat. The three
     * points invert that: the bar is placed and the stem is derived from point 3.
     *
     * `stem` comes first in the returned MultiLineString and that is load-bearing.
     * `blockStyleFunc` centres the "B" on `getCoordinates()[0]`, and the letter belongs on
     * the stem, not on the bar.
     */
    private lines(base: Feature<LineString>, opts: PointGraphicOptions): {stem: Position[]; bar: Position[]} {
        const coords = base.geometry.coordinates;
        /*
         * **A two-point base still draws, and its bar still lands on the same end.**
         *
         * Anything saved before the third point existed describes the stem alone, with the
         * bar rebuilt across one end at `size`. Which end took some care: `getBlockArrow`
         * puts the bar on its *last* coordinate, and until 2026-09-06 block was in
         * `TIP_FIRST_GRAPHICS` — so a stored `[bar end, stem end]` arrived here reversed and
         * the bar came out on the stored *first* point. Block left that list when its bar
         * became points 1 and 2, because the generator now reads the plate's order straight;
         * the reversal a legacy pair still needs is therefore done here, where it applies to
         * exactly the case that needs it. Without it every saved block flipped end for end.
         * @see drawOrder.ts, blockAnchors
         */
        if (coords.length < 3) {
            const legacy: Feature<LineString> = {
                ...base,
                geometry: {...base.geometry, coordinates: [...coords].reverse()},
            };
            const arrow = geometryService.getBlockArrow(legacy, opts.size).geometry.coordinates;
            return {stem: arrow.slice(0, -2), bar: arrow.slice(-2)};
        }

        const [top, bottom, stemEnd] = coords;
        const middle = turf.midpoint(turf.point(top), turf.point(bottom)).geometry.coordinates as Position;

        /*
         * **Squared here as well as in the reader.** `blockAnchors` already plots point 3 on
         * the perpendicular from this midpoint — the rule says so outright — so for anything
         * the operator drew this is the identity. A base from a hand-written file or a vertex
         * drag not yet read back would otherwise draw a stem leaning off the bar, which is an
         * L and not a T. Re-projecting every render keeps the picture right whatever the
         * stored point says, and `generateHandles` publishes the squared point so the grip
         * stays on the stem's end. @see MobileDefense.frame, which re-derives for this reason
         */
        const barBearing = turf.bearing(turf.point(top), turf.point(bottom));
        const toStem = turf.bearing(turf.point(middle), turf.point(stemEnd));
        const span = turf.distance(turf.point(middle), turf.point(stemEnd), {units: 'meters'});
        const across = span * Math.sin(((toStem - barBearing) * Math.PI) / 180);
        /*
         * A point 3 with no perpendicular offset — one lying on the bar's own axis — leaves
         * the stem with nothing to be: `squared` comes out at the midpoint and the stem is a
         * point. That is the honest answer rather than a stem laid along the bar, which is
         * not a shape the plate has, and the bar still draws because `blockPaint` no longer
         * treats a zero-length shaft as a reason to draw nothing. `blockAnchors` refuses such
         * a click outright, so this reaches only a synthesized or hand-written base.
         */
        if (!isFinite(across)) return {stem: [middle, middle], bar: [top, bottom]};
        const squared = turf.destination(turf.point(middle), Math.abs(across), barBearing + Math.sign(across) * 90, {
            units: 'meters',
        }).geometry.coordinates as Position;
        return {stem: [squared, middle], bar: [top, bottom]};
    }

    /**
     * Stem then bar, as two sub-lines.
     *
     * Separate rather than one polyline because `blockStyleFunc` takes the baseline it
     * centres the "B" on from `getCoordinates()[0]`; reporting the stem on its own puts the
     * letter at a flat 0.5 along it. Drawing them as one path also retraced the stem on the
     * way back out to the bar.
     */
    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiLineString> {
        const {stem, bar} = this.lines(base, opts);
        return this.asMultiLineStringFeature([stem, bar]);
    }

    /**
     * `[point 1, point 2, point 3]` — the bar's two ends and the stem's, every one placed.
     *
     * There is no width handle any more: the bar's length was a `size` the operator dragged
     * out of a hidden offset grip, and it is points 1 and 2 now. @see handleContract
     */
    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        if (coords.length < 3) {
            // Same reversal as `lines`, so the grips sit on the symbol it actually draws.
            return this.asMultiPointFeature([coords[1], coords[0]]);
        }
        // Point 3 where the stem actually ends, so the grip cannot drift off the symbol.
        return this.asMultiPointFeature([coords[0], coords[1], this.lines(base, opts).stem[0]]);
    }

    /** The stem's free end — point 3, or the drawn start on a legacy two-point base. */
    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([this.lines(base, opts).stem[0]]);
    }

}
