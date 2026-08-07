import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {BaseGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '@turf/turf';

/**
 * The wire obstacles of FM 1-02.2 table 5-19 (constructed obstacle symbols).
 *
 * All nine are the same thing — a drawn line carrying a repeating decoration — so they
 * share one generator and differ only in `WIRE_STYLES`. Adding the tenth should be a row
 * in that table, not a class.
 *
 * **First stab.** The doctrinal text names these but the extracted `FM_1-02.2.txt` has no
 * figures, so the decorations follow standard military symbology rather than a measured
 * read of the plates: posts for fences, loops for concertina, count for strand. Expect to
 * refine spacing and proportion against the PDF.
 */

/** What a wire graphic repeats along its line. */
interface WireStyle {
    /** `post` = a tick across the line; `loop` = a concertina coil. */
    mark: 'post' | 'loop' | 'cross';
    /** How many parallel rails the line is drawn as. */
    rails: number;
    /** Mark height, as a multiple of the decoration size. */
    height: number;
    /** Spacing between marks, as a multiple of the decoration size. */
    pitch: number;
    /** Diagonal stays either side of each post — the apron fences. */
    apron?: boolean;
}

const WIRE_STYLES: Partial<Record<TacticalGraphicName, WireStyle>> = {
    [TacticalGraphicName.WireUnspecified]:          {mark: 'cross', rails: 1, height: 0.7, pitch: 2.2},
    [TacticalGraphicName.WireSingleFence]:          {mark: 'post', rails: 1, height: 1.0, pitch: 2.0},
    [TacticalGraphicName.WireDoubleFence]:          {mark: 'post', rails: 2, height: 1.0, pitch: 2.0},
    [TacticalGraphicName.WireDoubleApronFence]:     {mark: 'post', rails: 1, height: 1.0, pitch: 2.6, apron: true},
    [TacticalGraphicName.WireLowWireFence]:         {mark: 'post', rails: 1, height: 0.55, pitch: 1.6},
    [TacticalGraphicName.WireHighWireFence]:        {mark: 'post', rails: 1, height: 1.6, pitch: 2.4},
    [TacticalGraphicName.WireSingleConcertina]:     {mark: 'loop', rails: 1, height: 1.0, pitch: 1.8},
    [TacticalGraphicName.WireDoubleStrandConcertina]: {mark: 'loop', rails: 2, height: 1.0, pitch: 1.8},
    [TacticalGraphicName.WireTripleStrandConcertina]: {mark: 'loop', rails: 3, height: 1.0, pitch: 1.8},
};

const DEFAULT_STYLE: WireStyle = {mark: 'post', rails: 1, height: 1, pitch: 2};

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
        const unit = Math.max(opts?.size ?? 1, 1);
        const height = unit * style.height;
        const pitch = unit * style.pitch;
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
            return turf.destination(p, Math.abs(across), bearing + (across > 0 ? -90 : 90), {units: 'meters'})
                .geometry.coordinates as Position;
        };

        // Rails: the wire itself. Two or three run parallel, spread about the drawn line.
        const gap = height * 0.55;
        for (let r = 0; r < style.rails; r++) {
            const offset = style.rails === 1 ? 0 : (r - (style.rails - 1) / 2) * gap;
            const rail: Position[] = [];
            for (let d = 0; d <= length; d += Math.max(length / 64, 1)) rail.push(at(d, offset));
            rail.push(at(length, offset));
            parts.push(rail);
        }

        // Marks, repeated along the line.
        const railSpan = style.rails === 1 ? 0 : (style.rails - 1) * gap;
        for (let d = pitch / 2; d < length; d += pitch) {
            if (style.mark === 'post') {
                parts.push([at(d, railSpan / 2 + height), at(d, -railSpan / 2 - height * 0.15)]);
                if (style.apron) {
                    parts.push([at(d, height), at(d - height, -height * 0.6)]);
                    parts.push([at(d, height), at(d + height, -height * 0.6)]);
                }
            } else if (style.mark === 'cross') {
                parts.push([at(d - height * 0.6, height * 0.6), at(d + height * 0.6, -height * 0.6)]);
                parts.push([at(d - height * 0.6, -height * 0.6), at(d + height * 0.6, height * 0.6)]);
            } else {
                // Concertina coil: a loop standing off each rail.
                for (let r = 0; r < style.rails; r++) {
                    const offset = style.rails === 1 ? 0 : (r - (style.rails - 1) / 2) * gap;
                    const loop: Position[] = [];
                    for (let a = 0; a <= 180; a += 20) {
                        const t = (a * Math.PI) / 180;
                        loop.push(at(d - Math.cos(t) * height * 0.5, offset + Math.sin(t) * height * 0.7));
                    }
                    parts.push(loop);
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
