/**
 * Guards the palette and the config that overrides it.
 *
 * There used to be two palettes here, light and dark. The dark one was never designed:
 * its values were the *measured output* of a CSS filter — `invert(95%)
 * hue-rotate(180deg) …` — that once repainted the graphics canvas along with the
 * basemap, because OpenLayers composites consecutive layers sharing a className onto
 * one canvas. When that was fixed at source the filter's output got frozen into
 * literals so the change would look like a no-op.
 *
 * Re-tinting doctrinal affiliation colours is a host's call, not the library's, so
 * there is now one palette and a config to override it with. These tests hold that:
 * the doctrinal values are what an unconfigured consumer gets, nothing about a symbol's
 * colour moves with `isDarkMode()`, and an override reaches every accessor that should
 * honour it.
 */
import {
    MAX_LABEL_SIZE,
    MAX_LINE_WIDTH,
    MIN_LABEL_SIZE,
    MIN_LINE_WIDTH,
    TacticalGraphicHostility,
    TacticalGraphicsConfig,
    configureTacticalGraphics,
    getDefaultLabelSize,
    getDefaultLineWidth,
    resetTacticalGraphicsConfig,
} from '@zaes/tactical-graphics';

import {
    getColorByHostility,
    getDefaultLineColor,
    getDoctrinalHostilityColor,
    getHaloStroke,
    getLabelBackgroundFill,
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

// Every test starts from the shipped defaults; the overrides below are global.
beforeEach(resetTacticalGraphicsConfig);
afterEach(resetTacticalGraphicsConfig);

describe('the doctrinal palette is what an unconfigured consumer gets', () => {
    it('uses the FM 1-02.2 affiliation colours', () => {
        expect(getColorByHostility(TacticalGraphicHostility.friend)).toBe('rgba(0, 0, 255, 1)');
        expect(getColorByHostility(TacticalGraphicHostility.hostileFaker)).toBe('rgba(255, 0, 0, 1)');
        expect(getColorByHostility(TacticalGraphicHostility.neutral)).toBe('rgba(0, 128, 0, 1)');
        expect(getColorByHostility(TacticalGraphicHostility.pending)).toBe('rgba(255, 255, 0, 1)');
    });

    it('draws assumed-friend as friendly and suspect/joker as pending', () => {
        expect(getColorByHostility(TacticalGraphicHostility.assumedFriend))
            .toBe(getColorByHostility(TacticalGraphicHostility.friend));
        expect(getColorByHostility(TacticalGraphicHostility.suspectJoker))
            .toBe(getColorByHostility(TacticalGraphicHostility.pending));
    });

    it('falls back to the default line colour for unknown', () => {
        expect(getColorByHostility(TacticalGraphicHostility.unknown)).toBe(getDefaultLineColor());
        expect(getDefaultLineColor()).toBe('#000000');
    });

    it('fills label text to match the line colour', () => {
        expect(getLabelFillColor()).toBe(getDefaultLineColor());
    });

    it('contrasts the halo against the text it outlines', () => {
        expect(getLabelHaloColor()).not.toBe(getLabelFillColor());
    });
});

describe('no symbol colour follows dark mode', () => {
    // The point of the change. A graphic must not mean something slightly different
    // because of a display setting, so every one of these has to be mode-independent.
    const everyHostility = [
        TacticalGraphicHostility.friend,
        TacticalGraphicHostility.assumedFriend,
        TacticalGraphicHostility.hostileFaker,
        TacticalGraphicHostility.neutral,
        TacticalGraphicHostility.pending,
        TacticalGraphicHostility.suspectJoker,
        TacticalGraphicHostility.unknown,
    ];

    it.each(everyHostility)('%s is identical in both modes', hostility => {
        expect(inMode(true, () => getColorByHostility(hostility)))
            .toBe(inMode(false, () => getColorByHostility(hostility)));
    });

    it.each([
        ['getDefaultLineColor', getDefaultLineColor],
        ['getLabelFillColor', getLabelFillColor],
        ['getLabelHaloColor', getLabelHaloColor],
        ['getLabelBackgroundFill', getLabelBackgroundFill],
    ])('%s is identical in both modes', (_name, accessor) => {
        expect(inMode(true, accessor)).toBe(inMode(false, accessor));
    });
});

describe('config overrides reach the style layer', () => {
    it('re-tints one affiliation and leaves the others doctrinal', () => {
        configureTacticalGraphics({
            hostilityColors: {[TacticalGraphicHostility.friend]: 'rgb(92,148,255)'},
        });
        expect(getColorByHostility(TacticalGraphicHostility.friend)).toBe('rgb(92,148,255)');
        expect(getColorByHostility(TacticalGraphicHostility.hostileFaker)).toBe('rgba(255, 0, 0, 1)');
        expect(getColorByHostility(TacticalGraphicHostility.neutral)).toBe('rgba(0, 128, 0, 1)');
    });

    it('carries an override to the alias affiliation', () => {
        // A host overriding `friend` means it for assumed-friend too, without naming both.
        configureTacticalGraphics({
            hostilityColors: {[TacticalGraphicHostility.friend]: 'rgb(92,148,255)'},
        });
        expect(getColorByHostility(TacticalGraphicHostility.assumedFriend)).toBe('rgb(92,148,255)');
    });

    it('lets an override on the alias itself win', () => {
        configureTacticalGraphics({
            hostilityColors: {
                [TacticalGraphicHostility.friend]: 'rgb(92,148,255)',
                [TacticalGraphicHostility.assumedFriend]: 'rgb(150,190,255)',
            },
        });
        expect(getColorByHostility(TacticalGraphicHostility.friend)).toBe('rgb(92,148,255)');
        expect(getColorByHostility(TacticalGraphicHostility.assumedFriend)).toBe('rgb(150,190,255)');
    });

    it('moves unknown and label text with defaultLineColor', () => {
        configureTacticalGraphics({defaultLineColor: 'rgb(198,198,198)'});
        expect(getDefaultLineColor()).toBe('rgb(198,198,198)');
        expect(getColorByHostility(TacticalGraphicHostility.unknown)).toBe('rgb(198,198,198)');
        expect(getLabelFillColor()).toBe('rgb(198,198,198)');
    });

    it('lets label text be overridden away from the line colour', () => {
        configureTacticalGraphics({defaultLineColor: 'rgb(198,198,198)', labelFillColor: '#ffffff'});
        expect(getDefaultLineColor()).toBe('rgb(198,198,198)');
        expect(getLabelFillColor()).toBe('#ffffff');
    });

    it('overrides the halo and the label background plate', () => {
        configureTacticalGraphics({
            labelHaloColor: 'rgb(23,23,23)',
            labelBackgroundFill: 'rgba(22, 27, 34, 0.90)',
        });
        expect(getLabelHaloColor()).toBe('rgb(23,23,23)');
        expect(getLabelBackgroundFill()).toBe('rgba(22, 27, 34, 0.90)');
    });
});

describe('getDoctrinalHostilityColor', () => {
    // The pure "what would this be with no override" answer. A settings panel needs it:
    // reading `getColorByHostility` to render a control that *edits* the override renders
    // one frame stale, so clearing an override shows the cleared value back. Both bugs
    // were caught driving the real app.
    it('ignores an override that is in force', () => {
        configureTacticalGraphics({
            hostilityColors: {[TacticalGraphicHostility.friend]: 'magenta'},
        });
        expect(getColorByHostility(TacticalGraphicHostility.friend)).toBe('magenta');
        expect(getDoctrinalHostilityColor(TacticalGraphicHostility.friend)).toBe('rgba(0, 0, 255, 1)');
    });

    it('resolves aliases the same way the live accessor does', () => {
        expect(getDoctrinalHostilityColor(TacticalGraphicHostility.assumedFriend)).toBe('rgba(0, 0, 255, 1)');
        expect(getDoctrinalHostilityColor(TacticalGraphicHostility.suspectJoker)).toBe('rgba(255, 255, 0, 1)');
    });

    it('has no answer for unknown, whose colour is the default line colour', () => {
        expect(getDoctrinalHostilityColor(TacticalGraphicHostility.unknown)).toBeUndefined();
    });

    it('agrees with getColorByHostility whenever there is no override', () => {
        [
            TacticalGraphicHostility.friend,
            TacticalGraphicHostility.assumedFriend,
            TacticalGraphicHostility.hostileFaker,
            TacticalGraphicHostility.neutral,
            TacticalGraphicHostility.pending,
            TacticalGraphicHostility.suspectJoker,
        ].forEach(hostility => {
            expect(getDoctrinalHostilityColor(hostility)).toBe(getColorByHostility(hostility));
        });
    });
});

describe('TacticalGraphicsConfig', () => {
    it('clamps line width into the readable range', () => {
        expect(new TacticalGraphicsConfig({lineWidth: 99}).lineWidth).toBe(MAX_LINE_WIDTH);
        expect(new TacticalGraphicsConfig({lineWidth: 0}).lineWidth).toBe(MIN_LINE_WIDTH);
    });

    it('clamps label size into the readable range', () => {
        // Mirrors the line-width clamp above on purpose — the two are surfaced together
        // in the settings panel and behaved differently before 2026-08-02.
        expect(new TacticalGraphicsConfig({labelSize: 99}).labelSize).toBe(MAX_LABEL_SIZE);
        expect(new TacticalGraphicsConfig({labelSize: 0}).labelSize).toBe(MIN_LABEL_SIZE);
        expect(new TacticalGraphicsConfig({labelSize: -5}).labelSize).toBe(MIN_LABEL_SIZE);
    });

    it('leaves every field undefined when constructed empty', () => {
        const config = new TacticalGraphicsConfig();
        expect(config.labelSize).toBeUndefined();
        expect(config.lineWidth).toBeUndefined();
        expect(config.hostilityColors).toBeUndefined();
        expect(config.defaultLineColor).toBeUndefined();
    });

    it('merges hostilityColors key by key in with()', () => {
        const base = new TacticalGraphicsConfig({
            hostilityColors: {[TacticalGraphicHostility.friend]: 'blue'},
        });
        const merged = base.with({
            hostilityColors: {[TacticalGraphicHostility.neutral]: 'green'},
        });
        expect(merged.hostilityColors?.[TacticalGraphicHostility.friend]).toBe('blue');
        expect(merged.hostilityColors?.[TacticalGraphicHostility.neutral]).toBe('green');
    });

    it('treats an undefined field in with() as "leave alone", not "clear"', () => {
        // What makes `config.with({lineWidth})` safe to call from a settings panel that
        // only knows about one field.
        const base = new TacticalGraphicsConfig({lineWidth: 3, defaultLineColor: 'red'});
        expect(base.with({lineWidth: 5}).defaultLineColor).toBe('red');
        expect(base.with({defaultLineColor: 'blue'}).lineWidth).toBe(3);
    });

    it('is frozen, so a held reference cannot be mutated behind the style layer', () => {
        const config = new TacticalGraphicsConfig({lineWidth: 3});
        expect(Object.isFrozen(config)).toBe(true);
    });
});

describe('the accessors the style layer reads', () => {
    it('default to the shipped values with no config', () => {
        expect(getDefaultLabelSize()).toBe(16);
        expect(getDefaultLineWidth()).toBe(4);
    });

    it('follow the config once set', () => {
        configureTacticalGraphics({labelSize: 20, lineWidth: 2});
        expect(getDefaultLabelSize()).toBe(20);
        expect(getDefaultLineWidth()).toBe(2);
    });

    it('clamp through configureTacticalGraphics too', () => {
        configureTacticalGraphics({lineWidth: 99});
        expect(getDefaultLineWidth()).toBe(MAX_LINE_WIDTH);
    });
});

describe('getHaloStroke', () => {
    // It was a module-level `const`, so its colour was frozen at import and could never
    // follow a change — invisible while it was always white, a real bug the moment a
    // host overrode it.
    it('reflects a config change made after module load', () => {
        const before = getHaloStroke().getColor();
        configureTacticalGraphics({labelHaloColor: 'rgb(23,23,23)'});
        expect(getHaloStroke().getColor()).not.toBe(before);
        expect(getHaloStroke().getColor()).toBe('rgb(23,23,23)');
    });

    it('matches getLabelHaloColor', () => {
        expect(getHaloStroke().getColor()).toBe(getLabelHaloColor());
        configureTacticalGraphics({labelHaloColor: 'rgb(23,23,23)'});
        expect(getHaloStroke().getColor()).toBe(getLabelHaloColor());
    });

    it('caches one Stroke per colour rather than allocating per call', () => {
        expect(getHaloStroke()).toBe(getHaloStroke());
    });
});

describe('the library default', () => {
    it('is an empty config, so an unconfigured consumer gets the doctrinal colours', () => {
        // A fresh module registry, so this reads the declared default rather than
        // whatever the tests above last set.
        jest.isolateModules(() => {
            const settings: typeof import('../../settings') = require('../../settings');
            expect(settings.isDarkMode()).toBe(false);

            const config: typeof import('@zaes/tactical-graphics') = require('@zaes/tactical-graphics');
            expect(config.getDefaultLabelSize()).toBe(16);
            expect(config.getDefaultLineWidth()).toBe(4);
            expect(config.getTacticalGraphicsConfig().defaultLineColor).toBeUndefined();
        });
    });
});
