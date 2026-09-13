/**
 * # A rotate turns about its own point, and a resize scales from another
 *
 * The library has kept these apart since the turns needed it: `rotationAnchor` answers *what
 * does this scale from*, `rotationPivot` answers *what does this turn about*, and for 340200
 * turn, its tactical twin and 152800 envelopment the two are different points. MapLibre asks
 * each question of the right function. This engine asked `getCenter` for both.
 *
 * Measured on the running app with a deliberate quarter turn, the two engines' geometry
 * afterwards: envelopment **15.8%** of the symbol apart and the turns **7.6%**, falling to 0.2%
 * and 0.4% once each gesture asked its own question.
 */

import {fromLonLat} from 'ol/proj';
import LineString from 'ol/geom/LineString';
import {Feature} from 'ol';
import {TacticalGraphicName, baseGeometryFor, listTacticalGraphicNames, rotationAnchor, rotationPivot} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {LineGraphicController} from './controllers/LineGraphicController';
import {MissionTaskController} from './controllers/MissionTaskController';

const LON_LAT: [number, number][] = [[-0.9, 39.8], [-0.35, 40.1], [0.2, 39.8]];
const PROJECTED = LON_LAT.map(c => fromLonLat(c));
/** A metre of slack for the round trip through lon/lat. */
const SETTLED_M = 1;

function controllerFor(name: TacticalGraphicName) {
    let controller;
    try {
        controller = getController(name, 1200);
    } catch {
        return undefined;
    }
    if (!(controller instanceof LineGraphicController) && !(controller instanceof MissionTaskController)) return undefined;
    const base = new Feature({geometry: new LineString(PROJECTED)});
    (controller.graphic as unknown as {base: unknown}).base = base;
    return controller;
}

const NAMES = (listTacticalGraphicNames() as TacticalGraphicName[])
    .filter(name => baseGeometryFor(name) === 'LineString' && controllerFor(name)?.getTurningPoint !== undefined);

describe(`a rotate asks rotationPivot (${NAMES.length} graphics)`, () => {
    it('has the families to check', () => {
        expect(NAMES.length).toBeGreaterThan(150);
    });

    it.each(NAMES.map(name => [String(name), name] as const))('%s', (_label, name) => {
        const controller = controllerFor(name)!;
        const wanted = fromLonLat(rotationPivot({type: 'LineString', coordinates: LON_LAT}, name) as [number, number]);
        const actual = controller.getTurningPoint!();
        expect(Math.hypot(actual[0] - wanted[0], actual[1] - wanted[1])).toBeLessThan(SETTLED_M);
    });

    /**
     * The three where the two questions have different answers, named so a regression reads as
     * itself. Everything else answers the same point to both, which is why the split is easy to
     * miss and was.
     */
    it.each([
        TacticalGraphicName.Turn,
        TacticalGraphicName.TacticalTurn,
        TacticalGraphicName.Envelopment,
    ])('%s turns about a different point from the one it scales from', name => {
        // The two library answers, which is where the split is real. Compared here rather than
        // against `getCenter`, because the mission-task controller answers that from the
        // holder's own centre rather than from a base handed to it, and a comparison between
        // the two is a comparison of two different things.
        const turning = fromLonLat(rotationPivot({type: 'LineString', coordinates: LON_LAT}, name) as [number, number]);
        const scaling = fromLonLat(rotationAnchor({type: 'LineString', coordinates: LON_LAT}, name) as [number, number]);
        expect(Math.hypot(turning[0] - scaling[0], turning[1] - scaling[1])).toBeGreaterThan(10_000);

        // And the controller follows the turning one.
        const actual = controllerFor(name)!.getTurningPoint!();
        expect(Math.hypot(actual[0] - turning[0], actual[1] - turning[1])).toBeLessThan(SETTLED_M);
    });
});
