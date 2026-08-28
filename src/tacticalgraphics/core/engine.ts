/**
 * # One set of verbs, whichever engine draws
 *
 * The library ships two renderers. Until now they were also two **integrations**:
 * OpenLayers gave you a `TacticalGraphicsManager` that owned everything, MapLibre made
 * you assemble a `NativeLayerRenderer` and a `MapLibreInteractions` yourself, and a
 * consumer who switched engines rewrote their wiring. The portable half of this
 * library stops at the data if the code around it is not portable too.
 *
 * So both subpaths export a `createTacticalGraphics(map, options)` that returns this
 * interface. The import line changes; nothing else does:
 *
 * ```ts
 * import {createTacticalGraphics} from '@zaes/tactical-graphics/openlayers';
 * // ...or
 * import {createTacticalGraphics} from '@zaes/tactical-graphics/maplibre';
 *
 * const graphics = createTacticalGraphics(map);
 * graphics.startDrawing(TacticalGraphicName.PhaseLine);
 * const saved = graphics.snapshot();
 * ```
 *
 * ## What this deliberately does not do
 *
 * It does not make the two renderers share an implementation, and it should not try.
 * OpenLayers retains mutable features and edits them in place; MapLibre derives GeoJSON
 * sources and throws them away on the next rebuild. Those are different rendering
 * models, and the engine-specific objects stay available for anyone who needs to reach
 * past this. What was wrong was never that the internals differed — it was that a
 * consumer had to *care*.
 *
 * It also stops at the library's edge. Downloading a file, picking a hostility for a
 * sample sweep and drawing a demo gallery are application concerns that happen to have
 * lived beside the engines; they are not verbs a symbology library owes its host.
 *
 * @see mapEngine.ts in the demo, which is where this interface was discovered — one
 * layer too high, where only one consumer could see it.
 */

import type {FeatureCollection} from 'geojson';
import type {AllowedGestures} from './symbology';
import type {TacticalGraphicName} from './type';

/**
 * What a drag currently means.
 *
 * A string union rather than an enum, so the value is the same across both renderers,
 * survives a round trip through JSON, and reads in a debugger. The OpenLayers layer
 * keeps its numeric `InteractionType` internally and translates at this boundary.
 *
 * - `view` — no gesture; clicking selects.
 * - `edit` — **the one mode a host needs.** Clicking selects; the selected graphic
 *   wears its handles and its {@link SelectionBox}, and every gesture is reachable
 *   from there. @see GestureKind
 * - `translate` — drag moves the graphic bodily.
 * - `rotate` / `resize` — drag turns or scales it about its anchor.
 * - `modify` — drag reshapes it: move a vertex, or add one on a segment.
 * - `drawing` — a draw is in progress. Set by `startDrawing`, not by a host.
 *
 * ## Why `edit` exists beside the four it subsumes
 *
 * The four gesture modes are *global*: a host puts the whole map into "rotate", and
 * every graphic on it wears handles that only turn. That makes the toolbar, not the
 * graphic, the thing the operator is manipulating — they pick a verb, then hunt for a
 * noun, and a symbol that refuses the verb they picked simply does nothing.
 *
 * `edit` inverts it. The operator picks the graphic, and the graphic offers the verbs
 * it accepts. The four stay in the union because they are published surface and
 * because they are still what a *drag* means once one has begun — `beginGesture`
 * switches into one for the duration of a drag and returns here after.
 */
export type EditMode = 'view' | 'edit' | 'translate' | 'rotate' | 'resize' | 'modify' | 'drawing';

/** The modes in which a graphic wears its handles. */
export const HANDLE_EDIT_MODES: readonly EditMode[] = ['edit', 'translate', 'rotate', 'resize', 'modify'];

/**
 * A gesture an affordance can start, as opposed to a mode a host can sit in.
 *
 * Exactly the three that {@link AllowedGestures} answers for and that need an origin
 * and a moving cursor to mean anything. Reshaping is not here: it has no single
 * affordance, because *which* vertex you grabbed is the whole input.
 */
export type GestureKind = 'translate' | 'rotate' | 'resize';

/**
 * Where the selected graphic sits on screen, in **map-container** pixels — the box a
 * host draws its edit chrome around.
 *
 * ## Screen pixels, and axis-aligned
 *
 * Not a geographic extent, and deliberately so. A host is positioning DOM: it needs
 * the answer in the space its own elements live in, and converting one itself would
 * mean knowing which engine projected it. Both engines already own that conversion
 * for the properties dialog's connector.
 *
 * It is the bounding box of the graphic **as currently drawn**, so it re-fits every
 * frame of a rotate rather than turning with the symbol. That keeps it a true bounding
 * box for symbols that have no single orientation to turn with — a phase line, a
 * boundary, a hand-drawn area — which is most of them.
 *
 * Origin is the top-left of the map container, y down, matching `getBoundingClientRect`
 * minus the container's own offset.
 */
export interface SelectionBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * What an engine can do.
 *
 * Declared rather than guessed, so a host can disable a control with a reason instead
 * of offering one that silently does nothing. Both engines currently return every flag
 * true — MapLibre reached draw-and-edit parity in this release — but the shape stays,
 * because a third renderer will arrive unfinished and the honest answer then is a
 * grayed button, not a missing one.
 */
