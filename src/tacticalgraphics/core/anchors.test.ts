import {Position} from 'geojson';
import * as turf from './turf';
import {anchorsForArcAndArrow, anchorsForBow, anchorsForRunAndArc, anchorsFromFrame, arcAndArrowFromAnchors, bowFromAnchors, frameFromAnchors, runAndArcFromAnchors} from './anchors';
import geometryService from './GeometryService';
import {TacticalGraphicName} from './type';
import {handleContract, handleRole, rotationAnchor, rotationPivot} from './handles';
import {turnBendFromOffset} from '../graphics/Turn';

/**
 * The conversion has to be exact in both directions, because a restore round-trips
 * through it: a graphic saved as a center plus a size and a rotation is rebuilt as
 * anchor points, and those points must recover the frame it was saved with.
 */
const CENTER: Position = [-0.1, 51.5];
const meters = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

describe('drawn anchors and the frame they describe', () => {
    it('refuses anything shorter than a click', () => {
        expect(frameFromAnchors(undefined)).toBeUndefined();
        expect(frameFromAnchors([CENTER])).toBeUndefined();
        expect(frameFromAnchors([CENTER, CENTER])).toBeUndefined();
    });

    it.each([0, 45, 90, 217, 359])('round-trips a %s degree run', rotation => {
        const size = 4000;
        const anchors = anchorsFromFrame(CENTER, size, rotation);
        const frame = frameFromAnchors(anchors)!;

        expect(frame.size).toBeCloseTo(size, 0);
        expect(meters(frame.center, CENTER)).toBeLessThan(1);
        // Compare as a direction, so 359 and -1 agree.
        const drift = Math.abs(((frame.angle * 180) / Math.PI - rotation + 540) % 360 - 180);
        expect(drift).toBeLessThan(0.5);
    });

    it.each([1, -1])('round-trips a perpendicular reach on side %s', side => {
        const anchors = anchorsFromFrame(CENTER, 4000, 30, 2500, side);
        expect(anchors).toHaveLength(3);
        const frame = frameFromAnchors(anchors)!;

        expect(frame.offset).toBeCloseTo(2500, 0);
        expect(frame.side).toBe(side);
        expect(frame.size).toBeCloseTo(4000, 0);
    });

    it('leaves the reach undefined when only two points were drawn', () => {
        const frame = frameFromAnchors(anchorsFromFrame(CENTER, 3000, 10))!;
        expect(frame.offset).toBeUndefined();
        expect(frame.side).toBe(1);
    });

    it('spans the first and last vertex of a kinked sketch', () => {
        // APP-06 allows "N anchor points, where N is between 3 and 50" on some of these.
        const kinked: Position[] = [[-0.3, 51.5], [-0.2, 51.55], [-0.1, 51.5]];
        const frame = frameFromAnchors(kinked)!;
        expect(frame.size).toBeCloseTo(meters(kinked[0], kinked[2]) / 2, 0);
    });
});

/**
 * The run-and-arc pair, which is what APP-06 spends four points on. The property that
 * matters is the same one the pair above has to hold: `runAndArcFromAnchors` must undo
 * `anchorsForRunAndArc` exactly, or a graphic walks a little further from where it was
 * saved on every rebuild.
 */
