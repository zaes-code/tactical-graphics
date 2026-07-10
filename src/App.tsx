import React, {useState} from 'react';
import './App.css';
import MapRendering from './components/MapRendering';
import {createTheme, ThemeProvider} from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import {setDarkModeFlag} from './settings';

function buildTheme(dark: boolean) {
    return createTheme({
        palette: {
            mode: dark ? 'dark' : 'light',
            background: dark
                ? {default: '#0d1117', paper: '#161b22'}
                : {default: '#f6f8fa', paper: '#ffffff'},
            primary: {
                main: '#3fb950',
                dark: '#238636',
                contrastText: dark ? '#0d1117' : '#ffffff',
            },
            secondary: {main: '#388bfd'},
            error: {main: '#f85149'},
            warning: {main: '#d29922'},
            divider: dark ? '#30363d' : '#d0d7de',
            text: dark
                ? {primary: '#c9d1d9', secondary: '#8b949e'}
                : {primary: '#24292f', secondary: '#57606a'},
        },
        typography: {
            fontFamily: "'Inter', 'Segoe UI', 'Roboto', -apple-system, sans-serif",
            fontSize: 13,
            h6: {fontWeight: 700, letterSpacing: '0.04em'},
        },
        shape: {borderRadius: 6},
        components: {
            MuiPaper: {
                styleOverrides: {
                    root: {
                        backgroundImage: 'none',
                        border: `1px solid ${dark ? '#30363d' : '#d0d7de'}`,
                    },
                },
            },
            MuiButton: {
                styleOverrides: {root: {textTransform: 'none', fontWeight: 600}},
            },
            MuiToggleButton: {
                styleOverrides: {
                    root: {
                        textTransform: 'none',
                        fontWeight: 600,
                        border: `1px solid ${dark ? '#30363d' : '#d0d7de'}`,
                        color: dark ? '#8b949e' : '#57606a',
                        '&.Mui-selected': {
                            color: '#3fb950',
                            backgroundColor: dark ? '#0d2818' : '#dafbe1',
                            borderColor: '#238636',
                        },
                        '&.Mui-selected:hover': {
                            backgroundColor: dark ? '#112b1a' : '#ccffd8',
                        },
                    },
                },
            },
            MuiAutocomplete: {
                styleOverrides: {
                    paper: {
                        border: `1px solid ${dark ? '#30363d' : '#d0d7de'}`,
                        backgroundColor: dark ? '#161b22' : '#ffffff',
                    },
                    groupLabel: {
                        backgroundColor: dark ? '#0d1117' : '#f6f8fa',
                        color: '#3fb950',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase' as const,
                        paddingTop: 8,
                        paddingBottom: 4,
                        lineHeight: '1.4',
                    },
                },
            },
            MuiOutlinedInput: {
                styleOverrides: {
                    root: {
                        '& fieldset': {borderColor: dark ? '#30363d' : '#d0d7de'},
                        '&:hover fieldset': {borderColor: dark ? '#8b949e' : '#57606a'},
                        '&.Mui-focused fieldset': {borderColor: '#3fb950'},
                    },
                },
            },
        },
    });
}

const LS_DARK_MODE = 'tg_darkMode';

function App() {
    const [darkMode, setDarkMode] = useState(() => {
        const stored = localStorage.getItem(LS_DARK_MODE);
        const dark = stored !== null ? stored === 'true' : true;
        setDarkModeFlag(dark);
        return dark;
    });

    const handleToggleDarkMode = () => {
        setDarkMode(d => {
            const next = !d;
            setDarkModeFlag(next);
            localStorage.setItem(LS_DARK_MODE, String(next));
            return next;
        });
    };

    return (
        <ThemeProvider theme={buildTheme(darkMode)}>
            <CssBaseline/>
            <div className="App">
                <MapRendering darkMode={darkMode} onToggleDarkMode={handleToggleDarkMode}/>
            </div>
        </ThemeProvider>
    );
}

export default App;
