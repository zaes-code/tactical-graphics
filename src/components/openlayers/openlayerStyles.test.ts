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
import {LineString, Point, Polygon} from 'ol/geom';
import CircleStyle from 'ol/style/Circle';
import {Style} from 'ol/style';
import {StyleFunction} from 'ol/style/Style';
import Icon from 'ol/style/Icon';
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
    fortifiedAreaStyle,
    fortifiedLineStyleFunc,
    forwardLineOfOwnTroopsStyleFunc,
    lineOfContactStyleFunc,
    obstacleAreaStyles,
    obstacleLineStyle,
    obstacleRestrictedZoneStyle,
    getStyle,
} from './openlayerStyles';

import {
    DEFAULT_SYMBOL_SIZE_PX,
    MAX_SYMBOL_SIZE_PX,
    MIN_SYMBOL_SIZE_PX,
    getSecurityOperationSymbolProvider,
    getSecurityOperationSymbolSize,
    securityOperationSidc,
    securityOperationSymbolStyle,
    setSecurityOperationSymbolProvider,
    setSecurityOperationSymbolSize,
} from './securityOperationSymbol';

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
        expect(getDefaultLineWidth()).toBe(2);
    });

    it('follow the config once set', () => {
        // Both values differ from the shipped defaults on purpose — at lineWidth 2
        // this could not tell "followed the config" from "fell back to the default".
        configureTacticalGraphics({labelSize: 20, lineWidth: 5});
        expect(getDefaultLabelSize()).toBe(20);
        expect(getDefaultLineWidth()).toBe(5);
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
            expect(config.getDefaultLineWidth()).toBe(2);
            expect(config.getTacticalGraphicsConfig().defaultLineColor).toBeUndefined();
        });
    });
});

/**
 * The obstacle line: its teeth and its label take opposite sides, and both are sized in
 * screen pixels.
 *
 * The faults this replaced were all consequences of teeth baked into the geometry at
 * map-unit size: the label was offset along the drawn *direction of travel*, so drawing
 * right-to-left flipped it; the offset was a fixed pixel count against teeth that grew
 * with zoom, so it was buried two levels in; and it anchored on a geometry whose every
 * third vertex was a tooth apex, so "the middle" was a tooth rather than the middle of
 * the line.
 */
