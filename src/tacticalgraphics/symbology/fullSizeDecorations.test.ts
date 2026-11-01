/**
 * A host can keep decorations whole on a small graphic. @see getFullSizeDecorations
 */

import {configureTacticalGraphics, resetTacticalGraphicsConfig} from '../core/config';
import {decorationScale} from './decorations';

// A line 60 px long on screen: too short to carry a 10 px tooth at full size.
const SHORT: [number, number][] = [
    [0, 0],
    [60, 0],
];

afterEach(() => resetTacticalGraphicsConfig());

describe('fullSizeDecorations', () => {
    it('shrinks a decoration to fit a short line by default', () => {
        expect(decorationScale(SHORT, false, 1, 10)).toBeLessThan(1);
    });

    it('keeps it whole when the host asks', () => {
        configureTacticalGraphics({fullSizeDecorations: true});
        expect(decorationScale(SHORT, false, 1, 10)).toBe(1);
    });
});
