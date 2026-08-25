/**
 * # `rotation` is degrees, on every graphic, including these three
 *
 * `properties.tacticalGraphic.rotation` is part of the portable description, and the
 * generators call `toRadians` on it themselves — so every graphic in the library files
 * degrees.
 *
 * The security operations filed the manager's raw *radian* delta instead. Nothing looked
 * wrong on OpenLayers, because the same holder read it back and its own trig wanted
 * radians; the number was only wrong to everyone else. Driven with the same gesture,
 * OpenLayers stored 0.0509 where MapLibre stored 2.9174 — one angle, off by exactly
 * 180/pi, in a field the other engine and any consumer read as degrees.
 */

import {Feature} from 'ol';
import {Point} from 'ol/geom';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {SecurityOperationsController} from './controllers/SecurityOperationsController';
import type {TacticalGraphicHandler} from './openlayersAdapter';

/**
 * A placed security operation. `getController` builds the holder but not its geometry,
 * and rotating one redraws it — with no centre there is nothing to redraw about.
 */
function placed(name: TacticalGraphicName): TacticalGraphicHandler {
    const controller = getController(name, 100);
    controller.setBaseFeature(new Feature(new Point([0, 0])) as never);
    return controller;
}

const SECURITY_OPERATIONS = [
    TacticalGraphicName.Cover,
    TacticalGraphicName.Guard,
    TacticalGraphicName.Screen,
];

/** A quarter turn, as the manager's `calculateDeltaAngle` produces it. */
const QUARTER_TURN_RADIANS = Math.PI / 2;

describe('a security operation stores its rotation in degrees', () => {
    it.each(SECURITY_OPERATIONS)('%s converts the radian delta it is handed', name => {
        const controller = placed(name);
        expect(controller).toBeInstanceOf(SecurityOperationsController);

        controller.handleRotate(QUARTER_TURN_RADIANS);

        const holder = controller.graphic as unknown as {getRotation(): number};
        expect(holder.getRotation()).toBeCloseTo(90, 6);
    });

    it.each(SECURITY_OPERATIONS)('%s accumulates in degrees across drags', name => {
        const controller = placed(name);
        controller.handleRotate(QUARTER_TURN_RADIANS);
        controller.handleRotate(QUARTER_TURN_RADIANS);

        const holder = controller.graphic as unknown as {getRotation(): number};
        expect(holder.getRotation()).toBeCloseTo(180, 6);
    });

    /**
     * The value that reaches a snapshot is the same one, so a consumer or the other
     * engine reads the angle the user actually turned.
     */
    it.each(SECURITY_OPERATIONS)('%s publishes those degrees into the bag', name => {
        const controller = placed(name);
        controller.handleRotate(QUARTER_TURN_RADIANS);

        const stamped = controller
            .getFeatures()
            .map(feature => feature.get('tacticalGraphic') as {rotation?: number} | undefined)
            .find(bag => bag?.rotation !== undefined);

        expect(stamped?.rotation).toBeCloseTo(90, 6);
    });
});