describe('obstacle line', () => {
    const feature = (drawn: number[][]) => {
        const f = new Feature(new LineString(drawn));
        writeGraphicProperties([f], TacticalGraphicName.ObstacleLine, {label: 'OBS-1'});
        return f;
    };

    const styles = (drawn: number[][], resolution: number) =>
        obstacleLineStyle(TacticalGraphicName.ObstacleLine)(feature(drawn), resolution) as Style[];

    const labelPointFor = (drawn: number[][], resolution: number) => {
        const text = styles(drawn, resolution).find(s => s.getText?.()?.getText?.());
        return (text!.getGeometry() as Point).getCoordinates();
    };

    /** The drawn path with the teeth the style adds. */
    const toothedPath = (drawn: number[][], resolution: number) => {
        const stroke = styles(drawn, resolution).find(s => !s.getText?.()?.getText?.());
        return (stroke!.getGeometry() as LineString).getCoordinates();
    };

    const WEST_TO_EAST = [[0, 0], [1000, 0]];
    const EAST_TO_WEST = [[1000, 0], [0, 0]];

    it('puts the label under the line whichever way it was drawn', () => {
        expect(labelPointFor(WEST_TO_EAST, 10)[1]).toBeLessThan(0);
        expect(labelPointFor(EAST_TO_WEST, 10)[1]).toBeLessThan(0);
    });

    it('puts the teeth above it whichever way it was drawn', () => {
        for (const drawn of [WEST_TO_EAST, EAST_TO_WEST]) {
            const apexes = toothedPath(drawn, 10).filter(([, y]) => Math.abs(y) > 0.001);
            expect(apexes.length).toBeGreaterThan(0);
            expect(apexes.every(([, y]) => y > 0)).toBe(true);
        }
    });

    it('keeps the label and the teeth on opposite sides, so they never compete', () => {
        const label = labelPointFor(WEST_TO_EAST, 10);
        const apexes = toothedPath(WEST_TO_EAST, 10).filter(([, y]) => Math.abs(y) > 0.001);
        expect(Math.sign(label[1])).toBe(-Math.sign(apexes[0][1]));
    });

    it('anchors the label at the same place either way — the line is the same line', () => {
        const [wx] = labelPointFor(WEST_TO_EAST, 10);
        const [ex] = labelPointFor(EAST_TO_WEST, 10);
        expect(wx).toBeCloseTo(ex, 6);
        expect(wx).toBeCloseTo(500, 6);
    });

    it('centres it on the middle drawn segment, not on the chord through the ends', () => {
        // Bent on purpose: on a straight line the middle of the drawn line and the middle
        // of the straight run between its endpoints are the same point.
        const bent = [[0, 0], [1000, 0], [1400, 800], [2400, 800]];
        const [p1, p2] = [bent[1], bent[2]];
        const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
        const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        const dir = [(p2[0] - p1[0]) / len, (p2[1] - p1[1]) / len];

        const label = labelPointFor(bent, 10);
        const along = (label[0] - mid[0]) * dir[0] + (label[1] - mid[1]) * dir[1];
        expect(along).toBeCloseTo(0, 6);
    });

    it('stands the label off by the same pixel distance at every zoom', () => {
        // Both terms are screen-sized now, so the offset in pixels is a constant. It was
        // a scan of the rendered geometry while the teeth were map-unit sized.
        const offsets = [40, 10, 2, 0.5].map(res => {
            const label = labelPointFor(WEST_TO_EAST, res);
            return Math.abs(label[1]) / res;
        });
        offsets.forEach(px => expect(px).toBeCloseTo(offsets[0], 6));
        expect(offsets[0]).toBeGreaterThan(8);
    });

    it('stays with its own segment on a line that doubles back', () => {
        // The reported case: a saved line whose vertices had been dragged until the path
        // crosses back over itself. The label used to clear geometry it was never near --
        // 5,056,254 map units from its segment, against a tooth reach of 180,000.
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

        const resolution = 9783.93962050256;
        const label = labelPointFor(drawn, resolution);
        const segIdx = 3;
        const [p1, p2] = [drawn[segIdx], drawn[segIdx + 1]];
        const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
        const distancePx = Math.hypot(label[0] - mid[0], label[1] - mid[1]) / resolution;

        // A line of text and a gap — not the width of the whole drawing.
        expect(distancePx).toBeLessThan(40);
    });
});

/**
 * Obstacle crenellation, now drawn in screen space.
 *
 * Three properties, each of which the old baked-in geometry got wrong:
 *
 *  - the side the teeth fall on is a property of the shape, not of the order its corners
 *    were clicked;
 *  - their size is a count of screen pixels, so it does not change with zoom;
 *  - except where the symbol is too small to carry them, which is the one case a
 *    constant cannot serve.
 */
