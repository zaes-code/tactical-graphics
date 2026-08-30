/**
 * # What the properties dialog shows must be what the graphic stores
 *
 * `shownLabels` rebuilds the dialog's view of a selected graphic field by field, each one
 * gated on whether that graphic offers the input. A field left out of it does not fail
 * loudly — the value is stored, applied and drawn correctly, and only the *dialog* forgets
 * it, so reopening shows a control that disagrees with the map. That is what happened to
 * `mineType`, which reopened a mined area with its own type unselected.
 *
 * The name-only switch is **not** in here any more. It never described the symbol, so it
 * came off the graphic entirely on 2026-08-30 and the host keeps it — see
 * `amplifierVisibility.test.ts` for that half. This suite guards the amplifiers that *are*
 * the graphic's.
 */

import {shownLabels} from './tactical-graphics-dialog';
import {TacticalGraphicName, TacticalGraphicHostility, TacticalGraphicMineType} from '@zaes/tactical-graphics';
import type {SelectedGraphic} from './featurePropertiesSource';

const selectionOf = (graphicName: TacticalGraphicName, labels: Record<string, unknown>) =>
    ({graphicName, labels, measured: {}}) as unknown as SelectedGraphic;

describe('shownLabels', () => {
    it('carries the selectors that went missing before', () => {
        const shown = shownLabels(
            selectionOf(TacticalGraphicName.MinedAreaFenced, {
                mineType: TacticalGraphicMineType.antitank,
                hostility: TacticalGraphicHostility.friend,
            }),
        );
        expect(TacticalGraphicMineType.antitank).toBeDefined();
        expect(shown.mineType).toBe(TacticalGraphicMineType.antitank);
    });

    it('carries the designation a graphic offers', () => {
        expect(shownLabels(selectionOf(TacticalGraphicName.PhaseLine, {designation: 'BLUE'})).designation).toBe('BLUE');
    });

    it('carries the affiliation, which every graphic has', () => {
        const shown = shownLabels(selectionOf(TacticalGraphicName.PhaseLine, {designation: 'BLUE', hostility: TacticalGraphicHostility.hostileFaker}));
        expect(shown.hostility).toBe(TacticalGraphicHostility.hostileFaker);
    });
});
