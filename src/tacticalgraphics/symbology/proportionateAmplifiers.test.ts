/**
 * # Amplifiers follow the main label, and text in a break closes with it
 *
 * Zoomed out, a zone's dates stood twice the height of the name inside it and stayed once the
 * name had gone, and AMA, ARA and the safe-distance zone numbers left their breaks open after
 * the legibility floor took the text. (User, 2026-10-24.)
 */
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HANDLE_Z_INDEX, NAME_TEXT_Z_INDEX} from '../core/paint';
import {TacticalGraphicHostility, TacticalGraphicName} from '../core/type';
import {MIN_LEGIBLE_TEXT_PX, resetTacticalGraphicsConfig} from '../core/config';
import {fontStyle} from '../core/symbology';
import {cardinalBoundaryPaint, cardinalLabelPaint, nestedZonePaint} from './boundaryBreakPaints';
import {defaultLinePaint, labelColorOf, lineColorOf, withLegibleText, withProportionateAmplifiers, withUnobscuredNames} from './paintFunctions';
import {zoneLabelPaint} from './areaLabelPaints';

const context = (resolution: number): PaintContext => ({
    resolution,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
});

const textPaint = (text: string, scale: number, kind?: 'amplifier'): Paint => ({
    geometry: {type: 'Point', coordinates: [0, 0]},
    text: {text, font: fontStyle, fill: '#000', scale, ...(kind ? {kind} : {})},
});

const px = (paint: Paint) => parseFloat(paint.text!.font.match(/(\d*\.?\d+)px/)![1]) * (paint.text!.scale ?? 1);

beforeEach(() => resetTacticalGraphicsConfig());

describe('withProportionateAmplifiers', () => {
    it('holds an amplifier to the main label it sits beside', () => {
        const out = withProportionateAmplifiers([textPaint('TVAR', 0.5), textPaint('031813ZOCT26', 1, 'amplifier')]);
        expect(px(out[1])).toBeCloseTo(px(out[0]), 6);
    });

    it('leaves a smaller amplifier as it is', () => {
        const out = withProportionateAmplifiers([textPaint('TVAR', 1), textPaint('031813ZOCT26', 0.5, 'amplifier')]);
        expect(out[1].text!.scale).toBe(0.5);
    });

    it('takes the amplifiers away with a main label too small to read', () => {
        const out = withLegibleText([textPaint('TVAR', (MIN_LEGIBLE_TEXT_PX - 1) / 16), textPaint('031813ZOCT26', 1, 'amplifier')]);
        expect(out.filter(p => p.text)).toHaveLength(0);
    });

    it('leaves amplifiers alone where there is no main label', () => {
        const paints = [textPaint('031813ZOCT26', 1, 'amplifier')];
        expect(withProportionateAmplifiers(paints)).toBe(paints);
    });
});

/** A regular hexagon about the origin. */
function hexagon(radius: number): ProjectedPosition[] {
    const ring: ProjectedPosition[] = [];
    for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        ring.push([radius * Math.cos(a), radius * Math.sin(a)]);
    }
    ring.push(ring[0]);
    return ring;
}

const strokeRuns = (paints: Paint[]) =>
    paints.flatMap(p => (p.geometry.type === 'MultiLineString' ? p.geometry.coordinates : p.geometry.type === 'LineString' ? [p.geometry.coordinates] : []));
const texts = (paints: Paint[]) => paints.filter(p => p.text?.text);

