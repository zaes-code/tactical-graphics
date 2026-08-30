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
 * and the affiliation colors are properties of the *symbology* — they mean the same
 * thing to an OpenLayers style function, a planned Cesium view, or anything else that
 * draws these graphics. Keeping the config beside the geometry means a second renderer
 * inherits it rather than reinventing it, and a host configures the library once no
 * matter how many views it has open.
 *
 * This module holds values and pure functions only: no `ol`, no React, no DOM. That is
 * what lets it sit in the root entry point, and the build asserts it.
 *
 * ## One palette
 *
 * There is exactly one palette here — `DEFAULT_PALETTE`, the doctrinal one — and the
 * library never swaps it for another. It cannot: only the host knows what its own
 * basemap looks like, whether the map is on a projector or a darkened operations floor,
 * and which of those states it is in right now. A host that wants different colors on a
 * dark basemap keeps that set itself and sends it. The library takes colors, not modes.
 */
import type {TacticalGraphicHostility} from './type';

/** Base label font size in px. The label-scale formulas all normalize to this. */
export const BASE_FONT_SIZE_PX = 16;

/**
 * Default stroke width in px for every graphic's line work.
 *
 * Came down from 4 to 2 on 2026-08-04. 4px reads as heavy at the zooms these graphics
 * are actually used at — the line work crowds its own labels and the inner detail of
 * the denser symbols (obstacle teeth, crenellations, fortified decoration) runs
 * together. 2px is the weight the doctrinal plates read at.
 */
export const DEFAULT_LINE_WIDTH = 2;

/** Readable bounds for the line-width setting: below 1px strokes vanish at typical zoom; above 8px they start to obscure the basemap and neighboring graphics. */
export const MIN_LINE_WIDTH = 1;
export const MAX_LINE_WIDTH = 8;

/**
 * Readable bounds for the label-size setting, mirroring the line-width pair so the two
 * behave identically wherever they are surfaced together.
 *
 * Was `Math.max(1, size)` before 2026-08-02 — an upper bound was missing and the lower
 * one admitted sizes no one can read. A label under 8px is illegible at any zoom, and
 * past the upper bound it swamps the graphic it belongs to. That ceiling came down from
 * 48 to 26 on 2026-08-03: 48 was picked to mirror the line-width pair rather than from
 * looking at the map, and labels well short of it already overran their graphics.
 */
export const MIN_LABEL_SIZE = 8;
export const MAX_LABEL_SIZE = 26;

/**
 * The unit an altitude is entered and displayed in.
 *
 * **A host-level choice, not a per-symbol one.** A picture where one zone is in feet and
 * the next in meters is a picture nobody can read across, so one setting covers the map
 * and every altitude on it compares.
 *
 * The value is **interpreted in this unit, never converted into it**: 1500 entered
 * under `Feet` is 1500 feet, and the same 1500 under `Meters` is 1500 meters. So this
 * is a decision to make once, at start-up, beside the palette — changing it later
 * reinterprets every altitude already entered rather than restating it.
 *
 * ## Why this is only two members
 *
 * FM 1-02.2 gives field X four kinds of value, and they are **not four units**:
 *
 * 1. an altitude "in feet or meters **in relation to a reference datum**" — `1500MSL`,
 *    `1500FT AGL`
 * 2. a **flight level** — `FL150`
 * 3. a **depth** for a submerged object, in feet below sea level
 * 4. a **height** of equipment or structures on the ground
 *
 * Only the first half of (1) is a unit. `MSL` and `AGL` are a *reference datum* — what
 * the number is measured from — which is an independent axis: any datum can be quoted in
 * either unit, so folding them in here would produce an enum whose members cannot be
 * combined and a value that cannot say "meters above ground".
 *
 * A **flight level** is neither. `FL150` is 15,000 ft of *pressure* altitude against the
 * standard 1013.25 hPa datum, so it is deliberately not a true height above anything —
 * two aircraft at FL150 are separated from each other, not placed. The number is
 * different too: 150, not 15000. It is its own encoding, not this quantity in another
 * unit.
 *
 * So the datum belongs on the **graphic**, not here: two zones on one map can honestly
 * be one AGL and one MSL, which a host-level setting could never express. Until such a
 * field exists, `formatAltitude` passes a non-numeric string through untouched, so
 * `'FL150'` and `'1500MSL'` still render exactly as doctrine writes them.
 */
