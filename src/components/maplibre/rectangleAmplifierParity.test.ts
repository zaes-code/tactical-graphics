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

    /** The rectangular target is the one that carries a length as well. */
    it('files a length only where the symbol has one', () => {
        const withLength = buildTacticalGraphic(TacticalGraphicName.TargetAreaRectangular, polygon(), {}, RES);
        expect(withLength!.properties.length).toBe(rectangleAmplifiers(TacticalGraphicName.TargetAreaRectangular, box()).length);
        expect(withLength!.properties.length).toBeGreaterThan(0);

        const without = buildTacticalGraphic(TacticalGraphicName.CensorZoneRectangular, polygon(), {}, RES);
        expect(without!.properties.length).toBeUndefined();
    });

    /**
     * **The geometry outranks a supplied number**, which is what keeps the two from
     * drifting: a snapshot carrying a width from some other box cannot make the zone
     * report a figure its own ring contradicts.
     */
    it('ignores a width that disagrees with the shape', () => {
        const built = buildTacticalGraphic(
            TacticalGraphicName.CriticalFriendlyZoneRectangular,
            polygon(),
            {width: 12_345},
            RES,
        );
        expect(built!.properties.width).toBe(rectangleAmplifiers(TacticalGraphicName.CriticalFriendlyZoneRectangular, box()).width);
    });

    /** An irregular zone has no box to measure, and must not gain one. */
    it('leaves the irregular zones alone', () => {
        const built = buildTacticalGraphic(TacticalGraphicName.CriticalFriendlyZoneIrregular, polygon(), {}, RES);
        expect(rectangleAmplifiers(TacticalGraphicName.CriticalFriendlyZoneIrregular, box()).width).toBeUndefined();
        expect(built!.properties.width).not.toBe(rectangleAmplifiers(TacticalGraphicName.CriticalFriendlyZoneRectangular, box()).width);
    });
});
