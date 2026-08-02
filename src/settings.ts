/**
 * Renderer-local state for the OpenLayers layer.
 *
 * **The library's configuration is not here** — it moved to
 * `tacticalgraphics/core/config.ts` and ships from the root entry point, because label
 * sizes and affiliation colours mean the same thing to any renderer and a second one
 * should inherit them. Import `TacticalGraphicsConfig`, `configureTacticalGraphics`,
 * `paletteForMode` and friends from `@zaes/tactical-graphics`.
 *
 * What is left is the one flag that genuinely is renderer-local: whether the host is in
 * dark mode, which selects **editor chrome only** — handle dots, the inert-centre grey,
 * the selection fill. Chrome is not part of any symbol, so it is free to follow the
 * host's mode; symbol colours are not, and come from the config.
 */

/**
 * Light by default, matching the config's doctrinal defaults.
 *
 * The demo overrides this from localStorage during init (`App.tsx`), where dark is the
 * preferred default.
 */
let _darkMode: boolean = false;

/**
 * Whether the host is in dark mode.
 *
 * Selects editor chrome only. Symbol colours come from the library config and are
 * identical in both modes; see the module note.
 */
export function isDarkMode(): boolean {
    return _darkMode;
}

export function setDarkModeFlag(dark: boolean): void {
    _darkMode = dark;
}
