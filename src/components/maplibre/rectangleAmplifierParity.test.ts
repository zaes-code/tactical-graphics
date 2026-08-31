/**
 * # A rectangle's width describes the rectangle
 *
 * APP-06 defines the rectangular zones as "two anchor points **and a width, defined in
 * metres**". The user drags a box, which produces the same rectangle — so the shape is
 * the input and the amplifier is a statement about it, and the two must never disagree.
 *
 * They did, on MapLibre, from the moment a zone was drawn: the amplifier was derived only
 * *during a drag*, so a fresh zone carried the generic 20 px default instead of its own
 * measurement. A box drawn 160 px tall at zoom 6 filed 98 km where OpenLayers filed 391.
 * The figure is what an operator reads and what a NATO consumer reads back, so a wrong
 * one is not cosmetic.
 *
 * Pinned at the door every graphic comes through — drawn, restored, imported, swept —
 * rather than at the draw handler, because that is where the defect could hide.
 */

import {TacticalGraphicName, rectangleAmplifiers} from '@zaes/tactical-graphics';
import {buildTacticalGraphic} from './maplibreAdapter';

const RES = 2445.98;

/** A box a degree wide and half a degree tall, closed. */
const box = (): [number, number][] => [
    [10, 40], [11, 40], [11, 40.5], [10, 40.5], [10, 40],
];
const polygon = () => ({type: 'Polygon' as const, coordinates: [box()]});

describe('a drawn rectangular zone', () => {
    it.each([
        TacticalGraphicName.CriticalFriendlyZoneRectangular,
        TacticalGraphicName.DeadSpaceAreaRectangular,
        TacticalGraphicName.PurpleKillBoxRectangular,
        TacticalGraphicName.TargetValueAreaRectangular,
        TacticalGraphicName.CensorZoneRectangular,
    ])('files the width its own ring measures — %s', name => {
        const built = buildTacticalGraphic(name, polygon(), {}, RES);
        const measured = rectangleAmplifiers(name, box());

        expect(built).toBeDefined();
        expect(measured.width).toBeGreaterThan(0);
        expect(built!.properties.width).toBe(measured.width);
        // The generic default is 20 px of offset, doubled — the number that used to be
        // filed here, and nothing like the box.
        expect(built!.properties.width).not.toBeCloseTo(2 * 20 * RES, -3);
    });

    /**
     * **No drawn rectangle derives a length any more.**
     *
     * The rectangular target was the one that did, and in 4.0.0 it stopped being a drawn
     * rectangle at all: APP-06 240802 gives it one anchor point and *states* the length, so
     * the number is an input rather than something read back off a box. The two-point zones
     * never carried one. @see RECTANGLE_LENGTH_GRAPHICS, RectangularTarget
     */
    it('derives a length for no drawn rectangle', () => {
        for (const name of [TacticalGraphicName.CensorZoneRectangular, TacticalGraphicName.FreeFireAreaRectangular]) {
            expect(buildTacticalGraphic(name, polygon(), {}, RES)!.properties.length).toBeUndefined();
            expect(rectangleAmplifiers(name, box()).length).toBeUndefined();
        }
    });

    /**
     * **The width outranks the box now**, which is the conversion in one assertion: APP-06
     * makes it an *input* — "two anchor points and a width, defined in metres" — so a
     * snapshot that carries one is stating the zone's width, not describing a ring it
     * happens to have been drawn as. The old rule was the other way round, and it had to
     * be: there was nowhere else for the number to come from. @see rectangleFromAxis
     */
    it('honours a width the caller states, over the box it was drawn as', () => {
        const built = buildTacticalGraphic(
            TacticalGraphicName.CriticalFriendlyZoneRectangular,
            polygon(),
            {width: 12_345},
            RES,
        );
        expect(built!.properties.width).toBe(12_345);
    });

    it('converts a drawn box to the two anchor points that define it', () => {
        // Every file written before 2026-08-27 holds the ring. The same rectangle comes
        // back, and it comes back with a width the operator can drag.
        // @see axisFromRectangleRing
        const built = buildTacticalGraphic(TacticalGraphicName.CensorZoneRectangular, polygon(), {}, RES);
        expect(built!.base.geometry.type).toBe('LineString');
        const axis = (built!.base.geometry as {coordinates: number[][]}).coordinates;
        expect(axis).toHaveLength(2);
        // The box is a degree wide and half a degree tall, so the axis runs east-west
        // through its middle — along the longer dimension, which puts the two points on
        // the shorter sides exactly as the standard says.
        expect(axis[0][1]).toBeCloseTo(40.25, 6);
        expect(axis[1][1]).toBeCloseTo(40.25, 6);
        expect(axis[0][0]).toBeCloseTo(10, 6);
        expect(axis[1][0]).toBeCloseTo(11, 6);
    });

    /** An irregular zone has no box to measure, and must not gain one. */
    it('leaves the irregular zones alone', () => {
        const built = buildTacticalGraphic(TacticalGraphicName.CriticalFriendlyZoneIrregular, polygon(), {}, RES);
        expect(rectangleAmplifiers(TacticalGraphicName.CriticalFriendlyZoneIrregular, box()).width).toBeUndefined();
        expect(built!.properties.width).not.toBe(rectangleAmplifiers(TacticalGraphicName.CriticalFriendlyZoneRectangular, box()).width);
    });
});
