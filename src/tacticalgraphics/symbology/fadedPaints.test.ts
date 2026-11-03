/**
 * Fading a paint list for a host that dims one graphic. @see withFadedPaints
 */

import type {Paint} from '../core/paint';
import {fadeColor, withOpacity} from '../core/symbology';
import {withFadedPaints} from './paintFunctions';

describe('fadeColor', () => {
    it('multiplies the alpha a color already has', () => {
        expect(fadeColor('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
        expect(fadeColor('rgba(0, 0, 255, 0.2)', 0.5)).toBe('rgba(0, 0, 255, 0.1)');
        expect(fadeColor('rgb(1, 2, 3)', 0.25)).toBe('rgba(1, 2, 3, 0.25)');
        expect(fadeColor('#00000080', 0.5)).toBe(`rgba(0, 0, 0, ${(128 / 255) * 0.5})`);
    });

    it('leaves a form it cannot read alone', () => {
        expect(fadeColor('hsl(0, 100%, 50%)', 0.5)).toBe('hsl(0, 100%, 50%)');
        expect(fadeColor('transparent', 0.5)).toBe('transparent');
    });

    it('leaves withOpacity setting, not multiplying, the alpha', () => {
        expect(withOpacity('rgba(0, 0, 255, 0.2)', 0.5)).toBe('rgba(0, 0, 255, 0.5)');
        expect(withOpacity('#f00', 0.3)).toBe('rgba(255, 0, 0, 0.3)');
    });
});

describe('withFadedPaints', () => {
    const geometry = {type: 'Point', coordinates: [0, 0]} as Paint['geometry'];
    const paints: Paint[] = [
        {geometry, stroke: {color: '#000000', widthPx: 2}},
        {geometry, fill: {color: 'rgba(255, 0, 0, 0.18)', pattern: {kind: 'diagonal', color: '#ff0000', sizePx: 8, lineWidthPx: 1}}},
        {geometry, circle: {radiusPx: 3, fill: {color: '#ffffff'}, stroke: {color: '#000000', widthPx: 1}}},
        {geometry, text: {text: 'PL BLUE', font: 'bold 16px sans-serif', fill: '#000000', halo: {color: '#ffffff', widthPx: 2}}},
    ] as Paint[];

    it('returns the same list when there is nothing to fade', () => {
        expect(withFadedPaints(paints, undefined)).toBe(paints);
        expect(withFadedPaints(paints, 1)).toBe(paints);
    });

    it('fades every color in every mark, keeping each one relative to the others', () => {
        const [stroke, fill, circle, text] = withFadedPaints(paints, 0.5);
        expect(stroke.stroke?.color).toBe('rgba(0, 0, 0, 0.5)');
        expect(fill.fill?.color).toBe('rgba(255, 0, 0, 0.09)');
        expect(fill.fill?.pattern?.color).toBe('rgba(255, 0, 0, 0.5)');
        expect(circle.circle?.fill?.color).toBe('rgba(255, 255, 255, 0.5)');
        expect(circle.circle?.stroke?.color).toBe('rgba(0, 0, 0, 0.5)');
        expect(text.text?.fill).toBe('rgba(0, 0, 0, 0.5)');
        expect(text.text?.halo?.color).toBe('rgba(255, 255, 255, 0.5)');
        // The input is not touched.
        expect(paints[0].stroke?.color).toBe('#000000');
    });
});
