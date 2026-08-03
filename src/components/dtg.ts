/**
 * Date-time group formatting, for the demo's properties dialog.
 *
 * A DTG is `DDHHMMZMONYY` — `021200ZJUN26` is 02 June 2026 at 12:00 Zulu. **Two digits
 * of year**, which is what FM 1-02.2 prints on every plate and what the README has
 * always documented; the dialog wrote four (`021200ZJUN2026`) until 2026-08-03, so every
 * graphic drawn before then carries the long form.
 *
 * Lives here rather than inside the dialog component so it can be tested without
 * mounting MUI, and next to the dialog rather than in the library because it is the
 * *demo's* input format: the library carries these strings as opaque amplifier text and
 * never parses them.
 */

const DTG_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * The century a two-digit year belongs to.
 *
 * Fixed rather than a sliding window: a window quietly reinterprets a stored value as
 * the clock passes it, so the same saved graphic would read as a different date next
 * decade. A planning tool that needs 1900s dates has bigger problems than this constant.
 */
const DTG_CENTURY = 2000;

/** Accepts the two-digit year we write and the four-digit one older graphics carry. */
const DTG_PATTERN = /^(\d{2})(\d{2})(\d{2})Z([A-Z]{3})(\d{2}|\d{4})$/;

/** Now, as a DTG. */
export function nowDtg(): string {
    const d = new Date();
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${dd}${hh}${mm}Z${DTG_MONTHS[d.getUTCMonth()]}${twoDigitYear(d.getUTCFullYear())}`;
}

function twoDigitYear(year: number): string {
    return String(year % 100).padStart(2, '0');
}

/**
 * DTG → datetime-local value (`021200ZJUN26` → `2026-06-02T12:00`).
 *
 * Reads the four-digit form too. Dropping it would not merely fail to display an older
 * graphic's date — the input would come up empty, and saving the dialog would write that
 * emptiness back over a value the user never touched.
 */
export function dtgToDateTimeLocal(dtg: string): string {
    const m = dtg.match(DTG_PATTERN);
    if (!m) return '';
    const [, dd, hh, min, mon, year] = m;
    const monthIdx = DTG_MONTHS.indexOf(mon);
    if (monthIdx < 0) return '';
    const month = String(monthIdx + 1).padStart(2, '0');
    const yyyy = year.length === 4 ? year : String(DTG_CENTURY + parseInt(year, 10));
    return `${yyyy}-${month}-${dd}T${hh}:${min}`;
}

/** datetime-local value → DTG (`2026-06-02T12:00` → `021200ZJUN26`). */
export function dateTimeLocalToDtg(value: string): string {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!m) return '';
    const [, yyyy, month, dd, hh, min] = m;
    const mon = DTG_MONTHS[parseInt(month, 10) - 1];
    if (!mon) return '';
    return `${dd}${hh}${min}Z${mon}${twoDigitYear(parseInt(yyyy, 10))}`;
}