export enum AltitudeUnit {
    meters = 'Meters',
    feet = 'Feet',
}

/** What each unit is written as on a label. Matches the plates: `1500FT`, not `1500 ft`. */
export const ALTITUDE_UNIT_SUFFIX: Readonly<Record<AltitudeUnit, string>> = Object.freeze({
    [AltitudeUnit.meters]: 'M',
    [AltitudeUnit.feet]: 'FT',
});

/**
 * Every knob the library exposes. All optional — an omitted field keeps the default.
 *
 * `hostilityColors` is a partial map, so overriding one affiliation leaves the others
 * doctrinal. The key is the same `TacticalGraphicHostility` a graphic's properties
 * carry; `unknown` is spelled `defaultLineColor` instead, since that color is also what
 * unaffiliated graphics and label text fall back to.
 */
export interface TacticalGraphicsConfigOptions {
    /** Base label font size in px. Default 16. Clamped to [MIN_LABEL_SIZE, MAX_LABEL_SIZE]. */
    labelSize?: number;
    /** Stroke width in screen px for every graphic's line work. Default 2. Clamped to [MIN_LINE_WIDTH, MAX_LINE_WIDTH]. */
    lineWidth?: number;
    /** Per-affiliation line colors. Anything omitted keeps its FM 1-02.2 value. */
    hostilityColors?: Partial<Record<TacticalGraphicHostility, string>>;
    /** Line color for graphics with no affiliation, and for the `unknown` hostility. Default `#000000`. */
    defaultLineColor?: string;
    /** Label text fill. Defaults to whatever `defaultLineColor` resolves to, so overriding one moves both. */
    labelFillColor?: string;
    /**
     * Colour a graphic's text amplifiers by its affiliation instead of by
     * `labelFillColor`. Default `false`.
     *
     * **Off by default because doctrine says off.** FM 1-02.2 colours *line work* by
     * affiliation and leaves text amplifiers black — a hostile phase line is red, and its
     * "PL BLUE" is not. That is the rule this library follows and the one
     * `hostilityExemptions.test.ts` pins.
     *
     * It is offered as a choice because a host with a dark or busy basemap often wants the
     * amplifier to read as part of the symbol rather than as a separate black annotation,
     * and because a picture filtered down to one affiliation loses nothing by tinting its
     * text. Turning it on supersedes `labelFillColor` entirely, so a host should present
     * the two as one either/or rather than as two independent settings.
     */
    labelUsesHostilityColor?: boolean;
    /** Label halo, which has to contrast against `labelFillColor`. Default opaque white. */
    labelHaloColor?: string;
    /** Unit for every altitude and height amplifier. Default {@link AltitudeUnit.feet}. @see AltitudeUnit */
    altitudeUnit?: AltitudeUnit;

    // ── Editor chrome ────────────────────────────────────────────────────────
    // Not part of any symbol: these color the affordances a renderer draws so a user
    // can edit a graphic. They say "you can drag this", and that meaning must not shift
    // with a graphic's affiliation — which is why they are their own fields rather than
    // derived from the palette above. A renderer without a given affordance ignores its
    // field.

