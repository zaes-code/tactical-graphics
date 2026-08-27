/**
 * # APP-06's five protection lines, pinned against their draw rules
 *
 * Each block quotes the rule it enforces. These are constructions where the symbol looks
 * plausible whichever way it is built — a dome is a dome at any depth, an arrowhead reads
 * as one whether or not its barbs cross — so only the standard says which is right, and
 * only a test keeps it that way. @see ProtectionLine.ts, protectionLinePaints.ts
 */

import type {LineString, MultiLineString, Position} from 'geojson';
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import * as turf from '../core/turf';
import {renderTacticalGraphic} from '../core/render';
import {TacticalGraphicHostility, TacticalGraphicMineType, TacticalGraphicName, TacticalGraphicStatus} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {
    fortifiedPositionPaint,
    mineClusterPaint,
    minelinePaint,
    raftSitePaint,
    tripWirePaint,
} from './protectionLinePaints';

const context = (resolution = 40): PaintContext => ({
    resolution,
    measureText: (text, font) => {
        const px = parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16');
        return text.length * px * 0.6;
    },
});

/** A drawn line in projected meters, running due east so "left" is unambiguously north. */
const EAST: ProjectedPosition[] = [[0, 0], [40_000, 0]];

const feature = (
    name: TacticalGraphicName,
    coordinates: ProjectedPosition[] = EAST,
    properties: Record<string, unknown> = {},
): PaintFeature => ({
    geometry: {type: 'LineString', coordinates},
    properties: {name, ...properties},
});

const lines = (paints: Paint[]): ProjectedPosition[][] =>
    paints.flatMap(p => {
        if (p.geometry.type === 'LineString') return [p.geometry.coordinates];
        if (p.geometry.type === 'MultiLineString') return p.geometry.coordinates;
        return [];
    });

const texts = (paints: Paint[]) => paints.filter(p => p.text).map(p => p.text!.text);

beforeEach(() => resetTacticalGraphicsConfig());

describe('APP-06 290101 — mineline', () => {
    // The template sets `N` at point 1 and point N, with `Modifier 1` between them.
    it('writes N at both ends', () => {
        const paints = minelinePaint(TacticalGraphicName.Mineline)(feature(TacticalGraphicName.Mineline), context());
        expect(texts(paints)).toEqual(['N', 'N']);
    });

    it('reads ENY at both ends when the mineline is the enemy\'s', () => {
        const hostile = feature(TacticalGraphicName.Mineline, EAST, {
            hostility: TacticalGraphicHostility.hostileFaker,
        });
        expect(texts(minelinePaint(TacticalGraphicName.Mineline)(hostile, context()))).toEqual(['ENY', 'ENY']);
    });

    it('sets them beyond the ends and level with the line, not above it', () => {
        // `[N] — [Modifier 1] — [N]`, one row: the Template puts the letters on the line's
        // own level, outboard of its two ends. (User's call, 2026-08-27.)
        const marks = minelinePaint(TacticalGraphicName.Mineline)(
            feature(TacticalGraphicName.Mineline), context(),
        ).filter(p => p.text);
        const at = marks.map(p => (p.geometry as {coordinates: ProjectedPosition}).coordinates);
        for (const [, y] of at) expect(y).toBeCloseTo(0, 6);
        expect(at[0][0]).toBeLessThan(0);
        expect(at[1][0]).toBeGreaterThan(40_000);
        // …and reading outward, so neither grows back across the mines.
        expect(marks.map(p => p.text!.align)).toEqual(['right', 'left']);
    });

    it('sets no free text of its own, whatever a designation says', () => {
        // Modifier 1 is the mine drawn along the line, not a caption typed into the
        // middle. A `label` arriving on an imported graphic draws nothing here.
        const withLabel = minelinePaint(TacticalGraphicName.Mineline)(
            feature(TacticalGraphicName.Mineline, EAST, {label: 'M1'}),
            context(),
        );
        expect(texts(withLabel)).toEqual(['N', 'N']);
    });
});

