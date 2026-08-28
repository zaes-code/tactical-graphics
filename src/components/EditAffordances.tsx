/**
 * # The edit chrome: one dashed box, and the gestures that symbol accepts
 *
 * What the operator sees in `edit` mode once they have clicked a graphic — an inert
 * dashed rectangle around it, with a move / rotate / resize button on the frame.
 *
 * ## Why this is DOM and not map features
 *
 * Every other piece of editor chrome in this library — handles, the measure read-out,
 * the sketch — is drawn *by* the renderer, and is therefore written twice: once as an
 * OpenLayers `StyleFunction` and once as a MapLibre layer. That is the cost of putting
 * a mark on the map, and for a handle it is worth paying, because a handle has to be
 * hit-tested against geometry the renderer owns.
 *
 * These are buttons. They need hover states, cursors, focus rings, tooltips and icons,
 * all of which the DOM has and neither canvas does, and they are hit-tested against
 * *themselves*. So they are rendered once, above both maps, and the only things either
 * engine has to supply are a rectangle in screen pixels — {@link SelectionBox} — and a
 * door to start a gesture through: `beginGesture`. That is two small methods per
 * engine instead of a second implementation of every affordance.
 *
 * ## Which buttons appear
 *
 * Exactly the gestures the symbol accepts, from `allowedGestures(name)` by way of the
 * façade's `selectionGestures()`. A security operation marks a screening force rather
 * than an extent of ground, so it shows no resize; the crossed mission tasks and the
 * airfield have one doctrinal orientation, so they show no rotate.
 *
 * **A refused gesture is not drawn at all**, rather than drawn and disabled. A refusal
 * is invisible in the worst way — the user drags, nothing moves, and there is no error
 * — and a control that is present but dead invites exactly that discovery. What the
 * symbol will not do is simply not offered. @see ai/decisions.md, "A gesture refusal
 * that lives in a controller is invisible to the other engine"
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Box, Tooltip} from '@mui/material';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import RotateLeftIcon from '@mui/icons-material/RotateLeft';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
import type {AllowedGestures, GestureKind, SelectionBox} from '@zaes/tactical-graphics';
import type {MapEngineHandle} from './mapEngine';

/**
 * How far outside the graphic's own extent the box sits, in pixels.
 *
 * Enough that the dashes never run along the symbol's own line work, where the two read
 * as one shape and the box stops looking like a container.
 */
const BOX_PADDING_PX = 14;

const BUTTON_PX = 28;

/**
 * The gap between the frame and the buttons hung off it, in pixels.
 *
 * **The buttons sit wholly outside the frame, never centred on its corners.** Centred,
 * a 28 px button reaches 14 px inward — past the 12 px padding and onto the graphic's
 * own corner, which is exactly where a line's endpoint handle is. It covered that
 * handle, and a covered handle is an uneditable one: the click lands on a button that
 * starts a whole-graphic gesture instead of the vertex drag the user aimed at.
 */
const BUTTON_GAP_PX = 4;

/** How far outside the frame a button's near edge starts. */
const BUTTON_OFFSET_PX = BUTTON_PX + BUTTON_GAP_PX;

/** How close to the map's own edge a clamped button may sit, in pixels. */
const EDGE_MARGIN_PX = 8;

type Corner = 'top-left' | 'top-right' | 'bottom-right';

/**
 * The buttons, and where each sits on the frame.
 *
 * Move is top-left because it is the one a user reaches for most and the top-left is
 * where a selection's origin reads from; resize is bottom-right, matching the corner
 * every windowing system puts a size grip on; rotate takes the remaining top corner.
 */
const AFFORDANCES: {kind: GestureKind; label: string; Icon: typeof OpenWithIcon; corner: Corner}[] = [
    {kind: 'translate', label: 'Move', Icon: OpenWithIcon, corner: 'top-left'},
    {kind: 'rotate', label: 'Rotate', Icon: RotateLeftIcon, corner: 'top-right'},
    {kind: 'resize', label: 'Resize', Icon: ZoomOutMapIcon, corner: 'bottom-right'},
];

interface EditAffordancesProps {
    /** The engine, or null before it is ready. */
    engine: MapEngineHandle | null;
    /** True only in `edit` mode; nothing is drawn otherwise. */
    active: boolean;
}

