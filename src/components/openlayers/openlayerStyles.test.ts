/**
 * Guards the light/dark palette.
 *
 * Dark mode used to be an accident: all four colour accessors returned the same string
 * on both branches, and the demo's `invert(95%) hue-rotate(180deg) …` filter repainted
 * the graphics canvas along with the basemap because OpenLayers composites consecutive
 * layers that share a className onto one canvas. That filter mapped yellow onto blue
 * and crushed its luminance, so `pending` arrived on screen as a near-black olive.
 *
 * The graphics layer now renders its own colours (see
 * `TacticalGraphicsManager.renderingVectorLayer`), which only works while the palette
 * actually carries two values. These tests hold that line — and hold the one colour
 * that must *not* differ between modes.
 */
import {TacticalGraphicHostility} from '@zaes/tactical-graphics';

import {
    getColorByHostility,
    getDefaultLineColor,
    getHaloStroke,
    getLabelFillColor,
    getLabelHaloColor,
} from './openlayerStyles';
import {isDarkMode, setDarkModeFlag} from '../../settings';

/** Runs `fn` in the given mode and restores whatever was set before. */
function inMode<T>(dark: boolean, fn: () => T): T {
    const previous = isDarkMode();
    setDarkModeFlag(dark);
    try {
        return fn();
    } finally {
        setDarkModeFlag(previous);
    }
}

const BRIGHT_YELLOW = 'rgba(255, 255, 0, 1)';

describe('the pending/suspect yellow is identical in both modes', () => {
    // The whole reason the palette exists. Yellow reads on a dark basemap unchanged, and
    // dimming it here is the exact regression this file was written for.
    it.each([TacticalGraphicHostility.pending, TacticalGraphicHostility.suspectJoker])(
        '%s is bright yellow in light mode',
        hostility => {
            expect(inMode(false, () => getColorByHostility(hostility))).toBe(BRIGHT_YELLOW);
        },
    );

    it.each([TacticalGraphicHostility.pending, TacticalGraphicHostility.suspectJoker])(
        '%s is the same bright yellow in dark mode',
        hostility => {
            expect(inMode(true, () => getColorByHostility(hostility))).toBe(BRIGHT_YELLOW);
        },
    );
});

describe('every other affiliation carries two distinct colours', () => {
    // Assert they *differ*, not what they are: the dark values are a visual judgement and
    // may be retuned, but collapsing back to one value silently restores the old bug.
    const twoToned = [
        TacticalGraphicHostility.friend,
        TacticalGraphicHostility.assumedFriend,
        TacticalGraphicHostility.hostileFaker,
        TacticalGraphicHostility.neutral,
        TacticalGraphicHostility.unknown,
    ];

    it.each(twoToned)('%s differs between modes', hostility => {
        const light = inMode(false, () => getColorByHostility(hostility));
        const dark = inMode(true, () => getColorByHostility(hostility));
        expect(light).not.toBe(dark);
    });

    it('keeps the doctrinal FM 1-02.2 colours in light mode', () => {
        inMode(false, () => {
            expect(getColorByHostility(TacticalGraphicHostility.friend)).toBe('rgba(0, 0, 255, 1)');
            expect(getColorByHostility(TacticalGraphicHostility.hostileFaker)).toBe('rgba(255, 0, 0, 1)');
            expect(getColorByHostility(TacticalGraphicHostility.neutral)).toBe('rgba(0, 128, 0, 1)');
        });
    });

    it('falls back to the default line colour for unknown, in both modes', () => {
        expect(inMode(false, () => getColorByHostility(TacticalGraphicHostility.unknown)))
            .toBe(inMode(false, getDefaultLineColor));
        expect(inMode(true, () => getColorByHostility(TacticalGraphicHostility.unknown)))
            .toBe(inMode(true, getDefaultLineColor));
    });
});

describe('line and label colours invert with the mode', () => {
    it('draws dark lines on light and light lines on dark', () => {
        expect(inMode(false, getDefaultLineColor)).toBe('#000000');
        expect(inMode(true, getDefaultLineColor)).not.toBe('#000000');
    });

    it('fills label text to match the line colour', () => {
        expect(inMode(false, getLabelFillColor)).toBe(inMode(false, getDefaultLineColor));
        expect(inMode(true, getLabelFillColor)).toBe(inMode(true, getDefaultLineColor));
    });

    it('contrasts the halo against the text it outlines', () => {
        expect(inMode(false, getLabelHaloColor)).not.toBe(inMode(false, getLabelFillColor));
        expect(inMode(true, getLabelHaloColor)).not.toBe(inMode(true, getLabelFillColor));
    });
});

describe('getHaloStroke', () => {
    // It was a module-level `const`, so its colour was frozen at import and could never
    // follow a toggle — invisible while both branches returned white, a real bug the
    // moment they diverged. A toggle made *after* import has to be reflected.
    it('reflects a mode change made after module load', () => {
        const light = inMode(false, () => getHaloStroke().getColor());
        const dark = inMode(true, () => getHaloStroke().getColor());
        expect(light).not.toBe(dark);
    });

    it('matches getLabelHaloColor in each mode', () => {
        expect(inMode(false, () => getHaloStroke().getColor())).toBe(inMode(false, getLabelHaloColor));
        expect(inMode(true, () => getHaloStroke().getColor())).toBe(inMode(true, getLabelHaloColor));
    });

    it('caches one Stroke per mode rather than allocating per call', () => {
        expect(inMode(true, getHaloStroke)).toBe(inMode(true, getHaloStroke));
        expect(inMode(false, getHaloStroke)).toBe(inMode(false, getHaloStroke));
    });
});

describe('the library default', () => {
    it('is light mode, so an unconfigured consumer gets the doctrinal colours', () => {
        // `settings.ts` owns this; asserted here because it is the palette's entry point.
        // The demo overrides it from localStorage during init.
        // A fresh module registry, so this reads the declared default rather than
        // whatever the tests above last set.
        jest.isolateModules(() => {
            const fresh: typeof import('../../settings') = require('../../settings');
            expect(fresh.isDarkMode()).toBe(false);
        });
    });
});