describe('AMA and ARA close their outline once the abbreviation goes', () => {
    const ring = hexagon(1000);
    const bounds = {minX: -866, minY: -1000, maxX: 866, maxY: 1000};
    const area: PaintFeature = {geometry: {type: 'Polygon', coordinates: [ring]}, properties: {name: TacticalGraphicName.ArtilleryManeuverArea}, ring, bounds};
    const label: PaintFeature = {geometry: {type: 'Point', coordinates: [0, 0]}, properties: {name: TacticalGraphicName.ArtilleryManeuverArea}, ring, bounds};
    const boundary = cardinalBoundaryPaint('AMA');
    const marks = cardinalLabelPaint('AMA', () => []);

    it('writes AMA into four breaks on an area large enough to carry it', () => {
        const c = context(10);
        expect(texts(withLegibleText(marks(label, c)))).toHaveLength(4);
        expect(strokeRuns(boundary(area, c)).length).toBeGreaterThanOrEqual(4);
    });

    it('draws the outline whole, with no AMA, once the area is too small for it', () => {
        // The ring is 20 px across: AMA, however small, is wider than half of it.
        const c = context(100);
        expect(texts(withLegibleText(marks(label, c)))).toHaveLength(0);
        const runs = strokeRuns(boundary(area, c));
        expect(runs).toHaveLength(1);
        expect(runs[0]).toEqual(ring);
    });
});

describe('the safe-distance zone numbers close their rings when too small to read', () => {
    const inner = hexagon(1000);
    const outer = hexagon(2000);
    const zone = (): PaintFeature => ({
        geometry: {type: 'MultiLineString', coordinates: [inner, outer]},
        properties: {name: TacticalGraphicName.MinimumSafeDistanceZone},
        bounds: {minX: -1732, minY: -2000, maxX: 1732, maxY: 2000},
    });

    it('cuts both breaks and numbers them at a readable size', () => {
        const paints = nestedZonePaint()(zone(), context(1));
        expect(texts(paints).map(p => p.text!.text)).toEqual(['1', '2']);
        expect(strokeRuns(paints)).toHaveLength(2);
    });

    it('draws both rings whole, with no numbers, once the inner ring is too small for them', () => {
        // A number here would be about 4 px.
        const paints = nestedZonePaint()(zone(), context(200));
        expect(texts(paints)).toHaveLength(0);
        expect(strokeRuns(paints)).toEqual([inner, outer]);
    });
});

describe('a zone and a line carry their dates no larger than their name', () => {
    const square: ProjectedPosition[] = [[0, 0], [1000, 0], [1000, 1000], [0, 1000], [0, 0]];
    const bounds = {minX: 0, minY: 0, maxX: 1000, maxY: 1000};
    const props = {name: TacticalGraphicName.TargetValueAreaRectangular, designation: 'ALPHA', startDate: '031813ZOCT26', endDate: '311813ZOCT26'};
    const zone = (): PaintFeature => ({geometry: {type: 'Point', coordinates: [500, 500]}, properties: props, ring: square, bounds});
    const paint = zoneLabelPaint(TacticalGraphicName.TargetValueAreaRectangular, false);
    const dates = (paints: Paint[]) => paints.filter(p => p.text?.kind === 'amplifier' && p.text.text.includes('ZOCT26'));
    const names = (paints: Paint[]) => paints.filter(p => p.text?.text && p.text.kind !== 'amplifier');

    it('holds the dates outside a zone to the size of its name', () => {
        // Zoomed out far enough that the name inside is fitted down and the dates were not.
        const shown = withLegibleText(paint(zone(), context(20)));
        expect(dates(shown)).toHaveLength(1);
        expect(px(dates(shown)[0])).toBeLessThanOrEqual(Math.max(...names(shown).map(px)) + 1e-9);
    });

    it('takes the dates away with the name', () => {
        const shown = withLegibleText(paint(zone(), context(400)));
        expect(names(shown)).toHaveLength(0);
        expect(dates(shown)).toHaveLength(0);
    });

    it('drops a line\'s dates once its name is gone', () => {
        const line: PaintFeature = {
            geometry: {type: 'LineString', coordinates: [[0, 0], [1000, 0]]},
            properties: {name: TacticalGraphicName.FireSupportCoordinationLine, designation: 'ALPHA', startDate: '031813ZOCT26', endDate: '311813ZOCT26'},
            bounds: {minX: 0, minY: 0, maxX: 1000, maxY: 1},
        };
        const shown = withLegibleText(defaultLinePaint(TacticalGraphicName.FireSupportCoordinationLine)(line, context(400)));
        expect(names(shown)).toHaveLength(0);
        expect(dates(shown)).toHaveLength(0);
    });
});