export interface EngineCapabilities {
    /** Can place a new graphic by drawing on the map. */
    draw: boolean;
    /** Can rotate, resize, translate and reshape an existing graphic. */
    edit: boolean;
    /** Can serialize every graphic to GeoJSON and rebuild from it. */
    io: boolean;
    /** Why something above is false. One short sentence, shown on a disabled control. */
    unsupportedReason?: string;
}

/** Everything an engine reports back to its host. All optional. */
export interface EngineCallbacks {
    /** A graphic was drawn, edited or removed — a host may want to save. */
    onChange?(): void;
    /** The selection moved. `null` when the user clicked empty map. */
    onSelect?(graphic: SelectedGraphic | null): void;
    /** A draw finished or was canceled, so a host can un-arm its button. */
    onDrawEnd?(): void;
    /** The engine changed mode on its own — finishing a draw returns to `view`. */
    onModeChange?(mode: EditMode): void;
}

/**
 * The selected graphic, in the terms both engines share.
 *
 * Deliberately not the engine's own object: OpenLayers would hand back a holder and
 * MapLibre a realized paint bundle, and a host that reads either is no longer portable.
 * The base feature and the name are what a properties panel actually needs.
 */
export interface SelectedGraphic {
    /** Stable per graphic, for a host keying its own state. */
    id: string;
    name: TacticalGraphicName;
    /** The drawn base with `properties.tacticalGraphic` — the portable description. */
    base: FeatureCollection['features'][number];
}

/**
 * Tactical graphics on a map, in verbs that do not name a renderer.
 *
 * Obtained from `createTacticalGraphics(map, options)`, exported by both
 * `@zaes/tactical-graphics/openlayers` and `@zaes/tactical-graphics/maplibre`.
 */
export interface TacticalGraphicsEngine {
    /** What this engine supports. @see EngineCapabilities */
    readonly capabilities: EngineCapabilities;

    /** Arms the draw tool for one graphic. The next clicks place its base. */
    startDrawing(name: TacticalGraphicName): void;
    /** Abandons a draw in progress, leaving nothing behind. */
    cancelDrawing(): void;

    /** What a drag means from now on. */
    setInteractionMode(mode: EditMode): void;
    getInteractionMode(): EditMode;

    /**
     * The graphic the operator is working on, or `null`.
     *
     * In `edit` mode this is what wears the handles and what {@link selectionBox}
     * measures. Setting it is how a host selects from outside the map — a list, a
     * search result — and `null` clears.
     */
    getSelection(): SelectedGraphic | null;
    select(id: string | null): void;

    /**
     * Which gestures the selected graphic accepts, so a host can offer exactly those.
     *
     * This is `allowedGestures(name)` for the selection, surfaced through the façade so
     * a host never has to import the table and match it against a name it is holding.
     * `null` when nothing is selected.
     */
    selectionGestures(): AllowedGestures | null;

    /**
     * Where the selection sits on screen right now, or `undefined` if nothing is
     * selected or it is off screen. @see SelectionBox
     *
     * Recompute this on every `move`/`postrender` frame — it is a screen measurement
     * and every pan, zoom and edit invalidates it.
     */
    selectionBox(): SelectionBox | undefined;

    /**
     * Starts `kind` on the selected graphic, driven by an affordance the host is
     * rendering rather than by a mode the host has switched into.
     *
     * The engine takes the pointer for the duration: it captures, interprets every
     * move as `kind` about the graphic's own anchor, and returns to `edit` on release.
     * Pass the `pointerdown` event so the engine has the drag origin and can capture
     * the pointer on the host's element.
     *
     * Refused — returning `false`, changing nothing — when nothing is selected or the
     * symbol does not accept `kind`. A refusal is a fact worth surfacing: a host that
     * hid the affordance in the first place should never see one.
     */
    beginGesture(kind: GestureKind, event: PointerEvent): boolean;

    /** Removes every graphic and returns to `view`. */
    clearAll(): void;

    /**
     * Every graphic as portable GeoJSON — one base feature each, carrying
     * `properties.tacticalGraphic`.
     *
     * No viewport state travels with it, which is what lets a snapshot taken in one
     * engine arrive in the other **editable** rather than as a picture of itself.
     */
    snapshot(): FeatureCollection;

    /** Replaces everything on the map with `snapshot`, rebuilt through the generators. */
    restore(snapshot: FeatureCollection): void;

    /**
     * Redraws everything against the **current** library config.
     *
     * `configureTacticalGraphics` changes what the symbology answers; it does not tell
     * a map that the answer moved. OpenLayers hides this — its style functions run
     * again on the next frame — while MapLibre bakes each paint result into a GeoJSON
     * source and keeps drawing the old colors until something re-runs the paints. So a
     * host's whole theme change is `configureTacticalGraphics(palette)` **and** this.
     */
    refreshStyles(): void;

    /** Detaches every listener and interaction. The map itself is left alone. */
    destroy(): void;
}
