/**
 * True for `null`, `undefined`, `''`, and `[]`.
 *
 * Replaces the single lodash function this app used. lodash was dropped as a
 * dependency: `4.17.21` carries CVE-2025-13465 (prototype pollution in `_.unset`
 * / `_.omit`), and `4.18.0` — the fix — ships a broken `lodash/template`, which
 * `html-webpack-plugin` calls at build time (`ReferenceError: assignWith is not
 * defined`). Neither version was usable, and the whole dependency existed for
 * seven `_.isEmpty` calls.
 *
 * Deliberately narrower than lodash's `isEmpty`: it does not walk plain objects
 * or Maps, because nothing here needed that. Widen it when something does.
 */
export function isEmpty(value: string | readonly unknown[] | null | undefined): boolean {
    return value == null || value.length === 0;
}
