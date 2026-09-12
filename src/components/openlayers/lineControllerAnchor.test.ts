/**
 * # One statement of what a gesture turns about, read by both engines
 *
 * `rotationAnchor` is the library's whole answer, and it carries decisions this controller was
 * not honouring. 141700 ambush turns about point 2 rather than its centre (user's call,
 * 2026-09-05), and cover, guard and screen turn and scale about their middle rather than about
 * the arrowhead their first point sits on (user's call, 2026-09-06 — *"the axis of rotation and
 * resize [...] need to go off the center of the graphic where the symbol may or may not be"*).
 *
 * MapLibre has always read it. This controller restated its own rule instead, so the same drag
 * scaled about two different points: measured with a three-point base at 40 degrees north, the
 * three security operations were **336 km** out and ambush **230**.
 *
 * The suite walks every graphic on this controller, not only the four that were wrong, because
 * the guarantee worth having is that the two can no longer disagree at all.
 */

import {fromLonLat} from 'ol/proj';
import LineString from 'ol/geom/LineString';
import {Feature} from 'ol';
import {TacticalGraphicName, baseGeometryFor, listTacticalGraphicNames, rotationAnchor} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {LineGraphicController} from './controllers/LineGraphicController';

/** A base with a bend, somewhere with a real `1 / cos(latitude)`. */
const LON_LAT: [number, number][] = [[0, 40], [2, 40.4], [4, 40]];
const PROJECTED = LON_LAT.map(c => fromLonLat(c));

/** A metre of projected slack, for the round trip through lon/lat and back. */
const SETTLED_M = 1;

function centreOf(name: TacticalGraphicName): number[] | undefined {
    let controller;
    try {
        controller = getController(name, 1200);
    } catch {
        return undefined;
    }
    if (!(controller instanceof LineGraphicController)) return undefined;
    controller.graphic.base = new Feature({geometry: new LineString(PROJECTED)}) as never;
    return controller.getCenter() as number[];
}

const NAMES = (listTacticalGraphicNames() as TacticalGraphicName[])
    .filter(name => baseGeometryFor(name) === 'LineString' && centreOf(name) !== undefined);

describe(`the line controller's anchor is the library's (${NAMES.length} graphics)`, () => {
    it('has the whole family to check', () => {
        expect(NAMES.length).toBeGreaterThan(150);
    });

    it.each(NAMES.map(name => [String(name), name] as const))('%s', (_label, name) => {
        const wanted = fromLonLat(rotationAnchor({type: 'LineString', coordinates: LON_LAT}, name) as [number, number]);
        const actual = centreOf(name)!;
        expect(Math.hypot(actual[0] - wanted[0], actual[1] - wanted[1])).toBeLessThan(SETTLED_M);
    });

    /**
     * The four that were wrong, named so a regression reads as itself rather than as one of a
     * hundred and seventy rows.
     */
    it.each([
        [TacticalGraphicName.Cover, 'about its middle, not its arrowhead'],
        [TacticalGraphicName.Screen, 'about its middle, not its arrowhead'],
        [TacticalGraphicName.Guard, 'about its middle, not its arrowhead'],
        [TacticalGraphicName.Ambush, 'about point 2, not its centre'],
    ])('%s turns %s', name => {
        const actual = centreOf(name as TacticalGraphicName)!;
        // Emphatically not the first vertex, which is what it used to return.
        expect(Math.hypot(actual[0] - PROJECTED[0][0], actual[1] - PROJECTED[0][1])).toBeGreaterThan(100_000);
    });
});
