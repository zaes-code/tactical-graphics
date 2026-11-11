/**
 * # An area keeps its doctrinal prefix when its name is too small to read
 *
 * `OBJ GRANITE`, `JTAA - 02`, `FSA` over `ALPHA`: once the fit takes the whole label under
 * the legibility floor, the name goes and the prefix stays, drawn at a size that can be read,
 * until the area is smaller than about twice it. (User, 2026-10-24.) @see legibleDesignation
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicHostility, TacticalGraphicName} from '../core/type';
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

/*
 * ENY at the area's own scale ignored the cap that fits the name inside the outline, so on
 * a small hostile area it stood several times the size of the name.
 */
describe('ENY on a hostile area is no larger than its name', () => {
    const hostile = (name: TacticalGraphicName, sidePx: number): PaintFeature => {
        const feature = area(name, sidePx, 'ALPHA');
        feature.properties.hostility = TacticalGraphicHostility.hostileFaker;
        return feature;
    };
    const cases: [TacticalGraphicName, (f: PaintFeature, c: PaintContext) => Paint[]][] = [
        [TacticalGraphicName.AreaGeneric, actionAreaLabelPaint(TacticalGraphicName.AreaGeneric, {withAdditionalInfo: true})],
        [TacticalGraphicName.JointTacticalActionArea, actionAreaLabelPaint(TacticalGraphicName.JointTacticalActionArea)],
        [TacticalGraphicName.SubmarineActionArea, actionAreaLabelPaint(TacticalGraphicName.SubmarineActionArea)],
        [TacticalGraphicName.SubmarineGeneratedActionArea, actionAreaLabelPaint(TacticalGraphicName.SubmarineGeneratedActionArea)],
        [TacticalGraphicName.CorpsSupportArea, areaDefaultLabelPaint(TacticalGraphicName.CorpsSupportArea, true, true)],
    ];

    for (const [name, paint] of cases) {
        for (const sidePx of [60, 250]) {
            it(`${name}, ${sidePx} px across`, () => {
                const paints = paint(hostile(name, sidePx), context);
                const eny = paints.filter(p => p.text?.text === 'ENY').map(p => p.text!.scale ?? 1);
                expect(eny).toHaveLength(2);
                // The name may have gone; ENY then holds the size the name was fitted to.
                const named = paints.find(p => p.text?.text && p.text.text !== 'ENY');
                const nameScale = named?.text?.scale ?? 1;
                for (const scale of eny) expect(scale).toBeLessThanOrEqual(named ? nameScale : 0.5);
            });
        }
    }
});

describe('ENY on an unnamed hostile generic area', () => {
    const paint = actionAreaLabelPaint(TacticalGraphicName.AreaGeneric, {withAdditionalInfo: true});
    const enyScale = (sidePx: number): number => {
        const feature = area(TacticalGraphicName.AreaGeneric, sidePx, '');
        feature.properties.hostility = TacticalGraphicHostility.hostileFaker;
        return paint(feature, context).find(p => p.text?.text === 'ENY')!.text!.scale ?? 1;
    };

    it('shrinks with the area, with no name to follow', () => {
        expect(enyScale(30)).toBeLessThan(enyScale(400));
    });
});

describe('ENY on a hostile area too small for its name', () => {
    it('stays, at the smallest legible size, as the hostile marker', () => {
        const feature = area(TacticalGraphicName.AreaGeneric, 20, 'ALPHA');
        feature.properties.hostility = TacticalGraphicHostility.hostileFaker;
        const paints = actionAreaLabelPaint(TacticalGraphicName.AreaGeneric, {withAdditionalInfo: true})(feature, context);
        const eny = legible(paints).filter(([text]) => text === 'ENY');
        expect(eny).toHaveLength(2);
        for (const [, px] of eny) expect(px).toBeCloseTo(MIN_LEGIBLE_TEXT_PX);
    });
});
