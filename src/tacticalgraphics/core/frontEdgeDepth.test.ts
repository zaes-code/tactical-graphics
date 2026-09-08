/**
 * # A synthesised three-point base is as deep as it is long
 *
 * The nineteen graphics whose points are a front edge and a distance across it — the
 * block family, the retrogrades, the two passages, the explosives set — had that distance
 * set to 0.55 of the half-run, which is 0.275 of the edge. Drawn on a sheet they read as a
 * long bar with a short nub under it, and the nub is the part that says which task it is.
 *
 * The rule now is the one the user stated on 2026-09-07: *"point 3 distance from line 1,2
 * needs to be = to the length of 1,2"*.
 *
 * **Asserted as a distance, never as the constant.** `expect(FRONT_EDGE_ACROSS).toBe(2)`
 * would pass for whatever the constant held and prove nothing about the shape — which is
 * exactly how 0.55 went unexamined. Everything below measures the figure.
 *
 * The second half of the file is the part that only a *distance* target can catch. A ratio is
 * unit-free, so the same number applied to a degree layout and to a metre layout draws two
 * different shapes: a degree of longitude is `cos(latitude)` of a degree of latitude on the
 * ground. The MapLibre sweep lays out in degrees and the OpenLayers sweep in projected
 * metres, so before this the same graphic was 0.275 deep at the equator and 1.037 deep at
 * 75°N — the rule inverted between the top and the bottom of one sheet.
 */
import type {Position} from 'geojson';
import {FRONT_EDGE_ACROSS_RULE, synthesizedBase, usesFrontEdgeBase} from './drawnBase';
import {baseVertexCount, handlesAreInert} from './handles';
import {TacticalGraphicName} from './type';

/** Web-Mercator forward, so a degree layout is measured the way both sheets draw it. */
const R = 6378137;
const merc = ([lon, lat]: Position): Position => [
    (R * lon * Math.PI) / 180,
    R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];

const hyp = (a: Position, b: Position) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Perpendicular distance from `p` to the infinite line through `a` and `b`. */
const perp = (a: Position, b: Position, p: Position) =>
    Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / hyp(a, b);

/** Compass bearing of the edge, 0 north and 90 east, for asserting the diagonal. */
const axisDegrees = (base: Position[]) =>
    ((Math.atan2(base[1][0] - base[0][0], base[1][1] - base[0][1]) * 180) / Math.PI + 360) % 360;

/** The figure's depth as a share of its own edge — the number the rule is about. */
const depthOverLength = (base: Position[]) => perp(base[0], base[1], base[2]) / hyp(base[0], base[1]);

/**
 * The graphics `frontEdgeBase` actually serves, found by asking which ones respond to the
 * ratio rather than by listing names here — a list would drift from the routing it describes.
 * Both fords and 152000 attack by fire read `usesFrontEdgeBase` too but are answered earlier
 * by layouts of their own, and those are signed off as they are.
 *
 * The roadblock is left out for a different reason, and it took a rendered sheet to see it:
 * it is dropped in one click and builds its own three points, so it never draws a front edge
 * for the rule to be about. `synthesizedBase` answers for it — which is why asserting that
 * function alone reported it at a tidy 1.000 while the sweep drew it at 0.070. Measuring the
 * function is not measuring the symbol. @see synthesizedBase, handlesAreInert
 */
const SERVED = (Object.values(TacticalGraphicName) as TacticalGraphicName[]).filter(name => {
    if (!usesFrontEdgeBase(name) || (baseVertexCount(name) ?? 3) !== 3) return false;
    // Dropped, not drawn: its points come from its own anchor rule, never from an edge.
    if (handlesAreInert(name)) return false;
    // Both ratios stated outright rather than one of them left to the default. Written
    // against the default, this filter empties out the moment the default changes — which
    // makes every per-graphic assertion below *disappear* instead of failing, and a control
    // run that removes the tests proves nothing. Found by running exactly that control.
    const single = synthesizedBase(name, [0, 0], 91_800, 3, 1);
    const doubled = synthesizedBase(name, [0, 0], 91_800, 3, 2);
    return !!single && !!doubled && Math.abs(perp(doubled[0], doubled[1], doubled[2]) - 2 * perp(single[0], single[1], single[2])) < 1;
});

