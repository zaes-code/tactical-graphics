import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {BaseGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '@turf/turf';

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
interface WireStyle {
    /** `cross` = the barbed-wire X; `loop` = a concertina coil. */
    mark: 'cross' | 'loop';
    /** Is the wire itself drawn? Unspecified is the one that is not. */
    rail: boolean;
    /** Marks per group, drawn touching. */
    perGroup: number;
    /** Spaces between groups, one space = one mark width. */
    gap: number;
    /** Mark height, as a multiple of the mark width. */
    height: number;
    /** Parallel strands, spread about the drawn line. Concertina only. */
    strands?: number;
}

const WIRE_STYLES: Partial<Record<TacticalGraphicName, WireStyle>> = {
    // Specified by the user, 2026-08-07. The ladder is deliberate: one mark, rising density.
    [TacticalGraphicName.WireUnspecified]: {mark: 'cross', rail: false, perGroup: 1, gap: 1.0, height: 1},
    [TacticalGraphicName.WireSingleFence]: {mark: 'cross', rail: true, perGroup: 1, gap: 6.0, height: 1},
    [TacticalGraphicName.WireDoubleFence]: {mark: 'cross', rail: true, perGroup: 2, gap: 3.5, height: 1},
    [TacticalGraphicName.WireDoubleApronFence]: {mark: 'cross', rail: true, perGroup: 1, gap: 1.5, height: 1},

    // NOT YET SPECIFIED - extrapolated, and the likeliest thing here to be wrong. The two
    // fences take the single-fence pattern and separate on mark height, which is what
    // "low" and "high" name; the concertinas keep coils, separating on strand count.
    [TacticalGraphicName.WireLowWireFence]: {mark: 'cross', rail: true, perGroup: 1, gap: 6.0, height: 0.55},
    [TacticalGraphicName.WireHighWireFence]: {mark: 'cross', rail: true, perGroup: 1, gap: 6.0, height: 1.6},
    [TacticalGraphicName.WireSingleConcertina]: {mark: 'loop', rail: true, perGroup: 1, gap: 0.8, height: 1, strands: 1},
    [TacticalGraphicName.WireDoubleStrandConcertina]: {mark: 'loop', rail: true, perGroup: 1, gap: 0.8, height: 1, strands: 2},
    [TacticalGraphicName.WireTripleStrandConcertina]: {mark: 'loop', rail: true, perGroup: 1, gap: 0.8, height: 1, strands: 3},
};

const DEFAULT_STYLE: WireStyle = {mark: 'cross', rail: true, perGroup: 1, gap: 6, height: 1};

export class WireObstacle extends TacticalGraphicsBase<BaseGraphicOptions> {
    name: string;
    type: string = 'LineString';

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    private style(): WireStyle {
        return WIRE_STYLES[this.name as TacticalGraphicName] ?? DEFAULT_STYLE;
    }

    generateGraphics(base: Feature<LineString>, opts?: BaseGraphicOptions): Feature<MultiLineString> {
        const coords = base.geometry.coordinates;
        if (coords.length < 2) return this.asMultiLineStringFeature([coords]);

        const style = this.style();
        const width = Math.max(opts?.size ?? 1, 1);
        const height = width * style.height;
        const line = turf.lineString(coords);
        const length = turf.length(line, {units: 'meters'});
        const parts: Position[][] = [];

        /** A point `along` metres down the line, offset `across` metres to its left. */
        const at = (along: number, across: number): Position => {
            const clamped = Math.min(Math.max(along, 0), length);
            const p = turf.along(line, clamped, {units: 'meters'});
            if (across === 0) return p.geometry.coordinates as Position;
            const ahead = turf.along(line, Math.min(clamped + 1, length), {units: 'meters'});
            const back = turf.along(line, Math.max(clamped - 1, 0), {units: 'meters'});
            const bearing = turf.bearing(back, ahead);
            return turf.destination(p, Math.abs(across), bearing + (across > 0 ? -90 : 90), {units: 'meters'}).geometry
                .coordinates as Position;
        };

        const strands = style.strands ?? 1;
        const spread = height * 0.9;
        const offsetOf = (s: number) => (strands === 1 ? 0 : (s - (strands - 1) / 2) * spread);

        // The wire itself. Unspecified omits it: there, the marks *are* the symbol.
        if (style.rail) {
            for (let s = 0; s < strands; s++) {
                const rail: Position[] = [];
                const step = Math.max(length / 64, 1);
                for (let d = 0; d < length; d += step) rail.push(at(d, offsetOf(s)));
                rail.push(at(length, offsetOf(s)));
                parts.push(rail);
            }
        }

        // Groups of marks, repeating. The rail crosses each mark through its middle.
        const period = (style.perGroup + style.gap) * width;
        for (let start = period / 2; start < length; start += period) {
            for (let i = 0; i < style.perGroup; i++) {
                const d = start + i * width;
                if (d + width / 2 > length) break;
                for (let s = 0; s < strands; s++) {
                    const off = offsetOf(s);
                    if (style.mark === 'cross') {
                        parts.push([at(d - width / 2, off + height / 2), at(d + width / 2, off - height / 2)]);
                        parts.push([at(d - width / 2, off - height / 2), at(d + width / 2, off + height / 2)]);
                    } else {
                        const loop: Position[] = [];
                        for (let a = 0; a <= 180; a += 20) {
                            const t = (a * Math.PI) / 180;
                            loop.push(at(d - Math.cos(t) * width * 0.5, off + Math.sin(t) * height * 0.7));
                        }
                        parts.push(loop);
                    }
                }
            }
        }

        return this.asMultiLineStringFeature(parts);
    }

    generateHandles(base: Feature<LineString>, opts?: BaseGraphicOptions): Feature<MultiPoint> {
        const coords = base.geometry.coordinates;
        return this.asMultiPointFeature([coords[0], coords[coords.length - 1]]);
    }

    generateLabels(base: Feature<LineString>, opts?: BaseGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([]);
    }
}