export default function EditAffordances({engine, active}: EditAffordancesProps) {
    const [box, setBox] = useState<SelectionBox | undefined>();
    const [gestures, setGestures] = useState<AllowedGestures | null>(null);
    /**
     * The map area, so the buttons can be kept inside it.
     *
     * A full-bleed wrapper rather than a measurement passed down: it is the same element
     * the buttons are positioned in, so its size is by definition the space they have.
     */
    const frameRef = useRef<HTMLDivElement | null>(null);
    const [frame, setFrame] = useState<{width: number; height: number}>({width: 0, height: 0});

    /**
     * Re-measures the box.
     *
     * Cheap enough to run per animation frame: it is two projections of an extent the
     * engine already holds. Deliberately *not* cached against the selection id — the
     * box moves when the graphic does, and a rotate changes it on every frame.
     */
    const measure = useCallback(() => {
        if (!engine || !active) {
            setBox(undefined);
            setGestures(null);
            return;
        }
        setBox(engine.selectionBox());
        setGestures(engine.selectionGestures());
        const element = frameRef.current;
        if (element) setFrame({width: element.clientWidth, height: element.clientHeight});
    }, [engine, active]);

    /**
     * Follow the map.
     *
     * The box is a screen measurement, so every pan, zoom and window resize invalidates
     * it — and a gesture in progress moves the graphic under it on every frame. A rAF
     * loop while the chrome is on screen is the honest way to track all of that: the
     * alternative is to guess at each engine's own set of move events, which are not the
     * same two sets, and to miss the frames of a drag entirely.
     *
     * React bails on an unchanged value, so the loop only re-renders when the numbers
     * actually move — but `selectionBox` returns a fresh object each call, so the
     * comparison has to be on the fields. Hence the functional update below.
     */
    useEffect(() => {
        if (!active || !engine) return;
        let frame = requestAnimationFrame(function tick() {
            measure();
            frame = requestAnimationFrame(tick);
        });
        return () => cancelAnimationFrame(frame);
    }, [active, engine, measure]);

    /*
     * The wrapper is always mounted while editing, so it can be measured before there is
     * a box to draw. Returning null earlier left `frame` at 0x0 on the first frame, and
     * every button clamped to the top-left corner.
     */
    const ready = active && box && gestures;
    const offered = ready ? AFFORDANCES.filter(affordance => gestures![affordance.kind]) : [];

    /**
     * Where a button sits, in **frame** coordinates, clamped into view.
     *
     * ## Why clamping is not cosmetic
     *
     * The buttons hang off the corners of the selection box, and that box is the
     * graphic's extent — which is routinely larger than the window. An air corridor
     * drawn across the viewport put its resize button 115 px below the bottom of a
     * 950 px page, where it cannot be pressed at all: the graphic was selected, the
     * affordance was rendered, and the gesture was simply unreachable. A user who zooms
     * in on any large graphic hits this.
     *
     * So each button is pinned inside the frame with a margin. It stays on the edge
     * nearest where it belongs, which keeps its meaning readable — the resize button is
     * still the bottom-right one — while remaining clickable.
     */
    const place = (corner: Corner) => {
        const left = box!.x - BOX_PADDING_PX;
        const top = box!.y - BOX_PADDING_PX;
        const right = left + box!.width + BOX_PADDING_PX * 2;
        const bottom = top + box!.height + BOX_PADDING_PX * 2;

        const rawX = corner.endsWith('left') ? left - BUTTON_OFFSET_PX : right + BUTTON_GAP_PX;
        const rawY = corner.startsWith('top') ? top - BUTTON_OFFSET_PX : bottom + BUTTON_GAP_PX;

        const maxX = Math.max(EDGE_MARGIN_PX, frame.width - BUTTON_PX - EDGE_MARGIN_PX);
        const maxY = Math.max(EDGE_MARGIN_PX, frame.height - BUTTON_PX - EDGE_MARGIN_PX);
        return {
            left: Math.min(Math.max(rawX, EDGE_MARGIN_PX), maxX),
            top: Math.min(Math.max(rawY, EDGE_MARGIN_PX), maxY),
        };
    };

    return (
        <Box
            ref={frameRef}
            sx={{
                position: 'absolute',
                inset: 0,
                /*
                 * The frame is inert: it is a boundary, not a control. A rectangle that
                 * swallowed clicks would make every graphic unselectable and would eat
                 * the handle drags that are the other half of editing. Only the buttons
                 * opt back in.
                 */
                pointerEvents: 'none',
                zIndex: 900,
                overflow: 'hidden',
            }}
        >
            {ready && (
                <Box
                    sx={{
                        position: 'absolute',
                        left: box!.x - BOX_PADDING_PX,
                        top: box!.y - BOX_PADDING_PX,
                        width: box!.width + BOX_PADDING_PX * 2,
                        height: box!.height + BOX_PADDING_PX * 2,
                        border: '1px dashed',
                        /*
                         * The inert-handle grey, stated the same way the library states it
                         * for the centre dot and the measure line: chrome that marks
                         * something rather than chrome you can grab.
                         */
                        borderColor: 'rgba(130,130,130,0.9)',
                        pointerEvents: 'none',
                    }}
                />
            )}

            {offered.map(({kind, label, Icon, corner}) => (
                <Tooltip key={kind} title={label} placement="top">
                    <Box
                        role="button"
                        aria-label={label}
                        onPointerDown={event => {
                            /*
                             * The map must not also see this. A `pointerdown` that reaches
                             * OpenLayers' `Pointer` interaction starts a second, competing
                             * drag; on MapLibre it pans the map out from under the gesture.
                             */
                            event.preventDefault();
                            event.stopPropagation();
                            engine?.beginGesture(kind, event.nativeEvent);
                        }}
                        sx={{
                            position: 'absolute',
                            ...place(corner),
                            pointerEvents: 'auto',
                            width: BUTTON_PX,
                            height: BUTTON_PX,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '50%',
                            cursor: 'grab',
                            bgcolor: 'background.paper',
                            border: '1px solid',
                            borderColor: 'divider',
                            boxShadow: 2,
                            '&:hover': {bgcolor: 'action.hover'},
                            '&:active': {cursor: 'grabbing'},
                        }}
                    >
                        <Icon sx={{fontSize: 16}}/>
                    </Box>
                </Tooltip>
            ))}
        </Box>
    );
}
