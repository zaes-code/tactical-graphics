/**
 * # A read-out nobody can see is not a read-out
 *
 * OpenLayers lays line-placed text along its geometry and drops it when the glyphs run past
 * the ends. The radar search doctrine's label carries an azimuth and a range — 201 px of
 * text — so it appeared only once the drag had passed 201 px, and every shorter gesture drew
 * nothing at all. *"As I draw, I see nothing until the line is long enough to fit the
 * contents."* (User's report, 2026-09-10.)
 *
 * The text fits itself to the line now, down to a floor. Both engines shrink by the same
 * rule, so the two state the same number at the same size.
 */
import {MEASURE_READOUT_MIN_SCALE, measureReadoutScale} from '../core/symbology';

describe('fitting a read-out to its line', () => {
    it('leaves a label that already fits at full size', () => {
        expect(measureReadoutScale(80, 400)).toBe(1);
    });

    it('shrinks a label wider than its line', () => {
        // 0.95 of a 120 px line over 200 px of text.
        expect(measureReadoutScale(200, 120)).toBeCloseTo(0.57, 2);
    });

    it('stops at the floor rather than shrinking to nothing', () => {
        expect(measureReadoutScale(200, 20)).toBe(MEASURE_READOUT_MIN_SCALE);
    });

    /** A caller that has no measurement gets its own scale back, not a guess. */
    it.each([
        [0, 400],
        [200, 0],
        [Number.NaN, 400],
    ])('passes the desired scale through when it cannot measure (%s, %s)', (textPx, linePx) => {
        expect(measureReadoutScale(textPx, linePx, 1)).toBe(1);
    });

    it('never raises a scale the caller asked to be smaller', () => {
        expect(measureReadoutScale(10, 10_000, 0.75)).toBe(0.75);
    });
});