describe('obstacle teeth in screen space', () => {
    // A square, and the same square with its corners in the opposite order.
    const CLOCKWISE: number[][] = [[0, 0], [0, 4000], [4000, 4000], [4000, 0], [0, 0]];
    const ANTICLOCKWISE = [...CLOCKWISE].reverse();

    const areaFeature = (ring: number[][]) => new Feature(new Polygon([ring]));

    /** Apexes: the vertices the style adds, i.e. the ones off the drawn outline. */
    const apexes = (ring: number[][], resolution: number, outward: boolean) => {
        const styles = obstacleAreaStyles(areaFeature(ring), resolution, {outward});
        const drawn = (styles[0].getGeometry() as Polygon).getCoordinates()[0];
        const onOutline = ([x, y]: number[]) =>
            (Math.abs(x) < 1 || Math.abs(x - 4000) < 1) || (Math.abs(y) < 1 || Math.abs(y - 4000) < 1);
        return drawn.filter(c => !onOutline(c));
    };

    const inside = ([x, y]: number[]) => x > 0 && x < 4000 && y > 0 && y < 4000;

    it('points them outward whichever way the area was drawn', () => {
        for (const ring of [CLOCKWISE, ANTICLOCKWISE]) {
            const found = apexes(ring, 10, true);
            expect(found.length).toBeGreaterThan(0);
            expect(found.every(a => !inside(a))).toBe(true);
        }
    });

    it('points them inward whichever way the area was drawn', () => {
        for (const ring of [CLOCKWISE, ANTICLOCKWISE]) {
            const found = apexes(ring, 10, false);
            expect(found.length).toBeGreaterThan(0);
            expect(found.every(a => inside(a))).toBe(true);
        }
    });

    /** How far an apex stands off the edge it sits on, in screen pixels. */
    const toothHeightPx = (resolution: number) => {
        const found = apexes(CLOCKWISE, resolution, true);
        const offsets = found.map(([x, y]) => {
            if (x < 0) return -x;
            if (x > 4000) return x - 4000;
            if (y < 0) return -y;
            return y - 4000;
        });
        return Math.max(...offsets) / resolution;
    };

    it('holds the same pixel height as the map scales', () => {
        // The whole point: the same symbol, the same size on screen, at every zoom.
        // Baked into geometry this was fixed in *metres*, so zooming in grew the teeth.
        for (const resolution of [40, 10, 2, 0.5]) {
            expect(toothHeightPx(resolution)).toBeCloseTo(10, 6);
        }
    });

    /** Tallest excursion outside the drawn square, in px. 0 when nothing was added. */
    const areaToothPx = (sideMetres: number, resolution: number) => {
        const ring: number[][] = [[0, 0], [0, sideMetres], [sideMetres, sideMetres], [sideMetres, 0], [0, 0]];
        const styles = obstacleAreaStyles(new Feature(new Polygon([ring])), resolution, {outward: true});
        const drawn = (styles[0].getGeometry() as Polygon).getCoordinates()[0];
        const offsets = drawn
            .map(([x, y]) => Math.max(-x, x - sideMetres, -y, y - sideMetres))
            .filter(d => d > 0.001);
        return (offsets.length ? Math.max(...offsets) : 0) / resolution;
    };

    it('shrinks the teeth rather than swamping a symbol too small to carry them', () => {
        // 800 m at resolution 10 is 80 px across. A full 10 px tooth is an eighth of the
        // symbol, so it is capped at DECORATION_MAX_SHARE_CLOSED of the shape instead.
        const tallestPx = areaToothPx(800, 10);
        expect(tallestPx).toBeLessThan(10);
        expect(tallestPx).toBeCloseTo(80 * 0.1, 6);
    });

    it('drops the teeth entirely once they would be a few pixels', () => {
        // A 40 m square at resolution 10 is 4 px across — the gallery case. The cap would
        // put the teeth at 0.4 px, which is texture on the stroke rather than a symbol,
        // so the plain ring is drawn instead. Below DECORATION_MIN_PX there is no
        // decoration at all.
        expect(areaToothPx(40, 10)).toBe(0);
    });

    it('leaves a degenerate ring alone rather than emitting spikes', () => {
        const flat: number[][] = [[0, 0], [0, 0], [0, 0]];
        const styles = obstacleAreaStyles(new Feature(new Polygon([flat])), 10, {outward: true});
        expect((styles[0].getGeometry() as Polygon).getCoordinates()[0]).toEqual(flat);
    });

    it('hatches the restricted area and only the restricted area', () => {
        const restricted = obstacleRestrictedZoneStyle(areaFeature(CLOCKWISE), 10) as Style[];
        const belt = obstacleAreaStyles(areaFeature(CLOCKWISE), 10, {outward: true});
        expect(restricted[0].getFill()).not.toBeNull();
        expect(belt[0].getFill()).toBeFalsy();
    });
});

/**
 * The rest of the family whose decoration was baked into geometry at the drawing
 * resolution: the fortified line and area wear square merlons, the forward line of own
 * troops and the line of contact wear scallops. All four are screen-sized now.
 */
