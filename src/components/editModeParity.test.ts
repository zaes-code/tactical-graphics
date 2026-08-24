/**
 * # Edit mode is stated twice, so the two statements have to agree
 *
 * `edit` is one button in one panel, and both engines answer it — OpenLayers through
 * `TacticalGraphicsManager` and a numeric `InteractionType`, MapLibre through
 * `MapLibreInteractions` and a string union. That is the shape of defect this repository
 * keeps finding: one fact, two implementations, and no test between them.
 *
 * It has already bitten this exact feature once. All four of the OpenLayers drag paths
 * switch on the manager's mode, and adding an affordance-driven gesture meant every one
 * of them had to read the *effective* mode instead. Three of the four would have kept
 * working — they are only reached in modes an affordance does not latch — and the fourth
 * silently did nothing. A refusal is invisible: the user drags the rotate button, the
 * graphic sits still, and there is no error.
 *
 * So this file asserts the things a host relies on being true of **both** engines, from
 * the portable vocabulary rather than from either implementation.
 */

import {
    HANDLE_EDIT_MODES,
    TacticalGraphicName,
    allowedGestures,
    boundsOf,
    listTacticalGraphicNames,
    unionBounds,
    type EditMode,
    type GestureKind,
} from '@zaes/tactical-graphics';
import {InteractionType} from './openlayers/TacticalGraphicsManager';
import type {EditMode as MapLibreEditMode} from './maplibre/interaction/MapLibreInteractions';

/** Every name the registry knows that also has an enum member. */
const names = listTacticalGraphicNames().filter(
    (name): name is TacticalGraphicName => name in TacticalGraphicName,
);

describe('the two engines mean the same thing by a mode', () => {
    /**
     * A compile-time assertion as much as a runtime one: if either engine's union stops
     * carrying a member of the portable one, this file stops type-checking.
     */
    it('carries every portable mode on the OpenLayers enum', () => {
        const modes: EditMode[] = ['view', 'edit', 'translate', 'rotate', 'resize', 'modify', 'drawing'];
        for (const mode of modes) {
            expect(InteractionType[mode]).toBeDefined();
        }
    });

    it('carries edit on the MapLibre union', () => {
        const mode: MapLibreEditMode = 'edit';
        expect(mode).toBe('edit');
    });

    it('counts edit among the handle-bearing modes, for both', () => {
        expect(HANDLE_EDIT_MODES).toContain('edit');
        // The four it subsumes stay handle-bearing: they are published surface and a
        // consumer may still drive them directly.
        expect(HANDLE_EDIT_MODES).toEqual(expect.arrayContaining(['translate', 'rotate', 'resize', 'modify']));
    });

    /**
     * `view` must never wear handles, on either engine. It is the mode the map returns
     * to after a draw and the one a host uses to make the picture read-only.
     */
    it('never wears handles in view or while drawing', () => {
        expect(HANDLE_EDIT_MODES).not.toContain('view');
        expect(HANDLE_EDIT_MODES).not.toContain('drawing');
    });
});

