/**
 * # The three obstacle bypasses
 *
 * One construction and three rear bars. The rectangle is easy to get *nearly* right —
 * three anchor points will produce a plausible shape however they are combined — so the
 * geometry block below pins what the draw rule actually says, and the paint block pins the
 * one thing that distinguishes the three from each other.
 */

import type {Feature, MultiLineString, Position} from 'geojson';
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import * as turf from '../core/turf';
import {renderTacticalGraphic} from '../core/render';
import {normalizeDrawnBase} from '../core/drawnBase';
import {anchorVertex} from '../core/handles';
import {TacticalGraphicHostility, TacticalGraphicName} from '../core/type';
import {getDefaultLineColor, supportsHostility} from '../core/symbology';
import {resetTacticalGraphicsConfig} from '../core/config';
import {obstacleBypassPaint} from './obstacleBypassPaints';

const context = (resolution = 400): PaintContext => ({
    resolution,
    measureText: (text, font) => {
        const px = parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16');
        return text.length * px * 0.6;
    },
});

/** Upper tip, lower tip, rear. */
const POINTS: Position[] = [[-76.0, 39.1], [-76.0, 38.7], [-77.0, 38.9]];

const meters = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

const built = (name: TacticalGraphicName, coordinates: Position[] = POINTS): MultiLineString =>
    renderTacticalGraphic({
        type: 'Feature',
        properties: {tacticalGraphic: {name}},
        geometry: {type: 'LineString', coordinates},
    } as Feature).graphic.geometry as MultiLineString;

const HALF_WORLD = 20037508.34;
const project = ([lon, lat]: Position): ProjectedPosition => [
    (lon * HALF_WORLD) / 180,
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * HALF_WORLD) / Math.PI,
];

const painted = (name: TacticalGraphicName, properties: Record<string, unknown> = {}): Paint[] =>
    obstacleBypassPaint(name)({
        geometry: {
            type: 'MultiLineString',
            coordinates: built(name).coordinates.map(part => part.map(project)),
        },
        properties: {name, ...properties},
    } as PaintFeature, context());

/** The rear-bar paint: the second stroke, whatever form it took. */
const rearBar = (paints: Paint[]): ProjectedPosition[][] =>
    (paints[1].geometry as {coordinates: ProjectedPosition[][]}).coordinates;

beforeEach(() => resetTacticalGraphicsConfig());

