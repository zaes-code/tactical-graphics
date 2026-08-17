/**
 * MapLibre adapter tests.
 *
 * These exist because of one bug that appeared **twice**, once in each renderer's
 * adapter, and was caught two completely different ways.
 *
 * `AreaDefense`, `CordonAndSearch`, `Isolate` and `Retain` emit their arcs,
 * arrowheads and solid teeth as a single `GeometryCollection`. Both adapters
 * originally returned `undefined` for that type, which meant the graphic was
 * registered as paintable, threw nothing, and drew nothing.
 *
 * On the OpenLayers side the existing hostility tests failed within the hour. On
 * the MapLibre side there was no coverage at all, and it surfaced only when the
 * sample sweep reported four graphics it could not build. This file is that
 * missing coverage.
 */

import {
    PAINTABLE_GRAPHICS,
    TacticalGraphicHostility,
    TacticalGraphicName,
    anchorsForArcAndArrow,
    anchorsForBow,
    anchorsForHook,
    anchorsForRunAndArc,
    anchorsFromFrame,
    baseGeometryFor,
    getColorByHostility,
    resetTacticalGraphicsConfig,
    supportsHostility,
    usesDrawnAnchors,
} from '@zaes/tactical-graphics';
import {buildTacticalGraphic, paintTacticalGraphic, projectGeometry} from './maplibreAdapter';

const RESOLUTION = 1000;
const context = {resolution: RESOLUTION, measureText: (t: string) => t.length * 10};

beforeEach(() => resetTacticalGraphicsConfig());

describe('projectGeometry', () => {
    it('projects each geometry type, keeping its structure', () => {
        expect(projectGeometry({type: 'Point', coordinates: [0, 0]})!.type).toBe('Point');
        expect(projectGeometry({type: 'LineString', coordinates: [[0, 0], [1, 1]]})!.type).toBe('LineString');
        expect(projectGeometry({type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]]})!.type).toBe('Polygon');
    });

    it('projects a GeometryCollection rather than refusing it', () => {
        const projected = projectGeometry({
            type: 'GeometryCollection',
            geometries: [
                {type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]]]},
                {type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]]},
            ],
        });
        expect(projected?.type).toBe('GeometryCollection');
        expect((projected as {geometries: unknown[]}).geometries).toHaveLength(2);
    });

    it('converts degrees to projected meters', () => {
        // 180° east is half the projected world — the one value worth pinning, since
        // a wrong radius or a degrees/radians slip would still produce plausible
        // numbers everywhere else.
        const point = projectGeometry({type: 'Point', coordinates: [180, 0]});
        expect((point as {coordinates: [number, number]}).coordinates[0]).toBeCloseTo(20037508.34, 1);
    });
});

