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
 * there is now one palette and a config to override it with. The mode flag that used to
 * pick between palettes is gone too — the library has no concept of light or dark, only
 * colours the host decides. These tests hold that: the doctrinal values are what an
 * unconfigured consumer gets, and an override reaches every accessor that should honour
 * it, editor chrome included.
 */
import Feature from 'ol/Feature';
import {LineString, Point} from 'ol/geom';
import {Style} from 'ol/style';
import {writeGraphicProperties} from './graphicProperties';
import {
    DARK_MODE_PALETTE,
    LIGHT_MODE_PALETTE,
    MAX_LABEL_SIZE,
    MAX_LINE_WIDTH,
    MIN_LABEL_SIZE,
    MIN_LINE_WIDTH,
    TacticalGraphicHostility,
    TacticalGraphicName,
    TacticalGraphicsConfig,
    configureTacticalGraphics,
    getDefaultLabelSize,
    getDefaultLineWidth,
    paletteForMode,
    resetTacticalGraphicsConfig,
} from '@zaes/tactical-graphics';

import {
    getColorByHostility,
    getDefaultLineColor,
    getDoctrinalHostilityColor,
    getHaloStroke,
    getLabelBackgroundFill,
    getLabelFillColor,
    getDrawMarkerColor,
    getDrawMarkerOutlineColor,
    getHandleColor,
    getInertHandleColor,
    getLabelHaloColor,
    getSelectionFillColor,
    obstacleLineStyle,
} from './openlayerStyles';

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

describe('editor chrome', () => {
    // Chrome says "you can drag this". It is not part of any symbol, so it must not take
    // a graphic's affiliation colour — tinting handles by hostility made a hostile
    // graphic's handles the same red as its own strokes, and they stopped reading as
    // handles at all. It *is* overridable, which it was not before: these were hardcoded
    // literals behind a mode flag.
    it('has built-in defaults with no config', () => {
        expect(getHandleColor()).toBe('rgba(255,0,0,1)');
        expect(getInertHandleColor()).toBe('rgba(130,130,130,0.8)');
        expect(getSelectionFillColor()).toBe('rgba(0, 120, 255, 0.2)');
        expect(getDrawMarkerColor()).toBe('rgba(87, 140, 255, 1)');
        expect(getDrawMarkerOutlineColor()).toBe('white');
    });

    it('is overridable through the config', () => {
        configureTacticalGraphics({
            handleColor: '#ff00ff',
            inertHandleColor: '#404040',
            selectionFillColor: 'rgba(0,255,0,0.2)',
            drawMarkerColor: '#123456',
            drawMarkerOutlineColor: '#654321',
        });
        expect(getHandleColor()).toBe('#ff00ff');
        expect(getInertHandleColor()).toBe('#404040');
        expect(getSelectionFillColor()).toBe('rgba(0,255,0,0.2)');
        expect(getDrawMarkerColor()).toBe('#123456');
        expect(getDrawMarkerOutlineColor()).toBe('#654321');
    });

    it('does not move when an affiliation colour is re-tinted', () => {
        configureTacticalGraphics({
            hostilityColors: {[TacticalGraphicHostility.hostileFaker]: '#ff00ff'},
        });
        expect(getHandleColor()).toBe('rgba(255,0,0,1)');
    });
});

describe('paletteForMode covers every colour a mode change should move', () => {
    // The point of folding chrome into the config: a host's mode change is one call. If
    // a colour is mode-dependent but missing from the palettes, that host silently keeps
    // the light value on a dark basemap.
    it('sends the same keys for both modes', () => {
        expect(Object.keys(DARK_MODE_PALETTE).sort()).toEqual(Object.keys(LIGHT_MODE_PALETTE).sort());
    });

    it('carries no hostilityColors — affiliation colours are mode-independent', () => {
        expect(LIGHT_MODE_PALETTE.hostilityColors).toBeUndefined();
        expect(DARK_MODE_PALETTE.hostilityColors).toBeUndefined();
    });

    it('restates the built-in defaults in its light half, so going back to light undoes dark', () => {
        // `configureTacticalGraphics` merges, so an empty light palette would leave the
        // dark values in force.
        configureTacticalGraphics(paletteForMode(true));
        configureTacticalGraphics(paletteForMode(false));
        expect(getDefaultLineColor()).toBe('#000000');
        expect(getLabelHaloColor()).toBe('rgba(255,255,255,1)');
        expect(getHandleColor()).toBe('rgba(255,0,0,1)');
        expect(getDrawMarkerOutlineColor()).toBe('white');
    });

    it('moves every base and chrome colour when dark is applied', () => {
        configureTacticalGraphics(paletteForMode(true));
        expect(getDefaultLineColor()).toBe('rgb(198,198,198)');
        expect(getLabelHaloColor()).toBe('rgb(23,23,23)');
        expect(getHandleColor()).toBe('rgba(208,123,123,1)');
        expect(getInertHandleColor()).toBe('rgba(109,109,109,0.8)');
        expect(getSelectionFillColor()).toBe('rgba(55, 137, 208, 0.2)');
        expect(getDrawMarkerColor()).toBe('rgb(69,106,185)');
    });

    it('leaves affiliation colours untouched in either mode', () => {
        configureTacticalGraphics(paletteForMode(true));
        expect(getColorByHostility(TacticalGraphicHostility.friend)).toBe('rgba(0, 0, 255, 1)');
        expect(getColorByHostility(TacticalGraphicHostility.hostileFaker)).toBe('rgba(255, 0, 0, 1)');
        expect(getColorByHostility(TacticalGraphicHostility.neutral)).toBe('rgba(0, 128, 0, 1)');
        expect(getColorByHostility(TacticalGraphicHostility.pending)).toBe('rgba(255, 255, 0, 1)');
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
            const config: typeof import('@zaes/tactical-graphics') = require('@zaes/tactical-graphics');
            expect(config.getDefaultLabelSize()).toBe(16);
            expect(config.getDefaultLineWidth()).toBe(4);
            expect(config.getTacticalGraphicsConfig().defaultLineColor).toBeUndefined();
        });
    });
});

