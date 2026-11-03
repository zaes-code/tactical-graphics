/**
 * # Delete and Opacity in the properties dialog
 *
 * The demo's controls for `remove` and `setOpacity`. Opacity applies the moment the slider
 * moves, as "name only" does, so OK is reachable after it and Cancel takes it back. Delete takes
 * the graphic off through the source and closes the dialog.
 */

import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import TacticalGraphicsDialog from './tactical-graphics-dialog';
import type {FeaturePropertiesSource, SelectedGraphic} from './featurePropertiesSource';

function fakeSource(opened = 1) {
    let select: ((s: SelectedGraphic | null) => void) | undefined;
    const calls: string[] = [];
    const source: FeaturePropertiesSource = {
        onSelect: callback => {
            select = callback;
            return () => undefined;
        },
        anchorPixel: () => undefined,
        apply: () => void calls.push('apply'),
        setAmplifiersHidden: () => undefined,
        remove: s => void calls.push(`remove ${s.id}`),
        setOpacity: (s, value) => void calls.push(`opacity ${s.id} ${value}`),
        opacityOf: () => opened,
    };
    const graphic: SelectedGraphic = {
        id: 'pl-1',
        graphicName: TacticalGraphicName.PhaseLine,
        labels: {designation: 'BLUE'},
        echelon: '',
        measured: {},
    } as SelectedGraphic;
    return {source, calls, open: () => act(() => select!(graphic))};
}

const slider = () => screen.getByRole('slider') as HTMLInputElement;

describe('the properties dialog', () => {
    it('shows the graphic at the opacity it is drawn at', () => {
        const {source, open} = fakeSource(0.5);
        render(<TacticalGraphicsDialog source={source} />);
        open();
        expect(slider().value).toBe('0.5');
        expect(screen.getByText('Opacity 50%')).toBeTruthy();
    });

    it('applies opacity at once, lets OK through, and Cancel puts it back', () => {
        const {source, calls, open} = fakeSource();
        render(<TacticalGraphicsDialog source={source} />);
        open();
        expect((screen.getByRole('button', {name: 'OK'}) as HTMLButtonElement).disabled).toBe(true);

        fireEvent.change(slider(), {target: {value: 0.4}});
        expect(calls).toEqual(['opacity pl-1 0.4']);
        expect((screen.getByRole('button', {name: 'OK'}) as HTMLButtonElement).disabled).toBe(false);

        fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
        expect(calls).toEqual(['opacity pl-1 0.4', 'opacity pl-1 1']);
        expect(screen.queryByRole('slider')).toBeNull();
    });

    it('deletes the graphic through the source and closes', () => {
        const {source, calls, open} = fakeSource();
        render(<TacticalGraphicsDialog source={source} />);
        open();
        fireEvent.click(screen.getByRole('button', {name: 'Delete'}));
        expect(calls).toEqual(['remove pl-1']);
        expect(screen.queryByRole('button', {name: 'Delete'})).toBeNull();
    });
});