describe('fortified and wave graphics in screen space', () => {
    const LINE = [[0, 0], [4000, 0]];
    const RING: number[][] = [[0, 0], [0, 4000], [4000, 4000], [4000, 0], [0, 0]];

    const lineFeature = (name: TacticalGraphicName, drawn: number[][] = LINE) => {
        const f = new Feature(new LineString(drawn));
        writeGraphicProperties([f], name, {label: ''});
        return f;
    };

    /** Every vertex the style adds that leaves the drawn line, in pixels off it. */
    const excursionsPx = (styles: Style[], resolution: number, index = 0) => {
        const geom = styles[index].getGeometry() as LineString;
        return geom.getCoordinates().map(([, y]) => Math.abs(y) / resolution).filter(d => d > 0.01);
    };

    /** Tallest merlon on the 4 km LINE at a given resolution, in px. */
    const fortifiedLinePx = (res: number) => {
        const styles = fortifiedLineStyleFunc(TacticalGraphicName.FortifiedLine)(
            lineFeature(TacticalGraphicName.FortifiedLine), res) as Style[];
        return Math.max(...excursionsPx(styles, res));
    };

    // Resolution 40 is deliberately absent: it puts the 4 km line at 100 px, small
    // enough on screen that the shape-relative cap engages. That is the subject of the
    // test below, not a violation of this one.
    it('sizes the fortified line’s merlons in pixels, not metres', () => {
        const heights = [10, 2, 0.5].map(fortifiedLinePx);
        heights.forEach(h => expect(h).toBeCloseTo(heights[0], 6));
        expect(heights[0]).toBeCloseTo(11, 6);
    });

    it('shrinks the merlons once the line itself is small on screen', () => {
        // 4 km at resolution 40 is 100 px. An 11 px merlon on a 100 px line reads as a
        // zigzag rather than as a fortified line, so it is capped at
        // DECORATION_MAX_SHARE_OPEN of the length.
        expect(fortifiedLinePx(40)).toBeCloseTo(100 * 0.05, 6);
        expect(fortifiedLinePx(40)).toBeLessThan(fortifiedLinePx(10));
    });

    it('sizes the fortified area’s merlons in pixels too, outward whichever way it was drawn', () => {
        for (const ring of [RING, [...RING].reverse()]) {
            const f = new Feature(new Polygon([ring]));
            // Resolution 40 leaves the 4 km ring 100 px across, inside the cap — see the
            // fortified line's pair of tests above.
            const heights = [10, 2].map(res => {
                const drawn = (fortifiedAreaStyle(f, res)[0].getGeometry() as Polygon).getCoordinates()[0];
                const outside = drawn.filter(([x, y]) => x < -0.01 || x > 4000.01 || y < -0.01 || y > 4000.01);
                const inside = drawn.filter(([x, y]) => x > 0.01 && x < 3999.99 && y > 0.01 && y < 3999.99);
                expect(outside.length).toBeGreaterThan(0);
                expect(inside.length).toBe(0);
                return Math.max(...outside.map(([x, y]) => Math.max(-x, x - 4000, -y, y - 4000))) / res;
            });
            heights.forEach(h => expect(h).toBeCloseTo(11, 6));
        }
    });

    /** Tallest scallop on the 4 km LINE at a given resolution, in px. */
    const flotAmplitudePx = (res: number) => {
        const styles = forwardLineOfOwnTroopsStyleFunc(TacticalGraphicName.ForwardLineOfOwnTroops)(
            lineFeature(TacticalGraphicName.ForwardLineOfOwnTroops), res) as Style[];
        return Math.max(...excursionsPx(styles, res));
    };

    // Resolution 40 excluded for the same reason as the fortified line: 100 px of line
    // is inside the shape-relative cap.
    it('sizes the forward line of own troops’ scallops in pixels', () => {
        [10, 2, 0.5].map(flotAmplitudePx).forEach(a => expect(a).toBeCloseTo(8, 6));
    });

    it('shrinks the scallops once the line itself is small on screen', () => {
        expect(flotAmplitudePx(40)).toBeCloseTo(100 * 0.05, 6);
    });

    describe('line of contact', () => {
        const styles = (res: number, drawn: number[][] = LINE) =>
            lineOfContactStyleFunc()(lineFeature(TacticalGraphicName.LineOfContact, drawn), res) as Style[];

        /** The gap between the two waves at their closest, in pixels. */
        const separationPx = (res: number, drawn: number[][] = LINE) => {
            const [enemy, friendly] = styles(res, drawn);
            const ys = (s: Style) => (s.getGeometry() as LineString).getCoordinates().map(c => c[1]);
            const enemyYs = ys(enemy);
            const friendlyYs = ys(friendly);
            return (Math.min(...enemyYs.filter(y => y > 0)) - Math.max(...friendlyYs.filter(y => y < 0))) / res;
        };

        it('holds the distance between the two lines as the map scales', () => {
            // The whole point of the symbol is the pair, so the gap between them cannot
            // be a distance on the ground. Baked into geometry it was exactly that.
            const gaps = [40, 10, 2, 0.5].map(res => separationPx(res));
            gaps.forEach(g => expect(g).toBeCloseTo(2 * 16, 6));
        });

        it('holds it on a short line too, where a size cap would have closed the gap', () => {
            // Every other decoration here shrinks on a symbol too small to carry it.
            // This one must not: the separation *is* the symbol, so it survives a line
            // only a few pixels long as well as a zoom change.
            const short = [[0, 0], [200, 0]];
            expect(separationPx(10, short)).toBeCloseTo(2 * 16, 6);
        });

        it('puts the enemy-side wave above and the friendly-side below, either way drawn', () => {
            for (const drawn of [LINE, [...LINE].reverse()]) {
                const [enemy, friendly] = styles(10, drawn);
                const highest = (s: Style) => Math.max(...(s.getGeometry() as LineString).getCoordinates().map(c => c[1]));
                const lowest = (s: Style) => Math.min(...(s.getGeometry() as LineString).getCoordinates().map(c => c[1]));
                expect(highest(enemy)).toBeGreaterThan(0);
                expect(lowest(friendly)).toBeLessThan(0);
            }
        });

        it('draws the enemy side red and the friendly side in the default line colour', () => {
            const [enemy, friendly] = styles(10);
            expect(enemy.getStroke()!.getColor()).toBe(getColorByHostility(TacticalGraphicHostility.hostileFaker));
            expect(friendly.getStroke()!.getColor()).toBe(getDefaultLineColor());
        });

        it('still labels both ends LC', () => {
            const texts = styles(10).map(s => s.getText?.()?.getText?.()).filter(Boolean);
            expect(texts).toEqual(['LC', 'LC']);
        });
    });
});

