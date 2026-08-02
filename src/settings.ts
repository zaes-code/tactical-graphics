const BASE_FONT_SIZE_PX = 16; // matches the px value in fontStyle ('bold 24px sans-serif')
const DEFAULT_LINE_WIDTH = 4; // matches the old LINE_WIDTH constant in openlayerStyles.ts

/** Readable bounds for the line-width setting: below 1px strokes vanish at typical zoom; above 8px they start to obscure the basemap and neighbouring graphics. */
export const MIN_LINE_WIDTH = 1;
export const MAX_LINE_WIDTH = 8;

let _defaultLabelSize: number = BASE_FONT_SIZE_PX;
let _defaultLineWidth: number = DEFAULT_LINE_WIDTH;
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

export function getDefaultLineWidth(): number {
    return _defaultLineWidth;
}

export function setDefaultLineWidth(width: number): void {
    _defaultLineWidth = Math.min(MAX_LINE_WIDTH, Math.max(MIN_LINE_WIDTH, width));
}

export function isDarkMode(): boolean {
    return _darkMode;
}

export function setDarkModeFlag(dark: boolean): void {
    _darkMode = dark;
}

export { BASE_FONT_SIZE_PX };
