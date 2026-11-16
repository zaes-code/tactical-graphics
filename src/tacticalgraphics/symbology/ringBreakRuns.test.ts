/**
 * # A ring broken for its labels draws the same outline with far fewer points
 *
 * `breakRingAt` used to resample every ring segment into 24 points, so a broken ring emitted
 * about 24 times its vertex count, and a break's ends landed on the nearest sample rather than
 * where the gap was computed. It now emits the ring's own vertices plus the exact break ends.
 *
 * What is pinned here: every run lies on the ring, the gaps are exactly the computed spans,
 * and against the sampled form it replaced the outline is unchanged away from the break ends,
 * where the only difference is the sample step the old form rounded each end to.
 */
import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {breakRingAt, cardinalBoundaryPaint, contourLineBoundaryPaint, nestedZonePaint, ringCenter} from './boundaryBreakPaints';

type Ring = ProjectedPosition[];

/** The sampled form `ringWithBreaks` had, kept as the reference the new one is held to. */
function sampledRuns(ring: Ring, breaks: ReadonlyArray<readonly [number, number]>): Ring[] {
    const inBreak = (d: number) => breaks.some(([from, to]) => d >= from && d <= to);
    const runs: Ring[] = [];
    let run: Ring = [];
    let traveled = 0;
    const close = () => {
        if (run.length >= 2) runs.push(run);
        run = [];
    };
    for (let i = 0; i + 1 < ring.length; i++) {
        const [a, b] = [ring[i], ring[i + 1]];
        const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const steps = Math.max(2, Math.ceil(segLen / Math.max(1, segLen / 24)));
        for (let s = 0; s <= steps; s++) {
            const d = traveled + (segLen * s) / steps;
            if (inBreak(d)) close();
            else run.push([a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps]);
        }
        traveled += segLen;
    }
    close();
    return runs;
}

function distToSegment(p: ProjectedPosition, a: ProjectedPosition, b: ProjectedPosition): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
const distToLines = (p: ProjectedPosition, lines: Ring[]) => Math.min(...lines.flatMap(l => l.slice(1).map((b, i) => distToSegment(p, l[i], b))));

/** Points every `step` along a set of lines. */
function along(lines: Ring[], step: number): ProjectedPosition[] {
    const out: ProjectedPosition[] = [];
    for (const l of lines) {
        for (let i = 1; i < l.length; i++) {
            const [a, b] = [l[i - 1], l[i]];
            const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
            for (let k = 0; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
        }
    }
    return out;
}

/**
 * Rings start a little off east, as a traced or generated ring usually does: a break across the
 * closing vertex is cut on one side of it only, by both forms alike, which is not what is tested.
 */
const SEAM = 0.3;

const circle = (radius: number, vertices: number, cx = 0, cy = 0): Ring => {
    const ring: Ring = [];
    for (let i = 0; i < vertices; i++) {
        const a = (i / vertices) * Math.PI * 2 + SEAM;
        ring.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
    }
    ring.push(ring[0]);
    return ring;
};

/** The catalog's free-form area: a bean with 48 vertices. */
const bean = (size: number): Ring => {
    const ring: Ring = [];
    for (let i = 0; i < 48; i++) {
        const t = (i / 48) * Math.PI * 2 + SEAM;
        const r = 1 + 0.17 * Math.cos(2 * t) + 0.08 * Math.sin(3 * t);
        ring.push([size * 1.6 * r * Math.cos(t), size * r * Math.sin(t)]);
    }
    ring.push(ring[0]);
    return ring;
};

const CARDINALS = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];
/** One metre per px: the rings below are sized in screen px directly. */
const RINGS: Array<[string, Ring]> = [
    ['a 64-vertex circle 300 px across', circle(150, 64)],
    ['a 64-vertex circle 1200 px across', circle(600, 64)],
    ['a bean 400 px across', bean(125)],
    ['a bean 2000 px across', bean(625)],
];