describe('run-and-arc anchor points', () => {
    it('rejects a run too short to have a direction', () => {
        expect(runAndArcFromAnchors(undefined)).toBeUndefined();
        expect(runAndArcFromAnchors([CENTER])).toBeUndefined();
        expect(runAndArcFromAnchors([CENTER, CENTER])).toBeUndefined();
    });

    it.each([
        [4000, 1500, 0, 1],
        [4000, 1500, 0, -1],
        [12000, 9000, 37, 1],
        [12000, 9000, -140, -1],
        [800, 2400, 175, 1],
    ])('round-trips size %p radius %p rotation %p side %p', (size, radius, rotation, side) => {
        const frame = runAndArcFromAnchors(anchorsForRunAndArc(CENTER, size, radius, rotation, side))!;

        expect(frame).toBeDefined();
        expect(meters(frame.center, CENTER)).toBeLessThan(1);
        expect(frame.size).toBeCloseTo(size, 3);
        expect(frame.radius).toBeCloseTo(radius, 3);
        expect(frame.side).toBe(side);
        // Compared as a signed difference wrapped into (-180, 180]: a raw modulus puts
        // a hair under a full turn at 359.999... and a hair over zero at 0.000..., which
        // are the same aim and would fail as if they were half a circle apart.
        const degrees = (frame.angle * 180) / Math.PI;
        const drift = (((degrees - rotation) % 360) + 540) % 360 - 180;
        expect(drift).toBeCloseTo(0, 6);
    });

    it('emits exactly the four points APP-06 asks for', () => {
        expect(anchorsForRunAndArc(CENTER, 4000, 1500, 0, 1)).toHaveLength(4);
    });

    it('puts both feet of the semicircle on the run itself', () => {
        // "Point 3 defines the diameter" — and the standard's template draws that
        // diameter along the approach, so point 3 is the run's own continuation.
        const [p1, p2, p3] = anchorsForRunAndArc(CENTER, 4000, 1500, 0, 1);
        const bearing = (a: Position, b: Position) => turf.bearing(turf.point(a), turf.point(b));
        expect(bearing(p1, p3)).toBeCloseTo(bearing(p1, p2), 6);
        // ...and two radii past the line's end, which is what makes it the diameter.
        expect(meters(p2, p3)).toBeCloseTo(2 * 1500, 2);
    });

    it('takes the side from point 4, overriding where point 3 fell', () => {
        const anchors = anchorsForRunAndArc(CENTER, 4000, 1500, 0, 1);
        const flipped = anchorsForRunAndArc(CENTER, 4000, 1500, 0, -1);
        // Only the fourth point moves: the first three are identical either way.
        anchors.slice(0, 3).forEach((p, i) => expect(meters(p, flipped[i])).toBeLessThan(0.01));
        expect(runAndArcFromAnchors(anchors)!.side).toBe(1);
        expect(runAndArcFromAnchors(flipped)!.side).toBe(-1);
    });

    it('reads a three-point sketch, which is what Pursue draws', () => {
        // Pursue folds orientation into point 3, so the across-axis component of that
        // point is the only thing saying which way its hook turns.
        const four = anchorsForRunAndArc(CENTER, 4000, 1500, 0, 1);
        const frame = runAndArcFromAnchors(four.slice(0, 3))!;
        expect(frame.size).toBeCloseTo(4000, 3);
        expect(frame.radius).toBeCloseTo(1500, 3);
    });

    it('leaves the radius unset for a two-point sketch, so a mid-draw run still resolves', () => {
        const frame = runAndArcFromAnchors(anchorsForRunAndArc(CENTER, 4000, 1500, 0, 1).slice(0, 2))!;
        expect(frame.size).toBeCloseTo(4000, 3);
        expect(frame.radius).toBeUndefined();
    });
});

/**
 * The bow, which is Turn's shape. The extra thing to pin here beyond the round trip is
 * that the third point lands **on the curve the generator draws** — it is the apex of a
 * quadratic Bezier, at half the control point's offset, and using the control point
 * instead would put a handle in space the symbol never passes through.
 */
describe('bow anchor points', () => {
    it('rejects a chord too short to have a direction', () => {
        expect(bowFromAnchors(undefined)).toBeUndefined();
        expect(bowFromAnchors([CENTER])).toBeUndefined();
        expect(bowFromAnchors([CENTER, CENTER])).toBeUndefined();
    });

    it.each([
        [5000, 0.4, 0],
        [5000, -0.4, 0],
        [12000, 0.9, 65],
        [12000, -0.9, -155],
        [900, 0.25, 179],
    ])('round-trips size %p bend %p rotation %p', (size, bend, rotation) => {
        const frame = bowFromAnchors(anchorsForBow(CENTER, size, rotation, bend))!;

        expect(meters(frame.center, CENTER)).toBeLessThan(1);
        expect(frame.size).toBeCloseTo(size, 3);
        expect(frame.bend).toBeCloseTo(bend, 9);
        const drift = ((((frame.angle * 180) / Math.PI - rotation) % 360) + 540) % 360 - 180;
        expect(drift).toBeCloseTo(0, 6);
    });

    it('numbers the points tip first, the way APP-06 does', () => {
        const [tip, rear] = anchorsForBow(CENTER, 5000, 0, 0.4);
        // At rotation 0 the symbol aims east, so the tip is the eastern end.
        expect(tip[0]).toBeGreaterThan(rear[0]);
    });

    it('puts the third point on the curve, not on the Bezier control point', () => {
        const size = 5000, bend = 0.6;
        const marker = anchorsForBow(CENTER, size, 0, bend)[2];
        const curve = geometryService.bendLine(
            [anchorsForBow(CENTER, size, 0, bend)[1], anchorsForBow(CENTER, size, 0, bend)[0]],
            size,
            bend,
            32,
        );
        const apex = curve[16];
        expect(meters(marker, apex)).toBeLessThan(size / 500);
    });

    it('leaves the bend unset for a two-point sketch', () => {
        expect(bowFromAnchors(anchorsForBow(CENTER, 5000, 0, 0.4).slice(0, 2))!.bend).toBeUndefined();
    });
});

