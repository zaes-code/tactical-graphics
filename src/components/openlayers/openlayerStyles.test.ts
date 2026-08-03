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
 * Re-tinting doctrinal affiliation colours is a host's call, not the library's, so there
 * is now exactly one palette — `DEFAULT_PALETTE` — and a config to override it with. The
 * mode flag that used to pick between palettes is gone, and so is the second palette it
 * picked: the library has no concept of light or dark, only colours the host decides. A
 * host that wants a dark set keeps its own and sends it. These tests hold that: the
 * doctrinal values are what an unconfigured consumer gets, and an override reaches every
 * accessor that should honour it, editor chrome included.
 */
import Feature from 'ol/Feature';
import {LineString, Point} from 'ol/geom';
import CircleStyle from 'ol/style/Circle';
import {Style} from 'ol/style';
import {writeGraphicProperties} from './graphicProperties';
import {
    DEFAULT_PALETTE,
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
    resetTacticalGraphicsConfig,
} from '@zaes/tactical-graphics';

import {
    defaultDrawStyleFunc,
    getColorByHostility,
    getDefaultLineColor,
    getDoctrinalHostilityColor,
    getHaloStroke,
    getLabelFillColor,
    getDrawMarkerColor,
    getDrawMarkerOutlineColor,
    getHandleColor,
    getInertHandleColor,
    getLabelHaloColor,
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
        expect(getDrawMarkerColor()).toBe('rgba(87, 140, 255, 1)');
        expect(getDrawMarkerOutlineColor()).toBe('white');
    });

    it('is overridable through the config', () => {
        configureTacticalGraphics({
            handleColor: '#ff00ff',
            inertHandleColor: '#404040',
            drawMarkerColor: '#123456',
            drawMarkerOutlineColor: '#654321',
        });
        expect(getHandleColor()).toBe('#ff00ff');
        expect(getInertHandleColor()).toBe('#404040');
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

/** The host palette a consumer would keep for a dark basemap — see `MapRendering`. */
const HOST_DARK_PALETTE = {
    defaultLineColor: 'rgb(198,198,198)',
    labelFillColor: 'rgb(198,198,198)',
    labelHaloColor: 'rgb(23,23,23)',
    handleColor: 'rgba(208,123,123,1)',
    inertHandleColor: 'rgba(109,109,109,0.8)',
    drawMarkerColor: 'rgb(69,106,185)',
    drawMarkerOutlineColor: 'rgb(23,23,23)',
};

describe('DEFAULT_PALETTE is the one palette', () => {
    it('is what every accessor falls back to', () => {
        // The defaults are written down once, in the config module, rather than once per
        // accessor. A literal that drifts from the palette would make "what does this
        // library look like unconfigured" have two answers.
        expect(getDefaultLineColor()).toBe(DEFAULT_PALETTE.defaultLineColor);
        expect(getLabelFillColor()).toBe(DEFAULT_PALETTE.labelFillColor);
        expect(getLabelHaloColor()).toBe(DEFAULT_PALETTE.labelHaloColor);
        expect(getHandleColor()).toBe(DEFAULT_PALETTE.handleColor);
        expect(getInertHandleColor()).toBe(DEFAULT_PALETTE.inertHandleColor);
        expect(getDrawMarkerColor()).toBe(DEFAULT_PALETTE.drawMarkerColor);
        expect(getDrawMarkerOutlineColor()).toBe(DEFAULT_PALETTE.drawMarkerOutlineColor);
    });

    it('carries no hostilityColors — affiliation colours are the library\'s, not a theme\'s', () => {
        expect((DEFAULT_PALETTE as Record<string, unknown>).hostilityColors).toBeUndefined();
    });

    it('undoes a host palette when sent back, so a mode change is one call either way', () => {
        // This is why the defaults are restated as an explicit set rather than left
        // implicit: `configureTacticalGraphics` merges, so a host with nothing to send
        // for "light" would keep its dark values in force forever.
        configureTacticalGraphics(HOST_DARK_PALETTE);
        expect(getDefaultLineColor()).toBe('rgb(198,198,198)');
        expect(getHandleColor()).toBe('rgba(208,123,123,1)');
        expect(getDrawMarkerColor()).toBe('rgb(69,106,185)');

        configureTacticalGraphics(DEFAULT_PALETTE);
        expect(getDefaultLineColor()).toBe('#000000');
        expect(getLabelHaloColor()).toBe('rgba(255,255,255,1)');
        expect(getHandleColor()).toBe('rgba(255,0,0,1)');
        expect(getDrawMarkerOutlineColor()).toBe('white');
    });

    it('covers every colour a host palette needs to move', () => {
        // If a colour is themeable but missing from DEFAULT_PALETTE, a host that builds
        // its set with `{...DEFAULT_PALETTE, ...mine}` silently keeps the light value.
        expect(Object.keys(DEFAULT_PALETTE).sort()).toEqual(Object.keys(HOST_DARK_PALETTE).sort());
    });

    it('leaves affiliation colours untouched when a host palette is applied', () => {
        configureTacticalGraphics(HOST_DARK_PALETTE);
        expect(getColorByHostility(TacticalGraphicHostility.friend)).toBe('rgba(0, 0, 255, 1)');
        expect(getColorByHostility(TacticalGraphicHostility.hostileFaker)).toBe('rgba(255, 0, 0, 1)');
        expect(getColorByHostility(TacticalGraphicHostility.neutral)).toBe('rgba(0, 128, 0, 1)');
        expect(getColorByHostility(TacticalGraphicHostility.pending)).toBe('rgba(255, 255, 0, 1)');
    });
});

describe('the draw style applies the marker colours to every graphic', () => {
    // The marker pair used to reach point-anchored graphics only: theirs was the one
    // controller with a `drawStyleFunc`, and everything else fell through to
    // OpenLayers' hardcoded editing style. `TacticalGraphicsManager` now installs this
    // as the fallback, so a line or an area honours the config too.
    const styleFor = (feature: Feature) => {
        const styles = defaultDrawStyleFunc()(feature, 1);
        return (Array.isArray(styles) ? styles : [styles]) as Style[];
    };

    it('marks the cursor point with the draw-marker colours', () => {
        configureTacticalGraphics({drawMarkerColor: '#123456', drawMarkerOutlineColor: '#654321'});
        const image = styleFor(new Feature(new Point([0, 0])))[0].getImage() as CircleStyle;
        expect(image.getFill()?.getColor()).toBe('#123456');
        expect(image.getStroke()?.getColor()).toBe('#654321');
    });

    it('draws the sketch line in the same pair', () => {
        configureTacticalGraphics({drawMarkerColor: '#123456', drawMarkerOutlineColor: '#654321'});
        const strokes = styleFor(new Feature(new LineString([[0, 0], [1, 1]])))
            .map(s => s.getStroke()?.getColor());
        expect(strokes).toContain('#123456');
        expect(strokes).toContain('#654321');
    });

    it('reads the colours per call, so a config change lands on the next frame', () => {
        const before = (styleFor(new Feature(new Point([0, 0])))[0].getImage() as CircleStyle)
            .getFill()?.getColor();
        configureTacticalGraphics({drawMarkerColor: '#00ff00'});
        const after = (styleFor(new Feature(new Point([0, 0])))[0].getImage() as CircleStyle)
            .getFill()?.getColor();
        expect(before).toBe(DEFAULT_PALETTE.drawMarkerColor);
        expect(after).toBe('#00ff00');
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

    it('overrides the label halo', () => {
        configureTacticalGraphics({labelHaloColor: 'rgb(23,23,23)'});
        expect(getLabelHaloColor()).toBe('rgb(23,23,23)');
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
 * It sits under the centre-most drawn segment. Three faults got it there, and each only
 * showed up on a line drawn a particular way or looked at from a particular zoom, which
 * is why they survived a green suite:
 *
 *  - Its offset was taken from the drawn line's *direction of travel*, so the same line
 *    drawn right-to-left put the label on the opposite side.
 *  - Its offset was a fixed number of screen pixels, while the teeth it has to clear are
 *    map-unit sized. At the drawing zoom that looked fine; two zoom levels in, the teeth
 *    had grown through the text.
 *  - It anchored on the rendered geometry, every third vertex of which is a tooth apex,
 *    so "the middle" was a tooth rather than the middle of the drawn line.
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

    /** Teeth on the *label's* side, which is the case that has to clear them. */
    const toothedBelow = (drawn: number[][], toothHeight: number) =>
        toothed(drawn, -toothHeight);

    const labelPointBelowTeeth = (drawn: number[][], resolution: number, toothHeight = 400) => {
        const f = new Feature(new LineString(toothedBelow(drawn, toothHeight)));
        f.set('baseCoordinates', drawn);
        writeGraphicProperties([f], TacticalGraphicName.ObstacleLine, {label: 'OBS-1'});
        const styles = obstacleLineStyle(TacticalGraphicName.ObstacleLine)(f, resolution) as Style[];
        const text = (Array.isArray(styles) ? styles : [styles]).find(s => s.getText?.()?.getText?.());
        return (text!.getGeometry() as Point).getCoordinates();
    };

    const WEST_TO_EAST = [[0, 0], [1000, 0]];
    const EAST_TO_WEST = [[1000, 0], [0, 0]];

    it('puts the label under the line whichever way it was drawn', () => {
        expect(labelPointFor(WEST_TO_EAST, 10)[1]).toBeLessThan(0);
        expect(labelPointFor(EAST_TO_WEST, 10)[1]).toBeLessThan(0);
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

    it('clears teeth on its own side at every zoom, not just the one drawn at', () => {
        const TOOTH = 400;
        // Zooming in shrinks `resolution`; the teeth stay 400 map units deep, so a label
        // offset that is purely a pixel count walks straight into them.
        for (const resolution of [40, 10, 2, 0.5]) {
            expect(labelPointBelowTeeth(WEST_TO_EAST, resolution, TOOTH)[1]).toBeLessThan(-TOOTH);
        }
    });

    it('holds the same proportional distance as the map scales', () => {
        // Zoomed in far enough that the proportional gap governs, the offset stops
        // depending on resolution at all: the label keeps its place in the symbol
        // instead of creeping toward the line or drifting away from it.
        const TOOTH = 400;
        const close = labelPointFor(WEST_TO_EAST, 0.5, TOOTH)[1];
        const closer = labelPointFor(WEST_TO_EAST, 0.1, TOOTH)[1];
        expect(closer / close).toBeCloseTo(1, 1);

        // And that distance is set by the teeth: a symbol twice as deep pushes the label
        // twice as far, rather than both landing at the same pixel offset.
        const deep = labelPointFor(WEST_TO_EAST, 0.5, TOOTH * 2)[1];
        expect(deep / close).toBeCloseTo(2, 1);
    });

    it('keeps a readable gap when zoomed out, where a proportion alone would collapse', () => {
        // Far enough out that the teeth are sub-pixel, the screen floor takes over and
        // the text still clears the line.
        const tiny = labelPointFor(WEST_TO_EAST, 2000, 400)[1];
        expect(Math.abs(tiny)).toBeGreaterThan(8 * 2000);
    });

    it('stays with its own segment on a line that doubles back', () => {
        // The reported case, reprojected: a saved obstacle line whose vertices had been
        // dragged around until the path crosses back over itself. Filtering the
        // clearance scan by along-track projection alone let a limb from elsewhere in
        // the line — far to the side, but projecting into the same along-range — be
        // measured as though it were a tooth of the centre segment, and the label flew
        // off to clear geometry it was never near.
        const drawn = [
            [-48.8204960524337, 1.9618674420930944],
            [-41.5855986018727, 3.3097380307984423],
            [-22.847995563775484, -4.2836600068830535],
            [-32.617872882491426, 29.452801896485823],
            [-5.529335124093375, -3.209786277366021],
            [-4.175693213301526, 1.957358704138855],
            [2.441018634505347, 2.7424415539130536],
            [26.81962371892284, 20.103193854805923],
        ].map(([x, y]) => [x * 111320, y * 111320]);

        const TOOTH = 60000;
        const label = labelPointFor(drawn, 9783.93962050256, TOOTH);

        const segIdx = 3; // the centre-most segment by length, for this line
        const [p1, p2] = [drawn[segIdx], drawn[segIdx + 1]];
        const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
        const distance = Math.hypot(label[0] - mid[0], label[1] - mid[1]);

        // Its own teeth plus a gap and a line of text — not the width of the whole
        // drawing. Before the fix this was more than an order of magnitude larger.
        expect(distance).toBeLessThan(TOOTH * 3);
    });

    it('takes its hostility from the amplifier bag, so a restored line is still red', () => {
        // `restoreTacticalGraphics` rebuilds from `properties.tacticalGraphic` and sets
        // no loose `hostility` key, so a style reading only that key drew a saved
        // hostile line in the neutral default.
        const f = new Feature(new LineString(toothed(WEST_TO_EAST, 400)));
        f.set('baseCoordinates', WEST_TO_EAST);
        writeGraphicProperties([f], TacticalGraphicName.ObstacleLine, {
            label: 'OBS-1', hostility: TacticalGraphicHostility.hostileFaker,
        });
        const strokes = (obstacleLineStyle(TacticalGraphicName.ObstacleLine)(f, 10) as Style[])
            .map(s => s.getStroke()?.getColor()).filter(Boolean);
        expect(strokes).toContain(getColorByHostility(TacticalGraphicHostility.hostileFaker));
        expect(strokes).not.toContain(getDefaultLineColor());
    });

    it('still works for a host that has not stamped the drawn line', () => {
        const f = new Feature(new LineString(toothed(WEST_TO_EAST, 400)));
        writeGraphicProperties([f], TacticalGraphicName.ObstacleLine, {label: 'OBS-1'});
        const styles = obstacleLineStyle(TacticalGraphicName.ObstacleLine)(f, 10) as Style[];
        const text = (Array.isArray(styles) ? styles : [styles]).find(s => s.getText?.()?.getText?.());
        expect((text!.getGeometry() as Point).getCoordinates()[1]).toBeLessThan(0);
    });
});
