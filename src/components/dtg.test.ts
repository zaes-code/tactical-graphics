/**
 * DTG formatting.
 *
 * The dialog wrote a four-digit year (`021200ZJUN2026`) until 2026-08-03, against both
 * FM 1-02.2's plates and the README's own documented example. The fix has to write two
 * digits *and* keep reading four, because every graphic drawn before it carries the long
 * form — and a parser that rejected those would not just fail to show a date, it would
 * blank the input and write that blank back on save.
 */
import {dateTimeLocalToDtg, dtgToDateTimeLocal, nowDtg} from './dtg';

describe('dateTimeLocalToDtg', () => {
    it('writes a two-digit year', () => {
        expect(dateTimeLocalToDtg('2026-06-02T12:00')).toBe('021200ZJUN26');
    });

    it('keeps every other field zero-padded', () => {
        expect(dateTimeLocalToDtg('2026-01-05T04:07')).toBe('050407ZJAN26');
    });

    it('handles the turn of a century without widening the field', () => {
        expect(dateTimeLocalToDtg('2000-12-31T23:59')).toBe('312359ZDEC00');
        expect(dateTimeLocalToDtg('2009-03-01T00:00')).toBe('010000ZMAR09');
    });

    it('returns empty for anything that is not a datetime-local value', () => {
        expect(dateTimeLocalToDtg('')).toBe('');
        expect(dateTimeLocalToDtg('2026-06-02')).toBe('');
        expect(dateTimeLocalToDtg('nonsense')).toBe('');
    });
});

describe('dtgToDateTimeLocal', () => {
    it('reads the two-digit year it now writes', () => {
        expect(dtgToDateTimeLocal('021200ZJUN26')).toBe('2026-06-02T12:00');
    });

    it('still reads the four-digit year older graphics carry', () => {
        // Not cosmetic: an unparsed DTG leaves the input empty, and saving the dialog
        // writes that emptiness over a date the user never touched.
        expect(dtgToDateTimeLocal('021200ZJUN2026')).toBe('2026-06-02T12:00');
    });

    it('rejects a malformed month rather than guessing one', () => {
        expect(dtgToDateTimeLocal('021200ZXXX26')).toBe('');
    });

    it('returns empty for anything that is not a DTG', () => {
        expect(dtgToDateTimeLocal('')).toBe('');
        expect(dtgToDateTimeLocal('021200JUN26')).toBe('');
        expect(dtgToDateTimeLocal('2026-06-02T12:00')).toBe('');
    });
});

describe('round trip', () => {
    it('survives datetime → DTG → datetime', () => {
        for (const value of ['2026-06-02T12:00', '2026-01-05T04:07', '2031-11-30T23:59']) {
            expect(dtgToDateTimeLocal(dateTimeLocalToDtg(value))).toBe(value);
        }
    });

    it('normalizes an old four-digit DTG to the short form on the way back out', () => {
        expect(dateTimeLocalToDtg(dtgToDateTimeLocal('021200ZJUN2026'))).toBe('021200ZJUN26');
    });
});

describe('nowDtg', () => {
    it('produces a DTG the parser accepts, with a two-digit year', () => {
        const dtg = nowDtg();
        expect(dtg).toMatch(/^\d{6}Z[A-Z]{3}\d{2}$/);
        expect(dtgToDateTimeLocal(dtg)).not.toBe('');
    });
});
