/**
 * # A line's two end labels never print over each other
 *
 * Zoomed out, a fire support coordination line shorter than its two names drew `FSCL ALPHA`
 * at each end on top of each other, on every engine (QA audit, 2026-10-31). Once the two would
 * meet, the line carries one name and one date range at its middle instead.
 * @see endLabelsCollide
 */
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {defaultLinePaint} from './paintFunctions';

const context: PaintContext = {resolution: 1, measureText: (text, font) => text.length * parseFloat(/(\d+)px/.exec(font)?.[1] ?? '16') * 0.6};

const line = (length: number): PaintFeature => ({
    geometry: {type: 'LineString', coordinates: [[0, 0], [length, 0]]},
    properties: {name: TacticalGraphicName.FireSupportCoordinationLine, designation: 'ALPHA', startDate: '011200ZOCT26', endDate: '021800ZOCT26'},
    bounds: {minX: 0, minY: 0, maxX: length, maxY: 0},
});

const texts = (paints: Paint[]): {text: string; at: ProjectedPosition}[] =>
    paints.filter(p => p.text?.text).map(p => ({text: p.text!.text, at: (p.geometry as {coordinates: ProjectedPosition}).coordinates}));

beforeEach(() => resetTacticalGraphicsConfig());

describe('end labels on a line', () => {
    const paint = defaultLinePaint(TacticalGraphicName.FireSupportCoordinationLine);

    it('go at both ends when the line is long enough for both', () => {
        const names = texts(paint(line(2000), context)).filter(t => t.text.startsWith('FSCL'));
        expect(names).toHaveLength(2);
    });

    it('become one name and one date range at the middle once the ends would meet', () => {
        const all = texts(paint(line(260), context));
        expect(all.filter(t => t.text.startsWith('FSCL'))).toHaveLength(1);
        expect(all.filter(t => t.text.includes(' - '))).toHaveLength(1);
        for (const t of all) expect(t.at[0]).toBeCloseTo(130, 6);
    });
});
