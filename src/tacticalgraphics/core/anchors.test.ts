import {Position} from 'geojson';
import * as turf from './turf';
import {anchorsForRunAndArc, anchorsFromFrame, frameFromAnchors, runAndArcFromAnchors} from './anchors';

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
