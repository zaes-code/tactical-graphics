import React from 'react';
import {
    Box,
    Dialog,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    InputAdornment,
    MenuItem,
    Select,
    SelectChangeEvent,
    Switch,
    TextField,
    Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import {MapLibrary} from './mapLibrary';

interface SettingsModalProps {
    open: boolean;
    onClose: () => void;
    engine: MapLibrary;
    onEngineChange: (engine: MapLibrary) => void;
    defaultLabelSize: number;
    onLabelSizeChange: (size: number) => void;
    darkMode: boolean;
    onToggleDarkMode: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
    open,
    onClose,
    engine,
    onEngineChange,
    defaultLabelSize,
    onLabelSizeChange,
    darkMode,
    onToggleDarkMode,
}) => {
    const handleEngineChange = (e: SelectChangeEvent<MapLibrary>) => {
        onEngineChange(e.target.value as MapLibrary);
    };

    const handleLabelSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v) && v > 0) onLabelSizeChange(v);
    };

    const rowSx = {display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2};

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="xs"
            fullWidth
            PaperProps={{sx: {borderRadius: 1}}}
        >
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
                    <Typography sx={{fontSize: '0.8rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em'}}>
                        Appearance
                    </Typography>
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

                {/*<Divider/>*/}

                {/* Engine */}
                <Box sx={rowSx}>
                    <Typography sx={{fontSize: '0.8rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 120}}>
                        Engine
                    </Typography>
                    <Select
                        value={engine}
                        onChange={handleEngineChange}
                        size="small"
                        variant="outlined"
                        sx={{fontSize: '0.8rem', minWidth: 160, height: 36}}
                    >
                        {Object.values(MapLibrary).map(val => (
                            <MenuItem key={val} value={val} sx={{fontSize: '0.8rem'}}>
                                {val.charAt(0).toUpperCase() + val.slice(1)}
                            </MenuItem>
                        ))}
                    </Select>
                </Box>

                {/* Default label size */}
                <Box sx={rowSx}>
                    <Box>
                        <Typography sx={{fontSize: '0.8rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em'}}>
                            Label Size
                        </Typography>
                        <Typography sx={{fontSize: '0.7rem', color: 'text.disabled', mt: 0.25}}>
                            Font size at drawing resolution
                        </Typography>
                    </Box>
                    <TextField
                        type="number"
                        value={defaultLabelSize}
                        onChange={handleLabelSizeChange}
                        size="small"
                        inputProps={{min: 10, max: 24, step: 1}}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <Typography sx={{fontSize: '0.75rem', color: 'text.disabled'}}>px</Typography>
                                </InputAdornment>
                            ),
                        }}
                        sx={{
                            width: 100,
                            '& input[type=number]': {MozAppearance: 'textfield'},
                            '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
                                WebkitAppearance: 'none',
                                margin: 0,
                            },
                        }}
                    />
                </Box>

            </DialogContent>
        </Dialog>
    );
};

export default SettingsModal;
