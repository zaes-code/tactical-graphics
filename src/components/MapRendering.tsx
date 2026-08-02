import React, {useEffect, useState} from 'react';
import '../styles/map.css';
import OpenLayersMap from './openlayers/OpenLayers';
import {AppBar, Box, IconButton, Toolbar, Typography} from '@mui/material';
import MapIcon from '@mui/icons-material/Map';
import SettingsIcon from '@mui/icons-material/Settings';
import SettingsModal from './SettingsModal';
import {
    TacticalGraphicHostility,
    TacticalGraphicsConfig,
    TacticalGraphicsConfigOptions,
    paletteForMode,
    setTacticalGraphicsConfig,
} from '@zaes/tactical-graphics';

interface MapRenderingProps {
    darkMode: boolean;
    onToggleDarkMode: () => void;
}

const LS_SETTINGS = 'tg_graphicsSettings';
/** Superseded by the single JSON blob above; read once so an existing user keeps their values. */
const LS_LEGACY_LABELSIZE = 'tg_defaultLabelSize';
const LS_LEGACY_LINEWIDTH = 'tg_defaultLineWidth';

/**
 * Publish the whole config in one call, mode palette first and the user's overrides on
 * top.
 *
 * **`setTacticalGraphicsConfig`, not `configureTacticalGraphics`.** The replacing form
 * is what makes "reset this colour" work: the settings panel clears an override by
 * deleting the key, and only a wholesale replace drops a value that is no longer in the
 * object. A merge would leave the cleared colour in force forever.
 *
 * It also means this is the *single* place the library's config is written. Applying the
 * palette from more than one component would have each clobber the other's half — the
 * mode palette would re-impose itself over a user's colour on every toggle.
 */
function applyGraphicsConfig(dark: boolean, overrides: TacticalGraphicsConfigOptions): void {
    setTacticalGraphicsConfig(new TacticalGraphicsConfig({...paletteForMode(dark), ...overrides}));
}

function loadGraphicsSettings(): TacticalGraphicsConfigOptions {
    const stored = localStorage.getItem(LS_SETTINGS);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (parsed && typeof parsed === 'object') return parsed as TacticalGraphicsConfigOptions;
        } catch {
            // Corrupt entry — fall through to the defaults rather than blocking start-up.
        }
    }

    const legacy: TacticalGraphicsConfigOptions = {};
    const labelSize = parseFloat(localStorage.getItem(LS_LEGACY_LABELSIZE) ?? '');
    const lineWidth = parseFloat(localStorage.getItem(LS_LEGACY_LINEWIDTH) ?? '');
    if (!isNaN(labelSize)) legacy.labelSize = labelSize;
    if (!isNaN(lineWidth)) legacy.lineWidth = lineWidth;
    return legacy;
}

const MapRendering: React.FC<MapRenderingProps> = ({darkMode, onToggleDarkMode}) => {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settings, setSettings] = useState<TacticalGraphicsConfigOptions>(() => {
        // Applied here as well as in the effect below so the very first render already
        // has the right config — the effect does not run until after it.
        const loaded = loadGraphicsSettings();
        applyGraphicsConfig(darkMode, loaded);
        return loaded;
    });

    useEffect(() => {
        applyGraphicsConfig(darkMode, settings);
        localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
    }, [darkMode, settings]);

    /** Merge a partial change; a field explicitly set to `undefined` clears its override. */
    const handleChange = (change: TacticalGraphicsConfigOptions) => {
        setSettings(prev => {
            const next: Record<string, unknown> = {...prev};
            Object.entries(change).forEach(([key, value]) => {
                if (value === undefined) delete next[key];
                else next[key] = value;
            });
            return next as TacticalGraphicsConfigOptions;
        });
    };

    const handleHostilityColorChange = (hostility: TacticalGraphicHostility, color: string | undefined) => {
        setSettings(prev => {
            const colors = {...prev.hostilityColors};
            if (color === undefined) delete colors[hostility];
            else colors[hostility] = color;
            // Drop the key entirely once the last override goes, so the saved settings
            // stay a clean record of "what the user actually changed".
            const next = {...prev};
            if (Object.keys(colors).length > 0) next.hostilityColors = colors;
            else delete next.hostilityColors;
            return next;
        });
    };

    return (
        <Box sx={{display: 'flex', flexDirection: 'column', width: '100%', height: '100%'}}>
            <AppBar
                position="static"
                elevation={0}
                sx={{
                    backgroundColor: 'background.paper',
                    borderBottom: 1,
                    borderColor: 'divider',
                    zIndex: 1200,
                }}
            >
                <Toolbar variant="dense" sx={{gap: 2, minHeight: 48}}>
                    <MapIcon sx={{color: 'primary.main', fontSize: 20}}/>
                    <Typography
                        variant="h6"
                        sx={{
                            color: 'text.primary',
                            fontSize: '0.875rem',
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            flexGrow: 1,
                        }}
                    >
                        Tactical Graphics&nbsp;
                        <Typography
                            component="span"
                            sx={{
                                color: 'primary.main',
                                fontSize: '0.875rem',
                                fontWeight: 400,
                                letterSpacing: 0,
                                textTransform: 'none',
                            }}
                        >
                            MIL-STD-2525E &middot; FM 1-02.2
                        </Typography>
                    </Typography>

                    <IconButton
                        onClick={() => setSettingsOpen(true)}
                        size="small"
                        sx={{
                            color: 'text.secondary',
                            '&:hover': {color: 'text.primary', backgroundColor: 'action.hover'},
                        }}
                    >
                        <SettingsIcon fontSize="small"/>
                    </IconButton>
                </Toolbar>
            </AppBar>

            <Box sx={{position: 'relative', flex: 1, overflow: 'hidden'}}>
                <OpenLayersMap darkMode={darkMode} graphicsSettings={settings}/>
            </Box>

            <SettingsModal
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                settings={settings}
                basePalette={paletteForMode(darkMode)}
                onChange={handleChange}
                onHostilityColorChange={handleHostilityColorChange}
                darkMode={darkMode}
                onToggleDarkMode={onToggleDarkMode}
            />
        </Box>
    );
};

export default MapRendering;
