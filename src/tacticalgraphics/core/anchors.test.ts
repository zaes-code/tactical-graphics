import {Position} from 'geojson';
import * as turf from './turf';
import {anchorsFromFrame, frameFromAnchors} from './anchors';

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
