import React from 'react';
import {
    Box,
    Dialog,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    InputAdornment,
    Switch,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import {
    MAX_LABEL_SIZE,
    MAX_LINE_WIDTH,
    MIN_LABEL_SIZE,
    MIN_LINE_WIDTH,
    TacticalGraphicHostility,
    TacticalGraphicsConfigOptions,
} from '@zaes/tactical-graphics';
import {
    getDefaultLineColor,
    getDoctrinalHostilityColor,
    getDrawMarkerColor,
    getDrawMarkerOutlineColor,
    getHandleColor,
    getInertHandleColor,
    getLabelFillColor,
    getLabelHaloColor,
} from './openlayers/openlayerStyles';

/**
 * The demo's settings panel. Every field on `TacticalGraphicsConfigOptions` is
 * represented, so the panel is the visible inventory of what the library exposes — add
 * a config field and it belongs here too.
 *
 * **Colors are overrides, not values.** A color the user has not touched is absent
 * from `settings` and something below resolves it: the doctrinal value for an
 * affiliation, and for the base colors the palette this app sends for its current mode
 * (`MapRendering.paletteFor`). So each swatch shows the *effective* color
 * (read live off the library) while the reset button is enabled only when an override
 * actually exists. Clearing one deletes the key rather than writing a default back —
 * see `MapRendering.applyGraphicsConfig` for why that is what restores mode-following.
 */
interface SettingsModalProps {
    open: boolean;
    onClose: () => void;
    /** The user's overrides — only what they have actually changed. */
    settings: TacticalGraphicsConfigOptions;
    /**
     * The app's palette for the current mode, which the overrides sit on top of — passed
     * in rather than read back off the library.
     *
     * Reading `getDefaultLineColor()` here would render one frame stale: a mode toggle
     * re-renders this component before `MapRendering`'s effect has published the new
     * palette, so the panel showed dark values while the map had already repainted
     * light. Deriving it from the same input the apply uses cannot drift.
     *
     * Affiliation colors need no such treatment — they are mode-independent.
     */
    basePalette: TacticalGraphicsConfigOptions;
    /** Merge a partial change. Pass `undefined` for a field to clear that override. */
    onChange: (change: TacticalGraphicsConfigOptions) => void;
    onHostilityColorChange: (hostility: TacticalGraphicHostility, color: string | undefined) => void;
    darkMode: boolean;
    onToggleDarkMode: () => void;
}

const rowSx = {display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2};

const labelSx = {fontSize: '0.8rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em'} as const;
const hintSx = {fontSize: '0.7rem', color: 'text.disabled', mt: 0.25} as const;
const sectionSx = {fontSize: '0.7rem', color: 'primary.main', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase'} as const;

/** Strips the number input's native spinners — we supply our own, so both fields match. */
const numberInputSx = {
    width: 116,
    '& input[type=number]': {MozAppearance: 'textfield'},
    '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
        WebkitAppearance: 'none',
        margin: 0,
    },
} as const;

const stepperButtonSx = {
    p: 0,
    height: 16,
    width: 16,
    color: 'text.secondary',
    '&:hover': {color: 'text.primary', backgroundColor: 'transparent'},
} as const;

interface NumberSettingProps {
    label: string;
    hint: string;
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
}

/**
 * A bounded pixel setting with its own stepper.
 *
 * Shared by label size and line width so the two are identical by construction rather
 * than by two copies staying in step — they had drifted, with only one carrying
 * steppers and each clamping to different hardcoded bounds.
 */
const NumberSetting: React.FC<NumberSettingProps> = ({label, hint, value, min, max, onChange}) => {
    const clamp = (v: number) => Math.min(max, Math.max(min, v));

    return (
        <Box sx={rowSx}>
            <Box>
                <Typography sx={labelSx}>{label}</Typography>
                <Typography sx={hintSx}>{hint}</Typography>
            </Box>
            <TextField
                type="number"
                value={value}
                onChange={e => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) onChange(clamp(v));
                }}
                size="small"
                inputProps={{min, max, step: 1}}
                InputProps={{
                    endAdornment: (
                        <InputAdornment position="end" sx={{display: 'flex', alignItems: 'center', gap: 0.5, ml: 0}}>
                            <Typography sx={{fontSize: '0.75rem', color: 'text.disabled'}}>px</Typography>
                            <Box sx={{display: 'flex', flexDirection: 'column'}}>
                                <IconButton onClick={() => onChange(clamp(value + 1))} disabled={value >= max} disableRipple sx={stepperButtonSx}>
                                    <KeyboardArrowUpIcon sx={{fontSize: 14}}/>
                                </IconButton>
                                <IconButton onClick={() => onChange(clamp(value - 1))} disabled={value <= min} disableRipple sx={stepperButtonSx}>
                                    <KeyboardArrowDownIcon sx={{fontSize: 14}}/>
                                </IconButton>
                            </Box>
                        </InputAdornment>
                    ),
                }}
                sx={numberInputSx}
            />
        </Box>
    );
};

