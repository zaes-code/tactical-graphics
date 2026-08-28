/**
 * # A rectangle is drawn level, and its anchor points set the length alone
 *
 * APP-06 puts points 1 and 2 at the centres of the two opposing sides, so moving one is
 * how an operator makes the zone longer or shorter. Letting the same drag swing the
 * rectangle round meant there was no way to change the length *without* risking a turn —
 * and the first drawing came out askew whenever the two clicks were a few pixels off
 * level. Rotating is the rotate gesture's job, and it still turns the symbol freely.
 * (User's call, 2026-08-27.)
 *
 * @see constrainRectangleAxis, levelRectangleAxis, rectangleFromAxis
 */

import type {Position} from 'geojson';
import * as turf from './turf';
import {
    RECTANGLE_DEFAULT_HALF_WIDTH_PX,
    axisFromRectangleRing,
    constrainRectangleAxis,
    levelRectangleAxis,
    rectangleFromAxis,
} from './anchors';
import {normalizeDrawnBase} from './drawnBase';
import {TacticalGraphicName} from './type';

const P1: Position = [-0.2, 51.5];

const bearing = (a: Position, b: Position) => turf.bearing(turf.point(a), turf.point(b));
const metres = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

describe('the first drawing is level', () => {
    it('squares up a two-click axis without changing its length or direction', () => {
        const askew: Position[] = [P1, [0.2, 51.62]];
        const level = levelRectangleAxis(askew);

        expect(level[0]).toEqual(P1);
        // Level by construction: point 2 keeps its longitude and takes point 1's latitude.
        expect(level[1][1]).toBe(P1[1]);
        expect(level[1][0]).toBe(askew[1][0]);
        // …so the zone spans the east-west extent the operator dragged. The length loses
        // only the tilt they did not mean.
        expect(metres(level[0], level[1])).toBeLessThan(metres(askew[0], askew[1]));
    });

    it('keeps the direction the operator dragged', () => {
        const westward = levelRectangleAxis([P1, [-0.6, 51.58]]);
        expect(westward[1][0]).toBeLessThan(westward[0][0]);
        expect(westward[1][1]).toBe(P1[1]);
    });

    it('leaves a purely vertical drag alone, having nothing to level it onto', () => {
        const vertical: Position[] = [P1, [P1[0], 51.7]];
        expect(levelRectangleAxis(vertical)).toEqual(vertical);
    });

    it('is not done by the shared draw hook, which also runs on every rebuild', () => {
        // **The tempting place, and the wrong one.** `normalizeDrawnBase` is a draw-time
        // tidy-up and levelling belongs to the same family — but MapLibre runs that hook
        // on every *build*: restore, import, sweep, and after every gesture. Levelling
        // there squared the axis back onto the parallel the instant a rotate applied it,
        // so a rectangular zone could not be turned at all on that engine. The two draw
        // paths level it themselves. @see RectangularAreaGraphicBase.drawing
        const askew: Position[] = [P1, [0.2, 51.62]];
        for (const name of [
            TacticalGraphicName.FreeFireAreaRectangular,
            TacticalGraphicName.TargetAreaRectangular,
            TacticalGraphicName.PsyOpsZoneRectangular,
        ]) {
            expect(normalizeDrawnBase(name, askew)).toEqual(askew);
        }
    });

    it('leaves an irregular area untouched', () => {
        const clicks: Position[] = [P1, [0.2, 51.62], [0.1, 51.3], P1];
        expect(normalizeDrawnBase(TacticalGraphicName.FreeFireAreaIrregular, clicks)).toEqual(clicks);
    });
});

