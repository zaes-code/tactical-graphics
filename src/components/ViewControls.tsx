import React, {useEffect, useState} from 'react';
import {Divider, IconButton, Paper, Tooltip} from '@mui/material';
import NavigationIcon from '@mui/icons-material/Navigation';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import RotateLeftIcon from '@mui/icons-material/RotateLeft';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import type {ViewCamera} from './mapEngine';

/** Degrees per click. A tilt step small enough to aim with, a turn a sixteenth of a circle. */
const TILT_STEP = 15;
const TURN_STEP = 22.5;

/**
 * Tilt and turn buttons for a 3D view.
 *
 * Both 3D views take a right-drag or Ctrl+drag to tilt, which a trackpad or touch user may
 * not have. These do the same from clicks. The compass points north and turns the view back
 * to it, which is also the way out of a view that has been turned and lost.
 */
const ViewControls: React.FC<{camera: ViewCamera}> = ({camera}) => {
    const [bearing, setBearing] = useState(() => camera.bearing());

    // Polled, not subscribed: the two engines report camera motion differently, and one
    // number read per frame is cheaper than either engine's event plumbing.
    useEffect(() => {
        let frame = 0;
        const read = () => {
            const next = camera.bearing();
            setBearing(previous => (Math.abs(previous - next) > 0.5 ? next : previous));
            frame = requestAnimationFrame(read);
        };
        frame = requestAnimationFrame(read);
        return () => cancelAnimationFrame(frame);
    }, [camera]);

    const button = (title: string, onClick: () => void, icon: React.ReactNode) => (
        <Tooltip title={title} placement="left">
            <IconButton size="small" onClick={onClick} aria-label={title} sx={{color: 'text.secondary', '&:hover': {color: 'primary.main'}}}>
                {icon}
            </IconButton>
        </Tooltip>
    );

    return (
        <Paper
            elevation={0}
            sx={{
                position: 'absolute',
                top: 12,
                right: 12,
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                p: 0.25,
                borderRadius: 1.5,
                backgroundColor: 'background.paper',
            }}
        >
            {button('Turn back to north', camera.resetNorth, <NavigationIcon fontSize="small" sx={{transform: `rotate(${-bearing}deg)`}}/>)}
            <Divider flexItem sx={{my: 0.25}}/>
            {button('Tilt toward the horizon', () => camera.tilt(TILT_STEP), <KeyboardArrowUpIcon fontSize="small"/>)}
            {button('Tilt toward overhead', () => camera.tilt(-TILT_STEP), <KeyboardArrowDownIcon fontSize="small"/>)}
            <Divider flexItem sx={{my: 0.25}}/>
            {button('Turn left', () => camera.turn(-TURN_STEP), <RotateLeftIcon fontSize="small"/>)}
            {button('Turn right', () => camera.turn(TURN_STEP), <RotateRightIcon fontSize="small"/>)}
        </Paper>
    );
};

export default ViewControls;
