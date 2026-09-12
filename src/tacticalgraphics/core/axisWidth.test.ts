/**
 * # The eleven axis arrows keep their width as a coordinate
 *
 * > **152300 avenue of approach.** The symbol requires N anchor points, where N is between 3
 * > and 50. Point 1 defines the tip of the arrowhead. Point N-1 defines the rear of the symbol.
 * > Point N defines the back of the arrowhead.
 * >
 * > **Size/Shape.** Points 1 through N-1 and 2 determine the symbol's centreline and Point N
 * > determines the width.
 *
 * The sentence is word for word the same on all eleven, and `drawOrder.ts` has recorded the
 * divergence since the bases were renumbered: *"APP-06 spends its last point on the arrow's
 * width; this library carries width as a `width` amplifier in metres instead."* Closed on
 * 2026-09-10.
 *
 * What is asserted here is the pair of properties that make a coordinate a safe place to keep
 * a number: **it reads back as what was written**, and **a rebuild does not move it**. Neither
 * was free — the point is placed where the ink is, through a projected offset, and read back
 * geodesically, and the two disagree by 0.13% on a straight axis at 40 degrees north and 48%
 * on a bent one at 65. Uncorrected, a graphic narrowed a little every time anything touched
 * it: 10000 m, then 9981, then 9963, then 9944.
 */
import type {Feature, MultiPoint, Position} from 'geojson';
import * as turf from './turf';
import {renderTacticalGraphic} from './render';
import {normalizeDrawnBase} from './drawnBase';
import {carriesSeparationInBase, handleRole, pivotVertexIndex, rotationAnchor, acceptsInsertedVertex} from './handles';
import {anchorConnectorRun} from './symbology';
import {TacticalGraphicName} from './type';
import {
    axisBaseFromDraw,
    axisOf,
    axisWithWidthPoint,
    carriesWidthPointInBase,
    halfWidthFromBase,
    squareWidthPoint,
    upgradeAxisBase,
    widthPointOf,
} from './axisWidth';

/** The eleven, listed here rather than read out of the module the test is about. */
const FAMILY = [
    TacticalGraphicName.AviationAxisOfAdvance,
    TacticalGraphicName.AttackHelicopterAxisOfAdvance,
    TacticalGraphicName.MainAxisOfAdvance,
    TacticalGraphicName.SupportingAxisOfAdvance,
    TacticalGraphicName.MainAxisOfAdvanceFeint,
    TacticalGraphicName.AvenueOfApproach,
    TacticalGraphicName.FrontalAttack,
    TacticalGraphicName.TurningMovement,
    TacticalGraphicName.Counterattack,
    TacticalGraphicName.CounterattackByFire,
    TacticalGraphicName.AdvanceToContact,
];

/** A bent three-click axis, tip first, and a straight two-click one. */
const BENT: Position[] = [[1, 40], [0, 40.35], [-1.4, 40.1]];
const STRAIGHT: Position[] = [[1, 40], [-1.4, 40]];
const HALF_WIDTH = 24_000;

const metres = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

const each = FAMILY.map(n => [String(n), n] as const);