/**
 * The obstacle line's label.
 *
 * Two failures, both of which only show up on a graphic drawn a particular way or looked
 * at from a particular zoom, which is why they survived a green suite:
 *
 *  - Its offset was taken from the drawn line's *direction of travel*, so the same line
 *    drawn right-to-left put the label under the line instead of over it.
 *  - Its offset was a fixed number of screen pixels, while the teeth it has to clear are
 *    map-unit sized. At the drawing zoom that looked fine; two zoom levels in, the teeth
 *    had grown through the text.
 */
describe('obstacle line label', () => {
    /** A drawn line plus the teeth a generator would hang off it, all on the north side. */
    const toothed = (drawn: number[][], toothHeight: number): number[][] => {
        const out: number[][] = [];
        for (let i = 0; i < drawn.length - 1; i++) {
            const [ax, ay] = drawn[i];
            const [bx, by] = drawn[i + 1];
            out.push(drawn[i]);
            for (const t of [0.3, 0.6]) {
                const fx = ax + (bx - ax) * t;
                const fy = ay + (by - ay) * t;
                out.push([fx, fy], [fx, fy + toothHeight], [fx + 1, fy]);
            }
        }
        out.push(drawn[drawn.length - 1]);
        return out;
    };

    const labelPointFor = (drawn: number[][], resolution: number, toothHeight = 400) => {
        const f = new Feature(new LineString(toothed(drawn, toothHeight)));
        f.set('baseCoordinates', drawn);
        writeGraphicProperties([f], TacticalGraphicName.ObstacleLine, {label: 'OBS-1'});
        const styles = obstacleLineStyle(TacticalGraphicName.ObstacleLine)(f, resolution) as Style[];
        const text = (Array.isArray(styles) ? styles : [styles]).find(s => s.getText?.()?.getText?.());
        return (text!.getGeometry() as Point).getCoordinates();
    };

    const WEST_TO_EAST = [[0, 0], [1000, 0]];
    const EAST_TO_WEST = [[1000, 0], [0, 0]];

    it('puts the label above the line whichever way it was drawn', () => {
        expect(labelPointFor(WEST_TO_EAST, 10)[1]).toBeGreaterThan(0);
        expect(labelPointFor(EAST_TO_WEST, 10)[1]).toBeGreaterThan(0);
    });

    it('anchors it at the same place either way — the line is the same line', () => {
        const [wx] = labelPointFor(WEST_TO_EAST, 10);
        const [ex] = labelPointFor(EAST_TO_WEST, 10);
        expect(wx).toBeCloseTo(ex, 6);
        expect(wx).toBeCloseTo(500, 6);
    });

    it('centres it on the middle drawn segment, not on the chord through the ends', () => {
        // Bent on purpose: on a straight line the middle of the drawn line and the middle
        // of the straight run between its endpoints are the same point, and the old
        // chord-projection would pass this without ever looking at a segment.
        const bent = [[0, 0], [1000, 0], [1400, 800], [2400, 800]];
        const [p1, p2] = [bent[1], bent[2]];
        const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
        const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        const dir = [(p2[0] - p1[0]) / len, (p2[1] - p1[1]) / len];

        const label = labelPointFor(bent, 10);

        // Directly across from the middle segment's midpoint: the label is offset
        // perpendicular to that segment, so it has no component along it.
        const along = (label[0] - mid[0]) * dir[0] + (label[1] - mid[1]) * dir[1];
        expect(along).toBeCloseTo(0, 6);
    });

    it('clears the teeth at every zoom, not just the one it was drawn at', () => {
        const TOOTH = 400;
        // Zooming in shrinks `resolution`; the teeth stay 400 map units tall, so a label
        // offset that is purely a pixel count walks straight into them.
        for (const resolution of [40, 10, 2, 0.5]) {
            expect(labelPointFor(WEST_TO_EAST, resolution, TOOTH)[1]).toBeGreaterThan(TOOTH);
        }
    });

    it('keeps a readable gap over the teeth without floating away', () => {
        // The clearance is the tooth height plus half a line of text and a gap, so it
        // tracks zoom rather than being fixed in either unit alone.
        const near = labelPointFor(WEST_TO_EAST, 2, 400)[1];
        const far = labelPointFor(WEST_TO_EAST, 40, 400)[1];
        expect(near).toBeLessThan(far);
        expect(near).toBeGreaterThan(400);
    });

    it('still works for a host that has not stamped the drawn line', () => {
        const f = new Feature(new LineString(toothed(WEST_TO_EAST, 400)));
        writeGraphicProperties([f], TacticalGraphicName.ObstacleLine, {label: 'OBS-1'});
        const styles = obstacleLineStyle(TacticalGraphicName.ObstacleLine)(f, 10) as Style[];
        const text = (Array.isArray(styles) ? styles : [styles]).find(s => s.getText?.()?.getText?.());
        expect((text!.getGeometry() as Point).getCoordinates()[1]).toBeGreaterThan(400);
    });
});
