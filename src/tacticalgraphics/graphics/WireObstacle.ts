import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {BaseGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, LineString, MultiLineString, MultiPoint} from 'geojson';

/**
 * The wire obstacles of FM 1-02.2 table 5-19 (constructed obstacle symbols).
 *
 * All nine are one thing - a drawn route carrying a repeating mark - so they share a
 * generator and differ only by a row in `WIRE_STYLES`. Adding the tenth should be a row,
 * not a class, for the same reason `Phaseline` backs every simple line graphic.
 *
 * The barbed-wire family is an **X mark**, not a fence post: the symbol is the wire, and
 * the graphics separate by *density* rather than by shape. Reading the ladder in
 * `perGroup` / `gap` top to bottom is the whole distinction between them:
 *
 * ```
 * unspecified        X X X X X X X X X       (no rail - the marks are the symbol)
 * single fence    ---X-------X-------X---
 * double fence    --XX-----XX-----XX-----
 * double apron    -X--X--X--X--X--X--X---
 * ```
 *
 * `gap` counts *spaces*, one space being the width of a mark, so the ladder holds at any
 * size: the marks and the gaps scale together.
 */

/** What a wire graphic repeats along its line. */
export interface WireStyle {
    /** `cross` = the barbed-wire X; `loop` = a concertina coil. */
    mark: 'cross' | 'loop';
    /** Is the wire itself drawn? Unspecified is the one that is not. */
    rail: boolean;
    /** Marks per group, drawn touching. */
    perGroup: number;
    /** Spaces between groups, one space = one mark width. */
    gap: number;
    /** Spaces between the marks *inside* a group. 0 means they touch. */
    innerGap?: number;
    /**
     * Run the wire along the bottom of the marks instead of through their middle - the X's
     * sit on it, underlined. Low wire fence is the one that reads this way.
     */
    railUnder?: boolean;
    /** Mark height, as a multiple of the mark width. */
    height: number;
    /** Parallel strands, spread about the drawn line. Concertina only. */
    strands?: number;
}

/**
 * A gap given in screen pixels rather than in mark widths.
 *
 * The ladder's natural unit is the mark width, because that is what keeps the pattern
 * proportional at any size. Some spacings are specified in pixels instead, though, and
 * converting them here keeps `WIRE_MARK_PX` the single place the unit is defined - a
 * literal 0.357 in the table would silently stop meaning 5 px the moment it changed.
 */
const PX = (px: number) => px / WIRE_MARK_PX;

/** Mark width in screen pixels - the unit the whole density ladder is built from. */
export const WIRE_MARK_PX = 14;

export const WIRE_STYLES: Partial<Record<TacticalGraphicName, WireStyle>> = {
    // Specified by the user, 2026-08-07. The ladder is deliberate: one mark, rising density.
    [TacticalGraphicName.WireUnspecified]: {mark: 'cross', rail: false, perGroup: 1, gap: PX(16), height: 1},
    [TacticalGraphicName.WireSingleFence]: {mark: 'cross', rail: true, perGroup: 1, gap: 6.0, height: 1},
    [TacticalGraphicName.WireDoubleFence]: {mark: 'cross', rail: true, perGroup: 2, gap: 3.5, innerGap: PX(5), height: 1},
    [TacticalGraphicName.WireDoubleApronFence]: {mark: 'cross', rail: true, perGroup: 1, gap: 1.5, height: 1},

    // NOT YET SPECIFIED - extrapolated, and the likeliest thing here to be wrong. The two
    // fences take the single-fence pattern and separate on mark height, which is what
    // "low" and "high" name; the concertinas keep coils, separating on strand count.
    [TacticalGraphicName.WireLowWireFence]: {mark: 'cross', rail: true, perGroup: 1, gap: 1.5, height: 1, railUnder: true},
    [TacticalGraphicName.WireHighWireFence]: {mark: 'cross', rail: true, perGroup: 1, gap: 6.0, height: 1.6},
    [TacticalGraphicName.WireSingleConcertina]: {mark: 'loop', rail: true, perGroup: 1, gap: 0.8, height: 1, strands: 1},
    [TacticalGraphicName.WireDoubleStrandConcertina]: {mark: 'loop', rail: true, perGroup: 1, gap: 0.8, height: 1, strands: 2},
    [TacticalGraphicName.WireTripleStrandConcertina]: {mark: 'loop', rail: true, perGroup: 1, gap: 0.8, height: 1, strands: 3},
};

export const DEFAULT_WIRE_STYLE: WireStyle = {mark: 'cross', rail: true, perGroup: 1, gap: 6, height: 1};

export class WireObstacle extends TacticalGraphicsBase<BaseGraphicOptions> {
    name: string;
    type: string = 'LineString';

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    private style(): WireStyle {
        return WIRE_STYLES[this.name as TacticalGraphicName] ?? DEFAULT_WIRE_STYLE;
    }

    /**
     * The drawn route, and only that.
     *
     * The marks are *not* here. They are screen-space decorations, so they are synthesised
     * in `wireObstacleStyleFunc` from the `WIRE_STYLES` row, exactly as the fortified line
     * synthesises its merlons and the obstacle line its teeth. Baking them here froze them
     * in metres at the drawing zoom, which made a wire obstacle grow to absurdity a few
     * zoom levels in.
     *
     * The cost, taken deliberately: all nine now return identical GeoJSON, so the *name* is
     * what distinguishes them to a non-OpenLayers consumer. `WIRE_STYLES` is exported so a
     * second renderer can read the same ladder rather than reinvent it.
     */
    generateGraphics(base: Feature<LineString>, opts?: BaseGraphicOptions): Feature<MultiLineString> {
        const coords = base.geometry.coordinates;

        // Between the first map click and the second the draw interaction hands us a
        // one-point sketch, then a zero-length two-point one, on every pointer move.
        // Returning `[coords]` there emitted a *one-point LineString*, which is not a line:
        // OL draws nothing and stricter GeoJSON consumers throw. Emit no parts instead.
        if (coords.length < 2) return this.asMultiLineStringFeature([]);
        return this.asMultiLineStringFeature([coords]);
    }

    generateHandles(base: Feature<LineString>, opts?: BaseGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        return this.asMultiPointFeature([coords[0], coords[coords.length - 1]]);
    }

    generateLabels(base: Feature<LineString>, opts?: BaseGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([]);
    }
}
