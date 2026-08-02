/**
 * Library configuration.
 *
 * Everything re-styleable lives on one all-optional object. Leave a field off and the
 * library uses its doctrinal default, so an unconfigured consumer gets FM 1-02.2 out of
 * the box; set it and the renderer picks the value up on its next draw.
 *
 * ## Why this is in the map-agnostic half
 *
 * Nothing here knows what a renderer is. Label size in pixels, stroke width in pixels,
 * and the affiliation colours are properties of the *symbology* — they mean the same
 * thing to an OpenLayers style function, a planned Cesium view, or anything else that
 * draws these graphics. Keeping the config beside the geometry means a second renderer
 * inherits it rather than reinventing it, and a host configures the library once no
 * matter how many views it has open.
 *
 * This module holds values and pure functions only: no `ol`, no React, no DOM. That is
 * what lets it sit in the root entry point, and the build asserts it.
 *
 * ## Colours do not follow dark mode
 *
 * There is exactly one palette — the doctrinal one — and the library never swaps it off
 * a mode flag. A host that wants different line work on a dark basemap sends the colours
 * it wants, because only the host knows what its own basemap looks like.
 * `paletteForMode` is a ready-made pair for the common case; nothing applies it for you.
 */
import type {TacticalGraphicHostility} from './type';

/** Base label font size in px. The label-scale formulas all normalise to this. */
export const BASE_FONT_SIZE_PX = 16;

/** Default stroke width in px for every graphic's line work. */
export const DEFAULT_LINE_WIDTH = 4;

/** Readable bounds for the line-width setting: below 1px strokes vanish at typical zoom; above 8px they start to obscure the basemap and neighbouring graphics. */
export const MIN_LINE_WIDTH = 1;
export const MAX_LINE_WIDTH = 8;

/**
 * Readable bounds for the label-size setting, mirroring the line-width pair so the two
 * behave identically wherever they are surfaced together.
 *
 * Was `Math.max(1, size)` before 2026-08-02 — an upper bound was missing and the lower
 * one admitted sizes no one can read. A label under 8px is illegible at any zoom, and
 * over 48px it swamps the graphic it belongs to.
 */
export const MIN_LABEL_SIZE = 8;
export const MAX_LABEL_SIZE = 48;

/**
 * Every knob the library exposes. All optional — an omitted field keeps the default.
 *
 * `hostilityColors` is a partial map, so overriding one affiliation leaves the others
 * doctrinal. The key is the same `TacticalGraphicHostility` a graphic's properties
 * carry; `unknown` is spelled `defaultLineColor` instead, since that colour is also what
 * unaffiliated graphics and label text fall back to.
 */
export interface TacticalGraphicsConfigOptions {
    /** Base label font size in px. Default 16. Clamped to [MIN_LABEL_SIZE, MAX_LABEL_SIZE]. */
    labelSize?: number;
    /** Stroke width in screen px for every graphic's line work. Default 4. Clamped to [MIN_LINE_WIDTH, MAX_LINE_WIDTH]. */
    lineWidth?: number;
    /** Per-affiliation line colours. Anything omitted keeps its FM 1-02.2 value. */
    hostilityColors?: Partial<Record<TacticalGraphicHostility, string>>;
    /** Line colour for graphics with no affiliation, and for the `unknown` hostility. Default `#000000`. */
    defaultLineColor?: string;
    /** Label text fill. Defaults to whatever `defaultLineColor` resolves to, so overriding one moves both. */
    labelFillColor?: string;
    /** Label halo, which has to contrast against `labelFillColor`. Default opaque white. */
    labelHaloColor?: string;
    /** Solid fill painted behind label text to block pattern fills. Default 90%-opacity white. */
    labelBackgroundFill?: string;

    // ── Editor chrome ────────────────────────────────────────────────────────
    // Not part of any symbol: these colour the affordances a renderer draws so a user
    // can edit a graphic. They say "you can drag this", and that meaning must not shift
    // with a graphic's affiliation — which is why they are their own fields rather than
    // derived from the palette above. A renderer without a given affordance ignores its
    // field.

    /** Draggable handle dots. Default opaque red; renderers may apply their own opacity. */
    handleColor?: string;
    /** Handle dots that are present but not draggable right now. Default 80%-opacity grey. */
    inertHandleColor?: string;
    /** Fill for a selected/default-styled graphic. Default 20%-opacity blue. */
    selectionFillColor?: string;
    /** The marker shown while drawing a point-anchored graphic. Default solid blue. */
    drawMarkerColor?: string;
    /** That marker's outline, which has to contrast against `drawMarkerColor`. Default white. */
    drawMarkerOutlineColor?: string;
}

/**
 * An immutable set of overrides.
 *
 * Construct one and hand it to `configureTacticalGraphics`, or compose with `.with()`:
 *
 * ```ts
 * const dark = new TacticalGraphicsConfig({defaultLineColor: 'rgb(198,198,198)'});
 * configureTacticalGraphics(dark.with({lineWidth: 3}));
 * ```
 */