describe('the depth of a synthesised front-edge base', () => {
    it('governs the nineteen graphics whose third point states a distance', () => {
        // A count, so that a graphic silently leaving the family is visible here rather than
        // only in a picture. Left out: the three with their own stated layouts, the
        // roadblock, which is dropped rather than drawn, and the three explosives states of
        // readiness, which state their own width and their own diagonal.
        expect(SERVED).toHaveLength(19);
        expect(SERVED).not.toContain(TacticalGraphicName.ExplosivesStateOfReadiness1Safe);
        expect(SERVED).not.toContain(TacticalGraphicName.RoadblockCompleteExecuted);
        expect(SERVED).toContain(TacticalGraphicName.Canalize);
        expect(SERVED).toContain(TacticalGraphicName.Block);
        expect(SERVED).toContain(TacticalGraphicName.Pursuit);
        expect(SERVED).not.toContain(TacticalGraphicName.FordEasy);
        expect(SERVED).not.toContain(TacticalGraphicName.AttackByFire);
    });

    it.each(SERVED)('puts %s point 3 a full edge-length off the line 1→2', name => {
        // The OpenLayers sweep's units: EPSG:3857 metres, where a ratio is already a distance.
        const base = synthesizedBase(name, [0, 0], 91_800, 3)!;
        expect(depthOverLength(base)).toBeCloseTo(FRONT_EDGE_ACROSS_RULE, 6);
    });

    it('holds whatever half-run it is given', () => {
        // The rule is a proportion, so it must survive a change of scale — a sheet that draws
        // one graphic on a longer run must not draw it a different shape.
        for (const half of [1_000, 91_800, 4_000_000]) {
            const base = synthesizedBase(TacticalGraphicName.Canalize, [0, 0], half, 3)!;
            expect(depthOverLength(base)).toBeCloseTo(FRONT_EDGE_ACROSS_RULE, 6);
        }
    });

    it('measures the same on a degree layout, at every latitude the sweep reaches', () => {
        // The MapLibre sweep's units. Without `degreeLayout` this is the assertion that fails
        // at the poleward end while passing at the equator — one constant, two shapes.
        for (const lat of [0, 20, 41, 60, 75, 80]) {
            const base = synthesizedBase(TacticalGraphicName.Canalize, [12, lat], 1.4, 3, undefined, true)!;
            // Tolerance is Mercator's own scale change over the figure's height, not slack in
            // the rule: the residual grows with latitude and is 2.3% at the sheet's top row.
            expect(depthOverLength(base.map(merc))).toBeCloseTo(FRONT_EDGE_ACROSS_RULE, 1);
        }
    });

    it('draws the same shape on both sheets, which is what a shared statement is for', () => {
        for (const name of SERVED) {
            const metres = depthOverLength(synthesizedBase(name, [0, 0], 91_800, 3)!);
            const degrees = depthOverLength(synthesizedBase(name, [12, 41], 1.4, 3, undefined, true)!.map(merc));
            expect(degrees).toBeCloseTo(metres, 1);
        }
    });

    it('draws the explosives family as a narrow band on the diagonal', () => {
        /*
         * 271201-3 read *"Points 1 and 2 determine the centreline of the symbol and point 3
         * determines its width"* — a width, not a depth — and both the Template and the
         * Example draw the band across the road it blocks rather than along it. A fifth of
         * the run, at 45 degrees. (User's call, 2026-09-07.)
         *
         * Asserted in both unit systems, because the rotation is applied in shape space and
         * the degree correction after it: get that order wrong and the angle is right in
         * metres and wrong at every latitude.
         */
        for (const name of [
            TacticalGraphicName.ExplosivesPlannedStateOfReadiness,
            TacticalGraphicName.ExplosivesStateOfReadiness1Safe,
            TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable,
        ]) {
            const metres = synthesizedBase(name, [0, 0], 91_800, 3)!;
            expect(depthOverLength(metres)).toBeCloseTo(1 / 5, 3);
            expect(axisDegrees(metres)).toBeCloseTo(45, 1);

            const degrees = synthesizedBase(name, [12, 41], 1.4, 3, undefined, true)!.map(merc);
            expect(depthOverLength(degrees)).toBeCloseTo(1 / 5, 2);
            expect(axisDegrees(degrees)).toBeCloseTo(45, 1);
        }
    });

    it('leaves the rest of the family axis-aligned', () => {
        // The diagonal is the explosives', not the family's.
        expect(axisDegrees(synthesizedBase(TacticalGraphicName.Canalize, [0, 0], 91_800, 3)!)).toBeCloseTo(90, 1);
    });

    it('leaves a caller that states its own depth alone', () => {
        // The catalog and the picker each name a number, because a tile cannot spend the
        // sweep's depth. They must not be dragged along by the default.
        const tile = synthesizedBase(TacticalGraphicName.Block, [0, 0], 91_800, 3, 0.85)!;
        expect(depthOverLength(tile)).toBeCloseTo(0.85 / 2, 6);
    });
});
