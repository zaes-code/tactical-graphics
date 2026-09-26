/**
 * # Which graphics are showing their name only: the demo's memory of it
 *
 * `hideAmplifiers` says nothing about what a symbol *is*. Two identical corridors side by
 * side may reasonably differ; the same corridor may be annotated on one map and bare on
 * another; and none of it should travel in a file another operator opens. So it is not a
 * field on the portable description. It is view state, and the library's engines hold it
 * only in memory, on the graphic as drawn: `engine.setAmplifiersHidden(id, hidden)` and
 * `engine.amplifiersHidden(id)`. A restore rebuilds every graphic in full.
 *
 * This file is the host half: **the demo app's** own record of the choice, kept where this
 * app keeps the rest of its view state, and re-applied after every restore so it survives a
 * reload and an engine switch. It is not published. Until 2026-09-25 it was imported by both
 * published renderers, which meant the library read and wrote a key in its host's local
 * storage, and a host that set the choice any other way lost it on the next restore.
 *
 * Local storage because this demo has nowhere else; a real host would put it wherever its
 * per-user state already lives: a store, a URL, a workspace record. The library does not
 * care, and that is the point.
 *
 * @see TacticalGraphicsEngine.setAmplifiersHidden, PaintFeature.hideAmplifiers
 */

import type {FeatureCollection} from 'geojson';
import type {TacticalGraphicsEngine} from '@zaes/tactical-graphics';

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
        // Storage is unavailable. The toggle still works for this session: it is the
        // remembering that is lost, and losing it is better than failing the toggle.
    }
}

/** Whether the demo remembers this graphic as drawn name-only. */
export function rememberedAmplifiersHidden(id: string): boolean {
    return read().has(id);
}

/** Records the choice. Returns what was recorded. */
export function rememberAmplifiersHidden(id: string, hidden: boolean): boolean {
    const ids = read();
    if (hidden) ids.add(id);
    else ids.delete(id);
    write(ids);
    return hidden;
}

/** Every graphic the demo remembers as name-only. */
export function rememberedAmplifierIds(): ReadonlySet<string> {
    return read();
}

/** Forgets every choice. */
export function forgetAmplifierVisibility(): void {
    write(new Set());
}

/** Hands every remembered choice to an engine, as a host does after a restore. */
export function reapplyAmplifierVisibility(engine: Pick<TacticalGraphicsEngine, 'setAmplifiersHidden'>): void {
    read().forEach(id => engine.setAmplifiersHidden?.(id, true));
}

/**
 * The engine, with the demo's memory of "name only" wired in.
 *
 * A restore is followed by re-applying every remembered choice, because the engine draws
 * a restored graphic in full; and a choice set through the engine is recorded on the way
 * through. Everything else is the engine's own verb, untouched.
 */
export function rememberAmplifierVisibility<E extends TacticalGraphicsEngine>(engine: E): E {
    return {
        ...engine,
        restore(snapshot: FeatureCollection) {
            engine.restore(snapshot);
            reapplyAmplifierVisibility(engine);
        },
        setAmplifiersHidden(id: string, hidden: boolean) {
            rememberAmplifiersHidden(id, hidden);
            engine.setAmplifiersHidden?.(id, hidden);
        },
    };
}
