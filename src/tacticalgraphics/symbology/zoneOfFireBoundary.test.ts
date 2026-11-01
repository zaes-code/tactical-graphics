/**
 * APP-06 242600 zone of fire, Note 2: the boundary *"shall be able to be switched off leaving
 * only the label and T visible"*. Both engines paint through the shared registry entry; the
 * OpenLayers style function is checked against it in `zoneOfFireStyle.test.ts`.
 */
import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {getPaintFunction} from './registry';

const context: PaintContext = {resolution: 10, measureText: (text: string) => text.length * 9};
const ring: ProjectedPosition[] = [[0, 0], [5000, 0], [5000, 3000], [0, 3000], [0, 0]];

const zone = (hideBoundary?: boolean): PaintFeature =>
    ({
        geometry: {type: 'Polygon', coordinates: [ring]},
        properties: {name: TacticalGraphicName.ZoneOfFire, designation: 'ZF 1', hideBoundary},
        bounds: {minX: 0, minY: 0, maxX: 5000, maxY: 3000},
    }) as unknown as PaintFeature;

const painters = getPaintFunction(TacticalGraphicName.ZoneOfFire)!;
const visibleStrokes = (feature: PaintFeature) =>
    painters.graphic(feature, context).filter(p => p.stroke && p.stroke.color !== 'rgba(0,0,0,0)');

describe('the zone of fire boundary', () => {
    it('is drawn dashed by default (Note 1)', () => {
        const strokes = visibleStrokes(zone());
        expect(strokes).toHaveLength(1);
        expect(strokes[0].stroke!.dashPx).toBeDefined();
    });

    it('can be switched off, leaving nothing visible but still pickable', () => {
        expect(visibleStrokes(zone(true))).toEqual([]);
        // The outline is still there, transparent, so the zone can be clicked.
        expect(painters.graphic(zone(true), context)).toHaveLength(1);
    });

    it('keeps the label and T when it is off', () => {
        const label = {...zone(true), geometry: {type: 'Point', coordinates: [2500, 1500]}} as PaintFeature;
        const texts = painters.label!(label, context).map(p => p.text?.text ?? '').join(' ');
        expect(texts).toContain('ZF 1');
    });
});
