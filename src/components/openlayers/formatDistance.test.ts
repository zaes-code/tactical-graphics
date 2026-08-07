/**
 * The measure line and the properties dialog report the same quantity to the same
 * reader, so they share one formatter. These pin the boundaries it turns on.
 */
import {formatDistance} from './openlayerStyles';

describe('formatDistance', () => {
    it.each([
        [0, '0 m'],
        [1, '1 m'],
        [400, '400 m'],
        [999, '999 m'],
        [999.6, '1000 m'],   // rounds within metres rather than jumping to km
    ])('shows %d m as metres', (metres, expected) => {
        expect(formatDistance(metres)).toBe(expected);
    });

    it.each([
        [1000, '1.0 km'],
        [1500, '1.5 km'],
        [9949, '9.9 km'],
        [10_000, '10 km'],   // one decimal stops meaning anything past here
        [117_407, '117 km'],
    ])('shows %d m as kilometres', (metres, expected) => {
        expect(formatDistance(metres)).toBe(expected);
    });

    it('switches to kilometres exactly at 1 km, not before', () => {
        expect(formatDistance(999.4)).toMatch(/ m$/);
        expect(formatDistance(1000)).toMatch(/ km$/);
    });
});
