/**
 * # An area keeps its doctrinal prefix when its name is too small to read
 *
 * `OBJ GRANITE`, `JTAA - 02`, `FSA` over `ALPHA`: once the fit takes the whole label under
 * the legibility floor, the name goes and the prefix stays, drawn at a size that can be read,
 * until the area is smaller than about twice it. (User, 2026-10-24.) @see legibleDesignation
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {BASE_FONT_SIZE_PX, MIN_LEGIBLE_TEXT_PX, resetTacticalGraphicsConfig} from '../core/config';
import {actionAreaLabelPaint, areaDefaultLabelPaint, areaLabelStackPaint, zoneLabelPaint} from './areaLabelPaints';

const context: PaintContext = {
    resolution: 1,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
};

/** A square area `sidePx` screen pixels across, labelled at its middle. */
const area = (name: TacticalGraphicName, sidePx: number, designation: string): PaintFeature => {
    const h = sidePx / 2;
    return {
        geometry: {type: 'Point', coordinates: [0, 0]},
        properties: {name, designation},
        bounds: {minX: -h, minY: -h, maxX: h, maxY: h},
        ring: [
            [-h, -h],
            [h, -h],
            [h, h],
            [-h, h],
            [-h, -h],
        ] as ProjectedPosition[],
    } as PaintFeature;
};

/** The marks that would survive the legibility floor, as `[text, px]`. */
const legible = (paints: Paint[]): [string, number][] =>
    paints
        .filter(p => p.text?.text)
        .map(p => [p.text!.text, BASE_FONT_SIZE_PX * (p.text!.scale ?? 1)] as [string, number])
        .filter(([, px]) => px >= MIN_LEGIBLE_TEXT_PX);

beforeEach(() => resetTacticalGraphicsConfig());

describe.each([
    [
        'the centred stack',
        () => areaLabelStackPaint(TacticalGraphicName.ObjectiveArea),
        TacticalGraphicName.ObjectiveArea,
        'GRANITE',
        'OBJ GRANITE',
        'OBJ',
    ],
    [
        'the default area label',
        () => areaDefaultLabelPaint(TacticalGraphicName.ObjectiveArea),
        TacticalGraphicName.ObjectiveArea,
        'GRANITE',
        'OBJ GRANITE',
        'OBJ',
    ],
    [
        'the action areas',
        () => actionAreaLabelPaint(TacticalGraphicName.JointTacticalActionArea),
        TacticalGraphicName.JointTacticalActionArea,
        'NORTH 02',
        'JTAA - NORTH 02',
        'JTAA',
    ],
    [
        'the zones',
        () => zoneLabelPaint(TacticalGraphicName.FireSupportAreaRectangular, false),
        TacticalGraphicName.FireSupportAreaRectangular,
        'LONGNAME ALPHA',
        'FSA\nLONGNAME ALPHA',
        'FSA',
    ],
])('%s', (_family, paintOf, name, designation, full, prefix) => {
    it('draws the whole label while it is legible', () => {
        const drawn = legible(paintOf()(area(name, 600, designation), context));
        expect(drawn.map(([text]) => text)).toEqual([full]);
    });

    it('keeps the prefix alone, at a legible size, once the whole would be too small', () => {
        const paints = paintOf()(area(name, 40, designation), context);
        expect(legible(paints)).toEqual([[prefix, MIN_LEGIBLE_TEXT_PX]]);
    });

    it('draws nothing once the area is smaller than about twice the prefix', () => {
        expect(legible(paintOf()(area(name, 12, designation), context))).toEqual([]);
    });
});