describe('APP-06 290400 — mine cluster', () => {
    // "Points 1 and 2 define the corners of the symbol." / "Points 1 and 2 determine the
    //  length of the straight line. The radius of the semicircle is 1/2 the length of the
    //  straight line."
    const geographic = (): MultiLineString =>
        renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name: TacticalGraphicName.MineCluster}},
            geometry: {type: 'LineString', coordinates: [[-77.0, 38.9], [-76.6, 38.9]]},
        }).graphic.geometry as MultiLineString;

    const meters = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

    it('raises the dome to half the chord, so it is a true semicircle', () => {
        const [chord, dome] = geographic().coordinates;
        const span = meters(chord[0], chord[1]);
        const chordMid: Position = [(chord[0][0] + chord[1][0]) / 2, (chord[0][1] + chord[1][1]) / 2];
        const apex = dome[Math.floor(dome.length / 2)];

        // A bow of any other depth would still look like a dome, which is the point.
        // Checked as a ratio: the dome is walked as a chain of geodesics, so the apex
        // misses the planar half-chord by about a tenth of a percent at this size.
        expect(meters(chordMid, apex) / span).toBeCloseTo(0.5, 2);
    });

    it('stands the dome on the right of point 1 → point 2, as the template draws it', () => {
        const [chord, dome] = geographic().coordinates;
        const apex = dome[Math.floor(dome.length / 2)];
        // The chord runs west → east here, so the right-hand side is south.
        expect(apex[1]).toBeLessThan(chord[0][1]);
    });

    // "Note: The dashed lines in this symbol shall be displayed in present and anticipated
    //  status."
    it('breaks its line work whatever the status says', () => {
        const domed: PaintFeature = {
            geometry: {type: 'MultiLineString', coordinates: [EAST, [[0, 0], [20_000, 20_000], [40_000, 0]]]},
            properties: {name: TacticalGraphicName.MineCluster, status: TacticalGraphicStatus.present},
        };
        const [paint] = mineClusterPaint()(domed, context());
        expect(paint.stroke?.dashPx?.length).toBeGreaterThan(0);
    });
});

describe('APP-06 290101 — the mineline is a string of mines', () => {
    // The Example draws the line strung with mines, which is the whole symbol, and the
    // Template's `Modifier 1` box says which mine. @see minelinePaint
    const mines = (resolution: number, mineType?: TacticalGraphicMineType) => {
        // Everything but the drawn line itself, which is paint 0, and the two letters.
        const paints = minelinePaint(TacticalGraphicName.Mineline)(
            feature(TacticalGraphicName.Mineline, EAST, {mineType}), context(resolution),
        );
        return paints.slice(1).filter(paint => !paint.text);
    };

    /** Every coordinate in a mark, flattened. */
    const points = (paint: Paint): ProjectedPosition[] => {
        const out: ProjectedPosition[] = [];
        const walk = (value: unknown): void => {
            if (!Array.isArray(value)) return;
            if (typeof value[0] === 'number') return void out.push(value as ProjectedPosition);
            value.forEach(walk);
        };
        walk((paint.geometry as {coordinates: unknown}).coordinates);
        return out;
    };

    it('strings a row of mines along the line', () => {
        const marks = mines(40);
        expect(marks.length).toBeGreaterThan(3);
        // Filled discs by default is the *antitank* mine; the unspecified one is hollow,
        // and that is the default here as it is inside the two areas.
        expect(marks.every(m => m.fill)).toBe(false);
    });

    it('draws whichever mine Modifier 1 names', () => {
        // Table 8-24's own difference between two of the seven: the antipersonnel mine is
        // a filled disc with antennae, the plain antitank one is a bare filled disc.
        const antitank = mines(40, TacticalGraphicMineType.antitank).length;
        const antipersonnel = mines(40, TacticalGraphicMineType.antipersonnel).length;
        expect(antipersonnel).toBeGreaterThan(antitank);
    });

    it('sits every mine on the line and inside it', () => {
        for (const mark of mines(40, TacticalGraphicMineType.antitank)) {
            const xs = points(mark).map(([x]) => x);
            expect(Math.min(...xs)).toBeGreaterThan(-2_000);
            expect(Math.max(...xs)).toBeLessThan(42_000);
        }
    });

    it('fits a whole number of them, centred, so neither end is ragged', () => {
        const centres = mines(40, TacticalGraphicMineType.antitank).map(mark => {
            const xs = points(mark).map(([x]) => x);
            return (Math.min(...xs) + Math.max(...xs)) / 2;
        });
        expect(centres[0]).toBeCloseTo(40_000 - centres[centres.length - 1], 6);
    });

    it('shrinks the mines against the line, not against the zoom', () => {
        const width = (resolution: number) => {
            const first = mines(resolution, TacticalGraphicMineType.antitank)[0];
            if (!first) return 0;
            const xs = points(first).map(([x]) => x);
            return (Math.max(...xs) - Math.min(...xs)) / resolution;
        };
        expect(width(4_000)).toBeLessThan(width(40));
    });
});