/**
 * The centre symbol Cover / Guard / Screen draw between their arms.
 *
 * It used to be a hardcoded SIDC built through a static `import ms from
 * 'milsymbol'`, which made an optional peer dependency mandatory for the whole
 * `/openlayers` entry point and ignored the graphic's affiliation entirely.
 */
describe('security operation centre symbol', () => {
    afterEach(() => setSecurityOperationSymbolProvider(undefined));

    it('draws nothing until a host registers a provider', () => {
        expect(getSecurityOperationSymbolProvider()).toBeUndefined();
    });

    // The literal is the code the controller carried inline. Deriving the SIDC from
    // hostility must not have moved the symbol a Friend graphic renders.
    it('reproduces the historical SIDC for a friendly graphic', () => {
        expect(securityOperationSidc(TacticalGraphicHostility.friend)).toBe('130310001413010000000000000000');
    });

    it('varies only the standard-identity digit, position 4', () => {
        const friend = securityOperationSidc(TacticalGraphicHostility.friend);
        for (const hostility of Object.values(TacticalGraphicHostility)) {
            const sidc = securityOperationSidc(hostility);
            expect(sidc).toHaveLength(30);
            // Everything except digit 4 is identical across every affiliation.
            expect(sidc.slice(0, 3) + sidc.slice(4)).toBe(friend.slice(0, 3) + friend.slice(4));
        }
    });

    it('maps each affiliation to its 2525E identity digit', () => {
        const digit = (h: TacticalGraphicHostility) => securityOperationSidc(h)[3];
        expect(digit(TacticalGraphicHostility.pending)).toBe('0');
        expect(digit(TacticalGraphicHostility.unknown)).toBe('1');
        expect(digit(TacticalGraphicHostility.assumedFriend)).toBe('2');
        expect(digit(TacticalGraphicHostility.friend)).toBe('3');
        expect(digit(TacticalGraphicHostility.neutral)).toBe('4');
        expect(digit(TacticalGraphicHostility.suspectJoker)).toBe('5');
        expect(digit(TacticalGraphicHostility.hostileFaker)).toBe('6');
    });

    it('survives a provider that throws, losing the glyph and not the graphic', () => {
        setSecurityOperationSymbolProvider(() => {
            throw new Error('no canvas here');
        });
        const feature = new Feature(new Point([0, 0]));
        writeGraphicProperties([feature], TacticalGraphicName.Screen, {
            label: '',
            hostility: TacticalGraphicHostility.friend,
        });
        const style = securityOperationSymbolStyle(TacticalGraphicName.Screen, () => feature);
        expect(() => style(feature, 10)).not.toThrow();
        expect(style(feature, 10)).toBeUndefined();
    });
});

