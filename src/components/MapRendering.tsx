import React, {useState} from 'react';
import '../styles/map.css';
import OpenLayersMap from './openlayers/OpenLayers';
import {AppBar, Box, IconButton, Toolbar, Typography} from '@mui/material';
import MapIcon from '@mui/icons-material/Map';
import SettingsIcon from '@mui/icons-material/Settings';
import SettingsModal from './SettingsModal';
import {MAX_LINE_WIDTH, MIN_LINE_WIDTH, setDefaultLabelSize, setDefaultLineWidth} from '../settings';

interface MapRenderingProps {
    darkMode: boolean;
    onToggleDarkMode: () => void;
}

const LS_LABELSIZE = 'tg_defaultLabelSize';
const LS_LINEWIDTH = 'tg_defaultLineWidth';
const DEFAULT_LINE_WIDTH = 4;

const MapRendering: React.FC<MapRenderingProps> = ({darkMode, onToggleDarkMode}) => {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [defaultLabelSize, setDefaultLabelSizeState] = useState(() => {
        const stored = localStorage.getItem(LS_LABELSIZE);
        const size = stored !== null ? parseFloat(stored) : 16;
        const valid = isNaN(size) ? 16 : size;
        setDefaultLabelSize(valid);
        return valid;
    });
    const [lineWidth, setLineWidthState] = useState(() => {
        const stored = localStorage.getItem(LS_LINEWIDTH);
        const width = stored !== null ? parseFloat(stored) : DEFAULT_LINE_WIDTH;
        const valid = isNaN(width) ? DEFAULT_LINE_WIDTH : Math.min(MAX_LINE_WIDTH, Math.max(MIN_LINE_WIDTH, width));
        setDefaultLineWidth(valid);
        return valid;
    });

    const handleLabelSizeChange = (size: number) => {
        setDefaultLabelSizeState(size);
        setDefaultLabelSize(size);
        localStorage.setItem(LS_LABELSIZE, String(size));
    };

    const handleLineWidthChange = (width: number) => {
        setLineWidthState(width);
        setDefaultLineWidth(width);
        localStorage.setItem(LS_LINEWIDTH, String(width));
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
                <OpenLayersMap darkMode={darkMode} lineWidth={lineWidth}/>
            </Box>

            <SettingsModal
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                defaultLabelSize={defaultLabelSize}
                onLabelSizeChange={handleLabelSizeChange}
                lineWidth={lineWidth}
                onLineWidthChange={handleLineWidthChange}
                darkMode={darkMode}
                onToggleDarkMode={onToggleDarkMode}
            />
        </Box>
    );
};

export default MapRendering;