/**
 * `<input type="color">` only accepts `#rrggbb`, but the library's defaults are `rgb()`
 * and `rgba()` strings. Best-effort conversion so the swatch shows something truthful;
 * the text field beside it stays authoritative and accepts any CSS color, which is the
 * only way to express the alpha several of the defaults carry.
 */
function toSwatchHex(color: string): string {
    const trimmed = color.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
    if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
        const [, r, g, b] = trimmed.match(/^#(.)(.)(.)$/i)!;
        return `#${r}${r}${g}${g}${b}${b}`;
    }
    const rgb = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgb) {
        const hex = (n: string) => Math.min(255, parseInt(n, 10)).toString(16).padStart(2, '0');
        return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
    }
    return '#000000';
}

interface ColorSettingProps {
    label: string;
    hint: string;
    /** The override, if the user has set one. */
    value: string | undefined;
    /** What the library currently resolves this to — shown when there is no override. */
    effective: string;
    onChange: (color: string | undefined) => void;
}

const ColorSetting: React.FC<ColorSettingProps> = ({label, hint, value, effective, onChange}) => {
    const shown = value ?? effective;
    const overridden = value !== undefined;

    return (
        <Box sx={rowSx}>
            <Box sx={{minWidth: 0}}>
                <Typography sx={labelSx}>{label}</Typography>
                <Typography sx={hintSx}>{hint}</Typography>
            </Box>
            <Box sx={{display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0}}>
                <Box
                    component="input"
                    type="color"
                    value={toSwatchHex(shown)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
                    sx={{
                        width: 28,
                        height: 28,
                        p: 0,
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        backgroundColor: 'transparent',
                        cursor: 'pointer',
                        '&::-webkit-color-swatch-wrapper': {p: '2px'},
                        '&::-webkit-color-swatch': {border: 'none', borderRadius: '2px'},
                    }}
                />
                <TextField
                    value={shown}
                    onChange={e => onChange(e.target.value)}
                    size="small"
                    placeholder={effective}
                    sx={{width: 152, '& input': {fontSize: '0.75rem', fontFamily: 'monospace'}}}
                />
                <Tooltip title={overridden ? 'Reset to default' : 'Not overridden'}>
                    {/* A disabled IconButton swallows its own events, so Tooltip needs a real child to anchor to. */}
                    <Box component="span">
                        <IconButton
                            onClick={() => onChange(undefined)}
                            disabled={!overridden}
                            size="small"
                            sx={{color: 'text.secondary', '&:hover': {color: 'text.primary'}}}
                        >
                            <RestartAltIcon sx={{fontSize: 16}}/>
                        </IconButton>
                    </Box>
                </Tooltip>
            </Box>
        </Box>
    );
};

/** The four affiliations that carry a color. `assumedFriend` / `suspectJoker` follow these. */
const AFFILIATIONS: {hostility: TacticalGraphicHostility; label: string; hint: string}[] = [
    {hostility: TacticalGraphicHostility.friend, label: 'Friendly', hint: 'Also assumed friend'},
    {hostility: TacticalGraphicHostility.hostileFaker, label: 'Hostile', hint: 'Hostile / faker'},
    {hostility: TacticalGraphicHostility.neutral, label: 'Neutral', hint: 'Neutral'},
    {hostility: TacticalGraphicHostility.pending, label: 'Pending', hint: 'Also suspect / joker'},
];

const SettingsModal: React.FC<SettingsModalProps> = ({
    open,
    onClose,
    settings,
    basePalette,
    onChange,
    onHostilityColorChange,
    darkMode,
    onToggleDarkMode,
}) => (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{sx: {borderRadius: 1}}}>
        <DialogTitle sx={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, pr: 1}}>
            <Typography sx={{fontSize: '0.875rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase'}}>
                Settings
            </Typography>
            <IconButton onClick={onClose} size="small" sx={{color: 'text.secondary', '&:hover': {color: 'text.primary'}}}>
                <CloseIcon fontSize="small"/>
            </IconButton>
        </DialogTitle>

        <Divider/>

        <DialogContent sx={{display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2.5}}>

            {/* Dark / Light mode */}
            <Box sx={rowSx}>
                <Box>
                    <Typography sx={labelSx}>Appearance</Typography>
                    <Typography sx={hintSx}>Basemap, app chrome, and the base colors below</Typography>
                </Box>
                <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
                    <LightModeIcon sx={{fontSize: 16, color: darkMode ? 'text.disabled' : 'warning.main'}}/>
                    <Switch
                        checked={darkMode}
                        onChange={onToggleDarkMode}
                        size="small"
                        sx={{
                            '& .MuiSwitch-switchBase.Mui-checked': {color: 'primary.main'},
                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {backgroundColor: 'primary.main'},
                        }}
                    />
                    <DarkModeIcon sx={{fontSize: 16, color: darkMode ? 'primary.main' : 'text.disabled'}}/>
                </Box>
            </Box>

            <Divider/>
            <Typography sx={sectionSx}>Sizing</Typography>

            <NumberSetting
                label="Label Size"
                hint="Font size at drawing resolution"
                value={settings.labelSize ?? 16}
                min={MIN_LABEL_SIZE}
                max={MAX_LABEL_SIZE}
                onChange={labelSize => onChange({labelSize})}
            />

            <NumberSetting
                label="Line Width"
                hint="Stroke width for drawn graphics"
                value={settings.lineWidth ?? 4}
                min={MIN_LINE_WIDTH}
                max={MAX_LINE_WIDTH}
                onChange={lineWidth => onChange({lineWidth})}
            />

            <Divider/>
            <Typography sx={sectionSx}>Affiliation colors</Typography>
            <Typography sx={{...hintSx, mt: -1.5}}>
                Doctrinal FM 1-02.2 by default, and identical in light and dark mode.
            </Typography>

            {AFFILIATIONS.map(({hostility, label, hint}) => (
                <ColorSetting
                    key={hostility}
                    label={label}
                    hint={hint}
                    value={settings.hostilityColors?.[hostility]}
                    effective={getDoctrinalHostilityColor(hostility) ?? ''}
                    onChange={color => onHostilityColorChange(hostility, color)}
                />
            ))}

            <Divider/>
            <Typography sx={sectionSx}>Base colors</Typography>
            <Typography sx={{...hintSx, mt: -1.5}}>
                Unset, these follow the appearance mode. Override one and it stops following.
            </Typography>

            <ColorSetting
                label="Line"
                hint="Unaffiliated line work"
                value={settings.defaultLineColor}
                effective={basePalette.defaultLineColor ?? getDefaultLineColor()}
                onChange={defaultLineColor => onChange({defaultLineColor})}
            />
            <ColorSetting
                label="Label Text"
                hint="Follows the line color unless set"
                value={settings.labelFillColor}
                effective={basePalette.labelFillColor ?? getLabelFillColor()}
                onChange={labelFillColor => onChange({labelFillColor})}
            />
            <ColorSetting
                label="Label Halo"
                hint="Outline behind label text"
                value={settings.labelHaloColor}
                effective={basePalette.labelHaloColor ?? getLabelHaloColor()}
                onChange={labelHaloColor => onChange({labelHaloColor})}
            />

            <Divider/>
            <Typography sx={sectionSx}>Editor chrome</Typography>
            <Typography sx={{...hintSx, mt: -1.5}}>
                The affordances for editing a graphic. Not part of any symbol, so they never take an affiliation color.
            </Typography>

            <ColorSetting
                label="Handle"
                hint="Draggable handle dots"
                value={settings.handleColor}
                effective={basePalette.handleColor ?? getHandleColor()}
                onChange={handleColor => onChange({handleColor})}
            />
            <ColorSetting
                label="Inert Handle"
                hint="Present, but not draggable now"
                value={settings.inertHandleColor}
                effective={basePalette.inertHandleColor ?? getInertHandleColor()}
                onChange={inertHandleColor => onChange({inertHandleColor})}
            />
            <ColorSetting
                label="Draw Marker"
                hint="Shown while drawing any graphic"
                value={settings.drawMarkerColor}
                effective={basePalette.drawMarkerColor ?? getDrawMarkerColor()}
                onChange={drawMarkerColor => onChange({drawMarkerColor})}
            />
            <ColorSetting
                label="Draw Marker Outline"
                hint="Contrast against the marker"
                value={settings.drawMarkerOutlineColor}
                effective={basePalette.drawMarkerOutlineColor ?? getDrawMarkerOutlineColor()}
                onChange={drawMarkerOutlineColor => onChange({drawMarkerOutlineColor})}
            />

        </DialogContent>
    </Dialog>
);

export default SettingsModal;