/**
 * The centre symbol's on-screen size.
 *
 * It was a hardcoded 25px, and because the library builds the `Icon` around a
 * provider that returns a `src` string, a provider could not change it — passing
 * milsymbol its own `size` looked like it should and only changed the SVG's
 * internal resolution.
 */
describe('security operation centre symbol size', () => {
    afterEach(() => {
        setSecurityOperationSymbolProvider(undefined);
        setSecurityOperationSymbolSize(DEFAULT_SYMBOL_SIZE_PX);
    });

    it('defaults to the shipped size', () => {
        expect(getSecurityOperationSymbolSize()).toBe(25);
    });

    it('reaches the provider, so a string-returning provider is sized too', () => {
        const seen: number[] = [];
        setSecurityOperationSymbolProvider(({sizePx}) => {
            seen.push(sizePx);
            return undefined;
        });
        const feature = new Feature(new Point([0, 0]));
        writeGraphicProperties([feature], TacticalGraphicName.Screen, {label: ''});
        const style = securityOperationSymbolStyle(TacticalGraphicName.Screen, () => feature);

        style(feature, 10);
        setSecurityOperationSymbolSize(48);
        style(feature, 10);

        expect(seen).toEqual([DEFAULT_SYMBOL_SIZE_PX, 48]);
    });

    it('clamps to a readable range', () => {
        setSecurityOperationSymbolSize(9999);
        expect(getSecurityOperationSymbolSize()).toBe(MAX_SYMBOL_SIZE_PX);
        setSecurityOperationSymbolSize(0);
        expect(getSecurityOperationSymbolSize()).toBe(MIN_SYMBOL_SIZE_PX);
    });
});

/**
 * Per-graphic centre symbols.
 *
 * The provider registration is global — one call configures the whole app — so
 * without an override two Screens can only differ by what they already carry. A
 * map routinely wants a different unit symbol on one than on another.
 */
