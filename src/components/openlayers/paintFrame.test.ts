/**
 * # The OpenLayers paint frame
 *
 * OpenLayers styles one feature at a time with only a resolution, so the manager opens a frame
 * around each map render that hands the style functions the view and the labels styled before.
 * These pin that a phase line's label follows the view inside a frame, that two labels styled in
 * one frame keep clear of each other, and that a style call outside a frame paints as before.
 * @see beginPaintFrame
 */

import {Feature} from 'ol';
import {LineString, Point} from 'ol/geom';
import type {Style} from 'ol/style';
import {TACTICAL_GRAPHIC_KEY, TacticalGraphicName} from '@zaes/tactical-graphics';
import {beginPaintFrame, endPaintFrame, toPaintFeature} from './paintToOpenLayers';
import {getAreaLabelStylesFn, phaseLineStyleFunc} from './openlayerStyles';

const RESOLUTION = 100;

const phaseLine = (id: string, y: number, designation: string) =>
    new Feature({
        geometry: new LineString([
            [-200_000, y],
            [200_000, y],
        ]),
        symbolId: id,
        role: 'graphic',
        [TACTICAL_GRAPHIC_KEY]: {name: TacticalGraphicName.PhaseLine, designation},
    });

/** Where a styled feature's text is drawn. */
const textAt = (styles: Style[]) =>
    styles
        .filter(s => s.getText()?.getText())
        .map(s => (s.getGeometry() as {getCoordinates(): number[]} | null)?.getCoordinates?.())
        .filter((c): c is number[] => !!c);

const style = phaseLineStyleFunc(TacticalGraphicName.PhaseLine);

afterEach(() => endPaintFrame());

describe('the OpenLayers paint frame', () => {
    // Only the middle of the line is on screen: both ends, and their labels, are off it.
    const view = {minX: -50_000, minY: -40_000, maxX: 50_000, maxY: 40_000};

    it('puts an off-screen label onto the view inside a frame, and nowhere else', () => {
        const line = phaseLine('a', 0, 'BLUE');
        const outside = textAt(style(line, RESOLUTION) as Style[]);
        expect(outside.length).toBeGreaterThan(0);
        expect(outside.every(([x]) => x < view.minX || x > view.maxX)).toBe(true);

        beginPaintFrame(view, RESOLUTION, () => [{id: 'a', feature: toPaintFeature(line)!}]);
        const inside = textAt(style(line, RESOLUTION) as Style[]);
        expect(inside.some(([x, y]) => x >= view.minX && x <= view.maxX && y >= view.minY && y <= view.maxY)).toBe(true);
    });

    it('keeps two labels styled in one frame off each other', () => {
        // Close enough that the moved labels would overlap, far enough apart that the second
        // label has room clear of the first line. (Closer, there is no clear place at all, and
        // a label with none keeps its usual one.)
        const [a, b] = [phaseLine('a', 0, 'BLUE'), phaseLine('b', 1_500, 'RED')];
        const graphics = () => [a, b].map(f => ({id: f.get('symbolId') as string, feature: toPaintFeature(f)!}));

        beginPaintFrame(view, RESOLUTION, graphics);
        const first = textAt(style(a, RESOLUTION) as Style[]);
        const crowded = textAt(style(b, RESOLUTION) as Style[]);
        endPaintFrame();

        // Styled alone in a frame, the second label lands where the first one sits.
        beginPaintFrame(view, RESOLUTION, graphics);
        const alone = textAt(style(b, RESOLUTION) as Style[]);
        endPaintFrame();

        expect(alone).not.toEqual(crowded);
        expect(first.length).toBeGreaterThan(0);
    });

    it('ignores a frame drawn at another resolution, as a hit test at a different zoom would be', () => {
        const line = phaseLine('a', 0, 'BLUE');
        const plain = textAt(style(line, RESOLUTION) as Style[]);
        beginPaintFrame(view, RESOLUTION * 2, () => [{id: 'a', feature: toPaintFeature(line)!}]);
        expect(textAt(style(line, RESOLUTION) as Style[])).toEqual(plain);
    });
});

describe('an area label in the OpenLayers paint frame', () => {
    // An objective far wider than the view, whose centered name is off to the west of it.
    const ring = [
        [-200_000, -100_000],
        [200_000, -100_000],
        [200_000, 100_000],
        [-200_000, 100_000],
        [-200_000, -100_000],
    ];
    const label = () =>
        new Feature({
            geometry: new Point([0, 0]),
            symbolId: 'obj',
            role: 'label',
            polygonRing: ring,
            [TACTICAL_GRAPHIC_KEY]: {name: TacticalGraphicName.ObjectiveArea, designation: 'SWORD'},
        });
    const view = {minX: 100_000, minY: -40_000, maxX: 180_000, maxY: 40_000};
    const areaStyle = getAreaLabelStylesFn(TacticalGraphicName.ObjectiveArea);

    it('moves into the visible part of the area, as the other engines move it', () => {
        const feature = label();
        const outside = textAt(areaStyle(feature, RESOLUTION) as Style[]);
        expect(outside.length).toBeGreaterThan(0);
        expect(outside.every(([x]) => x < view.minX)).toBe(true);

        beginPaintFrame(view, RESOLUTION, () => []);
        const inside = textAt(areaStyle(feature, RESOLUTION) as Style[]);
        expect(inside.length).toBeGreaterThan(0);
        expect(inside.every(([x, y]) => x >= view.minX && x <= view.maxX && y >= view.minY && y <= view.maxY)).toBe(true);
    });
});
