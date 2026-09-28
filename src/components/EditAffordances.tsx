/**
 * # The edit chrome: the library's own edit controls, themed for the demo
 *
 * The dashed box and its move / rotate / resize buttons are `attachEditControls` from
 * `@zaes/tactical-graphics/edit-controls`, the same plain-DOM controls a customer gets, so the
 * demo exercises what ships rather than a copy of it. All this adds is the MUI theme's colors,
 * passed as the controls' CSS custom properties, and the demo's own notion of when editing is on.
 *
 * They are DOM above the map rather than map features, so every engine owes them only a
 * rectangle in screen pixels (`selectionBox`) and a door to start a gesture through
 * (`beginGesture`). A gesture the symbol refuses gets no button at all, rather than a dead
 * one. @see ai/decisions.md, "A gesture refusal that lives in a controller is invisible to the
 * other engine"
 */

import React, {useEffect, useRef} from 'react';
import {Box, useTheme} from '@mui/material';
import {attachEditControls} from '@zaes/tactical-graphics/edit-controls';
import type {MapEngineHandle} from './mapEngine';

interface EditAffordancesProps {
    /** The engine, or null before it is ready. */
    engine: MapEngineHandle | null;
    /** True only in `edit` mode; nothing is drawn otherwise. */
    active: boolean;
}

export default function EditAffordances({engine, active}: EditAffordancesProps) {
    const theme = useTheme();
    const frameRef = useRef<HTMLDivElement | null>(null);
    // Read by the controls every frame, so a mode change needs no re-attach.
    const activeRef = useRef(active);
    activeRef.current = active;

    useEffect(() => {
        const frame = frameRef.current;
        if (!frame || !engine) return;
        const controls = attachEditControls(frame, engine, {isActive: () => activeRef.current});
        return () => controls.destroy();
    }, [engine]);

    return (
        <Box
            ref={frameRef}
            sx={{
                position: 'absolute',
                inset: 0,
                // Inert: only the buttons take the pointer, or no graphic could be selected.
                pointerEvents: 'none',
                zIndex: 900,
                '--tg-edit-button-background': theme.palette.background.paper,
                '--tg-edit-button-color': theme.palette.text.primary,
                '--tg-edit-button-border': theme.palette.divider,
                '--tg-edit-button-hover': theme.palette.grey[theme.palette.mode === 'dark' ? 800 : 100],
            }}
        />
    );
}
