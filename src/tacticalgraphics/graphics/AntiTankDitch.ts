import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {PointGraphicOptions, TacticalGraphicName} from '../core/type';
import {Feature, MultiLineString, MultiPoint, Point, Position} from 'geojson';
import * as turf from '@turf/turf';

/**
 * The three anti-tank ditches of FM 1-02.2 table 5-19 - "triangular shaped or wide ditches
 * designed to stop tanks and armor fighting vehicles around a fortified position".
 *
 * One symbol in three states, and the plates differ only in fill and mines:
 *
 * ```
 * under construction   three triangles, outlined
 * completed            three triangles, filled
 * reinforced           three triangles filled, with a mine between each pair
 * ```
 *
 * **The triangle bases are the line.** There is no separate baseline stroke - on the plate
 * the three bases sit collinear and touching, and that shared edge is what reads as the
 * ditch. The reinforced state opens gaps between them for the mines, so its bases stop
 * touching; nothing is drawn across the gap.
 *
 * Filling cannot be expressed in a MultiLineString, so the rings are emitted here in a
 * fixed order - the three triangles, then the mines - and `antiTankDitchStyleFunc` decides
 * which are stroked and which are filled. Same reason the readiness states dash in the
 * renderer rather than the geometry.
 */

/** How each state is drawn. */
export interface AntiTankDitchStyle {
    /** Are the triangles solid? Only "under construction" is not. */
    filled: boolean;
    /** Does a mine sit between each pair of triangles? */
    mines: boolean;
}

export const ANTI_TANK_DITCH_STYLES: Partial<Record<TacticalGraphicName, AntiTankDitchStyle>> = {
    [TacticalGraphicName.AntiTankDitchUnderConstruction]: {filled: false, mines: false},
    [TacticalGraphicName.AntiTankDitchCompleted]: {filled: true, mines: false},
    [TacticalGraphicName.AntiTankDitchReinforcedWithMines]: {filled: true, mines: true},
};

/** Teeth per ditch, as drawn on the plate. */
const TEETH = 3;

/** Tooth height, as a multiple of its base width. */
const HEIGHT_RATIO = 0.85;

/** Gap between teeth on the reinforced state, as a multiple of a tooth's base width. */
const MINE_GAP_RATIO = 0.7;

/** Mine radius, as a multiple of the gap it sits in. */
const MINE_RADIUS_RATIO = 0.42;

/** How far below the base line a mine's centre sits, as a multiple of tooth height. */
const MINE_DEPTH_RATIO = 0.42;

export class AntiTankDitch extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string;
    type: string = 'Point';

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    private style(): AntiTankDitchStyle {
        return ANTI_TANK_DITCH_STYLES[this.name as TacticalGraphicName] ?? {filled: false, mines: false};
    }

    /**
     * Teeth first, then mines - the order `antiTankDitchStyleFunc` relies on.
     *
     * The ditch runs west to east with its teeth pointing south. There is no rotation: the
     * symbol has one orientation, and `opts.rotation` is ignored so a resize drag - which
     * derives an angle from the pointer - cannot turn it as a side effect.
     */
    private rings(base: Feature<Point>, opts: PointGraphicOptions): Position[][] {
        const centre = turf.point(base.geometry.coordinates);
        const span = Math.max(opts?.size ?? 1, 1);
        const {mines} = this.style();

        const gapRatio = mines ? MINE_GAP_RATIO : 0;
        const tooth = span / (TEETH + (TEETH - 1) * gapRatio);
        const gap = tooth * gapRatio;
        const height = tooth * HEIGHT_RATIO;

        /** A point `east` metres along the ditch from its centre, `south` metres below it. */
        const at = (east: number, south: number): Position => {
            const alongTrack = turf.destination(centre, Math.abs(east), east >= 0 ? 90 : 270, {units: 'meters'});
            if (south === 0) return alongTrack.geometry.coordinates as Position;
            return turf.destination(alongTrack, Math.abs(south), south >= 0 ? 180 : 0, {units: 'meters'}).geometry
                .coordinates as Position;
        };

        const rings: Position[][] = [];
        const left = -span / 2;

        for (let i = 0; i < TEETH; i++) {
            const x = left + i * (tooth + gap);
            // Closed ring: base west corner, base east corner, apex, back to the start.
            rings.push([at(x, 0), at(x + tooth, 0), at(x + tooth / 2, height), at(x, 0)]);
        }

        if (mines) {
            const radius = gap * MINE_RADIUS_RATIO;
            for (let i = 0; i < TEETH - 1; i++) {
                const x = left + (i + 1) * tooth + i * gap + gap / 2;
                const ring: Position[] = [];
                for (let a = 0; a <= 360; a += 20) {
                    const t = (a * Math.PI) / 180;
                    ring.push(at(x + Math.cos(t) * radius, height * MINE_DEPTH_RATIO + Math.sin(t) * radius));
                }
                rings.push(ring);
            }
        }

        return rings;
    }

    generateGraphics(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiLineString> {
        return this.asMultiLineStringFeature(this.rings(base, opts));
    }

    /**
     * `[edge, centre]` - edge first, as every point-dropped graphic must: `handles[0]` drives
     * resize, `handles[1]` drives translate. Rotation is off, so the edge handle only scales.
     */
    generateHandles(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([this.rings(base, opts)[0][0], base.geometry.coordinates]);
    }

    /** No amplifiers: affiliation and nothing else. */
    generateLabels(base: Feature<Point>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([]);
    }
}

/** The number of leading rings that are teeth; anything after them is a mine. */
export const ANTI_TANK_DITCH_TEETH = TEETH;