describe('per-graphic centre symbol providers', () => {
    afterEach(() => setSecurityOperationSymbolProvider(undefined));

    const screenFeature = () => {
        const feature = new Feature(new Point([0, 0]));
        writeGraphicProperties([feature], TacticalGraphicName.Screen, {label: ''});
        return feature;
    };

    /** A StyleFunction may return one Style or several; these providers return one. */
    const srcOf = (style: StyleFunction, feature: Feature): string | undefined => {
        const resolved = style(feature, 10);
        const first = Array.isArray(resolved) ? resolved[0] : resolved;
        return (first?.getImage() as Icon | null | undefined)?.getSrc();
    };

    it('overrides the global provider for that graphic only', () => {
        setSecurityOperationSymbolProvider(() => 'global');
        const feature = screenFeature();

        const usesGlobal = securityOperationSymbolStyle(TacticalGraphicName.Screen, () => feature);
        const usesOwn = securityOperationSymbolStyle(TacticalGraphicName.Screen, () => feature, () => () => 'mine');

        expect(srcOf(usesGlobal, feature)).toBe('global');
        expect(srcOf(usesOwn, feature)).toBe('mine');
    });

    /**
     * The regression the provider-keyed cache exists for. Two graphics identical in
     * every field of the request, differing only in provider: a cache keyed on the
     * request alone would hand the second one whatever the first produced.
     */
    it('does not serve one graphic the other one\'s symbol', () => {
        const feature = screenFeature();
        const a = securityOperationSymbolStyle(TacticalGraphicName.Screen, () => feature, () => () => 'recon');
        const b = securityOperationSymbolStyle(TacticalGraphicName.Screen, () => feature, () => () => 'armour');

        expect(srcOf(a, feature)).toBe('recon');
        expect(srcOf(b, feature)).toBe('armour');
        // And again, now that both are cached.
        expect(srcOf(a, feature)).toBe('recon');
    });

    /**
     * The global provider's only lever for these three: they are SHAPE_ONLY in the
     * field registry and carry hostility alone, so `labels` cannot tell two Screens
     * apart. `name` is what a global provider branches on.
     */
    it('caches one symbol per graphic name, so one provider can vary by graphic', () => {
        const byName = (r: {name: TacticalGraphicName}) => `symbol-for-${r.name}`;
        const feature = screenFeature();
        const cover = new Feature(new Point([0, 0]));
        writeGraphicProperties([cover], TacticalGraphicName.Cover, {label: ''});

        const screenStyle = securityOperationSymbolStyle(TacticalGraphicName.Screen, () => feature, () => byName);
        const coverStyle = securityOperationSymbolStyle(TacticalGraphicName.Cover, () => cover, () => byName);

        expect(srcOf(screenStyle, feature)).toBe(`symbol-for-${TacticalGraphicName.Screen}`);
        expect(srcOf(coverStyle, cover)).toBe(`symbol-for-${TacticalGraphicName.Cover}`);
    });

    it('falls back to the global provider when the override is cleared', () => {
        setSecurityOperationSymbolProvider(() => 'global');
        const feature = screenFeature();
        let own: (() => string) | undefined = () => 'mine';
        const style = securityOperationSymbolStyle(TacticalGraphicName.Screen, () => feature, () => own);

        expect(srcOf(style, feature)).toBe('mine');
        own = undefined;
        expect(srcOf(style, feature)).toBe('global');
    });
});

/**
 * The `{src, sizePx}` return form.
 *
 * A bare string is sized by the global `setSecurityOperationSymbolSize`, and
 * overriding that per graphic used to mean returning a whole `Style` — building a
 * `Style` and an `Icon`, and remembering the centring anchor, to change one number.
 *
 * The painted width is deliberately NOT asserted here. `Icon.getWidth()` is
 * documented to return undefined until the image has loaded, and jsdom never loads
 * one, so a width assertion in this suite can only ever read undefined. What the
 * icons actually measure is checked against a real browser instead — see the
 * probe in the notes for this change.
 */