describe('buildTacticalGraphic', () => {
    /**
     * Every graphic the registry claims to paint must actually build.
     *
     * This is the assertion that would have caught the GeometryCollection bug: all
     * four affected graphics were registered, so `isPaintable` said yes, and the
     * adapter then returned `undefined` for every one of them.
     */
    it('builds every paintable graphic from a base it accepts', () => {
        const failed: TacticalGraphicName[] = [];

        for (const name of PAINTABLE_GRAPHICS) {
            const candidates = [
                {type: 'LineString' as const, coordinates: [[-2, 0], [2, 0]]},
                {type: 'Polygon' as const, coordinates: [[[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]]]},
                {type: 'Point' as const, coordinates: [0, 0]},
            ];
            // `rotation` is not optional in practice: the point-anchored generators feed
            // it into Math.cos/sin, and undefined yields NaN coordinates that turf
            // refuses — which reads as "the graphic just didn't draw".
            const built = candidates
                .map(geometry => buildTacticalGraphic(name, geometry, {radius: 180_000, rotation: 0}))
                .find(Boolean);
            if (!built) failed.push(name);
        }

        expect(failed).toEqual([]);
    });

    it('paints marks for every graphic it builds', () => {
        const blank: TacticalGraphicName[] = [];

        for (const name of PAINTABLE_GRAPHICS) {
            const candidates = [
                {type: 'LineString' as const, coordinates: [[-2, 0], [2, 0]]},
                {type: 'Polygon' as const, coordinates: [[[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]]]},
                {type: 'Point' as const, coordinates: [0, 0]},
            ];
            const built = candidates
                .map(geometry => buildTacticalGraphic(name, geometry, {radius: 180_000, rotation: 0}))
                .find(Boolean);
            if (!built) continue;
            if (!paintTacticalGraphic(built, context).length) blank.push(name);
        }

        expect(blank).toEqual([]);
    });

    /**
     * A symbol that carries a real size must render at it, and a pinned one must not.
     *
     * The distinction is invisible at the zoom a graphic was placed at — both look right —
     * so it only shows as "the symbol did not change when I zoomed", which reads as the map
     * working rather than as a defect. Interdict, neutralize and suppress became resizable
     * on 2026-08-17 and *still came out pinned*, because `crossedMissionTaskSize` replaced
     * the caller's radius on the way in: the size was stored, the handle moved, and the
     * symbol came back the same width.
     */
    it('scales a resizable symbol with the map and holds a pinned one still', () => {
        const widthPx = (name: TacticalGraphicName, resolution: number): number => {
            const built = buildTacticalGraphic(
                name, {type: 'Point', coordinates: [0, 0]}, {radius: 20_000, rotation: 0}, resolution);
            const xs: number[] = [];
            for (const paint of paintTacticalGraphic(built!, {...context, resolution})) {
                const geometry = paint.geometry;
                if (geometry.type === 'LineString') xs.push(...geometry.coordinates.map(c => c[0]));
                if (geometry.type === 'MultiLineString') {
                    for (const line of geometry.coordinates) xs.push(...line.map(c => c[0]));
                }
            }
            return (Math.max(...xs) - Math.min(...xs)) / resolution;
        };

        // Quartering the resolution is zooming in two levels. A symbol with a ground size
        // quadruples on screen; a pinned one does not move at all.
        for (const name of [
            TacticalGraphicName.Interdict,
            TacticalGraphicName.Neutralize,
            TacticalGraphicName.Suppress,
            TacticalGraphicName.Airfield,
        ]) {
            expect(widthPx(name, 100) / widthPx(name, 400)).toBeCloseTo(4, 2);
        }
        // Destroy is the last fixed-size crossed task, and the security operations are
        // badges. Both are here so that unpinning the others cannot quietly take them too.
        for (const name of [TacticalGraphicName.Destroy, TacticalGraphicName.Cover]) {
            expect(widthPx(name, 100) / widthPx(name, 400)).toBeCloseTo(1, 2);
        }
    });

    /**
     * The invariant `NativeLayerRenderer`'s fill-layer order rests on.
     *
     * A patterned fill and a solid one cannot share a MapLibre layer — an unknown
     * `fill-pattern` makes the feature draw as nothing, ignoring `fill-color` beside
     * it — so they are two layers, and **paint order does not survive between them.**
     * Within a layer the source's feature order decides; across the two it is the
     * order the layers were added, once, for every graphic on the map.
     *
     * The renderer adds the pattern layer first, so hatches sit under solid fills.
     * That is correct only while a hatch is always an area's own background wash and
     * a solid fill is always foreground — an arrowhead, a tooth, a glyph. It holds
     * for all 247 paintable graphics today, and it is exactly the kind of assumption
     * that a new graphic breaks silently: on OpenLayers it would look right, because
     * OpenLayers draws the paint list in order and has no such constraint.
     *
     * That asymmetry is the reason this is asserted rather than commented. The bug it
     * came from was the reverse order erasing the CBRN triangle's opaque fill — the
     * z-order fix worked on one engine and was inverted on the other.
     */
    it('never emits a hatched fill after a solid one, which the fill-layer order assumes', () => {
        const offenders: string[] = [];

        for (const name of PAINTABLE_GRAPHICS) {
            const candidates = [
                {type: 'Polygon' as const, coordinates: [[[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]]]},
                {type: 'LineString' as const, coordinates: [[-2, 0], [2, 0]]},
                {type: 'Point' as const, coordinates: [0, 0]},
            ];
            const built = candidates
                .map(geometry => buildTacticalGraphic(name, geometry, {radius: 180_000, rotation: 0}))
                .find(Boolean);
            if (!built) continue;

            const fills = paintTacticalGraphic(built, context).filter(paint => paint.fill);
            let sawSolid = false;
            for (const paint of fills) {
                if (paint.fill?.pattern) {
                    if (sawSolid) offenders.push(name);
                } else {
                    sawSolid = true;
                }
            }
        }

        expect(offenders).toEqual([]);
    });

    /**
     * The whole-catalog version of the exemption rule.
     *
     * `hostilityExemptions.test.ts` pins `lineColorOf`, which is where the rule is
     * enforced — but a paint function is free to resolve a color some other way,
     * and three of them legitimately do. This runs every graphic through the real
     * generator with a hostile bag and looks at the marks that come out, so a new
     * paint function that reaches for `getColorByHostility` directly is caught.
     *
     * The line of contact is the one graphic excluded, and it is excluded *because*
     * it draws a red wave: it renders both standard identities at once, by design.
     */
    it('never paints an exempt graphic in the hostile color', () => {
        const hostileRed = getColorByHostility(TacticalGraphicHostility.hostileFaker);
        const offenders: string[] = [];

        for (const name of PAINTABLE_GRAPHICS) {
            if (supportsHostility(name) || name === TacticalGraphicName.LineOfContact) continue;

            const candidates = [
                {type: 'LineString' as const, coordinates: [[-2, 0], [2, 0]]},
                {type: 'Polygon' as const, coordinates: [[[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]]]},
                {type: 'Point' as const, coordinates: [0, 0]},
            ];
            const built = candidates
                .map(geometry => buildTacticalGraphic(name, geometry, {
                    radius: 180_000,
                    rotation: 0,
                    hostility: TacticalGraphicHostility.hostileFaker,
                }))
                .find(Boolean);
            if (!built) continue;

            const red = paintTacticalGraphic(built, context).some(paint =>
                paint.stroke?.color === hostileRed
                || paint.fill?.color === hostileRed
                || paint.circle?.fill?.color === hostileRed);
            if (red) offenders.push(name);
        }

        expect(offenders).toEqual([]);
    });

    /**
     * The contract is **never throw**, not "return undefined for input X".
     *
     * An earlier version of this test asserted that a one-point LineString comes back
     * `undefined`; it does not — the generators are more tolerant than expected and
     * happily build from a degenerate base. That is the generators' business. What
     * this adapter owes its caller is that a half-finished draw cannot crash the
     * render loop, so that is what is asserted.
     */
    it.each([
        ['a one-point LineString', {type: 'LineString' as const, coordinates: [[0, 0]]}],
        ['an empty LineString', {type: 'LineString' as const, coordinates: []}],
        ['an empty Polygon', {type: 'Polygon' as const, coordinates: []}],
    ])('does not throw on %s', (_label, geometry) => {
        expect(() => buildTacticalGraphic(TacticalGraphicName.PhaseLine, geometry)).not.toThrow();
    });
});

