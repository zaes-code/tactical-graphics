/**
 * # Where an area's own literal goes, and where its designation goes
 *
 * Most prefixed areas set the two side by side — "OBJ SWORD", "NAI 12" — and
 * `getFullLabel` writes that. A few plates stack them instead, and the enemy prisoner of
 * war holding area is the one that makes the difference visible: 310200's Template reads
 * "EPW" over "HOLDING AREA" over the designation, which no prefix can express.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {getPaintFunction} from './registry';
import {areaDefaultLabelPaint, areaLabelStackPaint} from './areaLabelPaints';

const context: PaintContext = {
    resolution: 40,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
};

const at: ProjectedPosition = [0, 0];

const labelPaints = (name: TacticalGraphicName, properties: Record<string, unknown>): Paint[] => {
    const paint = getPaintFunction(name)?.label;
    if (!paint) return [];
    const feature = {geometry: {type: 'Point', coordinates: at}, properties: {name, ...properties}} as PaintFeature;
    return paint(feature, context);
};

const textOf = (paints: Paint[]): string[] => paints.filter(p => p.text?.text).map(p => p.text!.text);

beforeEach(() => resetTacticalGraphicsConfig());

describe('APP-06 310200 — enemy prisoner of war holding area', () => {
    it('stacks the designation under the literal, not beside it', () => {
        const lines = textOf(labelPaints(TacticalGraphicName.EnemyPrisonerOfWarHoldingArea, {designation: 'EPW-4'}))
            .join('\n')
            .split('\n');
        expect(lines.slice(0, 3)).toEqual(['EPW', 'HOLDING AREA', 'EPW-4']);
    });

    it('draws the literal alone when nothing is named', () => {
        const lines = textOf(labelPaints(TacticalGraphicName.EnemyPrisonerOfWarHoldingArea, {}))
            .join('\n')
            .split('\n');
        expect(lines).toEqual(['EPW', 'HOLDING AREA']);
    });

    it('leaves a prefixed area setting its literal beside the name', () => {
        // The rule is per-plate, not a new default: the objective area still reads
        // "OBJ SWORD" on one line.
        const lines = textOf(labelPaints(TacticalGraphicName.ObjectiveArea, {designation: 'SWORD'}));
        expect(lines.join(' ')).toContain('OBJ SWORD');
    });
});

describe('the plates that stack their literal over T (MIL-STD-2525E, QA pass 2026-10-31)', () => {
    const linesOf = (paints: Paint[]) => textOf(paints).join('\n').split('\n').filter(Boolean);
    const feature = (name: TacticalGraphicName, properties: Record<string, unknown>) =>
        ({geometry: {type: 'Point', coordinates: at}, properties: {name, ...properties}}) as PaintFeature;

    it.each([
        // 242800: KILL ZONE over T; it drew "KZ T".
        [TacticalGraphicName.KillZone, ['KILL ZONE', 'B']],
        // 310300 / 310100: FARP and DHA over T, as the EPW holding area.
        [TacticalGraphicName.ForwardArmingAndRefuelingPoint, ['FARP', 'B']],
        [TacticalGraphicName.DetaineeHoldingArea, ['DHA', 'B']],
        // 310400: REFUGEE / HOLDING AREA / T.
        [TacticalGraphicName.RefugeeHoldingArea, ['REFUGEE', 'HOLDING AREA', 'B']],
        // 2402xx-2404xx: FFA over T over W - W1.
        [TacticalGraphicName.FreeFireAreaIrregular, ['FFA', 'B', '011200Z - 021800Z']],
        [TacticalGraphicName.NoFireAreaRectangular, ['NFA', 'B', '011200Z - 021800Z']],
        [TacticalGraphicName.RestrictiveFireAreaCircular, ['RFA', 'B', '011200Z - 021800Z']],
        // 310500, 240808, 242000: the bare literal; no T box to draw a designation in.
        [TacticalGraphicName.RegimentalSupportArea, ['RSA']],
        [TacticalGraphicName.BombArea, ['BOMB']],
        [TacticalGraphicName.TerminallyGuidedMunitionFootprint, ['TGMF']],
        // 151800, 271000: nothing in the middle; their marks ride the outline.
        [TacticalGraphicName.Encirclement, []],
        [TacticalGraphicName.UnexplodedExplosiveOrdnanceArea, []],
    ] as const)('%s', (name, expected) => {
        // Dates only where the plate letters W - W1; the others offer no date field.
        const dated = expected.some(line => line.includes(' - '));
        const props = {designation: 'B', ...(dated ? {startDate: '011200Z', endDate: '021800Z'} : {})};
        expect(linesOf(labelPaints(name, props))).toEqual(expected);
        // The OpenLayers switch reaches these through the default and the stack painters
        // directly, so both must draw the same block. @see getAreaLabelStylesFromLabels
        expect(linesOf(areaDefaultLabelPaint(name)(feature(name, props), context))).toEqual(expected);
        expect(linesOf(areaLabelStackPaint(name)(feature(name, props), context))).toEqual(expected);
    });
});
