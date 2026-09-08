/**
 * # Obstacle teeth are whole, and centred on their own segment
 *
 * Reported 2026-09-07 across the six toothed obstacle graphics — belt, free area, group,
 * line, restricted area and zone: *"We want the triangles to be complete on the line and not
 * falling off the line (where it joins the next segment). However many fit comfortably on
 * that line/segment, need to be centered on the line."*
 *
 * `crenellatedPath` used to carry a running offset from one segment into the next, so the
 * leftover from a segment was spent immediately after the corner. Teeth crowded one side of
 * a join and left a gap on the other, and on a closed ring the last segment met the first
 * mid-pattern.
 *
 * The measurements below are geometric rather than pictorial: a tooth is the apex between
 * two baseline points, so the run of teeth on a segment can be recovered from the output
 * and compared against the segment's own ends.
 */
import {crenellatedPath} from './decorations';
import type {ProjectedPosition} from '../core/paint';

const BASE = 10;
const GAP = 6;
const HEIGHT = 8;

/** Apex points: the ones standing off the baseline. */
const apexes = (out: ProjectedPosition[], axis: 0 | 1 = 1) =>
    out.filter(p => Math.abs(p[axis]) > 1e-9);

/** Where each tooth sits along a horizontal segment, by its apex's x. */
const apexAlong = (out: ProjectedPosition[]) => apexes(out).map(p => p[0]).sort((a, b) => a - b);

describe('teeth on a single segment', () => {
    it('fits only whole teeth, and never runs past the end', () => {
        // 100 long: n*10 + (n-1)*6 <= 100 → n = 7 (run 106 is too long, 6 teeth run 90).
        const out = crenellatedPath([[0, 0], [100, 0]], HEIGHT, BASE, GAP, 1);
        const at = apexAlong(out);
        expect(at).toHaveLength(6);
        for (const x of at) {
            expect(x - BASE / 2).toBeGreaterThanOrEqual(0);
            expect(x + BASE / 2).toBeLessThanOrEqual(100);
        }
    });

    it('centres the run, leaving equal margins at both ends', () => {
        const length = 100;
        const out = crenellatedPath([[0, 0], [length, 0]], HEIGHT, BASE, GAP, 1);
        const at = apexAlong(out);
        const leading = at[0] - BASE / 2;
        const trailing = length - (at[at.length - 1] + BASE / 2);
        expect(leading).toBeCloseTo(trailing, 6);
        expect(leading).toBeGreaterThan(0);
    });

    it('keeps the gap between teeth unchanged rather than stretching it', () => {
        // The chosen option: tooth size and gap are exactly as before, only the leftover
        // moves. Stretching to fill the segment was the alternative and is not what runs.
        const at = apexAlong(crenellatedPath([[0, 0], [100, 0]], HEIGHT, BASE, GAP, 1));
        for (let i = 1; i < at.length; i++) {
            expect(at[i] - at[i - 1]).toBeCloseTo(BASE + GAP, 6);
        }
    });

    it('draws a segment too short for one tooth bare', () => {
        const out = crenellatedPath([[0, 0], [BASE - 1, 0]], HEIGHT, BASE, GAP, 1);
        expect(apexes(out)).toHaveLength(0);
        // …and still returns the baseline, so the line itself is never lost.
        expect(out).toEqual([[0, 0], [BASE - 1, 0]]);
    });
});

describe('teeth across a join, which is what was reported', () => {
    /** Two equal horizontal segments meeting at x = 100. */
    const twoSegments = () => crenellatedPath([[0, 0], [100, 0], [200, 0]], HEIGHT, BASE, GAP, 1);

    it('gives each segment the same count, since they are the same length', () => {
        const at = apexAlong(twoSegments());
        const first = at.filter(x => x < 100);
        const second = at.filter(x => x > 100);
        expect(first).toHaveLength(second.length);
    });

    it('leaves a clear margin either side of the join, not a crowded tooth', () => {
        const at = apexAlong(twoSegments());
        const before = Math.max(...at.filter(x => x < 100));
        const after = Math.min(...at.filter(x => x > 100));
        // The gap spanning the corner is two margins plus nothing else, so it is strictly
        // wider than an ordinary between-teeth gap. Carrying the offset across made this
        // narrower than a gap, which is what read as a tooth falling off the join.
        expect(after - before).toBeGreaterThan(BASE + GAP);
    });

    it('never places a tooth straddling the corner', () => {
        for (const x of apexAlong(twoSegments())) {
            expect(Math.abs(x - 100)).toBeGreaterThan(BASE / 2);
        }
    });

    it('is unaffected by a preceding segment, which is the carry that was removed', () => {
        // The same second segment, reached after a long first one and after a short one.
        const long = apexAlong(crenellatedPath([[0, 0], [137, 0], [237, 0]], HEIGHT, BASE, GAP, 1))
            .filter(x => x > 137).map(x => x - 137);
        const short = apexAlong(crenellatedPath([[0, 0], [23, 0], [123, 0]], HEIGHT, BASE, GAP, 1))
            .filter(x => x > 23).map(x => x - 23);
        expect(long).toHaveLength(short.length);
        long.forEach((x, i) => expect(x).toBeCloseTo(short[i], 6));
    });
});

describe('a closed ring', () => {
    it('closes without a partial tooth at the seam', () => {
        const ring: ProjectedPosition[] = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
        const out = crenellatedPath(ring, HEIGHT, BASE, GAP, 1);
        // Every one of the four edges gets the same treatment, so the seam at [0,0] is an
        // ordinary corner rather than the place the pattern happened to run out.
        const perEdge = [
            apexes(out, 1).filter(p => p[1] !== 0 && p[0] > 0 && p[0] < 100).length,
        ];
        expect(perEdge[0]).toBeGreaterThan(0);
        expect(out[0]).toEqual([0, 0]);
        expect(out[out.length - 1]).toEqual([0, 0]);
    });
});
