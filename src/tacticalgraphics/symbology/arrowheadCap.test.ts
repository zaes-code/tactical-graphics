/**
 * # An end mark's share is a share of the symbol's reach, not of how far the pen travelled
 *
 * `screenSizedArrowHead` caps a solid head at {@link ARROWHEAD_MAX_SHARE} of the line it
 * terminates, so a short graphic gets a proportionate head rather than the full
 * {@link SOLID_ARROWHEAD_PX}. Which length that share is taken of is the whole question
 * here, and it had one answer for two different kinds of line.
 *
 * **Ferry crossing was always right.** Its line is a straight two-point run, so "how far
 * the pen travels" and "how far the symbol reaches" are the same number and the cap lands
 * where it should.
 *
 * **Fix and the tactical fix were not.** Their line is a *zigzag* — a texture along a run,
 * not a route — and it traverses roughly twice its own reach. A share of the traversal let
 * the head reach the absolute ceiling on a symbol only 50 px across, which on the sweep
 * sheet drew a triangle a third the width of the graphic. Measured in the running app:
 * 15 px of head on 49.9 px of reach, a ratio of 0.301, beside ferry crossing's 0.25.
 * (User's call, 2026-09-03: "the arrowhead on fix needs to scale cap like ferry crossing".)
 */
import {ARROWHEAD_MAX_SHARE, SOLID_ARROWHEAD_PX, screenSizedArrowHead} from './decorations';
import type {ProjectedPosition} from '../core/paint';

const RESOLUTION = 100;

/** A head far larger than any cap, so what comes back is the cap and nothing else. */
const oversizedHead = (tipX: number): ProjectedPosition[] => [
    [tipX, 0],
    [tipX - 100_000, 40_000],
    [tipX - 100_000, -40_000],
];

/** How long the returned head is, tip to base, in screen pixels. */
const headPx = (ring: ProjectedPosition[] | null): number => {
    if (!ring) return 0;
    const [tip, left, right] = ring;
    const mid: ProjectedPosition = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
    return Math.hypot(tip[0] - mid[0], tip[1] - mid[1]) / RESOLUTION;
};

/** A straight run of `px` screen pixels — ferry crossing's line. */
const straight = (px: number): ProjectedPosition[] => [[0, 0], [px * RESOLUTION, 0]];

/**
 * A zigzag reaching `px` screen pixels end to end, but travelling much further.
 *
 * Ten apexes at an amplitude of a third of the step, which is about the shape Fix draws.
 */
const zigzag = (px: number): ProjectedPosition[] => {
    const run = px * RESOLUTION;
    const steps = 10;
    const amplitude = (run / steps) * 0.85;
    const path: ProjectedPosition[] = [];
    for (let i = 0; i <= steps; i++) {
        path.push([(run * i) / steps, i % 2 === 0 ? 0 : amplitude]);
    }
    return path;
};

describe('screenSizedArrowHead', () => {
    it('measures the traversal by default, which is right for a route', () => {
        // A winding route really does have room for a bigger head: the drawn path *is* the
        // symbol, so the pen's travel is its size. Nothing here changes for those callers.
        const wandering = zigzag(50);
        // Its traversal is about twice its reach, so a quarter of it clears the ceiling.
        expect(headPx(screenSizedArrowHead(oversizedHead(wandering[wandering.length - 1][0]), wandering, RESOLUTION)))
            .toBeCloseTo(SOLID_ARROWHEAD_PX, 5);
    });

    it('measures end to end when asked for `reach`, so a texture cannot inflate the cap', () => {
        const wandering = zigzag(50);
        const capped = headPx(
            screenSizedArrowHead(oversizedHead(wandering[wandering.length - 1][0]), wandering, RESOLUTION, 'reach'),
        );
        expect(capped).toBeCloseTo(50 * ARROWHEAD_MAX_SHARE, 5);
        // And it is genuinely smaller than the default would have given — a test that did
        // not check this would pass against the unfixed code, because both are "a number".
        expect(capped).toBeLessThan(SOLID_ARROWHEAD_PX);
    });

    it('gives a straight line the same answer either way, which is why ferry crossing never moved', () => {
        const line = straight(40);
        const traversed = headPx(screenSizedArrowHead(oversizedHead(line[1][0]), line, RESOLUTION));
        const reach = headPx(screenSizedArrowHead(oversizedHead(line[1][0]), line, RESOLUTION, 'reach'));
        expect(reach).toBeCloseTo(traversed, 9);
        expect(reach).toBeCloseTo(40 * ARROWHEAD_MAX_SHARE, 5);
    });

    it('still stops at the absolute ceiling on a long graphic', () => {
        // The share is a floor-raiser for short symbols, not a licence for big ones: a run
        // long enough that a quarter of it exceeds the ceiling still gets the ceiling.
        const line = straight(400);
        expect(headPx(screenSizedArrowHead(oversizedHead(line[1][0]), line, RESOLUTION, 'reach')))
            .toBeCloseTo(SOLID_ARROWHEAD_PX, 5);
    });
});

describe('the fix family against ferry crossing, at one screen size', () => {
    /**
     * The comparison the ruling was made on, as a test.
     *
     * Both symbols are handed a run the sweep sheet actually draws them at, and the head
     * each ends up with is asserted as a *fraction of its own reach* — which is the only
     * way to compare two symbols of different lengths, and the number the eye is judging.
     */
    it('caps both at the same fraction of their own reach', () => {
        const fixLine = zigzag(50);
        const ferryLine = straight(31);
        const fixRatio = headPx(
            screenSizedArrowHead(oversizedHead(fixLine[fixLine.length - 1][0]), fixLine, RESOLUTION, 'reach'),
        ) / 50;
        const ferryRatio = headPx(screenSizedArrowHead(oversizedHead(ferryLine[1][0]), ferryLine, RESOLUTION)) / 31;
        expect(fixRatio).toBeCloseTo(ferryRatio, 9);
        expect(fixRatio).toBeCloseTo(ARROWHEAD_MAX_SHARE, 9);
    });
});