/** Ambush's arc-and-arrow: the radius comes from the chord, the aim and reach from the tip. */
describe('arc-and-arrow anchor points', () => {
    it('needs all three points', () => {
        expect(arcAndArrowFromAnchors(undefined)).toBeUndefined();
        expect(arcAndArrowFromAnchors([CENTER, CENTER])).toBeUndefined();
        expect(arcAndArrowFromAnchors([CENTER, CENTER, CENTER])).toBeUndefined();
    });

    it.each([
        [4000, 0, 2],
        [4000, 90, 2],
        [9000, -125, 3.4],
        [1200, 175, 1.2],
    ])('round-trips radius %p rotation %p reach %p', (radius, rotation, reach) => {
        const frame = arcAndArrowFromAnchors(anchorsForArcAndArrow(CENTER, radius, rotation, reach))!;

        // Micrometres, not metres. The center is *solved* for rather than stepped to, so
        // there is no approximation left to leave slack for — and a loose bound here is
        // exactly what hid the two wrong solves this went through, both of which landed
        // metres out and looked fine against a one-metre tolerance.
        expect(meters(frame.center, CENTER)).toBeLessThan(1e-6);
        expect(frame.radius).toBeCloseTo(radius, 6);
        expect(frame.arrowReach).toBeCloseTo(reach, 4);
        const drift = ((((frame.angle * 180) / Math.PI - rotation) % 360) + 540) % 360 - 180;
        expect(drift).toBeCloseTo(0, 6);
    });

    it('puts both arc ends one radius from the center', () => {
        const [, upper, lower] = anchorsForArcAndArrow(CENTER, 4000, 20);
        expect(meters(CENTER, upper)).toBeCloseTo(4000, 2);
        expect(meters(CENTER, lower)).toBeCloseTo(4000, 2);
    });

    it('recovers the center from the chord alone, since it is never drawn', () => {
        // The chord of a 120 degree arc is radius * 2 * sin(60), which is what fixes the
        // radius without a center point — the property the whole reader rests on.
        const [, upper, lower] = anchorsForArcAndArrow(CENTER, 4000, 0);
        expect(meters(upper, lower)).toBeCloseTo(2 * 4000 * Math.sin(Math.PI / 3), 1);
    });
});

/**
 * # Turn's edit-mode grips
 *
 * Everything here is a *fact about how the symbol edits*, which both renderers read, so it
 * belongs beside the geometry rather than in either holder. Each assertion below pins one
 * of the four things a user reported wrong on 2026-09-05.
 */