describe('APP-06 290500 — trip wire', () => {
    it('puts the stake at point 1 and leaves point 2 bare', () => {
        const paints = tripWirePaint()(feature(TacticalGraphicName.TripWire), context());
        const glyph = lines(paints).filter(path => path !== EAST);
        // The stem and the tail; the wire itself is the third run and reaches both ways.
        const stake = glyph.filter(path => Math.max(...path.map(([x]) => x)) < 30_000);

        // Every stroke of the stake stays well short of point 2 — the far end is where the
        // mine sits, and the mine is not part of the control measure.
        const xs = stake.flat().map(([x]) => x);
        expect(xs.length).toBeGreaterThan(0);
        expect(Math.max(...xs)).toBeLessThan(40_000);
    });

    // "The distance between the line connecting points 1 and 2 is the length of the trip
    //  wire connected to the mine."
    it('holds the template ratio: the wire is twice its own crossbar', () => {
        // The stake used to be a screen constant, so on a long wire the crossbar came out
        // a seventh of it and on a short one nearly half. The glyph table is written in
        // units of point 1 → point 2, and now so is the glyph. (User's call, 2026-08-27.)
        for (const resolution of [10, 40, 900]) {
            const runs = lines(tripWirePaint()(feature(TacticalGraphicName.TripWire), context(resolution)))
                .filter(path => path !== EAST);
            const span = (path: ProjectedPosition[]) =>
                Math.max(...path.map(([x]) => x)) - Math.min(...path.map(([x]) => x));
            // The wire is the drawn line *plus* the arm mirrored beyond point 1, so it is
            // measured across both rather than off the one run this paint adds.
            const xs = [...runs.flat(), ...EAST].map(([x]) => x);
            const wire = Math.max(...xs) - Math.min(...xs);
            // The crossbar is the one run that sits entirely above the wire.
            const crossbar = span(runs.find(r => r.every(([, y]) => y > 0))!);
            expect(wire / crossbar).toBeCloseTo(2.1, 1);
        }
    });

    it('crosses the wire rather than sitting on one side of it', () => {
        const paints = tripWirePaint()(feature(TacticalGraphicName.TripWire), context());
        const ys = lines(paints).flat().map(([, y]) => y);
        expect(Math.max(...ys)).toBeGreaterThan(0);
        expect(Math.min(...ys)).toBeLessThan(0);
    });

    // "Points 1 and 2 determine the length and orientation of the line drawn from the
    //  physical mine to the end of the trip wire."
    it('runs as far past point 1 as point 2 is beyond it, at every zoom', () => {
        // The stake stands at the middle of the wire. The overhang used to be a screen
        // size, so the wire was symmetrical only at the zoom that constant was tuned at —
        // and the two anchor points are what states the length. (User's call.)
        for (const resolution of [10, 40, 200, 900]) {
            const paints = tripWirePaint()(feature(TacticalGraphicName.TripWire), context(resolution));
            const xs = lines(paints).flat().map(([x]) => x);
            // Point 1 sits at the origin, point 2 at 40 km east; the wire reaches the same
            // 40 km west of point 1.
            expect(Math.min(...xs)).toBeCloseTo(-40_000, 3);
        }
    });
});

