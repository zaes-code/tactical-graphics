import React, {useState} from 'react';
import '../styles/map.css';
import OpenLayersMap from './openlayers/OpenLayers';
import MapLibre from './maplibre/MapLibre';
import CesiumMap from './cesium/Cesium';
import LeafletMap from './leaflet/Leaflet';
import {MapLibrary} from './mapLibrary';
import {AppBar, Box, IconButton, Toolbar, Typography} from '@mui/material';
import MapIcon from '@mui/icons-material/Map';
import SettingsIcon from '@mui/icons-material/Settings';
import SettingsModal from './SettingsModal';
import {setDefaultLabelSize} from '../settings';

interface MapRenderingProps {
    darkMode: boolean;
    onToggleDarkMode: () => void;
}

const LS_ENGINE    = 'tg_engine';
const LS_LABELSIZE = 'tg_defaultLabelSize';

const MapRendering: React.FC<MapRenderingProps> = ({darkMode, onToggleDarkMode}) => {
    const [mapState, setMapState] = useState<MapLibrary>(() => {
        const stored = localStorage.getItem(LS_ENGINE);
        return (Object.values(MapLibrary).includes(stored as MapLibrary) ? stored : MapLibrary.OPENLAYERS) as MapLibrary;
    });
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [defaultLabelSize, setDefaultLabelSizeState] = useState(() => {
        const stored = localStorage.getItem(LS_LABELSIZE);
        const size = stored !== null ? parseFloat(stored) : 16;
        const valid = isNaN(size) ? 16 : size;
        setDefaultLabelSize(valid);
        return valid;
    });

    const handleEngineChange = (engine: MapLibrary) => {
        setMapState(engine);
        localStorage.setItem(LS_ENGINE, engine);
    };

    const handleLabelSizeChange = (size: number) => {
        setDefaultLabelSizeState(size);
        setDefaultLabelSize(size);
        localStorage.setItem(LS_LABELSIZE, String(size));
    };

    const renderMap = () => {
        switch (mapState) {
            case MapLibrary.OPENLAYERS: return <OpenLayersMap darkMode={darkMode}/>;
            case MapLibrary.MAPLIBRE:   return <MapLibre/>;
            case MapLibrary.CESIUM:     return <CesiumMap/>;
            case MapLibrary.LEAFLET:    return <LeafletMap/>;
            default:                    return <OpenLayersMap darkMode={darkMode}/>;
        }
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
                            MIL-STD-2525E
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
                {renderMap()}
            </Box>

            <SettingsModal
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                engine={mapState}
                onEngineChange={handleEngineChange}
                defaultLabelSize={defaultLabelSize}
                onLabelSizeChange={handleLabelSizeChange}
                darkMode={darkMode}
                onToggleDarkMode={onToggleDarkMode}
            />
        </Box>
    );
};

export default MapRendering;
