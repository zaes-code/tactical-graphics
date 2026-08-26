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
        const lines = textOf(labelPaints(TacticalGraphicName.EnemyPrisonerOfWarHoldingArea, {label: 'EPW-4'}))
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
        const lines = textOf(labelPaints(TacticalGraphicName.ObjectiveArea, {label: 'SWORD'}));
        expect(lines.join(' ')).toContain('OBJ SWORD');
    });
});