describe('APP-06 290800 — raft site', () => {
    // "Points 1 and 2 define the tips of the arrowheads." / "The lines of the arrowhead
    //  will form an acute angle."
    it('draws two barbs at each end', () => {
        const paints = raftSitePaint()(feature(TacticalGraphicName.RaftSite), context());
        // One shaft plus four barbs.
        expect(lines(paints)).toHaveLength(5);
    });

    it('stops each barb at the tip, so the shaft stays clean', () => {
        // The template draws a plain Y at each end: two strokes leaving the tip outward,
        // and nothing on the shaft side of it. They used to run a quarter of their length
        // through the tip, which put a cross there — a perfectly plausible arrowhead, and
        // not this symbol. @see raftSitePaint
        const paints = raftSitePaint()(feature(TacticalGraphicName.RaftSite), context());
        const barbs = lines(paints).filter(path => path !== EAST);
        expect(barbs).toHaveLength(4);

        const atStart = barbs.filter(path => path.every(([x]) => x < 20_000));
        expect(atStart).toHaveLength(2);
        for (const barb of atStart) {
            // Point 1 is at the origin and the shaft runs east, so nothing may reach east.
            expect(Math.max(...barb.map(([x]) => x))).toBeLessThanOrEqual(1e-9);
        }
        for (const barb of barbs.filter(path => path.some(([x]) => x > 20_000))) {
            expect(Math.min(...barb.map(([x]) => x))).toBeGreaterThanOrEqual(40_000 - 1e-9);
        }
    });

    it('keeps the two barbs inside an acute angle', () => {
        const paints = raftSitePaint()(feature(TacticalGraphicName.RaftSite), context());
        const barbs = lines(paints).filter(path => path.every(([x]) => x < 20_000) && path !== EAST);
        const heading = (path: ProjectedPosition[]) =>
            Math.atan2(path[1][1] - path[0][1], path[1][0] - path[0][0]);
        // Wrapped to [0, 180): both barbs now leave the tip heading roughly *west*, so a
        // raw difference straddles the atan2 branch cut and reads 284 degrees for a fork
        // that is 76 degrees wide.
        const raw = Math.abs(heading(barbs[0]) - heading(barbs[1])) * (180 / Math.PI);
        const between = raw > 180 ? 360 - raw : raw;
        expect(between).toBeLessThan(90);
        expect(between).toBeGreaterThan(0);
    });
});

describe('APP-06 291000 — fortified position', () => {
    // "Points 1 and 2 define the corners on the front of the symbol." / "Points 1 and 2
    //  determine the length of the symbol, which varies only in length."
    const bracket = (resolution: number): ProjectedPosition[] => {
        const paints = fortifiedPositionPaint()(feature(TacticalGraphicName.FortifiedPosition), context(resolution));
        return (paints[0].geometry as LineString).coordinates as ProjectedPosition[];
    };

    it('adds one leg at each end and keeps the drawn edge as the front', () => {
        const path = bracket(40);
        expect(path).toHaveLength(4);
        expect(path[1]).toEqual(EAST[0]);
        expect(path[2]).toEqual(EAST[1]);
    });

    it('sends both legs to the same side, the right of point 1 → point 2', () => {
        const [legA, , , legB] = bracket(40);
        // Drawn west → east, so the right-hand side is south. Legs on opposite sides
        // would read as a zigzag rather than a position, and the symbol has a front.
        expect(legA[1]).toBeLessThan(0);
        expect(legB[1]).toBeLessThan(0);
        expect(legA[1]).toBeCloseTo(legB[1], 6);
    });

    it('holds the legs at a constant screen depth rather than a share of the front', () => {
        // "Varies only in length" — so zooming in must not deepen the bracket on screen.
        // Halving the resolution halves the depth in meters, which is the same pixels.
        const fine = Math.abs(bracket(20)[0][1]);
        const coarse = Math.abs(bracket(40)[0][1]);
        expect(coarse).toBeCloseTo(fine * 2, 6);
    });
});
