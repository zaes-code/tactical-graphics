/**
 * # What the properties dialog shows must be what the graphic stores
 *
 * `shownLabels` rebuilds the dialog's view of a selected graphic field by field, each one
 * gated on whether that graphic offers the input. A field left out of it does not fail
 * loudly — the value is stored, applied and drawn correctly, and only the *dialog* forgets
 * it, so reopening shows a control that disagrees with the map.
 *
 * It has happened twice: `mineType`, which reopened a mined area with its own type
 * unselected, and `hideAmplifiers`, where a user could switch a graphic to name-only, close
 * the dialog, reopen it and find the switch off over a graphic that was still hiding.
 *
 * The name-only switch is the one control offered for **every** graphic, so unlike the rest
 * it must be copied unconditionally — gating it on a `fields` flag is how it went missing.
 */

import {shownLabels} from './tactical-graphics-dialog';
import {TacticalGraphicName, TacticalGraphicHostility, TacticalGraphicMineType} from '@zaes/tactical-graphics';
import type {SelectedGraphic} from './featurePropertiesSource';

const selectionOf = (graphicName: TacticalGraphicName, labels: Record<string, unknown>) =>
    ({graphicName, labels, measured: {}} as unknown as SelectedGraphic);

describe('shownLabels', () => {
    it('carries the name-only switch back into the dialog', () => {
        const shown = shownLabels(selectionOf(TacticalGraphicName.PhaseLine, {designation: 'BLUE', hideAmplifiers: true}));
        expect(shown.hideAmplifiers).toBe(true);
    });

    it('carries it for a graphic whose field set is nearly empty', () => {
        // The switch is not gated on any `fields` flag, so it survives even where the
        // dialog offers almost nothing else.
        const shown = shownLabels(selectionOf(TacticalGraphicName.Retain, {hideAmplifiers: true}));
        expect(shown.hideAmplifiers).toBe(true);
    });

    it('leaves it undefined when the graphic is not hiding anything', () => {
        expect(shownLabels(selectionOf(TacticalGraphicName.PhaseLine, {designation: 'BLUE'})).hideAmplifiers).toBeUndefined();
    });

    it('still carries the selectors that went missing before it', () => {
        // A real value on both sides: `toBe(undefined)` against a mistyped enum member
        // passes for the wrong reason, which is how this assertion first went green.
        const shown = shownLabels(
            selectionOf(TacticalGraphicName.MinedAreaFenced, {mineType: TacticalGraphicMineType.antitank, hostility: TacticalGraphicHostility.friend}),
        );
        expect(TacticalGraphicMineType.antitank).toBeDefined();
        expect(shown.mineType).toBe(TacticalGraphicMineType.antitank);
    });
});
