/**
 * # Which graphics are showing their name only — the app's business, not the library's
 *
 * `hideAmplifiers` says nothing about what a symbol *is*. Two identical corridors side by
 * side may reasonably differ; the same corridor may be annotated on one map and bare on
 * another; and none of it should travel in a file another operator opens. So it is not a
 * field on the portable description — it is a **renderer input** the host supplies, and
 * this is the host half of that: a set of graphic ids, kept where this app keeps the rest
 * of its view state.
 *
 * It lived on the graphic's property bag until 2026-08-30, which meant saving a graphic
 * saved somebody's display preference along with it. (User's call.)
 *
 * Local storage because this demo has nowhere else; a real host would put it wherever its
 * per-user state already lives — a store, a URL, a workspace record. The library does not
 * care, and that is the point.
 *
 * @see PaintFeature.hideAmplifiers — where the flag is read
 */

const KEY = 'tacticalGraphics.hiddenAmplifiers';

/** Reading is wrapped because a private window, or a browser set to block site data, throws. */
function read(): Set<string> {
    try {
        const raw = window.localStorage.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
    } catch {
        return new Set();
    }
}

function write(ids: Set<string>): void {
    try {
        const list: string[] = [];
        ids.forEach(id => list.push(id));
        window.localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
        // Storage is unavailable. The toggle still works for this session — it is the
        // remembering that is lost, and losing it is better than failing the toggle.
    }
}

/** Whether this graphic is currently drawn name-only. */
export function amplifiersHidden(id: string): boolean {
    return read().has(id);
}

/** Records the choice. Returns what was recorded, for a caller stamping features. */
export function setAmplifiersHidden(id: string, hidden: boolean): boolean {
    const ids = read();
    if (hidden) ids.add(id);
    else ids.delete(id);
    write(ids);
    return hidden;
}

/** Every graphic currently set to name-only, for re-stamping after a restore. */
export function hiddenAmplifierIds(): ReadonlySet<string> {
    return read();
}

/** Forgets every choice. Used when the map is cleared. */
export function forgetAmplifierVisibility(): void {
    write(new Set());
}
