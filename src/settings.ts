const BASE_FONT_SIZE_PX = 16; // matches the px value in fontStyle ('bold 24px sans-serif')

let _defaultLabelSize: number = BASE_FONT_SIZE_PX;
let _darkMode: boolean = true;

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