describe('an anchor-point drag sets the length, never the orientation', () => {
    /** A level axis, 28 km long, running east. */
    const axis: Position[] = levelRectangleAxis([P1, [0.2, 51.5]]);

    it('holds a dragged point 2 to the east-west line it already had', () => {
        // Dragged up and to the right: only the along-axis part counts, and on a level
        // zone "along" is due east — so the latitude does not move at all. That is the
        // instruction in one assertion. (User's call, 2026-08-27.)
        const dragged = constrainRectangleAxis(axis, [axis[0], [0.35, 51.61]]);
        expect(dragged[1][1]).toBeCloseTo(axis[0][1], 12);
        expect(dragged[1][0]).toBeGreaterThan(axis[1][0]);
        expect(dragged[0]).toEqual(axis[0]);
    });

    it('holds a dragged point 1 the same way, about point 2', () => {
        const dragged = constrainRectangleAxis(axis, [[-0.45, 51.44], axis[1]]);
        expect(dragged[0][1]).toBeCloseTo(axis[1][1], 12);
        expect(dragged[0][0]).toBeLessThan(axis[0][0]);
        expect(dragged[1]).toEqual(axis[1]);
    });

    it('keeps a turned zone on its own axis, not on the parallel', () => {
        // The rule is "along the axis it already has", and after a rotate that is not
        // east-west. Held to a hair by flattening about the anchor.
        const turned: Position[] = [[-0.2, 51.4], [0.2, 51.6]];
        const dragged = constrainRectangleAxis(turned, [turned[0], [0.5, 51.55]]);
        // A tenth of a degree: the local flattening is exact on a parallel and
        // approximate off one, which is the trade that makes the level case exact.
        expect(Math.abs(bearing(dragged[0], dragged[1]) - bearing(turned[0], turned[1]))).toBeLessThan(0.2);
        expect(metres(dragged[0], dragged[1])).toBeGreaterThan(metres(turned[0], turned[1]));
    });

    it('shortens as readily as it lengthens', () => {
        const dragged = constrainRectangleAxis(axis, [axis[0], [0.0, 51.55]]);
        expect(metres(dragged[0], dragged[1])).toBeLessThan(metres(axis[0], axis[1]));
    });

    it('stops at a floor rather than turning the zone inside out', () => {
        // Dragged past the other anchor point entirely.
        const dragged = constrainRectangleAxis(axis, [axis[0], [-0.9, 51.5]]);
        expect(metres(dragged[0], dragged[1])).toBeLessThan(2);
        expect(bearing(dragged[0], dragged[1])).toBeCloseTo(bearing(axis[0], axis[1]), 0);
    });

    it('leaves a turned axis alone, because a rotate moves both points', () => {
        // The discriminator, and the whole reason there is no gesture name at this level:
        // one endpoint moving is a length change, two is a rotate or a translate.
        const turned: Position[] = [[-0.2, 51.4], [0.2, 51.6]];
        expect(constrainRectangleAxis(axis, turned)).toEqual(turned);
    });

    it('leaves a rebuild alone, because neither point moved', () => {
        expect(constrainRectangleAxis(axis, [...axis])).toEqual(axis);
    });

    it('has nothing to hold on to before the first drawing', () => {
        expect(constrainRectangleAxis(undefined, axis)).toEqual(axis);
    });
});

describe('the rectangle the axis and the width build', () => {
    it('starts wider than the library’s generic drawn offset', () => {
        // At 20 px the zone came out a letterbox and the width handle sat almost on the
        // axis. Its own number, read by both engines. (User's call, 2026-08-27.)
        expect(RECTANGLE_DEFAULT_HALF_WIDTH_PX).toBeGreaterThan(20);
    });

    it('round-trips through the ring a pre-conversion file holds', () => {
        const level = levelRectangleAxis([P1, [0.2, 51.5]]);
        const halfWidth = 6_000;
        const back = axisFromRectangleRing(rectangleFromAxis(level[0], level[1], halfWidth));

        expect(back).toBeDefined();
        // Within a percent. The ring's corners are walked out on great circles and the
        // recovery measures a bounding box, so the two differ by the curvature over the
        // width — this is a rescue of a drawn box, not a precision round trip.
        expect(back!.halfWidth / halfWidth).toBeCloseTo(1, 1);
        expect(metres(back!.p1, back!.p2) / metres(level[0], level[1])).toBeCloseTo(1, 2);
    });
});
