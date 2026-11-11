/**
 * # Moved labels keep out of other areas and keep their size
 *
 * With auto placement on, a label that slides to a clear place must not settle inside another
 * graphic's outline, must take a place it fits whole over a cramped one, and stays home when
 * every clear place would shrink it more. `minLabelSize` sets how small fitting may make it.
 * @see isTaken @see areaLabelInView @see TacticalGraphicsConfigOptions.minLabelSize
 */

import {configureTacticalGraphics, resetTacticalGraphicsConfig, MIN_LEGIBLE_TEXT_PX} from '../core/config';
import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {areaLabelInView, isTaken} from './viewFollow';
import {capLabelToGraphic, capLabelToSpan, fitLabelScale} from './labelFit';
import {spanProportionalScale} from './movementPaints';

const measureText = (text: string, font: string) => text.length * parseFloat(/(\d+)px/.exec(font)?.[1] ?? '16') * 0.6;
const square = (x: number, y: number, size: number): ProjectedPosition[] => [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]];

beforeEach(() => {
    resetTacticalGraphicsConfig();
    configureTacticalGraphics({autoPlaceLabels: true});
});

describe('a place inside another area', () => {
    const other = square(100, 100, 100);
    const context: PaintContext = {resolution: 1, measureText, avoidLines: [other]};
    const footprint = {alongPx: 5, acrossPx: 5};

    it('is taken when the label belongs outside it', () => {
        expect(isTaken([150, 150], footprint, 1, 0, context, [0, 0])).toBe(true);
    });

    it('is free when the area holds the label home too, as the AO holds what is in it', () => {
        expect(isTaken([150, 150], footprint, 1, 0, context, [120, 120])).toBe(false);
    });

    it('is judged by lines alone without a home, as before', () => {
        expect(isTaken([150, 150], footprint, 1, 0, context)).toBe(false);
    });

    it('is ignored when auto placement is off', () => {
        configureTacticalGraphics({autoPlaceLabels: false});
        expect(isTaken([150, 150], footprint, 1, 0, context, [0, 0])).toBe(false);
    });
});

describe('an area label that has to move', () => {
    // A 200 x 200 area whose middle is crossed by a line, with room above it for the label.
    const ring = square(0, 0, 200);
    const crossing: ProjectedPosition[] = [[-50, 100], [250, 100]];
    const feature = (at: ProjectedPosition): PaintFeature => ({geometry: {type: 'Point', coordinates: at}, ring, properties: {}} as unknown as PaintFeature);
    const view = {minX: -1000, minY: -1000, maxX: 1000, maxY: 1000};
    const context: PaintContext = {resolution: 1, measureText, view, avoidLines: [crossing]};
    const anchor = (f: PaintFeature) => (f.geometry as {coordinates: ProjectedPosition}).coordinates;

    it('goes where it fits whole', () => {
        const moved = areaLabelInView(feature([100, 100]), context, {alongPx: 60, acrossPx: 15});
        const [x, y] = anchor(moved);
        expect(Math.abs(y - 100)).toBeGreaterThan(15);
        expect(x - 60).toBeGreaterThanOrEqual(0);
        expect(x + 60).toBeLessThanOrEqual(200);
    });

    it('stays home when every clear place would squeeze it more', () => {
        // Too wide for the area anywhere: home fits it best, so it stays and crosses the line.
        const home: ProjectedPosition = [100, 100];
        const moved = areaLabelInView(feature(home), context, {alongPx: 140, acrossPx: 95});
        expect(anchor(moved)).toEqual(home);
    });
});

describe('minLabelSize', () => {
    const tiny = {
        geometry: {type: 'Point', coordinates: [10, 10]},
        ring: square(0, 0, 20),
        bounds: {minX: 0, minY: 0, maxX: 20, maxY: 20},
        properties: {},
    } as unknown as PaintFeature;
    const context: PaintContext = {resolution: 1, measureText};
    const font = 'bold 16px sans-serif';

    it('leaves fitting alone when unset', () => {
        expect(fitLabelScale(tiny, context, [10, 10], ['OBJECTIVE'], font, 1) * 16).toBeLessThan(MIN_LEGIBLE_TEXT_PX);
        expect(capLabelToGraphic(1, tiny, context)).toBeLessThan(1);
    });

    it('stops every fit at its size', () => {
        configureTacticalGraphics({minLabelSize: 11});
        expect(fitLabelScale(tiny, context, [10, 10], ['OBJECTIVE'], font, 1) * 16).toBeCloseTo(11);
        expect(capLabelToGraphic(1, tiny, context) * 16).toBeCloseTo(11);
        expect(capLabelToSpan(context, 'OBJECTIVE', font, 1, 10) * 16).toBeCloseTo(11);
        expect(spanProportionalScale([0, 0], [5, 0], 1, 24) * 24).toBeCloseTo(11);
    });

    it('never raises a label past the size it was asked for', () => {
        configureTacticalGraphics({minLabelSize: 20});
        expect(fitLabelScale(tiny, context, [10, 10], ['OBJECTIVE'], font, 0.5)).toBe(0.5);
    });

    it('is clamped to the legibility floor', () => {
        configureTacticalGraphics({minLabelSize: 1});
        expect(fitLabelScale(tiny, context, [10, 10], ['OBJECTIVE'], font, 1) * 16).toBeCloseTo(MIN_LEGIBLE_TEXT_PX);
    });
});