/**
 * The APP-06 constructions, through MapLibre's own build-and-paint path.
 *
 * The two renderers share the paint layer, so a geometry assertion in
 * `core/app6Conformance.test.ts` already covers what both of them draw. What is
 * *not* shared is this adapter — the decoration size it supplies, and whether it
 * hands the painter a feature the painter recognises. That is the half that broke
 * when abatis stopped being point-anchored, so it is the half tested here.
 *
 * MapLibre cannot be checked in a browser from this harness: its render loop is
 * driven by `requestAnimationFrame`, which a hidden automation tab never fires, so
 * the map's style never loads. @see ai/app-6.md, "Verifying MapLibre"
 */
describe('APP-06 constructions through the MapLibre adapter', () => {
    // At RESOLUTION the tooth is 26 km of ground, so both fixtures are drawn well
    // clear of it: a route shorter than twice the tooth is clamped on purpose, and
    // comparing a clamped tooth against an unclamped one proves nothing.
    const ABATIS_ROUTE = {
        type: 'LineString' as const,
        coordinates: [[-3.0, 51.0], [-1.5, 51.3], [0.5, 51.0], [2.0, 51.4]],
    };
    const ABATIS_SHORT = {type: 'LineString' as const, coordinates: [[-1.2, 51.0], [-0.2, 51.0]]};

    /** Distance in projected meters between two points of the painted line work. */
    const span = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

    const abatisPath = (geometry: typeof ABATIS_ROUTE) => {
        const built = buildTacticalGraphic(TacticalGraphicName.Abatis, geometry, {}, RESOLUTION);
        expect(built).toBeDefined();
        const g = built!.graphic.geometry;
        expect(g.type).toBe('MultiLineString');
        return (g as {coordinates: number[][][]}).coordinates[0];
    };

    it('builds abatis from a drawn route and paints it', () => {
        const built = buildTacticalGraphic(TacticalGraphicName.Abatis, ABATIS_ROUTE, {}, RESOLUTION);
        expect(built).toBeDefined();
        expect(paintTacticalGraphic(built!, context).length).toBeGreaterThan(0);
    });

    it('sizes the tooth from the zoom, not from the length of the obstacle', () => {
        const long = abatisPath(ABATIS_ROUTE);
        const short = abatisPath(ABATIS_SHORT);

        // Points 0 and 2 are the tooth's feet, whatever the route does after them.
        const longTooth = span(long[0], long[2]);
        const shortTooth = span(short[0], short[2]);

        expect(longTooth).toBeGreaterThan(0);
        // Compared as a ratio, not an absolute: the tooth is a fixed *geodesic* size and
        // these are *projected* meters, so Mercator stretches it slightly differently at
        // each fixture's latitude. 2% is far tighter than the 5x a length-driven tooth
        // would show, and loose enough not to pin the projection's arithmetic.
        expect(Math.abs(shortTooth - longTooth) / longTooth).toBeLessThan(0.02);
        // ...and the two routes are genuinely different lengths.
        expect(span(long[0], long[long.length - 1])).toBeGreaterThan(span(short[0], short[short.length - 1]) * 3);
    });

    it('keeps the route’s own vertices, so the obstacle can follow a road', () => {
        expect(abatisPath(ABATIS_ROUTE).length).toBeGreaterThan(3);
    });

    it('offers a handle per end plus the chevron apex', () => {
        const built = buildTacticalGraphic(TacticalGraphicName.Abatis, ABATIS_ROUTE, {}, RESOLUTION);
        expect(built!.handles).toHaveLength(3);
    });
    const READINESS = [
        TacticalGraphicName.ExplosivesPlannedStateOfReadiness,
        TacticalGraphicName.ExplosivesStateOfReadiness1Safe,
        TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable,
    ];
    const ACROSS_ROAD = {type: 'LineString' as const, coordinates: [[-0.4, 51.4], [-0.1, 51.6]]};

    it.each(READINESS)('%s builds two rails from a drawn centerline', name => {
        const built = buildTacticalGraphic(name, ACROSS_ROAD, {width: 4000}, RESOLUTION);
        expect(built).toBeDefined();
        const g = built!.graphic.geometry as {type: string; coordinates: number[][][]};
        expect(g.type).toBe('MultiLineString');
        expect(g.coordinates).toHaveLength(2);
        expect(paintTacticalGraphic(built!, context).length).toBe(2);
    });

    it.each(READINESS)('%s widens with the width property', name => {
        const gapAt = (width: number) => {
            const g = buildTacticalGraphic(name, ACROSS_ROAD, {width}, RESOLUTION)!.graphic.geometry as {
                coordinates: number[][][];
            };
            return span(g.coordinates[0][0], g.coordinates[1][0]);
        };
        expect(gapAt(12000)).toBeGreaterThan(gapAt(4000) * 2);
    });

    it.each(READINESS)('%s offers start, end and a width handle', name => {
        expect(buildTacticalGraphic(name, ACROSS_ROAD, {width: 4000}, RESOLUTION)!.handles).toHaveLength(3);
    });

    // Envelopment moved from a dropped center to APP-06's three drawn anchor points:
    // "point 1 defines the beginning of the straight line, point 2 the end, point 3
    // the diameter". The renderer-independent half of that is the generator, so this
    // is the second engine agreeing that the same drawn points give the same symbol —
    // the class of defect a MapLibre parity pass keeps finding is a symbology fact
    // that only OpenLayers knows.
    describe('envelopment from drawn anchor points', () => {
        /**
         * APP-06 343500's four points, laid out west to east along 51.5 degrees north:
         * the run's two ends, then the semicircle's far foot two radii past the end,
         * then a point on the flank it bulges to.
         */
        const drawn = (halfRunDeg: number, radiusDeg: number) => ({
            type: 'LineString' as const,
            coordinates: [
                [-halfRunDeg, 51.5],
                [halfRunDeg, 51.5],
                [halfRunDeg + 2 * radiusDeg, 51.5],
                [halfRunDeg + radiusDeg, 51.5 + radiusDeg],
            ],
        });

        it('builds and paints from three drawn points', () => {
            const built = buildTacticalGraphic(TacticalGraphicName.Envelopment, drawn(0.6, 0.3), {}, RESOLUTION);
            expect(built).toBeDefined();
            expect(paintTacticalGraphic(built!, context).length).toBeGreaterThan(0);
        });

        it('offers a handle per drawn point', () => {
            const built = buildTacticalGraphic(TacticalGraphicName.Envelopment, drawn(0.6, 0.3), {}, RESOLUTION);
            expect(built!.handles.length).toBeGreaterThanOrEqual(3);
        });

        /** How far the arc reaches off the straight run, in projected meters. */
        const arcReach = (halfRunDeg: number, reachDeg: number) => {
            const built = buildTacticalGraphic(TacticalGraphicName.Envelopment, drawn(halfRunDeg, reachDeg), {}, RESOLUTION);
            const parts = (built!.graphic.geometry as {coordinates: number[][][]}).coordinates;
            const run = parts[0];
            const mid = [(run[0][0] + run[1][0]) / 2, (run[0][1] + run[1][1]) / 2];
            return Math.max(...parts[1].map(p => span(mid, p)));
        };

        /** The straight run's length, in projected meters. */
        const runLength = (halfRunDeg: number, reachDeg: number) => {
            const built = buildTacticalGraphic(TacticalGraphicName.Envelopment, drawn(halfRunDeg, reachDeg), {}, RESOLUTION);
            const run = (built!.graphic.geometry as {coordinates: number[][][]}).coordinates[0];
            return span(run[0], run[1]);
        };

        it('takes the run from points 1 and 2, unaffected by where point 3 went', () => {
            expect(runLength(0.6, 0.6)).toBeCloseTo(runLength(0.6, 0.15), 0);
        });

        it('takes the arc from point 3, which is the freedom the conversion bought', () => {
            // The old model could not express this: `bend` was the only shape input and
            // the run came from `size`, so the two could never be set independently.
            expect(arcReach(0.6, 0.6)).toBeGreaterThan(arcReach(0.6, 0.15));
        });
    });

    // Pursue's three points, APP-06 344000. Unlike Envelop the diameter runs *across*
    // the straight line, so this is a different reader and worth its own coverage on
    // the second engine rather than assuming the family carries.
    describe('pursuit from drawn anchor points', () => {
        /** Line running west to east, hook hanging `radiusDeg` off its end. */
        const drawn = (runDeg: number, radiusDeg: number, side = 1) => ({
            type: 'LineString' as const,
            coordinates: [
                [-runDeg, 51.5 + side * radiusDeg],
                [0, 51.5 + side * radiusDeg],
                [0, 51.5 - side * radiusDeg],
            ],
        });

        const parts = (runDeg: number, radiusDeg: number, side = 1) => {
            const built = buildTacticalGraphic(TacticalGraphicName.Pursuit, drawn(runDeg, radiusDeg, side), {}, RESOLUTION);
            expect(built).toBeDefined();
            return (built!.graphic.geometry as {coordinates: number[][][]}).coordinates;
        };

        it('builds and paints line, arc, arrowhead and crossbar', () => {
            const built = buildTacticalGraphic(TacticalGraphicName.Pursuit, drawn(0.9, 0.25), {}, RESOLUTION);
            expect(parts(0.9, 0.25)).toHaveLength(4);
            expect(paintTacticalGraphic(built!, context).length).toBeGreaterThan(0);
        });

        it('sizes the line and the hook independently', () => {
            const lineOf = (r: number, rad: number) => span(parts(r, rad)[0][0], parts(r, rad)[0][1]);
            const hookOf = (r: number, rad: number) => {
                const arc = parts(r, rad)[1];
                return span(arc[0], arc[arc.length - 1]);
            };
            // Same hook, longer line.
            expect(lineOf(1.8, 0.25)).toBeGreaterThan(lineOf(0.9, 0.25) * 1.9);
            expect(hookOf(1.8, 0.25)).toBeCloseTo(hookOf(0.9, 0.25), 0);
            // Same line, bigger hook — the proportion the dropped form fixed at 2.4.
            expect(hookOf(0.9, 0.5)).toBeGreaterThan(hookOf(0.9, 0.25) * 1.9);
        });

        it('hangs the hook on the side point 3 was drawn', () => {
            // The arc's apex is forward of the line either way; what flips is which side
            // of the line the whole construction sits on.
            const apexOf = (side: number): number[] => {
                const arc = parts(0.9, 0.25, side)[1];
                return arc[Math.floor(arc.length / 2)];
            };
            const lineY = (side: number) => parts(0.9, 0.25, side)[0][0][1];
            expect(Math.sign(apexOf(1)[1] - lineY(1))).toBe(-Math.sign(apexOf(-1)[1] - lineY(-1)));
        });

        it('curls forward, away from point 1, on either side', () => {
            // With only three points there is nothing left to state which way the arc
            // goes round, so it is a convention: away from where the pursuit came from.
            // Measured across the line rather than along it, the previous assertion
            // cannot see this at all — both sweeps put the apex at the same latitude.
            for (const side of [1, -1]) {
                const [line, arc] = parts(0.9, 0.25, side);
                const join = line[1];
                const apex = arc[Math.floor(arc.length / 2)];
                expect(apex[0]).toBeGreaterThan(join[0]);
            }
        });

        it('offers the arrowhead tip and the line start as handles', () => {
            expect(buildTacticalGraphic(TacticalGraphicName.Pursuit, drawn(0.9, 0.25), {}, RESOLUTION)!.handles)
                .toHaveLength(2);
        });
    });

    /**
     * Every symbol moved onto drawn anchor points, built and painted through the second
     * engine from the points the library itself writes.
     *
     * The point of going through `anchorsFor*` rather than hand-laying coordinates is
     * that it is the *library's* answer being fed to the *renderer's* build path — which
     * is exactly the seam every MapLibre parity defect so far has hidden in: a symbology
     * fact that only the OpenLayers holder knew.
     */
    describe('the converted symbols build and paint on this engine', () => {
        const CENTER = [-0.1, 51.5];
        const CONVERTED: [TacticalGraphicName, number[][]][] = [
            [TacticalGraphicName.Envelopment, anchorsForRunAndArc(CENTER, 40_000, 15_000, 25, 1)],
            [TacticalGraphicName.Pursuit, anchorsForHook(CENTER, 20_000, 25, 1)],
            [TacticalGraphicName.Turn, anchorsForBow(CENTER, 30_000, 25, 0.5)],
            [TacticalGraphicName.TacticalTurn, anchorsForBow(CENTER, 30_000, 25, -0.5)],
            [TacticalGraphicName.Contain, anchorsFromFrame(CENTER, 25_000, 25 - 90)],
            [TacticalGraphicName.Ambush, anchorsForArcAndArrow(CENTER, 25_000, 25, 2)],
        ];

        it.each(CONVERTED)('%s', (name, coordinates) => {
            const built = buildTacticalGraphic(name, {type: 'LineString', coordinates}, {}, RESOLUTION);
            expect(built).toBeDefined();
            expect(built!.graphic.geometry).toBeDefined();
            expect(paintTacticalGraphic(built!, context).length).toBeGreaterThan(0);
            expect(built!.handles.length).toBeGreaterThan(0);
        });

        it('declares each of them as taking a drawn base', () => {
            for (const [name] of CONVERTED) {
                expect(usesDrawnAnchors(name)).toBe(true);
                expect(baseGeometryFor(name)).toBe('LineString');
            }
        });
    });

    /**
     * The two contact symbols on the second engine. They are separate graphics — FM's
     * badge and APP-06 342900's route — and the failure mode if they ever merge again is
     * silent, since both are hollow arrows with lightning bolts.
     */
    describe('movement to contact and advance to contact both paint here', () => {
        it('paints the FM badge from a dropped point', () => {
            const built = buildTacticalGraphic(
                TacticalGraphicName.MovementToContact,
                {type: 'Point', coordinates: [-0.3, 51.55]},
                {radius: 40_000, rotation: 0},
                RESOLUTION,
            );
            expect(built).toBeDefined();
            expect(paintTacticalGraphic(built!, context).length).toBeGreaterThan(0);
            // Two body halves plus a line and a head for each of the two bolts.
            expect((built!.graphic.geometry as {coordinates: number[][][]}).coordinates).toHaveLength(6);
        });

        it('paints the APP-06 route from a drawn line, with a bolt on each flank', () => {
            const built = buildTacticalGraphic(
                TacticalGraphicName.AdvanceToContact,
                {type: 'LineString', coordinates: [[-0.42, 51.55], [-0.1, 51.55]]},
                {width: 8000},
                RESOLUTION,
            );
            expect(built).toBeDefined();
            expect(paintTacticalGraphic(built!, context).length).toBeGreaterThan(0);
            // Body, head, body, then a line and a head for each of the two bolts.
            expect((built!.graphic.geometry as {coordinates: number[][][]}).coordinates).toHaveLength(7);
        });

        it('keeps them on opposite base geometries', () => {
            expect(baseGeometryFor(TacticalGraphicName.MovementToContact)).toBe('Point');
            expect(baseGeometryFor(TacticalGraphicName.AdvanceToContact)).toBe('LineString');
        });
    });
});
