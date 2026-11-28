/**
 * # Passage lane: W W1 upright, past the entry end
 *
 * FM 1-02.2 Table 5-16 sets the date range level below the lane, clear of the symbol. It
 * used to be turned across the lane, so a lane drawn east to west stood it on end.
 */
import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {getPaintFunction} from './registry';

const context: PaintContext = {resolution: 10, measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6};

/** A lane entered at `entry`, leaving at `exit`, tail hooks swept back from the entry. */
const lane = (entry: ProjectedPosition, exit: ProjectedPosition): PaintFeature => {
    const [ux, uy] = [(exit[0] - entry[0]) / 10_000, (exit[1] - entry[1]) / 10_000];
    const hook = (side: number): ProjectedPosition => [entry[0] - ux * 1000 - uy * 1000 * side, entry[1] - uy * 1000 + ux * 1000 * side];
    return {
        geometry: {type: 'MultiLineString', coordinates: [[hook(1), exit, hook(-1)], [entry, exit], [hook(1), entry, hook(-1)]]},
        properties: {name: TacticalGraphicName.PassageLane, startDate: '011200ZOCT26', endDate: '021800ZOCT26'},
    } as unknown as PaintFeature;
};

beforeEach(() => resetTacticalGraphicsConfig());

describe('passage lane dates', () => {
    const paint = getPaintFunction(TacticalGraphicName.PassageLane)!.graphic;

    it.each([
        ['east', [0, 0], [10_000, 0]],
        ['west', [10_000, 0], [0, 0]],
        ['north', [0, 0], [0, 10_000]],
    ] as const)('stand upright and clear of a lane drawn %s', (_, entry, exit) => {
        const text = paint(lane([...entry] as ProjectedPosition, [...exit] as ProjectedPosition), context).find(p => p.text)!;
        expect(text.text!.rotation ?? 0).toBe(0);
        // Past the entry, on the side away from the exit, and clear of the hooks' 1 km reach.
        const at = text.geometry.coordinates as number[];
        const [ux, uy] = [(exit[0] - entry[0]) / 10_000, (exit[1] - entry[1]) / 10_000];
        const along = (at[0] - entry[0]) * ux + (at[1] - entry[1]) * uy;
        const halfWidth = (('011200ZOCT26 - 021800ZOCT26'.length * 16 * 0.6 * (text.text!.scale ?? 1)) / 2) * context.resolution;
        const halfHeight = 8 * (text.text!.scale ?? 1) * context.resolution;
        expect(-along).toBeGreaterThan(1000 + Math.abs(ux) * halfWidth + Math.abs(uy) * halfHeight);
    });
});
