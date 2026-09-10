/**
 * # A grip that measures on the screen and writes to the ground
 *
 * Turn's tip grip and Envelopment's line-end grip take the cursor's distance from the
 * centre in **projected** metres and hand it straight to `size`, which every other reader
 * spends **geodesically** — `anchorPoints` writes the base with `drawnAnchors`, and the
 * generator builds from the same figure. The two are the same number only on the equator;
 * everywhere else they differ by the Mercator scale factor, so the symbol lands
 * `1 / cos(latitude)` too long and the grip is left sitting off the tip it was dragged to.
 *
 * The rear grips of both symbols were repaired on 2026-09-05 and carry the reasoning; the
 * branch beside each was left as it was. MapLibre never had it: `setReach` converts with
 * `groundLength` before writing `radius`, which is the answer this asserts against.
 */

import {LineString} from 'ol/geom';
import {fromLonLat} from 'ol/proj';
import type {Coordinate} from 'ol/coordinate';
import {TacticalGraphicName, groundLength, projectedLength} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';

/** A zoom, in metres per pixel. Nothing here depends on its value. */
const RES = 1_000;

/** Far enough north that the scale factor is unmistakable: 1 / cos(55°) is 1.74. */
const NORTH = 55;

/** The chord the graphic starts at, in ground metres. */
const START_SIZE = 100_000;

type Holder = {
    size: number;
    center: Coordinate;
    base: {getGeometry(): LineString | undefined};
    updateGeom(input: {size?: number; center?: Coordinate; rotation?: number}): void;
    setBandRange(handleIndex: number, coordinate: Coordinate): void;
};

const holderAt = (name: TacticalGraphicName, latitude: number): Holder => {
    const holder = (getController(name, RES) as unknown as {graphic: Holder}).graphic;
    holder.updateGeom({size: START_SIZE, center: fromLonLat([0, latitude]) as Coordinate, rotation: 0});
    return holder;
};

/** Where the graphic's own anchor points put the grip that was just dragged. */
const anchorAt = (holder: Holder, index: number): Coordinate =>
    (holder.base.getGeometry() as LineString).getCoordinates()[index] as Coordinate;

/**
 * Drags a grip due east of the centre, to a cursor `reach` projected metres out, and
 * reports how far the anchor ended up from the cursor — as a share of the drag.
 */
const missAfterDrag = (holder: Holder, handleIndex: number, anchorIndex: number, reach: number): number => {
    const center = holder.center;
    const cursor: Coordinate = [center[0] + reach, center[1]];
    holder.setBandRange(handleIndex, cursor);
    const landed = anchorAt(holder, anchorIndex);
    return Math.hypot(landed[0] - cursor[0], landed[1] - cursor[1]) / reach;
};

describe.each([
    {name: TacticalGraphicName.Turn, handle: 0, anchor: 0, grip: 'tip'},
    {name: TacticalGraphicName.TacticalTurn, handle: 0, anchor: 0, grip: 'tip'},
    {name: TacticalGraphicName.Envelopment, handle: 1, anchor: 1, grip: 'line end'},
])('$name’s $grip grip', ({name, handle, anchor}) => {
    it('leaves the anchor under the cursor on the equator', () => {
        const holder = holderAt(name, 0);
        expect(missAfterDrag(holder, handle, anchor, projectedLength(140_000, 0))).toBeLessThan(0.02);
    });

    /** The one the latitude breaks: at 55° the projected reach is 1.74 ground chords. */
    it('leaves the anchor under the cursor in the north', () => {
        const holder = holderAt(name, NORTH);
        expect(missAfterDrag(holder, handle, anchor, projectedLength(140_000, NORTH))).toBeLessThan(0.02);
    });

    it('writes the ground distance the cursor stands at, not the projected one', () => {
        const holder = holderAt(name, NORTH);
        const reach = projectedLength(140_000, NORTH);
        holder.setBandRange(handle, [holder.center[0] + reach, holder.center[1]] as Coordinate);
        // What MapLibre's `setReach` writes for the same drag. @see editGeometry.ts
        expect(holder.size).toBeCloseTo(groundLength(reach, NORTH), -2);
    });
});
