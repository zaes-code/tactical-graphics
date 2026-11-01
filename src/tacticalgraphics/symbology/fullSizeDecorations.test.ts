/**
 * A host can keep decorations whole on a small graphic. @see getFullSizeDecorations
 */

import {configureTacticalGraphics, resetTacticalGraphicsConfig} from '../core/config';
import {decorationScale} from './decorations';
import {antiTankDitchPaint} from './obstaclePaints';
import {TacticalGraphicName} from '../core/type';
import type {PaintContext, PaintFeature} from '../core/paint';

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

describe('a reinforced antitank ditch on a short line', () => {
    const paint = antiTankDitchPaint(TacticalGraphicName.AntiTankDitchReinforcedWithMines);
    const feature: PaintFeature = {
        geometry: {
            type: 'LineString',
            coordinates: [
                [0, 0],
                [40, 0],
            ],
        },
        properties: {name: TacticalGraphicName.AntiTankDitchReinforcedWithMines},
    };
    const context: PaintContext = {resolution: 1, measureText: text => text.length * 8};

    it('keeps its teeth when the host keeps decorations whole', () => {
        configureTacticalGraphics({fullSizeDecorations: true});
        expect(paint(feature, context).length).toBeGreaterThan(1);
    });
});