export class TacticalGraphicsConfig implements TacticalGraphicsConfigOptions {
    readonly labelSize?: number;
    readonly lineWidth?: number;
    readonly hostilityColors?: Readonly<Partial<Record<TacticalGraphicHostility, string>>>;
    readonly defaultLineColor?: string;
    readonly labelFillColor?: string;
    readonly labelHaloColor?: string;
    readonly labelBackgroundFill?: string;
    readonly handleColor?: string;
    readonly inertHandleColor?: string;
    readonly selectionFillColor?: string;
    readonly drawMarkerColor?: string;
    readonly drawMarkerOutlineColor?: string;

    constructor(options: TacticalGraphicsConfigOptions = {}) {
        // Clamp on the way in rather than on read: an out-of-range value typed into a
        // settings panel should be corrected once, not re-corrected on every style call.
        if (options.labelSize !== undefined) this.labelSize = Math.min(MAX_LABEL_SIZE, Math.max(MIN_LABEL_SIZE, options.labelSize));
        if (options.lineWidth !== undefined) this.lineWidth = Math.min(MAX_LINE_WIDTH, Math.max(MIN_LINE_WIDTH, options.lineWidth));
        if (options.hostilityColors !== undefined) this.hostilityColors = Object.freeze({...options.hostilityColors});
        if (options.defaultLineColor !== undefined) this.defaultLineColor = options.defaultLineColor;
        if (options.labelFillColor !== undefined) this.labelFillColor = options.labelFillColor;
        if (options.labelHaloColor !== undefined) this.labelHaloColor = options.labelHaloColor;
        if (options.labelBackgroundFill !== undefined) this.labelBackgroundFill = options.labelBackgroundFill;
        if (options.handleColor !== undefined) this.handleColor = options.handleColor;
        if (options.inertHandleColor !== undefined) this.inertHandleColor = options.inertHandleColor;
        if (options.selectionFillColor !== undefined) this.selectionFillColor = options.selectionFillColor;
        if (options.drawMarkerColor !== undefined) this.drawMarkerColor = options.drawMarkerColor;
        if (options.drawMarkerOutlineColor !== undefined) this.drawMarkerOutlineColor = options.drawMarkerOutlineColor;
        Object.freeze(this);
    }

    /**
     * A copy with `overrides` merged over this one. `hostilityColors` merges key by
     * key; every other field is replaced whole.
     *
     * Passing `undefined` for a field means "leave it alone", not "clear it" — that is
     * what makes `config.with({lineWidth})` safe to call from a settings panel. To drop
     * an override entirely, build a fresh `TacticalGraphicsConfig` and publish it with
     * `setTacticalGraphicsConfig`.
     */
    with(overrides: TacticalGraphicsConfigOptions): TacticalGraphicsConfig {
        return new TacticalGraphicsConfig({
            labelSize: overrides.labelSize ?? this.labelSize,
            lineWidth: overrides.lineWidth ?? this.lineWidth,
            hostilityColors: {...this.hostilityColors, ...overrides.hostilityColors},
            defaultLineColor: overrides.defaultLineColor ?? this.defaultLineColor,
            labelFillColor: overrides.labelFillColor ?? this.labelFillColor,
            labelHaloColor: overrides.labelHaloColor ?? this.labelHaloColor,
            labelBackgroundFill: overrides.labelBackgroundFill ?? this.labelBackgroundFill,
            handleColor: overrides.handleColor ?? this.handleColor,
            inertHandleColor: overrides.inertHandleColor ?? this.inertHandleColor,
            selectionFillColor: overrides.selectionFillColor ?? this.selectionFillColor,
            drawMarkerColor: overrides.drawMarkerColor ?? this.drawMarkerColor,
            drawMarkerOutlineColor: overrides.drawMarkerOutlineColor ?? this.drawMarkerOutlineColor,
        });
    }
}

/**
 * Colours for a light basemap — the library defaults, restated as an explicit set.
 *
 * Restated rather than left implicit because `configureTacticalGraphics` merges:
 * going back to light has to actively undo the dark values, not merely stop sending
 * the dark ones.
 */
export const LIGHT_MODE_PALETTE: TacticalGraphicsConfigOptions = {
    defaultLineColor: '#000000',
    labelFillColor: '#000000',
    labelHaloColor: 'rgba(255,255,255,1)',
    labelBackgroundFill: 'rgba(255, 255, 255, 0.90)',
    handleColor: 'rgba(255,0,0,1)',
    inertHandleColor: 'rgba(130,130,130,0.8)',
    selectionFillColor: 'rgba(0, 120, 255, 0.2)',
    drawMarkerColor: 'rgba(87, 140, 255, 1)',
    drawMarkerOutlineColor: 'white',
};

