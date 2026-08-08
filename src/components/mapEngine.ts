import type {TacticalGraphicHostility, TacticalGraphicName} from '@zaes/tactical-graphics';
import type {InteractionType} from './openlayers/TacticalGraphicsManager';

/**
 * # What the controls panel needs from a map, whichever engine drew it
 *
 * `MapControls` used to live inside `OpenLayers.tsx` and call its manager
 * directly, which is why the MapLibre view had no panel at all. This is the seam
 * that lets one panel drive either engine: each view builds a handle and hands it
 * up, and the panel talks to the handle.
 *
 * ## Capabilities are declared, not guessed
 *
 * The two engines are not equally finished — MapLibre has no draw or edit
 * interaction, because MapLibre ships no `Draw`/`Modify` equivalent and
 * re-implementing the five controllers is its own piece of work. So a handle says
 * what it supports and the panel **disables** what it does not, with the reason on
 * the tooltip.
 *
 * That is deliberately not the same as hiding the controls. A greyed button with
 * "MapLibre has no draw interaction yet" tells you the state of the port; a
 * missing button reads as a different app, and a live button that silently does
 * nothing is the worst of the three.
 */
export interface MapEngineCapabilities {
    /** Can place a new graphic by drawing on the map. */
    draw: boolean;
    /** Can rotate / resize / translate / modify an existing graphic. */
    edit: boolean;
    /** Can draw the sample sweep. */
    samples: boolean;
    /** Can serialise the map to GeoJSON and restore it. */
    io: boolean;
    /** Shown on the disabled controls. One short sentence. */
    unsupportedReason?: string;
}

/** The operations `MapControls` can invoke, implemented once per engine. */
export interface MapEngineHandle {
    capabilities: MapEngineCapabilities;

    /** Begin drawing `name`. No-op when `capabilities.draw` is false. */
    startDrawing(name: TacticalGraphicName): void;
    /** Switch the edit mode. No-op when `capabilities.edit` is false. */
    setInteractionMode(mode: InteractionType): void;

    /** Remove everything and return to view mode. */
    reset(): void;
    /** Draw the sample sweep, optionally forcing one hostility. */
    drawSamples(hostility?: TacticalGraphicHostility): void;
    clearAll(): void;

    exportGeoJson(): void;
    importGeoJson(file: File): Promise<void>;
}

/**
 * What a fully-featured engine declares. OpenLayers passes this; MapLibre
 * overrides the two it cannot do yet.
 */
export const FULL_CAPABILITIES: MapEngineCapabilities = {
    draw: true,
    edit: true,
    samples: true,
    io: true,
};
