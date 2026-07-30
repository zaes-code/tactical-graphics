const BASE_FONT_SIZE_PX = 16; // matches the px value in fontStyle ('bold 24px sans-serif')

let _defaultLabelSize: number = BASE_FONT_SIZE_PX;
/**
 * Light by default: the doctrinal FM 1-02.2 colours are the light-mode ones, so an
 * unconfigured consumer gets those rather than a palette tuned for a dark basemap.
 * The demo overrides this from localStorage during init (`App.tsx`), where dark is
 * the preferred default.
 */
let _darkMode: boolean = false;

export function getDefaultLabelSize(): number {
    return _defaultLabelSize;
}

export function setDefaultLabelSize(size: number): void {
    _defaultLabelSize = Math.max(1, size);
}

export function isDarkMode(): boolean {
    return _darkMode;
}

export function setDarkModeFlag(dark: boolean): void {
    _darkMode = dark;
}

export { BASE_FONT_SIZE_PX };