/**
 * Colours for a dark basemap.
 *
 * Note what is **absent**: no `hostilityColors`. The four affiliation colours —
 * friendly blue, hostile red, neutral green, pending yellow — are identical in both
 * modes on purpose. They are doctrine, they are how an operator identifies a symbol at
 * a glance, and shifting them on a dark background makes a graphic mean something
 * slightly different depending on a display setting. They are saturated enough to carry
 * on either background as-is.
 *
 * What does change is the *unaffiliated* neutrals — the line colour for graphics with no
 * affiliation, the label text that follows it, and the halo and background plate behind
 * that text — and the editor chrome. Those are black-on-white by default and would be
 * invisible on a dark basemap.
 *
 * This is a starting point, not a mandate — a host with a different basemap is expected
 * to pass its own values, and may add `hostilityColors` if it really wants them
 * re-tinted.
 */
export const DARK_MODE_PALETTE: TacticalGraphicsConfigOptions = {
    defaultLineColor: 'rgb(198,198,198)',
    labelFillColor: 'rgb(198,198,198)',
    labelHaloColor: 'rgb(23,23,23)',
    labelBackgroundFill: 'rgba(22, 27, 34, 0.90)',
    handleColor: 'rgba(208,123,123,1)',
    inertHandleColor: 'rgba(109,109,109,0.8)',
    selectionFillColor: 'rgba(55, 137, 208, 0.2)',
    drawMarkerColor: 'rgb(69,106,185)',
    drawMarkerOutlineColor: 'rgb(23,23,23)',
};

/**
 * The colour overrides to send for a given basemap brightness.
 *
 * Nothing calls this for you — the library never picks a palette off a mode flag,
 * because only the host knows what its basemap looks like. Pass the result to
 * `configureTacticalGraphics` when your mode changes.
 */
export function paletteForMode(dark: boolean): TacticalGraphicsConfigOptions {
    return dark ? DARK_MODE_PALETTE : LIGHT_MODE_PALETTE;
}

/** The empty config — every default in force. */
const EMPTY_CONFIG = new TacticalGraphicsConfig();

let _config: TacticalGraphicsConfig = EMPTY_CONFIG;

/** The overrides currently in force. */
export function getTacticalGraphicsConfig(): TacticalGraphicsConfig {
    return _config;
}

/**
 * Merge `options` over the current config.
 *
 * Accepts a plain options object or a `TacticalGraphicsConfig`. Call it as often as you
 * like — it is cheap, and renderers read the result live. Anything already drawn keeps
 * its cached rendering until the renderer is told to invalidate; with OpenLayers that
 * means `source.forEachFeature(f => f.changed())`.
 */
export function configureTacticalGraphics(options: TacticalGraphicsConfigOptions): void {
    _config = _config.with(options);
}

/** Replace the config wholesale, dropping any override not present in `config`. */
export function setTacticalGraphicsConfig(config: TacticalGraphicsConfig): void {
    _config = config;
}

/** Drop every override and go back to the doctrinal defaults. */
export function resetTacticalGraphicsConfig(): void {
    _config = EMPTY_CONFIG;
}

export function getDefaultLabelSize(): number {
    return _config.labelSize ?? BASE_FONT_SIZE_PX;
}

/** Convenience wrapper over `configureTacticalGraphics({labelSize})`. */
export function setDefaultLabelSize(size: number): void {
    configureTacticalGraphics({labelSize: size});
}

export function getDefaultLineWidth(): number {
    return _config.lineWidth ?? DEFAULT_LINE_WIDTH;
}

/** Convenience wrapper over `configureTacticalGraphics({lineWidth})`. */
export function setDefaultLineWidth(width: number): void {
    configureTacticalGraphics({lineWidth: width});
}

/**
 * The host's override for one affiliation, or `undefined` to use the doctrinal value.
 * The renderer owns the fallback — in the OpenLayers layer that is
 * `getColorByHostility`.
 */
export function getHostilityColorOverride(hostility: TacticalGraphicHostility): string | undefined {
    return _config.hostilityColors?.[hostility];
}

export function getDefaultLineColorOverride(): string | undefined {
    return _config.defaultLineColor;
}

export function getLabelFillColorOverride(): string | undefined {
    return _config.labelFillColor;
}

export function getLabelHaloColorOverride(): string | undefined {
    return _config.labelHaloColor;
}

export function getLabelBackgroundFillOverride(): string | undefined {
    return _config.labelBackgroundFill;
}

export function getHandleColorOverride(): string | undefined {
    return _config.handleColor;
}

export function getInertHandleColorOverride(): string | undefined {
    return _config.inertHandleColor;
}

export function getSelectionFillColorOverride(): string | undefined {
    return _config.selectionFillColor;
}

export function getDrawMarkerColorOverride(): string | undefined {
    return _config.drawMarkerColor;
}

export function getDrawMarkerOutlineColorOverride(): string | undefined {
    return _config.drawMarkerOutlineColor;
}
