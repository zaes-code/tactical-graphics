import React, {useCallback, useEffect, useRef, useState} from 'react';
import '../styles/map.css';
import OpenLayersMap from './openlayers/OpenLayers';
import MapLibreMap from './maplibre/MapLibre';
import {AppBar, Box, IconButton, ToggleButton, ToggleButtonGroup, Toolbar, Typography} from '@mui/material';
import MapIcon from '@mui/icons-material/Map';
import SettingsIcon from '@mui/icons-material/Settings';
import SettingsModal from './SettingsModal';
import MapControls from './MapControls';
import {InteractionType} from './openlayers/TacticalGraphicsManager';
import type {MapEngineHandle} from './mapEngine';
import {
    DEFAULT_PALETTE,
    TacticalGraphicHostility,
    TacticalGraphicName,
    TacticalGraphicsConfig,
    TacticalGraphicsConfigOptions,
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
const LS_ENGINE = 'tg_mapEngine';

/**
 * Which renderer draws the map.
 *
 * The library's whole Layer 1 / Layer 2 split exists so this can be a choice: the
 * geometry and the config are map-agnostic, and only the painting is not. This
 * picker is what makes that claim checkable rather than aspirational — the two
 * views take the same props and read the same config singleton, so anything that
 * differs between them is a renderer bug.
 */
export type MapEngine = 'openlayers' | 'maplibre';

const ENGINE_LABELS: Record<MapEngine, string> = {
    openlayers: 'OpenLayers',
    maplibre: 'MapLibre',
};

function loadEngine(): MapEngine {
    return localStorage.getItem(LS_ENGINE) === 'maplibre' ? 'maplibre' : 'openlayers';
}

/**
 * The demo's colours for a dark basemap — **the app's, not the library's.**
 *
 * The library ships one palette (`DEFAULT_PALETTE`) and has no idea whether this app is
 * in dark mode; it cannot, since it never sees the basemap. So a host that wants a
 * second set keeps it, which is exactly what this is: the worked example of what a
 * consumer writes. Add or drop keys freely — the only rule is that a set be *complete*
 * enough to undo the other, since `setTacticalGraphicsConfig` replaces rather than
 * merges.
 *
 * No `hostilityColors`: the four affiliation colours are doctrine and stay put in both
 * modes. What moves is the unaffiliated neutrals — the default line colour, the label
 * text that follows it, the halo behind that text — and the editor chrome, all of which
 * are black-on-white by default and would be invisible on a dark basemap.
 */
const DARK_PALETTE: TacticalGraphicsConfigOptions = {
    defaultLineColor: 'rgb(198,198,198)',
    labelFillColor: 'rgb(198,198,198)',
    labelHaloColor: 'rgb(23,23,23)',
    handleColor: 'rgba(208,123,123,1)',
    inertHandleColor: 'rgba(109,109,109,0.8)',
    drawMarkerColor: 'rgb(69,106,185)',
    drawMarkerOutlineColor: 'rgb(23,23,23)',
};

const paletteFor = (dark: boolean): TacticalGraphicsConfigOptions => dark ? DARK_PALETTE : DEFAULT_PALETTE;

/**
 * Publish the whole config in one call, the mode's palette first and the user's
 * overrides on top.
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
    setTacticalGraphicsConfig(new TacticalGraphicsConfig({...paletteFor(dark), ...overrides}));
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
    const [engine, setEngine] = useState<MapEngine>(loadEngine);

    /**
     * The live map's handle, and its capabilities mirrored into state.
     *
     * The handle itself is a ref because the panel's callbacks read it at click
     * time and nothing should re-render when it changes. The capabilities *are*
     * state, because the panel's enabled/disabled appearance depends on them and
     * has to repaint when the engine is swapped.
     */
    const engineRef = useRef<MapEngineHandle | null>(null);
    const [capabilities, setCapabilities] = useState<MapEngineHandle['capabilities'] | null>(null);
    const [interactionMode, setInteractionMode] = useState<InteractionType>(InteractionType.view);
    const [selectedShape, setSelectedShape] = useState<TacticalGraphicName>(TacticalGraphicName.AirCorridor);

    const handleEngineReady = useCallback((handle: MapEngineHandle | null) => {
        engineRef.current = handle;
        setCapabilities(handle?.capabilities ?? null);
        // A view that cannot edit must not leave the panel showing a stale mode from
        // the engine that could.
        if (!handle?.capabilities.edit) setInteractionMode(InteractionType.view);
    }, []);
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

    /**
     * `null` when the user clicks the already-selected button — `ToggleButtonGroup`
     * reports a deselect, and honouring it would leave the app with no map at all.
     */
    const handleEngineChange = (_: React.MouseEvent<HTMLElement>, next: MapEngine | null) => {
        if (!next) return;
        localStorage.setItem(LS_ENGINE, next);
        setEngine(next);
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

                    <ToggleButtonGroup
                        value={engine}
                        exclusive
                        onChange={handleEngineChange}
                        size="small"
                        aria-label="map engine"
                    >
                        {(Object.keys(ENGINE_LABELS) as MapEngine[]).map(value => (
                            <ToggleButton key={value} value={value} aria-label={ENGINE_LABELS[value]} sx={{px: 1.5, py: 0.25, fontSize: '0.75rem'}}>
                                {ENGINE_LABELS[value]}
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>

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

            {/*
              * `key` on each view, and only one mounted at a time.
              *
              * Both engines attach to a container div and own it for their lifetime. Without
              * a distinct key React reuses the same DOM node across the swap, and the
              * incoming map initialises against a container the outgoing one has not
              * finished tearing down — MapLibre in particular leaves its canvas behind.
              * Remounting is also what makes the comparison honest: each engine starts from
              * a clean map at the same centre and zoom.
              */}
            <Box sx={{position: 'relative', flex: 1, overflow: 'hidden'}}>
                {engine === 'openlayers'
                    ? <OpenLayersMap
                        key="openlayers"
                        darkMode={darkMode}
                        graphicsSettings={settings}
                        onReady={handleEngineReady}
                        onInteractionModeChange={setInteractionMode}
                    />
                    : <MapLibreMap
                        key="maplibre"
                        darkMode={darkMode}
                        graphicsSettings={settings}
                        onReady={handleEngineReady}
                    />}

                {/*
                  * One panel, either engine. It used to live inside `OpenLayers.tsx`,
                  * which is why the MapLibre view had none at all — and why the two
                  * views could not be compared with the same controls in front of them.
                  * Everything it calls goes through `MapEngineHandle`; what an engine
                  * cannot do it declares, and the panel greys rather than hides.
                  */}
                {capabilities && (
                    <MapControls
                        capabilities={capabilities}
                        onDrawTacticalGraphics={() => engineRef.current?.startDrawing(selectedShape)}
                        onToggleInteraction={mode => engineRef.current?.setInteractionMode(mode)}
                        onShapeChange={setSelectedShape}
                        onReset={() => engineRef.current?.reset()}
                        onDrawSamples={hostility => engineRef.current?.drawSamples(hostility)}
                        onClearAll={() => engineRef.current?.clearAll()}
                        onExportGeoJson={() => engineRef.current?.exportGeoJson()}
                        onImportGeoJson={file => engineRef.current?.importGeoJson(file)}
                        interactionMode={interactionMode}
                        isRotating={interactionMode === InteractionType.rotate}
                        isResizing={interactionMode === InteractionType.resize}
                        isRepositioning={interactionMode === InteractionType.translate}
                        isModifying={interactionMode === InteractionType.modify}
                        defaultShape={selectedShape}
                    />
                )}
            </Box>

            <SettingsModal
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                settings={settings}
                basePalette={paletteFor(darkMode)}
                onChange={handleChange}
                onHostilityColorChange={handleHostilityColorChange}
                darkMode={darkMode}
                onToggleDarkMode={onToggleDarkMode}
            />
        </Box>
    );
};

export default MapRendering;