describe('APP-06 270601/2/3 — the obstacle bypasses', () => {
    // "Points 1 and 2 define the tips of the arrowheads and point 3 defines the rear of
    //  the symbol."
    it('ends the two parallel lines exactly on points 1 and 2', () => {
        const [upper, lower] = built(TacticalGraphicName.ObstacleBypassEasy).coordinates;
        expect(meters(upper[upper.length - 1], POINTS[0])).toBeLessThan(1);
        expect(meters(lower[lower.length - 1], POINTS[1])).toBeLessThan(1);
    });

    // "The vertical line at the rear of the symbol shall be the same length as the opening
    //  and shall be perpendicular to the parallel lines."
    it('makes the rear bar the same length as the opening', () => {
        const [, , bar] = built(TacticalGraphicName.ObstacleBypassEasy).coordinates;
        const opening = meters(POINTS[0], POINTS[1]);
        expect(meters(bar[0], bar[1]) / opening).toBeCloseTo(1, 2);
    });

    it('keeps the rear bar perpendicular to the two lines', () => {
        const [upper, , bar] = built(TacticalGraphicName.ObstacleBypassEasy).coordinates;
        const along = turf.bearing(turf.point(upper[0]), turf.point(upper[1]));
        const across = turf.bearing(turf.point(bar[0]), turf.point(bar[1]));
        const between = Math.abs((((along - across) % 360) + 540) % 360 - 180);
        expect(between).toBeCloseTo(90, 0);
    });

    it('squares the shape even when point 3 is placed off the axis', () => {
        // A skewed point 3 should shorten the symbol, not shear it into a parallelogram —
        // the rule fixes the bar perpendicular, so only its *length* is point 3's to set.
        const skewed: Position[] = [POINTS[0], POINTS[1], [-77.0, 39.6]];
        const [upper, lower] = built(TacticalGraphicName.ObstacleBypassEasy, skewed).coordinates;
        expect(meters(upper[0], upper[1])).toBeCloseTo(meters(lower[0], lower[1]), 0);
    });

    /*
     * **Where point 3 is *stored*, which is a different question from what it draws.**
     *
     * The generator has always dropped the click's along-opening component with a
     * `cos(skew)`, so the picture was right whatever was stored and no assertion above this
     * one could see the defect. What the raw click changed was the grip: the plate's PT.3
     * leader lands on the middle of the rear bar, and the handle sat out beside the symbol
     * at wherever the operator released. (User's report, 2026-09-06: "obstacle center handle
     * (point 3) [...] is not centered on that line but rather where user clicked".)
     */
    const THREE = [
        TacticalGraphicName.ObstacleBypassEasy,
        TacticalGraphicName.ObstacleBypassDifficult,
        TacticalGraphicName.ObstacleBypassImpossible,
    ];

    it.each(THREE)('stores point 3 at the middle of the rear bar — %s', name => {
        // A third click slid a long way *along* the opening's own direction — the component
        // the symbol has nowhere to put.
        const strayed = turf.destination(turf.point(POINTS[2]), 30_000, 0, {units: 'meters'})
            .geometry.coordinates as Position;
        const stored = normalizeDrawnBase(name, [POINTS[0], POINTS[1], strayed]);

        expect(stored).toHaveLength(3);
        expect(meters(stored[0], POINTS[0])).toBeLessThan(1);
        expect(meters(stored[1], POINTS[1])).toBeLessThan(1);
        // The grip lands on the rear bar's midpoint, not on the click.
        const [, , bar] = built(name, stored).coordinates;
        const middle = turf.midpoint(turf.point(bar[0]), turf.point(bar[1])).geometry.coordinates as Position;
        expect(meters(stored[2], middle)).toBeLessThan(meters(POINTS[0], POINTS[1]) / 100);
        expect(meters(stored[2], strayed)).toBeGreaterThan(20_000);
    });

    it.each(THREE)('leaves the length the click asked for while it squares it — %s', name => {
        // Squaring the point must not shorten the symbol: only the along-opening drift is
        // dropped, and the drift is perpendicular to the length.
        const square = normalizeDrawnBase(name, POINTS);
        const strayed = turf.destination(turf.point(POINTS[2]), 30_000, 0, {units: 'meters'})
            .geometry.coordinates as Position;
        const slid = normalizeDrawnBase(name, [POINTS[0], POINTS[1], strayed]);
        const length = (base: Position[]) =>
            meters(base[2], turf.midpoint(turf.point(base[0]), turf.point(base[1])).geometry.coordinates as Position);
        /*
         * **A share of the symbol, not an exact match, and the residual is spherical.** The
         * decomposition is planar — `reach * sin(toClick - axis)` — applied to geodesic
         * bearings, so a 30 km slide leaves about 330 m on an 86 km symbol, four tenths of
         * one percent. What matters is the order: an unprojected reading would carry the
         * whole slide into the length. The same residual `sideAnchors` leaves the bracket
         * tasks. @see bracketTasks.test.ts
         */
        expect(Math.abs(length(slid) - length(square)) / length(square)).toBeLessThan(0.01);
    });

    it.each(THREE)('reads a base it has already stored the same way — %s', name => {
        // Idempotent, or every rebuild would walk the rear point somewhere new.
        const once = normalizeDrawnBase(name, POINTS);
        const twice = normalizeDrawnBase(name, once);
        once.forEach((point, i) => expect(meters(twice[i], point)).toBeLessThan(1));
    });

    it.each(THREE)('keeps every one of the three grips live — %s', name => {
        /*
         * **No anchor vertex.** OpenLayers declared point 3 one until 2026-09-06, which made
         * it inert under a reshape — so the grip the plate gives the symbol's length,
         * *"point 3 determines its length"*, was the one grip that could not change it, and
         * MapLibre (which asks here) disagreed. (User's report: "it is not letting the user
         * drag to lengthen the graphic".)
         */
        expect(anchorVertex(name)).toBeUndefined();
    });

    it('draws bare vertices until all three points are placed', () => {
        const partial = built(TacticalGraphicName.ObstacleBypassEasy, POINTS.slice(0, 2));
        expect(partial.coordinates).toHaveLength(1);
    });

    it('tells the three apart by the rear bar alone', () => {
        const easy = rearBar(painted(TacticalGraphicName.ObstacleBypassEasy));
        const difficult = rearBar(painted(TacticalGraphicName.ObstacleBypassDifficult));
        const impossible = rearBar(painted(TacticalGraphicName.ObstacleBypassImpossible));

        // Straight: one run of two points.
        expect(easy).toHaveLength(1);
        expect(easy[0]).toHaveLength(2);
        // Zigzag: one run that wanders off the straight line between its ends.
        expect(difficult).toHaveLength(1);
        expect(difficult[0].length).toBeGreaterThan(2);
        // Broken: two stubs, each closed by a tick, so four runs and a gap between them.
        expect(impossible).toHaveLength(4);
    });

    it('leaves a real gap in the impossible bar rather than only marking it', () => {
        const runs = rearBar(painted(TacticalGraphicName.ObstacleBypassImpossible));
        const bar = built(TacticalGraphicName.ObstacleBypassImpossible).coordinates[2].map(project);
        const full = Math.hypot(bar[1][0] - bar[0][0], bar[1][1] - bar[0][1]);
        // Runs 0 and 2 are the stubs; 1 and 3 are their ticks.
        const drawn = [runs[0], runs[2]]
            .reduce((t, run) => t + Math.hypot(run[1][0] - run[0][0], run[1][1] - run[0][1]), 0);
        expect(drawn).toBeLessThan(full * 0.95);
        expect(drawn).toBeGreaterThan(full * 0.6);
    });

    // "Obstacle bypass symbols indicate a mobility function and should be rendered in
    //  black."
    it('refuses the identity color, even when a file arrives carrying one', () => {
        for (const name of [
            TacticalGraphicName.ObstacleBypassEasy,
            TacticalGraphicName.ObstacleBypassDifficult,
            TacticalGraphicName.ObstacleBypassImpossible,
        ]) {
            expect(supportsHostility(name)).toBe(false);
            // Hiding the dialog control is only half the rule — this is the other half.
            const paints = painted(name, {hostility: TacticalGraphicHostility.hostileFaker});
            expect(paints[0].stroke?.color).toBe(getDefaultLineColor());
        }
    });
});