describe('provider return shapes', () => {
    afterEach(() => {
        setSecurityOperationSymbolProvider(undefined);
        setSecurityOperationSymbolSize(DEFAULT_SYMBOL_SIZE_PX);
    });

    const feature = () => {
        const f = new Feature(new Point([0, 0]));
        writeGraphicProperties([f], TacticalGraphicName.Screen, {label: ''});
        return f;
    };

    const iconOf = (style: StyleFunction, f: Feature): Icon | undefined => {
        const resolved = style(f, 10);
        const first = Array.isArray(resolved) ? resolved[0] : resolved;
        return (first?.getImage() as Icon | null | undefined) ?? undefined;
    };

    it('wraps a bare string in an icon', () => {
        const f = feature();
        const style = securityOperationSymbolStyle(TacticalGraphicName.Screen, () => f, () => () => 'from-string');
        expect(iconOf(style, f)?.getSrc()).toBe('from-string');
    });

    it('wraps {src, sizePx} in an icon too', () => {
        const f = feature();
        const style = securityOperationSymbolStyle(TacticalGraphicName.Screen, () => f, () => () => ({src: 'from-object', sizePx: 64}));
        expect(iconOf(style, f)?.getSrc()).toBe('from-object');
    });

    it('does not disturb the global size when a symbol overrides it', () => {
        setSecurityOperationSymbolSize(30);
        const f = feature();
        const style = securityOperationSymbolStyle(TacticalGraphicName.Screen, () => f, () => () => ({src: 'x', sizePx: 64}));
        iconOf(style, f);
        expect(getSecurityOperationSymbolSize()).toBe(30);
    });

    it('uses a returned Style verbatim, sizing and all', () => {
        const f = feature();
        const mine = new Style({image: new Icon({src: 'x', width: 123})});
        const style = securityOperationSymbolStyle(TacticalGraphicName.Screen, () => f, () => () => mine);
        expect(style(f, 10)).toBe(mine);
    });

    it('still resolves nothing when the provider returns undefined', () => {
        const f = feature();
        const style = securityOperationSymbolStyle(TacticalGraphicName.Screen, () => f, () => () => undefined);
        expect(style(f, 10)).toBeUndefined();
    });
});

/**
 * StrongPoint's cross ties.
 *
 * These are where the screen-fixed decorations started — the obstacle teeth and the
 * fortified merlons were changed on 2026-08-03 to match them — but they were the one
 * set that never got the shape-relative cap, so zoomed out they swamped the ring they
 * hang off.
 */
describe('strong point cross ties', () => {
    /** A square strong point of `sideMetres`, and the tie lengths it renders, in px. */
    const tiePx = (sideMetres: number, resolution: number): number[] => {
        const ring: number[][] = [
            [0, 0], [0, sideMetres], [sideMetres, sideMetres], [sideMetres, 0], [0, 0],
        ];
        const f = new Feature(new Polygon([ring]));
        writeGraphicProperties([f], TacticalGraphicName.StrongPoint, {label: ''});
        const styles = getStyle(TacticalGraphicName.StrongPoint, f, resolution) as Style[];
        return styles
            .map(s => s.getGeometry())
            .filter((g): g is LineString => g instanceof LineString)
            .map(g => {
                const [a, b] = g.getCoordinates();
                return Math.hypot(b[0] - a[0], b[1] - a[1]) / resolution;
            });
    };

    it('holds the same pixel length while the ring is comfortably large', () => {
        // 40 km at resolutions 40 and 10 is 1000 px and 4000 px across — far above the
        // cap either way, so the ties keep their constant 10 px.
        for (const resolution of [40, 10]) {
            const ties = tiePx(40_000, resolution);
            expect(ties.length).toBeGreaterThan(0);
            ties.forEach(t => expect(t).toBeCloseTo(10, 6));
        }
    });

    it('shrinks the ties once the ring is small on screen', () => {
        // 100 px across is exactly the boundary — DECORATION_MAX_SHARE_CLOSED of it is
        // the tie's own 10 px, so nothing is taken off. 2 km at resolution 40 is 50 px,
        // inside it, and the ties come down to a tenth of that.
        expect(tiePx(4_000, 40)[0]).toBeCloseTo(10, 6);

        const ties = tiePx(2_000, 40);
        expect(ties.length).toBeGreaterThan(0);
        ties.forEach(t => expect(t).toBeCloseTo(50 * 0.1, 6));
    });

    it('drops the ties entirely once they would be a few pixels', () => {
        // 400 m at resolution 40 is 10 px across — the cap puts a tie at 1 px, which is
        // fuzz on the outline rather than a symbol. The outline is still drawn.
        expect(tiePx(400, 40)).toHaveLength(0);
        const f = new Feature(new Polygon([[[0, 0], [0, 400], [400, 400], [400, 0], [0, 0]]]));
        writeGraphicProperties([f], TacticalGraphicName.StrongPoint, {label: ''});
        expect((getStyle(TacticalGraphicName.StrongPoint, f, 40) as Style[]).length).toBeGreaterThan(0);
    });
});
