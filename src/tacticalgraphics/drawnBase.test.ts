/**
 * # What a double-click leaves behind
 *
 * A double-click broke fields of fire in both engines, by two different routes that
 * produced the same complaint — the V angle cannot be modified:
 *
 * - OpenLayers ended the draw at two vertices, and the generator synthesized the
 *   second leg at a fixed angle on every render. The V was real but frozen: dragging
 *   one leg swung the other with it, so the angle never changed.
 * - MapLibre delivers a double-click's two clicks as ordinary `click`s first, so the
 *   apex went in twice. That reached the three-vertex count and finished the draw with
 *   a leg of zero length — no V to open, and the tip handle sitting exactly on the
 *   apex handle.
 *
 * Both are repaired here rather than in either renderer, which is what makes the two
 * agree: the same drawn clicks now produce the same stored base whichever engine
 * collected them.
 */

import {normalizeDrawnBase} from './core/drawnBase';
import {isRectangular} from './core/handles';
import {TacticalGraphicName} from './core/type';

const APEX = [10, 0];
const TIP = [0, 0];

describe('normalizeDrawnBase', () => {
    it('materialises the leg a two-point fields-of-fire only implied', () => {
        const normalized = normalizeDrawnBase(TacticalGraphicName.FieldsOfFire, [TIP, APEX]);
        expect(normalized).toHaveLength(3);
        // The apex stays in the middle — the layout the generator and the handles read.
        expect(normalized[0]).toEqual(TIP);
        expect(normalized[1]).toEqual(APEX);
    });

    it('drops the repeated click a double-click adds, then completes the V', () => {
        // What MapLibre collected: the apex twice, giving a leg of zero length.
        const normalized = normalizeDrawnBase(TacticalGraphicName.FieldsOfFire, [TIP, APEX, APEX]);
        expect(normalized).toHaveLength(3);
        expect(normalized[2]).not.toEqual(APEX);
    });

    it('gives the same base whichever engine collected the clicks', () => {
        const fromOpenLayers = normalizeDrawnBase(TacticalGraphicName.FieldsOfFire, [TIP, APEX]);
        const fromMapLibre = normalizeDrawnBase(TacticalGraphicName.FieldsOfFire, [TIP, APEX, APEX]);
        expect(fromMapLibre).toEqual(fromOpenLayers);
    });

    it('leaves a fields-of-fire the user drew in full alone', () => {
        const drawn = [TIP, APEX, [20, 5]];
        expect(normalizeDrawnBase(TacticalGraphicName.FieldsOfFire, drawn)).toEqual(drawn);
    });

    it('opens a V wide enough to read as one', () => {
        const [tip, apex, swung] = normalizeDrawnBase(TacticalGraphicName.FieldsOfFire, [TIP, APEX]);
        const bearing = (from: number[], to: number[]) => Math.atan2(to[0] - from[0], to[1] - from[1]) * 180 / Math.PI;
        const between = Math.abs(bearing(apex, tip) - bearing(apex, swung));
        expect(between).toBeGreaterThan(45);
    });

    it('does not touch a graphic with nothing to tidy', () => {
        const drawn = [[0, 0], [1, 1], [2, 2]];
        expect(normalizeDrawnBase(TacticalGraphicName.PhaseLine, drawn)).toEqual(drawn);
    });

    it('leaves a closed ring closed', () => {
        // A polygon's first and last vertex are equal on purpose; de-duplicating the
        // pair would open the ring.
        const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
        expect(normalizeDrawnBase(TacticalGraphicName.AssemblyArea, ring)).toEqual(ring);
    });

    it('is safe on a base too short to mean anything yet', () => {
        expect(normalizeDrawnBase(TacticalGraphicName.FieldsOfFire, [TIP])).toEqual([TIP]);
        expect(normalizeDrawnBase(TacticalGraphicName.FieldsOfFire, [])).toEqual([]);
    });
});

/**
 * The rectangles, which are a shape rule rather than a tidy-up, but fail the same way
 * when only one engine knows about them: OpenLayers withdrew them from its Modify
 * interaction and MapLibre could not see that, so a corner could be dragged to any
 * angle and — once a segment drag could add vertices — a rectangle could grow a fifth.
 */
describe('isRectangular', () => {
    const names = Object.values(TacticalGraphicName);

    it('is every rectangular area variant and nothing else', () => {
        const flagged = names.filter(isRectangular);
        const named = names.filter(name => String(name).endsWith('Rectangular'));
        expect([...flagged].sort()).toEqual([...named].sort());
    });

    it('covers the fourteen the registry draws as boxes', () => {
        expect(names.filter(isRectangular)).toHaveLength(14);
    });

    it('does not catch the irregular or circular variants of the same areas', () => {
        expect(isRectangular(TacticalGraphicName.FreeFireAreaCircular)).toBe(false);
        expect(isRectangular(TacticalGraphicName.AirSpaceCoordinationAreaIrregular)).toBe(false);
        expect(isRectangular(TacticalGraphicName.AssemblyArea)).toBe(false);
    });
});
