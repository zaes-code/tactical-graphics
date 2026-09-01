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

/**
 * The two clicks a user makes, in the order APP-06 numbers them: the **vertex** first
 * ("Point 1 defines the vertex of the symbol. Points 2 and 3 define the tips of the
 * arrowheads", 140500), then one leg's end. The repeated click a double-click leaves
 * behind is therefore the *leg*, not the vertex. @see drawOrder.ts
 */
const VERTEX = [0, 0];
const LEG = [10, 0];

describe('normalizeDrawnBase', () => {
    it('materialises the leg a two-point fields-of-fire only implied', () => {
        const normalized = normalizeDrawnBase(TacticalGraphicName.FieldsOfFire, [VERTEX, LEG]);
        expect(normalized).toHaveLength(3);
        // Both drawn clicks survive where they were made, and the synthesized leg is
        // added after them: `[vertex, leg, leg]`, the order the base is stored in.
        expect(normalized[0]).toEqual(VERTEX);
        expect(normalized[1]).toEqual(LEG);
    });

    it('drops the repeated click a double-click adds, then completes the V', () => {
        // What MapLibre collected: the closing click twice, giving a leg of zero length.
        const normalized = normalizeDrawnBase(TacticalGraphicName.FieldsOfFire, [VERTEX, LEG, LEG]);
        expect(normalized).toHaveLength(3);
        expect(normalized[2]).not.toEqual(LEG);
    });

    it('gives the same base whichever engine collected the clicks', () => {
        const fromOpenLayers = normalizeDrawnBase(TacticalGraphicName.FieldsOfFire, [VERTEX, LEG]);
        const fromMapLibre = normalizeDrawnBase(TacticalGraphicName.FieldsOfFire, [VERTEX, LEG, LEG]);
        expect(fromMapLibre).toEqual(fromOpenLayers);
    });

    it('leaves a fields-of-fire the user drew in full alone', () => {
        const drawn = [VERTEX, LEG, [20, 5]];
        expect(normalizeDrawnBase(TacticalGraphicName.FieldsOfFire, drawn)).toEqual(drawn);
    });

    it('opens a V wide enough to read as one', () => {
        // Measured at the vertex, which is the point the two legs are swung about.
        const [vertex, leg, swung] = normalizeDrawnBase(TacticalGraphicName.FieldsOfFire, [VERTEX, LEG]);
        const bearing = (from: number[], to: number[]) => Math.atan2(to[0] - from[0], to[1] - from[1]) * 180 / Math.PI;
        const between = Math.abs(bearing(vertex, leg) - bearing(vertex, swung));
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
        expect(normalizeDrawnBase(TacticalGraphicName.FieldsOfFire, [VERTEX])).toEqual([VERTEX]);
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

    it('is every rectangular area variant except the target, which is not one', () => {
        /*
         * The name is not the rule, and this is the one place the two part company. A
         * "Rectangular" suffix says the *shape* is a box; `isRectangular` says the **base
         * is an axis** — two anchor points and a width across them. APP-06 240802 gives the
         * rectangular target one anchor point and states its length, width and attitude as
         * amplifiers, so it draws a box without being built like one.
         *
         * Spelled out rather than relaxed to a subset check: an accidental drop-out of this
         * set is exactly the sort of thing this test exists to catch, so the exception has
         * to be named to pass. @see RectangularTarget
         */
        const flagged = names.filter(isRectangular);
        const named = names.filter(name => String(name).endsWith('Rectangular') && name !== TacticalGraphicName.TargetAreaRectangular);
        expect([...flagged].sort()).toEqual([...named].sort());
    });

    it('covers the seventeen the registry draws as boxes', () => {
        // Seventeen, not eighteen: the rectangular target left this set in 3.2.0. Its plate
        // takes one anchor point and builds the box from its length, width and attitude, so
        // it is not "two anchor points and a width" like the rest. @see RectangularTarget
        expect(names.filter(isRectangular)).toHaveLength(17);
        expect(isRectangular(TacticalGraphicName.TargetAreaRectangular)).toBe(false);
    });

    it('does not catch the irregular or circular variants of the same areas', () => {
        expect(isRectangular(TacticalGraphicName.FreeFireAreaCircular)).toBe(false);
        expect(isRectangular(TacticalGraphicName.AirSpaceCoordinationAreaIrregular)).toBe(false);
        expect(isRectangular(TacticalGraphicName.AssemblyArea)).toBe(false);
    });
});