describe('breakRingAt', () => {
    it.each(RINGS)('keeps every run on %s', (_, ring) => {
        const {runs} = breakRingAt(ring, ringCenter(ring), CARDINALS, 20);
        for (const p of runs.flat()) expect(distToLines(p, [ring])).toBeLessThan(1e-6);
    });

    it.each(RINGS)('opens each gap on %s exactly as wide as asked', (_, ring) => {
        const half = 20;
        const {runs, spots} = breakRingAt(ring, ringCenter(ring), CARDINALS, half);
        const ends = runs.flatMap(run => [run[0], run[run.length - 1]]);
        for (const spot of spots) {
            // The two run ends either side of the gap, each `half` along the ring from its centre;
            // on a curved ring the chord is a hair shorter than the arc.
            const near = ends.map(e => Math.hypot(e[0] - spot[0], e[1] - spot[1])).sort((a, b) => a - b).slice(0, 2);
            for (const d of near) {
                expect(d).toBeLessThanOrEqual(half + 1e-6);
                expect(d).toBeGreaterThan(half * 0.98);
            }
        }
    });

    it.each(RINGS)('draws on %s what the sampled form drew, apart from where each break ends', (_, ring) => {
        const center = ringCenter(ring);
        const half = 20;
        const {runs, spots} = breakRingAt(ring, center, CARDINALS, half);
        const crossings = spots.length;
        expect(crossings).toBe(4);

        // Rebuild the breaks the sampled form was handed, from the gaps the new form left.
        const at: number[] = [0];
        for (let i = 0; i + 1 < ring.length; i++) at.push(at[i] + Math.hypot(ring[i + 1][0] - ring[i][0], ring[i + 1][1] - ring[i][1]));
        const distanceOf = (p: ProjectedPosition) => {
            let best = Infinity;
            let d = 0;
            for (let i = 0; i + 1 < ring.length; i++) {
                const e = distToSegment(p, ring[i], ring[i + 1]);
                if (e < best) {
                    best = e;
                    d = at[i] + Math.hypot(p[0] - ring[i][0], p[1] - ring[i][1]);
                }
            }
            return d;
        };
        const breaks = spots.map(s => distanceOf(s)).map(d => [d - half, d + half] as const);
        const old = sampledRuns(ring, breaks);
        expect(runs).toHaveLength(old.length);

        // Every bit of ink the sampled form drew is still drawn.
        for (const p of along(old, 1)) expect(distToLines(p, runs)).toBeLessThan(0.05);
        // New ink beyond the old lies only at a break end, within one sample step of it.
        const longest = Math.max(...ring.slice(1).map((b, i) => Math.hypot(b[0] - ring[i][0], b[1] - ring[i][1])));
        const runEnds = runs.flatMap(r => [r[0], r[r.length - 1]]);
        for (const p of along(runs, 1)) {
            if (distToLines(p, old) < 0.05) continue;
            const toEnd = Math.min(...runEnds.map(e => Math.hypot(e[0] - p[0], e[1] - p[1])));
            expect(toEnd).toBeLessThanOrEqual(longest / 24 + 1e-6);
        }

        // And it takes a tenth of the points or fewer.
        expect(runs.flat().length * 10).toBeLessThan(old.flat().length);
    }, 60_000);
});

describe('the five graphics that break a ring', () => {
    const context = (resolution: number): PaintContext => ({resolution, measureText: (t: string) => t.length * 9}) as unknown as PaintContext;
    const area = (name: TacticalGraphicName, ring: Ring, props: Record<string, unknown> = {}): PaintFeature =>
        ({geometry: {type: 'Polygon', coordinates: [ring]}, properties: {name, ...props}, ring}) as unknown as PaintFeature;
    const zone = (name: TacticalGraphicName, inner: Ring, outer: Ring): PaintFeature =>
        ({geometry: {type: 'MultiLineString', coordinates: [inner, outer]}, properties: {name}}) as unknown as PaintFeature;
    const runsOf = (paints: ReturnType<ReturnType<typeof nestedZonePaint>>) =>
        paints.flatMap(p => (p.geometry.type === 'MultiLineString' ? (p.geometry.coordinates as Ring[]) : []));

    const ring = bean(125_000);
    const cases: Array<[string, () => Ring[], Ring[]]> = [
        ['artillery maneuver area', () => runsOf(cardinalBoundaryPaint('AMA')(area(TacticalGraphicName.ArtilleryManeuverArea, ring), context(500))), [ring]],
        ['artillery reserved area', () => runsOf(cardinalBoundaryPaint('ARA')(area(TacticalGraphicName.ArtilleryReservedArea, ring), context(500))), [ring]],
        [
            'radiation dose rate contour line',
            () => runsOf(contourLineBoundaryPaint()(area(TacticalGraphicName.RadiationDoseRateContourLine, ring, {additionalInfo: '30 CGH'}), context(500))),
            [ring],
        ],
        [
            'minimum safe distance zone',
            () => runsOf(nestedZonePaint()(zone(TacticalGraphicName.MinimumSafeDistanceZone, circle(60_000, 64), circle(120_000, 64)), context(500))),
            [circle(60_000, 64), circle(120_000, 64)],
        ],
        [
            'minimum safe distance zone, multiple strike',
            () => runsOf(nestedZonePaint()(zone(TacticalGraphicName.MinimumSafeDistanceMultipleStrike, ring, bean(160_000)), context(500))),
            [ring, bean(160_000)],
        ],
    ];

    it.each(cases)('the %s is cut, its runs lie on its rings, and each run holds no more points than the ring has', (_, paint, rings) => {
        const runs = paint();
        expect(runs.length).toBeGreaterThan(rings.length - 1);
        for (const p of runs.flat()) expect(distToLines(p, rings)).toBeLessThan(1e-6);
        const vertices = rings.reduce((total, r) => total + r.length, 0);
        expect(runs.flat().length).toBeLessThanOrEqual(vertices + 2 * runs.length);
    });
});
