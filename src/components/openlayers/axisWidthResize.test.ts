/**
 * # A width that is a vertex is scaled by the scale, once
 *
 * The eleven axis arrows keep their width as the last coordinate of their base, so a resize
 * carries it the way it carries every other point: `resizeFeature` scales the whole geometry
 * about the pivot. MapLibre says the same thing by omission — `scaleDrawnSizes` has no `width`
 * property to scale for these, and its geometry pass moves the coordinate.
 *
 * OpenLayers also spent the width through `setOffset` before scaling, which republished the
 * point from the *pre-scale* axis and then scaled it again. Measured against MapLibre on one
 * gesture, five of the eleven moved 29.7 degrees where the other engine moved 0.8; the whole
 * family showed up in `compare:engines` and none of them had before the width became a
 * coordinate. @see LineGraphicController.handleResize
 */
import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import {fromLonLat, toLonLat} from 'ol/proj';
import type {Position} from 'geojson';
import {
    TacticalGraphicName,
    axisOf,
    axisWithWidthPoint,
    carriesWidthPointInBase,
    halfWidthFromBase,
    listTacticalGraphicNames,
    storedOrder,
} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {LineGraphicController} from './controllers/LineGraphicController';

const FAMILY = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(carriesWidthPointInBase);
const RES = 300;
const HALF_WIDTH = 12_000;
const RATIO = 1.5;

/** A bent axis with its width point on the end, in the order the graphic files its points. */
const baseFor = (name: TacticalGraphicName): Position[] =>
    axisWithWidthPoint(name, storedOrder(name, [[-1.6, 39.8], [-0.4, 40.2], [0.9, 40.0]]) as Position[], HALF_WIDTH);

/** A holder built, given that base, and then resized. */
function resized(name: TacticalGraphicName, ratio: number): Position[] {
    const controller = getController(name, RES, 40) as LineGraphicController;
    controller.setBaseFeature(new Feature(new LineString(baseFor(name).map(c => fromLonLat(c as [number, number])))) as Feature<LineString>);
    controller.graphic.base.set('graphicName', name);
    controller.handleResize(ratio);
    return (controller.graphic.base.getGeometry() as LineString).getCoordinates().map(c => toLonLat(c)) as Position[];
}

describe('resizing an axis arrow scales its stored width once', () => {
    it('has all eleven of them', () => {
        expect(FAMILY).toHaveLength(11);
    });

    it.each(FAMILY.map(n => [String(n), n] as const))('%s ends up one and a half times as wide', (_label, name) => {
        const before = halfWidthFromBase(name, baseFor(name))!;
        const after = halfWidthFromBase(name, resized(name, RATIO))!;

        expect(before).toBeCloseTo(HALF_WIDTH, 3);
        /*
         * **Within a percent, not exactly.** The scale runs in the projected frame, about a
         * pivot at 40 degrees north, and the half-width is read back geodesically — the same
         * asymmetry `axisWithWidthPoint` calibrates against. MapLibre scales the identical way,
         * so the two engines agree on the answer; what is asserted here is that the ratio is
         * spent once. Spent twice it lands near 2.2, and from the pre-scale axis it lands
         * anywhere. @see WIDTH_CALIBRATION_PASSES
         */
        expect(Math.abs(after / before - RATIO)).toBeLessThan(0.02);
    });

    it.each(FAMILY.map(n => [String(n), n] as const))('%s keeps every axis point it had', (_label, name) => {
        expect(axisOf(name, resized(name, RATIO))).toHaveLength(axisOf(name, baseFor(name)).length);
    });

    /**
     * **The axis grows by the same ratio**, which is the other half of "resize the whole graphic
     * as is": a width that outran the line would be the same defect seen from the other side.
     */
    it.each(FAMILY.map(n => [String(n), n] as const))('%s grows its axis by that same ratio', (_label, name) => {
        const span = (coords: Position[]) => {
            const axis = axisOf(name, coords);
            const a = axis[0];
            const b = axis[axis.length - 1];
            return Math.hypot(b[0] - a[0], b[1] - a[1]);
        };
        expect(span(resized(name, RATIO)) / span(baseFor(name))).toBeCloseTo(RATIO, 2);
    });
});
