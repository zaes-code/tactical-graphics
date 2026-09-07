/**
 * # 200700's read-out names the ring the hand is on
 *
 * The inherited read-out reports `size`, which for a fan is the *outermost* range — so every
 * drag but the last one named the wrong ring, and dragging the start range showed the stop
 * range's figure sitting still while the arc under the cursor moved. A user reported the
 * read-out missing entirely during an edit: the manager arms it for a resize and for a width
 * drag, and a band drag is neither. (2026-09-05.)
 *
 * Both halves are asserted here — that a range grip arms it and names its ring, and that the
 * opening grip does not arm it at all, because it swings an angle and the read-out formats a
 * distance.
 */
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {RangeFanGraphicBase} from './graphics/RangeFanGraphicBase';

/** Reaches the protected read-out hooks the way the style function reads their output. */
interface Readout {
    measuringBand?: number;
    measureStated(): number;
    measureCaption(): string | undefined;
    graphicLabels: {designation: string; rangeFan?: {bands: {range: number}[]}};
    /** 200700's four numbers — what it is described and saved by. @see RangeFanGraphicBase */
    radar?: {searchAxisAzimuthDeg: number; startRange?: number; stopRange: number; stopRelativeBearingDeg: number};
    size: number;
}

const holder = (): Readout => {
    const h = new RangeFanGraphicBase(TacticalGraphicName.RadarSearchDoctrine, 60_000, 1000) as unknown as Readout;
    // The four values, not a fan's bands — 200700 stopped borrowing that shape on 2026-09-05.
    h.radar = {searchAxisAzimuthDeg: 90, startRange: 20_000, stopRange: 60_000, stopRelativeBearingDeg: 45};
    h.graphicLabels = {designation: ''};
    h.size = 60_000;
    return h;
};

describe('the radar search doctrine read-out', () => {
    it('reports the start range, named, while the near grip is dragged', () => {
        const h = holder();
        h.measuringBand = 0;
        expect(h.measureStated()).toBe(20_000);
        expect(h.measureCaption()).toBe('Start');
    });

    it('reports the stop range, named, while the far grip is dragged', () => {
        const h = holder();
        h.measuringBand = 1;
        expect(h.measureStated()).toBe(60_000);
        expect(h.measureCaption()).toBe('Stop');
    });

    it('falls back to the graphic size when no band is being dragged', () => {
        // Which is what a plain resize is: no ring in particular, the symbol as a whole.
        const h = holder();
        h.measuringBand = undefined;
        expect(h.measureStated()).toBe(60_000);
        expect(h.measureCaption()).toBeUndefined();
    });

    it('leaves a weapon fan its bare figure, because its rings have no doctrinal names', () => {
        // 200700's two are named individually by its plate; a fan's are an arbitrary stack.
        const fan = new RangeFanGraphicBase(TacticalGraphicName.WeaponSensorRangeFanSector, 60_000, 1000) as unknown as Readout;
        fan.graphicLabels = {designation: '', rangeFan: {bands: [{range: 20_000}, {range: 60_000}]}};
        fan.size = 60_000;
        fan.measuringBand = 0;
        expect(fan.measureStated()).toBe(20_000);
        expect(fan.measureCaption()).toBeUndefined();
    });
});
