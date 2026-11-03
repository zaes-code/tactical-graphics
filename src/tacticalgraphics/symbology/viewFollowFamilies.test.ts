/**
 * # Labels on more line families follow the view
 *
 * Zoomed in on the middle of a long graphic, so its ends and its own middle labels are off
 * screen, each family below still puts its text on the view: the line control measures' end
 * labels (FEBA stands for all of them), line of contact's `LC`, an air corridor's leg name and
 * amplifier block, a mobility corridor's field H, and a safe lane's column. Painted through
 * `paintGraphic`, the path every engine shares. @see endAnchorInView, midSegmentInView
 */

import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {buildPaintedGraphic, paintGraphic} from '../core/paintedGraphic';
import type {Paint, PaintContext, ProjectedBounds, ProjectedPosition} from '../core/paint';

beforeEach(() => resetTacticalGraphicsConfig());

const measureText = (text: string, font: string) => text.length * parseFloat(/(\d+)px/.exec(font)?.[1] ?? '16') * 0.6;

/** About 670 km long, west to east along the equator. */
const LONG_LINE = {
    type: 'LineString' as const,
    coordinates: [
        [-3, 0],
        [3, 0],
    ],
};

/** A view 80 km wide on the middle of it. */
const VIEW: ProjectedBounds = {minX: -40_000, minY: -30_000, maxX: 40_000, maxY: 30_000};

const texts = (paints: Paint[]) =>
    paints.filter(p => p.text?.text && p.geometry.type === 'Point').map(p => ({text: p.text!.text, at: p.geometry.coordinates as ProjectedPosition}));
const inView = ([x, y]: ProjectedPosition) => x >= VIEW.minX && x <= VIEW.maxX && y >= VIEW.minY && y <= VIEW.maxY;

function painted(name: TacticalGraphicName, properties: Record<string, unknown>, geometry: object = LONG_LINE) {
    const graphic = buildPaintedGraphic(name, geometry as never, properties as never, 100)!;
    const context = (view?: ProjectedBounds): PaintContext => ({resolution: 100, measureText, ...(view ? {view} : {})});
    return {without: texts(paintGraphic(graphic, context())), within: texts(paintGraphic(graphic, context(VIEW)))};
}

describe('labels that follow the view, by family', () => {
    it('line control measures: both end labels come onto the view, reading inward', () => {
        const {without, within} = painted(TacticalGraphicName.ForwardEdgeOfBattleArea, {designation: 'ALPHA'});
        expect(without.filter(t => t.text.includes('FEBA')).every(t => !inView(t.at))).toBe(true);
        const shown = within.filter(t => t.text.includes('FEBA'));
        expect(shown.length).toBe(2);
        expect(shown.every(t => inView(t.at))).toBe(true);
    });

    it('line of contact: LC at each edge of the view', () => {
        const {without, within} = painted(TacticalGraphicName.LineOfContact, {});
        expect(without.every(t => !inView(t.at))).toBe(true);
        expect(within.filter(t => t.text === 'LC' && inView(t.at)).length).toBe(2);
    });

    it('air corridor: the leg name and the amplifier block', () => {
        const {without, within} = painted(TacticalGraphicName.AirCorridor, {designation: 'ALPHA', width: 2000});
        expect(without.some(t => t.text.includes('NAME') && !inView(t.at))).toBe(true);
        expect(within.some(t => t.text.includes('NAME') && inView(t.at))).toBe(true);
        expect(within.some(t => t.text.includes('AC') && !t.text.includes('NAME') && inView(t.at))).toBe(true);
    });

    it('mobility corridor: field H over what is in view', () => {
        const {without, within} = painted(TacticalGraphicName.MobilityCorridor, {additionalInfo: 'GOING'});
        expect(without.filter(t => t.text === 'GOING').every(t => !inView(t.at))).toBe(true);
        expect(within.some(t => t.text === 'GOING' && inView(t.at))).toBe(true);
    });

    it('moves nothing when the whole graphic is on screen', () => {
        const everything: ProjectedBounds = {minX: -2_000_000, minY: -1_000_000, maxX: 2_000_000, maxY: 1_000_000};
        for (const name of [
            TacticalGraphicName.ForwardEdgeOfBattleArea,
            TacticalGraphicName.LineOfContact,
            TacticalGraphicName.AirCorridor,
            TacticalGraphicName.MobilityCorridor,
        ]) {
            const graphic = buildPaintedGraphic(name, LONG_LINE, {designation: 'ALPHA', additionalInfo: 'GOING', width: 2000} as never, 100)!;
            const plain = texts(paintGraphic(graphic, {resolution: 100, measureText}));
            expect(texts(paintGraphic(graphic, {resolution: 100, measureText, view: everything}))).toEqual(plain);
        }
    });
});