describe('the axis arrows carry their width as their last coordinate', () => {
    it.each(each)('%s says so, and says it once', (_label, name) => {
        expect(carriesWidthPointInBase(name)).toBe(true);
        // The predicate every renderer already asks before stamping a width beside a base.
        expect(carriesSeparationInBase(name)).toBe(true);
    });

    it.each(each)('%s: a written half-width reads back as itself', (_label, name) => {
        for (const axis of [BENT, STRAIGHT]) {
            for (const half of [4_000, HALF_WIDTH, 90_000]) {
                const base = axisWithWidthPoint(name, axis, half);
                expect(base).toHaveLength(axis.length + 1);
                // **Relative, because the claim is relative.** The calibration stops when what
                // reads back is within a billionth of what was asked for; the 90 km case is an
                // arrow wider than it is long, where the trim runs off the end of the axis and
                // the loop lands at 3.3e-5 instead. Nothing a reader could measure on a map,
                // and stated as a bound rather than rounded away.
                expect(Math.abs(halfWidthFromBase(name, base)! - half) / half).toBeLessThan(1e-4);
            }
        }
    });

    /**
     * At 65 degrees north the uncorrected placement was 48% out on a bent axis — the projected
     * offset that draws the rail is `1/cos(latitude)` of a ground one. The calibration is what
     * makes the same claim hold there as at the equator.
     */
    it.each(each)('%s: and still reads back at 65 degrees north', (_label, name) => {
        const high: Position[] = [[1, 65], [0, 65.3], [-1.4, 65.1]];
        const base = axisWithWidthPoint(name, high, HALF_WIDTH);
        expect(Math.abs(halfWidthFromBase(name, base)! - HALF_WIDTH) / HALF_WIDTH).toBeLessThan(1e-4);
    });

    it.each(each)('%s: a rebuild does not move the point', (_label, name) => {
        let base = axisWithWidthPoint(name, BENT, HALF_WIDTH);
        const first = base[base.length - 1];
        for (let pass = 0; pass < 5; pass++) {
            base = normalizeDrawnBase(name, base);
            expect(base).toHaveLength(BENT.length + 1);
            expect(metres(base[base.length - 1], first)).toBeLessThan(0.01);
        }
    });

    /**
     * *"The along-axis component of a drag is discarded. Dragging N through the axis gives the
     * same width; there is no mirror."* (User's call, 2026-09-10.)
     */
    it.each(each)('%s: reads the point across the axis only, and either side of it', (_label, name) => {
        const square = axisWithWidthPoint(name, BENT, HALF_WIDTH);
        const point = widthPointOf(name, square)!;

        /*
         * Slid a long way *along* the axis and re-read: the width is unchanged.
         *
         * Within a quarter of a percent rather than exactly, and the residue is the sphere: the
         * bearing from the tip to a point 48 km off the axis is not the axis's own bearing, so
         * a 30 km step along the latter does not hold the perpendicular to the metre. Measured
         * at 33 m on 24 km, and 67 m for 151406, whose longer overhang puts the point further
         * back. The thing being ruled out is a *reading* that follows the along-axis component,
         * which would have moved this by the whole 30 km.
         */
        const bearing = turf.bearing(turf.point(BENT[0]), turf.point(BENT[1]));
        const slid = turf.destination(turf.point(point), 30_000, bearing, {units: 'meters'}).geometry.coordinates;

        expect(Math.abs(halfWidthFromBase(name, [...BENT, slid])! - HALF_WIDTH) / HALF_WIDTH).toBeLessThan(0.005);

        // Reflected through the axis: the same width again, not a mirrored graphic.
        const tip = BENT[0];
        const reflected = turf.destination(
            turf.point(tip),
            metres(tip, point),
            2 * bearing - turf.bearing(turf.point(tip), turf.point(point)),
            {units: 'meters'},
        ).geometry.coordinates;
        expect(Math.abs(halfWidthFromBase(name, [...BENT, reflected])! - HALF_WIDTH) / HALF_WIDTH).toBeLessThan(0.005);

        /*
         * And squaring either one puts it back where the canonical point is — within 1.6% of
         * the 30 km it was slid, which is the width error above re-spent as a position: a
         * half-width read 0.28% small places the corner a little nearer the tip and a little
         * nearer the axis, and the overhang multiplies the first of those. Measured at 211 m
         * for 151406 and 472 m for 340700, the two longest overhangs.
         */
        const SLIDE = 30_000;
        expect(metres(squareWidthPoint(name, [...BENT, slid])[3], point)).toBeLessThan(SLIDE * 0.02);
    });

    it.each(each)('%s: the grip the generator publishes is the stored point', (_label, name) => {
        const base = axisWithWidthPoint(name, BENT, HALF_WIDTH);
        const handles = (renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name}},
            geometry: {type: 'LineString', coordinates: base},
        } as Feature).handles.geometry as MultiPoint).coordinates;

        expect(handles).toHaveLength(3);
        expect(metres(handles[2], base[base.length - 1])).toBeLessThan(1);
        // ...and it is still the grip a renderer routes a width drag to.
        expect(handleRole(name, 2)).toBe('offset');
    });

    /**
     * The width point is at the tip end and the rear is one before it. Pivoting on the last
     * coordinate — which is what a tip-first graphic did while its base was all axis — would
     * swing the symbol about a corner of its own arrowhead.
     */
    it.each(each)('%s: turns about the rear, not about the width point', (_label, name) => {
        const base = axisWithWidthPoint(name, BENT, HALF_WIDTH);
        expect(pivotVertexIndex(name, base.length)).toBe(base.length - 2);
        const pivot = rotationAnchor({type: 'LineString', coordinates: base}, name);
        expect(metres(pivot, BENT[BENT.length - 1])).toBeLessThan(1);
    });

    /**
     * A vertex inserted between the rear and the width point splits the point off the end of
     * the array, and everything downstream then reads a route point as a width.
     */
    /**
     * The hashed construction line both engines draw in edit mode follows the *centreline*, so
     * it has to stop at the rear. Drawing the stored base whole hashed a spur out of the
     * arrowhead to the width grip, which is not a run between anchor points and no plate draws
     * it — the same defect `SIDE_POINT_AFTER_RUN` was written for, one family over.
     */
    it.each(each)('%s: the hashed connector stops before the width point', (_label, name) => {
        const base = axisWithWidthPoint(name, BENT, HALF_WIDTH);
        expect(anchorConnectorRun(name, base)).toEqual(BENT);
        // A legacy two-point base has no point to drop, so the run is the whole of it.
        expect(anchorConnectorRun(name, STRAIGHT)).toEqual(STRAIGHT);
    });

    it.each(each)('%s: refuses a vertex inserted on the run to the width point', (_label, name) => {
        // A pixel path standing in for the base: three axis points west to east, then the
        // width point off to one side of the first.
        const pixels: [number, number][] = [[400, 300], [300, 320], [200, 300], [380, 240]];
        expect(acceptsInsertedVertex(name, pixels, [350, 310])).toBe(true);
        expect(acceptsInsertedVertex(name, pixels, [290, 270])).toBe(false);
    });

    it.each(each)('%s: the graphic it draws follows the point, not an amplifier', (_label, name) => {
        const extent = (base: Position[], bag: Record<string, unknown> = {}) => {
            const out = renderTacticalGraphic({
                type: 'Feature',
                properties: {tacticalGraphic: {name, ...bag}},
                geometry: {type: 'LineString', coordinates: base},
            } as Feature);
            const xs: number[] = [];
            const ys: number[] = [];
            const walk = (node: unknown): void => {
                if (!Array.isArray(node) || !node.length) return;
                if (typeof node[0] === 'number') { xs.push(node[0] as number); ys.push(node[1] as number); return; }
                node.forEach(walk);
            };
            walk((out.graphic.geometry as {coordinates?: unknown}).coordinates);
            return Math.max(...ys) - Math.min(...ys);
        };

        const narrow = extent(axisWithWidthPoint(name, STRAIGHT, 8_000));
        const wide = extent(axisWithWidthPoint(name, STRAIGHT, 48_000));
        expect(wide).toBeGreaterThan(narrow * 1.5);

        // A `width` amplifier riding along on a base that states its own is ignored, which is
        // the whole of what stops the two drifting.
        const stale = extent(axisWithWidthPoint(name, STRAIGHT, 8_000), {width: 400_000});
        expect(stale).toBeCloseTo(narrow, 6);
    });
});

