/**
 * # A resize scales the whole symbol, including the half a radius does not describe
 *
 * `radius` is not the whole size of every centred graphic. Five plates give a length *and* a
 * width to one anchor point — the three maritime ellipses, 240802 and 200600 — 200700 is
 * described by two ranges, and the rectangular target files a length of its own. A resize that
 * moved only `radius` scaled half of each of those and left the other half at whatever it was
 * seeded with, so the symbol changed *shape* as it changed size.
 *
 * Measured on `compare:engines` before this: a 1.5x resize took 200101's length to 540,241 m on
 * OpenLayers and left it at the seeded 360,000 here. Six graphics reported it, and they were
 * six of the eleven rows that comparison had left.
 */

import type {Position} from 'geojson';
import {TacticalGraphicName, axisAndWidth, hasAxisAndWidth, statesShapeAsRangeBands} from '@zaes/tactical-graphics';
import {resize} from './editGeometry';

/** A centre, and a drag from one radius out to half again. */
const CENTRE: Position = [0, 40];
const FROM: Position = [1, 40];
const TO: Position = [1.5, 40];

const point = (properties: Record<string, unknown>) => ({
    geometry: {type: 'Point' as const, coordinates: CENTRE},
    properties: properties as never,
});

/** The ratio the drag above carries, measured the way `resize` measures it. */
const RATIO = 1.5;

describe('a resize of a point-anchored graphic', () => {
    it.each([
        TacticalGraphicName.LaunchAreaEllipse,
        TacticalGraphicName.DefendedAreaEllipse,
        TacticalGraphicName.ShipAreaOfInterestEllipse,
        TacticalGraphicName.CuedAcquisitionDoctrine,
        TacticalGraphicName.TargetAreaRectangular,
    ])('scales the length and the width of %s, not only its radius', name => {
        expect(hasAxisAndWidth(name)).toBe(true);
        const stated = axisAndWidth(name, 40_000)!;
        const before = point({name, radius: 40_000, rotation: 0, length: stated.length, width: stated.width});

        const after = resize(before, FROM, TO);

        expect(after.properties.radius).toBeCloseTo(40_000 * RATIO, 0);
        expect(after.properties.length).toBeCloseTo(stated.length * RATIO, 0);
        expect(after.properties.width).toBeCloseTo(stated.width * RATIO, 0);
    });

    it('scales both of 200700\'s ranges', () => {
        const name = TacticalGraphicName.RadarSearchDoctrine;
        expect(statesShapeAsRangeBands(name)).toBe(true);
        const before = point({name, radius: 40_000, rotation: 0, startRange: 16_000, stopRange: 40_000});

        const after = resize(before, FROM, TO);

        expect(after.properties.startRange).toBeCloseTo(16_000 * RATIO, 0);
        expect(after.properties.stopRange).toBeCloseTo(40_000 * RATIO, 0);
    });

    /**
     * **And 200700 files no radius at all**, which is how it slipped through the first version
     * of this: the branch bailed out when there was no radius to scale, so the one graphic
     * described entirely by ranges was the one a resize still did not touch.
     */
    it('scales the ranges of a graphic that files no radius', () => {
        const before = point({name: TacticalGraphicName.RadarSearchDoctrine, rotation: 0, startRange: 16_000, stopRange: 40_000});
        const after = resize(before, FROM, TO);
        expect(after.properties.radius).toBeUndefined();
        expect(after.properties.startRange).toBeCloseTo(16_000 * RATIO, 0);
        expect(after.properties.stopRange).toBeCloseTo(40_000 * RATIO, 0);
    });

    /** A graphic that states nothing but a radius is unchanged by the addition. */
    it('leaves a plain circle with only its radius scaled', () => {
        const after = resize(point({name: TacticalGraphicName.FreeFireAreaCircular, radius: 40_000, rotation: 0}), FROM, TO);
        expect(after.properties.radius).toBeCloseTo(40_000 * RATIO, 0);
        expect(after.properties.length).toBeUndefined();
        expect(after.properties.width).toBeUndefined();
    });
});
