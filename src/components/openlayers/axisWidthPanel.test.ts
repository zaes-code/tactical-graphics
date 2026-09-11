/**
 * # The width the eleven axis arrows show in the panel
 *
 * Their width is a **coordinate** as of 2026-09-10, not an amplifier, so nothing filed beside
 * the base carries it and `readGraphicGeometryState` — which reads that bag — has nothing to
 * report. The figure is still worth showing: the operator drags it, and the panel already draws
 * a read-out for exactly that case, with its own reason for not offering an input beside it.
 *
 * > "A user sizes a graphic by dragging it, and the hashed measure line reports the number live
 * > while they do. Showing them here as text closes the loop — you can check the figure you
 * > dragged to — without a second way to set it that would have to be kept in step with the
 * > geometry."
 *
 * So the field is on and `widthTyped` is off, which is the read-out form, and the number is
 * derived from the base on the way to the panel. @see widthFromBase, halfWidthFromBase
 */
import {TacticalGraphicName, carriesWidthPointInBase, listTacticalGraphicNames} from '@zaes/tactical-graphics';
import {getGraphicFields} from './graphicFieldRegistry';

const FAMILY = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(carriesWidthPointInBase);

describe('the axis arrows offer a width read-out', () => {
    it('has all eleven of them', () => {
        expect(FAMILY).toHaveLength(11);
    });

    it.each(FAMILY.map(n => [String(n), n] as const))('%s shows it, and offers no input', (_label, name) => {
        const fields = getGraphicFields(name);
        expect(fields.width).toBe(true);
        expect(fields.widthTyped ?? false).toBe(false);
    });

    /**
     * **The three direction-of-attack graphics shared the axis family's preset and do not share
     * this.** Their width is still an amplifier, and `width` on a graphic the panel can find no
     * measured value for renders as the typed *input* rather than the read-out — so handing
     * them the same preset would have added a box that changes nothing.
     */
    it.each([
        TacticalGraphicName.DirectionOfMainAttack,
        TacticalGraphicName.DirectionOfMainAttackFeint,
        TacticalGraphicName.AviationDirectionOfAttack,
    ])('%s is left alone', name => {
        expect(carriesWidthPointInBase(name)).toBe(false);
        expect(getGraphicFields(name).width).toBe(false);
    });
});
