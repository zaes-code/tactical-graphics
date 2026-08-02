/**
 * Library configuration.
 *
 * Everything a host may want to re-style lives on one all-optional object. Leave a
 * field off and the library uses its doctrinal default, so an unconfigured consumer
 * gets FM 1-02.2 out of the box; set it and the style layer picks the value up on the
 * next render.
 *
 * ## Why a global, and not a parameter
 *
 * Style functions are `(feature, resolution) => Style` — OpenLayers owns that
 * signature, and there are ~150 of them. Threading a config through would mean
 * rewriting every one, so the config is applied globally and read through the
 * accessors below. `TacticalGraphicsConfig` is still a real class you can construct,
 * hold, and compose with `.with()`; `configureTacticalGraphics` is what publishes one
 * to the style layer.
 *
 * ## Colours do not follow dark mode
 *
 * The library has exactly one palette — the doctrinal one — and it does not change
 * with `isDarkMode()`. A host that wants different line work on a dark basemap sends
 * the colours it wants through this config, because only the host knows what its own
 * basemap looks like. `src/App.tsx` is the worked example. `isDarkMode()` survives for
 * editor chrome only (handle dots, selection fill), which is not part of any symbol.
 */
import type {TacticalGraphicHostility} from '@zaes/tactical-graphics';

const BASE_FONT_SIZE_PX = 16; // matches the px value in fontStyle ('bold 24px sans-serif')
const DEFAULT_LINE_WIDTH = 4; // matches the old LINE_WIDTH constant in openlayerStyles.ts

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
 * doctrinal. The key is the same `TacticalGraphicHostility` the properties dialog
 * writes; `unknown` is spelled `defaultLineColor` instead, since that colour is also
 * what unaffiliated graphics and label text fall back to.
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
 * What does change is the *unaffiliated* neutrals: the line colour for graphics with no
 * affiliation, the label text that follows it, and the halo and background plate behind
 * that text. Those are black-on-white by default and would be invisible on a dark
 * basemap.
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
};

/**
 * The colour overrides to send for a given basemap brightness.
 *
 * Nothing calls this for you — the library never picks a palette off a mode flag,
 * because only the host knows what its basemap looks like. Pass the result to
 * `configureTacticalGraphics` when your mode changes:
 *
 * ```ts
 * setDarkModeFlag(dark);                              // editor chrome
 * configureTacticalGraphics(paletteForMode(dark));    // symbol colours
 * source.forEachFeature(f => f.changed());            // re-render what is on the map
 * ```
 */
export function paletteForMode(dark: boolean): TacticalGraphicsConfigOptions {
    return dark ? DARK_MODE_PALETTE : LIGHT_MODE_PALETTE;
}

/** The empty config — every default in force. */
const EMPTY_CONFIG = new TacticalGraphicsConfig();

let _config: TacticalGraphicsConfig = EMPTY_CONFIG;

/**
 * Light by default: the doctrinal FM 1-02.2 colours are the light-mode ones, so an
 * unconfigured consumer gets those rather than a palette tuned for a dark basemap.
 * The demo overrides this from localStorage during init (`App.tsx`), where dark is
 * the preferred default.
 *
 * This flag no longer touches any symbol colour — see the module note. It selects
 * editor chrome only.
 */
let _darkMode: boolean = false;

/** The overrides currently in force. */
export function getTacticalGraphicsConfig(): TacticalGraphicsConfig {
    return _config;
}

/**
 * Merge `options` over the current config.
 *
 * Accepts a plain options object or a `TacticalGraphicsConfig`. Call it as often as
 * you like — it is cheap, and the style layer reads the result live. Features already
 * on the map keep their cached render until something bumps their revision, so follow
 * a change with `source.forEachFeature(f => f.changed())`.
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
 * `openlayerStyles.getColorByHostility` owns the fallback.
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

/**
 * Whether the host is in dark mode.
 *
 * Selects editor chrome only — handle dots and the selection fill. Symbol colours come
 * from the config and are identical in both modes; see the module note.
 */
export function isDarkMode(): boolean {
    return _darkMode;
}

export function setDarkModeFlag(dark: boolean): void {
    _darkMode = dark;
}

export {BASE_FONT_SIZE_PX};