describe('a version 1 file opens, draws the same, and re-saves in the new shape', () => {
    it.each(each)('%s: derives the point from the width it filed', (_label, name) => {
        const legacy: Position[] = [...STRAIGHT];
        const upgraded = upgradeAxisBase(name, legacy, HALF_WIDTH * 2);
        expect(upgraded).toHaveLength(3);
        expect(Math.abs(halfWidthFromBase(name, upgraded)! - HALF_WIDTH) / HALF_WIDTH).toBeLessThan(1e-4);
        // The axis it was saved with is untouched: an upgrade adds a point, it does not move one.
        expect(axisOf(name, upgraded)).toEqual(legacy);
    });

    it.each(each)('%s: and draws the picture the width drew', (_label, name) => {
        const drawnFromAmplifier = renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name, width: HALF_WIDTH * 2}},
            geometry: {type: 'LineString', coordinates: STRAIGHT},
        } as Feature).graphic.geometry;

        const drawnFromPoint = renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name}},
            geometry: {type: 'LineString', coordinates: upgradeAxisBase(name, STRAIGHT, HALF_WIDTH * 2)},
        } as Feature).graphic.geometry;

        /*
         * **Close, not identical, and the gap is the calibration.** The upgrade spends a
         * slightly different half-width on the drawing so that what reads back is the one the
         * file stated — 0.13% on this axis at this latitude. Nothing a reader can see; asserted
         * as a bound rather than hidden by rounding. @see axisWithWidthPoint
         */
        const spread = (geometry: unknown) => {
            const ys: number[] = [];
            const walk = (node: unknown): void => {
                if (!Array.isArray(node) || !node.length) return;
                if (typeof node[0] === 'number') { ys.push(node[1] as number); return; }
                node.forEach(walk);
            };
            walk((geometry as {coordinates?: unknown}).coordinates);
            return Math.max(...ys) - Math.min(...ys);
        };
        const before = spread(drawnFromAmplifier);
        const after = spread(drawnFromPoint);
        expect(Math.abs(after - before) / before).toBeLessThan(0.005);
    });

    it.each(each)('%s: a base with no width at all takes the caller‘s fallback', (_label, name) => {
        expect(upgradeAxisBase(name, STRAIGHT, undefined)).toEqual(STRAIGHT);
        expect(upgradeAxisBase(name, STRAIGHT, undefined, 30_000)).toHaveLength(3);
    });

    it.each(each)('%s: a draw seeds the point from the renderer‘s own half-width', (_label, name) => {
        const seeded = axisBaseFromDraw(name, BENT, 15_000);
        expect(seeded).toHaveLength(BENT.length + 1);
        expect(Math.abs(halfWidthFromBase(name, seeded)! - 15_000) / 15_000).toBeLessThan(1e-4);
    });
});
