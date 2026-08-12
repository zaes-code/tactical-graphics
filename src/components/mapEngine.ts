import type {EditMode, EngineCapabilities, TacticalGraphicHostility, TacticalGraphicsEngine} from '@zaes/tactical-graphics';
import type {FeatureCollection} from 'geojson';

/**
 * # What the controls panel needs from a map, whichever engine drew it
 *
 * Almost all of it now comes from the library. `TacticalGraphicsEngine` is the shared
 * façade both subpaths return from `createTacticalGraphics`, and it carries every verb
 * that is genuinely about tactical graphics: draw, edit mode, clear, snapshot, restore,
 * refresh, destroy.
 *
 * **This interface used to be the whole thing, and that was the bug.** It was
 * discovered here, in the demo — one layer above the library — where only one consumer
 * could see it, which is precisely the misplacement behind every renderer parity defect
 * found this week. Promoting it left this file holding only what is genuinely the
 * *application's*: drawing a demo gallery, and moving GeoJSON in and out of the user's
 * filesystem. Neither is a verb a symbology library owes its host.
 *
 * ## Capabilities are declared, not guessed
 *
 * An engine says what it supports and the panel **disables** what it does not, with the
 * reason on the tooltip. That is deliberately not the same as hiding the controls: a
 * grayed button with a reason tells you the state of the port, a missing button reads
 * as a different app, and a live button that silently does nothing is the worst of the
 * three. Both engines currently declare everything true; the shape stays because a
 * third renderer will arrive unfinished.
 */

/** The library's capability set, plus the demo-only pieces the panel also gates on. */
export interface MapEngineCapabilities extends EngineCapabilities {
    /** Can draw the sample sweep. Demo-only — the gallery is not part of the library. */
    samples: boolean;
}

/**
 * The operations `MapControls` can invoke.
 *
 * Everything not listed here comes from {@link TacticalGraphicsEngine}, unchanged — the
 * panel calls `startDrawing`, `setInteractionMode`, `snapshot` and the rest straight
 * through to the library's façade.
 */
export interface MapEngineHandle extends TacticalGraphicsEngine {
    capabilities: MapEngineCapabilities;

    /**
     * Remove everything and return to view mode.
     *
     * Kept beside the library's `clearAll` because the panel offers both buttons; they
     * do the same thing, which is worth saying out loud rather than hiding behind two
     * names. @see MapControls
     */
    reset(): void;

    /** Draw the sample sweep, optionally forcing one hostility. */
    drawSamples(hostility?: TacticalGraphicHostility): void;

    /** Downloads the map as a `.geojson` file. The on-disk twin of `snapshot`. */
    exportGeoJson(): void;

    /** Replaces the map from a file the user picked. The on-disk twin of `restore`. */
    importGeoJson(file: File): Promise<void>;
}

/** What a fully-featured engine declares. Both engines pass this today. */
export const FULL_CAPABILITIES: MapEngineCapabilities = {
    draw: true,
    edit: true,
    samples: true,
    io: true,
};

/** Re-exported so the demo's own files name one type. @see TacticalGraphicsEngine */
export type {EditMode, FeatureCollection};
