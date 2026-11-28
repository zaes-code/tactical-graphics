/**
 * The pass every engine runs to keep labels clear of each other. @see paintWithClearance
 */

import {TacticalGraphicName} from '../core/type';
import {configureTacticalGraphics, resetTacticalGraphicsConfig} from '../core/config';
import {buildPaintedGraphic, paintGraphic, type PaintedGraphic} from '../core/paintedGraphic';
import type {Paint, PaintContext, ProjectedBounds, ProjectedPosition} from '../core/paint';
import {addGraphicLines, emptyLabelSpace, paintWithClearance, textBounds, withClearance} from './labelClearance';

// Label moving is off by default; these pin what it does when a host turns it on.
beforeEach(() => {
    resetTacticalGraphicsConfig();
    configureTacticalGraphics({autoPlaceLabels: true});
});

const ring = [
    [0, 0],
    [0.4, 0],
    [0.4, 0.4],
    [0, 0.4],
    [0, 0],
];
const objective = (designation: string) =>
    buildPaintedGraphic(TacticalGraphicName.ObjectiveArea, {type: 'Polygon', coordinates: [ring]}, {designation}, 20)!;

function viewAround(graphic: PaintedGraphic): ProjectedBounds {
    const xs = (graphic.graphic.geometry as {coordinates: ProjectedPosition[][]}).coordinates[0].map(([x]) => x);
    const ys = (graphic.graphic.geometry as {coordinates: ProjectedPosition[][]}).coordinates[0].map(([, y]) => y);
    return {minX: Math.min(...xs) - 5_000, minY: Math.min(...ys) - 5_000, maxX: Math.max(...xs) + 5_000, maxY: Math.max(...ys) + 5_000};
}

const context = (view?: ProjectedBounds): PaintContext => ({resolution: 20, measureText: text => text.length * 9, ...(view ? {view} : {})});
const boxesOf = (paints: Paint[], ctx: PaintContext) => paints.map(p => textBounds(p, ctx)).filter((b): b is ProjectedBounds => !!b);
const overlap = (a: ProjectedBounds, b: ProjectedBounds) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

describe('paintWithClearance', () => {
    it('moves the second of two labels that would land on each other', () => {
        const [a, b] = [objective('ALPHA'), objective('BRAVO')];
        const ctx = context(viewAround(a));
        const items = [a, b].map(g => ({id: g.id, feature: g.graphic, item: g}));

        // Painted alone, the two names sit on the same spot.
        const alone = [a, b].map(g => boxesOf(paintGraphic(g, ctx), ctx)[0]);
        expect(overlap(alone[0], alone[1])).toBe(true);

        const [first, second] = paintWithClearance(items, ctx, paintGraphic).map(paints => boxesOf(paints, ctx)[0]);
        expect(first).toEqual(alone[0]);
        expect(overlap(first, second)).toBe(false);
    });

    it('moves nothing without a view, as before', () => {
        const [a, b] = [objective('ALPHA'), objective('BRAVO')];
        const ctx = context();
        const items = [a, b].map(g => ({id: g.id, feature: g.graphic, item: g}));
        expect(paintWithClearance(items, ctx, paintGraphic)).toEqual([paintGraphic(a, ctx), paintGraphic(b, ctx)]);
    });

    it('hands each graphic every line but its own', () => {
        const [a, b] = [objective('ALPHA'), objective('BRAVO')];
        const space = emptyLabelSpace();
        addGraphicLines(space, a.id, a.graphic);
        addGraphicLines(space, b.id, b.graphic);
        expect(space.lines.map(l => l.id)).toEqual([a.id, b.id]);
        expect(withClearance(context(), space, a.id).avoidLines).toEqual([space.lines[1].path]);
    });

    it('leaves out line work far from the view', () => {
        const a = objective('ALPHA');
        const view = viewAround(a);
        const far = {minX: view.minX + 10_000_000, minY: view.minY, maxX: view.maxX + 10_000_000, maxY: view.maxY};
        const space = emptyLabelSpace();
        addGraphicLines(space, a.id, a.graphic, far);
        expect(space.lines).toEqual([]);
    });
});

describe('textBounds', () => {
    it('covers the text where it is drawn, turned with it, with a margin', () => {
        const ctx = context();
        const at: Paint = {geometry: {type: 'Point', coordinates: [1000, 2000]}, text: {text: 'PL', font: 'bold 16px sans-serif', fill: '#000'}};
        const box = textBounds(at, ctx)!;
        // 2 letters at 9 px, 16 px high, 3 px margin, 20 m a pixel.
        expect(box.maxX - box.minX).toBeCloseTo((18 + 6) * 20);
        expect(box.maxY - box.minY).toBeCloseTo((16 + 6) * 20);
        const turned = textBounds({...at, text: {...at.text!, rotation: Math.PI / 2}}, ctx)!;
        expect(turned.maxX - turned.minX).toBeCloseTo((16 + 6) * 20);
        expect(textBounds({geometry: at.geometry, stroke: {color: '#000', widthPx: 1}}, ctx)).toBeNull();
    });
});