describe('AMA and ARA take the label colour', () => {
    it('draws the abbreviation in the label colour, not the line colour', () => {
        const ring = hexagon(1000);
        const label: PaintFeature = {
            geometry: {type: 'Point', coordinates: [0, 0]},
            properties: {name: TacticalGraphicName.ArtilleryManeuverArea, hostility: TacticalGraphicHostility.hostileFaker},
            ring,
        };
        const marks = texts(cardinalLabelPaint('AMA', () => [])(label, context(10)));
        expect(marks).toHaveLength(4);
        for (const mark of marks) expect(mark.text!.fill).toBe(labelColorOf(label));
        expect(labelColorOf(label)).not.toBe(lineColorOf(label));
    });
});

describe('withUnobscuredNames', () => {
    const at = (x: number, y: number, text: string, kind?: 'amplifier', extra: Partial<Paint['text']> = {}): Paint => ({
        geometry: {type: 'Point', coordinates: [x, y]},
        text: {text, font: fontStyle, fill: '#000', ...(kind ? {kind} : {}), ...extra},
    });

    it('takes away an amplifier lying over the name', () => {
        const out = withUnobscuredNames([at(0, 0, 'ALPHA'), at(5, 2, '031813ZOCT26', 'amplifier')], context(1));
        expect(out.map(p => p.text?.text)).toEqual(['ALPHA']);
    });

    it('keeps an amplifier set clear of the name', () => {
        const out = withUnobscuredNames([at(0, 0, 'ALPHA'), at(0, -40, '031813ZOCT26', 'amplifier')], context(1));
        expect(out.map(p => p.text?.text)).toEqual(['ALPHA', '031813ZOCT26']);
    });

    it('keeps a date stacked a line under its name, halos touching', () => {
        // The area stack: name at the anchor, date 18 px below it.
        const out = withUnobscuredNames([at(0, 0, 'ALPHA', undefined, {halo: {color: '#fff', widthPx: 3}}), at(0, 0, '031813ZOCT26', 'amplifier', {offsetYPx: 18, halo: {color: '#fff', widthPx: 3}})], context(1));
        expect(out.map(p => p.text?.text)).toEqual(['ALPHA', '031813ZOCT26']);
    });

    it('reads a screen offset as the engines do, y down', () => {
        // Same anchor, pushed 30 px down the screen: clear of a one-line name.
        const out = withUnobscuredNames([at(0, 0, 'ALPHA'), at(0, 0, '031813ZOCT26', 'amplifier', {offsetYPx: 30})], context(1));
        expect(out.map(p => p.text?.text)).toEqual(['ALPHA', '031813ZOCT26']);
    });

    it('never takes the name away', () => {
        const out = withUnobscuredNames([at(0, 0, '031813ZOCT26', 'amplifier'), at(0, 0, 'ALPHA')], context(1));
        expect(out.map(p => p.text?.text)).toEqual(['ALPHA']);
    });
});

describe('names draw over the amplifiers of other graphics', () => {
    it('puts names and doctrinal text above amplifiers, and leaves a set order alone', () => {
        const name: Paint = {geometry: {type: 'Point', coordinates: [0, 0]}, text: {text: 'TVAR', font: fontStyle, fill: '#000'}};
        const date: Paint = {geometry: {type: 'Point', coordinates: [0, 500]}, text: {text: '031813ZOCT26', font: fontStyle, fill: '#000', kind: 'amplifier'}};
        const handle: Paint = {geometry: {type: 'Point', coordinates: [0, 900]}, text: {text: 'X', font: fontStyle, fill: '#000'}, zIndex: HANDLE_Z_INDEX};
        const line: Paint = {geometry: {type: 'LineString', coordinates: [[0, 0], [1, 1]]}, stroke: {color: '#000', widthPx: 2}};
        const [n, d, h, l] = withUnobscuredNames([name, date, handle, line], context(1));
        expect(n.zIndex).toBe(NAME_TEXT_Z_INDEX);
        expect(d.zIndex).toBeUndefined();
        expect(h.zIndex).toBe(HANDLE_Z_INDEX);
        expect(l.zIndex).toBeUndefined();
    });
});
