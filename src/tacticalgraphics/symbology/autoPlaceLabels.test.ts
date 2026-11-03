/**
 * # `autoPlaceLabels: false` leaves every label at its doctrinal place
 *
 * Every graphic the sample gallery draws, painted with a view on part of it and boxes to keep
 * clear of, gives exactly what it gives with neither once the host turns the moving off. Through
 * `paintGraphic` and `paintWithClearance`, the paths every engine shares. @see getAutoPlaceLabels
 */

import {TacticalGraphicName} from '../core/type';
import {configureTacticalGraphics, getAutoPlaceLabels, resetTacticalGraphicsConfig} from '../core/config';
import {buildPaintedGraphic, paintGraphic} from '../core/paintedGraphic';
import type {PaintContext, ProjectedBounds} from '../core/paint';
import {getPaintFunction} from './registry';
import {paintWithClearance} from './labelClearance';
import {sampleBase} from '../../components/maplibre/sampleGallery';

beforeEach(() => resetTacticalGraphicsConfig());

const measureText = (text: string, font: string) => text.length * parseFloat(/(\d+)px/.exec(font)?.[1] ?? '16') * 0.6;
const plain: PaintContext = {resolution: 100, measureText};

/** Every sampled graphic, built with a designation so it has labels to move. */
const graphics = (Object.values(TacticalGraphicName) as TacticalGraphicName[]).flatMap(name => {
    if (!getPaintFunction(name)) return [];
    const sample = sampleBase(name);
    if (!sample) return [];
    const graphic = buildPaintedGraphic(name, sample.geometry as never, {designation: 'ALPHA', ...sample.properties} as never, 100);
    return graphic ? [{name, graphic}] : [];
});

/** A view on one corner of the graphic, with its middle held by another label. */
function crowded(bounds: ProjectedBounds): PaintContext {
    const w = bounds.maxX - bounds.minX || 10_000;
    const h = bounds.maxY - bounds.minY || 10_000;
    const view = {minX: bounds.minX + w * 0.6, maxX: bounds.minX + w * 1.2, minY: bounds.minY + h * 0.6, maxY: bounds.minY + h * 1.2};
    const [cx, cy] = [bounds.minX + w / 2, bounds.minY + h / 2];
    return {...plain, view, avoid: [{minX: cx - w / 4, maxX: cx + w / 4, minY: cy - h / 4, maxY: cy + h / 4}]};
}

it('is on unless a host turns it off', () => {
    expect(getAutoPlaceLabels()).toBe(true);
    configureTacticalGraphics({autoPlaceLabels: false});
    expect(getAutoPlaceLabels()).toBe(false);
});

it('moves labels when on, so the comparison below can tell', () => {
    const moved = graphics.filter(({graphic}) => {
        const bounds = graphic.graphic.bounds;
        if (!bounds) return false;
        return JSON.stringify(paintGraphic(graphic, crowded(bounds))) !== JSON.stringify(paintGraphic(graphic, plain));
    });
    expect(moved.length).toBeGreaterThan(50);
});

it('paints every graphic as if there were no view when off', () => {
    configureTacticalGraphics({autoPlaceLabels: false});
    const differ = graphics
        .filter(({graphic}) => {
            const bounds = graphic.graphic.bounds;
            if (!bounds) return false;
            return JSON.stringify(paintGraphic(graphic, crowded(bounds))) !== JSON.stringify(paintGraphic(graphic, plain));
        })
        .map(({name}) => name);
    expect(differ).toEqual([]);
});

it('runs no clearance pass when off', () => {
    configureTacticalGraphics({autoPlaceLabels: false});
    const items = graphics.slice(0, 40).map(({name, graphic}) => ({id: name, feature: graphic.graphic, item: graphic}));
    const view = {minX: -1e9, maxX: 1e9, minY: -1e9, maxY: 1e9};
    const passed = paintWithClearance(items, {...plain, view}, (graphic, context) => paintGraphic(graphic, context));
    expect(passed).toEqual(items.map(({item}) => paintGraphic(item, plain)));
});