    /** Draggable handle dots. Default opaque red; renderers may apply their own opacity. */
    handleColor?: string;
    /** Handle dots that are present but not draggable right now. Default 80%-opacity gray. */
    inertHandleColor?: string;
    /** The marker and sketch line shown while drawing any graphic. Default solid blue. */
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
    readonly labelUsesHostilityColor?: boolean;
    readonly labelHaloColor?: string;
    readonly altitudeUnit?: AltitudeUnit;
    readonly handleColor?: string;
    readonly inertHandleColor?: string;
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
        if (options.labelUsesHostilityColor !== undefined) this.labelUsesHostilityColor = options.labelUsesHostilityColor;
        if (options.labelHaloColor !== undefined) this.labelHaloColor = options.labelHaloColor;
        if (options.altitudeUnit !== undefined) this.altitudeUnit = options.altitudeUnit;
        if (options.handleColor !== undefined) this.handleColor = options.handleColor;
        if (options.inertHandleColor !== undefined) this.inertHandleColor = options.inertHandleColor;
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
            labelUsesHostilityColor: overrides.labelUsesHostilityColor ?? this.labelUsesHostilityColor,
            labelHaloColor: overrides.labelHaloColor ?? this.labelHaloColor,
            altitudeUnit: overrides.altitudeUnit ?? this.altitudeUnit,
            handleColor: overrides.handleColor ?? this.handleColor,
            inertHandleColor: overrides.inertHandleColor ?? this.inertHandleColor,
            drawMarkerColor: overrides.drawMarkerColor ?? this.drawMarkerColor,
            drawMarkerOutlineColor: overrides.drawMarkerOutlineColor ?? this.drawMarkerOutlineColor,
        });
    }
}

/**
 * The one palette: every color the library falls back to, restated as an explicit set.
 *
 * Two jobs, which is why it is exported rather than left implicit inside the accessors:
 *
 * - **It is the fallback.** The renderer's `get*Color()` accessors resolve to these
 *   values when the host has overridden nothing, so the defaults are written down once
 *   instead of once per accessor.
 * - **It is what a host builds its own sets on top of.** `setTacticalGraphicsConfig`
 *   replaces wholesale, so a host swapping palettes has to send a complete one —
 *   `{...DEFAULT_PALETTE, ...myDarkColors}` is the intended shape.
 *
 * Note what is **absent**: no `hostilityColors`. The four affiliation colors — friendly
 * blue, hostile red, neutral green, pending yellow — are doctrine. They are how an
 * operator identifies a symbol at a glance, and re-tinting them for a display setting
 * makes a graphic mean something slightly different depending on how the app is
 * configured. A host that disagrees can still pass `hostilityColors`; the library will
 * not do it on its own.
 */
export const DEFAULT_PALETTE: Readonly<Required<Pick<TacticalGraphicsConfigOptions,
    'defaultLineColor' | 'labelFillColor' | 'labelHaloColor' | 'handleColor' | 'inertHandleColor' | 'drawMarkerColor' | 'drawMarkerOutlineColor'>>> = {
    defaultLineColor: '#000000',
    labelFillColor: '#000000',
    labelHaloColor: 'rgba(255,255,255,1)',
    handleColor: 'rgba(255,0,0,1)',
    inertHandleColor: 'rgba(130,130,130,0.8)',
    drawMarkerColor: 'rgba(87, 140, 255, 1)',
    drawMarkerOutlineColor: 'white',
};

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

/** Whether text amplifiers take their graphic's affiliation colour. @see labelUsesHostilityColor */
export function getLabelUsesHostilityColor(): boolean {
    return _config.labelUsesHostilityColor === true;
}

export function getLabelHaloColorOverride(): string | undefined {
    return _config.labelHaloColor;
}

export function getHandleColorOverride(): string | undefined {
    return _config.handleColor;
}

/**
 * The unit every altitude and height amplifier is written in.
 *
 * Defaults to feet: every altitude FM 1-02.2 prints is in feet or a flight level —
 * `1500FT AGL`, `20000FT AGL`, `FL150` — and aviation, which is what these particular
 * amplifiers annotate, is flown in feet almost everywhere.
 */
export function getAltitudeUnit(): AltitudeUnit {
    return _config.altitudeUnit ?? AltitudeUnit.feet;
}

export function getInertHandleColorOverride(): string | undefined {
    return _config.inertHandleColor;
}

export function getDrawMarkerColorOverride(): string | undefined {
    return _config.drawMarkerColor;
}

export function getDrawMarkerOutlineColorOverride(): string | undefined {
    return _config.drawMarkerOutlineColor;
}