describe('270504 edits through its own anchor points', () => {
    const CENTRE: Position = [-0.1, 51.5];
    const SIZE = 4000;

    it('gives point 2 a grip that extends, and keeps the bend on point 3', () => {
        /*
         * `[tip, rear, bend]`, matching `Turn.generateHandles`. The rear had **no role at
         * all** before, because it had no handle: the generator published
         * `[control, tip, centre]`, so the one end of the symbol an operator reaches for to
         * make a turn longer was the one end that could not be grabbed.
         *
         * `extend` rather than `reach`: `reach` measures from the centre and so moves both
         * ends, which would drag the arrowhead backwards as the tail was pulled out.
         */
        for (const name of [TacticalGraphicName.Turn, TacticalGraphicName.TacticalTurn]) {
            expect([0, 1, 2].map(i => handleRole(name, i))).toEqual(['reach', 'extend', 'bend']);
        }
    });

    it('leaves envelopment on the contract it already had', () => {
        // It shares `BENT_GRAPHICS` with the turns and publishes `[bend, reach]` in the
        // other order, with no rear to grab — so the two families cannot share a line.
        expect([0, 1].map(i => handleRole(TacticalGraphicName.Envelopment, i))).toEqual(['bend', 'reach']);
    });

    it('turns about point 3 without moving the point every other gesture measures from', () => {
        /*
         * **The two questions are separate and this is the graphic that proves it.**
         * `rotationAnchor` is the symbol's frame origin: a resize scales from it, and
         * `setBend` and `setReach` read their cursor offsets against it. Moving *its* answer
         * to the bow — the obvious way to make a rotate turn about point 3 — would have
         * measured the bend, the reach and the resize from there too.
         */
        const anchors = anchorsForBow(CENTRE, SIZE, 0, 0.5);
        const geometry = {type: 'LineString', coordinates: anchors};

        const pivot = rotationPivot(geometry, TacticalGraphicName.Turn);
        expect(pivot[0]).toBeCloseTo(anchors[2][0], 9);
        expect(pivot[1]).toBeCloseTo(anchors[2][1], 9);

        // ...while the frame origin stays the chord's midpoint, which is what resize uses.
        const origin = rotationAnchor(geometry, TacticalGraphicName.Turn);
        expect(meters(origin, CENTRE)).toBeLessThan(1);
        expect(meters(origin, anchors[2])).toBeGreaterThan(SIZE / 10);
    });

    /**
     * **343500 turns about point 1**, the beginning of the straight line.
     *
     * The end the operator placed first is the one the approach is anchored to on the
     * ground; turning about the run's midpoint swung the start of it off that position.
     * Same split as Turn's — the *frame origin* stays the midpoint, because that is what
     * resize, `setBend` and `setReach` measure from. (User's call, 2026-09-05.)
     */
    it('turns an envelopment about point 1, without moving its frame origin', () => {
        const anchors = anchorsForRunAndArc(CENTRE, SIZE, SIZE / 2, 0, 1);
        const geometry = {type: 'LineString', coordinates: anchors};

        const pivot = rotationPivot(geometry, TacticalGraphicName.Envelopment);
        expect(pivot[0]).toBeCloseTo(anchors[0][0], 9);
        expect(pivot[1]).toBeCloseTo(anchors[0][1], 9);

        const origin = rotationAnchor(geometry, TacticalGraphicName.Envelopment);
        expect(meters(origin, CENTRE)).toBeLessThan(1);
        expect(meters(origin, anchors[0])).toBeGreaterThan(SIZE / 10);
    });

    /**
     * **Three grips, and the third says which end of the run holds still.**
     *
     * `extend` lengthens a symbol from the *other* end of its chord, and the two graphics
     * that carry the role number their points in opposite directions — so which end that is
     * has to be stated rather than assumed to be index 0. @see HandleContract.extendAnchor
     */
    it('gives envelopment a grip per thing it can change, and pins point 2 when point 1 is dragged', () => {
        const contract = handleContract(TacticalGraphicName.Envelopment);
        expect(contract.roles).toEqual(['bend', 'reach', 'extend']);
        expect(contract.extendAnchor).toBe(1);
        expect([0, 1, 2].map(i => handleRole(TacticalGraphicName.Envelopment, i)))
            .toEqual(['bend', 'reach', 'extend']);

        // Turn takes the default, because its grip is the rear and its point 1 is the tip.
        expect(handleContract(TacticalGraphicName.Turn).extendAnchor).toBeUndefined();
    });

    it('defaults to the frame origin for everything that names no other pivot', () => {
        /*
         * **Pursuit is the example now.** Envelopment was, until it named point 1 as its own
         * pivot on 2026-09-05 — which is the case this test exists to be the foil for, so the
         * example had to move to a graphic that still takes the default rather than the
         * assertion being relaxed. @see rotationPivot
         */
        const anchors = anchorsFromFrame(CENTRE, SIZE, 0);
        const geometry = {type: 'LineString', coordinates: anchors};
        expect(rotationPivot(geometry, TacticalGraphicName.Pursuit))
            .toEqual(rotationAnchor(geometry, TacticalGraphicName.Pursuit));
    });

    it('reads a bend drag against the apex, not against the control point', () => {
        /*
         * The grip is anchor point 3, which sits at the curve's apex — half way to the
         * Bézier control point `bend` measures. A reader that took the offset at face value
         * bent the curve half as far as the cursor moved.
         *
         * Stated as a round trip so it cannot drift from `anchorsForBow`: put the handle
         * where the generator would, read it back, and the bend has to be the one that
         * placed it.
         */
        for (const bend of [0.3, 0.8, -0.5]) {
            const apexOffset = (bend * SIZE) / 2;
            // `bendLine` bows clockwise of the chord, which is the sign convention
            // `turnBendFromOffset` takes.
            expect(turnBendFromOffset(apexOffset, SIZE)).toBeCloseTo(bend, 6);
        }
        // Half the offset would be the old reading, and it is a different curve.
        expect(turnBendFromOffset((0.8 * SIZE) / 2, SIZE)).not.toBeCloseTo(0.4, 3);
    });
});
