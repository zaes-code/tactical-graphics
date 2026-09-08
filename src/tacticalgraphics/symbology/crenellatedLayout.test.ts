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
 *
 * The fortified family — fortified area, fortified line and the trench position — got the
 * same treatment on the same day. `castellatedPath` had the defect by a different route: it
 * walked the whole path with `pathPointAt`, so a merlon starting on one segment and ending
 * on the next bent around the corner, and its stretch-to-fit applied to the merlon width as
 * well as the gap, giving one outline several merlon sizes.
 */
import {castellatedPath, crenellatedPath, splitAtCorners} from './decorations';
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

describe('teeth across a corner, which is what was reported', () => {
    /** An L: 100 east, then 100 north. A real 90-degree corner at [100, 0]. */
    const corner = () => crenellatedPath([[0, 0], [100, 0], [100, 100]], HEIGHT, BASE, GAP, 1);
    /** Teeth on the horizontal leg, by apex x. Its apexes are the ones off the y axis. */
    const onFirstLeg = (out: ProjectedPosition[]) =>
        out.filter(p => Math.abs(p[1]) > 1e-9 && p[0] < 100).map(p => p[0]).sort((a, b) => a - b);

    it('never places a tooth straddling the corner', () => {
        for (const x of onFirstLeg(corner())) {
            expect(Math.abs(x - 100)).toBeGreaterThan(BASE / 2);
        }
    });

    it('leaves a clear margin before the corner, not a crowded tooth', () => {
        const at = onFirstLeg(corner());
        expect(100 - (at[at.length - 1] + BASE / 2)).toBeGreaterThan(0);
    });

    it('gives a leg the same layout whatever precedes it', () => {
        // The carried offset is gone: a leg's teeth depend on that leg alone.
        // An apex on the vertical leg stands exactly HEIGHT off the line x = corner; the
        // horizontal leg's apexes also have y > 0, so offset is the discriminator, not sign.
        const upLeg = (x: number) => crenellatedPath([[0, 0], [x, 0], [x, 100]], HEIGHT, BASE, GAP, 1)
            .filter(p => Math.abs(Math.abs(p[0] - x) - HEIGHT) < 1e-9)
            .map(p => p[1]).sort((a, b) => a - b);
        const after137 = upLeg(137);
        const after23 = upLeg(23);
        expect(after137).toHaveLength(after23.length);
        after137.forEach((y, i) => expect(y).toBeCloseTo(after23[i], 6));
    });
});

describe('a sampled curve is one run, not many segments', () => {
    /*
     * The fix for a real regression. A traced ellipse arrives as ~50 short chords; laying
     * out per chord meant every chord was "too short for one" and a fortified area came out
     * as a plain outline with no merlons at all — measured, 0 of 48 chords reached the 30
     * pixels a merlon needs, median chord 11. Decorations break at *corners*, and a 4-degree
     * bend between chords is not one. @see splitAtCorners
     */
    const arc = (n: number, r = 200): ProjectedPosition[] =>
        Array.from({length: n + 1}, (_, i) => {
            const t = (i / n) * (Math.PI / 2);
            return [r * Math.cos(t), r * Math.sin(t)] as ProjectedPosition;
        });

    it('decorates a finely sampled curve rather than leaving it bare', () => {
        const many = crenellatedPath(arc(48), HEIGHT, BASE, GAP, 1);
        expect(many.length).toBeGreaterThan(arc(48).length);
    });

    it('gives a curve roughly the same count however finely it was sampled', () => {
        const count = (n: number) =>
            crenellatedPath(arc(n), HEIGHT, BASE, GAP, 1).length - arc(n).length;
        // Sampling is a drawing artefact; the decoration should not depend on it.
        expect(Math.abs(count(48) - count(12))).toBeLessThanOrEqual(6);
    });

    it('still breaks at a real corner', () => {
        expect(splitAtCorners([[0, 0], [100, 0], [100, 100]])).toHaveLength(2);
        // …and not at a gentle one.
        expect(splitAtCorners(arc(48))).toHaveLength(1);
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


describe('fortified merlons follow the same rule', () => {
    /** A merlon is a pair of raised points; take the midpoint of each pair as its centre. */
    const merlonCentres = (out: ProjectedPosition[]) => {
        const raised = out.filter(p => Math.abs(p[1]) > 1e-9).map(p => p[0]);
        const centres: number[] = [];
        for (let i = 0; i + 1 < raised.length; i += 2) centres.push((raised[i] + raised[i + 1]) / 2);
        return centres.sort((a, b) => a - b);
    };

    it('keeps the merlon its stated width rather than stretching it to fit', () => {
        // The old layout scaled the merlon with the spacing, so the same graphic drawn
        // longer grew wider merlons. Two different lengths, one width.
        const width = (length: number) => {
            const out = castellatedPath([[0, 0], [length, 0]], BASE, GAP, HEIGHT, 1);
            const raised = out.filter(p => Math.abs(p[1]) > 1e-9).map(p => p[0]);
            return raised[1] - raised[0];
        };
        expect(width(100)).toBeCloseTo(BASE, 6);
        expect(width(213)).toBeCloseTo(BASE, 6);
    });

    it('centres the run on its own segment', () => {
        const length = 100;
        const at = merlonCentres(castellatedPath([[0, 0], [length, 0]], BASE, GAP, HEIGHT, 1));
        const leading = at[0] - BASE / 2;
        const trailing = length - (at[at.length - 1] + BASE / 2);
        expect(leading).toBeCloseTo(trailing, 6);
    });

    it('never lets a merlon bend around a corner', () => {
        // The failure `pathPointAt` produced: left point on one segment, right on the next.
        const out = castellatedPath([[0, 0], [100, 0], [200, 0]], BASE, GAP, HEIGHT, 1);
        for (const x of merlonCentres(out)) {
            expect(Math.abs(x - 100)).toBeGreaterThan(BASE / 2);
        }
    });

    it('draws a segment too short for one merlon bare', () => {
        const out = castellatedPath([[0, 0], [BASE - 1, 0]], BASE, GAP, HEIGHT, 1);
        expect(out.filter(p => Math.abs(p[1]) > 1e-9)).toHaveLength(0);
    });
});
