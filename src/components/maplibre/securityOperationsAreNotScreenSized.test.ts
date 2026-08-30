/**
 * # Cover, guard and screen are ground-sized on both engines
 *
 * They were fixed-size badges pinned to a screen constant until 2026-08-29, when APP-06's
 * four anchor points made them two-point drawn graphics. Two pieces of the MapLibre half
 * survived that change: an override that replaced the caller's `radius` with
 * `SECURITY_OPERATION_HALF_EXTENT_PX × drawingResolution`, and an `isScreenSized` entry
 * that rebuilt their geometry on every zoom.
 *
 * Neither changed the picture — the generator builds the arms from the base and ignores
 * `radius` — so this asserts the thing that made them *safe* to remove, not just that
 * they are gone. If a future change makes the generator read `radius` again, the first
 * test here fails and says so.
 */

import {renderTacticalGraphic, SECURITY_OPERATION_HALF_EXTENT_PX, TacticalGraphicName} from '@zaes/tactical-graphics';

const SECURITY_OPERATIONS = [TacticalGraphicName.Cover, TacticalGraphicName.Guard, TacticalGraphicName.Screen];

/** A two-point base: point 1 at an arrowhead, point 2 at that arm's inner end. */
const baseFor = (name: TacticalGraphicName, extra: Record<string, unknown> = {}) =>
    ({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: [[-77.1, 38.89], [-77.06, 38.89]]},
        properties: {tacticalGraphic: {name, ...extra}},
    }) as never;

describe('the security operations take their size from the ground', () => {
    it.each(SECURITY_OPERATIONS)('%s ignores a radius entirely', name => {
        const plain = renderTacticalGraphic(baseFor(name));
        // The exact number the MapLibre adapter used to force in, at a plausible zoom.
        const forced = renderTacticalGraphic(baseFor(name, {radius: SECURITY_OPERATION_HALF_EXTENT_PX * 4892}));
        expect(forced.graphic.geometry).toEqual(plain.graphic.geometry);
    });

    it.each(SECURITY_OPERATIONS)('%s changes size when its base does, which is what ground-sized means', name => {
        const short = renderTacticalGraphic(baseFor(name));
        const long = renderTacticalGraphic({
            ...(baseFor(name) as object),
            geometry: {type: 'LineString', coordinates: [[-77.1, 38.89], [-76.9, 38.89]]},
        } as never);
        expect(long.graphic.geometry).not.toEqual(short.graphic.geometry);
    });
});