describe('the affordances a graphic offers', () => {
    const KINDS: GestureKind[] = ['translate', 'rotate', 'resize'];

    /**
     * The whole basis of the edit chrome: a host builds its buttons from this table, so
     * every registered name has to have an answer and every answer has to be a boolean.
     * A name that threw would put an error between the operator and their selection.
     */
    it('is answerable for every registered graphic', () => {
        expect(names.length).toBeGreaterThan(200);
        for (const name of names) {
            const gestures = allowedGestures(name);
            for (const kind of KINDS) expect(typeof gestures[kind]).toBe('boolean');
        }
    });

    /**
     * **Every graphic offers at least one gesture.** A selection with no affordances at
     * all draws a box with nothing on it, which reads as broken rather than as
     * restricted — and there is no symbol in the standard that can be neither moved,
     * turned, scaled nor reshaped.
     */
    it('leaves no graphic with nothing to offer', () => {
        for (const name of names) {
            const gestures = allowedGestures(name);
            const offered = KINDS.some(kind => gestures[kind]) || gestures.modify;
            expect({name, offered}).toEqual({name, offered: true});
        }
    });

    /** Everything can be moved. A symbol pinned to a spot it cannot be dragged off is
     * a symbol placed by mistake with no remedy. */
    it('always offers a move', () => {
        for (const name of names) expect({name, translate: allowedGestures(name).translate}).toEqual({name, translate: true});
    });

    /**
     * The doctrinal refusals, pinned by name.
     *
     * These are the cases the affordance layer exists to express, and pinning them is
     * how a change to `ROTATE_ONLY_SYMBOLS` or `RESIZE_ONLY_SYMBOLS` becomes a decision
     * rather than an accident. @see ai/decisions.md
     */
    it.each([
        // Security operations mark a screening force, not an extent of ground.
        [TacticalGraphicName.Cover, {rotate: true, resize: false}],
        [TacticalGraphicName.Guard, {rotate: true, resize: false}],
        [TacticalGraphicName.Screen, {rotate: true, resize: false}],
        // One doctrinal orientation each: an X turned 45° is a different symbol.
        [TacticalGraphicName.Destroy, {rotate: false, resize: true}],
        [TacticalGraphicName.Interdict, {rotate: false, resize: true}],
        [TacticalGraphicName.Neutralize, {rotate: false, resize: true}],
        [TacticalGraphicName.Suppress, {rotate: false, resize: true}],
        [TacticalGraphicName.Airfield, {rotate: false, resize: true}],
        [TacticalGraphicName.RoadblockCompleteExecuted, {rotate: false, resize: true}],
    ] as const)('refuses what %s has always refused', (name, expected) => {
        const gestures = allowedGestures(name);
        expect({rotate: gestures.rotate, resize: gestures.resize}).toEqual(expected);
    });
});

describe('the selection box is measured the same way on both engines', () => {
    /**
     * `boundsOf` is the shared measurement, promoted out of the MapLibre adapter so
     * OpenLayers could stop having no generic answer to "how big is this graphic".
     * Both engines convert *this* box to screen pixels; a second implementation is how
     * the chrome would end up in two different places.
     */
    it('measures a line', () => {
        expect(boundsOf({type: 'LineString', coordinates: [[0, 0], [10, 4]]})).toEqual({minX: 0, minY: 0, maxX: 10, maxY: 4});
    });

    it('measures a ring, closing vertex included', () => {
        expect(boundsOf({type: 'Polygon', coordinates: [[[1, 1], [5, 1], [5, 3], [1, 3], [1, 1]]]}))
            .toEqual({minX: 1, minY: 1, maxX: 5, maxY: 3});
    });

    it('measures a point as a box of no size', () => {
        expect(boundsOf({type: 'Point', coordinates: [7, -2]})).toEqual({minX: 7, minY: -2, maxX: 7, maxY: -2});
    });

    /**
     * Not a zero-size box at the origin, which would put the chrome in the Gulf of
     * Guinea rather than nowhere. @see boundsOf
     */
    it('has no answer for an empty geometry', () => {
        expect(boundsOf(undefined)).toBeUndefined();
        expect(boundsOf({type: 'LineString', coordinates: []})).toBeUndefined();
    });

    /** A graphic is line work *plus* labels, and a box round only the line work clips
     * the amplifiers hanging outside it. */
    it('unions the parts a graphic is drawn from', () => {
        const line = boundsOf({type: 'LineString', coordinates: [[0, 0], [4, 4]]});
        const label = boundsOf({type: 'Point', coordinates: [-3, 9]});
        expect(unionBounds(line, label)).toEqual({minX: -3, minY: 0, maxX: 4, maxY: 9});
    });

    it('skips the parts a graphic does not have', () => {
        const line = boundsOf({type: 'LineString', coordinates: [[0, 0], [4, 4]]});
        expect(unionBounds(line, undefined)).toEqual({minX: 0, minY: 0, maxX: 4, maxY: 4});
        expect(unionBounds(undefined, undefined)).toBeUndefined();
    });
});
