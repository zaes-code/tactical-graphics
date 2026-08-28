/**
 * # The draw limit exists twice, so it has to be checked
 *
 * `baseVertexCount` in the map-agnostic half says how many points a graphic's base takes;
 * `controllerRegistry`'s factories pass the same number to `LineGraphicController` as its
 * `maxPoints`. Two statements of one fact, which is exactly the shape of defect this
 * repository keeps finding.
 *
 * It had already happened. On 2026-08-15 twenty-one graphics were capped in the
 * OpenLayers registry and absent from the portable table — the four-point swept-arc
 * tasks, the three-point bypasses, the bridge and the assault crossing among them. The
 * consequence is not cosmetic: MapLibre reads only the portable table, so its draw waited
 * for a double-click that a fixed-vertex graphic never sends, and those graphics could
 * not be finished at all on that engine.
 *
 * Nothing caught it. The OpenLayers app draws them correctly, every unit test passes, and
 * the catalog renders them from a generic line. This test is the guard that was missing.
 */

import {baseVertexCount, listTacticalGraphicNames, TacticalGraphicName} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';

/** The `maxPoints` a graphic's OpenLayers controller enforces, if it enforces one. */
function openLayersLimit(name: TacticalGraphicName): number | undefined {
    const controller = getController(name, 100) as unknown as {maxPoints?: number};
    return controller?.maxPoints;
}

const names = listTacticalGraphicNames().filter(
    (n): n is TacticalGraphicName => n in TacticalGraphicName,
) as TacticalGraphicName[];

describe('the two draw limits agree', () => {
    it('has a graphic to check', () => {
        expect(names.length).toBeGreaterThan(200);
    });

    it.each(names)('%s caps its draw the same way in both halves', name => {
        expect(openLayersLimit(name)).toBe(baseVertexCount(name));
    });

    it('really does cap the fixed-anchor graphics, rather than agreeing on nothing', () => {
        // The assertion above passes trivially if every entry is `undefined`, which is
        // what it looked like before the table was filled in.
        const capped = names.filter(n => baseVertexCount(n) !== undefined);
        expect(capped.length).toBeGreaterThan(40);
        expect(baseVertexCount(TacticalGraphicName.Capture)).toBe(4);
        expect(baseVertexCount(TacticalGraphicName.ObstacleBypassEasy)).toBe(3);
        expect(baseVertexCount(TacticalGraphicName.Bridge)).toBe(2);
    });
});
