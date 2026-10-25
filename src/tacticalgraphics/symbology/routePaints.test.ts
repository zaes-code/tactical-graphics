/**
 * # A route's identifier keeps its prefix when it is too small to read
 *
 * Zoomed out, `MSR 1` would shrink under the legibility floor and go. The name goes instead
 * and `MSR` stays at 6 px, while the traffic arrows keep the scale the route gave them; once
 * the route is under twice `MSR` there is no identifier at all. (User, 2026-10-24.)
 * @see legibleDesignation
 */
import type {Paint, PaintContext, PaintFeature} from '../core/paint';
import {RouteDirection, TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {routeControlMeasurePaint} from './routePaints';

const context: PaintContext = {
    resolution: 1,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
};

/** A straight route `length` px long whose stamped extent, `boundsPx`, caps its labels. */
const route = (length: number, boundsPx: number, direction = RouteDirection.general): Paint[] =>
    routeControlMeasurePaint(TacticalGraphicName.MainSupplyRoute)(
        {
            geometry: {type: 'LineString', coordinates: [[0, 0], [length, 0]]},
            properties: {name: TacticalGraphicName.MainSupplyRoute, designation: '1', direction},
            bounds: {minX: 0, minY: 0, maxX: boundsPx, maxY: 0},
        } as unknown as PaintFeature,
        context,
    );

const identifiers = (paints: Paint[]) => paints.filter(p => p.text?.text?.startsWith('MSR')).map(p => p.text!);

beforeEach(() => resetTacticalGraphicsConfig());

describe('routeControlMeasurePaint', () => {
    it('draws MSR 1 at both ends while it is legible', () => {
        expect(identifiers(route(400, 400)).map(t => t.text)).toEqual(['MSR 1', 'MSR 1']);
    });

    it('drops the name and holds MSR at 6 px, leaving the arrows at the route scale', () => {
        const paints = route(100, 10, RouteDirection.oneWay);
        const ids = identifiers(paints);
        expect(ids.map(t => t.text)).toEqual(['MSR', 'MSR']);
        for (const t of ids) expect(16 * t.scale!).toBeCloseTo(6, 9);
        // The arrowheads are still drawn, one at each end.
        expect(paints.filter(p => p.fill)).toHaveLength(2);
    });

    it('draws no identifier on a route under twice MSR', () => {
        const paints = route(20, 10);
        expect(identifiers(paints)).toEqual([]);
        expect(paints.some(p => p.stroke)).toBe(true);
    });
});
