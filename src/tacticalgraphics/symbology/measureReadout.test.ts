/**
 * # What the read-out says while a gesture is running
 *
 * The measure line reports its own length, which is the right answer for every graphic
 * dragged out by a radius and no answer at all for one described in degrees. 200700's plate
 * names four numbers and two of them are angles — the search axis and the stop relative
 * bearing — so the grips that set those showed nothing. (User's call, 2026-09-10.)
 *
 * Both renderers assemble this text, so the assembly is here and each engine calls it.
 */
import {formatBearing, measureReadout, RADAR_READOUT_CAPTIONS} from '../core/symbology';

describe('a bearing for a user to read', () => {
    it.each([
        {degrees: 0, text: '000°'},
        {degrees: 43, text: '043°'},
        {degrees: 359.6, text: '000°'},
        {degrees: 405, text: '045°'},
        {degrees: -30, text: '330°'},
    ])('writes $degrees as $text', ({degrees, text}) => {
        expect(formatBearing(degrees)).toBe(text);
    });
});

describe('the read-out text', () => {
    it('names the figure when the caption says what it is', () => {
        expect(measureReadout([{caption: RADAR_READOUT_CAPTIONS.startRange, meters: 25_000}])).toBe('Start 25 km');
    });

    it('leaves a single figure unnamed, as a circle has always shown it', () => {
        expect(measureReadout([{meters: 400}])).toBe('400 m');
    });

    it('states an angle where the gesture swings one', () => {
        expect(measureReadout([{caption: RADAR_READOUT_CAPTIONS.azimuth, degrees: 43}])).toBe('Azimuth 043°');
    });

    /** One click can set two of the four, which is why this takes a list. */
    it('joins the two numbers one click sets', () => {
        expect(
            measureReadout([
                {caption: RADAR_READOUT_CAPTIONS.azimuth, degrees: 43},
                {caption: RADAR_READOUT_CAPTIONS.stopRange, meters: 60_000},
            ]),
        ).toBe('Azimuth 043° · Stop 60 km');
    });

    it('drops a part with no figure rather than printing an empty caption', () => {
        expect(measureReadout([{caption: 'Azimuth'}, {caption: 'Stop', meters: 60_000}])).toBe('Stop 60 km');
        expect(measureReadout([{caption: 'Start', meters: Number.NaN}])).toBe('');
    });

    /** An angle wins within one part: a part states one figure, not two. */
    it('prefers the angle when a part carries both', () => {
        expect(measureReadout([{caption: 'Bearing', degrees: 30, meters: 1_000}])).toBe('Bearing 030°');
    });
});
